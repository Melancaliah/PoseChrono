const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  shell,
} = require("electron");

const APP_ROOT = path.resolve(__dirname, "..", "..", "..");
const ROOT_WEB_ENTRY = path.join(APP_ROOT, "index.html");
const BUNDLED_WEB_ENTRY = path.join(__dirname, "..", "web", "index.html");
const SCAFFOLD_WEB_ENTRY = path.join(__dirname, "renderer", "index.html");
const ROOT_ICON_ICO = path.join(APP_ROOT, "logo.ico");
const ROOT_ICON_PNG = path.join(APP_ROOT, "logo.png");
const BUNDLED_ICON_PNG = path.join(__dirname, "..", "web", "logo.png");
const PREFS_FILE_NAME = "posechrono-desktop-prefs.json";
const STORAGE_LEGACY_FILE_NAME = "posechrono-desktop-storage.json";
const STORAGE_DIR_NAME = "storage";
const DEV_MIGRATION_SENTINEL_FILE = ".posechrono-dev-migration-v1";
const DESKTOP_MEDIA_FOLDER_KEY = "desktop.mediaFolders";
const DESKTOP_WINDOW_BOUNDS_KEY = "desktop.windowBounds";
const DESKTOP_WINDOW_MAXIMIZED_KEY = "desktop.windowMaximized";
const WINDOW_STATE_SAVE_DEBOUNCE_MS = 250;
const DEFAULT_WINDOW_CONFIG = Object.freeze({
  width: 1584,
  height: 1357,
  minWidth: 1024,
  minHeight: 700,
});
const MEDIA_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "tif",
  "tiff",
  "avif",
  "heic",
  "heif",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
  "wmv",
  "m4v",
]);

const DEFAULT_USER_DATA_PATH = app.getPath("userData");
let DEV_USER_DATA_PATH = null;
const BOOT_TRACE_MAIN_ENABLED = process.env.POSECHRONO_BOOT_TRACE === "1";

if (!app.isPackaged) {
  try {
    DEV_USER_DATA_PATH = path.join(
      app.getPath("appData"),
      "PoseChrono-Desktop-Dev",
    );
    app.setPath("userData", DEV_USER_DATA_PATH);
  } catch (_) {}
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

try {
  const sessionDataPath = path.join(app.getPath("userData"), "SessionData");
  fs.mkdirSync(sessionDataPath, { recursive: true });
  app.setPath("sessionData", sessionDataPath);

  const cacheDir = app.isPackaged
    ? path.join(sessionDataPath, "Cache")
    : path.join(
        app.getPath("temp"),
        "PoseChrono-Desktop-DevCache",
        String(process.pid),
      );
  fs.mkdirSync(cacheDir, { recursive: true });
  app.setPath("cache", cacheDir);

  const diskCacheDir = app.isPackaged
    ? path.join(sessionDataPath, "Cache")
    : path.join(
        app.getPath("temp"),
        "PoseChrono-Desktop-DevDiskCache",
        String(process.pid),
      );
  fs.mkdirSync(diskCacheDir, { recursive: true });
  app.commandLine.appendSwitch(
    "disk-cache-dir",
    diskCacheDir,
  );

} catch (_) {}

let mainWindow = null;
let windowStateSaveTimer = null;
let scanCache = {
  key: "",
  byId: new Map(),
  items: [],
};
const bootTraceMainStartMs = Date.now();

function logBootTraceMain(step, details = null) {
  if (!BOOT_TRACE_MAIN_ENABLED) return;
  const delta = Date.now() - bootTraceMainStartMs;
  const suffix =
    details && typeof details === "object"
      ? ` ${JSON.stringify(details)}`
      : details
        ? ` ${String(details)}`
        : "";
  // eslint-disable-next-line no-console
  console.log(`[BootTrace:main +${delta}ms] ${step}${suffix}`);
}

function migrateLegacyDevUserDataIfNeeded() {
  if (app.isPackaged) return;
  if (!DEV_USER_DATA_PATH) return;
  const currentUserDataPath = app.getPath("userData");
  if (
    !currentUserDataPath ||
    path.resolve(currentUserDataPath) === path.resolve(DEFAULT_USER_DATA_PATH)
  ) {
    return;
  }
  const sentinelPath = path.join(currentUserDataPath, DEV_MIGRATION_SENTINEL_FILE);

  try {
    if (fs.existsSync(sentinelPath)) return;
    if (!fs.existsSync(DEFAULT_USER_DATA_PATH)) return;
    fs.mkdirSync(currentUserDataPath, { recursive: true });

    const entriesToMigrate = [
      PREFS_FILE_NAME,
      STORAGE_LEGACY_FILE_NAME,
      STORAGE_DIR_NAME,
    ];

    for (const entryName of entriesToMigrate) {
      const source = path.join(DEFAULT_USER_DATA_PATH, entryName);
      const target = path.join(currentUserDataPath, entryName);
      if (!fs.existsSync(source) || fs.existsSync(target)) continue;

      const stat = fs.statSync(source);
      if (stat.isDirectory()) {
        fs.cpSync(source, target, { recursive: true });
      } else if (stat.isFile()) {
        fs.copyFileSync(source, target);
      }
      logBootTraceMain("devUserData.migrated", entryName);
    }
    fs.writeFileSync(sentinelPath, String(Date.now()), "utf8");
  } catch (error) {
    logBootTraceMain("devUserData.migrationFailed", String(error?.message || error));
  }
}

function getPrefsFilePath() {
  return path.join(app.getPath("userData"), PREFS_FILE_NAME);
}

let _prefsCache = null;

async function readPrefsFile() {
  if (_prefsCache) return _prefsCache;
  const filePath = getPrefsFilePath();
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      _prefsCache = { preferences: {} };
      return _prefsCache;
    }
    if (!parsed.preferences || typeof parsed.preferences !== "object") {
      parsed.preferences = {};
    }
    _prefsCache = parsed;
    return _prefsCache;
  } catch (_) {
    _prefsCache = { preferences: {} };
    return _prefsCache;
  }
}

