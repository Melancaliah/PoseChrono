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
    "forbidden-host-impersonation": "Invalid participant identity.",
    "duplicate-client-id":
      "A participant with the same identity is already connected.",
    "room-full": "Session is full.",
    "already-joined": "Already connected to this session.",
    "not-joined": "You are not connected to this session.",
    "rate-limited": "Too many requests. Please wait a moment.",
    "state-rate-limited": "Sync updates are too frequent. Please slow down.",
    "session-already-exists": "This session code already exists.",
    "transport-unavailable": "Sync transport unavailable.",
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
    "duplicate-client-id": "sync.errorDuplicateClient",
    "room-full": "sync.errorRoomFull",
    "already-joined": "sync.errorAlreadyJoined",
    "not-joined": "sync.errorNotJoined",
    "rate-limited": "sync.errorRateLimited",
    "state-rate-limited": "sync.errorStateRateLimited",
    "session-already-exists": "sync.errorSessionAlreadyExists",
    "transport-unavailable": "sync.errorTransportUnavailable",
    "websocket-tls-required": "sync.errorTlsRequired",
    "websocket-reconnecting": "sync.errorReconnecting",
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
