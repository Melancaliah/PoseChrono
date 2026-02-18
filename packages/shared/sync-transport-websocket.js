(function initPoseChronoSharedSyncTransportWebSocket(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createSyncTransportWebSocket(options = {}) {
    const WebSocketCtor =
      options.WebSocketCtor ||
      (typeof WebSocket !== "undefined" ? WebSocket : null);
    const targetUrl = String(options.url || "").trim();
    const now =
      typeof options.now === "function"
        ? options.now
        : () => Date.now();
    const logger =
      typeof options.logger === "function" ? options.logger : () => {};
    const setTimeoutFn =
      typeof options.setTimeout === "function"
        ? options.setTimeout
        : setTimeout;
    const clearTimeoutFn =
      typeof options.clearTimeout === "function"
        ? options.clearTimeout
        : clearTimeout;
    const requestTimeoutMs = Math.max(
      1000,
      Number(options.requestTimeoutMs || 8000) || 8000,
    );
    const mediaTransferEnabled = options.allowMediaTransfer !== false;

    // Reconnection config
    const maxReconnectAttempts = Math.max(
      0,
      Number(options.maxReconnectAttempts ?? 10) || 0,
    );
    const reconnectBaseDelayMs = Math.max(
      500,
      Number(options.reconnectBaseDelayMs || 1000) || 1000,
    );
    const reconnectMaxDelayMs = Math.max(
      reconnectBaseDelayMs,
      Number(options.reconnectMaxDelayMs || 30000) || 30000,
    );

    if (!WebSocketCtor) {
      throw new Error("websocket-unavailable");
    }
    if (!targetUrl) {
      throw new Error("websocket-url-missing");
    }

    const requireTls = options.requireTls === true;
    const urlProtocol = (targetUrl.split("://")[0] || "").toLowerCase();
    if (requireTls && urlProtocol !== "wss") {
      logger("[SyncWS] TLS required but URL uses " + urlProtocol + "://");
      throw new Error("websocket-tls-required");
    }
    if (!requireTls && urlProtocol === "ws") {
      logger("[SyncWS] Warning: using unencrypted ws:// — consider wss:// for production");
    }

    let socket = null;
    let connectPromise = null;
    let nextRequestId = 1;
    const pending = new Map();
    const sessionSubscriptions = new Map();

    // Reconnection state
    let reconnectAttempt = 0;
    let reconnectTimerId = null;
    let connectionState = "disconnected";
    const connectionStateListeners = new Set();
    let explicitDisconnect = false;

    function emitConnectionState(newState) {
      if (connectionState === newState) return;
      connectionState = newState;
      connectionStateListeners.forEach((listener) => {
        try {
          listener(newState);
        } catch (_) {}
      });
    }

    function onConnectionStateChange(listener) {
      if (typeof listener !== "function") return () => {};
      connectionStateListeners.add(listener);
      return () => {
        connectionStateListeners.delete(listener);
      };
    }

    function cancelReconnect() {
      if (reconnectTimerId) {
        clearTimeoutFn(reconnectTimerId);
        reconnectTimerId = null;
      }
      reconnectAttempt = 0;
    }

    function scheduleReconnect() {
      if (reconnectTimerId) return;
      if (explicitDisconnect) return;
      if (maxReconnectAttempts <= 0) {
        emitConnectionState("disconnected");
        return;
      }
      if (reconnectAttempt >= maxReconnectAttempts) {
        logger(
          "[SyncWS] max reconnect attempts reached (" +
            maxReconnectAttempts +
            ")",
        );
        emitConnectionState("disconnected");
        return;
      }
      reconnectAttempt += 1;
      const delay = Math.min(
        reconnectBaseDelayMs * Math.pow(2, reconnectAttempt - 1),
        reconnectMaxDelayMs,
      );
      logger(
        "[SyncWS] reconnecting in " +
          delay +
          "ms (attempt " +
          reconnectAttempt +
          "/" +
          maxReconnectAttempts +
          ")",
      );
      reconnectTimerId = setTimeoutFn(() => {
        reconnectTimerId = null;
        ensureConnected().catch((error) => {
          logger("[SyncWS] reconnect attempt failed", error);
        });
      }, delay);
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

    function clearPendingRequest(requestId) {
      const entry = pending.get(requestId);
      if (!entry) return null;
      pending.delete(requestId);
      if (entry.timerId) {
        clearTimeoutFn(entry.timerId);
      }
      return entry;
    }

    function rejectAllPending(errorCode) {
      const reason = String(errorCode || "websocket-disconnected");
      pending.forEach((_, requestId) => {
        const entry = clearPendingRequest(requestId);
        if (!entry) return;
        entry.reject(new Error(reason));
      });
    }

    function parseMessage(raw) {
      try {
        if (typeof raw === "string") return JSON.parse(raw);
        if (raw && typeof raw === "object" && "toString" in raw) {
          return JSON.parse(String(raw));
        }
      } catch (_) {}
      return null;
    }

    function emitSessionEvent(eventPayload) {
      if (!eventPayload || typeof eventPayload !== "object") return;
      const eventCode = normalizeSessionCode(
        eventPayload.sessionCode || eventPayload.snapshot?.sessionCode,
      );
      if (!eventCode) return;
      const listeners = sessionSubscriptions.get(eventCode);
      if (!listeners || listeners.size <= 0) return;
      listeners.forEach((listener) => {
        try {
          listener(eventPayload);
        } catch (_) {}
      });
    }

    function sendRaw(message) {
      if (!socket || socket.readyState !== 1) {
        throw new Error("websocket-not-open");
      }
      socket.send(JSON.stringify(message));
    }

    async function ensureConnected() {
      if (socket && socket.readyState === 1) {
        return socket;
      }
      if (connectPromise) {
        return connectPromise;
      }

      emitConnectionState(
        reconnectAttempt > 0 ? "reconnecting" : "connecting",
      );

      connectPromise = new Promise((resolve, reject) => {
        const ws = new WebSocketCtor(targetUrl);
        let settled = false;

        ws.onopen = () => {
          socket = ws;
          settled = true;
          connectPromise = null;
          reconnectAttempt = 0;
          cancelReconnect();
          emitConnectionState("connected");

          sessionSubscriptions.forEach((_, sessionCode) => {
            try {
              sendRaw({
                type: "notify",
                action: "subscribe",
                payload: { sessionCode },
              });
            } catch (_) {}
          });

          resolve(ws);
        };

        ws.onmessage = (event) => {
          const payload = parseMessage(event && event.data);
          if (!payload || typeof payload !== "object") return;

          if (payload.type === "response") {
            const requestId = String(payload.id || "");
            const entry = clearPendingRequest(requestId);
            if (!entry) return;

            if (payload.ok === false) {
              const errorCode = String(payload.error || "request-failed");
              if (errorCode === "unknown-action") {
                const actionName = String(entry.action || "").trim() || "unknown";
                entry.reject(new Error(`unknown-action:${actionName}`));
              } else {
                entry.reject(new Error(errorCode));
              }
              return;
            }

            entry.resolve(payload.result);
            return;
          }

          if (payload.type === "event") {
            emitSessionEvent(payload.event || payload.payload || null);
          }
        };

        ws.onerror = (event) => {
          logger("[SyncWS] socket error", event);
          if (!settled) {
            connectPromise = null;
            reject(new Error("websocket-connect-failed"));
          }
        };

        ws.onclose = () => {
          if (socket === ws) {
            socket = null;
          }
          if (!settled) {
            connectPromise = null;
            reject(new Error("websocket-connect-closed"));
            if (!explicitDisconnect) {
              emitConnectionState("reconnecting");
              scheduleReconnect();
            }
            return;
          }
          rejectAllPending("websocket-disconnected");
          if (!explicitDisconnect) {
            emitConnectionState("reconnecting");
            scheduleReconnect();
          }
        };
      });

      return connectPromise;
    }

    async function request(action, payload = {}) {
      await ensureConnected();
      const requestId = String(nextRequestId++);
      const sentAt = now();

      return new Promise((resolve, reject) => {
        const timerId = setTimeoutFn(() => {
          const entry = clearPendingRequest(requestId);
          if (!entry) return;
          entry.reject(new Error("websocket-request-timeout"));
        }, requestTimeoutMs);

        pending.set(requestId, {
          resolve,
          reject,
          timerId,
          action: String(action || ""),
          sentAt,
        });

        try {
          sendRaw({
            type: "request",
            id: requestId,
            action,
            payload,
          });
        } catch (error) {
          clearPendingRequest(requestId);
          reject(error);
        }
      });
    }

    async function notify(action, payload = {}) {
      await ensureConnected();
      sendRaw({
        type: "notify",
        action,
        payload,
      });
      return true;
    }

    function subscribe(sessionCode, handler) {
      if (typeof handler !== "function") {
        return () => {};
      }
      const normalizedCode = normalizeSessionCode(sessionCode);
      if (!normalizedCode) {
        return () => {};
      }

      if (!sessionSubscriptions.has(normalizedCode)) {
        sessionSubscriptions.set(normalizedCode, new Set());
      }
      const listeners = sessionSubscriptions.get(normalizedCode);
      const wasEmpty = listeners.size <= 0;
      listeners.add(handler);

      if (wasEmpty) {
        void notify("subscribe", { sessionCode: normalizedCode }).catch((error) => {
          logger("[SyncWS] subscribe notify failed", error);
        });
      }

      return () => {
        const active = sessionSubscriptions.get(normalizedCode);
        if (!active) return;
        active.delete(handler);
        if (active.size <= 0) {
          sessionSubscriptions.delete(normalizedCode);
          void notify("unsubscribe", { sessionCode: normalizedCode }).catch((error) => {
            logger("[SyncWS] unsubscribe notify failed", error);
          });
        }
      };
    }

    function disconnect() {
      explicitDisconnect = true;
      cancelReconnect();
      if (socket) {
        try {
          socket.close();
        } catch (_) {}
        socket = null;
      }
      connectPromise = null;
      rejectAllPending("websocket-disconnected");
      emitConnectionState("disconnected");
    }

    return {
      createRoom(payload) {
        return request("createRoom", payload || {});
      },
      joinRoom(payload) {
        return request("joinRoom", payload || {});
      },
      leaveRoom(payload) {
        return request("leaveRoom", payload || {});
      },
      updateRoom(payload) {
        return request("updateRoom", payload || {});
      },
      updateSessionState(payload) {
        return request("updateSessionState", payload || {});
      },
      updateParticipantState(payload) {
        return request("updateParticipantState", payload || {});
      },
      uploadSessionPack(payload) {
        return request("uploadSessionPack", payload || {});
      },
      getSessionPack(payload) {
        return request("getSessionPack", payload || {});
      },
      resetSessionMediaPack(payload) {
        if (!mediaTransferEnabled) {
          return Promise.reject(new Error("media-transfer-disabled"));
        }
        return request("resetSessionMediaPack", payload || {});
      },
      uploadSessionMediaFile(payload) {
        if (!mediaTransferEnabled) {
          return Promise.reject(new Error("media-transfer-disabled"));
        }
        return request("uploadSessionMediaFile", payload || {});
      },
      getSessionMediaManifest(payload) {
        if (!mediaTransferEnabled) {
          return Promise.reject(new Error("media-transfer-disabled"));
        }
        return request("getSessionMediaManifest", payload || {});
      },
      getSessionMediaFile(payload) {
        if (!mediaTransferEnabled) {
          return Promise.reject(new Error("media-transfer-disabled"));
        }
        return request("getSessionMediaFile", payload || {});
      },
      sendRtcSignal(payload) {
        return request("sendRtcSignal", payload || {});
      },
      getRoomSnapshot(sessionCode) {
        return request("getRoomSnapshot", {
          sessionCode: normalizeSessionCode(sessionCode),
        });
      },
      subscribe,
      disconnect,
      onConnectionStateChange,
      getConnectionState() {
        return connectionState;
      },
    };
  }

  sharedRoot.createSyncTransportWebSocket = createSyncTransportWebSocket;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
