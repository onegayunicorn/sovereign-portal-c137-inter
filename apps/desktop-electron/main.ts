import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as crypto from "crypto";

const SHARED_SECRET = "SOVEREIGN_SUPER_SECRET_HMAC_KEY_2026";
const processedNonces = new Set<string>();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    frame: false,
    transparent: true,
    backgroundColor: "#020b05",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  app.commandLine.appendSwitch("enable-unsafe-webgpu");
  app.commandLine.appendSwitch("enable-features", "Vulkan,DefaultANGLEVulkan");

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../web/dist/index.html"));
  }
}

ipcMain.handle("sovereign-bridge-ipc", async (_, envelope: any) => {
  const { command, payload, timestamp, nonce, signature } = envelope;

  const now = Date.now();
  if (Math.abs(now - timestamp) > 5000) {
    return { error: "REPLAY_EXPIRED", status: 403 };
  }

  if (processedNonces.has(nonce)) {
    return { error: "REPLAY_NONCE_DUPLICATE", status: 403 };
  }
  processedNonces.add(nonce);

  const rawSigningPayload = `${command}:${JSON.stringify(payload)}:${timestamp}:${nonce}`;
  const hmac = crypto.createHmac("sha256", SHARED_SECRET);
  hmac.update(rawSigningPayload);
  const expectedSig = hmac.digest("hex");

  if (signature.toLowerCase() !== expectedSig.toLowerCase()) {
    return { error: "INVALID_SIGNATURE", status: 401 };
  }

  switch (command) {
    case "APP_MINIMIZE":
      mainWindow?.minimize();
      return { status: "success", result: "MINIMIZED" };
    case "APP_CLOSE":
      mainWindow?.close();
      return { status: "success", result: "CLOSED" };
    default:
      return { status: "success", result: "PROCESSED_NATIVELY" };
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
