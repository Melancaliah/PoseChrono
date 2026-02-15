(function initPoseChronoEagleAdapter(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  let installed = false;

  function installIfReady() {
    if (installed) return true;
    const registry = globalObj.PoseChronoPlatform;
    const eagleApi = globalObj.eagle;
    if (!registry || !eagleApi) return false;

    const adapter = {
      name: "eagle",
      runtime: {
        onCreate(handler) {
          if (typeof eagleApi.onPluginCreate === "function") {
            eagleApi.onPluginCreate(handler);
          }
        },
        onRun(handler) {
          if (typeof eagleApi.onPluginRun === "function") {
            eagleApi.onPluginRun(handler);
          }
        },
        onHide(handler) {
          if (typeof eagleApi.onPluginHide === "function") {
            eagleApi.onPluginHide(handler);
          }
        },
      },
      window: {
        hide: async () => eagleApi.window?.hide?.(),
        minimize: async () => eagleApi.window?.minimize?.(),
        maximize: async () => eagleApi.window?.maximize?.(),
        unmaximize: async () => eagleApi.window?.unmaximize?.(),
        isMaximized: async () => (await eagleApi.window?.isMaximized?.()) || false,
        isAlwaysOnTop: async () =>
          (await eagleApi.window?.isAlwaysOnTop?.()) || false,
        setAlwaysOnTop: async (value) =>
          eagleApi.window?.setAlwaysOnTop?.(!!value),
      },
      notification: {
        show: (payload) => eagleApi.notification?.show?.(payload),
      },
      preferences: {
        set: async (key, value) => eagleApi.preferences?.set?.(key, value),
        get: async (key) => eagleApi.preferences?.get?.(key),
      },
      dialogs: {
        showMessageBox: async (options) =>
          eagleApi.dialog?.showMessageBox?.(options),
        showOpenDialog: async (options) =>
          eagleApi.dialog?.showOpenDialog?.(options),
      },
      item: {
        open: async (id) => eagleApi.item?.open?.(id),
        moveToTrash: async (ids) => eagleApi.item?.moveToTrash?.(ids),
        getSelected: async () => eagleApi.item?.getSelected?.(),
        getById: async (id) => eagleApi.item?.getById?.(id),
        get: async (query) => eagleApi.item?.get?.(query),
        showInFolder: async (id) => eagleApi.item?.showInFolder?.(id),
      },
      folder: {
        getSelected: async () => eagleApi.folder?.getSelected?.(),
      },
      clipboard: {
        copyFiles: async (paths) => eagleApi.clipboard?.copyFiles?.(paths),
      },
      shell: {
        showItemInFolder: async (filePath) =>
          eagleApi.shell?.showItemInFolder?.(filePath),
      },
      tag: {
        get: async () => eagleApi.tag?.get?.(),
      },
      tagGroup: {
        get: async () => eagleApi.tagGroup?.get?.(),
      },
      capabilities: {
        eagleApi: true,
        windowControls: !!eagleApi.window,
        notifications: !!eagleApi.notification,
        preferences: !!eagleApi.preferences,
        dialogs: !!eagleApi.dialog,
        items: !!eagleApi.item,
        folders: !!eagleApi.folder,
        tags: !!eagleApi.tag,
        clipboard: !!eagleApi.clipboard,
        shell: !!eagleApi.shell,
      },
    };

    registry.useAdapter(adapter);
    installed = true;
    return true;
  }

  if (installIfReady()) return;

  let attempts = 0;
  const maxAttempts = 200; // ~5s avec 25ms
  const retryTimer = setInterval(() => {
    attempts += 1;
    if (installIfReady() || attempts >= maxAttempts) {
      clearInterval(retryTimer);
    }
  }, 25);
})(typeof window !== "undefined" ? window : globalThis);
