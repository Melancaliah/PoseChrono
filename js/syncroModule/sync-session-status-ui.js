(function initPoseChronoSyncSessionStatusUi(globalScope) {
  "use strict";

  const globalObj =
    globalScope || (typeof window !== "undefined" ? window : globalThis);

  function getStatusElement(modal) {
    if (!modal) return null;
    return modal.querySelector("#sync-session-status");
  }

  function getNetworkStatusElement(modal) {
    if (!modal) return null;
    return modal.querySelector("#sync-session-network-status");
  }

  function setNetworkStatus(modal, message = "", tone = "") {
    const networkEl = getNetworkStatusElement(modal);
    if (!networkEl) return;
    networkEl.classList.remove("is-success", "is-warning", "is-error");
    if (tone === "success") networkEl.classList.add("is-success");
    if (tone === "warning") networkEl.classList.add("is-warning");
    if (tone === "error") networkEl.classList.add("is-error");
    networkEl.textContent = String(message || "");
  }

  function updateNetworkStatus(input = {}) {
    const modal = input.modal || null;
    if (!modal) return false;
    const transportMode = String(input.transportMode || "none").trim().toLowerCase();
    const transportUrl = String(input.transportUrl || "").trim();
    const state = input.state || null;
    const getText =
      typeof input.getText === "function"
        ? input.getText
        : (_key, fallback) => String(fallback || "");
    const setStatus =
      typeof input.setNetworkStatus === "function"
        ? input.setNetworkStatus
        : (message, tone) => setNetworkStatus(modal, message, tone);

    if (transportMode === "none") {
      setStatus(
        getText("sync.networkUnavailable", "Network: unavailable."),
        "error",
      );
      return true;
    }

    if (transportMode !== "ws") {
      setStatus(
        getText("sync.networkLocalMock", "Network: local mode (mock)."),
        "warning",
      );
      return true;
    }

    const endpointLabel = transportUrl || "WebSocket";
    const errorCode = String(state?.lastError || "").toLowerCase();
    const hasNetworkError =
      errorCode.includes("websocket") ||
      errorCode.includes("transport-unavailable") ||
      errorCode.includes("connect-failed") ||
      errorCode.includes("disconnected") ||
      errorCode.includes("timeout") ||
      errorCode.includes("reconnecting");

    if ((state && state.status === "connecting") || hasNetworkError) {
      setStatus(
        getText(
          "sync.networkReconnecting",
          "Network: reconnecting ({{endpoint}})",
        ).replace("{{endpoint}}", endpointLabel),
        "warning",
      );
      return true;
    }

    if (state && (state.status === "hosting" || state.status === "joined")) {
      setStatus(
        getText(
          "sync.networkConnected",
          "Network: connected ({{endpoint}})",
        ).replace("{{endpoint}}", endpointLabel),
        "success",
      );
      return true;
    }

    setStatus(
      getText(
        "sync.networkReady",
        "Network: ready ({{endpoint}})",
      ).replace("{{endpoint}}", endpointLabel),
      "warning",
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
        : (value) => String(value || "").trim().toUpperCase();

    const rowEl = modal.querySelector("#sync-session-code-row");
    const valueEl = modal.querySelector("#sync-session-code-value");
    const copyBtn = modal.querySelector("#sync-session-copy-code-btn");
    if (!rowEl || !valueEl || !copyBtn) return false;

    const normalizedCode = normalizeCode(sessionCode);
    if (!normalizedCode) {
      rowEl.classList.add("hidden");
      valueEl.textContent = "";
      copyBtn.disabled = true;
      return true;
    }

    valueEl.textContent = normalizedCode;
    rowEl.classList.remove("hidden");
    copyBtn.disabled = false;
    return true;
  }

  function setStatus(modal, message = "", tone = "") {
    const statusEl = getStatusElement(modal);
    if (!statusEl) return;
    statusEl.classList.remove("is-success", "is-warning", "is-error");
    if (tone === "success") statusEl.classList.add("is-success");
    if (tone === "warning") statusEl.classList.add("is-warning");
    if (tone === "error") statusEl.classList.add("is-error");
    const dotEl = statusEl.querySelector(".sync-session-status-dot");
    if (dotEl) {
      while (dotEl.nextSibling) dotEl.nextSibling.remove();
      dotEl.after(document.createTextNode(String(message || "")));
    } else {
      statusEl.textContent = String(message || "");
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

  function readGuestsFromStatusTrigger(triggerEl) {
    if (!triggerEl) return [];
    const raw = String(triggerEl.dataset.syncGuests || "[]");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((value) => String(value || "").trim())
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

    guests.forEach((name) => {
      const itemEl = documentRef.createElement("div");
      itemEl.className = "custom-step pose";
      itemEl.textContent = `\u2022 ${name}`;
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

    statusEl.classList.remove("is-success", "is-warning", "is-error");
    statusEl.classList.add("is-success");
    const dotElH = statusEl.querySelector(".sync-session-status-dot");
    if (dotElH) {
      while (dotElH.nextSibling) dotElH.nextSibling.remove();
    } else {
      statusEl.textContent = "";
    }

    const participants = Math.max(0, Number(state?.participantsCount || 0) || 0);
    const sessionCode = String(state?.sessionCode || "").trim();
    const participantsLabel =
      participants > 1
        ? getText("sync.participantCountPlural", "({{count}} participants)").replace(
            "{{count}}",
            participants,
          )
        : getText("sync.participantCount", "({{count}} participant)").replace(
            "{{count}}",
            participants,
          );
    const prefixText =
      getText("sync.hostingStatus", "Hosting {{sessionCode}}").replace(
        "{{sessionCode}}",
        sessionCode,
      ) + " ";
    statusEl.appendChild(document.createTextNode(prefixText));

    const triggerEl = document.createElement("span");
    triggerEl.className = "sync-session-participants-trigger";
    triggerEl.setAttribute("role", "button");
    triggerEl.setAttribute("tabindex", "0");
    triggerEl.textContent = participantsLabel;
    triggerEl.dataset.syncGuests = JSON.stringify(
      guests.map((guest) =>
        guest && typeof guest === "object"
          ? String(guest.name || "").trim()
          : String(guest || "").trim(),
      ),
    );
    statusEl.appendChild(triggerEl);
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

    statusEl.classList.remove("is-success", "is-warning", "is-error");
    statusEl.classList.add("is-success");
    const dotElJ = statusEl.querySelector(".sync-session-status-dot");
    if (dotElJ) {
      while (dotElJ.nextSibling) dotElJ.nextSibling.remove();
    } else {
      statusEl.textContent = "";
    }

    const participants = Math.max(0, Number(state?.participantsCount || 0) || 0);
    const sessionCode = String(state?.sessionCode || "").trim();
    const participantsLabel =
      participants > 1
        ? getText("sync.participantCountPlural", "({{count}} participants)").replace(
            "{{count}}",
            participants,
          )
        : getText("sync.participantCount", "({{count}} participant)").replace(
            "{{count}}",
            participants,
          );
    const prefixText =
      getText("sync.connectedToStatus", "Connected to {{sessionCode}}").replace(
        "{{sessionCode}}",
        sessionCode,
      ) + " ";
    statusEl.appendChild(document.createTextNode(prefixText));

    const triggerEl = document.createElement("span");
    triggerEl.className = "sync-session-participants-trigger";
    triggerEl.setAttribute("role", "button");
    triggerEl.setAttribute("tabindex", "0");
    triggerEl.textContent = participantsLabel;
    triggerEl.dataset.syncGuests = JSON.stringify(
      others.map((name) => String(name || "").trim()).filter((name) => !!name),
    );
    statusEl.appendChild(triggerEl);
    return true;
  }

  globalObj.PoseChronoSyncroModule = {
    ...(globalObj.PoseChronoSyncroModule || {}),
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
  };
})(typeof window !== "undefined" ? window : globalThis);
