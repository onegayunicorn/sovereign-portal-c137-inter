import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("SovereignElectronBridge", {
  executeCommand: (envelope: any) => ipcRenderer.invoke("sovereign-bridge-ipc", envelope)
});
