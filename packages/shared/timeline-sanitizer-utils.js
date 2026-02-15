(function initPoseChronoSharedTimelineSanitizerUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function toInt(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? Math.round(num) : fallback;
  }

  function clamp(value, min, max, fallback = min) {
    const num = toInt(value, fallback);
    return Math.max(min, Math.min(max, num));
  }

  function createTimelineSanitizerUtils(options = {}) {
    const schemaVersion = Math.max(1, toInt(options.schemaVersion, 1));
    const minPoses = Math.max(0, toInt(options.minPoses, 1));
    const minTimeSeconds = Math.max(0, toInt(options.minTimeSeconds, 0));
    const maxTimePerSession = Math.max(
      minTimeSeconds,
      toInt(options.maxTimePerSession, 86400),
    );
    const nowIso =
      typeof options.nowIso === "function"
        ? options.nowIso
        : () => new Date().toISOString();

    function getDefaultData() {
      return {
        days: {},
        stats: {
          totalPoses: 0,
          totalTime: 0,
          currentStreak: 0,
          bestStreak: 0,
          lastSessionDate: null,
        },
      };
    }

    function sanitizeSessionImageEntry(image) {
      if (typeof image === "string") {
        const value = image.trim();
        if (!value) return null;
        return value.slice(0, 4096);
      }

      if (!image || typeof image !== "object") return null;

      const out = {};

      if (
        image.id !== undefined &&
        image.id !== null &&
        (typeof image.id === "string" || typeof image.id === "number")
      ) {
        out.id = image.id;
      }

      const copyString = (key, maxLen = 4096) => {
        if (typeof image[key] !== "string") return;
        const value = image[key].trim();
        if (!value) return;
        out[key] = value.slice(0, maxLen);
      };

      copyString("filePath");
      copyString("path");
      copyString("file");
      copyString("thumbnailURL");
      copyString("thumbnail");
      copyString("url");
      copyString("name", 256);
      copyString("ext", 32);

      if (Object.keys(out).length === 0) return null;
      return out;
    }

    function sanitizeSessionEntry(session) {
      if (!session || typeof session !== "object") return null;
      const poses = Math.max(0, toInt(session.poses, 0));
      const time = clamp(session.time, 0, maxTimePerSession, 0);
      if (poses < minPoses || time < minTimeSeconds) {
        return null;
      }
      const hour = clamp(session.hour, 0, 23, 0);
      const minute = clamp(session.minute, 0, 59, 0);
      const timestamp =
        typeof session.timestamp === "string" &&
        !Number.isNaN(Date.parse(session.timestamp))
          ? session.timestamp
          : nowIso();
      const mode =
        typeof session.mode === "string" ? session.mode.slice(0, 32) : "classique";
      const memoryType =
        session.memoryType === "flash" || session.memoryType === "progressive"
          ? session.memoryType
          : null;
      const customQueue = Array.isArray(session.customQueue) ? session.customQueue : null;
      const images = Array.isArray(session.images)
        ? session.images
            .map((img) => sanitizeSessionImageEntry(img))
            .filter(Boolean)
            .slice(0, 1000)
        : [];

      return {
        timestamp,
        hour,
        minute,
        poses,
        time,
        mode,
        memoryType,
        customQueue,
        images,
      };
    }

    function validateSessionValues(poses, time) {
      const validPoses = Math.max(0, toInt(poses, 0));
      const validTime = clamp(time, 0, maxTimePerSession, 0);
      const isValid = validPoses >= minPoses && validTime >= minTimeSeconds;
      return { poses: validPoses, time: validTime, isValid };
    }

    function sanitizeData(candidate) {
      const base = getDefaultData();
      const raw = candidate && typeof candidate === "object" ? candidate : {};
      let repaired = false;

      const rawDays = raw.days && typeof raw.days === "object" ? raw.days : {};
      if (!raw.days || typeof raw.days !== "object") repaired = true;

      for (const [dateKey, dayValue] of Object.entries(rawDays)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          repaired = true;
          continue;
        }
        const day = dayValue && typeof dayValue === "object" ? dayValue : {};
        if (!dayValue || typeof dayValue !== "object") repaired = true;

        const sessionsRaw = Array.isArray(day.sessions) ? day.sessions : [];
        if (!Array.isArray(day.sessions)) repaired = true;
        const sessions = sessionsRaw
          .map((s) => sanitizeSessionEntry(s))
          .filter(Boolean)
          .slice(-50);
        if (sessions.length !== sessionsRaw.length) repaired = true;

        const posesFromSessions = sessions.reduce((sum, s) => sum + (s.poses || 0), 0);
        const timeFromSessions = sessions.reduce((sum, s) => sum + (s.time || 0), 0);
        const posesRaw = Math.max(0, toInt(day.poses, 0));
        const timeRaw = Math.max(0, toInt(day.time, 0));
        const poses = sessions.length > 0 ? posesFromSessions : posesRaw;
        const time = sessions.length > 0 ? timeFromSessions : timeRaw;

        if (poses !== posesRaw || time !== timeRaw) repaired = true;

        base.days[dateKey] = { poses, time, sessions };
      }

      base.stats = {
        totalPoses: Math.max(0, toInt(raw.stats?.totalPoses, 0)),
        totalTime: Math.max(0, toInt(raw.stats?.totalTime, 0)),
        currentStreak: Math.max(0, toInt(raw.stats?.currentStreak, 0)),
        bestStreak: Math.max(0, toInt(raw.stats?.bestStreak, 0)),
        lastSessionDate:
          typeof raw.stats?.lastSessionDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(raw.stats.lastSessionDate)
            ? raw.stats.lastSessionDate
            : null,
      };

      const computedPoses = Object.values(base.days).reduce(
        (sum, day) => sum + (day.poses || 0),
        0,
      );
      const computedTime = Object.values(base.days).reduce(
        (sum, day) => sum + (day.time || 0),
        0,
      );

      if (base.stats.totalPoses !== computedPoses || base.stats.totalTime !== computedTime) {
        repaired = true;
        base.stats.totalPoses = computedPoses;
        base.stats.totalTime = computedTime;
      }

      return { data: base, repaired };
    }

    function normalizePayload(rawPayload) {
      if (!rawPayload || typeof rawPayload !== "object") {
        const sanitized = sanitizeData(null);
        return {
          payload: {
            schemaVersion,
            data: sanitized.data,
          },
          data: sanitized.data,
          repaired: true,
        };
      }

      const sourceData =
        rawPayload.schemaVersion === schemaVersion && rawPayload.data
          ? rawPayload.data
          : rawPayload;
      const sanitized = sanitizeData(sourceData);
      const payload = {
        schemaVersion,
        data: sanitized.data,
      };

      const repaired =
        sanitized.repaired ||
        rawPayload.schemaVersion !== schemaVersion ||
        !rawPayload.data;

      return { payload, data: sanitized.data, repaired };
    }

    function mergeDayEntries(existingDay, incomingDay) {
      const base = existingDay && typeof existingDay === "object" ? existingDay : {};
      const next = incomingDay && typeof incomingDay === "object" ? incomingDay : {};

      const existingSessions = Array.isArray(base.sessions) ? base.sessions : [];
      const incomingSessions = Array.isArray(next.sessions) ? next.sessions : [];
      const mergedSessions = [];
      const seen = new Set();

      [...existingSessions, ...incomingSessions].forEach((session) => {
        if (!session || typeof session !== "object") return;
        const signature = [
          session.timestamp || "",
          session.hour ?? "",
          session.minute ?? "",
          session.poses ?? "",
          session.time ?? "",
          session.mode || "",
          session.memoryType || "",
          Array.isArray(session.images) ? session.images.length : 0,
        ].join("|");
        if (seen.has(signature)) return;
        seen.add(signature);
        mergedSessions.push(session);
      });

      mergedSessions.sort((a, b) => {
        const at = Date.parse(a?.timestamp || "") || 0;
        const bt = Date.parse(b?.timestamp || "") || 0;
        return at - bt;
      });

      const limitedSessions = mergedSessions.slice(-50);
      const posesFromSessions = limitedSessions.reduce(
        (sum, s) => sum + (Number(s?.poses) || 0),
        0,
      );
      const timeFromSessions = limitedSessions.reduce(
        (sum, s) => sum + (Number(s?.time) || 0),
        0,
      );

      return {
        poses:
          limitedSessions.length > 0
            ? posesFromSessions
            : Math.max(Number(base.poses) || 0, Number(next.poses) || 0),
        time:
          limitedSessions.length > 0
            ? timeFromSessions
            : Math.max(Number(base.time) || 0, Number(next.time) || 0),
        sessions: limitedSessions,
      };
    }

    function mergeTimelineDatas(datasets) {
      const merged = getDefaultData();
      const sources = Array.isArray(datasets) ? datasets : [];
      sources.forEach((data) => {
        if (!data || typeof data !== "object" || !data.days) return;
        Object.entries(data.days).forEach(([dateKey, day]) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return;
          if (!merged.days[dateKey]) {
            merged.days[dateKey] = mergeDayEntries(null, day);
            return;
          }
          merged.days[dateKey] = mergeDayEntries(merged.days[dateKey], day);
        });
      });
      return merged;
    }

    function listLocalCandidateKeys(storage, optionsArg = {}) {
      const options = optionsArg && typeof optionsArg === "object" ? optionsArg : {};
      const baseKeys = Array.isArray(options.baseKeys) ? options.baseKeys : [];
      const backupPrefixes = Array.isArray(options.backupPrefixes)
        ? options.backupPrefixes
        : [];
      const includeBackupsIfPrimaryMissing =
        options.includeBackupsIfPrimaryMissing !== false;
      const maxBackupsPerPrefix = Math.max(
        0,
        toInt(options.maxBackupsPerPrefix, 2),
      );
      const keys = new Set(
        baseKeys
          .map((k) => String(k || "").trim())
          .filter(Boolean),
      );

      try {
        if (
          !storage ||
          typeof storage.length !== "number" ||
          typeof storage.key !== "function"
        ) {
          return Array.from(keys);
        }
        const hasPrimaryData = baseKeys.some((baseKey) => {
          const safeKey = String(baseKey || "").trim();
          if (!safeKey || typeof storage.getItem !== "function") return false;
          try {
            return storage.getItem(safeKey) != null;
          } catch (_) {
            return false;
          }
        });
        const shouldIncludeBackups =
          backupPrefixes.length > 0 &&
          (includeBackupsIfPrimaryMissing ? !hasPrimaryData : false);
        const backupBuckets = new Map();

        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i);
          if (!key) continue;
          if (!shouldIncludeBackups) continue;
          const backupPrefix = backupPrefixes.find((prefix) =>
            String(key).startsWith(prefix),
          );
          if (!backupPrefix) continue;
          if (!backupBuckets.has(backupPrefix)) {
            backupBuckets.set(backupPrefix, []);
          }
          backupBuckets.get(backupPrefix).push(key);
        }

        backupBuckets.forEach((bucketKeys) => {
          const sorted = bucketKeys.slice().sort().reverse();
          const kept =
            maxBackupsPerPrefix > 0
              ? sorted.slice(0, maxBackupsPerPrefix)
              : sorted;
          kept.forEach((backupKey) => keys.add(backupKey));
        });
      } catch (_) {}
      return Array.from(keys);
    }

    function isBackupTimelineKey(storageKey, backupPrefixes = []) {
      const key = String(storageKey || "");
      return backupPrefixes.some((prefix) => key.startsWith(String(prefix)));
    }

    function loadFromLocalStorageKey(
      storage,
      storageKey,
      normalizePayload,
      optionsArg = {},
    ) {
      const options =
        optionsArg && typeof optionsArg === "object" ? optionsArg : {};
      const onRepaired =
        typeof options.onRepaired === "function" ? options.onRepaired : null;
      const backupPrefixes = Array.isArray(options.backupPrefixes)
        ? options.backupPrefixes
        : [];
      const reportBackupRepairs = options.reportBackupRepairs === true;
      try {
        if (!storage || typeof storage.getItem !== "function") return null;
        const stored = storage.getItem(storageKey);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        if (typeof normalizePayload === "function") {
          const normalized = normalizePayload(parsed);
          if (normalized?.repaired && onRepaired) {
            const isBackup = isBackupTimelineKey(storageKey, backupPrefixes);
            if (!isBackup || reportBackupRepairs) {
              try {
                onRepaired(storageKey);
              } catch (_) {}
            }
          }
          return normalized && normalized.data ? normalized.data : null;
        }
        return parsed;
      } catch (_) {}
      return null;
    }

    function writeTimelineBackup(storage, payload, optionsArg = {}) {
      const options = optionsArg && typeof optionsArg === "object" ? optionsArg : {};
      const prefix = String(options.prefix || "posechrono-timeline-backup:");
      const keep = Math.max(1, toInt(options.keep, 3));
      try {
        if (
          !storage ||
          typeof storage.setItem !== "function" ||
          typeof storage.removeItem !== "function" ||
          typeof storage.key !== "function"
        ) {
          return;
        }
        const key = `${prefix}${Date.now()}`;
        storage.setItem(key, JSON.stringify(payload));

        const backupKeys = [];
        for (let i = 0; i < storage.length; i++) {
          const existingKey = storage.key(i);
          if (existingKey && String(existingKey).startsWith(prefix)) {
            backupKeys.push(existingKey);
          }
        }
        backupKeys.sort();
        while (backupKeys.length > keep) {
          const oldest = backupKeys.shift();
          if (oldest) storage.removeItem(oldest);
        }
      } catch (_) {}
    }

    function loadLocalCandidates(
      storage,
      candidateKeys,
      normalizePayload,
      optionsArg = {},
    ) {
      const out = [];
      const keys = Array.isArray(candidateKeys) ? candidateKeys : [];
      const options =
        optionsArg && typeof optionsArg === "object" ? optionsArg : {};
      keys.forEach((key) => {
        const data = loadFromLocalStorageKey(
          storage,
          key,
          normalizePayload,
          options,
        );
        if (!data) return;
        out.push(data);
      });
      return out;
    }

    function resolveLocalTimelineData(candidates, mergeTimelineDatas, getDefaultDataFn) {
      const list = Array.isArray(candidates) ? candidates : [];
      if (list.length === 0) {
        if (typeof getDefaultDataFn === "function") return getDefaultDataFn();
        return getDefaultData();
      }
      if (typeof mergeTimelineDatas === "function") {
        return mergeTimelineDatas(list);
      }
      return list[0] || getDefaultData();
    }

    function cloneData(data) {
      try {
        if (typeof structuredClone === "function") {
          return structuredClone(data);
        }
      } catch (_) {}
      return JSON.parse(JSON.stringify(data));
    }

    return {
      getDefaultData,
      sanitizeSessionImageEntry,
      sanitizeSessionEntry,
      validateSessionValues,
      sanitizeData,
      normalizePayload,
      mergeDayEntries,
      mergeTimelineDatas,
      listLocalCandidateKeys,
      writeTimelineBackup,
      loadFromLocalStorageKey,
      loadLocalCandidates,
      resolveLocalTimelineData,
      cloneData,
    };
  }

  sharedRoot.createTimelineSanitizerUtils = createTimelineSanitizerUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
