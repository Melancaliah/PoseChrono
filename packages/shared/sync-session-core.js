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
    const rawLogger =
      typeof options.logger === "function" ? options.logger : () => {};
    // Codes d'erreur transitoires/attendus à ne pas logger en bruit (rate limiting,
    // déconnexions WS pendant reconnexion, etc.). Ils sont gérés par retry interne
    // et n'ont aucun impact visible.
    const BENIGN_ERROR_CODES = new Set([
      "state-rate-limited",
      "rate-limited",
      "websocket-not-open",
      "websocket-disconnected",
      "websocket-connect-failed",
      "websocket-connect-closed",
      "websocket-request-timeout",
      "transfer-cancelled",
    ]);
    function logger(label, err) {
      try {
        const code = String(err?.message || err || "").trim();
        if (code && BENIGN_ERROR_CODES.has(code)) return;
      } catch (_) {}
      try {
        rawLogger(label, err);
      } catch (_) {}
    }
    const transport =
      options.transport ||
      (typeof sharedRoot.createSyncTransportMock === "function"
        ? sharedRoot.createSyncTransportMock()
        : null);

    const listeners = new Set();
    const drawingSyncListeners = new Set();
    const generateSecureClientId = () => {
      try {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          return `client-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
        }
      } catch (_) {}
      return `client-${Math.floor(now()).toString(36)}-${Math.floor(random() * 1e8).toString(36)}`;
    };
    const clientId = String(options.clientId || generateSecureClientId());

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
      if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const values = new Uint32Array(length);
        crypto.getRandomValues(values);
        for (let i = 0; i < length; i++) out += chars[values[i] % chars.length];
      } else {
        for (let i = 0; i < length; i++) {
          out += chars[Math.floor(random() * chars.length)];
        }
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

    function resetToIdle(lastError = "") {
      role = "none";
      roomCode = "";
      sessionPassword = "";
      participantName = "";
      clearRoomSubscription();
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
        lastError,
      });
    }

    function resetP2pFallbackIndicators() {
      // Effacer les indicateurs de fallback P2P obsolètes après une reconnexion WS.
      // Le transport WebRTC réémettra un diagnostic frais si le mesh est encore dégradé.
      if (
        !state.p2pFallbackActive &&
        !state.p2pFallbackReason &&
        state.p2pRelayParticipantsCount === 0 &&
        (!Array.isArray(state.p2pRelayParticipantIds) ||
          state.p2pRelayParticipantIds.length === 0)
      ) {
        return;
      }
      patchState({
        p2pFallbackActive: false,
        p2pFallbackReason: "",
        p2pRelayParticipantsCount: 0,
        p2pRelayParticipantIds: [],
      });
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
            const reconnectRole = role;
            const reconnectRoomCode = roomCode;
            // Host: re-fetch snapshot to resync
            if (typeof transport.getRoomSnapshot === "function") {
              transport
                .getRoomSnapshot(roomCode)
                .then((snapshot) => {
                  if (role !== reconnectRole || roomCode !== reconnectRoomCode) return;
                  if (snapshot) applyRoomSnapshot(snapshot, "host");
                  resetP2pFallbackIndicators();
                  patchState({ lastError: "" });
                })
                .catch((err) => {
                  if (role !== reconnectRole || roomCode !== reconnectRoomCode) return;
                  logger("[Sync] host post-reconnect snapshot fetch failed", err);
                  const errCode = String(err?.message || "");
                  // Après reconnexion WS, la room a été détruite (le host a été détaché du serveur)
                  // → "not-joined" ou "session-not-found" → retour à l'état idle
                  if (errCode === "not-joined" || errCode === "session-not-found") {
                    resetToIdle("session-not-found");
                  } else {
                    // Erreur inattendue : WS reconnecté mais snapshot échoué.
                    // Effacer l'indicateur "reconnexion en cours" pour ne pas bloquer l'UI.
                    patchState({ lastError: "" });
                  }
                });
            }
            return;
          }

          if (role === "participant") {
            const reconnectRole = role;
            const reconnectRoomCode = roomCode;
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
                  if (role !== reconnectRole || roomCode !== reconnectRoomCode) return;
                  applyRoomSnapshot(snapshot, "participant");
                  resetP2pFallbackIndicators();
                  patchState({ lastError: "" });
                })
                .catch((joinErr) => {
                  if (role !== reconnectRole || roomCode !== reconnectRoomCode) return;
                  logger("[Sync] post-reconnect re-join failed", joinErr);
                  const joinErrCode = String(joinErr?.message || "");
                  if (
                    joinErrCode === "session-not-found" ||
                    joinErrCode === "session-closed"
                  ) {
                    resetToIdle("session-not-found");
                  }
                });
            };

            if (typeof transport.getRoomSnapshot === "function") {
              transport
                .getRoomSnapshot(roomCode)
                .then((snapshot) => {
                  if (role !== reconnectRole || roomCode !== reconnectRoomCode) return;
                  if (snapshot) applyRoomSnapshot(snapshot, "participant");
                  resetP2pFallbackIndicators();
                  patchState({ lastError: "" });
                })
                .catch((err) => {
                  if (role !== reconnectRole || roomCode !== reconnectRoomCode) return;
                  const errCode = String(err?.message || "");
                  if (errCode === "not-joined") {
                    attemptReJoin();
                  } else if (errCode === "session-not-found") {
                    resetToIdle("session-not-found");
                  } else {
                    logger("[Sync] participant post-reconnect snapshot failed", err);
                    // Erreur inattendue : WS reconnecté mais snapshot échoué.
                    // Effacer l'indicateur "reconnexion en cours" pour ne pas bloquer l'UI.
                    patchState({ lastError: "" });
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
      if (roomCode && snapshot.sessionCode && normalizeCode(snapshot.sessionCode) !== roomCode) return;
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

        if (eventPayload.type === "drawing-sync") {
          if (eventPayload.sourceClientId === clientId) return;
          drawingSyncListeners.forEach((listener) => {
            try {
              listener(eventPayload);
            } catch (_) {}
          });
          return;
        }

        if (eventPayload.type === "room-closed") {
          const closeSource = String(eventPayload.source || "").trim();
          const errorCode =
            closeSource === "host-left"
              ? "host-disconnected"
              : closeSource === "ttl-expired"
                ? "session-expired"
                : "session-closed";
          resetToIdle(errorCode);
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
      const hostParticipantName = String(input.participantName || "").trim().slice(0, 32);

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
          hostDisplayName: hostParticipantName,
        });

        role = "host";
        roomCode = sessionCode;
        if (hostParticipantName) {
          participantName = hostParticipantName;
        }
        bindRoom(sessionCode, "host");
        applyRoomSnapshot(snapshot, "host");

        // Injecter le pseudo de l'hôte dans les profils participants
        if (hostParticipantName) {
          patchState({
            participantProfiles: Object.assign({}, state.participantProfiles, {
              [clientId]: hostParticipantName,
            }),
          });
        }

        return {
          sessionCode: snapshot.sessionCode,
          snapshot,
        };
      } catch (error) {
        resetToIdle(String(error?.message || "request-failed"));
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
        resetToIdle(String(error?.message || "request-failed"));
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

      resetToIdle();

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

      try {
        const snapshot = await transport.updateRoom({
          sessionCode: roomCode,
          sourceClientId: clientId,
          patch,
        });
        applyRoomSnapshot(snapshot, "host");
        return true;
      } catch (err) {
        logger("[SyncSession] updateSessionMeta failed", err);
        return false;
      }
    }

    async function publishSessionState(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.updateSessionState !== "function") {
        return false;
      }

      const payload =
        input && typeof input === "object" ? { ...input } : {};
      try {
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
      } catch (err) {
        logger("[SyncSession] publishSessionState failed", err);
        return false;
      }
    }

    async function publishSessionPack(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.uploadSessionPack !== "function") {
        return false;
      }
      const payload = input && typeof input === "object" ? { ...input } : {};
      try {
        const snapshot = await transport.uploadSessionPack({
          sessionCode: roomCode,
          sourceClientId: clientId,
          pack: payload.pack,
        });
        applyRoomSnapshot(snapshot, "host");
        return state.sessionPackMeta;
      } catch (err) {
        logger("[SyncSession] publishSessionPack failed", err);
        return false;
      }
    }

    async function fetchSessionPack() {
      if (!roomCode) return null;
      if (!transport || typeof transport.getSessionPack !== "function") {
        return null;
      }
      try {
        const result = await transport.getSessionPack({
          sessionCode: roomCode,
          sourceClientId: clientId,
        });
        if (!result || typeof result !== "object") return null;
        if (state.lastError) {
          patchState({ lastError: "" });
        }
        return {
          pack: result.pack && typeof result.pack === "object" ? result.pack : null,
          hash: String(result.hash || "").trim(),
          updatedAt: Math.max(0, Number(result.updatedAt || 0) || 0),
          size: Math.max(0, Number(result.size || 0) || 0),
        };
      } catch (err) {
        logger("[SyncSession] fetchSessionPack failed", err);
        return null;
      }
    }

    async function resetSessionMediaPack() {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.resetSessionMediaPack !== "function") {
        return false;
      }
      try {
        const snapshot = await transport.resetSessionMediaPack({
          sessionCode: roomCode,
          sourceClientId: clientId,
        });
        applyRoomSnapshot(snapshot, "host");
        return true;
      } catch (err) {
        logger("[SyncSession] resetSessionMediaPack failed", err);
        return false;
      }
    }

    async function publishSessionMediaFile(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (!transport || typeof transport.uploadSessionMediaFile !== "function") {
        return false;
      }
      try {
        const snapshot = await transport.uploadSessionMediaFile({
          sessionCode: roomCode,
          sourceClientId: clientId,
          file: input.file || null,
        });
        applyRoomSnapshot(snapshot, "host");
        return true;
      } catch (err) {
        logger("[SyncSession] publishSessionMediaFile failed", err);
        throw err;
      }
    }

    async function setSessionMediaUploadStatus(input = {}) {
      if (role !== "host") return false;
      if (!roomCode) return false;
      if (
        !transport ||
        typeof transport.setSessionMediaUploadStatus !== "function"
      ) {
        return false;
      }
      try {
        const snapshot = await transport.setSessionMediaUploadStatus({
          sessionCode: roomCode,
          sourceClientId: clientId,
          inProgress: !!input.inProgress,
          total: Math.max(0, Math.floor(Number(input.total || 0) || 0)),
        });
        applyRoomSnapshot(snapshot, "host");
        return true;
      } catch (err) {
        logger("[SyncSession] setSessionMediaUploadStatus failed", err);
        return false;
      }
    }

    async function fetchSessionMediaManifest() {
      if (!roomCode) return null;
      if (!transport || typeof transport.getSessionMediaManifest !== "function") {
        return null;
      }
      try {
        const result = await transport.getSessionMediaManifest({
          sessionCode: roomCode,
          sourceClientId: clientId,
        });
        if (!result || typeof result !== "object") return null;
        if (state.lastError) {
          patchState({ lastError: "" });
        }
        return {
          files: Array.isArray(result.files) ? result.files.slice() : [],
          filesCount: Math.max(0, Number(result.filesCount || 0) || 0),
          totalBytes: Math.max(0, Number(result.totalBytes || 0) || 0),
          updatedAt: Math.max(0, Number(result.updatedAt || 0) || 0),
          uploadedBy: String(result.uploadedBy || "").trim(),
        };
      } catch (err) {
        logger("[SyncSession] fetchSessionMediaManifest failed", err);
        return null;
      }
    }

    async function fetchSessionMediaFile(input = {}) {
      if (!roomCode) return null;
      if (!transport || typeof transport.getSessionMediaFile !== "function") {
        return null;
      }
      try {
        const result = await transport.getSessionMediaFile({
          sessionCode: roomCode,
          sourceClientId: clientId,
          identity: String(input.identity || "").trim(),
        });
        if (!result || typeof result !== "object") return null;
        const file = result.file && typeof result.file === "object" ? result.file : null;
        if (!file) return null;
        if (state.lastError) {
          patchState({ lastError: "" });
        }
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
      } catch (err) {
        logger("[SyncSession] fetchSessionMediaFile failed", err);
        return null;
      }
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

      try {
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
      } catch (err) {
        logger("[SyncSession] requestSharedPlayback failed", err);
        return false;
      }
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
      try {
        const snapshot = await transport.updateParticipantState({
          sessionCode: roomCode,
          sourceClientId: clientId,
          syncState: input.syncState,
        });
        applyRoomSnapshot(snapshot, role === "host" ? "host" : "participant");
        return true;
      } catch (err) {
        logger("[SyncSession] updateParticipantState failed", err);
        return false;
      }
    }

    async function updateParticipantProfile(input = {}) {
      if (!roomCode) return false;
      if (
        !transport ||
        typeof transport.updateParticipantProfile !== "function"
      ) {
        return false;
      }
      if (role !== "participant" && role !== "host") return false;
      const displayName = String(input.displayName || "").trim();
      if (!displayName) return false;
      try {
        const snapshot = await transport.updateParticipantProfile({
          sessionCode: roomCode,
          sourceClientId: clientId,
          displayName,
        });
        participantName = displayName;
        applyRoomSnapshot(snapshot, role === "host" ? "host" : "participant");
        return true;
      } catch (err) {
        logger("[SyncSession] updateParticipantProfile failed", err);
        return false;
      }
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

    async function sendDrawingSync(msgType, data) {
      if (!transport || typeof transport.sendDrawingSync !== "function") return false;
      if (!roomCode) return false;
      if (role !== "host" && role !== "participant") return false;
      try {
        await transport.sendDrawingSync({
          sessionCode: roomCode,
          sourceClientId: clientId,
          msgType: String(msgType || ""),
          data: data || {},
        });
        return true;
      } catch (err) {
        logger("[SyncSession] sendDrawingSync failed", err);
        return false;
      }
    }

    function onDrawingSync(listener) {
      if (typeof listener !== "function") return () => {};
      drawingSyncListeners.add(listener);
      return () => {
        drawingSyncListeners.delete(listener);
      };
    }

    function offDrawingSync(listener) {
      drawingSyncListeners.delete(listener);
    }

    function getClientId() {
      return clientId;
    }

    return {
      getState,
      getClientId,
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
      setSessionMediaUploadStatus,
      fetchSessionMediaManifest,
      fetchSessionMediaFile,
      requestSharedPlayback,
      requestSharedPause,
      updateParticipantState,
      updateParticipantProfile,
      sendDrawingSync,
      onDrawingSync,
      offDrawingSync,
    };
  }

  sharedRoot.createSyncSessionService = createSyncSessionService;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
