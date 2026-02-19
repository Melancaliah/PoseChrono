(function initPoseChronoEagleAdapter(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});
  let installed = false;

  function installIfReady() {
    if (installed) return true;
    const registry = globalObj.PoseChronoPlatform;
    const eagleApi = globalObj.eagle;
    if (!registry || !eagleApi) return false;

    const capabilityOverrides =
      eagleApi &&
      eagleApi.capabilities &&
      typeof eagleApi.capabilities === "object"
        ? eagleApi.capabilities
        : null;

    function resolveCapability(key, fallback) {
      if (
        capabilityOverrides &&
        Object.prototype.hasOwnProperty.call(capabilityOverrides, key)
      ) {
        return !!capabilityOverrides[key];
      }
      return !!fallback;
    }

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
      media: {
        getSelected: async () => eagleApi.item?.getSelected?.(),
        getById: async (id) => eagleApi.item?.getById?.(id),
        query: async (query) => eagleApi.item?.get?.(query),
        open: async (id) => eagleApi.item?.open?.(id),
        revealItem: async (id) => {
          if (!eagleApi.item?.showInFolder) return false;
          await eagleApi.item.showInFolder(id);
          return true;
        },
        revealPath: async (filePath) => {
          if (!eagleApi.shell?.showItemInFolder) return false;
          await eagleApi.shell.showItemInFolder(filePath);
          return true;
        },
      },
      storage: {
        set: async (key, value) => eagleApi.preferences?.set?.(key, value),
        get: async (key) => eagleApi.preferences?.get?.(key),
      },
      system: {
        openExternal: async (url) => {
          if (!eagleApi.shell?.openExternal) return false;
          await eagleApi.shell.openExternal(url);
          return true;
        },
        showItemInFolder: async (filePath) => {
          if (!eagleApi.shell?.showItemInFolder) return false;
          await eagleApi.shell.showItemInFolder(filePath);
          return true;
        },
        openPath: async (filePath) => {
          if (eagleApi.shell?.openPath) return await eagleApi.shell.openPath(filePath);
          if (eagleApi.shell?.openItem) return await eagleApi.shell.openItem(filePath);
          return false;
        },
        getPath: async (name) => {
          if (!eagleApi.app?.getPath) return null;
          return eagleApi.app.getPath(name);
        },
      },
      folder: {
        getSelected: async () => eagleApi.folder?.getSelected?.(),
        getAll: async () => eagleApi.folder?.getAll?.(),
        browseAndAdd: async () => eagleApi.folder?.browseAndAdd?.(),
        removeFolder: async (id) => eagleApi.folder?.removeFolder?.(id),
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
        eagleApi: resolveCapability("eagleApi", true),
        windowControls: resolveCapability("windowControls", !!eagleApi.window),
        notifications: resolveCapability("notifications", !!eagleApi.notification),
        preferences: resolveCapability("preferences", !!eagleApi.preferences),
        dialogs: resolveCapability("dialogs", !!eagleApi.dialog),
        items: resolveCapability("items", !!eagleApi.item),
        media: resolveCapability("media", !!eagleApi.item),
        storage: resolveCapability("storage", !!eagleApi.preferences),
        system: resolveCapability("system", !!(eagleApi.shell || eagleApi.app)),
        folders: resolveCapability("folders", !!eagleApi.folder),
        tags: resolveCapability("tags", !!eagleApi.tag),
        clipboard: resolveCapability("clipboard", !!eagleApi.clipboard),
        shell: resolveCapability("shell", !!eagleApi.shell),
        revealEagle: resolveCapability(
          "revealEagle",
          !!(eagleApi.item?.showInFolder || eagleApi.shell?.showItemInFolder),
        ),
        pinWindow: resolveCapability("pinWindow", !!eagleApi.window?.setAlwaysOnTop),
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
