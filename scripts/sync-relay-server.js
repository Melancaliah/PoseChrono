#!/usr/bin/env node
/* eslint-disable no-console */
const http = require("http");
const crypto = require("crypto");
const os = require("os");

function resolveWebSocketServerCtor() {
  try {
    return require("ws").WebSocketServer;
  } catch (_) {}

  try {
    return require("../apps/desktop/node_modules/ws").WebSocketServer;
  } catch (_) {}

  return null;
}

const WebSocketServer = resolveWebSocketServerCtor();
if (!WebSocketServer) {
  throw new Error(
    "ws module not found. Run `npm install` at repo root (or install apps/desktop deps).",
  );
}

const DEFAULT_HOST = process.env.POSECHRONO_SYNC_RELAY_HOST || "0.0.0.0";
const DEFAULT_PORT = Number(process.env.POSECHRONO_SYNC_RELAY_PORT || 8787);
const MAX_PAYLOAD_BYTES = Number(process.env.POSECHRONO_SYNC_MAX_PAYLOAD || 20 * 1024 * 1024);
const MAX_PARTICIPANTS_PER_ROOM = Math.max(
  2,
  Number(process.env.POSECHRONO_SYNC_MAX_PARTICIPANTS || 32) || 32,
);
const RATE_LIMIT_WINDOW_MS = Math.max(
  250,
  Number(process.env.POSECHRONO_SYNC_RATE_WINDOW_MS || 1000) || 1000,
);
const RATE_LIMIT_MAX_MESSAGES = Math.max(
  10,
  Number(process.env.POSECHRONO_SYNC_RATE_MAX_MESSAGES || 45) || 45,
);
const STATE_RATE_LIMIT_WINDOW_MS = Math.max(
  250,
  Number(process.env.POSECHRONO_SYNC_STATE_RATE_WINDOW_MS || 1000) || 1000,
);
const STATE_RATE_LIMIT_MAX_MESSAGES = Math.max(
  5,
  Number(process.env.POSECHRONO_SYNC_STATE_RATE_MAX_MESSAGES || 20) || 20,
);
const ROOM_IDLE_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.POSECHRONO_SYNC_ROOM_IDLE_TTL_MS || 2 * 60 * 60 * 1000) ||
    2 * 60 * 60 * 1000,
);
const ROOM_CLEANUP_INTERVAL_MS = Math.max(
  5 * 1000,
  Number(process.env.POSECHRONO_SYNC_ROOM_CLEANUP_INTERVAL_MS || 30 * 1000) ||
    30 * 1000,
);
const MAX_SESSION_NAME_LENGTH = Math.max(
  16,
  Number(process.env.POSECHRONO_SYNC_MAX_SESSION_NAME || 80) || 80,
);
const MAX_PASSWORD_LENGTH = Math.max(
  8,
  Number(process.env.POSECHRONO_SYNC_MAX_PASSWORD || 128) || 128,
);
const MAX_CLIENT_ID_LENGTH = Math.max(
  8,
  Number(process.env.POSECHRONO_SYNC_MAX_CLIENT_ID || 64) || 64,
);
const MAX_STATE_REASON_LENGTH = Math.max(
  16,
  Number(process.env.POSECHRONO_SYNC_MAX_REASON || 96) || 96,
);
const MAX_SESSION_STATE_SERIALIZED_BYTES = Math.max(
  4096,
  Number(process.env.POSECHRONO_SYNC_MAX_STATE_BYTES || 4 * 1024 * 1024) || 4 * 1024 * 1024,
);
const MAX_CUSTOM_QUEUE_STEPS = Math.max(
  1,
  Number(process.env.POSECHRONO_SYNC_MAX_CUSTOM_STEPS || 600) || 600,
);
const MAX_MEDIA_ORDER_KEYS = Math.max(
  1,
  Number(process.env.POSECHRONO_SYNC_MAX_MEDIA_ORDER_KEYS || 50000) || 50000,
);
const MAX_SESSION_SECONDS = Math.max(
  60,
  Number(process.env.POSECHRONO_SYNC_MAX_SESSION_SECONDS || 31_536_000) ||
    31_536_000,
);
const MAX_TIMESTAMP_MS = Math.max(
  0,
  Number(process.env.POSECHRONO_SYNC_MAX_TIMESTAMP || 4_102_444_800_000) ||
    4_102_444_800_000,
);
const MAX_SESSION_PACK_BYTES = Math.max(
  4096,
  Number(process.env.POSECHRONO_SYNC_MAX_SESSION_PACK_BYTES || 16 * 1024 * 1024) ||
    16 * 1024 * 1024,
);
const MAX_SESSION_MEDIA_FILES = Math.max(
  1,
  Number(process.env.POSECHRONO_SYNC_MAX_SESSION_MEDIA_FILES || 300) || 300,
);
const MAX_SESSION_MEDIA_FILE_BYTES = Math.max(
  1024,
  Number(process.env.POSECHRONO_SYNC_MAX_SESSION_MEDIA_FILE_BYTES || 2 * 1024 * 1024) ||
    2 * 1024 * 1024,
);
const MAX_SESSION_MEDIA_TOTAL_BYTES = Math.max(
  MAX_SESSION_MEDIA_FILE_BYTES,
  Number(process.env.POSECHRONO_SYNC_MAX_SESSION_MEDIA_TOTAL_BYTES || 256 * 1024 * 1024) ||
    256 * 1024 * 1024,
);
const MAX_RTC_SIGNAL_BYTES = Math.max(
  4096,
  Number(process.env.POSECHRONO_SYNC_MAX_RTC_SIGNAL_BYTES || 240000) || 240000,
);
const MAX_INDEX_VALUE = Math.max(
  1,
  Number(process.env.POSECHRONO_SYNC_MAX_INDEX || 200000) || 200000,
);
const RTC_RATE_LIMIT_WINDOW_MS = Math.max(
  250,
  Number(process.env.POSECHRONO_SYNC_RTC_RATE_WINDOW_MS || 1000) || 1000,
);
const RTC_RATE_LIMIT_MAX_MESSAGES = Math.max(
  10,
  Number(process.env.POSECHRONO_SYNC_RTC_RATE_MAX_MESSAGES || 90) || 90,
);
const MEDIA_TRANSFER_DISABLED = (() => {
  const raw = String(process.env.POSECHRONO_SYNC_DISABLE_MEDIA_TRANSFER || "")
    .trim()
    .toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
})();
const SESSION_PACK_SCHEMA = "posechrono-session-pack";
const SESSION_PACK_VERSION = 1;
const SESSION_MEDIA_ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp4",
  "webm",
]);
const SESSION_MEDIA_MIME_BY_EXT = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
};
const SESSION_MODE_VALUES = new Set([
  "classique",
  "classic",
  "custom",
  "relax",
  "memory",
]);
const MEMORY_TYPE_VALUES = new Set(["flash", "progressive"]);
const RTC_SIGNAL_TYPES = new Set([
  "offer",
  "answer",
  "ice-candidate",
  "peer-reset",
]);

