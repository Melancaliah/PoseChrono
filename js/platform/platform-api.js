(function initPoseChronoPlatformApi(globalScope) {
  "use strict";

  const globalObj = globalScope || (typeof window !== "undefined" ? window : {});

  function noop() {}

  function createNoopRuntime() {
    return {
      onCreate: noop,
      onRun: noop,
      onHide: noop,
    };
  }

  function createNoopWindowApi() {
    return {
      hide: async () => {},
      minimize: async () => {},
      maximize: async () => {},
      unmaximize: async () => {},
      isMaximized: async () => false,
      isAlwaysOnTop: async () => false,
      setAlwaysOnTop: async () => {},
    };
  }

  function createNoopNotificationApi() {
    return {
      show: () => {},
    };
  }

  function createNoopPreferencesApi() {
    return {
      set: async () => {},
      get: async () => undefined,
    };
  }

  function createNoopDialogsApi() {
    return {
      showMessageBox: async () => ({ response: 0 }),
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    };
  }

  function createNoopItemsApi() {
    return {
      open: async () => {},
      moveToTrash: async () => {},
      getSelected: async () => [],
      getById: async () => null,
      get: async () => [],
      showInFolder: async () => {},
    };
  }

  function createNoopMediaApi() {
    return {
      getSelected: async () => [],
      getById: async () => null,
      query: async () => [],
      open: async () => {},
      revealItem: async () => false,
      revealPath: async () => false,
    };
  }

  function createNoopStorageApi() {
    return {
      set: async () => {},
      get: async () => undefined,
    };
  }

  function createNoopSystemApi() {
    return {
      openExternal: async () => false,
      showItemInFolder: async () => false,
      getPath: async () => null,
    };
  }

  function createNoopFoldersApi() {
    return {
      getSelected: async () => [],
      getAll: async () => [],
    };
  }

  function createNoopClipboardApi() {
    return {
      copyFiles: async () => {},
    };
  }

  function createNoopShellApi() {
    return {
      showItemInFolder: async () => {},
    };
  }

  function createNoopTagsApi() {
    return {
      get: async () => [],
    };
  }

  function createFallbackAdapter() {
    return {
      name: "fallback",
      runtime: createNoopRuntime(),
      window: createNoopWindowApi(),
      notification: createNoopNotificationApi(),
      preferences: createNoopPreferencesApi(),
      dialogs: createNoopDialogsApi(),
      item: createNoopItemsApi(),
      media: createNoopMediaApi(),
      storage: createNoopStorageApi(),
      system: createNoopSystemApi(),
      folder: createNoopFoldersApi(),
      clipboard: createNoopClipboardApi(),
      shell: createNoopShellApi(),
      tag: createNoopTagsApi(),
      tagGroup: createNoopTagsApi(),
      capabilities: {
        eagleApi: false,
        windowControls: false,
        notifications: false,
        preferences: false,
        dialogs: false,
        items: false,
        media: false,
        storage: false,
        system: false,
        folders: false,
        tags: false,
        clipboard: false,
        shell: false,
        revealEagle: false,
        pinWindow: false,
      },
    };
  }

  const platformRegistry = {
    active: createFallbackAdapter(),
    useAdapter(adapter) {
      if (!adapter || typeof adapter !== "object") return;
      this.active = {
        ...createFallbackAdapter(),
        ...adapter,
      };
    },
    getAdapter() {
      return this.active;
    },
  };

  globalObj.PoseChronoPlatform = platformRegistry;
  globalObj.getPoseChronoPlatform = function getPoseChronoPlatform() {
    return platformRegistry.getAdapter();
  };
})(typeof window !== "undefined" ? window : globalThis);
