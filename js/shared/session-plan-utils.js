(function initPoseChronoSharedSessionPlanUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createSessionPlanUtils(options = {}) {
    const schemaVersion = Number(options.schemaVersion || 1);
    const now =
      typeof options.now === "function"
        ? options.now
        : () => Date.now();

    function clampInt(value, min, max, fallback = min) {
      const num = Number(value);
      if (!Number.isFinite(num)) return fallback;
      return Math.max(min, Math.min(max, Math.round(num)));
    }

    function normalizeCustomStep(step) {
      if (!step || typeof step !== "object") return null;
      const type =
        step.type === "pause" ? "pause" : step.type === "pose" ? "pose" : null;
      if (!type) return null;

      const duration = clampInt(step.duration, 1, 86400, 60);
      const count = type === "pause" ? 1 : clampInt(step.count, 1, 10000, 1);
      const idCandidate = Number(step.id);
      const id = Number.isFinite(idCandidate)
        ? idCandidate
        : now() + Math.floor(Math.random() * 10000);

      return { type, count, duration, id };
    }

    function normalizeSessionPlansPayload(raw) {
      const source =
        raw && typeof raw === "object" && Array.isArray(raw.plans)
          ? raw.plans
          : Array.isArray(raw)
            ? raw
            : [];

      let repaired = false;
      const plans = [];

      source.forEach((plan, index) => {
        if (!plan || typeof plan !== "object") {
          repaired = true;
          return;
        }
        const nameRaw = String(plan.name ?? "").trim();
        const name =
          nameRaw.length > 0 ? nameRaw.slice(0, 120) : `Plan ${index + 1}`;
        if (name !== nameRaw) repaired = true;

        const date = clampInt(plan.date, 0, 4102444800000, now());
        const rawSteps = Array.isArray(plan.steps) ? plan.steps : [];
        if (!Array.isArray(plan.steps)) repaired = true;
        const steps = rawSteps
          .map((step) => normalizeCustomStep(step))
          .filter(Boolean);
        if (steps.length !== rawSteps.length) repaired = true;
        if (steps.length === 0) {
          repaired = true;
          return;
        }

        plans.push({
          name,
          steps,
          date,
        });
      });

      const payload = {
        schemaVersion,
        plans,
      };
      if (
        !raw ||
        typeof raw !== "object" ||
        raw.schemaVersion !== schemaVersion ||
        !Array.isArray(raw.plans)
      ) {
        repaired = true;
      }
      return { payload, plans, repaired };
    }

    return {
      clampInt,
      normalizeCustomStep,
      normalizeSessionPlansPayload,
    };
  }

  sharedRoot.createSessionPlanUtils = createSessionPlanUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);

