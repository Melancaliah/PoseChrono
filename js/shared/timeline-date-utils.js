(function initPoseChronoSharedTimelineDateUtils(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  const sharedRoot = globalObj.PoseChronoShared || {};

  function createTimelineDateUtils() {
    function toKey(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function getToday() {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }

    function isSameDay(d1, d2) {
      return d1.toDateString() === d2.toDateString();
    }

    function isFuture(date, today) {
      return date > today;
    }

    function getMondayBefore(date) {
      const result = new Date(date);
      const dayOfWeek = result.getDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      result.setDate(result.getDate() + diff);
      result.setHours(0, 0, 0, 0);
      return result;
    }

    function getYearStartDate(year) {
      const jan1 = new Date(year, 0, 1);
      return getMondayBefore(jan1);
    }

    function diffInDays(d1, d2) {
      return Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
    }

    return {
      toKey,
      getToday,
      isSameDay,
      isFuture,
      getMondayBefore,
      getYearStartDate,
      diffInDays,
    };
  }

  sharedRoot.createTimelineDateUtils = createTimelineDateUtils;
  globalObj.PoseChronoShared = sharedRoot;
})(typeof window !== "undefined" ? window : globalThis);
