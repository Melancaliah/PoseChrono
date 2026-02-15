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
const DESKTOP_MEDIA_FOLDER_KEY = "desktop.mediaFolders";
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

let mainWindow = null;
let hasPromptedForMediaFolder = false;
let scanCache = {
  key: "",
  byId: new Map(),
  items: [],
};

function getPrefsFilePath() {
  return path.join(app.getPath("userData"), PREFS_FILE_NAME);
}

async function readPrefsFile() {
  const filePath = getPrefsFilePath();
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { preferences: {} };
    if (!parsed.preferences || typeof parsed.preferences !== "object") {
      parsed.preferences = {};
    }
    return parsed;
  } catch (_) {
    return { preferences: {} };
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

async function promptForMediaFolder(win) {
  const result = await dialog.showOpenDialog(win, {
    title: "Select media folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return [];
  }
  return setConfiguredMediaFolders(result.filePaths);
}

async function ensureMediaFolders(win) {
  let folders = await getConfiguredMediaFolders();
  if (folders.length > 0) return folders;
  if (hasPromptedForMediaFolder) return folders;
  hasPromptedForMediaFolder = true;
  folders = await promptForMediaFolder(win);
  return folders;
}

async function scanMediaFilesInFolder(folderPath, folderId, outItems) {
  let entries = [];
  try {
    entries = await fsp.readdir(folderPath, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    const absolute = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      await scanMediaFilesInFolder(absolute, folderId, outItems);
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
}

async function scanMediaItems({ folderIds = null } = {}) {
  const allFolders = await getConfiguredMediaFolders();
  const folders =
    Array.isArray(folderIds) && folderIds.length > 0
      ? allFolders.filter((folder) => folderIds.includes(folder.id))
      : allFolders;

  const key = folders.map((folder) => folder.path).sort().join("|");
  if (key && scanCache.key === key && scanCache.items.length > 0) {
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

  scanCache = { key, byId, items };
  return items;
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
      hasPromptedForMediaFolder = true;
      scanCache = { key: "", byId: new Map(), items: [] };
    }

    return result;
  });

  ipcMain.handle("posechrono:items:getSelected", async () => []);

  ipcMain.handle("posechrono:folders:getSelected", async (event) => {
    const win = getBrowserWindowFromEvent(event);
    return ensureMediaFolders(win);
  });

  ipcMain.handle("posechrono:items:get", async (event, query) => {
    const win = getBrowserWindowFromEvent(event);
    const folders = await ensureMediaFolders(win);
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

function createMainWindow() {
  const windowIcon = resolveNativeIconFile();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#1b1c22",
    frame: false,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on(
    "console-message",
    (_, level, message, line, sourceId) => {
      const levelLabel = ["log", "warn", "error", "debug"][level] || "log";
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

  mainWindow.webContents.on("render-process-gone", (_, details) => {
    // eslint-disable-next-line no-console
    console.error("[desktop:web] render-process-gone:", details);
  });

  const entryFile = resolveWebEntryFile();
  // eslint-disable-next-line no-console
  console.log(`[desktop] Loading web entry: ${entryFile}`);
  mainWindow.loadFile(entryFile);
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
