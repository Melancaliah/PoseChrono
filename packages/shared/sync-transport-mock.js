(function initPoseChronoSharedSyncTransportMock(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createSyncTransportMock(options = {}) {
    const busKey = String(
      options.busKey || "__POSECHRONO_SYNC_MOCK_TRANSPORT_BUS__",
    );
    const now =
      typeof options.now === "function"
        ? options.now
        : () => Date.now();
    const maxParticipants = Math.max(
      2,
      Number(options.maxParticipants || 32) || 32,
    );
    const maxSessionNameLength = Math.max(
      16,
      Number(options.maxSessionNameLength || 80) || 80,
    );
    const maxPasswordLength = Math.max(
      8,
      Number(options.maxPasswordLength || 128) || 128,
    );
    const maxClientIdLength = Math.max(
      8,
      Number(options.maxClientIdLength || 64) || 64,
    );
    const maxStateReasonLength = Math.max(
      16,
      Number(options.maxStateReasonLength || 96) || 96,
    );
    const maxStateBytes = Math.max(
      4096,
      Number(options.maxStateBytes || 900000) || 900000,
    );
    const maxCustomQueueSteps = Math.max(
      1,
      Number(options.maxCustomQueueSteps || 600) || 600,
    );
    const maxMediaOrderKeys = Math.max(
      1,
      Number(options.maxMediaOrderKeys || 12000) || 12000,
    );
    const maxSessionPackBytes = Math.max(
      4096,
      Number(options.maxSessionPackBytes || 2 * 1024 * 1024) || 2 * 1024 * 1024,
    );
    const maxSessionMediaFiles = Math.max(
      1,
      Number(options.maxSessionMediaFiles || 300) || 300,
    );
    const maxSessionMediaFileBytes = Math.max(
      1024,
      Number(options.maxSessionMediaFileBytes || 2 * 1024 * 1024) || 2 * 1024 * 1024,
    );
    const maxSessionMediaTotalBytes = Math.max(
      maxSessionMediaFileBytes,
      Number(options.maxSessionMediaTotalBytes || 48 * 1024 * 1024) || 48 * 1024 * 1024,
    );
    const maxSessionSeconds = Math.max(
      60,
      Number(options.maxSessionSeconds || 31_536_000) || 31_536_000,
    );
    const maxTimestampMs = Math.max(
      0,
      Number(options.maxTimestampMs || 4_102_444_800_000) || 4_102_444_800_000,
    );
    const maxIndexValue = Math.max(
      1,
      Number(options.maxIndexValue || 200000) || 200000,
    );
    const sessionModeValues = new Set([
      "classique",
      "classic",
      "custom",
      "relax",
      "memory",
    ]);
    const memoryTypeValues = new Set(["flash", "progressive"]);
    const sessionPackSchema = "posechrono-session-pack";
    const sessionPackVersion = 1;
    const sessionMediaAllowedExtensions = new Set([
      "jpg",
      "jpeg",
      "png",
      "webp",
      "mp4",
      "webm",
    ]);
    const sessionMediaMimeByExt = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      mp4: "video/mp4",
      webm: "video/webm",
    };

    function getGlobalCarrier() {
      if (typeof globalThis !== "undefined") return globalThis;
      if (typeof window !== "undefined") return window;
      return globalObj;
    }

    function ensureBus() {
      const carrier = getGlobalCarrier();
      const existing = carrier[busKey];
      if (
        existing &&
        existing.rooms instanceof Map &&
        existing.subscriptions instanceof Map
      ) {
        return existing;
      }
      const created = {
        rooms: new Map(),
        subscriptions: new Map(),
      };
      carrier[busKey] = created;
      return created;
    }

    function normalizeSessionCode(input) {
      const normalized = String(input || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
        return "";
      }
      return normalized;
    }

    function normalizeControlMode(input) {
      return String(input || "").trim() === "shared-pause"
        ? "shared-pause"
        : "host-only";
    }

    function isPlainObject(value) {
      return !!value && typeof value === "object" && !Array.isArray(value);
    }

    function sanitizeText(value, maxLength, fallback = "") {
      const text = String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim();
      if (!text) return String(fallback || "").trim();
      return text.slice(0, Math.max(1, Number(maxLength) || 1));
    }

    function normalizeClientId(input, errorCode) {
      const id = String(input || "").trim();
      const safeMax = Math.max(8, Number(maxClientIdLength) || 64);
      const re = new RegExp(`^[A-Za-z0-9_-]{1,${safeMax}}$`);
      if (!re.test(id)) {
        throw new Error(String(errorCode || "invalid-client-id"));
      }
      return id;
    }

    function normalizeSessionName(input) {
      return sanitizeText(input, maxSessionNameLength, "PoseChrono Session");
    }

    function normalizePassword(input) {
      const value = String(input || "").trim();
      if (value.length > maxPasswordLength) {
        throw new Error("invalid-password");
      }
      return value;
    }

    function toBoundedInt(value, min, max, errorCode) {
      const raw = Number(value);
      if (!Number.isFinite(raw)) {
        throw new Error(String(errorCode || "invalid-session-state"));
      }
      const next = Math.floor(raw);
      if (next < min || next > max) {
        throw new Error(String(errorCode || "invalid-session-state"));
      }
      return next;
    }

    function normalizeParticipantName(input, fallback = "") {
      const value = sanitizeText(input, 32, "");
      return value || String(fallback || "").trim();
    }

    function normalizeParticipantSyncState(input) {
      const value = String(input || "").trim().toLowerCase();
      if (
        value === "ready" ||
        value === "missing" ||
        value === "connecting" ||
        value === "downloading"
      ) {
        return value;
      }
      return "missing";
    }

    function computePackHash(text) {
      const value = String(text || "");
      let h1 = 2166136261;
      let h2 = 5381;
      for (let i = 0; i < value.length; i += 1) {
        const code = value.charCodeAt(i);
        h1 ^= code;
        h1 = Math.imul(h1, 16777619);
        h2 = ((h2 << 5) + h2 + code) >>> 0;
      }
      const a = (h1 >>> 0).toString(16).padStart(8, "0");
      const b = (h2 >>> 0).toString(16).padStart(8, "0");
      return `${a}${b}`;
    }

    function normalizeSessionMediaIdentity(input) {
      const value = String(input || "").trim();
      if (!value || value.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(value)) {
        throw new Error("invalid-session-media");
      }
      return value;
    }

    function normalizeSessionMediaExtension(input) {
      const ext = String(input || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 12);
      if (!sessionMediaAllowedExtensions.has(ext)) {
        throw new Error("session-media-unsupported-type");
      }
      return ext;
    }

    function normalizeSessionMediaMime(ext, inputMime) {
      const mime = String(inputMime || "")
        .trim()
        .toLowerCase()
        .slice(0, 80);
      const expectedMime = sessionMediaMimeByExt[ext] || "";
      if (!mime) return expectedMime;
      if (
        mime !== expectedMime &&
        !(
          (ext === "jpg" || ext === "jpeg") &&
          (mime === "image/jpg" || mime === "image/jpeg")
        )
      ) {
        throw new Error("session-media-unsupported-type");
      }
      return expectedMime || mime;
    }

    function normalizeSessionMediaName(input) {
      return sanitizeText(input, 160, "unknown");
    }

    function normalizeSessionMediaFilePayload(input) {
      if (!isPlainObject(input)) {
        throw new Error("invalid-session-media");
      }

      const identity = normalizeSessionMediaIdentity(input.identity);
      const ext = normalizeSessionMediaExtension(input.ext);
      const mime = normalizeSessionMediaMime(ext, input.mime);
      const name = normalizeSessionMediaName(input.name);
      const size = toBoundedInt(
        input.size,
        1,
        maxSessionMediaTotalBytes,
        "invalid-session-media",
      );
      if (size > maxSessionMediaFileBytes) {
        throw new Error("session-media-too-large");
      }
      const dataBase64 = String(input.dataBase64 || "")
        .replace(/\s+/g, "")
        .trim();
      if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
        throw new Error("invalid-session-media");
      }
      let decodedLength = 0;
      if (typeof atob === "function") {
        const decoded = atob(dataBase64);
        decodedLength = decoded ? decoded.length : 0;
      } else if (
        typeof globalObj.Buffer === "function" &&
        typeof globalObj.Buffer.from === "function"
      ) {
        const decodedBuffer = globalObj.Buffer.from(dataBase64, "base64");
        decodedLength = decodedBuffer ? decodedBuffer.length : 0;
      } else {
        const normalizedLength = dataBase64.replace(/=+$/g, "").length;
        decodedLength = Math.floor((normalizedLength * 3) / 4);
      }
      if (decodedLength !== size) {
        throw new Error("invalid-session-media");
      }
      const computedSha256 = computePackHash(dataBase64);
      const declaredSha256 = String(input.sha256 || "")
        .trim()
        .toLowerCase();
      if (
        declaredSha256 &&
        (!/^[a-f0-9]{8,64}$/.test(declaredSha256) ||
          (declaredSha256.length <= 16 && declaredSha256 !== computedSha256))
      ) {
        throw new Error("invalid-session-media");
      }

      return {
        identity,
        name,
        ext,
        mime,
        size,
        sha256: declaredSha256 || computedSha256,
        dataBase64,
      };
    }

    function makeSnapshot(room) {
      if (!room) return null;
      const participantIds = Array.from(room.participantIds);
      const participantProfiles = {};
      const participantSyncStates = {};
      if (room.participantProfiles && typeof room.participantProfiles.forEach === "function") {
        room.participantProfiles.forEach((name, clientId) => {
          const normalizedClientId = String(clientId || "").trim();
          if (!normalizedClientId) return;
          participantProfiles[normalizedClientId] = normalizeParticipantName(name);
        });
      }
      if (
        room.participantSyncStates &&
        typeof room.participantSyncStates.forEach === "function"
      ) {
        room.participantSyncStates.forEach((syncState, clientId) => {
          const normalizedClientId = String(clientId || "").trim();
          if (!normalizedClientId) return;
          participantSyncStates[normalizedClientId] =
            normalizeParticipantSyncState(syncState);
        });
      }
      return {
        sessionCode: room.sessionCode,
        sessionName: room.sessionName,
        controlMode: room.controlMode,
        hostClientId: room.hostClientId,
        participantIds: participantIds.slice(),
        participantProfiles,
        participantSyncStates,
        participantsCount: participantIds.length,
        sessionState:
          room.sessionState && typeof room.sessionState === "object"
            ? { ...room.sessionState }
            : null,
        sessionStateRevision: Math.max(
          0,
          Number(room.sessionStateRevision || 0) || 0,
        ),
        sessionStateUpdatedAt: Math.max(
          0,
          Number(room.sessionStateUpdatedAt || 0) || 0,
        ),
        sessionPackMeta:
          room.sessionPack && typeof room.sessionPack === "object"
            ? {
                hash: String(room.sessionPackHash || "").trim(),
                size: Math.max(0, Number(room.sessionPackSize || 0) || 0),
                updatedAt: Math.max(0, Number(room.sessionPackUpdatedAt || 0) || 0),
                uploadedBy: String(room.sessionPackUploadedBy || "").trim(),
                imagesCount: Math.max(
                  0,
                  Number(room.sessionPack?.session?.imagesCount || 0) || 0,
                ),
                mediaRefsCount: Array.isArray(room.sessionPack?.mediaRefs)
                  ? room.sessionPack.mediaRefs.length
                  : 0,
              }
            : null,
        sessionMediaMeta:
          room.sessionMediaFiles instanceof Map
            ? {
                filesCount: room.sessionMediaFiles.size,
                totalBytes: Math.max(0, Number(room.sessionMediaTotalBytes || 0) || 0),
                updatedAt: Math.max(0, Number(room.sessionMediaUpdatedAt || 0) || 0),
                uploadedBy: String(room.sessionMediaUploadedBy || "").trim(),
              }
            : null,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
      };
    }

    function normalizeSessionStatePayload(input) {
      if (!isPlainObject(input)) {
        if (input === null || input === undefined) return {};
        throw new Error("invalid-session-state");
      }

      const serializedLength = JSON.stringify(input).length;
      if (serializedLength > maxStateBytes) {
        throw new Error("session-state-too-large");
      }

      const out = {};
      const keys = Object.keys(input);
      if (keys.length > 64) {
        throw new Error("invalid-session-state");
      }

      function expectBoolean(value) {
        if (typeof value !== "boolean") throw new Error("invalid-session-state");
        return value;
      }

      function normalizeMode(value) {
        const mode = String(value || "")
          .trim()
          .toLowerCase();
        if (!sessionModeValues.has(mode)) throw new Error("invalid-session-state");
        return mode === "classic" ? "classique" : mode;
      }

      function normalizeMemoryType(value) {
        const memoryType = String(value || "")
          .trim()
          .toLowerCase();
        if (!memoryTypeValues.has(memoryType)) {
          throw new Error("invalid-session-state");
        }
        return memoryType;
      }

      function normalizeMediaOrderKeys(value) {
        if (!Array.isArray(value)) throw new Error("invalid-session-state");
        if (value.length > maxMediaOrderKeys) {
          throw new Error("invalid-session-state");
        }
        return value.map((entry) => {
          const key = String(entry || "").trim();
          if (!key || key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
            throw new Error("invalid-session-state");
          }
          return key;
        });
      }

      function normalizeCustomQueueStep(step, index) {
        if (!isPlainObject(step)) throw new Error("invalid-session-state");
        const type = String(step.type || "").trim().toLowerCase();
        if (type !== "pause" && type !== "pose") {
          throw new Error("invalid-session-state");
        }
        const duration = toBoundedInt(
          step.duration,
          1,
          86400,
          "invalid-session-state",
        );
        const count =
          type === "pause"
            ? 1
            : toBoundedInt(step.count, 1, 10000, "invalid-session-state");
        const normalizedStep = {
          type,
          duration,
          count,
        };
        if (step.id !== undefined) {
          normalizedStep.id = toBoundedInt(
            step.id,
            0,
            Number.MAX_SAFE_INTEGER,
            "invalid-session-state",
          );
        } else {
          normalizedStep.id = now() + index;
        }
        return normalizedStep;
      }

      function normalizeCustomQueue(value) {
        if (!Array.isArray(value)) throw new Error("invalid-session-state");
        if (value.length > maxCustomQueueSteps) {
          throw new Error("invalid-session-state");
        }
        return value.map((step, index) => normalizeCustomQueueStep(step, index));
      }

      keys.forEach((key) => {
        if (!key) return;
        const value = input[key];
        if (value === undefined || typeof value === "function") return;

        switch (key) {
          case "reason":
            out.reason = sanitizeText(value, maxStateReasonLength, "");
            return;
          case "mode":
            out.mode = normalizeMode(value);
            return;
          case "memoryType":
            out.memoryType = normalizeMemoryType(value);
            return;
          case "requestType": {
            const requestType = String(value || "").trim().toLowerCase();
            if (requestType !== "pause" && requestType !== "play") {
              throw new Error("invalid-session-state");
            }
            out.requestType = requestType;
            return;
          }
          case "sessionActive":
          case "reviewActive":
          case "isPlaying":
          case "memoryNoPressure":
          case "memoryHidden":
          case "mediaOrderTruncated":
          case "mediaOrderSkipped":
            out[key] = expectBoolean(value);
            return;
          case "selectedDuration":
            out.selectedDuration = toBoundedInt(
              value,
              1,
              maxSessionSeconds,
              "invalid-session-state",
            );
            return;
          case "timeRemaining":
            out.timeRemaining = toBoundedInt(
              value,
              0,
              maxSessionSeconds,
              "invalid-session-state",
            );
            return;
          case "memoryDuration":
          case "memoryDrawingTime":
          case "totalSessionTime":
            out[key] = toBoundedInt(
              value,
              0,
              maxSessionSeconds,
              "invalid-session-state",
            );
            return;
          case "currentIndex":
          case "currentStepIndex":
            out[key] = toBoundedInt(
              value,
              0,
              maxIndexValue,
              "invalid-session-state",
            );
            return;
          case "currentPoseInStep":
          case "memoryPosesCount":
            out[key] = toBoundedInt(value, 1, 10000, "invalid-session-state");
            return;
          case "imagesCount":
          case "customQueueLength":
          case "mediaOrderCount":
            out[key] = toBoundedInt(
              value,
              0,
              maxMediaOrderKeys,
              "invalid-session-state",
            );
            return;
          case "ts":
          case "updatedAt":
            out[key] = toBoundedInt(value, 0, maxTimestampMs, "invalid-session-state");
            return;
          case "revision":
            out.revision = toBoundedInt(
              value,
              0,
              maxIndexValue,
              "invalid-session-state",
            );
            return;
          case "customQueue":
            out.customQueue = normalizeCustomQueue(value);
            out.customQueueLength = out.customQueue.length;
            return;
          case "mediaOrderKeys":
            out.mediaOrderKeys = normalizeMediaOrderKeys(value);
            out.mediaOrderCount = out.mediaOrderKeys.length;
            return;
          default:
            return;
        }
      });

      return out;
    }

    function normalizeSessionPackPayload(input) {
      if (!isPlainObject(input)) {
        throw new Error("invalid-session-pack");
      }

      const serializedLength = JSON.stringify(input).length;
      if (serializedLength > maxSessionPackBytes) {
        throw new Error("session-pack-too-large");
      }

      const schema = String(input.schema || "").trim();
      const version = Math.floor(Number(input.version || 0));
      if (schema !== sessionPackSchema || version !== sessionPackVersion) {
        throw new Error("invalid-session-pack");
      }

      const session = isPlainObject(input.session) ? input.session : null;
      if (!session) throw new Error("invalid-session-pack");
      const mode = String(session.mode || "")
        .trim()
        .toLowerCase();
      if (!sessionModeValues.has(mode)) throw new Error("invalid-session-pack");

      const out = {
        schema: sessionPackSchema,
        version: sessionPackVersion,
        createdAt: sanitizeText(input.createdAt, 48, ""),
        source: {
          runtime: sanitizeText(input?.source?.runtime, 24, ""),
          language: sanitizeText(input?.source?.language, 24, ""),
        },
        session: {
          mode: mode === "classic" ? "classique" : mode,
          selectedDuration: toBoundedInt(
            session.selectedDuration,
            1,
            maxSessionSeconds,
            "invalid-session-pack",
          ),
          timeRemaining: toBoundedInt(
            session.timeRemaining,
            0,
            maxSessionSeconds,
            "invalid-session-pack",
          ),
          memoryType: (() => {
            const value = String(session.memoryType || "")
              .trim()
              .toLowerCase();
            if (!memoryTypeValues.has(value)) throw new Error("invalid-session-pack");
            return value;
          })(),
          memoryDuration: toBoundedInt(
            session.memoryDuration,
            0,
            maxSessionSeconds,
            "invalid-session-pack",
          ),
          memoryPosesCount: toBoundedInt(
            session.memoryPosesCount,
            1,
            10000,
            "invalid-session-pack",
          ),
          memoryDrawingTime: toBoundedInt(
            session.memoryDrawingTime,
            0,
            maxSessionSeconds,
            "invalid-session-pack",
          ),
          memoryNoPressure: !!session.memoryNoPressure,
          customQueue: [],
          mediaOrderKeys: [],
          imagesCount: toBoundedInt(
            session.imagesCount,
            0,
            maxMediaOrderKeys,
            "invalid-session-pack",
          ),
        },
        mediaRefs: [],
      };

      const customQueue = Array.isArray(session.customQueue) ? session.customQueue : [];
      if (customQueue.length > maxCustomQueueSteps) {
        throw new Error("invalid-session-pack");
      }
      out.session.customQueue = customQueue.map((step, index) => {
        if (!isPlainObject(step)) throw new Error("invalid-session-pack");
        const type = String(step.type || "").trim().toLowerCase();
        if (type !== "pause" && type !== "pose") throw new Error("invalid-session-pack");
        const duration = toBoundedInt(
          step.duration,
          1,
          86400,
          "invalid-session-pack",
        );
        const count =
          type === "pause"
            ? 1
            : toBoundedInt(step.count, 1, 10000, "invalid-session-pack");
        const id =
          step.id !== undefined
            ? toBoundedInt(step.id, 0, Number.MAX_SAFE_INTEGER, "invalid-session-pack")
            : now() + index;
        return {
          type,
          duration,
          count,
          id,
        };
      });

      const mediaOrderKeys = Array.isArray(session.mediaOrderKeys)
        ? session.mediaOrderKeys
        : [];
      if (mediaOrderKeys.length > maxMediaOrderKeys) {
        throw new Error("invalid-session-pack");
      }
      out.session.mediaOrderKeys = mediaOrderKeys.map((entry) => {
        const key = String(entry || "").trim();
        if (!key || key.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(key)) {
          throw new Error("invalid-session-pack");
        }
        return key;
      });

      const mediaRefs = Array.isArray(input.mediaRefs) ? input.mediaRefs : [];
      if (mediaRefs.length > maxMediaOrderKeys) {
        throw new Error("invalid-session-pack");
      }
      out.mediaRefs = mediaRefs.map((item) => {
        if (!isPlainObject(item)) throw new Error("invalid-session-pack");
        const identity = String(item.identity || "").trim();
        if (!identity || identity.length > 128 || !/^[A-Za-z0-9:_-]+$/.test(identity)) {
          throw new Error("invalid-session-pack");
        }
        const name = sanitizeText(item.name, 160, "unknown");
        const ext = String(item.ext || "")
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .slice(0, 12);
        const index = toBoundedInt(
          item.index,
          0,
          maxMediaOrderKeys,
          "invalid-session-pack",
        );
        return {
          identity,
          index,
          name,
          ext,
        };
      });

      return out;
    }

  function withPreservedMediaOrder(previousState, nextState) {
    const previous =
      previousState && typeof previousState === "object" ? previousState : null;
    const next = nextState && typeof nextState === "object" ? nextState : {};
    if (Object.prototype.hasOwnProperty.call(next, "mediaOrderKeys")) {
      return next;
    }

    if (Array.isArray(previous?.mediaOrderKeys) && previous.mediaOrderKeys.length > 0) {
      next.mediaOrderKeys = previous.mediaOrderKeys.slice();
    }
    return next;
  }

    function normalizeSharedPlaybackRequestPayload(input) {
      const requestType =
        String(input?.requestType || "").trim() === "play" ? "play" : "pause";
      return {
        requestType,
        isPlaying: requestType === "play",
        reason: String(
          input?.reason ||
            (requestType === "play"
              ? "shared-play-request"
              : "shared-pause-request"),
        ),
        ts: Math.max(0, Number(input?.ts || now()) || now()),
      };
    }

    function emitToSession(sessionCode, payload) {
      const bus = ensureBus();
      const code = normalizeSessionCode(sessionCode);
      if (!code) return;
      const subscriptions = bus.subscriptions.get(code);
      if (!subscriptions || subscriptions.size === 0) return;
      subscriptions.forEach((handler) => {
        try {
          handler(payload);
        } catch (_) {}
      });
    }

    function assertRoomAccess(room, password) {
      if (!room) {
        throw new Error("session-not-found");
      }
      const normalizedPassword = normalizePassword(password);
      if (room.password && room.password !== normalizedPassword) {
        throw new Error("invalid-password");
      }
    }

    function createRoom(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      if (!sessionCode) {
        throw new Error("invalid-session-code");
      }
      if (bus.rooms.has(sessionCode)) {
        throw new Error("session-already-exists");
      }

      const hostClientId = normalizeClientId(
        input.hostClientId,
        "invalid-host-client-id",
      );

      const sessionName = normalizeSessionName(input.sessionName);
      const controlMode = normalizeControlMode(input.controlMode);
      const room = {
        sessionCode,
        sessionName,
        controlMode,
        hostClientId,
        password: normalizePassword(input.password),
        participantIds: new Set([hostClientId]),
        participantProfiles: new Map([
          [hostClientId, normalizeParticipantName(input.hostDisplayName, "Hôte")],
        ]),
        participantSyncStates: new Map([[hostClientId, "ready"]]),
        sessionState: null,
        sessionStateRevision: 0,
        sessionStateUpdatedAt: 0,
        sessionPack: null,
        sessionPackHash: "",
        sessionPackSize: 0,
        sessionPackUpdatedAt: 0,
        sessionPackUploadedBy: "",
        sessionMediaFiles: new Map(),
        sessionMediaUpdatedAt: 0,
        sessionMediaUploadedBy: "",
        sessionMediaTotalBytes: 0,
        createdAt: now(),
        updatedAt: now(),
      };

      bus.rooms.set(sessionCode, room);
      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "host-created",
        snapshot,
      });
      return snapshot;
    }

    function joinRoom(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      assertRoomAccess(room, input.password);

      const clientId = normalizeClientId(input.clientId, "invalid-client-id");
      if (clientId === room.hostClientId) {
        throw new Error("forbidden-host-impersonation");
      }
      if (room.participantIds.has(clientId)) {
        throw new Error("duplicate-client-id");
      }
      if (room.participantIds.size >= maxParticipants) {
        throw new Error("room-full");
      }

      room.participantIds.add(clientId);
      room.participantProfiles.set(
        clientId,
        normalizeParticipantName(input.participantName, "Invité"),
      );
      if (!(room.participantSyncStates instanceof Map)) {
        room.participantSyncStates = new Map();
      }
      room.participantSyncStates.set(clientId, "connecting");
      room.updatedAt = now();
      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "participant-joined",
        snapshot,
      });
      return snapshot;
    }

    function leaveRoom(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) return { closed: false, snapshot: null };

      const clientId = String(input.clientId || "").trim();
      room.participantIds.delete(clientId);
      room.participantProfiles.delete(clientId);
      if (room.participantSyncStates instanceof Map) {
        room.participantSyncStates.delete(clientId);
      }
      room.updatedAt = now();

      const shouldCloseRoom =
        clientId === room.hostClientId || room.participantIds.size <= 0;
      if (shouldCloseRoom) {
        const snapshot = makeSnapshot(room);
        bus.rooms.delete(sessionCode);
        emitToSession(sessionCode, {
          type: "room-closed",
          source: "host-left",
          snapshot,
        });
        bus.subscriptions.delete(sessionCode);
        return { closed: true, snapshot };
      }

      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "participant-left",
        snapshot,
      });
      return { closed: false, snapshot };
    }

    function updateRoom(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = String(input.sourceClientId || "").trim();
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (sourceClientId !== room.hostClientId) {
        throw new Error("forbidden-not-host");
      }

      const patch = input.patch && typeof input.patch === "object" ? input.patch : {};

      if (typeof patch.sessionName === "string") {
        const nextName = patch.sessionName.trim();
        if (nextName) room.sessionName = nextName;
      }
      if (typeof patch.controlMode === "string") {
        room.controlMode = normalizeControlMode(patch.controlMode);
      }

      room.updatedAt = now();
      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "room-updated",
        snapshot,
      });
      return snapshot;
    }

    function updateParticipantState(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      const syncState = normalizeParticipantSyncState(input.syncState);
      if (!(room.participantSyncStates instanceof Map)) {
        room.participantSyncStates = new Map();
      }
      room.participantSyncStates.set(sourceClientId, syncState);
      room.updatedAt = now();

      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "participant-state-updated",
        snapshot,
      });
      return snapshot;
    }

    function updateSessionState(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = String(input.sourceClientId || "").trim();
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      let payload = normalizeSessionStatePayload(input.payload || {});
      const isHostSource = sourceClientId === room.hostClientId;
      const requestType = String(payload.requestType || "").trim();
      const canSharedPlayback =
        room.controlMode === "shared-pause" &&
        !isHostSource &&
        payload &&
        (requestType === "pause" || requestType === "play") &&
        payload.isPlaying === (requestType === "play");

      if (!isHostSource && !canSharedPlayback) {
        throw new Error("forbidden-not-host");
      }

      if (canSharedPlayback) {
        payload = normalizeSharedPlaybackRequestPayload(payload);
      }

      room.sessionState = withPreservedMediaOrder(room.sessionState, {
        ...payload,
      });
      room.sessionStateRevision = (Number(room.sessionStateRevision) || 0) + 1;
      room.sessionStateUpdatedAt = now();
      room.updatedAt = room.sessionStateUpdatedAt;

      const eventState = {
        ...room.sessionState,
        revision: room.sessionStateRevision,
        updatedAt: room.sessionStateUpdatedAt,
        sourceClientId,
      };

      emitToSession(sessionCode, {
        type: "session-state-updated",
        source: "host-state-update",
        sessionCode,
        state: eventState,
      });

      return eventState;
    }

    function uploadSessionPack(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (sourceClientId !== room.hostClientId) {
        throw new Error("forbidden-not-host");
      }

      const pack = normalizeSessionPackPayload(input.pack || null);
      const serializedPack = JSON.stringify(pack);
      const packHash = computePackHash(serializedPack);
      const updatedAt = now();

      room.sessionPack = pack;
      room.sessionPackHash = packHash;
      room.sessionPackSize = serializedPack.length;
      room.sessionPackUpdatedAt = updatedAt;
      room.sessionPackUploadedBy = sourceClientId;
      room.updatedAt = updatedAt;

      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "session-pack-updated",
        sessionCode,
        snapshot,
      });
      return snapshot;
    }

    function getSessionPack(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (!room.sessionPack || typeof room.sessionPack !== "object") {
        throw new Error("session-pack-not-found");
      }

      return {
        pack: room.sessionPack,
        hash: String(room.sessionPackHash || "").trim(),
        updatedAt: Math.max(0, Number(room.sessionPackUpdatedAt || 0) || 0),
        size: Math.max(0, Number(room.sessionPackSize || 0) || 0),
      };
    }

    function resetSessionMediaPack(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (sourceClientId !== room.hostClientId) {
        throw new Error("forbidden-not-host");
      }

      room.sessionMediaFiles = new Map();
      room.sessionMediaTotalBytes = 0;
      room.sessionMediaUpdatedAt = now();
      room.sessionMediaUploadedBy = sourceClientId;
      room.updatedAt = room.sessionMediaUpdatedAt;

      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "session-media-reset",
        sessionCode,
        snapshot,
      });
      return snapshot;
    }

    function uploadSessionMediaFile(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (sourceClientId !== room.hostClientId) {
        throw new Error("forbidden-not-host");
      }

      const file = normalizeSessionMediaFilePayload(input.file || null);
      if (!(room.sessionMediaFiles instanceof Map)) {
        room.sessionMediaFiles = new Map();
      }
      const previous = room.sessionMediaFiles.get(file.identity);
      const previousSize = previous ? Math.max(0, Number(previous.size || 0) || 0) : 0;
      const nextTotal =
        Math.max(0, Number(room.sessionMediaTotalBytes || 0) || 0) - previousSize + file.size;
      if (nextTotal > maxSessionMediaTotalBytes) {
        throw new Error("session-media-too-large");
      }
      if (!previous && room.sessionMediaFiles.size >= maxSessionMediaFiles) {
        throw new Error("session-media-too-large");
      }

      const storedFile = {
        identity: file.identity,
        name: file.name,
        ext: file.ext,
        mime: file.mime,
        size: file.size,
        sha256: file.sha256,
        dataBase64: file.dataBase64,
        updatedAt: now(),
      };
      room.sessionMediaFiles.set(file.identity, storedFile);
      room.sessionMediaTotalBytes = nextTotal;
      room.sessionMediaUpdatedAt = storedFile.updatedAt;
      room.sessionMediaUploadedBy = sourceClientId;
      room.updatedAt = storedFile.updatedAt;

      const snapshot = makeSnapshot(room);
      emitToSession(sessionCode, {
        type: "room-updated",
        source: "session-media-updated",
        sessionCode,
        snapshot,
      });
      return snapshot;
    }

    function getSessionMediaManifest(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (!(room.sessionMediaFiles instanceof Map) || room.sessionMediaFiles.size <= 0) {
        throw new Error("session-media-not-found");
      }

      const files = Array.from(room.sessionMediaFiles.values()).map((entry) => ({
        identity: String(entry.identity || "").trim(),
        name: sanitizeText(entry.name, 160, "unknown"),
        ext: String(entry.ext || "").trim().toLowerCase(),
        mime: String(entry.mime || "").trim().toLowerCase(),
        size: Math.max(0, Number(entry.size || 0) || 0),
        sha256: String(entry.sha256 || "").trim().toLowerCase(),
        updatedAt: Math.max(0, Number(entry.updatedAt || 0) || 0),
      }));

      return {
        files,
        filesCount: files.length,
        totalBytes: Math.max(0, Number(room.sessionMediaTotalBytes || 0) || 0),
        updatedAt: Math.max(0, Number(room.sessionMediaUpdatedAt || 0) || 0),
        uploadedBy: String(room.sessionMediaUploadedBy || "").trim(),
      };
    }

    function getSessionMediaFile(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }
      if (!(room.sessionMediaFiles instanceof Map) || room.sessionMediaFiles.size <= 0) {
        throw new Error("session-media-not-found");
      }

      const identity = normalizeSessionMediaIdentity(input.identity);
      const entry = room.sessionMediaFiles.get(identity);
      if (!entry) {
        throw new Error("session-media-file-not-found");
      }

      return {
        file: {
          identity: String(entry.identity || "").trim(),
          name: sanitizeText(entry.name, 160, "unknown"),
          ext: String(entry.ext || "").trim().toLowerCase(),
          mime: String(entry.mime || "").trim().toLowerCase(),
          size: Math.max(0, Number(entry.size || 0) || 0),
          sha256: String(entry.sha256 || "").trim().toLowerCase(),
          dataBase64: String(entry.dataBase64 || "").trim(),
          updatedAt: Math.max(0, Number(entry.updatedAt || 0) || 0),
        },
      };
    }

    function sendRtcSignal(input = {}) {
      const bus = ensureBus();
      const sessionCode = normalizeSessionCode(input.sessionCode);
      const room = bus.rooms.get(sessionCode);
      if (!room) {
        throw new Error("session-not-found");
      }

      const sourceClientId = normalizeClientId(
        input.sourceClientId,
        "invalid-client-id",
      );
      if (!room.participantIds.has(sourceClientId)) {
        throw new Error("not-joined");
      }

      const targetClientIdRaw = String(input.targetClientId || "").trim();
      const targetClientId = targetClientIdRaw
        ? normalizeClientId(targetClientIdRaw, "invalid-client-id")
        : "";
      if (targetClientId && !room.participantIds.has(targetClientId)) {
        throw new Error("not-joined");
      }

      const signalType = String(input.signalType || "")
        .trim()
        .toLowerCase();
      if (
        signalType !== "offer" &&
        signalType !== "answer" &&
        signalType !== "ice-candidate" &&
        signalType !== "peer-reset"
      ) {
        throw new Error("invalid-rtc-signal");
      }

      const signalPayload =
        input.signalPayload === undefined ? null : input.signalPayload;
      let serialized = "";
      try {
        serialized = JSON.stringify(signalPayload);
      } catch (_) {
        throw new Error("invalid-rtc-signal");
      }
      if (serialized.length > 240000) {
        throw new Error("invalid-rtc-signal");
      }

      emitToSession(sessionCode, {
        type: "rtc-signal",
        sessionCode,
        sourceClientId,
        targetClientId,
        signalType,
        signalPayload,
        ts: now(),
      });

      return { ok: true };
    }

    function getRoomSnapshot(sessionCode) {
      const bus = ensureBus();
      const code = normalizeSessionCode(sessionCode);
      return makeSnapshot(bus.rooms.get(code));
    }

    function subscribe(sessionCode, handler) {
      if (typeof handler !== "function") {
        return () => {};
      }

      const bus = ensureBus();
      const code = normalizeSessionCode(sessionCode);
      if (!code) return () => {};

      if (!bus.subscriptions.has(code)) {
        bus.subscriptions.set(code, new Set());
      }
      const set = bus.subscriptions.get(code);
      set.add(handler);

      return () => {
        const active = bus.subscriptions.get(code);
        if (!active) return;
        active.delete(handler);
        if (active.size <= 0) {
          bus.subscriptions.delete(code);
        }
      };
    }

    return {
      createRoom,
      joinRoom,
      leaveRoom,
      updateRoom,
      updateSessionState,
      updateParticipantState,
      uploadSessionPack,
      getSessionPack,
      resetSessionMediaPack,
      uploadSessionMediaFile,
      getSessionMediaManifest,
      getSessionMediaFile,
      sendRtcSignal,
      getRoomSnapshot,
      subscribe,
    };
  }

  sharedRoot.createSyncTransportMock = createSyncTransportMock;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
