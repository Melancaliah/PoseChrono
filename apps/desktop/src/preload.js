const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("poseChronoDesktop", {
  platform: "desktop",
  version: "0.0.1-scaffold",
});

