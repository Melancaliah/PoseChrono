(function initPoseChronoSharedPlatformCapabilityUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createCapabilityWarner(options = {}) {
    const warned = new Set();
    const getPlatform =
      typeof options.getPlatform === "function" ? options.getPlatform : () => null;
    const logger =
      typeof options.logger === "function" ? options.logger : console.warn;
    const prefix = String(options.prefix || "[Platform]");

    return function warnMissingCapability(capabilityKey, operationLabel) {
      const capability = String(capabilityKey || "").trim();
      if (!capability) return;
      if (warned.has(capability)) return;

      const platform = getPlatform();
      const hasPlatformCapabilities =
        !!platform &&
        !!platform.capabilities &&
        Object.prototype.hasOwnProperty.call(platform.capabilities, capability);

      if (!hasPlatformCapabilities || platform.capabilities[capability]) return;

      warned.add(capability);
      logger(
        `${prefix} Missing capability "${capability}" for "${operationLabel}".`,
      );
    };
  }

  sharedRoot.createCapabilityWarner = createCapabilityWarner;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

