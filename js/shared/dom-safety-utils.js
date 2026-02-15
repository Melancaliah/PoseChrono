(function initPoseChronoSharedDomSafetyUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function escapeHtml(input) {
    const str = String(input ?? "");
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function encodeDataToken(input) {
    return encodeURIComponent(String(input ?? ""));
  }

  function decodeDataToken(input) {
    try {
      return decodeURIComponent(String(input ?? ""));
    } catch (_) {
      return String(input ?? "");
    }
  }

  function createDomSafetyUtils() {
    return {
      escapeHtml,
      encodeDataToken,
      decodeDataToken,
    };
  }

  sharedRoot.createDomSafetyUtils = createDomSafetyUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

