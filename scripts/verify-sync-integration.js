#!/usr/bin/env node
/* eslint-disable no-console */
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { WebSocket } = require("ws");
const fs = require("fs");
const vm = require("vm");

const RELAY_PATH = path.resolve(__dirname, "sync-relay-server.js");
const RELAY_HOST = "127.0.0.1";
const LOG_PREFIX = "[verify:sync-integration]";

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
    POSECHRONO_SYNC_MAX_PARTICIPANTS: "4",
    POSECHRONO_SYNC_RATE_WINDOW_MS: "60000",
    POSECHRONO_SYNC_RATE_MAX_MESSAGES: "200",
    POSECHRONO_SYNC_STATE_RATE_WINDOW_MS: "60000",
    POSECHRONO_SYNC_STATE_RATE_MAX_MESSAGES: "50",
    POSECHRONO_SYNC_MAX_PAYLOAD: String(1024 * 512),
    POSECHRONO_SYNC_MAX_STATE_BYTES: String(120000),
    POSECHRONO_SYNC_MAX_SESSION_PACK_BYTES: String(100000),
    POSECHRONO_SYNC_MAX_SESSION_MEDIA_FILE_BYTES: String(40000),
    POSECHRONO_SYNC_MAX_SESSION_MEDIA_TOTAL_BYTES: String(120000),
    ...envOverrides,
  };

  const child = spawn(
    process.execPath,
    [RELAY_PATH, "--host", RELAY_HOST, "--port", String(port)],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

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
    const eventListeners = [];

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
        async request(action, payload = {}, timeoutMs = 4000) {
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
        onEvent(handler) {
          eventListeners.push(handler);
        },
        waitForEvent(predicate, timeoutMs = 5000) {
          return new Promise((resolveEvt, rejectEvt) => {
            const timer = setTimeout(() => {
              const idx = eventListeners.indexOf(handler);
              if (idx >= 0) eventListeners.splice(idx, 1);
              rejectEvt(new Error("event-timeout"));
            }, timeoutMs);
            function handler(evt) {
              if (predicate(evt)) {
                clearTimeout(timer);
                const idx = eventListeners.indexOf(handler);
                if (idx >= 0) eventListeners.splice(idx, 1);
                resolveEvt(evt);
              }
            }
            eventListeners.push(handler);
          });
        },
        notify(action, payload = {}) {
          ws.send(
            JSON.stringify({
              type: "notify",
              action,
              payload,
            }),
          );
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
      if (!payload) return;

      if (payload.type === "response") {
        const id = String(payload.id || "");
        const entry = clearPending(id);
        if (!entry) return;
        if (payload.ok === false) {
          entry.rejectReq(new Error(String(payload.error || "request-failed")));
          return;
        }
        entry.resolveReq(payload.result);
        return;
      }

      if (payload.type === "event") {
        const evt = payload.event || payload.payload || null;
        eventListeners.forEach((handler) => {
          try {
            handler(evt);
          } catch (_) {}
        });
      }
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
    console.log(`${LOG_PREFIX} PASS ${stepLabel} (${code})`);
    return;
  }
  throw new Error(`${stepLabel}: expected error ${expectedCode}, got success`);
}

function pass(label) {
  console.log(`${LOG_PREFIX} PASS ${label}`);
}

function waitForCondition(predicate, timeoutMs = 4000, pollMs = 25) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      let ok = false;
      try {
        ok = !!predicate();
      } catch (_) {}
      if (ok) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("condition-timeout"));
        return;
      }
      setTimeout(tick, pollMs);
    }
    tick();
  });
}

