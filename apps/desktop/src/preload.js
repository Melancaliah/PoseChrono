const { contextBridge, ipcRenderer } = require("electron");

const createHandlers = [];
const runHandlers = [];
const hideHandlers = [];
let createCompleted = false;
let runCompleted = false;
let lifecycleScheduled = false;

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

async function runHandlersSequentially(handlers) {
  for (const handler of handlers) {
    try {
      await handler();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[desktop:eagle-shim] Handler error:", error);
    }
  }
}

async function flushLifecycle() {
  if (!createCompleted) {
    createCompleted = true;
    await runHandlersSequentially(createHandlers);
  }
  if (!runCompleted) {
    runCompleted = true;
    await runHandlersSequentially(runHandlers);
  }
}

function scheduleLifecycleFlush() {
  if (lifecycleScheduled) return;
  lifecycleScheduled = true;
  queueMicrotask(() => {
    void flushLifecycle();
  });
}

function registerRuntimeHandler(list, isDone, handler) {
  if (typeof handler !== "function") return;
  if (isDone()) {
    queueMicrotask(() => {
      Promise.resolve()
        .then(() => handler())
        // eslint-disable-next-line no-console
        .catch((error) => console.error("[desktop:eagle-shim] Late handler:", error));
    });
    return;
  }
  list.push(handler);
}

scheduleLifecycleFlush();

window.addEventListener("DOMContentLoaded", () => {
  scheduleLifecycleFlush();
  try {
    const body = window.document && window.document.body;
    if (!body) return;
    body.style.opacity = "1";
  } catch (_) {}
});


window.addEventListener("beforeunload", () => {
  for (const handler of hideHandlers) {
    try {
      handler();
    } catch (_) {}
  }
});

const eagleShim = {
  onPluginCreate(handler) {
    registerRuntimeHandler(createHandlers, () => createCompleted, handler);
  },
  onPluginRun(handler) {
    registerRuntimeHandler(runHandlers, () => runCompleted, handler);
  },
  onPluginHide(handler) {
    if (typeof handler === "function") {
      hideHandlers.push(handler);
    }
  },
  window: {
    hide: () => invoke("posechrono:window:hide"),
    minimize: () => invoke("posechrono:window:minimize"),
    maximize: () => invoke("posechrono:window:maximize"),
    unmaximize: () => invoke("posechrono:window:unmaximize"),
    isMaximized: () => invoke("posechrono:window:isMaximized"),
    isAlwaysOnTop: () => invoke("posechrono:window:isAlwaysOnTop"),
    setAlwaysOnTop: (value) =>
      invoke("posechrono:window:setAlwaysOnTop", !!value),
  },
  preferences: {
    set: (key, value) => invoke("posechrono:preferences:set", key, value),
    get: (key) => invoke("posechrono:preferences:get", key),
  },
  dialog: {
    showMessageBox: (options) =>
      invoke("posechrono:dialogs:showMessageBox", options || {}),
    showOpenDialog: (options) =>
      invoke("posechrono:dialogs:showOpenDialog", options || {}),
  },
  notification: {
    show: (payload) => invoke("posechrono:notification:show", payload || {}),
  },
  item: {
    getSelected: () => invoke("posechrono:items:getSelected"),
    get: (query) => invoke("posechrono:items:get", query || {}),
    getById: (id) => invoke("posechrono:items:getById", id),
    open: (id) => invoke("posechrono:items:open", id),
    moveToTrash: (ids) => invoke("posechrono:items:moveToTrash", ids || []),
    showInFolder: (id) => invoke("posechrono:items:showInFolder", id),
  },
  folder: {
    getSelected: () => invoke("posechrono:folders:getSelected"),
    browseAndAdd: () => invoke("posechrono:folders:browseAndAdd"),
    removeFolder: (id) => invoke("posechrono:folders:removeFolder", id),
  },
  clipboard: {
    copyFiles: (paths) => invoke("posechrono:clipboard:copyFiles", paths || []),
  },
  shell: {
    showItemInFolder: (filePath) =>
      invoke("posechrono:shell:showItemInFolder", filePath),
    openPath: (filePath) => invoke("posechrono:shell:openPath", filePath),
    openItem: (filePath) => invoke("posechrono:shell:openPath", filePath),
  },
  tag: {
    get: () => invoke("posechrono:tag:get"),
  },
  tagGroup: {
    get: () => invoke("posechrono:tagGroup:get"),
  },
  capabilities: {
    tags: false,
    revealEagle: false,
    pinWindow: true,
  },
};

contextBridge.exposeInMainWorld("eagle", eagleShim);

contextBridge.exposeInMainWorld("poseChronoDesktop", {
  platform: "desktop",
  version: "0.1.0-dev",
  bridge: "eagle-shim",
  bootTraceEnabled: process.env.POSECHRONO_BOOT_TRACE === "1",
  sync: {
    transport: process.env.POSECHRONO_SYNC_TRANSPORT || "",
    wsUrl: process.env.POSECHRONO_SYNC_WS_URL || "",
  },
  storage: {
    getJson: (key) => invoke("posechrono:storage:getJson", key),
    setJson: (key, value) => invoke("posechrono:storage:setJson", key, value),
    remove: (key) => invoke("posechrono:storage:remove", key),
  },
});
