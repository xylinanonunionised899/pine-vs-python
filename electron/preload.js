"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getBackendStatus: () => ipcRenderer.invoke("get-backend-status"),
});
