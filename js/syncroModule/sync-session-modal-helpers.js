(function initPoseChronoSyncSessionModalHelpers(globalScope) {
  "use strict";

  const globalObj =
    globalScope || (typeof window !== "undefined" ? window : globalThis);

  const CONTROL_MODE_OPTIONS = Object.freeze([
    {
      value: "host-only",
      key: "sync.controlModeHostOnly",
      fallback: "Host only",
    },
    {
      value: "shared-pause",
      key: "sync.controlModeSharedPause",
      fallback: "Shared pause",
    },
  ]);

  function getControlModeConfig(controlMode, options = CONTROL_MODE_OPTIONS) {
    const normalized = String(controlMode || "").trim();
    return (
      options.find((option) => option.value === normalized) || options[0] || null
    );
  }

  function normalizeSessionCode(input) {
    return String(input || "").trim().toUpperCase();
  }

  function isSessionCodeFormatValid(code) {
    return /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(String(code || "").trim());
  }

  function flashInputError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove("shake", "input-border-error");
    if (typeof inputEl.focus === "function") {
      inputEl.focus();
    }
    void inputEl.offsetWidth;
    inputEl.classList.add("shake", "input-border-error");
    setTimeout(() => {
      inputEl.classList.remove("shake", "input-border-error");
    }, 420);
  }

  const ERROR_MESSAGES = Object.freeze({
    "missing-session-code": "Please enter a session code first.",
    "invalid-session-code": "Invalid session code format.",
    "session-not-found": "Session not found.",
    "invalid-password": "Invalid password.",
    "invalid-client-id": "Invalid participant identity.",
    "invalid-host-client-id": "Invalid host identity.",
    "invalid-session-state": "Invalid sync payload.",
    "session-state-too-large": "Sync payload too large.",
    "invalid-request": "Invalid sync request.",
    "invalid-session-pack": "Invalid session pack.",
    "session-pack-too-large": "Session pack is too large.",
    "session-pack-not-found": "No online session pack available yet.",
    "invalid-session-media": "Invalid session media payload.",
    "session-media-too-large": "Session media payload is too large.",
    "session-media-not-found": "No online session media available yet.",
    "session-media-file-not-found": "Online session media file not found.",
    "session-media-unsupported-type": "Unsupported media format for online sync.",
    "forbidden-host-impersonation": "Invalid participant identity.",
    "forbidden-not-host": "Only the host can perform this action.",
    "duplicate-client-id":
      "A participant with the same identity is already connected.",
    "room-full": "Session is full.",
    "already-joined": "Already connected to this session.",
    "not-joined": "You are not connected to this session.",
    "rate-limited": "Too many requests. Please wait a moment.",
    "state-rate-limited": "Sync updates are too frequent. Please slow down.",
    "rtc-rate-limited": "Real-time signaling is too frequent. Please slow down.",
    "media-transfer-disabled": "Online media transfer is disabled on this relay.",
    "session-already-exists": "This session code already exists.",
    "transport-unavailable": "Sync transport unavailable.",
    "websocket-unavailable": "WebSocket unavailable in this runtime.",
    "websocket-url-missing": "WebSocket URL is missing.",
    "websocket-not-open": "WebSocket is not connected.",
    "websocket-connect-failed": "WebSocket connection failed.",
    "websocket-connect-closed": "WebSocket closed during connection.",
    "websocket-disconnected": "WebSocket disconnected.",
    "websocket-request-timeout": "WebSocket request timeout.",
    "webrtc-unavailable": "WebRTC unavailable in this runtime.",
    "webrtc-signaling-unavailable": "WebRTC signaling unavailable.",
    "webrtc-signaling-url-missing": "WebRTC signaling URL is missing.",
    "webrtc-peer-failed": "WebRTC peer connection failed.",
    "webrtc-not-ready": "WebRTC peer channel is not ready.",
    "webrtc-media-unavailable": "Host media is not available on P2P yet.",
    "webrtc-file-transfer-failed": "P2P media transfer failed. Falling back to relay.",
    "webrtc-file-transfer-incomplete":
      "P2P media transfer incomplete. Falling back to relay.",
    "webrtc-request-timeout": "P2P request timed out. Falling back to relay.",
    "invalid-rtc-signal": "Invalid WebRTC signaling payload.",
    "request-failed": "Sync request failed.",
    "session-pack-integrity-failed": "Online pack integrity check failed.",
    "session-closed": "The host closed this session.",
    "websocket-tls-required": "Secure connection (wss://) required. Check relay URL.",
    "websocket-reconnecting": "Reconnecting to sync server...",
    "host-disconnected": "The host disconnected.",
    "session-expired": "Session expired.",
  });

  const ERROR_CODE_TO_I18N_KEY = Object.freeze({
    "missing-session-code": "sync.errorMissingSessionCode",
    "invalid-session-code": "sync.errorInvalidSessionCode",
    "session-not-found": "sync.errorSessionNotFound",
    "invalid-password": "sync.errorInvalidPassword",
    "forbidden-host-impersonation": "sync.errorForbiddenIdentity",
    "forbidden-not-host": "sync.errorDefault",
    "duplicate-client-id": "sync.errorDuplicateClient",
    "room-full": "sync.errorRoomFull",
    "already-joined": "sync.errorAlreadyJoined",
    "not-joined": "sync.errorNotJoined",
    "rate-limited": "sync.errorRateLimited",
    "state-rate-limited": "sync.errorStateRateLimited",
    "rtc-rate-limited": "sync.errorRtcRateLimited",
    "media-transfer-disabled": "sync.errorMediaTransferDisabled",
    "session-already-exists": "sync.errorSessionAlreadyExists",
    "transport-unavailable": "sync.errorTransportUnavailable",
    "websocket-tls-required": "sync.errorTlsRequired",
    "websocket-reconnecting": "sync.errorReconnecting",
    "webrtc-unavailable": "sync.errorTransportUnavailable",
    "webrtc-signaling-unavailable": "sync.errorTransportUnavailable",
    "webrtc-signaling-url-missing": "sync.errorTransportUnavailable",
    "webrtc-peer-failed": "sync.errorDefault",
    "webrtc-not-ready": "sync.errorDefault",
    "webrtc-media-unavailable": "sync.errorDefault",
    "webrtc-file-transfer-failed": "sync.errorDefault",
    "webrtc-file-transfer-incomplete": "sync.errorDefault",
    "webrtc-request-timeout": "sync.errorDefault",
    "invalid-rtc-signal": "sync.errorDefault",
    "host-disconnected": "sync.errorHostDisconnected",
    "session-expired": "sync.errorSessionExpired",
  });

  function getErrorMessage(error, getText) {
    const resolveText =
      typeof getText === "function"
        ? getText
        : (_key, fallback) => String(fallback || "");
    const code =
      error && typeof error === "object" && typeof error.message === "string"
        ? error.message
        : "";
    if (code === "unknown-action" || code.startsWith("unknown-action:")) {
      const actionName = code.includes(":")
        ? String(code.split(":")[1] || "").trim()
        : "";
      const fallback = actionName
        ? `Sync protocol mismatch (unsupported action: ${actionName}). Restart relay and update both apps.`
        : "Sync protocol mismatch. Restart relay and update both apps.";
      return resolveText("sync.errorProtocolMismatch", fallback);
    }
    const i18nKey = ERROR_CODE_TO_I18N_KEY[code];
    if (i18nKey) {
      return resolveText(i18nKey, ERROR_MESSAGES[code] || "");
    }
    if (ERROR_MESSAGES[code]) {
      return resolveText("sync.errorDefault", ERROR_MESSAGES[code]);
    }
    return resolveText("sync.errorDefault", "Sync action failed.");
  }

  function closeControlModeMenu(modal) {
    if (!modal) return;
    const selectRoot = modal.querySelector("#sync-session-control-mode-select");
    const trigger = modal.querySelector("#sync-session-control-mode-trigger");
    const menu = modal.querySelector("#sync-session-control-mode-menu");

    if (selectRoot) {
      selectRoot.classList.remove("is-open");
    }
    if (menu) {
      menu.hidden = true;
    }
    if (trigger) {
      trigger.setAttribute("aria-expanded", "false");
    }
  }

  function toggleControlModeMenu(modal) {
    if (!modal) return;
    const selectRoot = modal.querySelector("#sync-session-control-mode-select");
    const trigger = modal.querySelector("#sync-session-control-mode-trigger");
    const menu = modal.querySelector("#sync-session-control-mode-menu");
    if (!selectRoot || !trigger || !menu) return;

    const nextOpenState = menu.hidden;
    menu.hidden = !nextOpenState;
    selectRoot.classList.toggle("is-open", nextOpenState);
    trigger.setAttribute("aria-expanded", nextOpenState ? "true" : "false");
  }

  function updateControlModeSelect(modal, nextControlMode = null, input = {}) {
    const options = Array.isArray(input.options)
      ? input.options
      : CONTROL_MODE_OPTIONS;
    const getText =
      typeof input.getText === "function"
        ? input.getText
        : (_key, fallback) => String(fallback || "");

    if (!modal || !options.length) {
      return options[0]?.value || "host-only";
    }

    const selectRoot = modal.querySelector("#sync-session-control-mode-select");
    if (!selectRoot) return options[0].value;

    const currentValue = nextControlMode || selectRoot.dataset.value;
    const activeConfig = getControlModeConfig(currentValue, options) || options[0];
    selectRoot.dataset.value = activeConfig.value;

    const valueEl = selectRoot.querySelector(".sync-session-control-mode-value");
    if (valueEl) {
      valueEl.setAttribute("data-i18n", activeConfig.key);
      valueEl.textContent = getText(activeConfig.key, activeConfig.fallback);
    }

    selectRoot
      .querySelectorAll(".sync-session-control-mode-option[data-sync-control-mode]")
      .forEach((optionEl) => {
        const isSelected = optionEl.dataset.syncControlMode === activeConfig.value;
        optionEl.classList.toggle("active", isSelected);
        optionEl.setAttribute("aria-selected", isSelected ? "true" : "false");
      });

    const trigger = selectRoot.querySelector("#sync-session-control-mode-trigger");
    const menu = selectRoot.querySelector("#sync-session-control-mode-menu");
    if (trigger) {
      trigger.setAttribute("aria-expanded", menu && !menu.hidden ? "true" : "false");
    }

    return activeConfig.value;
  }

  function getControlModeValue(modal, options = CONTROL_MODE_OPTIONS) {
    if (!modal || !options.length) return options[0]?.value || "host-only";
    const selectRoot = modal.querySelector("#sync-session-control-mode-select");
    const current = selectRoot?.dataset?.value || options[0].value;
    return (getControlModeConfig(current, options) || options[0]).value;
  }

  globalObj.PoseChronoSyncroModule = {
    ...(globalObj.PoseChronoSyncroModule || {}),
    syncSessionModalHelpers: {
      CONTROL_MODE_OPTIONS,
      getControlModeConfig,
      normalizeSessionCode,
      isSessionCodeFormatValid,
      flashInputError,
      getErrorMessage,
      closeControlModeMenu,
      toggleControlModeMenu,
      updateControlModeSelect,
      getControlModeValue,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