function loadSharedSyncFactoriesForNode() {
  const scope = {
    WebSocket,
    setTimeout,
    clearTimeout,
    console,
    PoseChronoShared: {},
  };
  scope.window = scope;
  scope.globalThis = scope;

  const modulePaths = [
    path.resolve(__dirname, "..", "packages", "shared", "sync-transport-websocket.js"),
    path.resolve(__dirname, "..", "packages", "shared", "sync-transport-webrtc.js"),
  ];

  modulePaths.forEach((modulePath) => {
    const code = fs.readFileSync(modulePath, "utf8");
    vm.runInNewContext(code, scope, {
      filename: path.basename(modulePath),
    });
  });

  return {
    createSyncTransportWebSocket:
      scope.PoseChronoShared && scope.PoseChronoShared.createSyncTransportWebSocket,
    createSyncTransportWebRTC:
      scope.PoseChronoShared && scope.PoseChronoShared.createSyncTransportWebRTC,
  };
}

class FakeRTCDataChannel {
  constructor() {
    this.readyState = "open";
    this.bufferedAmount = 0;
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
    setTimeout(() => {
      if (typeof this.onopen === "function") {
        this.onopen();
      }
    }, 0);
  }

  send(_payload) {}

  close() {
    this.readyState = "closed";
    if (typeof this.onclose === "function") {
      this.onclose();
    }
  }
}

class FakeRTCPeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.connectionState = "connected";
    this.onicecandidate = null;
    this.onconnectionstatechange = null;
    this.ondatachannel = null;
  }

  createDataChannel() {
    return new FakeRTCDataChannel();
  }

  async createOffer() {
    return { type: "offer", sdp: "fake-offer-sdp" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "fake-answer-sdp" };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }

  async addIceCandidate(_candidate) {}

  close() {
    this.connectionState = "closed";
    if (typeof this.onconnectionstatechange === "function") {
      this.onconnectionstatechange();
    }
  }
}

// ---------------------------------------------------------------------------

