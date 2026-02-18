(function initPoseChronoSharedSyncSessionCore(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createSyncSessionService(options = {}) {
    const now =
      typeof options.now === "function"
        ? options.now
        : () => Date.now();
    const random =
      typeof options.random === "function"
        ? options.random
        : () => Math.random();
    const logger =
      typeof options.logger === "function" ? options.logger : () => {};
    const transport =
      options.transport ||
      (typeof sharedRoot.createSyncTransportMock === "function"
        ? sharedRoot.createSyncTransportMock()
        : null);

    const listeners = new Set();
    const clientId = String(
      options.clientId ||
        `client-${Math.floor(now()).toString(36)}-${Math.floor(random() * 1e8).toString(36)}`,
    );

    let roomUnsubscribe = null;
    let roomCode = "";
    let role = "none";
    let sessionPassword = "";
    let participantName = "";

    const state = {
      status: "idle",
      role: "none",
      sessionCode: "",
      sessionName: "",
      hostClientId: "",
      controlMode: "host-only",
      participantsCount: 0,
      participantIds: [],
      participantProfiles: {},
      participantSyncStates: {},
      sessionPackMeta: null,
      sessionMediaMeta: null,
      sharedSessionState: null,
      sharedSessionStateRevision: 0,
      p2pFallbackActive: false,
      p2pFallbackReason: "",
      p2pMeshLimit: 0,
      p2pRelayParticipantsCount: 0,
      p2pRelayParticipantIds: [],
      clientId,
      lastError: "",
      updatedAt: now(),
    };

    function cloneState() {
      return { ...state };
    }

    function emitState() {
      const snapshot = cloneState();
      listeners.forEach((listener) => {
        try {
          listener(snapshot);
        } catch (_) {}
      });
    }

    function patchState(patch) {
      if (!patch || typeof patch !== "object") return;
      Object.assign(state, patch);
      state.updatedAt = now();
      emitState();
    }

    function normalizeControlMode(input) {
      return String(input || "").trim() === "shared-pause"
        ? "shared-pause"
        : "host-only";
    }

    function normalizeCode(input) {
      const normalized = String(input || "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalized)) {
        return "";
      }
      return normalized;
    }

    function normalizeSessionName(input) {
      const value = String(input || "").trim();
      return value || "PoseChrono Session";
    }

    function normalizeParticipantProfiles(input) {
      if (!input || typeof input !== "object") return {};
      const out = {};
      Object.keys(input).forEach((clientIdKey) => {
        const clientIdValue = String(clientIdKey || "").trim();
        if (!clientIdValue) return;
        const nameValue = String(input[clientIdKey] || "")
          .replace(/[\u0000-\u001f\u007f]/g, "")
          .trim()
          .slice(0, 32);
        out[clientIdValue] = nameValue;
      });
      return out;
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

    function normalizeParticipantSyncStates(input) {
      if (!input || typeof input !== "object") return {};
      const out = {};
      Object.keys(input).forEach((clientIdKey) => {
        const clientIdValue = String(clientIdKey || "").trim();
        if (!clientIdValue) return;
        out[clientIdValue] = normalizeParticipantSyncState(input[clientIdKey]);
      });
      return out;
    }

    function normalizeSharedSessionStatePayload(input, fallbackRevision = 0) {
      if (!input || typeof input !== "object") {
        return { payload: null, revision: Math.max(0, Number(fallbackRevision) || 0) };
      }

      const clone = {};
      Object.keys(input).forEach((key) => {
        if (!key) return;
        const value = input[key];
        if (value === undefined) return;
        if (typeof value === "function") return;
        clone[key] = value;
      });

      const inferredRevision = Math.max(
        Number(clone.revision || fallbackRevision || 0) || 0,
        0,
      );
      if (!clone.revision) {
        clone.revision = inferredRevision;
      }
      return {
        payload: clone,
        revision: inferredRevision,
      };
    }

    function normalizeSessionPackMeta(input) {
      if (!input || typeof input !== "object") return null;
      const hash = String(input.hash || "").trim();
      const uploadedBy = String(input.uploadedBy || "").trim();
      const size = Math.max(0, Number(input.size || 0) || 0);
      const updatedAt = Math.max(0, Number(input.updatedAt || 0) || 0);
      const imagesCount = Math.max(0, Number(input.imagesCount || 0) || 0);
      const mediaRefsCount = Math.max(0, Number(input.mediaRefsCount || 0) || 0);
      return {
        hash,
        uploadedBy,
        size,
        updatedAt,
        imagesCount,
        mediaRefsCount,
      };
    }

    function normalizeSessionMediaMeta(input) {
      if (!input || typeof input !== "object") return null;
      return {
        filesCount: Math.max(0, Number(input.filesCount || 0) || 0),
        totalBytes: Math.max(0, Number(input.totalBytes || 0) || 0),
        updatedAt: Math.max(0, Number(input.updatedAt || 0) || 0),
        uploadedBy: String(input.uploadedBy || "").trim(),
      };
    }

    function normalizeP2pFallbackReason(input) {
      const value = String(input || "").trim().toLowerCase();
      if (value === "mesh-limit" || value === "peer-failed") {
        return value;
      }
      return "";
    }

    function applyTransportDiagnostic(diagnostic) {
      if (!diagnostic || typeof diagnostic !== "object") return;
      const kind = String(diagnostic.kind || "").trim().toLowerCase();
      if (kind !== "relay-fallback") return;

      const active = diagnostic.active === true;
      const reason = active
        ? normalizeP2pFallbackReason(diagnostic.reason)
        : "";
      const meshLimit = Math.max(0, Number(diagnostic.meshLimit || 0) || 0);
      const relayParticipantsCount = Math.max(
        0,
        Number(diagnostic.relayParticipantsCount || 0) || 0,
      );
      const relayParticipantIds = Array.isArray(diagnostic.relayParticipantIds)
        ? diagnostic.relayParticipantIds
            .map((id) => String(id || "").trim())
            .filter((id) => !!id)
        : [];

      patchState({
        p2pFallbackActive: active,
        p2pFallbackReason: reason,
        p2pMeshLimit: meshLimit,
        p2pRelayParticipantsCount: relayParticipantsCount,
        p2pRelayParticipantIds: relayParticipantIds,
      });
    }

    function randomCodePart(length) {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let out = "";
      for (let i = 0; i < length; i += 1) {
        out += chars[Math.floor(random() * chars.length)];
      }
      return out;
    }

    function createSessionCode() {
      return `${randomCodePart(4)}-${randomCodePart(4)}`;
    }

    function clearRoomSubscription() {
      if (typeof roomUnsubscribe === "function") {
        try {
          roomUnsubscribe();
        } catch (_) {}
      }
      roomUnsubscribe = null;
    }

    // Transport connection state awareness (reconnection handling)
    if (transport && typeof transport.onConnectionStateChange === "function") {
      transport.onConnectionStateChange((connectionState) => {
        if (connectionState === "reconnecting") {
          if (state.status === "hosting" || state.status === "joined") {
            patchState({ lastError: "websocket-reconnecting" });
          }
          return;
        }

        if (connectionState === "connected") {
          if (!roomCode) return;

          if (role === "host") {
            // Host: re-fetch snapshot to resync
            if (typeof transport.getRoomSnapshot === "function") {
              transport
                .getRoomSnapshot(roomCode)
                .then((snapshot) => {
                  if (snapshot) applyRoomSnapshot(snapshot, "host");
                  patchState({ lastError: "" });
                })
                .catch((err) => {
                  logger("[Sync] host post-reconnect snapshot fetch failed", err);
                });
            }
            return;
          }

          if (role === "participant") {
            // Participant: try snapshot, if not-joined then auto re-join
            const attemptReJoin = () => {
              if (typeof transport.joinRoom !== "function") return;
              transport
                .joinRoom({
                  sessionCode: roomCode,
                  password: sessionPassword,
                  participantName: participantName,
                  clientId,
                })
                .then((snapshot) => {
                  applyRoomSnapshot(snapshot, "participant");
                  patchState({ lastError: "" });
                })
                .catch((joinErr) => {
                  logger("[Sync] post-reconnect re-join failed", joinErr);
                  const joinErrCode = String(joinErr?.message || "");
                  if (
                    joinErrCode === "session-not-found" ||
                    joinErrCode === "session-closed"
                  ) {
                    clearRoomSubscription();
                    roomCode = "";
                    role = "none";
                    sessionPassword = "";
                    participantName = "";
                    patchState({
                      status: "idle",
                      role: "none",
                      sessionCode: "",
                      hostClientId: "",
                      participantsCount: 0,
                      participantIds: [],
                      participantProfiles: {},
                      participantSyncStates: {},
                      sessionPackMeta: null,
                      sessionMediaMeta: null,
                      sharedSessionState: null,
                      sharedSessionStateRevision: 0,
                      p2pFallbackActive: false,
                      p2pFallbackReason: "",
                      p2pMeshLimit: 0,
                      p2pRelayParticipantsCount: 0,
                      p2pRelayParticipantIds: [],
                      lastError: "session-not-found",
                    });
                  }
                });
            };

            if (typeof transport.getRoomSnapshot === "function") {
              transport
                .getRoomSnapshot(roomCode)
                .then((snapshot) => {
                  if (snapshot) applyRoomSnapshot(snapshot, "participant");
                  patchState({ lastError: "" });
                })
                .catch((err) => {
                  const errCode = String(err?.message || "");
                  if (errCode === "not-joined") {
                    attemptReJoin();
                  } else if (errCode === "session-not-found") {
                    clearRoomSubscription();
                    roomCode = "";
                    role = "none";
                    sessionPassword = "";
                    participantName = "";
                    patchState({
                      status: "idle",
                      role: "none",
                      sessionCode: "",
                      hostClientId: "",
                      participantsCount: 0,
                      participantIds: [],
                      participantProfiles: {},
                      participantSyncStates: {},
                      sessionPackMeta: null,
                      sessionMediaMeta: null,
                      sharedSessionState: null,
                      sharedSessionStateRevision: 0,
                      p2pFallbackActive: false,
                      p2pFallbackReason: "",
                      p2pMeshLimit: 0,
                      p2pRelayParticipantsCount: 0,
                      p2pRelayParticipantIds: [],
                      lastError: "session-not-found",
                    });
                  } else {
                    logger("[Sync] participant post-reconnect snapshot failed", err);
                  }
                });
            } else {
              attemptReJoin();
            }
          }
          return;
        }

        if (connectionState === "disconnected") {
          // Transport gave up reconnecting
          if (state.status === "hosting" || state.status === "joined") {
            patchState({ lastError: "websocket-disconnected" });
          }
        }
      });
    }

    function applyRoomSnapshot(snapshot, forceRole = null) {
      if (!snapshot || typeof snapshot !== "object") return;
      const normalizedSharedState = normalizeSharedSessionStatePayload(
        snapshot.sessionState,
        snapshot.sessionStateRevision,
      );
      patchState({
        status:
          forceRole === "host"
            ? "hosting"
            : forceRole === "participant"
              ? "joined"
              : role === "host"
                ? "hosting"
                : "joined",
        role: forceRole || role,
        sessionCode: snapshot.sessionCode || roomCode || "",
        sessionName: snapshot.sessionName || state.sessionName,
        hostClientId: String(snapshot.hostClientId || state.hostClientId || "").trim(),
        controlMode: normalizeControlMode(snapshot.controlMode),
        participantsCount: Math.max(
          0,
          Number(snapshot.participantsCount || 0) || 0,
        ),
        participantIds: Array.isArray(snapshot.participantIds)
          ? snapshot.participantIds
              .map((id) => String(id || "").trim())
              .filter((id) => !!id)
          : [],
        participantProfiles: normalizeParticipantProfiles(snapshot.participantProfiles),
        participantSyncStates: normalizeParticipantSyncStates(
          snapshot.participantSyncStates,
        ),
        sessionPackMeta: normalizeSessionPackMeta(snapshot.sessionPackMeta),
        sessionMediaMeta: normalizeSessionMediaMeta(snapshot.sessionMediaMeta),
        sharedSessionState: normalizedSharedState.payload,
        sharedSessionStateRevision: normalizedSharedState.revision,
        lastError: "",
      });
    }

    function bindRoom(roomSessionCode, roomRole) {
      const code = normalizeCode(roomSessionCode);
      clearRoomSubscription();
      if (!transport || !code || typeof transport.subscribe !== "function") return;

      roomUnsubscribe = transport.subscribe(code, (eventPayload) => {
        if (!eventPayload || typeof eventPayload !== "object") return;

        if (eventPayload.type === "room-updated") {
          applyRoomSnapshot(eventPayload.snapshot, roomRole);
          return;
        }

        if (eventPayload.type === "session-state-updated") {
          const normalizedSharedState = normalizeSharedSessionStatePayload(
            eventPayload.state,
            eventPayload.state?.revision,
          );
          if (
            normalizedSharedState.revision <
            (Number(state.sharedSessionStateRevision || 0) || 0)
          ) {
            return;
          }
          patchState({
            sharedSessionState: normalizedSharedState.payload,
            sharedSessionStateRevision: normalizedSharedState.revision,
            lastError: "",
          });
          return;
        }

        if (eventPayload.type === "transport-diagnostic") {
          applyTransportDiagnostic(eventPayload.diagnostic);
          return;
        }

        if (eventPayload.type === "room-closed") {
          clearRoomSubscription();
          roomCode = "";
          role = "none";
          sessionPassword = "";
          participantName = "";
          const closeSource = String(eventPayload.source || "").trim();
          const errorCode =
            closeSource === "host-left"
              ? "host-disconnected"
              : closeSource === "ttl-expired"
                ? "session-expired"
                : "session-closed";
          patchState({
            status: "idle",
            role: "none",
            sessionCode: "",
            hostClientId: "",
            participantsCount: 0,
            participantIds: [],
            participantProfiles: {},
            participantSyncStates: {},
            sessionPackMeta: null,
            sessionMediaMeta: null,
            sharedSessionState: null,
            sharedSessionStateRevision: 0,
            p2pFallbackActive: false,
            p2pFallbackReason: "",
            p2pMeshLimit: 0,
            p2pRelayParticipantsCount: 0,
            p2pRelayParticipantIds: [],
            lastError: errorCode,
          });
        }
      });
    }

    async function hostSession(input = {}) {
      if (!transport || typeof transport.createRoom !== "function") {
        throw new Error("transport-unavailable");
      }

      const rawRequestedCode = String(input.sessionCode || "").trim();
      const requestedCode = normalizeCode(rawRequestedCode);
      if (rawRequestedCode && !requestedCode) {
        throw new Error("invalid-session-code");
      }
      const sessionCode = requestedCode || createSessionCode();
      const sessionName = normalizeSessionName(input.sessionName);
      const controlMode = normalizeControlMode(input.controlMode);
      const password = String(input.password || "");

      patchState({
        status: "connecting",
        role: "host",
        lastError: "",
      });

      try {
        const snapshot = await transport.createRoom({
          sessionCode,
          sessionName,
          controlMode,
          hostClientId: clientId,
          password,
        });

        role = "host";
        roomCode = sessionCode;
        bindRoom(sessionCode, "host");
        applyRoomSnapshot(snapshot, "host");

        return {
          sessionCode: snapshot.sessionCode,
          snapshot,
        };
      } catch (error) {
        clearRoomSubscription();
        roomCode = "";
        role = "none";
        patchState({
          status: "idle",
          role: "none",
          sessionCode: "",
          hostClientId: "",
          participantsCount: 0,
          participantIds: [],
          participantProfiles: {},
          participantSyncStates: {},
          sessionPackMeta: null,
            sessionMediaMeta: null,
            sharedSessionState: null,
            sharedSessionStateRevision: 0,
            p2pFallbackActive: false,
            p2pFallbackReason: "",
            p2pMeshLimit: 0,
            p2pRelayParticipantsCount: 0,
            p2pRelayParticipantIds: [],
            lastError: String(error?.message || "request-failed"),
          });
        throw error;
      }
    }

    async function joinSession(input = {}) {
      if (!transport || typeof transport.joinRoom !== "function") {
        throw new Error("transport-unavailable");
      }

      const rawSessionCode = String(input.sessionCode || "").trim();
      const sessionCode = normalizeCode(rawSessionCode);
      if (!sessionCode) {
        throw new Error(rawSessionCode ? "invalid-session-code" : "missing-session-code");
      }

      patchState({
        status: "connecting",
        role: "participant",
        lastError: "",
      });

      const joinPassword = String(input.password || "");
      const joinParticipantName = String(input.participantName || "");

      try {
        const snapshot = await transport.joinRoom({
          sessionCode,
          password: joinPassword,
          participantName: joinParticipantName,
          clientId,
        });

        role = "participant";
        roomCode = sessionCode;
        sessionPassword = joinPassword;
        participantName = joinParticipantName;
        bindRoom(sessionCode, "participant");
        applyRoomSnapshot(snapshot, "participant");

        return {
          sessionCode: snapshot.sessionCode,
          snapshot,
        };
      } catch (error) {
        clearRoomSubscription();
        roomCode = "";
        role = "none";
        patchState({
          status: "idle",
          role: "none",
          sessionCode: "",
          hostClientId: "",
          participantsCount: 0,
          participantIds: [],
          participantProfiles: {},
          participantSyncStates: {},
          sessionPackMeta: null,
          sessionMediaMeta: null,
          sharedSessionState: null,
          sharedSessionStateRevision: 0,
          p2pFallbackActive: false,
          p2pFallbackReason: "",
          p2pMeshLimit: 0,
          p2pRelayParticipantsCount: 0,
          p2pRelayParticipantIds: [],
          lastError: String(error?.message || "request-failed"),
        });
        throw error;
      }
    }

    async function leaveSession() {
      if (!roomCode) return { left: false };
      const codeToLeave = roomCode;

      try {
        if (transport && typeof transport.leaveRoom === "function") {
          await transport.leaveRoom({
            sessionCode: codeToLeave,
            clientId,
          });
        }
      } catch (error) {
        logger("[Sync] leaveSession error", error);
      }

      clearRoomSubscription();
      roomCode = "";
      role = "none";
      sessionPassword = "";
      participantName = "";
      patchState({
        status: "idle",
        role: "none",
        sessionCode: "",
        sessionName: "",
        hostClientId: "",
        controlMode: "host-only",
        participantsCount: 0,
        participantIds: [],
        participantProfiles: {},
        participantSyncStates: {},
        sessionPackMeta: null,
        sessionMediaMeta: null,
        sharedSessionState: null,
        sharedSessionStateRevision: 0,
        p2pFallbackActive: false,
        p2pFallbackReason: "",
        p2pMeshLimit: 0,
        p2pRelayParticipantsCount: 0,
        p2pRelayParticipantIds: [],
      });

      return { left: true };
    }

    async function updateSessionMeta(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.updateRoom !== "function") return false;

      const patch = {};
      if (typeof input.sessionName === "string") {
        patch.sessionName = normalizeSessionName(input.sessionName);
      }
      if (typeof input.controlMode === "string") {
        patch.controlMode = normalizeControlMode(input.controlMode);
      }

      const snapshot = await transport.updateRoom({
        sessionCode: roomCode,
        sourceClientId: clientId,
        patch,
      });
      applyRoomSnapshot(snapshot, "host");
      return true;
    }

    async function publishSessionState(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.updateSessionState !== "function") {
        return false;
      }

      const payload =
        input && typeof input === "object" ? { ...input } : {};
      const statePayload = await transport.updateSessionState({
        sessionCode: roomCode,
        sourceClientId: clientId,
        payload,
      });
      const normalizedSharedState = normalizeSharedSessionStatePayload(
        statePayload,
        statePayload?.revision,
      );
      patchState({
        sharedSessionState: normalizedSharedState.payload,
        sharedSessionStateRevision: normalizedSharedState.revision,
        lastError: "",
      });
      return true;
    }

    async function publishSessionPack(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.uploadSessionPack !== "function") {
        return false;
      }
      const payload = input && typeof input === "object" ? { ...input } : {};
      const snapshot = await transport.uploadSessionPack({
        sessionCode: roomCode,
        sourceClientId: clientId,
        pack: payload.pack,
      });
      applyRoomSnapshot(snapshot, "host");
      return state.sessionPackMeta;
    }

    async function fetchSessionPack() {
      if (!roomCode) return null;
      if (!transport || typeof transport.getSessionPack !== "function") {
        return null;
      }
      const result = await transport.getSessionPack({
        sessionCode: roomCode,
        sourceClientId: clientId,
      });
      if (!result || typeof result !== "object") return null;
      return {
        pack: result.pack && typeof result.pack === "object" ? result.pack : null,
        hash: String(result.hash || "").trim(),
        updatedAt: Math.max(0, Number(result.updatedAt || 0) || 0),
        size: Math.max(0, Number(result.size || 0) || 0),
      };
    }

    async function resetSessionMediaPack() {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.resetSessionMediaPack !== "function") {
        return false;
      }
      const snapshot = await transport.resetSessionMediaPack({
        sessionCode: roomCode,
        sourceClientId: clientId,
      });
      applyRoomSnapshot(snapshot, "host");
      return true;
    }

    async function publishSessionMediaFile(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.uploadSessionMediaFile !== "function") {
        return false;
      }
      const snapshot = await transport.uploadSessionMediaFile({
        sessionCode: roomCode,
        sourceClientId: clientId,
        file: input.file || null,
      });
      applyRoomSnapshot(snapshot, "host");
      return true;
    }

    async function fetchSessionMediaManifest() {
      if (!roomCode) return null;
      if (!transport || typeof transport.getSessionMediaManifest !== "function") {
        return null;
      }
      const result = await transport.getSessionMediaManifest({
        sessionCode: roomCode,
        sourceClientId: clientId,
      });
      if (!result || typeof result !== "object") return null;
      return {
        files: Array.isArray(result.files) ? result.files.slice() : [],
        filesCount: Math.max(0, Number(result.filesCount || 0) || 0),
        totalBytes: Math.max(0, Number(result.totalBytes || 0) || 0),
        updatedAt: Math.max(0, Number(result.updatedAt || 0) || 0),
        uploadedBy: String(result.uploadedBy || "").trim(),
      };
    }

    async function fetchSessionMediaFile(input = {}) {
      if (!roomCode) return null;
      if (!transport || typeof transport.getSessionMediaFile !== "function") {
        return null;
      }
      const result = await transport.getSessionMediaFile({
        sessionCode: roomCode,
        sourceClientId: clientId,
        identity: String(input.identity || "").trim(),
      });
      if (!result || typeof result !== "object") return null;
      const file = result.file && typeof result.file === "object" ? result.file : null;
      if (!file) return null;
      return {
        file: {
          identity: String(file.identity || "").trim(),
          name: String(file.name || "").trim(),
          ext: String(file.ext || "").trim().toLowerCase(),
          mime: String(file.mime || "").trim().toLowerCase(),
          size: Math.max(0, Number(file.size || 0) || 0),
          sha256: String(file.sha256 || "").trim().toLowerCase(),
          dataBase64: String(file.dataBase64 || "").trim(),
          updatedAt: Math.max(0, Number(file.updatedAt || 0) || 0),
        },
      };
    }

    async function requestSharedPlayback(input = {}) {
      if (role !== "participant") return false;
      if (!roomCode) return false;
      if (normalizeControlMode(state.controlMode) !== "shared-pause") return false;
      if (!transport || typeof transport.updateSessionState !== "function") {
        return false;
      }

      const requestType =
        String(input.requestType || "").trim() === "play" ? "play" : "pause";
      const payload = {
        requestType,
        isPlaying: requestType === "play",
        reason: String(
          input.reason ||
            (requestType === "play"
              ? "participant-shared-play"
              : "participant-shared-pause"),
        ),
        ts: now(),
      };

      const statePayload = await transport.updateSessionState({
        sessionCode: roomCode,
        sourceClientId: clientId,
        payload,
      });
      const normalizedSharedState = normalizeSharedSessionStatePayload(
        statePayload,
        statePayload?.revision,
      );
      patchState({
        sharedSessionState: normalizedSharedState.payload,
        sharedSessionStateRevision: normalizedSharedState.revision,
        lastError: "",
      });
      return true;
    }

    async function requestSharedPause(input = {}) {
      return requestSharedPlayback({
        ...input,
        requestType: "pause",
      });
    }

    async function updateParticipantState(input = {}) {
      if (!roomCode) return false;
      if (
        !transport ||
        typeof transport.updateParticipantState !== "function"
      ) {
        return false;
      }
      if (role !== "participant" && role !== "host") return false;
      const snapshot = await transport.updateParticipantState({
        sessionCode: roomCode,
        sourceClientId: clientId,
        syncState: input.syncState,
      });
      applyRoomSnapshot(snapshot, role === "host" ? "host" : "participant");
      return true;
    }

    function getState() {
      return cloneState();
    }

    function subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      listeners.add(listener);
      try {
        listener(cloneState());
      } catch (_) {}
      return () => {
        listeners.delete(listener);
      };
    }

    return {
      getState,
      subscribe,
      hostSession,
      joinSession,
      leaveSession,
      updateSessionMeta,
      publishSessionState,
      publishSessionPack,
      fetchSessionPack,
      resetSessionMediaPack,
      publishSessionMediaFile,
      fetchSessionMediaManifest,
      fetchSessionMediaFile,
      requestSharedPlayback,
      requestSharedPause,
      updateParticipantState,
    };
  }

  sharedRoot.createSyncSessionService = createSyncSessionService;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