function parseArgs(argv) {
  const out = {
    host: DEFAULT_HOST,
    port: Number.isFinite(DEFAULT_PORT) ? DEFAULT_PORT : 8787,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (!arg) continue;

    if (arg === "--host" && argv[i + 1]) {
      out.host = String(argv[i + 1]).trim() || out.host;
      i += 1;
      continue;
    }

    if (arg === "--port" && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
        out.port = parsed;
      }
      i += 1;
    }
  }

  return out;
}

function isShareableHost(hostname) {
  const host = String(hostname || "").trim().toLowerCase();
  if (!host) return false;
  return !(
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "::"
  );
}

function listLanIpv4Hosts() {
  const out = [];
  try {
    const interfaces = os.networkInterfaces() || {};
    Object.values(interfaces).forEach((entries) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((item) => {
        if (!item || item.internal) return;
        if (String(item.family || "") !== "IPv4") return;
        const ip = String(item.address || "").trim();
        if (!ip) return;
        out.push(ip);
      });
    });
  } catch (_) {}
  return Array.from(new Set(out));
}

function computeRelayUrls(args) {
  const host = String(args?.host || "").trim();
  const port = Number(args?.port || 0) || 0;
  if (!port) return [];
  if (isShareableHost(host)) {
    return [`ws://${host}:${port}`];
  }
  return listLanIpv4Hosts().map((ip) => `ws://${ip}:${port}`);
}

function nowMs() {
  return Date.now();
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

function normalizeString(input, fallback = "") {
  const value = String(input || "").trim();
  return value || fallback;
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
  const safeMax = Math.max(8, Number(MAX_CLIENT_ID_LENGTH) || 64);
  const re = new RegExp(`^[A-Za-z0-9_-]{1,${safeMax}}$`);
  if (!re.test(id)) {
    throw new Error(String(errorCode || "invalid-client-id"));
  }
  return id;
}

function normalizeSessionName(input) {
  return sanitizeText(input, MAX_SESSION_NAME_LENGTH, "PoseChrono Session");
}

function normalizePassword(input) {
  const value = String(input || "").trim();
  if (value.length > MAX_PASSWORD_LENGTH) {
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

function normalizeRtcSignalType(input) {
  const value = String(input || "")
    .trim()
    .toLowerCase();
  if (!RTC_SIGNAL_TYPES.has(value)) {
    throw new Error("invalid-rtc-signal");
  }
  return value;
}

function normalizeRtcSignalPayload(signalType, inputPayload) {
  const type = normalizeRtcSignalType(signalType);
  if (type === "peer-reset") {
    return null;
  }
  if (!isPlainObject(inputPayload)) {
    throw new Error("invalid-rtc-signal");
  }

  if (type === "offer" || type === "answer") {
    const payloadType = String(inputPayload.type || "")
      .trim()
      .toLowerCase();
    const expectedType = type;
    const sdp = String(inputPayload.sdp || "");
    if (payloadType !== expectedType) {
      throw new Error("invalid-rtc-signal");
    }
    if (!sdp || sdp.length > MAX_RTC_SIGNAL_BYTES) {
      throw new Error("invalid-rtc-signal");
    }
    return {
      type: expectedType,
      sdp,
    };
  }

  if (type === "ice-candidate") {
    const candidate = String(inputPayload.candidate || "");
    if (!candidate || candidate.length > MAX_RTC_SIGNAL_BYTES) {
      throw new Error("invalid-rtc-signal");
    }
    const out = {
      candidate,
      sdpMid: null,
      sdpMLineIndex: null,
    };
    if (inputPayload.sdpMid !== undefined && inputPayload.sdpMid !== null) {
      const sdpMid = sanitizeText(inputPayload.sdpMid, 64, "");
      if (!sdpMid) {
        throw new Error("invalid-rtc-signal");
      }
      out.sdpMid = sdpMid;
    }
    if (
      inputPayload.sdpMLineIndex !== undefined &&
      inputPayload.sdpMLineIndex !== null
    ) {
      const rawIndex = Number(inputPayload.sdpMLineIndex);
      if (
        !Number.isFinite(rawIndex) ||
        Math.floor(rawIndex) !== rawIndex ||
        rawIndex < 0 ||
        rawIndex > 4096
      ) {
        throw new Error("invalid-rtc-signal");
      }
      out.sdpMLineIndex = rawIndex;
    }
    return out;
  }

  throw new Error("invalid-rtc-signal");
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

function computeSha256Hex(input) {
  if (Buffer.isBuffer(input)) {
    return crypto.createHash("sha256").update(input).digest("hex");
  }
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
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
  if (!SESSION_MEDIA_ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error("session-media-unsupported-type");
  }
  return ext;
}

function normalizeSessionMediaMime(ext, inputMime) {
  const mime = String(inputMime || "")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  const expectedMime = SESSION_MEDIA_MIME_BY_EXT[ext] || "";
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

function validateSessionMediaMagicBytes(ext, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length <= 0) {
    throw new Error("invalid-session-media");
  }
  if (ext === "jpg" || ext === "jpeg") {
    if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
      throw new Error("session-media-unsupported-type");
    }
    return true;
  }
  if (ext === "png") {
    if (
      buffer.length < 8 ||
      buffer[0] !== 0x89 ||
      buffer[1] !== 0x50 ||
      buffer[2] !== 0x4e ||
      buffer[3] !== 0x47
    ) {
      throw new Error("session-media-unsupported-type");
    }
    return true;
  }
  if (ext === "webp") {
    if (
      buffer.length < 12 ||
      buffer.toString("ascii", 0, 4) !== "RIFF" ||
      buffer.toString("ascii", 8, 12) !== "WEBP"
    ) {
      throw new Error("session-media-unsupported-type");
    }
    return true;
  }
  if (ext === "mp4") {
    if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") {
      throw new Error("session-media-unsupported-type");
    }
    return true;
  }
  if (ext === "webm") {
    if (
      buffer.length < 4 ||
      buffer[0] !== 0x1a ||
      buffer[1] !== 0x45 ||
      buffer[2] !== 0xdf ||
      buffer[3] !== 0xa3
    ) {
      throw new Error("session-media-unsupported-type");
    }
    return true;
  }
  throw new Error("session-media-unsupported-type");
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
    MAX_SESSION_MEDIA_TOTAL_BYTES,
    "invalid-session-media",
  );
  if (size > MAX_SESSION_MEDIA_FILE_BYTES) {
    throw new Error("session-media-too-large");
  }

  const dataBase64 = String(input.dataBase64 || "")
    .replace(/\s+/g, "")
    .trim();
  if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
    throw new Error("invalid-session-media");
  }
  const decoded = Buffer.from(dataBase64, "base64");
  if (!Buffer.isBuffer(decoded) || decoded.length !== size) {
    throw new Error("invalid-session-media");
  }
  validateSessionMediaMagicBytes(ext, decoded);

  const computedSha256 = computeSha256Hex(decoded);
  const declaredSha256 = String(input.sha256 || "")
    .trim()
    .toLowerCase();
  if (declaredSha256 && (!/^[a-f0-9]{64}$/.test(declaredSha256) || declaredSha256 !== computedSha256)) {
    throw new Error("invalid-session-media");
  }

  return {
    identity,
    name,
    ext,
    mime,
    size,
    sha256: computedSha256,
    dataBase64,
  };
}