async function writePrefsFile(payload) {
  const filePath = getPrefsFilePath();
  const data = payload && typeof payload === "object" ? payload : {};
  if (!data.preferences || typeof data.preferences !== "object") {
    data.preferences = {};
  }
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  _prefsCache = data;
}

function getStorageFilePath() {
  return path.join(app.getPath("userData"), STORAGE_LEGACY_FILE_NAME);
}

function getStorageDirPath() {
  return path.join(app.getPath("userData"), STORAGE_DIR_NAME);
}

function normalizeStorageKey(key) {
  return typeof key === "string" ? key.trim() : "";
}

function getStorageEntryPath(storageKey) {
  const normalized = normalizeStorageKey(storageKey);
  const encoded = encodeURIComponent(normalized);
  return path.join(getStorageDirPath(), `${encoded}.json`);
}

async function readStorageFile() {
  const filePath = getStorageFilePath();
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { values: {} };
    if (!parsed.values || typeof parsed.values !== "object") {
      parsed.values = {};
    }
    return parsed;
  } catch (_) {
    return { values: {} };
  }
}

async function writeStorageFile(payload) {
  const filePath = getStorageFilePath();
  const data = payload && typeof payload === "object" ? payload : {};
  if (!data.values || typeof data.values !== "object") {
    data.values = {};
  }
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

let legacyStorageLoaded = false;
let legacyStorageCache = { values: {} };

async function ensureLegacyStorageLoaded() {
  if (legacyStorageLoaded) return legacyStorageCache;
  legacyStorageCache = await readStorageFile();
  legacyStorageLoaded = true;
  return legacyStorageCache;
}

async function readStorageEntry(storageKey) {
  const key = normalizeStorageKey(storageKey);
  if (!key) return { found: false, value: null };

  const entryPath = getStorageEntryPath(key);
  try {
    const raw = await fsp.readFile(entryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "value" in parsed) {
      return { found: true, value: parsed.value };
    }
    return { found: true, value: parsed };
  } catch (_) {}

  const legacy = await ensureLegacyStorageLoaded();
  const hasLegacyValue =
    legacy &&
    legacy.values &&
    Object.prototype.hasOwnProperty.call(legacy.values, key);
  if (!hasLegacyValue) {
    return { found: false, value: null };
  }
  const value = legacy.values[key];
  await writeStorageEntry(key, value);
  return { found: true, value };
}

async function writeStorageEntry(storageKey, value) {
  const key = normalizeStorageKey(storageKey);
  if (!key) return false;
  const entryPath = getStorageEntryPath(key);
  await fsp.mkdir(path.dirname(entryPath), { recursive: true });
  const payload = {
    schemaVersion: 1,
    key,
    updatedAt: Date.now(),
    value,
  };
  await fsp.writeFile(entryPath, JSON.stringify(payload), "utf8");
  return true;
}

async function removeStorageEntry(storageKey) {
  const key = normalizeStorageKey(storageKey);
  if (!key) return false;
  const entryPath = getStorageEntryPath(key);
  try {
    await fsp.unlink(entryPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return true;
}

function toFolderId(folderPath) {
  return `desktop-folder:${Buffer.from(folderPath).toString("base64url")}`;
}

function toItemId(filePath) {
  return `desktop-item:${Buffer.from(filePath).toString("base64url")}`;
}

async function getPreference(key) {
  const prefs = await readPrefsFile();
  return prefs.preferences[key];
}

async function setPreference(key, value) {
  const prefs = await readPrefsFile();
  prefs.preferences[key] = value;
  await writePrefsFile(prefs);
}

function normalizeWindowBounds(bounds) {
  if (!bounds || typeof bounds !== "object") return null;
  const width = Number(bounds.width);
  const height = Number(bounds.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;

  const normalized = {
    width: Math.max(DEFAULT_WINDOW_CONFIG.minWidth, Math.round(width)),
    height: Math.max(DEFAULT_WINDOW_CONFIG.minHeight, Math.round(height)),
  };

  const x = Number(bounds.x);
  const y = Number(bounds.y);
  if (Number.isFinite(x)) normalized.x = Math.round(x);
  if (Number.isFinite(y)) normalized.y = Math.round(y);

  return normalized;
}

async function loadWindowState() {
  const [storedBounds, storedMaximized] = await Promise.all([
    getPreference(DESKTOP_WINDOW_BOUNDS_KEY),
    getPreference(DESKTOP_WINDOW_MAXIMIZED_KEY),
  ]);

  return {
    bounds: normalizeWindowBounds(storedBounds),
    isMaximized: !!storedMaximized,
  };
}

function clearWindowStateSaveTimer() {
  if (!windowStateSaveTimer) return;
  clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = null;
}

async function persistWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const prefs = await readPrefsFile();
    prefs.preferences[DESKTOP_WINDOW_MAXIMIZED_KEY] = !!win.isMaximized();

    if (!win.isMaximized() && !win.isMinimized()) {
      const bounds = win.getBounds();
      prefs.preferences[DESKTOP_WINDOW_BOUNDS_KEY] = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    }

    await writePrefsFile(prefs);
  } catch (_) {}
}

function scheduleWindowStateSave(win, immediate = false) {
  if (!win || win.isDestroyed()) return;
  clearWindowStateSaveTimer();
  const delay = immediate ? 0 : WINDOW_STATE_SAVE_DEBOUNCE_MS;
  windowStateSaveTimer = setTimeout(() => {
    windowStateSaveTimer = null;
    void persistWindowState(win);
  }, delay);
}

function normalizeFolderRecords(folderPaths) {
  if (!Array.isArray(folderPaths)) return [];
  return folderPaths
    .filter((folderPath) => typeof folderPath === "string" && folderPath.trim())
    .map((folderPath) => path.resolve(folderPath.trim()))
    .filter((folderPath, idx, arr) => arr.indexOf(folderPath) === idx)
    .map((folderPath) => ({
      id: toFolderId(folderPath),
      name: path.basename(folderPath),
      path: folderPath,
    }));
}

async function getConfiguredMediaFolders() {
  const value = await getPreference(DESKTOP_MEDIA_FOLDER_KEY);
  if (!Array.isArray(value)) return [];
  return normalizeFolderRecords(value);
}

async function setConfiguredMediaFolders(folderPaths) {
  const normalized = normalizeFolderRecords(folderPaths);
  await setPreference(
    DESKTOP_MEDIA_FOLDER_KEY,
    normalized.map((folder) => folder.path),
  );
  return normalized;
}


async function scanMediaFilesInFolder(folderPath, folderId, outItems) {
  let entries = [];
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch (_) {
    return;
  }

  const subdirPromises = [];
  for (const entry of entries) {
    const absolute = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      subdirPromises.push(scanMediaFilesInFolder(absolute, folderId, outItems));
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) continue;

    outItems.push({
      id: toItemId(absolute),
      name: path.basename(entry.name, path.extname(entry.name)),
      fileName: entry.name,
      filePath: absolute,
      path: absolute,
      file: absolute,
      ext,
      folderId,
      tags: [],
      thumbnailURL: "",
      thumbnail: "",
    });
  }

  if (subdirPromises.length > 0) {
    await Promise.all(subdirPromises);
  }
}

async function scanMediaItems({ folderIds = null } = {}) {
  const scanStartMs = Date.now();
  const allFolders = await getConfiguredMediaFolders();
  const folders =
    Array.isArray(folderIds) && folderIds.length > 0
      ? allFolders.filter((folder) => folderIds.includes(folder.id))
      : allFolders;

  const key = folders.map((folder) => folder.path).sort().join("|");
  if (key && scanCache.key === key && scanCache.items.length > 0) {
    logBootTraceMain("scanMediaItems.cache-hit", {
      folders: folders.length,
      items: scanCache.items.length,
      durationMs: Date.now() - scanStartMs,
    });
    return scanCache.items;
  }

  const items = [];
  for (const folder of folders) {
    await scanMediaFilesInFolder(folder.path, folder.id, items);
  }

  items.sort((a, b) => {
    const folderCmp = (a.folderId || "").localeCompare(b.folderId || "");
    if (folderCmp !== 0) return folderCmp;
    return a.filePath.localeCompare(b.filePath);
  });

  const byId = new Map();
  for (const item of items) {
    byId.set(item.id, item);
  }
  const uniqueItems = [...byId.values()];

  scanCache = { key, byId, items: uniqueItems };
  logBootTraceMain("scanMediaItems.full-scan", {
    folders: folders.length,
    items: uniqueItems.length,
    durationMs: Date.now() - scanStartMs,
  });
  return uniqueItems;
}

function getBrowserWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow;
}

