#!/usr/bin/env node
/* eslint-disable no-console */
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { WebSocket } = require("ws");

const RELAY_PATH = path.resolve(__dirname, "sync-relay-server.js");
const RELAY_HOST = "127.0.0.1";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, RELAY_HOST, () => {
      const address = server.address();
      const port = address && typeof address === "object" ? Number(address.port) : 0;
      server.close((closeErr) => {
        if (closeErr) {
          reject(closeErr);
          return;
        }
        if (!port || !Number.isFinite(port)) {
          reject(new Error("free-port-not-found"));
          return;
        }
        resolve(port);
      });
    });
    server.on("error", reject);
  });
}

function waitForRelayReady(port, timeoutMs = 5000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function probe() {
      const req = http.get(
        {
          hostname: RELAY_HOST,
          port,
          path: "/health",
          timeout: 800,
        },
        (res) => {
          const ok = res.statusCode === 200;
          res.resume();
          if (ok) {
            resolve();
            return;
          }
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error(`relay-health-timeout-${res.statusCode}`));
            return;
          }
          setTimeout(probe, 100);
        },
      );
      req.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("relay-health-timeout"));
          return;
        }
        setTimeout(probe, 100);
      });
      req.on("timeout", () => {
        req.destroy();
      });
    }
    probe();
  });
}