function makeRoomSnapshot(room) {
  if (!room) return null;
  const participantIds = Array.from(room.participantIds);
  const participantProfiles = {};
  const participantSyncStates = {};
  if (room.participantProfiles && typeof room.participantProfiles.forEach === "function") {
    room.participantProfiles.forEach((name, id) => {
      const normalizedId = normalizeString(id);
      if (!normalizedId) return;
      participantProfiles[normalizedId] = normalizeParticipantName(name);
    });
  }
  if (
    room.participantSyncStates &&
    typeof room.participantSyncStates.forEach === "function"
  ) {
    room.participantSyncStates.forEach((syncState, id) => {
      const normalizedId = normalizeString(id);
      if (!normalizedId) return;
      participantSyncStates[normalizedId] =
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

function normalizeSessionPackPayload(input) {
  if (!isPlainObject(input)) {
    throw new Error("invalid-session-pack");
  }

  const serializedLength = JSON.stringify(input).length;
  if (serializedLength > MAX_SESSION_PACK_BYTES) {
    throw new Error("session-pack-too-large");
  }

  const schema = String(input.schema || "").trim();
  const version = Math.floor(Number(input.version || 0));
  if (schema !== SESSION_PACK_SCHEMA || version !== SESSION_PACK_VERSION) {
    throw new Error("invalid-session-pack");
  }

  const session = isPlainObject(input.session) ? input.session : null;
  if (!session) throw new Error("invalid-session-pack");

  const mode = String(session.mode || "")
    .trim()
    .toLowerCase();
  if (!SESSION_MODE_VALUES.has(mode)) throw new Error("invalid-session-pack");

  const out = {
    schema: SESSION_PACK_SCHEMA,
    version: SESSION_PACK_VERSION,
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
        MAX_SESSION_SECONDS,
        "invalid-session-pack",
      ),
      timeRemaining: toBoundedInt(
        session.timeRemaining,
        0,
        MAX_SESSION_SECONDS,
        "invalid-session-pack",
      ),
      memoryType: (() => {
        const value = String(session.memoryType || "")
          .trim()
          .toLowerCase();
        if (!MEMORY_TYPE_VALUES.has(value)) throw new Error("invalid-session-pack");
        return value;
      })(),
      memoryDuration: toBoundedInt(
        session.memoryDuration,
        0,
        MAX_SESSION_SECONDS,
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
        MAX_SESSION_SECONDS,
        "invalid-session-pack",
      ),
      memoryNoPressure: !!session.memoryNoPressure,
      customQueue: [],
      mediaOrderKeys: [],
      imagesCount: toBoundedInt(
        session.imagesCount,
        0,
        MAX_MEDIA_ORDER_KEYS,
        "invalid-session-pack",
      ),
    },
    mediaRefs: [],
  };

  const customQueue = Array.isArray(session.customQueue) ? session.customQueue : [];
  if (customQueue.length > MAX_CUSTOM_QUEUE_STEPS) {
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
    const id = step.id !== undefined
      ? toBoundedInt(step.id, 0, Number.MAX_SAFE_INTEGER, "invalid-session-pack")
      : nowMs() + index;
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
  if (mediaOrderKeys.length > MAX_MEDIA_ORDER_KEYS) {
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
  if (mediaRefs.length > MAX_MEDIA_ORDER_KEYS) {
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
      MAX_MEDIA_ORDER_KEYS,
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

function normalizeSessionStatePayload(input) {
  if (!isPlainObject(input)) {
    if (input === null || input === undefined) return {};
    throw new Error("invalid-session-state");
  }

  const serializedLength = JSON.stringify(input).length;
  if (serializedLength > MAX_SESSION_STATE_SERIALIZED_BYTES) {
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
    if (!SESSION_MODE_VALUES.has(mode)) throw new Error("invalid-session-state");
    return mode === "classic" ? "classique" : mode;
  }

  function normalizeMemoryType(value) {
    const memoryType = String(value || "")
      .trim()
      .toLowerCase();
    if (!MEMORY_TYPE_VALUES.has(memoryType)) {
      throw new Error("invalid-session-state");
    }
    return memoryType;
  }

  function normalizeMediaOrderKeys(value) {
    if (!Array.isArray(value)) throw new Error("invalid-session-state");
    if (value.length > MAX_MEDIA_ORDER_KEYS) {
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
      normalizedStep.id = nowMs() + index;
    }
    return normalizedStep;
  }

  function normalizeCustomQueue(value) {
    if (!Array.isArray(value)) throw new Error("invalid-session-state");
    if (value.length > MAX_CUSTOM_QUEUE_STEPS) {
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
        out.reason = sanitizeText(value, MAX_STATE_REASON_LENGTH, "");
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
          MAX_SESSION_SECONDS,
          "invalid-session-state",
        );
        return;
      case "timeRemaining":
        out.timeRemaining = toBoundedInt(
          value,
          0,
          MAX_SESSION_SECONDS,
          "invalid-session-state",
        );
        return;
      case "memoryDuration":
      case "memoryDrawingTime":
      case "totalSessionTime":
        out[key] = toBoundedInt(
          value,
          0,
          MAX_SESSION_SECONDS,
          "invalid-session-state",
        );
        return;
      case "currentIndex":
      case "currentStepIndex":
        out[key] = toBoundedInt(value, 0, MAX_INDEX_VALUE, "invalid-session-state");
        return;
      case "currentPoseInStep":
      case "memoryPosesCount":
        out[key] = toBoundedInt(value, 1, 10000, "invalid-session-state");
        return;
      case "imagesCount":
      case "customQueueLength":
      case "mediaOrderCount":
        out[key] = toBoundedInt(value, 0, MAX_MEDIA_ORDER_KEYS, "invalid-session-state");
        return;
      case "ts":
      case "updatedAt":
        out[key] = toBoundedInt(value, 0, MAX_TIMESTAMP_MS, "invalid-session-state");
        return;
      case "revision":
        out.revision = toBoundedInt(value, 0, MAX_INDEX_VALUE, "invalid-session-state");
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
    reason: normalizeString(
      input?.reason,
      requestType === "play" ? "shared-play-request" : "shared-pause-request",
    ),
    ts: Math.max(0, Number(input?.ts || nowMs()) || nowMs()),
  };
}

function createRelayState() {
  return {
    rooms: new Map(),
    clients: new Map(), // ws -> { subscriptions:Set<string>, joinedBySession:Map<string,string> }
  };
}

function ensureClientState(state, ws) {
  if (!state.clients.has(ws)) {
    state.clients.set(ws, {
      subscriptions: new Set(),
      joinedBySession: new Map(),
      rateWindowStartMs: 0,
      rateCount: 0,
      stateRateWindowStartMs: 0,
      stateRateCountBySession: new Map(),
      rtcRateWindowStartMs: 0,
      rtcRateCountBySession: new Map(),
      securityLastLogByReason: new Map(),
    });
  }
  return state.clients.get(ws);
}

function isClientRateLimited(clientState, timestampMs) {
  const ts = Math.max(0, Number(timestampMs || nowMs()) || nowMs());
  if (!clientState || typeof clientState !== "object") return false;
  if (
    !clientState.rateWindowStartMs ||
    ts - clientState.rateWindowStartMs >= RATE_LIMIT_WINDOW_MS
  ) {
    clientState.rateWindowStartMs = ts;
    clientState.rateCount = 1;
    return false;
  }
  clientState.rateCount = Math.max(0, Number(clientState.rateCount || 0) || 0) + 1;
  return clientState.rateCount > RATE_LIMIT_MAX_MESSAGES;
}

function isSessionStateRateLimited(clientState, sessionCode, timestampMs) {
  const ts = Math.max(0, Number(timestampMs || nowMs()) || nowMs());
  if (!clientState || typeof clientState !== "object") return false;
  const normalizedSessionCode = normalizeSessionCode(sessionCode);
  if (!normalizedSessionCode) return false;
  if (
    !clientState.stateRateWindowStartMs ||
    ts - clientState.stateRateWindowStartMs >= STATE_RATE_LIMIT_WINDOW_MS
  ) {
    clientState.stateRateWindowStartMs = ts;
    if (clientState.stateRateCountBySession && typeof clientState.stateRateCountBySession.clear === "function") {
      clientState.stateRateCountBySession.clear();
    }
  }
  if (!clientState.stateRateCountBySession) {
    clientState.stateRateCountBySession = new Map();
  }
  const previous = Math.max(
    0,
    Number(clientState.stateRateCountBySession.get(normalizedSessionCode) || 0) || 0,
  );
  const next = previous + 1;
  clientState.stateRateCountBySession.set(normalizedSessionCode, next);
  return next > STATE_RATE_LIMIT_MAX_MESSAGES;
}

function isRtcSignalRateLimited(clientState, sessionCode, timestampMs) {
  const ts = Math.max(0, Number(timestampMs || nowMs()) || nowMs());
  if (!clientState || typeof clientState !== "object") return false;
  const normalizedSessionCode = normalizeSessionCode(sessionCode);
  if (!normalizedSessionCode) return false;
  if (
    !clientState.rtcRateWindowStartMs ||
    ts - clientState.rtcRateWindowStartMs >= RTC_RATE_LIMIT_WINDOW_MS
  ) {
    clientState.rtcRateWindowStartMs = ts;
    if (
      clientState.rtcRateCountBySession &&
      typeof clientState.rtcRateCountBySession.clear === "function"
    ) {
      clientState.rtcRateCountBySession.clear();
    }
  }
  if (!clientState.rtcRateCountBySession) {
    clientState.rtcRateCountBySession = new Map();
  }
  const previous = Math.max(
    0,
    Number(clientState.rtcRateCountBySession.get(normalizedSessionCode) || 0) ||
      0,
  );
  const next = previous + 1;
  clientState.rtcRateCountBySession.set(normalizedSessionCode, next);
  return next > RTC_RATE_LIMIT_MAX_MESSAGES;
}

function getClientAddress(ws) {
  return normalizeString(
    ws && ws._socket && typeof ws._socket === "object" ? ws._socket.remoteAddress : "",
    "unknown",
  );
}

function logSecurityEvent(ws, clientState, reason, meta = {}) {
  const normalizedReason = normalizeString(reason, "security-event");
  const nowTimestamp = nowMs();
  const lastLoggedAt = Math.max(
    0,
    Number(clientState?.securityLastLogByReason?.get(normalizedReason) || 0) || 0,
  );
  if (lastLoggedAt > 0 && nowTimestamp - lastLoggedAt < 1000) {
    return;
  }
  if (clientState?.securityLastLogByReason) {
    clientState.securityLastLogByReason.set(normalizedReason, nowTimestamp);
  }
  const action = normalizeString(meta.action);
  const sessionCode = normalizeSessionCode(meta.sessionCode);
  const clientId = normalizeString(meta.clientId);
  const error = normalizeString(meta.error);
  const ip = getClientAddress(ws);
  const parts = [
    `[sync-relay][security] ${normalizedReason}`,
    `ip=${ip}`,
  ];
  if (action) parts.push(`action=${action}`);
  if (sessionCode) parts.push(`session=${sessionCode}`);
  if (clientId) parts.push(`client=${clientId}`);
  if (error) parts.push(`error=${error}`);
  console.warn(parts.join(" "));
}

function cleanupExpiredRooms(state, timestampMs = nowMs()) {
  if (!state || !state.rooms || state.rooms.size <= 0) return 0;
  const ts = Math.max(0, Number(timestampMs || nowMs()) || nowMs());
  let removedCount = 0;
  state.rooms.forEach((room, sessionCode) => {
    if (!room || typeof room !== "object") return;
    const lastUpdatedAt = Math.max(0, Number(room.updatedAt || room.createdAt || 0) || 0);
    if (!lastUpdatedAt) return;
    if (ts - lastUpdatedAt < ROOM_IDLE_TTL_MS) return;

    const snapshot = makeRoomSnapshot(room);
    state.rooms.delete(sessionCode);
    broadcastSessionEvent(state, sessionCode, {
      type: "room-closed",
      source: "ttl-expired",
      sessionCode,
      snapshot,
    });
    state.clients.forEach((clientState) => {
      if (!clientState || typeof clientState !== "object") return;
      if (clientState.joinedBySession && typeof clientState.joinedBySession.delete === "function") {
        clientState.joinedBySession.delete(sessionCode);
      }
      if (clientState.subscriptions && typeof clientState.subscriptions.delete === "function") {
        clientState.subscriptions.delete(sessionCode);
      }
    });
    removedCount += 1;
  });
  return removedCount;
}

function resolveTrackedClientId(state, ws, sessionCode) {
  const clientState = state.clients.get(ws);
  if (!clientState || !clientState.joinedBySession) return "";
  const code = normalizeSessionCode(sessionCode);
  if (!code) return "";
  return normalizeString(clientState.joinedBySession.get(code));
}

function trackClientJoin(state, ws, sessionCode, clientId) {
  const clientState = ensureClientState(state, ws);
  const code = normalizeSessionCode(sessionCode);
  const normalizedClientId = normalizeString(clientId);
  if (!code || !normalizedClientId) return;
  clientState.joinedBySession.set(code, normalizedClientId);
}

function trackClientLeave(state, ws, sessionCode) {
  const clientState = state.clients.get(ws);
  if (!clientState) return;
  const code = normalizeSessionCode(sessionCode);
  if (!code) return;
  clientState.joinedBySession.delete(code);
}

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify(payload));
  return true;
}

function sendResponse(ws, requestId, result) {
  sendJson(ws, {
    type: "response",
    id: String(requestId || ""),
    ok: true,
    result: result === undefined ? null : result,
  });
}

function sendError(ws, requestId, errorCode) {
  sendJson(ws, {
    type: "response",
    id: String(requestId || ""),
    ok: false,
    error: String(errorCode || "request-failed"),
  });
}

function broadcastSessionEvent(state, sessionCode, eventPayload) {
  const code = normalizeSessionCode(sessionCode);
  if (!code) return;

  state.clients.forEach((clientState, ws) => {
    if (!clientState.subscriptions.has(code)) return;
    sendJson(ws, {
      type: "event",
      event: eventPayload,
    });
  });
}

function createRoom(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  if (!sessionCode) throw new Error("invalid-session-code");
  if (state.rooms.has(sessionCode)) throw new Error("session-already-exists");

  const hostClientId = normalizeClientId(
    payload?.hostClientId,
    "invalid-host-client-id",
  );

  const room = {
    sessionCode,
    sessionName: normalizeSessionName(payload?.sessionName),
    controlMode: normalizeControlMode(payload?.controlMode),
    hostClientId,
    password: normalizePassword(payload?.password),
    participantIds: new Set([hostClientId]),
    participantProfiles: new Map([
      [hostClientId, normalizeParticipantName(payload?.hostDisplayName, "Hôte")],
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
    createdAt: nowMs(),
    updatedAt: nowMs(),
  };

  state.rooms.set(sessionCode, room);
  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "host-created",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function assertRoomAccess(room, password) {
  if (!room) throw new Error("session-not-found");
  const normalizedPassword = normalizePassword(password);
  if (room.password && room.password !== normalizedPassword) {
    throw new Error("invalid-password");
  }
}

function joinRoom(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  assertRoomAccess(room, payload?.password);

  const clientId = normalizeClientId(payload?.clientId, "invalid-client-id");
  if (clientId === room.hostClientId) throw new Error("forbidden-host-impersonation");
  if (room.participantIds.has(clientId)) throw new Error("duplicate-client-id");
  if (room.participantIds.size >= MAX_PARTICIPANTS_PER_ROOM) {
    throw new Error("room-full");
  }

  room.participantIds.add(clientId);
  room.participantProfiles.set(
    clientId,
    normalizeParticipantName(payload?.participantName, "Invité"),
  );
  if (!(room.participantSyncStates instanceof Map)) {
    room.participantSyncStates = new Map();
  }
  room.participantSyncStates.set(clientId, "connecting");
  room.updatedAt = nowMs();
  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "participant-joined",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function leaveRoom(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) return { closed: false, snapshot: null };

  const clientId = normalizeString(payload?.clientId);
  room.participantIds.delete(clientId);
  room.participantProfiles.delete(clientId);
  if (room.participantSyncStates instanceof Map) {
    room.participantSyncStates.delete(clientId);
  }
  room.updatedAt = nowMs();

  const closeRoom = clientId === room.hostClientId || room.participantIds.size <= 0;
  if (closeRoom) {
    const snapshot = makeRoomSnapshot(room);
    state.rooms.delete(sessionCode);
    broadcastSessionEvent(state, sessionCode, {
      type: "room-closed",
      source: "host-left",
      sessionCode,
      snapshot,
    });
    return { closed: true, snapshot };
  }

  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "participant-left",
    sessionCode,
    snapshot,
  });
  return { closed: false, snapshot };
}

function updateParticipantState(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }

  const syncState = normalizeParticipantSyncState(payload?.syncState);
  if (!(room.participantSyncStates instanceof Map)) {
    room.participantSyncStates = new Map();
  }
  room.participantSyncStates.set(sourceClientId, syncState);
  room.updatedAt = nowMs();

  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "participant-state-updated",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function updateRoom(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }
  if (!sourceClientId || sourceClientId !== room.hostClientId) {
    throw new Error("forbidden-not-host");
  }

  const patch = payload?.patch && typeof payload.patch === "object" ? payload.patch : {};
  if (typeof patch.sessionName === "string") {
    const nextName = normalizeString(patch.sessionName);
    if (nextName) room.sessionName = nextName;
  }
  if (typeof patch.controlMode === "string") {
    room.controlMode = normalizeControlMode(patch.controlMode);
  }
  room.updatedAt = nowMs();

  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "room-updated",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function updateSessionState(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }
  const isHostSource = sourceClientId && sourceClientId === room.hostClientId;
  let normalizedPayload = normalizeSessionStatePayload(payload?.payload || {});
  const requestType = String(normalizedPayload.requestType || "").trim();
  const canSharedPlayback =
    room.controlMode === "shared-pause" &&
    !isHostSource &&
    normalizedPayload &&
    (requestType === "pause" || requestType === "play") &&
    normalizedPayload.isPlaying === (requestType === "play");

  if (!isHostSource && !canSharedPlayback) {
    throw new Error("forbidden-not-host");
  }

  if (canSharedPlayback) {
    normalizedPayload = normalizeSharedPlaybackRequestPayload(normalizedPayload);
  }

  room.sessionState = withPreservedMediaOrder(room.sessionState, {
    ...normalizedPayload,
  });
  room.sessionStateRevision = (Number(room.sessionStateRevision) || 0) + 1;
  room.sessionStateUpdatedAt = nowMs();
  room.updatedAt = room.sessionStateUpdatedAt;

  const sessionState = {
    ...room.sessionState,
    revision: room.sessionStateRevision,
    updatedAt: room.sessionStateUpdatedAt,
    sourceClientId,
  };

  broadcastSessionEvent(state, sessionCode, {
    type: "session-state-updated",
    source: "host-state-update",
    sessionCode,
    state: sessionState,
  });

  return sessionState;
}

function uploadSessionPack(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }
  if (!sourceClientId || sourceClientId !== room.hostClientId) {
    throw new Error("forbidden-not-host");
  }

  const pack = normalizeSessionPackPayload(payload?.pack || null);
  const serializedPack = JSON.stringify(pack);
  const packHash = computeSha256Hex(serializedPack);
  const updatedAt = nowMs();

  room.sessionPack = pack;
  room.sessionPackHash = packHash;
  room.sessionPackSize = serializedPack.length;
  room.sessionPackUpdatedAt = updatedAt;
  room.sessionPackUploadedBy = sourceClientId;
  room.updatedAt = updatedAt;

  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "session-pack-updated",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function getSessionPack(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
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

function resetSessionMediaPack(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }
  if (!sourceClientId || sourceClientId !== room.hostClientId) {
    throw new Error("forbidden-not-host");
  }

  room.sessionMediaFiles = new Map();
  room.sessionMediaTotalBytes = 0;
  room.sessionMediaUpdatedAt = nowMs();
  room.sessionMediaUploadedBy = sourceClientId;
  room.updatedAt = room.sessionMediaUpdatedAt;

  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "session-media-reset",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function uploadSessionMediaFile(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }
  if (!sourceClientId || sourceClientId !== room.hostClientId) {
    throw new Error("forbidden-not-host");
  }

  const file = normalizeSessionMediaFilePayload(payload?.file || null);
  if (!(room.sessionMediaFiles instanceof Map)) {
    room.sessionMediaFiles = new Map();
  }
  const previousFile = room.sessionMediaFiles.get(file.identity);
  const previousSize = previousFile ? Math.max(0, Number(previousFile.size || 0) || 0) : 0;
  const currentTotal = Math.max(0, Number(room.sessionMediaTotalBytes || 0) || 0);
  const nextTotal = currentTotal - previousSize + file.size;
  if (nextTotal > MAX_SESSION_MEDIA_TOTAL_BYTES) {
    throw new Error("session-media-too-large");
  }
  if (!previousFile && room.sessionMediaFiles.size >= MAX_SESSION_MEDIA_FILES) {
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
    updatedAt: nowMs(),
  };
  room.sessionMediaFiles.set(file.identity, storedFile);
  room.sessionMediaTotalBytes = nextTotal;
  room.sessionMediaUpdatedAt = storedFile.updatedAt;
  room.sessionMediaUploadedBy = sourceClientId;
  room.updatedAt = storedFile.updatedAt;

  const snapshot = makeRoomSnapshot(room);
  broadcastSessionEvent(state, sessionCode, {
    type: "room-updated",
    source: "session-media-updated",
    sessionCode,
    snapshot,
  });
  return snapshot;
}

function getSessionMediaManifest(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
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

function getSessionMediaFile(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeString(payload?.sourceClientId);
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }
  if (!(room.sessionMediaFiles instanceof Map) || room.sessionMediaFiles.size <= 0) {
    throw new Error("session-media-not-found");
  }

  const identity = normalizeSessionMediaIdentity(payload?.identity);
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

function sendRtcSignal(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");

  const sourceClientId = normalizeClientId(
    payload?.sourceClientId,
    "invalid-client-id",
  );
  if (!room.participantIds.has(sourceClientId)) {
    throw new Error("not-joined");
  }

  const targetRaw = normalizeString(payload?.targetClientId);
  const targetClientId = targetRaw
    ? normalizeClientId(targetRaw, "invalid-client-id")
    : "";
  if (targetClientId && !room.participantIds.has(targetClientId)) {
    throw new Error("not-joined");
  }

  const signalType = normalizeRtcSignalType(payload?.signalType);
  const signalPayload = normalizeRtcSignalPayload(
    signalType,
    payload?.signalPayload,
  );

  let serializedPayload = "";
  try {
    serializedPayload = JSON.stringify(signalPayload);
  } catch (_) {
    throw new Error("invalid-rtc-signal");
  }
  if (serializedPayload.length > MAX_RTC_SIGNAL_BYTES) {
    throw new Error("invalid-rtc-signal");
  }

  room.updatedAt = nowMs();
  broadcastSessionEvent(state, sessionCode, {
    type: "rtc-signal",
    sessionCode,
    sourceClientId,
    targetClientId,
    signalType,
    signalPayload,
    ts: nowMs(),
  });

  return { ok: true };
}

function getRoomSnapshot(state, payload) {
  const sessionCode = normalizeSessionCode(payload?.sessionCode);
  const room = state.rooms.get(sessionCode);
  if (!room) throw new Error("session-not-found");
  return makeRoomSnapshot(room);
}

function executeAction(state, action, payload) {
  const normalizedAction = String(action || "").trim();
  if (
    MEDIA_TRANSFER_DISABLED &&
    (normalizedAction === "resetSessionMediaPack" ||
      normalizedAction === "uploadSessionMediaFile" ||
      normalizedAction === "getSessionMediaManifest" ||
      normalizedAction === "getSessionMediaFile")
  ) {
    throw new Error("media-transfer-disabled");
  }
  switch (normalizedAction) {
    case "createRoom":
      return createRoom(state, payload);
    case "joinRoom":
      return joinRoom(state, payload);
    case "leaveRoom":
      return leaveRoom(state, payload);
    case "updateRoom":
      return updateRoom(state, payload);
    case "updateSessionState":
      return updateSessionState(state, payload);
    case "updateParticipantState":
      return updateParticipantState(state, payload);
    case "uploadSessionPack":
      return uploadSessionPack(state, payload);
    case "getSessionPack":
      return getSessionPack(state, payload);
    case "resetSessionMediaPack":
      return resetSessionMediaPack(state, payload);
    case "uploadSessionMediaFile":
      return uploadSessionMediaFile(state, payload);
    case "getSessionMediaManifest":
      return getSessionMediaManifest(state, payload);
    case "getSessionMediaFile":
      return getSessionMediaFile(state, payload);
    case "sendRtcSignal":
      return sendRtcSignal(state, payload);
    case "getRoomSnapshot":
      return getRoomSnapshot(state, payload);
    default:
      throw new Error(`unknown-action:${normalizedAction || "empty"}`);
  }
}

function onNotify(state, ws, action, payload) {
  const clientState = ensureClientState(state, ws);
  switch (String(action || "").trim()) {
    case "subscribe": {
      const sessionCode = normalizeSessionCode(payload?.sessionCode);
      if (sessionCode) {
        clientState.subscriptions.add(sessionCode);
      }
      break;
    }
    case "unsubscribe": {
      const sessionCode = normalizeSessionCode(payload?.sessionCode);
      if (sessionCode) {
        clientState.subscriptions.delete(sessionCode);
      }
      break;
    }
    default:
      break;
  }
}

function parseJsonMessage(raw) {
  try {
    if (Buffer.isBuffer(raw)) return JSON.parse(raw.toString("utf8"));
    if (typeof raw === "string") return JSON.parse(raw);
  } catch (_) {}
  return null;
}

function detachClientFromRooms(state, ws) {
  const clientState = state.clients.get(ws);
  if (!clientState) return;

  clientState.joinedBySession.forEach((clientId, sessionCode) => {
    try {
      leaveRoom(state, { sessionCode, clientId });
    } catch (_) {}
  });

  state.clients.delete(ws);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = createRelayState();
  const relayUrls = computeRelayUrls(args);
  const suggestedRelayUrl = relayUrls[0] || "";

  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
      });
      res.end(
        JSON.stringify({
          ok: true,
          service: "posechrono-sync-relay",
          rooms: state.rooms.size,
          mediaTransferEnabled: !MEDIA_TRANSFER_DISABLED,
          relayUrls,
          suggestedRelayUrl,
          ts: nowMs(),
        }),
      );
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
      });
      res.end();
      return;
    }

    res.writeHead(404, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
    });
    res.end(JSON.stringify({ ok: false, error: "not-found" }));
  });

  const wss = new WebSocketServer({
    server,
    maxPayload: MAX_PAYLOAD_BYTES,
  });

  const cleanupIntervalId = setInterval(() => {
    try {
      const removed = cleanupExpiredRooms(state, nowMs());
      if (removed > 0) {
        console.log(`[sync-relay] expired idle rooms closed: ${removed}`);
      }
    } catch (error) {
      console.warn("[sync-relay] room cleanup error:", error);
    }
  }, ROOM_CLEANUP_INTERVAL_MS);
  if (typeof cleanupIntervalId.unref === "function") {
    cleanupIntervalId.unref();
  }

  wss.on("connection", (ws) => {
    const clientState = ensureClientState(state, ws);

    ws.on("error", (error) => {
      const code = error && typeof error === "object" ? error.code || "" : "";
      const message =
        error && typeof error === "object" ? error.message || String(error) : String(error);
      console.warn(`[sync-relay] ws client error${code ? ` (${code})` : ""}: ${message}`);
    });

    ws.on("message", (raw) => {
      const message = parseJsonMessage(raw);
      if (!message || typeof message !== "object") {
        return;
      }

      if (isClientRateLimited(clientState, nowMs())) {
        const maybeRequestId =
          message && typeof message === "object" ? String(message.id || "") : "";
        logSecurityEvent(ws, clientState, "rate-limited", {
          action: message.action,
          sessionCode: message?.payload?.sessionCode,
        });
        if (maybeRequestId) {
          sendError(ws, maybeRequestId, "rate-limited");
        }
        return;
      }

      const type = String(message.type || "").trim();
      if (type === "notify") {
        onNotify(state, ws, message.action, message.payload || {});
        return;
      }

      if (type !== "request") {
        return;
      }

      const requestId = String(message.id || "");
      const action = String(message.action || "").trim();
      if (!requestId || !action) {
        sendError(ws, requestId || "missing-id", "invalid-request");
        return;
      }

      let requestPayload = {};
      try {
        requestPayload = isPlainObject(message.payload)
          ? { ...message.payload }
          : message.payload === undefined
            ? {}
            : null;
        if (requestPayload === null) {
          throw new Error("invalid-request");
        }
        const sessionCodeForTracking =
          action === "joinRoom" ||
          action === "leaveRoom" ||
          action === "updateRoom" ||
          action === "updateSessionState" ||
          action === "updateParticipantState" ||
          action === "uploadSessionPack" ||
          action === "getSessionPack" ||
          action === "resetSessionMediaPack" ||
          action === "uploadSessionMediaFile" ||
          action === "getSessionMediaManifest" ||
          action === "getSessionMediaFile" ||
          action === "sendRtcSignal"
            ? normalizeSessionCode(requestPayload.sessionCode)
            : "";

        if (action === "joinRoom") {
          if (!sessionCodeForTracking) {
            throw new Error("invalid-session-code");
          }
          if (resolveTrackedClientId(state, ws, sessionCodeForTracking)) {
            throw new Error("already-joined");
          }
        }

        if (action === "leaveRoom") {
          const trackedClientId = resolveTrackedClientId(state, ws, sessionCodeForTracking);
          if (!sessionCodeForTracking || !trackedClientId) {
            throw new Error("not-joined");
          }
          requestPayload.clientId = trackedClientId;
        }

        if (
          action === "updateRoom" ||
          action === "updateSessionState" ||
          action === "updateParticipantState" ||
          action === "uploadSessionPack" ||
          action === "getSessionPack" ||
          action === "resetSessionMediaPack" ||
          action === "uploadSessionMediaFile" ||
          action === "getSessionMediaManifest" ||
          action === "getSessionMediaFile" ||
          action === "sendRtcSignal"
        ) {
          const trackedClientId = resolveTrackedClientId(state, ws, sessionCodeForTracking);
          if (!sessionCodeForTracking || !trackedClientId) {
            throw new Error("not-joined");
          }
          requestPayload.sourceClientId = trackedClientId;
        }

        if (
          action === "updateSessionState" &&
          isSessionStateRateLimited(clientState, sessionCodeForTracking, nowMs())
        ) {
          logSecurityEvent(ws, clientState, "state-rate-limited", {
            action,
            sessionCode: sessionCodeForTracking,
            clientId: requestPayload.sourceClientId,
          });
          throw new Error("state-rate-limited");
        }

        if (
          action === "sendRtcSignal" &&
          isRtcSignalRateLimited(clientState, sessionCodeForTracking, nowMs())
        ) {
          logSecurityEvent(ws, clientState, "rtc-rate-limited", {
            action,
            sessionCode: sessionCodeForTracking,
            clientId: requestPayload.sourceClientId,
          });
          throw new Error("rtc-rate-limited");
        }

        const result = executeAction(state, action, requestPayload);
        if (action === "createRoom") {
          trackClientJoin(state, ws, result?.sessionCode, requestPayload?.hostClientId);
        } else if (action === "joinRoom") {
          trackClientJoin(state, ws, result?.sessionCode, requestPayload?.clientId);
        } else if (action === "leaveRoom") {
          trackClientLeave(state, ws, requestPayload?.sessionCode);
        }
        sendResponse(ws, requestId, result);
      } catch (error) {
        const errorCode = normalizeString(error?.message, "request-failed");
        if (
          errorCode === "forbidden-not-host" ||
          errorCode === "forbidden-host-impersonation" ||
          errorCode === "duplicate-client-id" ||
          errorCode === "invalid-client-id" ||
          errorCode === "invalid-host-client-id" ||
          errorCode === "invalid-session-state" ||
          errorCode === "invalid-session-pack" ||
          errorCode === "session-pack-too-large" ||
          errorCode === "session-pack-not-found" ||
          errorCode === "invalid-session-media" ||
          errorCode === "session-media-too-large" ||
          errorCode === "session-media-not-found" ||
          errorCode === "session-media-file-not-found" ||
          errorCode === "session-media-unsupported-type" ||
          errorCode === "invalid-rtc-signal" ||
          errorCode === "rtc-rate-limited" ||
          errorCode === "media-transfer-disabled" ||
          errorCode === "session-state-too-large" ||
          errorCode === "invalid-request" ||
          errorCode === "not-joined" ||
          errorCode === "already-joined" ||
          errorCode === "rate-limited" ||
          errorCode === "state-rate-limited" ||
          errorCode === "invalid-session-code" ||
          errorCode === "room-full" ||
          errorCode.startsWith("unknown-action:")
        ) {
          logSecurityEvent(ws, clientState, "request-blocked", {
            action,
            sessionCode: message?.payload?.sessionCode,
            clientId:
              normalizeString(requestPayload?.sourceClientId) ||
              normalizeString(requestPayload?.clientId),
            error: errorCode,
          });
        }
        sendError(ws, requestId, errorCode);
      }
    });

    ws.on("close", () => {
      detachClientFromRooms(state, ws);
    });
  });

  server.listen(args.port, args.host, () => {
    console.log(
      `[sync-relay] listening on ws://${args.host}:${args.port} (health: http://${args.host}:${args.port}/health)`,
    );
  });

  function shutdown() {
    console.log("[sync-relay] shutting down...");
    clearInterval(cleanupIntervalId);
    wss.clients.forEach((client) => {
      try {
        client.close(1001, "server-shutdown");
      } catch (_) {}
    });
    wss.close(() => {
      server.close(() => {
        process.exit(0);
      });
    });
    setTimeout(() => process.exit(0), 1500).unref();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[sync-relay] failed:", error);
  process.exitCode = 1;
});
