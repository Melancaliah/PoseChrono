(function initPoseChronoSyncroModule(globalScope) {
  "use strict";

  const globalObj =
    globalScope || (typeof window !== "undefined" ? window : globalThis);

  const existing = globalObj.PoseChronoSyncroModule || {};

  const PREF_KEYS = {
    syncGuestActionNotificationsEnabled: "syncGuestActionNotificationsEnabled",
  };

  function readPreference(preferencesApi, fallback = true) {
    if (!preferencesApi || typeof preferencesApi.get !== "function") {
      return !!fallback;
    }
    return (
      preferencesApi.get(PREF_KEYS.syncGuestActionNotificationsEnabled, fallback) !==
      false
    );
  }

  function writePreference(preferencesApi, enabled) {
    if (!preferencesApi || typeof preferencesApi.set !== "function") {
      return !!enabled;
    }
    return (
      preferencesApi.set(
        PREF_KEYS.syncGuestActionNotificationsEnabled,
        !!enabled,
      ) !== false
    );
  }

  function syncCheckbox(inputEl, preferencesApi, fallback = true) {
    if (!inputEl) return false;
    const isCheckbox =
      inputEl.tagName === "INPUT" &&
      String(inputEl.type || "").toLowerCase() === "checkbox";
    if (!isCheckbox) return false;
    inputEl.checked = readPreference(preferencesApi, fallback);
    return true;
  }

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

  function getStatusElement(modal) {
    if (!modal) return null;
    return modal.querySelector("#sync-session-status");
  }

  function getNetworkStatusElement(modal) {
    if (!modal) return null;
    return modal.querySelector("#sync-session-network-status");
  }

  function setNetworkStatus(modal, message = "", tone = "", tooltip = "") {
    const networkEl = getNetworkStatusElement(modal);
    if (!networkEl) return;
    networkEl.classList.remove("is-success", "is-warning", "is-error");
    if (tone === "success") networkEl.classList.add("is-success");
    if (tone === "warning") networkEl.classList.add("is-warning");
    if (tone === "error") networkEl.classList.add("is-error");
    networkEl.textContent = String(message || "");
    const tooltipText = String(tooltip || "").trim();
    if (tooltipText) {
      networkEl.setAttribute("data-tooltip", tooltipText);
    } else {
      networkEl.removeAttribute("data-tooltip");
    }
    networkEl.removeAttribute("title");
  }

  function isLoopbackOrUnshareableWsUrl(value) {
    try {
      const parsed = new URL(String(value || "").trim());
      const host = String(parsed.hostname || "").trim().toLowerCase();
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "::1" ||
        host === "0.0.0.0" ||
        host === "::"
      );
    } catch (_) {
      return false;
    }
  }

  function updateNetworkStatus(input = {}) {
    const modal = input.modal || null;
    if (!modal) return false;
    const transportMode = String(input.transportMode || "none").trim().toLowerCase();
    const transportUrl = String(input.transportUrl || "").trim();
    const preferredEndpoint = String(input.preferredEndpoint || "").trim();
    const isLocalConnectionMode = input.isLocalConnectionMode === true;
    const isLocalServerReady = input.isLocalServerReady === true;
    const state = input.state || null;
    const getText =
      typeof input.getText === "function"
        ? input.getText
        : (_key, fallback) => String(fallback || "");
    const setStatus =
      typeof input.setNetworkStatus === "function"
        ? input.setNetworkStatus
        : (message, tone, tooltip = "") =>
            setNetworkStatus(modal, message, tone, tooltip);

    if (transportMode === "none") {
      setStatus(
        getText("sync.networkUnavailable", "Network: unavailable."),
        "error",
      );
      return true;
    }

    if (transportMode === "mock") {
      setStatus(
        getText("sync.networkLocalMock", "Network: local mode (mock)."),
        "warning",
      );
      return true;
    }

    if (transportMode === "webrtc") {
      const endpointLabel = transportUrl || "WebRTC signaling";
      const errorCode = String(state?.lastError || "").toLowerCase();
      const fallbackActive = !!state?.p2pFallbackActive;
      const fallbackCount = Math.max(
        0,
        Number(state?.p2pRelayParticipantsCount || 0) || 0,
      );
      const meshLimit = Math.max(0, Number(state?.p2pMeshLimit || 0) || 0);
      const hasNetworkError =
        errorCode.includes("websocket") ||
        errorCode.includes("webrtc") ||
        errorCode.includes("transport-unavailable") ||
        errorCode.includes("connect-failed") ||
        errorCode.includes("disconnected") ||
        errorCode.includes("timeout") ||
        errorCode.includes("reconnecting");

      if ((state && state.status === "connecting") || hasNetworkError) {
        setStatus(
          getText(
            "sync.networkP2PConnecting",
            "Network: P2P connecting ({{endpoint}})",
          ).replace("{{endpoint}}", endpointLabel),
          "warning",
        );
        return true;
      }

      if (state && (state.status === "hosting" || state.status === "joined")) {
        if (fallbackActive) {
          const fallbackMessage = getText(
            "sync.networkP2PFallback",
            "Network: P2P partial ({{endpoint}}) - relay fallback for {{count}} participant(s), mesh limit {{limit}}.",
            {
              endpoint: endpointLabel,
              count: fallbackCount,
              limit: meshLimit,
            },
          )
            .replace("{{endpoint}}", endpointLabel)
            .replace("{{count}}", String(fallbackCount))
            .replace("{{limit}}", String(meshLimit || 0));
          setStatus(fallbackMessage, "warning");
          return true;
        }
        setStatus(
          getText(
            "sync.networkP2PConnected",
            "Network: P2P connected ({{endpoint}})",
          ).replace("{{endpoint}}", endpointLabel),
          "success",
        );
        return true;
      }

      setStatus(
        getText(
          "sync.networkP2PReady",
          "Network: P2P ready ({{endpoint}})",
        ).replace("{{endpoint}}", endpointLabel),
        "warning",
      );
      return true;
    }

    let endpointLabel = transportUrl || "";
    if (isLoopbackOrUnshareableWsUrl(endpointLabel)) {
      if (
        preferredEndpoint &&
        !isLoopbackOrUnshareableWsUrl(preferredEndpoint)
      ) {
        endpointLabel = preferredEndpoint;
      } else {
        endpointLabel = "";
      }
    }
    const tooltip = endpointLabel || "";
    const errorCode = String(state?.lastError || "").toLowerCase();
    const hasNetworkError =
      errorCode.includes("websocket") ||
      errorCode.includes("transport-unavailable") ||
      errorCode.includes("connect-failed") ||
      errorCode.includes("disconnected") ||
      errorCode.includes("timeout") ||
      errorCode.includes("reconnecting");
    const hasActiveSession =
      state && (state.status === "hosting" || state.status === "joined");

    if (isLocalConnectionMode && !isLocalServerReady && !hasActiveSession) {
      setStatus(
        getText(
          "sync.networkWaitingLocalServer",
          "Network: waiting for local server startup.",
        ),
        "warning",
        tooltip,
      );
      return true;
    }

    if ((state && state.status === "connecting") || hasNetworkError) {
      setStatus(
        getText(
          "sync.networkReconnecting",
          "Network: reconnecting",
        ),
        "warning",
        tooltip,
      );
      return true;
    }

    if (hasActiveSession) {
      setStatus(
        getText(
          "sync.networkConnected",
          "Network: connected",
        ),
        "success",
        tooltip,
      );
      return true;
    }

    setStatus(
      getText(
        "sync.networkReady",
        "Network: ready",
      ),
      "warning",
      tooltip,
    );
    return true;
  }

  function updateCodeUi(input = {}) {
    const modal = input.modal || null;
    if (!modal) return false;
    const sessionCode = String(input.sessionCode || "");
    const normalizeCode =
      typeof input.normalizeCode === "function"
        ? input.normalizeCode
        : normalizeSessionCode;

    const rowEl = modal.querySelector("#sync-session-code-row");
    const valueEl = modal.querySelector("#sync-session-code-value");
    const copyBtn =
      modal.querySelector("#sync-session-code-row") ||
      modal.querySelector("#sync-session-copy-code-btn");
    if (!rowEl || !valueEl) return false;

    const normalizedCode = normalizeCode(sessionCode);
    if (!normalizedCode) {
      rowEl.classList.add("hidden");
      valueEl.textContent = "";
      if (copyBtn && "disabled" in copyBtn) copyBtn.disabled = true;
      if (copyBtn) copyBtn.classList.add("is-disabled");
      return true;
    }

    valueEl.textContent = normalizedCode;
    rowEl.classList.remove("hidden");
    if (copyBtn && "disabled" in copyBtn) copyBtn.disabled = false;
    if (copyBtn) copyBtn.classList.remove("is-disabled");
    return true;
  }

  function setStatus(modal, message = "", tone = "", options = {}) {
    const withLoadingDots = !!options?.loadingDots;
    const statusEl = getStatusElement(modal);
    if (!statusEl) return;
    statusEl.classList.remove(
      "is-success",
      "is-warning",
      "is-error",
      "is-loading-dots",
    );
    if (tone === "success") statusEl.classList.add("is-success");
    if (tone === "warning") statusEl.classList.add("is-warning");
    if (tone === "error") statusEl.classList.add("is-error");
    if (withLoadingDots) statusEl.classList.add("is-loading-dots");
    const normalizedMessage = withLoadingDots
      ? String(message || "").replace(/\s*(?:\.\.\.|…)\s*$/, "")
      : String(message || "");
    const dotEl = statusEl.querySelector(".sync-session-status-dot");
    if (dotEl) {
      while (dotEl.nextSibling) dotEl.nextSibling.remove();
      const messageNode = document.createTextNode(normalizedMessage);
      dotEl.after(messageNode);
      if (withLoadingDots) {
        const loadingDotsEl = document.createElement("span");
        loadingDotsEl.className = "sync-session-status-loading-dots";
        loadingDotsEl.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 3; i += 1) {
          const dotElNode = document.createElement("span");
          dotElNode.className = "sync-session-status-loading-dot";
          dotElNode.textContent = ".";
          loadingDotsEl.appendChild(dotElNode);
        }
        messageNode.after(loadingDotsEl);
      }
    } else {
      statusEl.textContent = normalizedMessage;
      if (withLoadingDots) {
        const loadingDotsEl = document.createElement("span");
        loadingDotsEl.className = "sync-session-status-loading-dots";
        loadingDotsEl.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 3; i += 1) {
          const dotElNode = document.createElement("span");
          dotElNode.className = "sync-session-status-loading-dot";
          dotElNode.textContent = ".";
          loadingDotsEl.appendChild(dotElNode);
        }
        statusEl.appendChild(loadingDotsEl);
      }
    }
  }

  function ensureParticipantsTooltip(input = {}) {
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const existingTooltipEl = input.existingTooltipEl || null;
    if (
      existingTooltipEl &&
      documentRef?.body &&
      documentRef.body.contains(existingTooltipEl)
    ) {
      return existingTooltipEl;
    }
    if (!documentRef?.body) return null;
    const tooltip = documentRef.createElement("div");
    tooltip.id = "sync-session-participants-tooltip";
    tooltip.className = "timeline-custom-tooltip sync-session-participants-tooltip";
    documentRef.body.appendChild(tooltip);
    return tooltip;
  }

  function hideParticipantsTooltip(tooltipEl) {
    if (!tooltipEl) return;
    tooltipEl.classList.remove("visible");
  }

  const SYNC_PARTICIPANT_STATUS_ICONS = Object.freeze({
    syncing:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="M212-239q-43-48-67.5-110T120-480q0-150 105-255t255-105v-80l200 150-200 150v-80q-91 0-155.5 64.5T260-480q0 46 17.5 86t47.5 70l-113 85ZM480-40 280-190l200-150v80q91 0 155.5-64.5T700-480q0-46-17.5-86T635-636l113-85q43 48 67.5 110T840-480q0 150-105 255T480-120v80Z"/></svg>',
    ready:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>',
    missing:
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" aria-hidden="true"><path fill="currentColor" d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>',
  });

  function normalizeParticipantSyncState(input) {
    const value = String(input || "").trim().toLowerCase();
    if (value === "ready") return "ready";
    if (value === "connecting" || value === "downloading") return "syncing";
    return "missing";
  }

  function normalizeParticipantEntry(value) {
    if (value && typeof value === "object") {
      const name = String(value.name || "").trim();
      if (!name) return null;
      return {
        id: String(value.id || "").trim(),
        name,
        syncState: normalizeParticipantSyncState(value.syncState),
      };
    }
    const name = String(value || "").trim();
    if (!name) return null;
    return {
      id: "",
      name,
      syncState: "missing",
    };
  }

  function readGuestsFromStatusTrigger(triggerEl) {
    if (!triggerEl) return [];
    const raw = String(triggerEl.dataset.syncGuests || "[]");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((value) => normalizeParticipantEntry(value))
        .filter((value) => !!value);
    } catch (_) {
      return [];
    }
  }

  function renderParticipantsTooltip(input = {}) {
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const tooltipEl = input.tooltipEl || null;
    const guests = Array.isArray(input.guests) ? input.guests : [];
    const getText =
      typeof input.getText === "function"
        ? input.getText
        : (_key, fallback) => String(fallback || "");
    const title = String(
      input.title ||
        getText("sync.guestsConnectedTitle", "Connected guests"),
    );
    const emptyLabel = String(
      input.emptyLabel ||
        getText("sync.noGuestsConnected", "No guests connected"),
    );

    if (!tooltipEl || !documentRef) return false;
    tooltipEl.innerHTML = "";

    const titleEl = documentRef.createElement("div");
    titleEl.className = "custom-structure-title";
    titleEl.textContent = title;
    tooltipEl.appendChild(titleEl);

    if (guests.length <= 0) {
      const emptyEl = documentRef.createElement("div");
      emptyEl.className = "custom-step pause";
      emptyEl.textContent = emptyLabel;
      tooltipEl.appendChild(emptyEl);
      return true;
    }

    guests.forEach((guest) => {
      const safeGuest =
        normalizeParticipantEntry(guest) || normalizeParticipantEntry(String(guest || ""));
      if (!safeGuest) return;
      const itemEl = documentRef.createElement("div");
      itemEl.className = "custom-step pose sync-session-participant-item";
      itemEl.dataset.syncState = safeGuest.syncState;

      const iconEl = documentRef.createElement("span");
      iconEl.className = `sync-session-participant-icon is-${safeGuest.syncState}`;
      iconEl.innerHTML =
        SYNC_PARTICIPANT_STATUS_ICONS[safeGuest.syncState] ||
        SYNC_PARTICIPANT_STATUS_ICONS.missing;

      const labelEl = documentRef.createElement("span");
      labelEl.className = "sync-session-participant-label";
      labelEl.textContent = safeGuest.name;

      itemEl.appendChild(iconEl);
      itemEl.appendChild(labelEl);
      tooltipEl.appendChild(itemEl);
    });
    return true;
  }

  function updateParticipantsTooltipPosition(triggerEl, tooltipEl) {
    if (!triggerEl || !tooltipEl) return false;
    const rect = triggerEl.getBoundingClientRect();
    tooltipEl.style.left = rect.left + rect.width / 2 + "px";
    tooltipEl.style.top = rect.bottom + 8 + "px";
    return true;
  }

  function showParticipantsTooltip(input = {}) {
    const triggerEl = input.triggerEl || null;
    if (!triggerEl) return input.existingTooltipEl || null;
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);
    const tooltipEl = ensureParticipantsTooltip({
      documentRef,
      existingTooltipEl: input.existingTooltipEl || null,
    });
    if (!tooltipEl) return null;
    const guests = readGuestsFromStatusTrigger(triggerEl);
    renderParticipantsTooltip({
      tooltipEl,
      documentRef,
      guests,
      title: input.title,
      emptyLabel: input.emptyLabel,
      getText: input.getText,
    });
    updateParticipantsTooltipPosition(triggerEl, tooltipEl);
    tooltipEl.classList.add("visible");
    return tooltipEl;
  }

  function setHostingStatus(input = {}) {
    const modal = input.modal || null;
    const state = input.state || {};
    const guests = Array.isArray(input.guests) ? input.guests : [];
    const getText =
      typeof input.getText === "function"
        ? input.getText
        : (_key, fallback) => String(fallback || "");
    const statusEl = getStatusElement(modal);
    if (!statusEl) return false;

    statusEl.classList.remove(
      "is-success",
      "is-warning",
      "is-error",
      "is-loading-dots",
    );
    statusEl.classList.add("is-success");
    const dotEl = statusEl.querySelector(".sync-session-status-dot");
    if (dotEl) {
      while (dotEl.nextSibling) dotEl.nextSibling.remove();
    } else {
      statusEl.textContent = "";
    }

    const participants = Math.max(0, guests.length);
    const sessionCode = String(state?.sessionCode || "").trim();
    const participantsLabelTemplate =
      participants !== 1
        ? getText("sync.participantCountPlural", "({{count}} participants)", {
            count: participants,
          })
        : getText("sync.participantCount", "({{count}} participant)", {
            count: participants,
          });
    const participantsLabel = String(
      participantsLabelTemplate ||
        (participants !== 1
          ? "({{count}} participants)"
          : "({{count}} participant)"),
    ).includes(String(participants))
      ? String(participantsLabelTemplate)
      : String(
          participants !== 1
            ? "({{count}} participants)"
            : "({{count}} participant)",
        ).replace("{{count}}", String(participants));
    const hostingTemplate = String(
      getText("sync.hostingStatus", "Hosting {{sessionCode}}", {
        sessionCode,
      }) || "",
    );
    const prefixText = (
      hostingTemplate.includes(sessionCode)
        ? hostingTemplate
        : "Hosting {{sessionCode}}".replace("{{sessionCode}}", sessionCode)
    ) + " ";
    statusEl.appendChild(document.createTextNode(prefixText));

    const triggerEl = document.createElement("span");
    triggerEl.className = "sync-session-participants-trigger";
    triggerEl.setAttribute("role", "button");
    triggerEl.setAttribute("tabindex", "0");
    triggerEl.textContent = participantsLabel;
    triggerEl.dataset.syncGuests = JSON.stringify(
      guests
        .map((guest) => normalizeParticipantEntry(guest))
        .filter((guest) => !!guest),
    );
    statusEl.appendChild(triggerEl);

    const fallbackActive = !!state?.p2pFallbackActive;
    const fallbackCount = Math.max(
      0,
      Number(state?.p2pRelayParticipantsCount || 0) || 0,
    );
    const meshLimit = Math.max(0, Number(state?.p2pMeshLimit || 0) || 0);
    if (fallbackActive && fallbackCount > 0) {
      const noteEl = document.createElement("span");
      noteEl.className = "sync-session-fallback-note";
      noteEl.textContent = String(
        getText(
          "sync.hostFallbackHint",
          "[Relay fallback active: {{count}} participant(s), mesh limit {{limit}}]",
          {
            count: fallbackCount,
            limit: meshLimit,
          },
        ) || "",
      )
        .replace("{{count}}", String(fallbackCount))
        .replace("{{limit}}", String(meshLimit || 0));
      statusEl.appendChild(document.createTextNode(" "));
      statusEl.appendChild(noteEl);
    }
    return true;
  }

  function setJoinedStatus(input = {}) {
    const modal = input.modal || null;
    const state = input.state || {};
    const others = Array.isArray(input.others) ? input.others : [];
    const getText =
      typeof input.getText === "function"
        ? input.getText
        : (_key, fallback) => String(fallback || "");
    const statusEl = getStatusElement(modal);
    if (!statusEl) return false;

    statusEl.classList.remove(
      "is-success",
      "is-warning",
      "is-error",
      "is-loading-dots",
    );
    statusEl.classList.add("is-success");
    const dotEl2 = statusEl.querySelector(".sync-session-status-dot");
    if (dotEl2) {
      while (dotEl2.nextSibling) dotEl2.nextSibling.remove();
    } else {
      statusEl.textContent = "";
    }

    const participantsFromState = Math.max(
      0,
      Number(state?.participantsCount || 0) || 0,
    );
    const participants = Math.max(0, others.length, participantsFromState);
    const sessionCode = String(state?.sessionCode || "").trim();
    const participantsLabelTemplate =
      participants !== 1
        ? getText("sync.participantCountPlural", "({{count}} participants)", {
            count: participants,
          })
        : getText("sync.participantCount", "({{count}} participant)", {
            count: participants,
          });
    const participantsLabel = String(
      participantsLabelTemplate ||
        (participants !== 1
          ? "({{count}} participants)"
          : "({{count}} participant)"),
    ).includes(String(participants))
      ? String(participantsLabelTemplate)
      : String(
          participants !== 1
            ? "({{count}} participants)"
            : "({{count}} participant)",
        ).replace("{{count}}", String(participants));
    const connectedTemplate = String(
      getText("sync.connectedToStatus", "Connected to {{sessionCode}}", {
        sessionCode,
      }) || "",
    );
    const prefixText = (
      connectedTemplate.includes(sessionCode)
        ? connectedTemplate
        : "Connected to {{sessionCode}}".replace("{{sessionCode}}", sessionCode)
    ) + " ";
    statusEl.appendChild(document.createTextNode(prefixText));

    const triggerEl = document.createElement("span");
    triggerEl.className = "sync-session-participants-trigger";
    triggerEl.setAttribute("role", "button");
    triggerEl.setAttribute("tabindex", "0");
    triggerEl.textContent = participantsLabel;
    triggerEl.dataset.syncGuests = JSON.stringify(
      others
        .map((guest) => normalizeParticipantEntry(guest))
        .filter((guest) => !!guest),
    );
    statusEl.appendChild(triggerEl);
    return true;
  }

  function isGuestPseudoCharAllowed(char) {
    const symbol = String(char || "");
    if (!symbol) return false;
    if (symbol === " ") return true;
    const lower = symbol.toLocaleLowerCase();
    const upper = symbol.toLocaleUpperCase();
    return lower !== upper;
  }

  function sanitizeGuestPseudoInputValue(input) {
    const raw = String(input || "").normalize("NFC");
    return Array.from(raw)
      .filter((char) => isGuestPseudoCharAllowed(char))
      .join("")
      .slice(0, 32);
  }

  function normalizeGuestPseudoValue(input) {
    return sanitizeGuestPseudoInputValue(input).replace(/\s+/g, " ").trim();
  }

  async function copyTextToClipboard(text, input = {}) {
    const value = String(text || "").trim();
    if (!value) return false;
    const navigatorRef =
      input.navigatorRef || (typeof navigator !== "undefined" ? navigator : null);
    const documentRef =
      input.documentRef || (typeof document !== "undefined" ? document : null);

    if (
      navigatorRef &&
      navigatorRef.clipboard &&
      typeof navigatorRef.clipboard.writeText === "function"
    ) {
      try {
        await navigatorRef.clipboard.writeText(value);
        return true;
      } catch (_) {}
    }

    if (!documentRef) return false;

    const textarea = documentRef.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    documentRef.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    let copied = false;
    try {
      copied = !!documentRef.execCommand("copy");
    } catch (_) {
      copied = false;
    }
    documentRef.body.removeChild(textarea);
    return copied;
  }

  function setModalRole(input = {}) {
    const modal = input.modal || null;
    const nextRole = input.nextRole === "join" ? "join" : "host";
    const onRoleChanged =
      typeof input.onRoleChanged === "function" ? input.onRoleChanged : null;
    const onAfterRoleUpdated =
      typeof input.onAfterRoleUpdated === "function"
        ? input.onAfterRoleUpdated
        : null;
    const state = input.state || null;

    if (onRoleChanged) {
      onRoleChanged(nextRole);
    }

    if (!modal) return nextRole;

    modal
      .querySelectorAll(".sync-session-role-btn[data-sync-role]")
      .forEach((btn) => {
        const isActive = btn.dataset.syncRole === nextRole;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });

    if (onAfterRoleUpdated) {
      onAfterRoleUpdated({
        modal,
        role: nextRole,
        state,
      });
    }

    return nextRole;
  }

  function openModal(input = {}) {
    const modal = input.modal || null;
    if (!modal) return null;
    const role = input.role === "join" ? "join" : "host";
    const state = input.state || null;
    const onBeforeOpen =
      typeof input.onBeforeOpen === "function" ? input.onBeforeOpen : null;
    const onAfterOpen =
      typeof input.onAfterOpen === "function" ? input.onAfterOpen : null;
    const restoreFocusTarget =
      input.restoreFocusTarget ||
      modal.querySelector(`#sync-session-leave-btn`) ||
      modal.querySelector(`.sync-session-role-btn[data-sync-role="${role}"]`) ||
      modal.querySelector(".modal-close-btn");

    if (onBeforeOpen) {
      onBeforeOpen({ modal, role, state });
    }

    modal.classList.remove("hidden");

    setTimeout(() => {
      if (restoreFocusTarget && typeof restoreFocusTarget.focus === "function") {
        restoreFocusTarget.focus();
      }
      if (onAfterOpen) {
        onAfterOpen({ modal, role, state });
      }
    }, 0);

    return restoreFocusTarget;
  }

  function closeModal(input = {}) {
    const modal = input.modal || null;
    if (!modal) return false;
    const restoreFocus = input.restoreFocus !== false;
    const lastFocusedElement = input.lastFocusedElement || null;
    const onBeforeClose =
      typeof input.onBeforeClose === "function" ? input.onBeforeClose : null;

    if (onBeforeClose) {
      onBeforeClose({ modal });
    }

    modal.classList.add("hidden");
    if (
      restoreFocus &&
      lastFocusedElement &&
      typeof lastFocusedElement.focus === "function"
    ) {
      lastFocusedElement.focus();
    }
    return true;
  }

  function bindSessionModalEvents(input = {}) {
    const modal = input.modal || null;
    if (!modal) return false;

    const closeBtn = input.closeBtn || null;
    const createBtn = input.createBtn || null;
    const joinBtn = input.joinBtn || null;
    const leaveBtn = input.leaveBtn || null;
    const copyCodeBtn =
      input.copyCodeBtn ||
      modal.querySelector("#sync-session-code-row") ||
      modal.querySelector("#sync-session-copy-code-btn") ||
      null;
    const statusEl = input.statusEl || null;
    const controlModeSelect = input.controlModeSelect || null;
    const controlModeTrigger = input.controlModeTrigger || null;
    const controlModeMenu = input.controlModeMenu || null;
    const joinPseudoInput = input.joinPseudoInput || null;
    const guestActionNotificationsInput = input.guestActionNotificationsInput || null;

    const onCloseRequested =
      typeof input.onCloseRequested === "function" ? input.onCloseRequested : null;
    const onCloseControlModeMenu =
      typeof input.onCloseControlModeMenu === "function"
        ? input.onCloseControlModeMenu
        : null;
    const onToggleControlModeMenu =
      typeof input.onToggleControlModeMenu === "function"
        ? input.onToggleControlModeMenu
        : null;
    const onControlModeOptionSelected =
      typeof input.onControlModeOptionSelected === "function"
        ? input.onControlModeOptionSelected
        : null;
    const onStatusTriggerShow =
      typeof input.onStatusTriggerShow === "function"
        ? input.onStatusTriggerShow
        : null;
    const onStatusTriggerHide =
      typeof input.onStatusTriggerHide === "function"
        ? input.onStatusTriggerHide
        : null;
    const isPseudoCharAllowed =
      typeof input.isPseudoCharAllowed === "function"
        ? input.isPseudoCharAllowed
        : null;
    const sanitizePseudoInputValue =
      typeof input.sanitizePseudoInputValue === "function"
        ? input.sanitizePseudoInputValue
        : null;
    const onPseudoValidationError =
      typeof input.onPseudoValidationError === "function"
        ? input.onPseudoValidationError
        : null;
    const onGuestActionNotificationsChanged =
      typeof input.onGuestActionNotificationsChanged === "function"
        ? input.onGuestActionNotificationsChanged
        : null;
    const onRoleButtonClicked =
      typeof input.onRoleButtonClicked === "function"
        ? input.onRoleButtonClicked
        : null;
    const onCreateClicked =
      typeof input.onCreateClicked === "function" ? input.onCreateClicked : null;
    const onJoinClicked =
      typeof input.onJoinClicked === "function" ? input.onJoinClicked : null;
    const onLeaveClicked =
      typeof input.onLeaveClicked === "function" ? input.onLeaveClicked : null;
    const onCopyClicked =
      typeof input.onCopyClicked === "function" ? input.onCopyClicked : null;

    let overlayMouseDownTarget = null;
    modal.addEventListener("mousedown", (event) => {
      overlayMouseDownTarget = event.target;
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal && overlayMouseDownTarget === modal && onCloseRequested) {
        onCloseRequested();
      }
      overlayMouseDownTarget = null;
    });

    modal.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (controlModeMenu && !controlModeMenu.hidden) {
        event.preventDefault();
        if (onCloseControlModeMenu) onCloseControlModeMenu();
        return;
      }
      if (onCloseRequested) onCloseRequested();
    });

    if (controlModeTrigger && onToggleControlModeMenu) {
      controlModeTrigger.addEventListener("click", () => {
        onToggleControlModeMenu();
      });
    }

    if (controlModeMenu && onControlModeOptionSelected) {
      controlModeMenu
        .querySelectorAll(".sync-session-control-mode-option[data-sync-control-mode]")
        .forEach((optionEl) => {
          optionEl.addEventListener("click", () => {
            onControlModeOptionSelected(optionEl.dataset.syncControlMode);
          });
        });
    }

    document.addEventListener("click", (event) => {
      if (!controlModeSelect || modal.classList.contains("hidden")) return;
      if (!controlModeSelect.contains(event.target) && onCloseControlModeMenu) {
        onCloseControlModeMenu();
      }
    });

    if (closeBtn && onCloseRequested) {
      closeBtn.addEventListener("click", () => {
        onCloseRequested();
      });
    }

    if (statusEl) {
      statusEl.addEventListener("mouseover", (event) => {
        const trigger = event.target.closest(".sync-session-participants-trigger");
        if (!trigger || !statusEl.contains(trigger)) return;
        if (onStatusTriggerShow) onStatusTriggerShow(trigger);
      });

      statusEl.addEventListener("mousemove", (event) => {
        const trigger = event.target.closest(".sync-session-participants-trigger");
        if (!trigger || !statusEl.contains(trigger)) return;
        if (onStatusTriggerShow) onStatusTriggerShow(trigger);
      });

      statusEl.addEventListener("mouseout", (event) => {
        const trigger = event.target.closest(".sync-session-participants-trigger");
        if (!trigger || !statusEl.contains(trigger)) return;
        const relatedTarget = event.relatedTarget;
        if (relatedTarget && trigger.contains(relatedTarget)) return;
        if (onStatusTriggerHide) onStatusTriggerHide();
      });

      statusEl.addEventListener("focusin", (event) => {
        const trigger = event.target.closest(".sync-session-participants-trigger");
        if (!trigger || !statusEl.contains(trigger)) return;
        if (onStatusTriggerShow) onStatusTriggerShow(trigger);
      });

      statusEl.addEventListener("focusout", (event) => {
        const nextTarget = event.relatedTarget;
        if (
          nextTarget &&
          typeof nextTarget.closest === "function" &&
          nextTarget.closest(".sync-session-participants-trigger")
        ) {
          return;
        }
        if (onStatusTriggerHide) onStatusTriggerHide();
      });
    }

    if (joinPseudoInput && sanitizePseudoInputValue && onPseudoValidationError) {
      joinPseudoInput.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const key = String(event.key || "");
        if (key.length !== 1) return;
        if (isPseudoCharAllowed && !isPseudoCharAllowed(key)) {
          event.preventDefault();
          onPseudoValidationError(joinPseudoInput);
        }
      });

      joinPseudoInput.addEventListener("paste", (event) => {
        const pastedText =
          event.clipboardData?.getData("text") ||
          window.clipboardData?.getData("Text") ||
          "";
        if (!pastedText) return;
        const sanitizedPastedText = sanitizePseudoInputValue(pastedText);
        if (sanitizedPastedText === pastedText) return;

        event.preventDefault();
        const inputValue = String(joinPseudoInput.value || "");
        const start = Number(joinPseudoInput.selectionStart ?? inputValue.length);
        const end = Number(joinPseudoInput.selectionEnd ?? inputValue.length);
        const nextValue = sanitizePseudoInputValue(
          inputValue.slice(0, start) + sanitizedPastedText + inputValue.slice(end),
        );
        joinPseudoInput.value = nextValue;
        onPseudoValidationError(joinPseudoInput);
      });

      joinPseudoInput.addEventListener("input", () => {
        const currentValue = String(joinPseudoInput.value || "");
        const sanitizedValue = sanitizePseudoInputValue(currentValue);
        if (sanitizedValue === currentValue) return;
        joinPseudoInput.value = sanitizedValue;
        onPseudoValidationError(joinPseudoInput);
      });
    }

    if (guestActionNotificationsInput && onGuestActionNotificationsChanged) {
      guestActionNotificationsInput.addEventListener("change", () => {
        onGuestActionNotificationsChanged(!!guestActionNotificationsInput.checked);
      });
    }

    if (onRoleButtonClicked) {
      modal
        .querySelectorAll(".sync-session-role-btn[data-sync-role]")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            onRoleButtonClicked(btn.dataset.syncRole);
          });
        });
    }

    if (createBtn && onCreateClicked) {
      createBtn.addEventListener("click", onCreateClicked);
    }
    if (joinBtn && onJoinClicked) {
      joinBtn.addEventListener("click", onJoinClicked);
    }
    if (leaveBtn && onLeaveClicked) {
      leaveBtn.addEventListener("click", onLeaveClicked);
    }
    if (copyCodeBtn && onCopyClicked) {
      copyCodeBtn.addEventListener("click", onCopyClicked);
    }

    return true;
  }

  globalObj.PoseChronoSyncroModule = {
    ...existing,
    PREF_KEYS,
    readPreference,
    writePreference,
    syncCheckbox,
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
    syncSessionStatusUi: {
      getStatusElement,
      getNetworkStatusElement,
      setNetworkStatus,
      updateNetworkStatus,
      updateCodeUi,
      setStatus,
      ensureParticipantsTooltip,
      hideParticipantsTooltip,
      readGuestsFromStatusTrigger,
      renderParticipantsTooltip,
      updateParticipantsTooltipPosition,
      showParticipantsTooltip,
      setHostingStatus,
      setJoinedStatus,
    },
    syncRuntimeHelpers: {
      isGuestPseudoCharAllowed,
      sanitizeGuestPseudoInputValue,
      normalizeGuestPseudoValue,
      copyTextToClipboard,
    },
    syncSessionController: {
      setModalRole,
      openModal,
      closeModal,
      bindSessionModalEvents,
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