async function startRelayProcess(port, envOverrides = {}) {
  const env = {
    ...process.env,
    POSECHRONO_SYNC_RELAY_HOST: RELAY_HOST,
    POSECHRONO_SYNC_RELAY_PORT: String(port),
    POSECHRONO_SYNC_MAX_PARTICIPANTS: "2",
    POSECHRONO_SYNC_RATE_WINDOW_MS: "60000",
    POSECHRONO_SYNC_RATE_MAX_MESSAGES: "30",
    POSECHRONO_SYNC_STATE_RATE_WINDOW_MS: "60000",
    POSECHRONO_SYNC_STATE_RATE_MAX_MESSAGES: "8",
    POSECHRONO_SYNC_MAX_PAYLOAD: String(1024 * 512),
    POSECHRONO_SYNC_MAX_STATE_BYTES: String(120000),
    POSECHRONO_SYNC_MAX_SESSION_PACK_BYTES: String(100000),
    POSECHRONO_SYNC_MAX_SESSION_MEDIA_FILE_BYTES: String(40000),
    POSECHRONO_SYNC_MAX_SESSION_MEDIA_TOTAL_BYTES: String(120000),
    ...envOverrides,
  };

  const child = spawn(process.execPath, [RELAY_PATH, "--host", RELAY_HOST, "--port", String(port)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) console.log(`[relay] ${text}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = String(chunk || "").trim();
    if (text) console.warn(`[relay:err] ${text}`);
  });

  await waitForRelayReady(port);
  return child;
}

function stopRelayProcess(child, timeoutMs = 2500) {
  return new Promise((resolve) => {
    if (!child || child.killed) {
      resolve();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {}
      finish();
    }, timeoutMs);
    if (typeof timer.unref === "function") timer.unref();

    child.once("exit", () => {
      clearTimeout(timer);
      finish();
    });

    try {
      child.kill("SIGTERM");
    } catch (_) {
      clearTimeout(timer);
      finish();
    }
  });
}

function createRelayClient(url, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let nextRequestId = 1;
    const pending = new Map();

    function clearPending(id) {
      const entry = pending.get(id);
      if (!entry) return null;
      pending.delete(id);
      clearTimeout(entry.timerId);
      return entry;
    }

    ws.on("open", () => {
      resolve({
        label,
        async request(action, payload = {}, timeoutMs = 2500) {
          const id = String(nextRequestId++);
          const message = {
            type: "request",
            id,
            action,
            payload,
          };
          return new Promise((resolveReq, rejectReq) => {
            const timerId = setTimeout(() => {
              clearPending(id);
              rejectReq(new Error("request-timeout"));
            }, timeoutMs);
            pending.set(id, { resolveReq, rejectReq, timerId });
            ws.send(JSON.stringify(message));
          });
        },
        async close() {
          return new Promise((resolveClose) => {
            if (ws.readyState === WebSocket.CLOSED) {
              resolveClose();
              return;
            }
            ws.once("close", () => resolveClose());
            try {
              ws.close(1000, "client-close");
            } catch (_) {
              resolveClose();
            }
          });
        },
      });
    });

    ws.on("message", (raw) => {
      let payload = null;
      try {
        payload = JSON.parse(String(raw || ""));
      } catch (_) {
        return;
      }
      if (!payload || payload.type !== "response") return;
      const id = String(payload.id || "");
      const entry = clearPending(id);
      if (!entry) return;
      if (payload.ok === false) {
        entry.rejectReq(new Error(String(payload.error || "request-failed")));
        return;
      }
      entry.resolveReq(payload.result);
    });

    ws.on("error", (error) => {
      reject(error);
    });

    ws.on("close", () => {
      pending.forEach((entry) => {
        clearTimeout(entry.timerId);
        entry.rejectReq(new Error("ws-closed"));
      });
      pending.clear();
    });
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectError(fn, expectedCode, stepLabel) {
  try {
    await fn();
  } catch (error) {
    const code = String(error && error.message ? error.message : error);
    if (code !== expectedCode) {
      throw new Error(`${stepLabel}: expected ${expectedCode}, got ${code}`);
    }
    console.log(`[verify:sync-security] PASS ${stepLabel} (${code})`);
    return;
  }
  throw new Error(`${stepLabel}: expected error ${expectedCode}, got success`);
}

async function main() {
  const port = await findFreePort();
  const relayUrl = `ws://${RELAY_HOST}:${port}`;
  let relayProcess = null;
  const clients = [];

  try {
    console.log(`[verify:sync-security] starting relay on ${relayUrl}`);
    relayProcess = await startRelayProcess(port);
    await sleep(80);

    const host = await createRelayClient(relayUrl, "host");
    const guest = await createRelayClient(relayUrl, "guest");
    const outsider = await createRelayClient(relayUrl, "outsider");
    const spammer = await createRelayClient(relayUrl, "spammer");
    const duplicate = await createRelayClient(relayUrl, "duplicate");
    const overflow = await createRelayClient(relayUrl, "overflow");
    clients.push(host, guest, outsider, spammer, duplicate, overflow);

    const sessionCode = "ABCD-EFGH";
    const invalidHostSessionCode = "WXYZ-ABCD";

    await expectError(
      () =>
        host.request("createRoom", {
          sessionCode: invalidHostSessionCode,
          hostClientId: "host bad id",
          hostDisplayName: "Host",
          sessionName: "Security Test",
          password: "secret",
        }),
      "invalid-host-client-id",
      "invalid host clientId rejected",
    );

    const room = await host.request("createRoom", {
      sessionCode,
      hostClientId: "host-1",
      hostDisplayName: "Host",
      sessionName: "Security Test",
      password: "secret",
    });
    expect(room && room.sessionCode === sessionCode, "createRoom failed");
    console.log("[verify:sync-security] PASS createRoom");

    await expectError(
      () =>
        outsider.request("joinRoom", {
          sessionCode,
          clientId: "bad id",
          participantName: "Bad",
          password: "secret",
        }),
      "invalid-client-id",
      "invalid clientId rejected",
    );

    await expectError(
      () =>
        outsider.request("joinRoom", {
          sessionCode: "BAD-CODE",
          clientId: "x1",
          password: "secret",
        }),
      "invalid-session-code",
      "invalid session code rejected",
    );

    await guest.request("joinRoom", {
      sessionCode,
      clientId: "guest-1",
      participantName: "Guest",
      password: "secret",
    });
    console.log("[verify:sync-security] PASS joinRoom");

    await expectError(
      () =>
        guest.request("getSessionPack", {
          sessionCode,
          sourceClientId: "guest-1",
        }),
      "session-pack-not-found",
      "missing session pack rejected",
    );

    const validPack = {
      schema: "posechrono-session-pack",
      version: 1,
      createdAt: new Date().toISOString(),
      source: {
        runtime: "desktop",
        language: "en",
      },
      session: {
        mode: "classique",
        selectedDuration: 60,
        timeRemaining: 60,
        memoryType: "flash",
        memoryDuration: 0,
        memoryPosesCount: 1,
        memoryDrawingTime: 0,
        memoryNoPressure: false,
        customQueue: [],
        mediaOrderKeys: ["k:abc123"],
        imagesCount: 1,
      },
      mediaRefs: [
        {
          identity: "k:abc123",
          index: 0,
          name: "img-1.jpg",
          ext: "jpg",
        },
      ],
    };
    const tinyPngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5XcAAAAASUVORK5CYII=";
    const tinyPngSize = Buffer.from(tinyPngBase64, "base64").length;
    const tinyPngSha = crypto
      .createHash("sha256")
      .update(Buffer.from(tinyPngBase64, "base64"))
      .digest("hex");

    const packSnapshot = await host.request("uploadSessionPack", {
      sessionCode,
      sourceClientId: "host-1",
      pack: validPack,
    });
    expect(
      packSnapshot &&
        packSnapshot.sessionPackMeta &&
        String(packSnapshot.sessionPackMeta.hash || "").trim().length > 0,
      "uploadSessionPack failed",
    );
    console.log("[verify:sync-security] PASS uploadSessionPack");

    const fetchedPack = await guest.request("getSessionPack", {
      sessionCode,
      sourceClientId: "guest-1",
    });
    expect(
      fetchedPack &&
        fetchedPack.pack &&
        fetchedPack.pack.schema === "posechrono-session-pack",
      "getSessionPack failed",
    );
    console.log("[verify:sync-security] PASS getSessionPack");

    await expectError(
      () =>
        guest.request("uploadSessionPack", {
          sessionCode,
          sourceClientId: "guest-1",
          pack: validPack,
        }),
      "forbidden-not-host",
      "participant pack upload blocked",
    );

    await expectError(
      () =>
        host.request("uploadSessionPack", {
          sessionCode,
          sourceClientId: "host-1",
          pack: { schema: "bad-pack", version: 1, session: {} },
        }),
      "invalid-session-pack",
      "invalid session pack rejected",
    );

    await expectError(
      () =>
        guest.request("getSessionMediaManifest", {
          sessionCode,
          sourceClientId: "guest-1",
        }),
      "session-media-not-found",
      "missing session media rejected",
    );

    await host.request("resetSessionMediaPack", {
      sessionCode,
      sourceClientId: "host-1",
    });
    await host.request("uploadSessionMediaFile", {
      sessionCode,
      sourceClientId: "host-1",
      file: {
        identity: "k:abc123",
        name: "tiny.png",
        ext: "png",
        mime: "image/png",
        size: tinyPngSize,
        sha256: tinyPngSha,
        dataBase64: tinyPngBase64,
      },
    });
    const mediaManifest = await guest.request("getSessionMediaManifest", {
      sessionCode,
      sourceClientId: "guest-1",
    });
    expect(
      mediaManifest &&
        Array.isArray(mediaManifest.files) &&
        mediaManifest.files.length === 1,
      "getSessionMediaManifest failed",
    );
    const mediaFile = await guest.request("getSessionMediaFile", {
      sessionCode,
      sourceClientId: "guest-1",
      identity: "k:abc123",
    });
    expect(
      mediaFile &&
        mediaFile.file &&
        String(mediaFile.file.dataBase64 || "").length > 0,
      "getSessionMediaFile failed",
    );
    console.log("[verify:sync-security] PASS upload/get session media");

    await expectError(
      () =>
        guest.request("uploadSessionMediaFile", {
          sessionCode,
          sourceClientId: "guest-1",
          file: {
            identity: "k:guest",
            name: "tiny.png",
            ext: "png",
            mime: "image/png",
            size: tinyPngSize,
            dataBase64: tinyPngBase64,
          },
        }),
      "forbidden-not-host",
      "participant media upload blocked",
    );

    await expectError(
      () =>
        host.request("uploadSessionMediaFile", {
          sessionCode,
          sourceClientId: "host-1",
          file: {
            identity: "k:badtype",
            name: "bad.svg",
            ext: "svg",
            mime: "image/svg+xml",
            size: tinyPngSize,
            dataBase64: tinyPngBase64,
          },
        }),
      "session-media-unsupported-type",
      "unsupported media extension rejected",
    );

    await expectError(
      () =>
        host.request("uploadSessionMediaFile", {
          sessionCode,
          sourceClientId: "host-1",
          file: {
            identity: "k:toolarge",
            name: "large.png",
            ext: "png",
            mime: "image/png",
            size: 50000,
            dataBase64: Buffer.alloc(50000, 0).toString("base64"),
          },
        }),
      "session-media-too-large",
      "session media size limit enforced",
    );

    await expectError(
      () =>
        host.request("uploadSessionPack", {
          sessionCode,
          sourceClientId: "host-1",
          pack: {
            ...validPack,
            mediaRefs: [
              {
                identity: "k:abc123",
                index: 0,
                name: "x".repeat(150000),
                ext: "jpg",
              },
            ],
          },
        }),
      "session-pack-too-large",
      "session pack size limit enforced",
    );

    await expectError(
      () =>
        duplicate.request("joinRoom", {
          sessionCode,
          clientId: "guest-1",
          participantName: "Duplicate",
          password: "secret",
        }),
      "duplicate-client-id",
      "duplicate clientId rejected",
    );

    await expectError(
      () =>
        overflow.request("joinRoom", {
          sessionCode,
          clientId: "guest-2",
          participantName: "Overflow",
          password: "secret",
        }),
      "room-full",
      "room full rejected",
    );

    await expectError(
      () =>
        guest.request("updateSessionState", {
          sessionCode,
          sourceClientId: "host-1",
          payload: { foo: "bar" },
        }),
      "forbidden-not-host",
      "host spoof blocked",
    );

    await expectError(
      () =>
        host.request("updateSessionState", {
          sessionCode,
          payload: {
            mediaOrderKeys: ["bad key with spaces"],
          },
        }),
      "invalid-session-state",
      "invalid media order rejected",
    );

    await expectError(
      () =>
        host.request("updateSessionState", {
          sessionCode,
          payload: {
            reason: "x".repeat(130000),
          },
        }),
      "session-state-too-large",
      "state payload size limit enforced",
    );

    await expectError(
      () =>
        outsider.request("updateRoom", {
          sessionCode,
          sourceClientId: "host-1",
          patch: { sessionName: "Hacked" },
        }),
      "not-joined",
      "not joined update blocked",
    );

    for (let index = 0; index < 6; index += 1) {
      await host.request("updateSessionState", {
        sessionCode,
        payload: {
          isPlaying: index % 2 === 0,
          tick: index,
        },
      });
    }
    await expectError(
      () =>
        host.request("updateSessionState", {
          sessionCode,
          payload: { isPlaying: true, tick: 999 },
        }),
      "state-rate-limited",
      "state rate-limit enforced",
    );

    // getRoomSnapshot now requires membership — test outsider is blocked
    await expectError(
      () =>
        outsider.request("getRoomSnapshot", { sessionCode }),
      "not-joined",
      "outsider getRoomSnapshot blocked",
    );

    // Global rate-limit: use createRoom with unique codes (succeeds but counts)
    for (let index = 0; index < 30; index += 1) {
      try {
        await spammer.request("createRoom", {
          sessionCode: `SP${String(index).padStart(2, "0")}-TEST`,
          hostClientId: `spm-${index}`,
          hostDisplayName: "Spammer",
          sessionName: "Rate Test",
          password: "",
        });
      } catch (_) {}
    }
    await expectError(
      () => spammer.request("createRoom", {
        sessionCode: "SPXX-TEST",
        hostClientId: "spm-xx",
        hostDisplayName: "Spammer",
        sessionName: "Rate Test",
        password: "",
      }),
      "rate-limited",
      "global rate-limit enforced",
    );

    // ---------------------------------------------------------------------
    // RTC signaling hardening checks
    // ---------------------------------------------------------------------
    await expectError(
      () =>
        host.request("sendRtcSignal", {
          sessionCode,
          sourceClientId: "host-1",
          targetClientId: "guest-1",
          signalType: "offer",
          signalPayload: { type: "offer" },
        }),
      "invalid-rtc-signal",
      "invalid rtc signal payload rejected",
    );

    for (const client of clients) {
      try {
        await client.close();
      } catch (_) {}
    }
    clients.length = 0;
    await stopRelayProcess(relayProcess);
    relayProcess = null;

    const rtcLimitPort = await findFreePort();
    const rtcLimitRelayUrl = `ws://${RELAY_HOST}:${rtcLimitPort}`;
    relayProcess = await startRelayProcess(rtcLimitPort, {
      POSECHRONO_SYNC_RTC_RATE_WINDOW_MS: "60000",
      POSECHRONO_SYNC_RTC_RATE_MAX_MESSAGES: "10",
    });
    await sleep(80);

    const rtcHost = await createRelayClient(rtcLimitRelayUrl, "rtc-host");
    const rtcGuest = await createRelayClient(rtcLimitRelayUrl, "rtc-guest");
    clients.push(rtcHost, rtcGuest);

    const rtcCode = "RTCL-TEST";
    await rtcHost.request("createRoom", {
      sessionCode: rtcCode,
      hostClientId: "rtc-host-1",
      hostDisplayName: "RTC Host",
      sessionName: "RTC Rate",
      password: "",
    });
    await rtcGuest.request("joinRoom", {
      sessionCode: rtcCode,
      clientId: "rtc-guest-1",
      participantName: "RTC Guest",
      password: "",
    });

    for (let index = 0; index < 10; index += 1) {
      await rtcGuest.request("sendRtcSignal", {
        sessionCode: rtcCode,
        sourceClientId: "rtc-guest-1",
        targetClientId: "rtc-host-1",
        signalType: "peer-reset",
        signalPayload: null,
      });
    }
    await expectError(
      () =>
        rtcGuest.request("sendRtcSignal", {
          sessionCode: rtcCode,
          sourceClientId: "rtc-guest-1",
          targetClientId: "rtc-host-1",
          signalType: "peer-reset",
          signalPayload: null,
        }),
      "rtc-rate-limited",
      "rtc signaling burst rate-limit enforced",
    );

    // ---------------------------------------------------------------------
    // Media transfer kill-switch
    // ---------------------------------------------------------------------
    for (const client of clients) {
      try {
        await client.close();
      } catch (_) {}
    }
    clients.length = 0;
    await stopRelayProcess(relayProcess);
    relayProcess = null;

    const mediaOffPort = await findFreePort();
    const mediaOffRelayUrl = `ws://${RELAY_HOST}:${mediaOffPort}`;
    relayProcess = await startRelayProcess(mediaOffPort, {
      POSECHRONO_SYNC_DISABLE_MEDIA_TRANSFER: "1",
    });
    await sleep(80);

    const mediaHost = await createRelayClient(mediaOffRelayUrl, "media-host");
    const mediaGuest = await createRelayClient(mediaOffRelayUrl, "media-guest");
    clients.push(mediaHost, mediaGuest);

    const mediaOffCode = "MDOF-TEST";
    await mediaHost.request("createRoom", {
      sessionCode: mediaOffCode,
      hostClientId: "media-host-1",
      hostDisplayName: "Media Host",
      sessionName: "Media Off",
      password: "",
    });
    await mediaGuest.request("joinRoom", {
      sessionCode: mediaOffCode,
      clientId: "media-guest-1",
      participantName: "Media Guest",
      password: "",
    });

    await expectError(
      () =>
        mediaHost.request("resetSessionMediaPack", {
          sessionCode: mediaOffCode,
          sourceClientId: "media-host-1",
        }),
      "media-transfer-disabled",
      "media transfer disabled blocks host reset",
    );

    await expectError(
      () =>
        mediaGuest.request("getSessionMediaManifest", {
          sessionCode: mediaOffCode,
          sourceClientId: "media-guest-1",
        }),
      "media-transfer-disabled",
      "media transfer disabled blocks participant download",
    );

    console.log("[verify:sync-security] OK (media kill-switch)");

    // ---------------------------------------------------------------------
    // Room limit enforcement
    // ---------------------------------------------------------------------
    for (const client of clients) {
      try { await client.close(); } catch (_) {}
    }
    clients.length = 0;
    await stopRelayProcess(relayProcess);
    relayProcess = null;

    const roomLimitPort = await findFreePort();
    const roomLimitRelayUrl = `ws://${RELAY_HOST}:${roomLimitPort}`;
    relayProcess = await startRelayProcess(roomLimitPort, {
      POSECHRONO_SYNC_MAX_ROOMS: "2",
    });
    await sleep(80);

    const rlHost = await createRelayClient(roomLimitRelayUrl, "rl-host");
    clients.push(rlHost);

    await rlHost.request("createRoom", {
      sessionCode: "RLM1-TEST",
      hostClientId: "rl-h1",
      hostDisplayName: "RLHost",
      sessionName: "RoomLimit1",
      password: "",
    });
    await rlHost.request("createRoom", {
      sessionCode: "RLM2-TEST",
      hostClientId: "rl-h2",
      hostDisplayName: "RLHost",
      sessionName: "RoomLimit2",
      password: "",
    });
    await expectError(
      () =>
        rlHost.request("createRoom", {
          sessionCode: "RLM3-TEST",
          hostClientId: "rl-h3",
          hostDisplayName: "RLHost",
          sessionName: "RoomLimit3",
          password: "",
        }),
      "server-room-limit",
      "room limit enforced",
    );
    console.log("[verify:sync-security] OK (room limit)");

    // ---------------------------------------------------------------------
    // Connection limit enforcement
    // ---------------------------------------------------------------------
    for (const client of clients) {
      try { await client.close(); } catch (_) {}
    }
    clients.length = 0;
    await stopRelayProcess(relayProcess);
    relayProcess = null;

    const connLimitPort = await findFreePort();
    const connLimitRelayUrl = `ws://${RELAY_HOST}:${connLimitPort}`;
    relayProcess = await startRelayProcess(connLimitPort, {
      POSECHRONO_SYNC_MAX_CONNECTIONS: "3",
    });
    await sleep(80);

    const connClients = [];
    for (let i = 0; i < 3; i++) {
      connClients.push(await createRelayClient(connLimitRelayUrl, `conn-${i}`));
    }
    clients.push(...connClients);

    // 4th connection should be rejected (close code 1013)
    const rejectedOk = await new Promise((resolve) => {
      const ws4 = new (require("ws"))(connLimitRelayUrl);
      ws4.on("close", (code) => {
        resolve(code === 1013);
      });
      ws4.on("error", () => resolve(false));
      setTimeout(() => {
        try { ws4.close(); } catch (_) {}
        resolve(false);
      }, 3000);
    });
    expect(rejectedOk, "connection limit: 4th connection should be rejected with code 1013");
    console.log("[verify:sync-security] PASS connection limit enforced");

    // ---------------------------------------------------------------------
    // Password hashing verification
    // ---------------------------------------------------------------------
    for (const client of clients) {
      try { await client.close(); } catch (_) {}
    }
    clients.length = 0;
    await stopRelayProcess(relayProcess);
    relayProcess = null;

    const pwPort = await findFreePort();
    const pwRelayUrl = `ws://${RELAY_HOST}:${pwPort}`;
    relayProcess = await startRelayProcess(pwPort);
    await sleep(80);

    const pwHost = await createRelayClient(pwRelayUrl, "pw-host");
    const pwGuest = await createRelayClient(pwRelayUrl, "pw-guest");
    const pwBadGuest = await createRelayClient(pwRelayUrl, "pw-bad-guest");
    clients.push(pwHost, pwGuest, pwBadGuest);

    await pwHost.request("createRoom", {
      sessionCode: "PWHS-TEST",
      hostClientId: "pw-h1",
      hostDisplayName: "PW Host",
      sessionName: "Password Test",
      password: "my-secret-123",
    });

    // Correct password should succeed
    await pwGuest.request("joinRoom", {
      sessionCode: "PWHS-TEST",
      clientId: "pw-g1",
      participantName: "PW Guest",
      password: "my-secret-123",
    });
    console.log("[verify:sync-security] PASS password hash: correct password accepted");

    // Wrong password should fail
    await expectError(
      () =>
        pwBadGuest.request("joinRoom", {
          sessionCode: "PWHS-TEST",
          clientId: "pw-g2",
          participantName: "Bad Guest",
          password: "wrong-password",
        }),
      "invalid-password",
      "password hash: wrong password rejected",
    );

    console.log("[verify:sync-security] OK");
  } catch (error) {
    console.error("[verify:sync-security] FAILED:", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    for (const client of clients) {
      try {
        await client.close();
      } catch (_) {}
    }
    await stopRelayProcess(relayProcess);
  }
}

main();
