(function initPoseChronoSharedSyncTransportWebRTC(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createSyncTransportWebRTC(options = {}) {
    const logger =
      typeof options.logger === "function" ? options.logger : () => {};
    const now =
      typeof options.now === "function"
        ? options.now
        : () => Date.now();
    const setTimeoutFn =
      typeof options.setTimeout === "function"
        ? options.setTimeout
        : setTimeout;
    const clearTimeoutFn =
      typeof options.clearTimeout === "function"
        ? options.clearTimeout
        : clearTimeout;

    const RTCPeerConnectionCtor =
      options.RTCPeerConnectionCtor ||
      (typeof RTCPeerConnection !== "undefined" ? RTCPeerConnection : null);
    const RTCSessionDescriptionCtor =
      options.RTCSessionDescriptionCtor ||
      (typeof RTCSessionDescription !== "undefined" ? RTCSessionDescription : null);
    const RTCIceCandidateCtor =
      options.RTCIceCandidateCtor ||
      (typeof RTCIceCandidate !== "undefined" ? RTCIceCandidate : null);

    if (!RTCPeerConnectionCtor) {
      throw new Error("webrtc-unavailable");
    }

    const signalingFactory =
      typeof options.createSignalingTransport === "function"
        ? options.createSignalingTransport
        : typeof sharedRoot.createSyncTransportWebSocket === "function"
          ? sharedRoot.createSyncTransportWebSocket
          : null;

    if (typeof signalingFactory !== "function") {
      throw new Error("webrtc-signaling-unavailable");
    }

    const signalingUrl = String(
      options.signalingUrl || options.url || "",
    ).trim();
    if (!signalingUrl) {
      throw new Error("webrtc-signaling-url-missing");
    }

    const rtcConfiguration =
      options.rtcConfiguration ||
      options.rtcConfig || {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun.cloudflare.com:3478" },
        ],
      };
    const maxMeshPeers = Math.max(
      1,
      Number(options.maxMeshPeers || 4) || 4,
    );
    const p2pRequestTimeoutMs = Math.max(
      1000,
      Number(options.p2pRequestTimeoutMs || 12000) || 12000,
    );
    const mediaChunkBase64Size = Math.max(
      2048,
      Number(options.mediaChunkBase64Size || 12000) || 12000,
    );
    const maxBufferedAmountBeforeYield = Math.max(
      mediaChunkBase64Size * 2,
      Number(options.maxBufferedAmountBeforeYield || 512 * 1024) || 512 * 1024,
    );
    const sendYieldDelayMs = Math.max(
      1,
      Number(options.sendYieldDelayMs || 12) || 12,
    );
    const mirrorMediaToRelay = options.mirrorMediaToRelay !== false;
    const enableLatencyLogs = options.enableLatencyLogs === true;
    const latencyLogEvery = Math.max(
      5,
      Number(options.latencyLogEvery || 20) || 20,
    );
    const latencyWindowSize = Math.max(
      10,
      Number(options.latencyWindowSize || 120) || 120,
    );
    const mediaTransferEnabled = options.allowMediaTransfer !== false;

    const signalingTransport = signalingFactory({
      url: signalingUrl,
      requireTls: options.requireTls === true,
      maxReconnectAttempts: options.maxReconnectAttempts,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs,
      logger,
    });

    const roomBindings = new Map(); // sessionCode -> { handlers:Set<fn>, unsubscribe:fn }
    const peerLinks = new Map(); // peerClientId -> { pc, channel, open, initiator }
    const pendingP2PRequests = new Map(); // requestId -> { type, resolve, reject, timerId, ... }
    const connectionStateListeners = new Set();
    const localMediaFilesByIdentity = new Map();

    let connectionState = "disconnected";
    let roomCode = "";
    let role = "none";
    let clientId = "";
    let hostClientId = "";
    let explicitDisconnect = false;
    let requestSequence = 1;
    let lastRoomSnapshot = null;
    let lastMeshFallbackCount = 0;
    let localMediaUpdatedAt = 0;
    let localMediaUploadedBy = "";
    let localMediaTotalBytes = 0;
    const latencySamples = [];

    function normalizeSessionCode(input) {
      const normalized = String(input || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
        return "";
      }
      return normalized;
    }

    function normalizeClientId(input) {
      const value = String(input || "").trim();
      return value || "";
    }

    function normalizeRequestId(input) {
      const value = String(input || "").trim();
      if (!value || value.length > 96) return "";
      if (!/^[A-Za-z0-9:_-]+$/.test(value)) return "";
      return value;
    }

    function toPositiveInt(value, fallback = 0) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return Math.max(0, Number(fallback) || 0);
      }
      return Math.floor(parsed);
    }

    function sleep(ms) {
      return new Promise((resolve) => {
        setTimeoutFn(resolve, Math.max(0, Number(ms) || 0));
      });
    }

    function emitConnectionState(nextState) {
      if (connectionState === nextState) return;
      connectionState = nextState;
      connectionStateListeners.forEach((listener) => {
        try {
          listener(nextState);
        } catch (_) {}
      });
    }

    function getRoomHandlers(code) {
      const normalizedCode = normalizeSessionCode(code);
      if (!normalizedCode) return null;
      const entry = roomBindings.get(normalizedCode);
      return entry && entry.handlers instanceof Set ? entry.handlers : null;
    }

    function dispatchRoomEvent(sessionCode, eventPayload) {
      const handlers = getRoomHandlers(sessionCode);
      if (!handlers || handlers.size <= 0) return;
      handlers.forEach((handler) => {
        try {
          handler(eventPayload);
        } catch (_) {}
      });
    }

    function clearLatencySamples() {
      latencySamples.length = 0;
    }

    function computePercentile(values, percentile) {
      if (!Array.isArray(values) || values.length <= 0) return 0;
      const sorted = values.slice().sort((a, b) => a - b);
      const p = Math.max(0, Math.min(100, Number(percentile) || 0));
      const index = Math.max(
        0,
        Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1),
      );
      return sorted[index] || 0;
    }

    function recordLatencySample(ms) {
      const value = Number(ms);
      if (!Number.isFinite(value) || value < 0) return;
      latencySamples.push(value);
      if (latencySamples.length > latencyWindowSize) {
        latencySamples.splice(0, latencySamples.length - latencyWindowSize);
      }
      if (!enableLatencyLogs) return;
      if (latencySamples.length % latencyLogEvery !== 0) return;
      const p50 = computePercentile(latencySamples, 50);
      const p95 = computePercentile(latencySamples, 95);
      logger(
        `[SyncWebRTC] control latency p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms (n=${latencySamples.length})`,
      );
    }

    function emitPeerStateEvent(statePayload, sourceClient = "") {
      const code = normalizeSessionCode(roomCode);
      if (!code || !statePayload || typeof statePayload !== "object") return;
      dispatchRoomEvent(code, {
        type: "session-state-updated",
        sessionCode: code,
        state: statePayload,
        source: "webrtc",
        sourceClientId: normalizeClientId(sourceClient) || normalizeClientId(hostClientId),
      });
    }

    function emitTransportDiagnostic(kind, payload = {}) {
      const code = normalizeSessionCode(roomCode);
      if (!code) return;
      dispatchRoomEvent(code, {
        type: "transport-diagnostic",
        sessionCode: code,
        diagnostic: {
          kind: String(kind || "").trim().toLowerCase(),
          ...payload,
          ts: now(),
        },
        source: "webrtc",
      });
    }

    function hasOpenPeerChannel() {
      for (const entry of peerLinks.values()) {
        if (!entry || !entry.channel) continue;
        if (entry.channel.readyState === "open") return true;
      }
      return false;
    }

    function getOpenPeerChannel(peerId) {
      const entry = peerLinks.get(normalizeClientId(peerId));
      if (!entry || !entry.channel) return null;
      if (entry.channel.readyState !== "open") return null;
      return entry.channel;
    }

    function getOpenHostChannel() {
      if (role !== "participant") return null;
      const hostId = normalizeClientId(hostClientId);
      if (!hostId) return null;
      return getOpenPeerChannel(hostId);
    }

    function nextP2PRequestId() {
      requestSequence += 1;
      if (requestSequence > 1e9) requestSequence = 1;
      return `rtc-${now().toString(36)}-${requestSequence.toString(36)}`;
    }

    function clearPendingP2PRequests(reason = "webrtc-not-ready") {
      pendingP2PRequests.forEach((entry, requestId) => {
        pendingP2PRequests.delete(requestId);
        if (entry && entry.timerId) clearTimeoutFn(entry.timerId);
        if (entry && typeof entry.reject === "function") {
          entry.reject(new Error(reason));
        }
      });
    }

    function registerPendingRequest(type, timeoutMs) {
      const requestId = nextP2PRequestId();
      return {
        requestId,
        promise: new Promise((resolve, reject) => {
          const timerId = setTimeoutFn(() => {
            const active = pendingP2PRequests.get(requestId);
            if (!active) return;
            pendingP2PRequests.delete(requestId);
            reject(new Error("webrtc-request-timeout"));
          }, Math.max(1000, Number(timeoutMs || p2pRequestTimeoutMs) || p2pRequestTimeoutMs));

          pendingP2PRequests.set(requestId, {
            type,
            resolve,
            reject,
            timerId,
            startedAt: now(),
            meta: null,
            chunks: null,
            totalChunks: 0,
            receivedChunks: 0,
          });
        }),
      };
    }

    function resolvePendingRequest(requestId, value) {
      const id = String(requestId || "").trim();
      if (!id) return false;
      const entry = pendingP2PRequests.get(id);
      if (!entry) return false;
      pendingP2PRequests.delete(id);
      if (entry.timerId) clearTimeoutFn(entry.timerId);
      if (entry.startedAt) {
        recordLatencySample(Math.max(0, now() - toPositiveInt(entry.startedAt, now())));
      }
      if (typeof entry.resolve === "function") entry.resolve(value);
      return true;
    }

    function rejectPendingRequest(requestId, errorCode) {
      const id = String(requestId || "").trim();
      if (!id) return false;
      const entry = pendingP2PRequests.get(id);
      if (!entry) return false;
      pendingP2PRequests.delete(id);
      if (entry.timerId) clearTimeoutFn(entry.timerId);
      if (typeof entry.reject === "function") {
        entry.reject(new Error(String(errorCode || "webrtc-request-failed")));
      }
      return true;
    }

    function normalizeMediaFilePayload(input) {
      if (!input || typeof input !== "object") {
        throw new Error("invalid-session-media");
      }
      const identity = String(input.identity || "").trim();
      if (!identity || identity.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(identity)) {
        throw new Error("invalid-session-media");
      }

      const ext = String(input.ext || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 12);
      if (!ext) throw new Error("invalid-session-media");

      const mime = String(input.mime || "").trim().toLowerCase().slice(0, 80);
      const name = String(input.name || "unknown")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 160) || "unknown";
      const size = toPositiveInt(input.size, 0);
      const sha256 = String(input.sha256 || "").trim().toLowerCase();
      const dataBase64 = String(input.dataBase64 || "")
        .replace(/\s+/g, "")
        .trim();
      if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
        throw new Error("invalid-session-media");
      }
      if (size <= 0) throw new Error("invalid-session-media");

      return { identity, name, ext, mime, size, sha256, dataBase64 };
    }

    function buildLocalMediaManifest() {
      const files = Array.from(localMediaFilesByIdentity.values()).map((entry) => ({
        identity: String(entry.identity || "").trim(),
        name: String(entry.name || "unknown").trim() || "unknown",
        ext: String(entry.ext || "").trim().toLowerCase(),
        mime: String(entry.mime || "").trim().toLowerCase(),
        size: toPositiveInt(entry.size, 0),
        sha256: String(entry.sha256 || "").trim().toLowerCase(),
        updatedAt: toPositiveInt(entry.updatedAt, 0),
      }));

      return {
        files,
        filesCount: files.length,
        totalBytes: toPositiveInt(localMediaTotalBytes, 0),
        updatedAt: toPositiveInt(localMediaUpdatedAt, 0),
        uploadedBy: String(localMediaUploadedBy || "").trim(),
      };
    }

    function storeLocalMediaFile(filePayload) {
      const safe = normalizeMediaFilePayload(filePayload);
      const previous = localMediaFilesByIdentity.get(safe.identity);
      const previousSize = previous ? toPositiveInt(previous.size, 0) : 0;
      localMediaFilesByIdentity.set(safe.identity, {
        ...safe,
        updatedAt: now(),
      });
      localMediaTotalBytes =
        Math.max(0, toPositiveInt(localMediaTotalBytes, 0) - previousSize) + safe.size;
      localMediaUpdatedAt = now();
      localMediaUploadedBy = String(clientId || localMediaUploadedBy || "").trim();
      return safe;
    }

    function clearLocalMediaFiles() {
      localMediaFilesByIdentity.clear();
      localMediaTotalBytes = 0;
      localMediaUpdatedAt = now();
      localMediaUploadedBy = String(clientId || "").trim();
    }

    function sanitizePeerManifest(input) {
      if (!input || typeof input !== "object") {
        return {
          files: [],
          filesCount: 0,
          totalBytes: 0,
          updatedAt: 0,
          uploadedBy: "",
        };
      }

      const files = Array.isArray(input.files)
        ? input.files
            .map((entry) => {
              if (!entry || typeof entry !== "object") return null;
              const identity = String(entry.identity || "").trim();
              if (!identity || identity.length > 128) return null;
              return {
                identity,
                name:
                  String(entry.name || "unknown")
                    .replace(/[\u0000-\u001f\u007f]/g, "")
                    .trim()
                    .slice(0, 160) || "unknown",
                ext: String(entry.ext || "").trim().toLowerCase().slice(0, 12),
                mime: String(entry.mime || "").trim().toLowerCase().slice(0, 80),
                size: toPositiveInt(entry.size, 0),
                sha256: String(entry.sha256 || "").trim().toLowerCase().slice(0, 128),
                updatedAt: toPositiveInt(entry.updatedAt, 0),
              };
            })
            .filter((entry) => !!entry)
        : [];

      const filesCount = toPositiveInt(input.filesCount, files.length);
      const totalBytes = toPositiveInt(
        input.totalBytes,
        files.reduce((sum, entry) => sum + toPositiveInt(entry.size, 0), 0),
      );
      return {
        files,
        filesCount,
        totalBytes,
        updatedAt: toPositiveInt(input.updatedAt, 0),
        uploadedBy: String(input.uploadedBy || "").trim().slice(0, 64),
      };
    }

    function sanitizePeerFileMeta(input, fallbackIdentity = "") {
      const meta = input && typeof input === "object" ? input : {};
      const identity = String(meta.identity || fallbackIdentity || "").trim();
      if (!identity || identity.length > 128) {
        throw new Error("invalid-session-media");
      }
      return {
        identity,
        name:
          String(meta.name || "unknown")
            .replace(/[\u0000-\u001f\u007f]/g, "")
            .trim()
            .slice(0, 160) || "unknown",
        ext: String(meta.ext || "").trim().toLowerCase().slice(0, 12),
        mime: String(meta.mime || "").trim().toLowerCase().slice(0, 80),
        size: toPositiveInt(meta.size, 0),
        sha256: String(meta.sha256 || "").trim().toLowerCase().slice(0, 128),
      };
    }

    function sendDataMessage(channel, payload) {
      if (!channel || channel.readyState !== "open") {
        throw new Error("webrtc-not-ready");
      }
      channel.send(JSON.stringify(payload));
    }

    async function requestMediaManifestFromHost() {
      const hostChannel = getOpenHostChannel();
      if (!hostChannel) {
        throw new Error("webrtc-not-ready");
      }
      const pending = registerPendingRequest("p2p-media-manifest");
      sendDataMessage(hostChannel, {
        kind: "p2p-media-manifest-request",
        requestId: pending.requestId,
        sessionCode: roomCode,
        sourceClientId: clientId,
        ts: now(),
      });
      return pending.promise;
    }

    async function requestMediaFileFromHost(identity) {
      const hostChannel = getOpenHostChannel();
      if (!hostChannel) {
        throw new Error("webrtc-not-ready");
      }
      const normalizedIdentity = String(identity || "").trim();
      if (!normalizedIdentity) {
        throw new Error("invalid-session-media");
      }
      const pending = registerPendingRequest("p2p-media-file");
      sendDataMessage(hostChannel, {
        kind: "p2p-media-file-request",
        requestId: pending.requestId,
        sessionCode: roomCode,
        sourceClientId: clientId,
        identity: normalizedIdentity,
        ts: now(),
      });
      return pending.promise;
    }

    async function sendMediaFileResponseToPeer(channel, requestId, filePayload) {
      const safe = normalizeMediaFilePayload(filePayload);
      const dataBase64 = String(safe.dataBase64 || "").trim();
      const totalChunks = Math.max(
        1,
        Math.ceil(dataBase64.length / mediaChunkBase64Size),
      );

      sendDataMessage(channel, {
        kind: "p2p-media-file-begin",
        requestId,
        file: {
          identity: safe.identity,
          name: safe.name,
          ext: safe.ext,
          mime: safe.mime,
          size: safe.size,
          sha256: safe.sha256,
          totalChunks,
        },
      });

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        if (!channel || channel.readyState !== "open") {
          throw new Error("webrtc-not-ready");
        }
        const offset = chunkIndex * mediaChunkBase64Size;
        const chunk = dataBase64.slice(offset, offset + mediaChunkBase64Size);
        sendDataMessage(channel, {
          kind: "p2p-media-file-chunk",
          requestId,
          chunkIndex,
          totalChunks,
          dataBase64: chunk,
        });

        if (
          typeof channel.bufferedAmount === "number" &&
          channel.bufferedAmount > maxBufferedAmountBeforeYield
        ) {
          await sleep(sendYieldDelayMs);
        }
      }

      sendDataMessage(channel, {
        kind: "p2p-media-file-end",
        requestId,
      });
    }

    async function handleHostPeerDataMessage(peerId, payload) {
      if (!payload || typeof payload !== "object") return;
      const kind = String(payload.kind || "").trim().toLowerCase();
      const requestId = normalizeRequestId(payload.requestId);
      if (!requestId) return;
      const channel = getOpenPeerChannel(peerId);
      if (!channel) return;

      if (kind === "p2p-media-manifest-request") {
        const manifest = buildLocalMediaManifest();
        if (!manifest.filesCount) {
          sendDataMessage(channel, {
            kind: "p2p-media-manifest-response",
            requestId,
            ok: false,
            errorCode: "webrtc-media-unavailable",
          });
          return;
        }
        sendDataMessage(channel, {
          kind: "p2p-media-manifest-response",
          requestId,
          ok: true,
          manifest,
        });
        return;
      }

      if (kind === "p2p-media-file-request") {
        const identity = String(payload.identity || "").trim();
        if (!identity) {
          sendDataMessage(channel, {
            kind: "p2p-media-file-error",
            requestId,
            errorCode: "invalid-session-media",
          });
          return;
        }
        const fileEntry = localMediaFilesByIdentity.get(identity);
        if (!fileEntry) {
          sendDataMessage(channel, {
            kind: "p2p-media-file-error",
            requestId,
            errorCode: "session-media-not-found",
          });
          return;
        }
        try {
          await sendMediaFileResponseToPeer(channel, requestId, fileEntry);
        } catch (error) {
          sendDataMessage(channel, {
            kind: "p2p-media-file-error",
            requestId,
            errorCode: error?.message || "webrtc-file-transfer-failed",
          });
        }
      }
    }

    function handleParticipantPeerDataMessage(payload) {
      if (!payload || typeof payload !== "object") return;
      const kind = String(payload.kind || "").trim().toLowerCase();
      const requestId = normalizeRequestId(payload.requestId);
      if (!requestId) return;

      if (kind === "p2p-media-manifest-response") {
        if (payload.ok === true) {
          resolvePendingRequest(requestId, sanitizePeerManifest(payload.manifest));
        } else {
          rejectPendingRequest(
            requestId,
            payload.errorCode || "webrtc-media-unavailable",
          );
        }
        return;
      }

      if (kind === "p2p-media-file-error") {
        rejectPendingRequest(
          requestId,
          payload.errorCode || "webrtc-file-transfer-failed",
        );
        return;
      }

      const pending = pendingP2PRequests.get(requestId);
      if (!pending || pending.type !== "p2p-media-file") return;

      if (kind === "p2p-media-file-begin") {
        try {
          const meta = sanitizePeerFileMeta(
            payload.file,
            String(payload?.file?.identity || ""),
          );
          const totalChunks = Math.max(
            1,
            toPositiveInt(payload?.file?.totalChunks, 1),
          );
          pending.meta = { ...meta };
          pending.totalChunks = totalChunks;
          pending.chunks = new Array(totalChunks);
          pending.receivedChunks = 0;
        } catch (_) {
          rejectPendingRequest(requestId, "invalid-session-media");
        }
        return;
      }

      if (kind === "p2p-media-file-chunk") {
        if (!Array.isArray(pending.chunks) || !pending.meta) return;
        const rawChunkIndex = Number(payload.chunkIndex);
        const chunkIndex = Number.isFinite(rawChunkIndex)
          ? Math.floor(rawChunkIndex)
          : -1;
        if (chunkIndex < 0 || chunkIndex >= pending.totalChunks) return;
        const dataBase64 = String(payload.dataBase64 || "")
          .replace(/\s+/g, "")
          .trim();
        if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) return;
        if (pending.chunks[chunkIndex]) return;
        pending.chunks[chunkIndex] = dataBase64;
        pending.receivedChunks += 1;
        return;
      }

      if (kind === "p2p-media-file-end") {
        if (!Array.isArray(pending.chunks) || !pending.meta) {
          rejectPendingRequest(requestId, "webrtc-file-transfer-failed");
          return;
        }
        if (pending.receivedChunks !== pending.totalChunks) {
          rejectPendingRequest(requestId, "webrtc-file-transfer-incomplete");
          return;
        }
        resolvePendingRequest(requestId, {
          file: {
            ...pending.meta,
            dataBase64: pending.chunks.join(""),
            updatedAt: now(),
          },
        });
      }
    }

    function handlePeerDataMessage(peerId, payload) {
      if (!payload || typeof payload !== "object") return;
      const kind = String(payload.kind || "").trim().toLowerCase();
      if (kind === "session-state-updated") {
        if (role !== "participant") return;
        const sourceClient = normalizeClientId(payload.sourceClientId || peerId);
        if (hostClientId && sourceClient && sourceClient !== hostClientId) {
          return;
        }
        const ts = toPositiveInt(payload.ts, 0);
        if (ts > 0) {
          recordLatencySample(Math.max(0, now() - ts));
        }
        emitPeerStateEvent(
          payload.state || null,
          sourceClient,
        );
        return;
      }

      if (role === "host") {
        void handleHostPeerDataMessage(peerId, payload).catch((error) => {
          logger("[SyncWebRTC] host data channel handling failed", error);
        });
        return;
      }

      if (role === "participant") {
        handleParticipantPeerDataMessage(payload);
      }
    }

    function closePeer(peerClientId) {
      const peerId = normalizeClientId(peerClientId);
      if (!peerId) return;
      const entry = peerLinks.get(peerId);
      if (!entry) return;
      peerLinks.delete(peerId);
      try {
        if (entry.channel) {
          entry.channel.onopen = null;
          entry.channel.onclose = null;
          entry.channel.onmessage = null;
          entry.channel.onerror = null;
          entry.channel.close();
        }
      } catch (_) {}
      try {
        if (entry.pc) {
          entry.pc.onicecandidate = null;
          entry.pc.ondatachannel = null;
          entry.pc.onconnectionstatechange = null;
          entry.pc.close();
        }
      } catch (_) {}
      if (role === "participant" && peerId === hostClientId) {
        clearPendingP2PRequests("webrtc-not-ready");
      }
    }

    function closeAllPeers() {
      Array.from(peerLinks.keys()).forEach((peerId) => closePeer(peerId));
    }

    function toSessionDescription(value) {
      if (!value || typeof value !== "object") return null;
      const normalized = {
        type: String(value.type || "").trim(),
        sdp: String(value.sdp || "").trim(),
      };
      if (!normalized.type || !normalized.sdp) return null;
      if (RTCSessionDescriptionCtor) {
        return new RTCSessionDescriptionCtor(normalized);
      }
      return normalized;
    }

    function toIceCandidate(value) {
      if (!value || typeof value !== "object") return null;
      const candidate = {
        candidate: String(value.candidate || "").trim(),
        sdpMid:
          value.sdpMid === undefined || value.sdpMid === null
            ? null
            : String(value.sdpMid),
        sdpMLineIndex:
          value.sdpMLineIndex === undefined || value.sdpMLineIndex === null
            ? null
            : Number(value.sdpMLineIndex),
      };
      if (!candidate.candidate) return null;
      if (RTCIceCandidateCtor) {
        return new RTCIceCandidateCtor(candidate);
      }
      return candidate;
    }

    async function sendRtcSignal(targetClientId, signalType, signalPayload) {
      if (
        !signalingTransport ||
        typeof signalingTransport.sendRtcSignal !== "function"
      ) {
        throw new Error("webrtc-signaling-unavailable");
      }
      return signalingTransport.sendRtcSignal({
        sessionCode: roomCode,
        sourceClientId: clientId,
        targetClientId: normalizeClientId(targetClientId),
        signalType: String(signalType || "").trim().toLowerCase(),
        signalPayload:
          signalPayload === undefined || signalPayload === null
            ? null
            : signalPayload,
      });
    }

    function attachDataChannel(peerId, channel) {
      const entry = peerLinks.get(peerId);
      if (!entry || !channel) return;
      entry.channel = channel;
      entry.open = channel.readyState === "open";

      channel.onopen = () => {
        entry.open = true;
        emitConnectionState("connected");
        emitTransportDiagnostic("relay-fallback", {
          active: false,
          reason: "",
          relayParticipantsCount: 0,
        });
      };

      channel.onclose = () => {
        entry.open = false;
      };

      channel.onerror = (event) => {
        logger("[SyncWebRTC] data channel error", event);
      };

      channel.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event?.data || ""));
          if (!payload || typeof payload !== "object") return;
          handlePeerDataMessage(peerId, payload);
        } catch (_) {}
      };
    }

    async function createOfferForPeer(peerId) {
      const entry = peerLinks.get(peerId);
      if (!entry || !entry.pc) return;
      try {
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        await sendRtcSignal(peerId, "offer", {
          type: offer.type,
          sdp: offer.sdp,
        });
      } catch (error) {
        logger("[SyncWebRTC] create offer failed", error);
      }
    }

    function ensurePeer(peerClientId, initiator = false) {
      const peerId = normalizeClientId(peerClientId);
      if (!peerId || peerId === clientId) return null;
      const existing = peerLinks.get(peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnectionCtor(rtcConfiguration);
      const entry = {
        peerId,
        pc,
        channel: null,
        open: false,
        initiator: initiator === true,
      };
      peerLinks.set(peerId, entry);

      pc.onicecandidate = (event) => {
        if (!event || !event.candidate) return;
        const candidatePayload =
          typeof event.candidate.toJSON === "function"
            ? event.candidate.toJSON()
            : {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
              };
        void sendRtcSignal(peerId, "ice-candidate", candidatePayload).catch(
          (error) => {
            logger("[SyncWebRTC] send candidate failed", error);
          },
        );
      };

      pc.onconnectionstatechange = () => {
        const state = String(pc.connectionState || "").trim().toLowerCase();
        if (state === "failed" || state === "disconnected") {
          emitConnectionState("reconnecting");
          emitTransportDiagnostic("relay-fallback", {
            active: true,
            reason: "peer-failed",
            relayParticipantsCount:
              role === "host" ? Math.max(0, Number(lastMeshFallbackCount || 0) || 0) : 1,
          });
          closePeer(peerId);
          if (role === "host") {
            void ensurePeer(peerId, true);
          } else if (role === "participant" && peerId === hostClientId) {
            void sendRtcSignal(peerId, "peer-reset", {}).catch(() => {});
          }
        }
      };

      pc.ondatachannel = (event) => {
        attachDataChannel(peerId, event?.channel || null);
      };

      if (entry.initiator) {
        const channel = pc.createDataChannel("posechrono-sync-control", {
          ordered: true,
        });
        attachDataChannel(peerId, channel);
        void createOfferForPeer(peerId);
      }

      return entry;
    }

    async function handleRtcSignal(eventPayload) {
      const targetClientId = normalizeClientId(eventPayload?.targetClientId);
      if (targetClientId && targetClientId !== clientId) return;

      const sourceClientId = normalizeClientId(eventPayload?.sourceClientId);
      if (!sourceClientId || sourceClientId === clientId) return;

      const signalType = String(eventPayload?.signalType || "")
        .trim()
        .toLowerCase();
      const signalPayload =
        eventPayload?.signalPayload && typeof eventPayload.signalPayload === "object"
          ? eventPayload.signalPayload
          : null;

      if (!signalType) return;

      if (signalType === "peer-reset") {
        closePeer(sourceClientId);
        if (role === "host") {
          ensurePeer(sourceClientId, true);
        }
        return;
      }

      if (signalType === "offer") {
        if (role === "host") return;
        const entry = ensurePeer(sourceClientId, false);
        if (!entry || !entry.pc) return;
        const remote = toSessionDescription(signalPayload);
        if (!remote) return;
        await entry.pc.setRemoteDescription(remote);
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        await sendRtcSignal(sourceClientId, "answer", {
          type: answer.type,
          sdp: answer.sdp,
        });
        return;
      }

      if (signalType === "answer") {
        const entry = peerLinks.get(sourceClientId);
        if (!entry || !entry.pc) return;
        const remote = toSessionDescription(signalPayload);
        if (!remote) return;
        await entry.pc.setRemoteDescription(remote);
        return;
      }

      if (signalType === "ice-candidate") {
        const entry = ensurePeer(
          sourceClientId,
          role === "host",
        );
        if (!entry || !entry.pc) return;
        const candidate = toIceCandidate(signalPayload);
        if (!candidate) return;
        try {
          await entry.pc.addIceCandidate(candidate);
        } catch (_) {}
      }
    }

    function syncPeersFromSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object") return;
      const participantIds = Array.isArray(snapshot.participantIds)
        ? snapshot.participantIds
            .map((id) => normalizeClientId(id))
            .filter((id) => !!id)
        : [];
      const nextHostId = normalizeClientId(snapshot.hostClientId || hostClientId);
      if (nextHostId) {
        hostClientId = nextHostId;
      }

      if (role === "host") {
        const desiredOrdered = participantIds.filter(
          (id) => id && id !== hostClientId,
        );
        const limitedDesired = new Set(desiredOrdered.slice(0, maxMeshPeers));
        const skippedPeers = desiredOrdered.slice(maxMeshPeers);
        const skippedCount = skippedPeers.length;
        if (skippedPeers.length > 0) {
          logger(
            `[SyncWebRTC] mesh peer limit reached (${maxMeshPeers}), fallback relay for: ${skippedPeers.join(", ")}`,
          );
        }
        if (skippedCount !== lastMeshFallbackCount) {
          lastMeshFallbackCount = skippedCount;
          emitTransportDiagnostic("relay-fallback", {
            active: skippedCount > 0,
            reason: skippedCount > 0 ? "mesh-limit" : "",
            meshLimit: maxMeshPeers,
            relayParticipantsCount: skippedCount,
            relayParticipantIds: skippedPeers,
          });
        }
        Array.from(peerLinks.keys()).forEach((peerId) => {
          if (!limitedDesired.has(peerId)) {
            closePeer(peerId);
          }
        });
        limitedDesired.forEach((peerId) => {
          if (!peerLinks.has(peerId)) {
            ensurePeer(peerId, true);
          }
        });
        return;
      }

      if (role === "participant") {
        const targetHostId = hostClientId && hostClientId !== clientId
          ? hostClientId
          : "";
        Array.from(peerLinks.keys()).forEach((peerId) => {
          if (!targetHostId || peerId !== targetHostId) {
            closePeer(peerId);
          }
        });
        if (targetHostId && !peerLinks.has(targetHostId)) {
          ensurePeer(targetHostId, false);
        }
      }
    }

    function bindRoomContext(snapshot, nextRole, requestPayload = {}) {
      role = nextRole === "host" ? "host" : "participant";
      roomCode = normalizeSessionCode(snapshot?.sessionCode || roomCode);
      hostClientId = normalizeClientId(snapshot?.hostClientId || hostClientId);
      lastRoomSnapshot =
        snapshot && typeof snapshot === "object" ? { ...snapshot } : null;
      if (role === "host") {
        clientId = normalizeClientId(requestPayload.hostClientId || hostClientId);
      } else {
        clientId = normalizeClientId(requestPayload.clientId || clientId);
      }
      syncPeersFromSnapshot(snapshot);
    }

    function clearRoomContext() {
      roomCode = "";
      role = "none";
      hostClientId = "";
      lastRoomSnapshot = null;
      lastMeshFallbackCount = 0;
      closeAllPeers();
      clearPendingP2PRequests("webrtc-not-ready");
      clearLatencySamples();
    }

    function onSignalingEvent(sessionCode, eventPayload) {
      if (!eventPayload || typeof eventPayload !== "object") return;
      const code = normalizeSessionCode(sessionCode);
      if (!code) return;

      if (eventPayload.type === "rtc-signal") {
        void handleRtcSignal(eventPayload).catch((error) => {
          logger("[SyncWebRTC] rtc signal handling failed", error);
        });
        return;
      }

      if (eventPayload.type === "room-updated" && eventPayload.snapshot) {
        if (code === roomCode) {
          lastRoomSnapshot = { ...eventPayload.snapshot };
          syncPeersFromSnapshot(eventPayload.snapshot);
        }
      }

      dispatchRoomEvent(code, eventPayload);
    }

    function subscribe(sessionCode, handler) {
      if (typeof handler !== "function") return () => {};
      const code = normalizeSessionCode(sessionCode);
      if (!code) return () => {};

      if (!roomBindings.has(code)) {
        const handlers = new Set();
        const unsubscribe = signalingTransport.subscribe(
          code,
          (eventPayload) => onSignalingEvent(code, eventPayload),
        );
        roomBindings.set(code, {
          handlers,
          unsubscribe:
            typeof unsubscribe === "function" ? unsubscribe : () => {},
        });
      }

      const entry = roomBindings.get(code);
      entry.handlers.add(handler);

      return () => {
        const active = roomBindings.get(code);
        if (!active) return;
        active.handlers.delete(handler);
        if (active.handlers.size <= 0) {
          try {
            active.unsubscribe();
          } catch (_) {}
          roomBindings.delete(code);
        }
      };
    }

    function broadcastStateToPeers(statePayload) {
      const payload = JSON.stringify({
        kind: "session-state-updated",
        sessionCode: roomCode,
        sourceClientId: clientId,
        state: statePayload,
        ts: now(),
      });

      let sent = 0;
      peerLinks.forEach((entry) => {
        if (!entry || !entry.channel) return;
        if (entry.channel.readyState !== "open") return;
        try {
          entry.channel.send(payload);
          sent += 1;
        } catch (_) {}
      });
      return sent;
    }

    if (
      signalingTransport &&
      typeof signalingTransport.onConnectionStateChange === "function"
    ) {
      signalingTransport.onConnectionStateChange((nextState) => {
        const normalized = String(nextState || "disconnected")
          .trim()
          .toLowerCase();
        if (!normalized) return;
        if (explicitDisconnect && normalized !== "disconnected") return;
        if (normalized === "connected" && hasOpenPeerChannel()) {
          emitConnectionState("connected");
          return;
        }
        emitConnectionState(normalized);
      });
    }

    function onConnectionStateChange(listener) {
      if (typeof listener !== "function") return () => {};
      connectionStateListeners.add(listener);
      return () => {
        connectionStateListeners.delete(listener);
      };
    }

    async function createRoom(payload) {
      explicitDisconnect = false;
      clearPendingP2PRequests("webrtc-not-ready");
      clearLocalMediaFiles();
      const snapshot = await signalingTransport.createRoom(payload || {});
      bindRoomContext(snapshot, "host", payload || {});
      return snapshot;
    }

    async function joinRoom(payload) {
      explicitDisconnect = false;
      clearPendingP2PRequests("webrtc-not-ready");
      const snapshot = await signalingTransport.joinRoom(payload || {});
      bindRoomContext(snapshot, "participant", payload || {});
      return snapshot;
    }

    async function leaveRoom(payload) {
      try {
        return await signalingTransport.leaveRoom(payload || {});
      } finally {
        const normalizedPayloadCode = normalizeSessionCode(payload?.sessionCode);
        const normalizedPayloadClientId = normalizeClientId(payload?.clientId);
        if (
          normalizedPayloadCode &&
          normalizedPayloadCode === roomCode &&
          normalizedPayloadClientId &&
          normalizedPayloadClientId === clientId
        ) {
          clearRoomContext();
          clearLocalMediaFiles();
        }
      }
    }

    function disconnect() {
      explicitDisconnect = true;
      clearRoomContext();
      clearLocalMediaFiles();
      roomBindings.forEach((entry) => {
        try {
          entry.unsubscribe();
        } catch (_) {}
      });
      roomBindings.clear();
      if (
        signalingTransport &&
        typeof signalingTransport.disconnect === "function"
      ) {
        signalingTransport.disconnect();
      }
      emitConnectionState("disconnected");
    }

    return {
      createRoom,
      joinRoom,
      leaveRoom,
      async updateRoom(payload) {
        const snapshot = await signalingTransport.updateRoom(payload || {});
        if (snapshot && typeof snapshot === "object") {
          lastRoomSnapshot = { ...snapshot };
          if (normalizeSessionCode(snapshot.sessionCode) === roomCode) {
            syncPeersFromSnapshot(snapshot);
          }
        }
        return snapshot;
      },
      async updateSessionState(payload) {
        const result = await signalingTransport.updateSessionState(payload || {});
        const sourceClientId = normalizeClientId(payload?.sourceClientId);
        if (
          role === "host" &&
          sourceClientId &&
          sourceClientId === hostClientId
        ) {
          broadcastStateToPeers(result);
        }
        return result;
      },
      updateParticipantState(payload) {
        return signalingTransport.updateParticipantState(payload || {});
      },
      uploadSessionPack(payload) {
        return signalingTransport.uploadSessionPack(payload || {});
      },
      getSessionPack(payload) {
        return signalingTransport.getSessionPack(payload || {});
      },
      resetSessionMediaPack(payload) {
        if (!mediaTransferEnabled) {
          return Promise.reject(new Error("media-transfer-disabled"));
        }
        if (role === "host") {
          clearLocalMediaFiles();
        }
        return signalingTransport.resetSessionMediaPack(payload || {});
      },
      uploadSessionMediaFile(payload) {
        if (!mediaTransferEnabled) {
          return Promise.reject(new Error("media-transfer-disabled"));
        }
        const safePayload = payload || {};
        if (role === "host" && safePayload.file && typeof safePayload.file === "object") {
          try {
            storeLocalMediaFile(safePayload.file);
          } catch (error) {
            logger("[SyncWebRTC] local media mirror failed", error);
          }
        }
        if (mirrorMediaToRelay === false) {
          logger("[SyncWebRTC] mirrorMediaToRelay=false ignored in current build (relay metadata required)");
        }
        return signalingTransport.uploadSessionMediaFile(safePayload);
      },
      async getSessionMediaManifest(payload) {
        if (!mediaTransferEnabled) {
          throw new Error("media-transfer-disabled");
        }
        const safePayload = payload || {};
        if (role === "participant" && getOpenHostChannel()) {
          try {
            return await requestMediaManifestFromHost();
          } catch (error) {
            logger("[SyncWebRTC] P2P media manifest failed, fallback relay", error);
          }
        }
        return signalingTransport.getSessionMediaManifest(safePayload);
      },
      async getSessionMediaFile(payload) {
        if (!mediaTransferEnabled) {
          throw new Error("media-transfer-disabled");
        }
        const safePayload = payload || {};
        if (role === "participant" && getOpenHostChannel()) {
          try {
            return await requestMediaFileFromHost(safePayload.identity);
          } catch (error) {
            logger("[SyncWebRTC] P2P media file failed, fallback relay", error);
          }
        }
        return signalingTransport.getSessionMediaFile(safePayload);
      },
      sendRtcSignal(payload) {
        return sendRtcSignal(
          payload?.targetClientId,
          payload?.signalType,
          payload?.signalPayload,
        );
      },
      async getRoomSnapshot(sessionCode) {
        const snapshot = await signalingTransport.getRoomSnapshot(sessionCode);
        if (snapshot && typeof snapshot === "object") {
          lastRoomSnapshot = { ...snapshot };
          if (normalizeSessionCode(snapshot.sessionCode) === roomCode) {
            syncPeersFromSnapshot(snapshot);
          }
        }
        return snapshot;
      },
      subscribe,
      disconnect,
      onConnectionStateChange,
      getConnectionState() {
        return connectionState;
      },
    };
  }

  sharedRoot.createSyncTransportWebRTC = createSyncTransportWebRTC;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
