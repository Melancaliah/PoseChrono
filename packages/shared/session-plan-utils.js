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

    function renderPlansListHtml(plans, options = {}) {
      const safePlans = Array.isArray(plans) ? plans : [];
      if (safePlans.length === 0) return "";

      const escapeHtml =
        typeof options.escapeHtml === "function"
          ? options.escapeHtml
          : (value) => String(value ?? "");
      const formatDuration =
        typeof options.formatDuration === "function"
          ? options.formatDuration
          : () => "0s";
      const calculatePlanDuration =
        typeof options.calculatePlanDuration === "function"
          ? options.calculatePlanDuration
          : () => 0;
      const calculatePlanPoses =
        typeof options.calculatePlanPoses === "function"
          ? options.calculatePlanPoses
          : () => 0;
      const getPlanWord =
        typeof options.getPlanWord === "function"
          ? options.getPlanWord
          : () => "";
      const loadLabel = String(options.loadLabel || "Load");
      const deleteButtonIcon = String(options.deleteButtonIcon || "");

      return safePlans
        .map((plan, index) => {
          const totalDuration = calculatePlanDuration(plan.steps);
          const totalPoses = calculatePlanPoses(plan.steps);
          const totalSteps = (plan.steps || []).length;
          const durationText = formatDuration(totalDuration);
          const posesLabel = getPlanWord("pose", totalPoses);
          const stepsLabel = getPlanWord("step", totalSteps);
          return `
      <div class="plan-item">
        <div class="plan-info">
          <div class="plan-name" data-index="${index}" contenteditable="false" style="cursor: pointer;">${escapeHtml(plan.name)}</div>
          <div class="plan-meta">${durationText} - ${totalPoses} ${posesLabel} - ${totalSteps} ${stepsLabel}</div>
        </div>
        <div class="plan-actions">
          <button type="button" class="plan-btn plan-load-btn" data-index="${index}">${loadLabel}</button>
          <button type="button" class="plan-btn plan-delete-btn" data-index="${index}">${deleteButtonIcon}</button>
        </div>
      </div>
    `;
        })
        .join("");
    }

    function formatPlanDeleteSummary(plan, options = {}) {
      const safePlan = plan && typeof plan === "object" ? plan : { steps: [] };
      const formatDuration =
        typeof options.formatDuration === "function"
          ? options.formatDuration
          : () => "0s";
      const calculatePlanDuration =
        typeof options.calculatePlanDuration === "function"
          ? options.calculatePlanDuration
          : () => 0;
      const calculatePlanPoses =
        typeof options.calculatePlanPoses === "function"
          ? options.calculatePlanPoses
          : () => 0;
      const getPlanWord =
        typeof options.getPlanWord === "function"
          ? options.getPlanWord
          : () => "";

      const totalDuration = formatDuration(calculatePlanDuration(safePlan.steps));
      const totalPoses = calculatePlanPoses(safePlan.steps);
      const stepsCount = (safePlan.steps || []).length;
      const posesLabel = getPlanWord("pose", totalPoses);
      const stepsLabel = getPlanWord("step", stepsCount);

      return {
        totalDuration,
        totalPoses,
        stepsCount,
        posesLabel,
        stepsLabel,
        summary: `${safePlan.name} (${totalDuration} - ${totalPoses} ${posesLabel}, ${stepsCount} ${stepsLabel})`,
      };
    }

    function getPlanSaveValidation(input = {}) {
      const name = String(input.name || "").trim();
      const queueLength = Number(input.queueLength || 0);
      if (!name) {
        return { ok: false, reason: "empty-name" };
      }
      if (queueLength <= 0) {
        return { ok: false, reason: "empty-queue" };
      }
      return { ok: true, reason: "" };
    }

    function createPlanEntry(input = {}) {
      const name = String(input.name || "").trim();
      const queue = Array.isArray(input.queue) ? input.queue : [];
      const date =
        Number.isFinite(Number(input.date)) && Number(input.date) > 0
          ? Number(input.date)
          : now();
      return {
        name,
        steps: JSON.parse(JSON.stringify(queue)),
        date,
      };
    }

    return {
      clampInt,
      normalizeCustomStep,
      normalizeSessionPlansPayload,
      renderPlansListHtml,
      formatPlanDeleteSummary,
      getPlanSaveValidation,
      createPlanEntry,
    };
  }

  sharedRoot.createSessionPlanUtils = createSessionPlanUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