const VALID_PACK = {
  schema: "posechrono-session-pack",
  version: 1,
  createdAt: new Date().toISOString(),
  source: { runtime: "desktop", language: "en" },
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

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/5XcAAAAASUVORK5CYII=";
const TINY_PNG_SIZE = Buffer.from(TINY_PNG_BASE64, "base64").length;
const TINY_PNG_SHA = crypto
  .createHash("sha256")
  .update(Buffer.from(TINY_PNG_BASE64, "base64"))
  .digest("hex");

const ROUNDTRIP_MEDIA_FIXTURES = [
  { identity: "k:abc123", name: "dup-name.png" },
  { identity: "k:def456", name: "dup-name.png" },
  { identity: "k:ghi789", name: "pose-3.png" },
  { identity: "k:jkl012", name: "pose-4.png" },
];

// ---------------------------------------------------------------------------

async function main() {
  const port = await findFreePort();
  const relayUrl = `ws://${RELAY_HOST}:${port}`;
  let relayProcess = null;
  const clients = [];

  try {
    console.log(`${LOG_PREFIX} starting relay on ${relayUrl}`);
    relayProcess = await startRelayProcess(port);
    await sleep(80);

    // -----------------------------------------------------------------------
    // Test 1: Host creates room
    // -----------------------------------------------------------------------
    const sessionCode = "INTG-TEST";
    const host = await createRelayClient(relayUrl, "host");
    clients.push(host);

    const room = await host.request("createRoom", {
      sessionCode,
      hostClientId: "host-1",
      hostDisplayName: "Host",
      sessionName: "Integration Test",
      password: "secret",
    });
    expect(room && room.sessionCode === sessionCode, "createRoom failed");
    pass("1. host creates room");

    // Subscribe host to events
    host.notify("subscribe", { sessionCode });
    await sleep(50);

    // -----------------------------------------------------------------------
    // Test 2: Participant joins
    // -----------------------------------------------------------------------
    const guest = await createRelayClient(relayUrl, "guest");
    clients.push(guest);

    // Subscribe guest before joining so we get events
    guest.notify("subscribe", { sessionCode });
    await sleep(50);

    const hostSeesJoin = host.waitForEvent(
      (evt) => evt && evt.type === "room-updated" && evt.source === "participant-joined",
      3000,
    );

    await guest.request("joinRoom", {
      sessionCode,
      clientId: "guest-1",
      participantName: "Guest",
      password: "secret",
    });
    pass("2. participant joins room");

    const joinEvt = await hostSeesJoin;
    expect(
      joinEvt && joinEvt.snapshot && joinEvt.snapshot.participantsCount >= 2,
      "host did not receive participant-joined event",
    );
    pass("2b. host receives room-updated/participant-joined event");

    // -----------------------------------------------------------------------
    // Test 3: Host publishes session state, participant receives it
    // -----------------------------------------------------------------------
    const guestSeesState = guest.waitForEvent(
      (evt) => evt && evt.type === "session-state-updated",
      3000,
    );

    await host.request("updateSessionState", {
      sessionCode,
      payload: {
        isPlaying: true,
        selectedDuration: 120,
      },
    });

    const stateEvt = await guestSeesState;
    expect(
      stateEvt && stateEvt.state && stateEvt.state.isPlaying === true && stateEvt.state.selectedDuration === 120,
      "guest did not receive session state update",
    );
    pass("3. host publishes state → participant receives it");

    // -----------------------------------------------------------------------
    // Test 4: Host uploads pack, participant downloads, integrity OK
    // -----------------------------------------------------------------------
    await host.request("uploadSessionPack", {
      sessionCode,
      sourceClientId: "host-1",
      pack: VALID_PACK,
    });

    const fetchedPack = await guest.request("getSessionPack", {
      sessionCode,
      sourceClientId: "guest-1",
    });
    expect(
      fetchedPack &&
        fetchedPack.pack &&
        fetchedPack.pack.schema === "posechrono-session-pack" &&
        fetchedPack.pack.session.selectedDuration === 60,
      "guest pack download integrity check failed",
    );
    pass("4. host uploads pack → participant downloads with correct integrity");

    // -----------------------------------------------------------------------
    // Test 5: Host uploads media, participant downloads, SHA256 OK
    // -----------------------------------------------------------------------
    await host.request("resetSessionMediaPack", {
      sessionCode,
      sourceClientId: "host-1",
    });

    for (const fixture of ROUNDTRIP_MEDIA_FIXTURES) {
      await host.request("uploadSessionMediaFile", {
        sessionCode,
        sourceClientId: "host-1",
        file: {
          identity: fixture.identity,
          name: fixture.name,
          ext: "png",
          mime: "image/png",
          size: TINY_PNG_SIZE,
          sha256: TINY_PNG_SHA,
          dataBase64: TINY_PNG_BASE64,
        },
      });
    }

    const mediaManifest = await guest.request("getSessionMediaManifest", {
      sessionCode,
      sourceClientId: "guest-1",
    });
    expect(
      mediaManifest &&
        Array.isArray(mediaManifest.files) &&
        mediaManifest.files.length === ROUNDTRIP_MEDIA_FIXTURES.length,
      `media manifest count mismatch: expected ${ROUNDTRIP_MEDIA_FIXTURES.length}, got ${
        mediaManifest && Array.isArray(mediaManifest.files) ? mediaManifest.files.length : "n/a"
      }`,
    );
    const manifestIds = mediaManifest.files.map((entry) => String(entry?.identity || ""));
    const expectedIds = ROUNDTRIP_MEDIA_FIXTURES.map((entry) => entry.identity);
    expect(
      new Set(manifestIds).size === ROUNDTRIP_MEDIA_FIXTURES.length,
      "media manifest contains duplicate identities",
    );
    expect(
      manifestIds.join("|") === expectedIds.join("|"),
      `media manifest order mismatch: expected ${expectedIds.join(",")}, got ${manifestIds.join(",")}`,
    );

    for (const fixture of ROUNDTRIP_MEDIA_FIXTURES) {
      const mediaFile = await guest.request("getSessionMediaFile", {
        sessionCode,
        sourceClientId: "guest-1",
        identity: fixture.identity,
      });
      expect(
        mediaFile && mediaFile.file && mediaFile.file.dataBase64,
        `media file download failed for ${fixture.identity}`,
      );
      const downloadedSha = crypto
        .createHash("sha256")
        .update(Buffer.from(mediaFile.file.dataBase64, "base64"))
        .digest("hex");
      expect(
        downloadedSha === TINY_PNG_SHA,
        `media SHA256 mismatch for ${fixture.identity}: expected ${TINY_PNG_SHA}, got ${downloadedSha}`,
      );
    }
    pass("5. host uploads media set → participant downloads same count/order with valid SHA256");

    // -----------------------------------------------------------------------
    // Test 6: Participant leaves, host sees updated count
    // -----------------------------------------------------------------------
    const hostSeesLeave = host.waitForEvent(
      (evt) => evt && evt.type === "room-updated" && evt.source === "participant-left",
      3000,
    );

    await guest.request("leaveRoom", {
      sessionCode,
      clientId: "guest-1",
    });

    const leaveEvt = await hostSeesLeave;
    expect(
      leaveEvt && leaveEvt.snapshot && typeof leaveEvt.snapshot.participantsCount === "number",
      "host did not receive participant-left event",
    );
    expect(
      leaveEvt.snapshot.participantsCount === 1,
      `expected 1 participant after leave, got ${leaveEvt.snapshot.participantsCount}`,
    );
    pass("6. participant leaves → host sees updated count (1)");

    // -----------------------------------------------------------------------
    // Test 7: Host leaves → room-closed with source "host-left"
    // -----------------------------------------------------------------------
    // Re-join guest first so we can observe the room-closed event
    await guest.request("joinRoom", {
      sessionCode,
      clientId: "guest-2",
      participantName: "Guest2",
      password: "secret",
    });

    const guestSeesClose = guest.waitForEvent(
      (evt) => evt && evt.type === "room-closed",
      3000,
    );

    await host.request("leaveRoom", {
      sessionCode,
      clientId: "host-1",
    });

    const closeEvt = await guestSeesClose;
    expect(
      closeEvt && closeEvt.source === "host-left",
      `expected room-closed source "host-left", got "${closeEvt && closeEvt.source}"`,
    );
    pass('7. host leaves → room-closed with source "host-left"');

    // -----------------------------------------------------------------------
    // Test 8: Room cleanup after host leaves — verify room is gone
    // -----------------------------------------------------------------------
    // Note: TTL expiry (source "ttl-expired") requires relay minimums of
    // 60s TTL / 5s cleanup which is too slow for automated tests.
    // We verify that after host-left, the room is properly cleaned up.
    await stopRelayProcess(relayProcess);
    relayProcess = null;
    for (const client of clients) {
      try {
        await client.close();
      } catch (_) {}
    }
    clients.length = 0;

    const port2 = await findFreePort();
    const relayUrl2 = `ws://${RELAY_HOST}:${port2}`;
    relayProcess = await startRelayProcess(port2);
    await sleep(80);

    const cleanupHost = await createRelayClient(relayUrl2, "cleanup-host");
    const cleanupGuest = await createRelayClient(relayUrl2, "cleanup-guest");
    clients.push(cleanupHost, cleanupGuest);

    const cleanupCode = "CLN0-TEST";
    await cleanupHost.request("createRoom", {
      sessionCode: cleanupCode,
      hostClientId: "cleanup-host-1",
      hostDisplayName: "Cleanup Host",
      sessionName: "Cleanup Test",
      password: "",
    });

    await cleanupGuest.request("joinRoom", {
      sessionCode: cleanupCode,
      clientId: "cleanup-guest-1",
      participantName: "Cleanup Guest",
      password: "",
    });

    // Host leaves — room should be destroyed
    await cleanupHost.request("leaveRoom", {
      sessionCode: cleanupCode,
      clientId: "cleanup-host-1",
    });

    await sleep(100);

    // Verify room no longer exists
    await expectError(
      () => cleanupGuest.request("getRoomSnapshot", { sessionCode: cleanupCode }),
      "session-not-found",
      "8. room cleaned up after host leaves",
    );

    // -----------------------------------------------------------------------
    // Test 9: TLS enforcement — ws:// blocked when requireTls is true
    // -----------------------------------------------------------------------
    // We test this at the client transport level (createSyncTransportWebSocket)
    const transportModulePath = path.resolve(
      __dirname,
      "..",
      "packages",
      "shared",
      "sync-transport-websocket.js",
    );

    // Load the module in an isolated VM context and expose window/globalThis.
    const transportCode = fs.readFileSync(transportModulePath, "utf8");
    const transportScope = {
      WebSocket,
      setTimeout,
      clearTimeout,
      console,
      PoseChronoShared: {},
    };
    transportScope.window = transportScope;
    transportScope.globalThis = transportScope;
    vm.runInNewContext(transportCode, transportScope, {
      filename: "sync-transport-websocket.js",
    });
    const createTransport =
      (transportScope.PoseChronoShared &&
        transportScope.PoseChronoShared.createSyncTransportWebSocket) ||
      null;

    if (createTransport) {
      let tlsError = null;
      try {
        createTransport({
          url: `ws://${RELAY_HOST}:${port2}`,
          requireTls: true,
          WebSocketCtor: WebSocket,
        });
      } catch (error) {
        tlsError = error;
      }
      expect(
        tlsError && String(tlsError.message) === "websocket-tls-required",
        `expected websocket-tls-required error, got ${tlsError && tlsError.message}`,
      );
      pass("9. TLS enforcement blocks ws:// when requireTls=true");

      // Verify wss:// would be accepted (constructor doesn't throw for wss)
      // We can't actually connect to wss since we don't have a TLS relay,
      // but we verify the constructor doesn't throw the TLS error
      let wssError = null;
      try {
        const t = createTransport({
          url: "wss://example.com:9999",
          requireTls: true,
          WebSocketCtor: WebSocket,
        });
        t.disconnect();
      } catch (error) {
        wssError = error;
      }
      // If there's an error, it should NOT be websocket-tls-required
      if (wssError) {
        expect(
          String(wssError.message) !== "websocket-tls-required",
          "wss:// should not trigger TLS error",
        );
      }
      pass("9b. TLS enforcement allows wss:// when requireTls=true");
    } else {
      throw new Error("transport-module-not-loadable");
    }

    // -----------------------------------------------------------------------
    // Test 10: Rate limiting — state-rate-limited after burst
    // -----------------------------------------------------------------------
    await stopRelayProcess(relayProcess);
    relayProcess = null;
    for (const client of clients) {
      try {
        await client.close();
      } catch (_) {}
    }
    clients.length = 0;

    const port3 = await findFreePort();
    const relayUrl3 = `ws://${RELAY_HOST}:${port3}`;
    relayProcess = await startRelayProcess(port3, {
      POSECHRONO_SYNC_STATE_RATE_WINDOW_MS: "60000",
      POSECHRONO_SYNC_STATE_RATE_MAX_MESSAGES: "5",
    });
    await sleep(80);

    const rlHost = await createRelayClient(relayUrl3, "rl-host");
    clients.push(rlHost);

    const rlCode = "RATE-LIMT";
    await rlHost.request("createRoom", {
      sessionCode: rlCode,
      hostClientId: "rl-host-1",
      hostDisplayName: "RL Host",
      sessionName: "Rate Test",
      password: "",
    });

    // Send state updates up to the limit
    for (let i = 0; i < 5; i++) {
      await rlHost.request("updateSessionState", {
        sessionCode: rlCode,
        payload: { isPlaying: i % 2 === 0 },
      });
    }

    // Next one should be rate-limited
    await expectError(
      () =>
        rlHost.request("updateSessionState", {
          sessionCode: rlCode,
          payload: { isPlaying: true },
        }),
      "state-rate-limited",
      "10. state rate-limit enforced after burst",
    );

    // -----------------------------------------------------------------------
    // Test 11: WebRTC mesh-limit fallback diagnostics (host + 3 guests)
    // -----------------------------------------------------------------------
    const factories = loadSharedSyncFactoriesForNode();
    const createSyncTransportWebRTC = factories.createSyncTransportWebRTC;
    expect(
      typeof createSyncTransportWebRTC === "function",
      "webrtc transport factory not loadable",
    );

    const rtcCode = "WRTC-MESH";
    const rtcTransports = [];
    try {
      const rtcHost = createSyncTransportWebRTC({
        signalingUrl: relayUrl3,
        requireTls: false,
        maxMeshPeers: 1,
        RTCPeerConnectionCtor: FakeRTCPeerConnection,
        logger: () => {},
      });
      rtcTransports.push(rtcHost);

      const rtcGuest1 = createSyncTransportWebRTC({
        signalingUrl: relayUrl3,
        requireTls: false,
        maxMeshPeers: 1,
        RTCPeerConnectionCtor: FakeRTCPeerConnection,
        logger: () => {},
      });
      const rtcGuest2 = createSyncTransportWebRTC({
        signalingUrl: relayUrl3,
        requireTls: false,
        maxMeshPeers: 1,
        RTCPeerConnectionCtor: FakeRTCPeerConnection,
        logger: () => {},
      });
      const rtcGuest3 = createSyncTransportWebRTC({
        signalingUrl: relayUrl3,
        requireTls: false,
        maxMeshPeers: 1,
        RTCPeerConnectionCtor: FakeRTCPeerConnection,
        logger: () => {},
      });
      rtcTransports.push(rtcGuest1, rtcGuest2, rtcGuest3);

      const hostDiagnostics = [];
      rtcHost.subscribe(rtcCode, (evt) => {
        if (evt && evt.type === "transport-diagnostic") {
          hostDiagnostics.push(evt);
        }
      });

      await rtcHost.createRoom({
        sessionCode: rtcCode,
        hostClientId: "wrtc-host-1",
        hostDisplayName: "WRTC Host",
        sessionName: "WebRTC Mesh Test",
        password: "",
      });

      await rtcGuest1.joinRoom({
        sessionCode: rtcCode,
        clientId: "wrtc-guest-1",
        participantName: "WRTC Guest 1",
        password: "",
      });
      await rtcGuest2.joinRoom({
        sessionCode: rtcCode,
        clientId: "wrtc-guest-2",
        participantName: "WRTC Guest 2",
        password: "",
      });
      await rtcGuest3.joinRoom({
        sessionCode: rtcCode,
        clientId: "wrtc-guest-3",
        participantName: "WRTC Guest 3",
        password: "",
      });

      await waitForCondition(() => {
        return hostDiagnostics.some(
          (evt) =>
            evt &&
            evt.diagnostic &&
            evt.diagnostic.kind === "relay-fallback" &&
            evt.diagnostic.active === true,
        );
      }, 5000);

      const fallbackEvent = hostDiagnostics.find(
        (evt) =>
          evt &&
          evt.diagnostic &&
          evt.diagnostic.kind === "relay-fallback" &&
          evt.diagnostic.active === true,
      );
      expect(!!fallbackEvent, "missing relay-fallback diagnostic event");
      expect(
        Number(fallbackEvent.diagnostic.meshLimit || 0) === 1,
        `expected meshLimit=1, got ${fallbackEvent.diagnostic.meshLimit}`,
      );
      expect(
        Number(fallbackEvent.diagnostic.relayParticipantsCount || 0) >= 1,
        `expected relayParticipantsCount>=1, got ${fallbackEvent.diagnostic.relayParticipantsCount}`,
      );

      const rtcSnapshot = await rtcHost.getRoomSnapshot(rtcCode);
      expect(
        rtcSnapshot && Number(rtcSnapshot.participantsCount || 0) === 4,
        `expected 4 participants in WebRTC room, got ${rtcSnapshot && rtcSnapshot.participantsCount}`,
      );
      pass("11. webrtc mesh limit triggers relay fallback diagnostic");
    } finally {
      for (const rtcTransport of rtcTransports) {
        try {
          rtcTransport.disconnect();
        } catch (_) {}
      }
    }

    // -----------------------------------------------------------------------
    console.log(`\n${LOG_PREFIX} ALL TESTS PASSED (11/11)`);
  } catch (error) {
    console.error(
      `${LOG_PREFIX} FAILED:`,
      error && error.stack ? error.stack : error,
    );
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