function registerIpcHandlers() {
  ipcMain.handle("posechrono:window:hide", (event) => {
    const win = getBrowserWindowFromEvent(event);
    win?.hide();
  });

  ipcMain.handle("posechrono:window:minimize", (event) => {
    const win = getBrowserWindowFromEvent(event);
    win?.minimize();
  });

  ipcMain.handle("posechrono:window:maximize", (event) => {
    const win = getBrowserWindowFromEvent(event);
    win?.maximize();
  });

  ipcMain.handle("posechrono:window:unmaximize", (event) => {
    const win = getBrowserWindowFromEvent(event);
    win?.unmaximize();
  });

  ipcMain.handle("posechrono:window:isMaximized", (event) => {
    const win = getBrowserWindowFromEvent(event);
    return !!win?.isMaximized();
  });

  ipcMain.handle("posechrono:window:isAlwaysOnTop", (event) => {
    const win = getBrowserWindowFromEvent(event);
    return !!win?.isAlwaysOnTop();
  });

  ipcMain.handle("posechrono:window:setAlwaysOnTop", (event, value) => {
    const win = getBrowserWindowFromEvent(event);
    win?.setAlwaysOnTop(!!value);
    return !!win?.isAlwaysOnTop();
  });

  ipcMain.handle("posechrono:preferences:get", async (_, key) =>
    getPreference(key),
  );

  ipcMain.handle("posechrono:preferences:set", async (_, key, value) => {
    await setPreference(key, value);
    return true;
  });

  ipcMain.handle("posechrono:storage:getJson", async (_, key) => {
    return readStorageEntry(key);
  });

  ipcMain.handle("posechrono:storage:setJson", async (_, key, value) => {
    return writeStorageEntry(key, value);
  });

  ipcMain.handle("posechrono:storage:remove", async (_, key) => {
    return removeStorageEntry(key);
  });

  ipcMain.handle("posechrono:dialogs:showMessageBox", async (event, options) => {
    const win = getBrowserWindowFromEvent(event);
    return dialog.showMessageBox(win, options || {});
  });

  ipcMain.handle("posechrono:dialogs:showOpenDialog", async (event, options) => {
    const win = getBrowserWindowFromEvent(event);
    const result = await dialog.showOpenDialog(win, options || {});

    if (
      result &&
      !result.canceled &&
      Array.isArray(result.filePaths) &&
      result.filePaths.length > 0 &&
      options &&
      Array.isArray(options.properties) &&
      options.properties.includes("openDirectory")
    ) {
      await setConfiguredMediaFolders(result.filePaths);
      scanCache = { key: "", byId: new Map(), items: [] };
    }

    return result;
  });

  ipcMain.handle("posechrono:items:getSelected", async () => {
    const folders = await getConfiguredMediaFolders();
    if (!folders.length) return [];
    return scanMediaItems({
      folderIds: folders.map((folder) => folder.id),
    });
  });

  ipcMain.handle("posechrono:folders:getSelected", async () => {
    return getConfiguredMediaFolders();
  });

  ipcMain.handle("posechrono:folders:browseAndAdd", async (event) => {
    const win = getBrowserWindowFromEvent(event);
    const result = await dialog.showOpenDialog(win, {
      title: "Add media folders",
      properties: ["openDirectory", "multiSelections"],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    const existing = await getConfiguredMediaFolders();
    const existingPaths = existing.map((f) => f.path);
    const merged = [...existingPaths, ...result.filePaths];
    const folders = await setConfiguredMediaFolders(merged);
    scanCache = { key: "", byId: new Map(), items: [] };
    return folders;
  });

  ipcMain.handle("posechrono:folders:removeFolder", async (event, folderId) => {
    const existing = await getConfiguredMediaFolders();
    const filtered = existing.filter((f) => f.id !== folderId).map((f) => f.path);
    const folders = await setConfiguredMediaFolders(filtered);
    scanCache = { key: "", byId: new Map(), items: [] };
    return folders;
  });

  ipcMain.handle("posechrono:items:get", async (_, query) => {
    const folders = await getConfiguredMediaFolders();
    if (!folders.length) return [];
    const folderIds =
      query && Array.isArray(query.folders) ? query.folders : null;
    return scanMediaItems({ folderIds });
  });

  ipcMain.handle("posechrono:items:getById", async (_, itemId) => {
    if (!itemId || typeof itemId !== "string") return null;
    if (!scanCache.byId || scanCache.byId.size === 0) {
      await scanMediaItems();
    }
    return scanCache.byId.get(itemId) || null;
  });

  ipcMain.handle("posechrono:items:open", async (_, itemId) => {
    if (!itemId) return;
    if (!scanCache.byId || scanCache.byId.size === 0) {
      await scanMediaItems();
    }
    const item = scanCache.byId.get(itemId);
    if (!item || !item.filePath) return;
    await shell.openPath(item.filePath);
  });

  ipcMain.handle("posechrono:items:moveToTrash", async (_, itemIds) => {
    if (!Array.isArray(itemIds) || itemIds.length === 0) return [];
    if (!scanCache.byId || scanCache.byId.size === 0) {
      await scanMediaItems();
    }

    const results = [];
    for (const itemId of itemIds) {
      const item = scanCache.byId.get(itemId);
      if (!item || !item.filePath) {
        results.push(false);
        continue;
      }
      try {
        await shell.trashItem(item.filePath);
        results.push(true);
      } catch (_) {
        results.push(false);
      }
    }
    scanCache = { key: "", byId: new Map(), items: [] };
    return results;
  });

  ipcMain.handle("posechrono:items:showInFolder", async (_, itemId) => {
    if (!itemId) return;
    if (!scanCache.byId || scanCache.byId.size === 0) {
      await scanMediaItems();
    }
    const item = scanCache.byId.get(itemId);
    if (item?.filePath) {
      shell.showItemInFolder(item.filePath);
    }
  });

  ipcMain.handle("posechrono:clipboard:copyFiles", async (_, paths) => {
    if (!Array.isArray(paths) || !paths.length) return false;
    const valid = paths.filter((p) => typeof p === "string" && p.trim());
    if (!valid.length) return false;
    clipboard.writeText(valid.join("\n"));
    return true;
  });

  ipcMain.handle("posechrono:shell:showItemInFolder", async (_, filePath) => {
    if (typeof filePath === "string" && filePath.trim()) {
      shell.showItemInFolder(path.resolve(filePath));
      return true;
    }
    return false;
  });

  ipcMain.handle("posechrono:shell:openPath", async (_, filePath) => {
    if (typeof filePath === "string" && filePath.trim()) {
      await shell.openPath(path.resolve(filePath));
      return true;
    }
    return false;
  });

  ipcMain.handle("posechrono:notification:show", async (_, payload) => {
    const title =
      payload && typeof payload.title === "string" ? payload.title : "PoseChrono";
    const body = payload && typeof payload.body === "string" ? payload.body : "";

    if (Notification.isSupported()) {
      new Notification({ title, body, silent: !!payload?.mute }).show();
      return true;
    }
    return false;
  });

  ipcMain.handle("posechrono:tag:get", async () => []);
  ipcMain.handle("posechrono:tagGroup:get", async () => []);
}

function resolveWebEntryFile() {
  if (fs.existsSync(BUNDLED_WEB_ENTRY)) return BUNDLED_WEB_ENTRY;
  if (fs.existsSync(ROOT_WEB_ENTRY)) return ROOT_WEB_ENTRY;
  return SCAFFOLD_WEB_ENTRY;
}

function resolveNativeIconFile() {
  if (fs.existsSync(BUNDLED_ICON_PNG)) return BUNDLED_ICON_PNG;
  if (fs.existsSync(ROOT_ICON_ICO)) return ROOT_ICON_ICO;
  if (fs.existsSync(ROOT_ICON_PNG)) return ROOT_ICON_PNG;
  return undefined;
}

async function createMainWindow() {
  const windowIcon = resolveNativeIconFile();
  const { bounds, isMaximized } = await loadWindowState();

  const windowOptions = {
    width: bounds?.width ?? DEFAULT_WINDOW_CONFIG.width,
    height: bounds?.height ?? DEFAULT_WINDOW_CONFIG.height,
    minWidth: DEFAULT_WINDOW_CONFIG.minWidth,
    minHeight: DEFAULT_WINDOW_CONFIG.minHeight,
    autoHideMenuBar: true,
    backgroundColor: "#1b1c22",
    frame: false,
    roundedCorners: true,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
    windowOptions.x = bounds.x;
    windowOptions.y = bounds.y;
  }

  mainWindow = new BrowserWindow({
    ...windowOptions,
  });
  logBootTraceMain("window.created", {
    width: windowOptions.width,
    height: windowOptions.height,
  });

  mainWindow.on("move", () => {
    scheduleWindowStateSave(mainWindow, false);
  });

  mainWindow.on("resize", () => {
    scheduleWindowStateSave(mainWindow, false);
  });

  mainWindow.on("maximize", () => {
    scheduleWindowStateSave(mainWindow, true);
  });

  mainWindow.on("unmaximize", () => {
    scheduleWindowStateSave(mainWindow, true);
  });

  mainWindow.on("close", () => {
    scheduleWindowStateSave(mainWindow, true);
  });

  mainWindow.on("closed", () => {
    clearWindowStateSaveTimer();
    mainWindow = null;
  });

  mainWindow.webContents.on(
    "console-message",
    (_, level, message, line, sourceId) => {
      // Electron level mapping can mark console.log as warning depending on runtime.
      // Normalize it so routine renderer logs stay in `log`.
      let levelLabel = "log";
      if (level >= 3) {
        levelLabel = "error";
      } else if (level === 2) {
        levelLabel = "warn";
      }
      // eslint-disable-next-line no-console
      console[levelLabel](
        `[desktop:web:${levelLabel}] ${sourceId || "unknown"}:${line || 0} ${message}`,
      );
    },
  );

  mainWindow.webContents.on("did-fail-load", (_, code, desc, url) => {
    // eslint-disable-next-line no-console
    console.error(`[desktop:web] did-fail-load code=${code} url=${url} desc=${desc}`);
  });

  mainWindow.webContents.on("did-start-loading", () => {
    logBootTraceMain("webContents.did-start-loading");
  });

  mainWindow.webContents.on("dom-ready", () => {
    logBootTraceMain("webContents.dom-ready");
  });

  mainWindow.webContents.on("did-finish-load", () => {
    logBootTraceMain("webContents.did-finish-load");
  });

  mainWindow.webContents.on("render-process-gone", (_, details) => {
    // eslint-disable-next-line no-console
    console.error("[desktop:web] render-process-gone:", details);
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = String(input?.key || "").toUpperCase();
    const isF12 = key === "F12";
    const isDevtoolsShortcut =
      key === "I" && !!input?.control && !!input?.shift;
    if (!isF12 && !isDevtoolsShortcut) return;
    event.preventDefault();
    if (mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.closeDevTools();
      return;
    }
    mainWindow.webContents.openDevTools({ mode: "detach" });
  });

  const entryFile = resolveWebEntryFile();
  // eslint-disable-next-line no-console
  console.log(`[desktop] Loading web entry: ${entryFile}`);
  logBootTraceMain("loadFile.begin", entryFile);
  mainWindow.loadFile(entryFile);

  if (isMaximized) {
    mainWindow.maximize();
  }
}

app.whenReady().then(async () => {
  logBootTraceMain("app.whenReady");
  migrateLegacyDevUserDataIfNeeded();
  registerIpcHandlers();
  logBootTraceMain("ipc.handlers.registered");
  await createMainWindow();
  logBootTraceMain("createMainWindow.done");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
