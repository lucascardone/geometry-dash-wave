const vscode = require("vscode");
const crypto = require("crypto");
const { AudioCapture } = require("./src/audio");
const { SpotifyWatcher } = require("./src/spotify");

const HIGHSCORE_KEY = "waveGd.highscore";

class WaveViewProvider {
  constructor(context) {
    this.context = context;
    this.view = null;
    this.audio = new AudioCapture();
    this.spotify = new SpotifyWatcher();
    this.lastStatus = null;
    this.lastTrack = null;

    this.audio.on("frame", (bins) => this.post({ type: "spectrum", bins: Array.from(bins) }));
    this.audio.on("beat", (strength) => this.post({ type: "beat", strength }));
    this.audio.on("tempo", (t) => this.post({ type: "tempo", ...t }));
    this.audio.on("status", (s) => { this.lastStatus = s; this.post({ type: "audioStatus", ...s }); });
    this.spotify.on("track", (t) => { this.lastTrack = t; this.post({ type: "track", track: t }); });
  }

  resolveWebviewView(view) {
    this.view = view;
    const mediaUri = vscode.Uri.joinPath(this.context.extensionUri, "media");
    view.webview.options = { enableScripts: true, localResourceRoots: [mediaUri] };
    view.webview.html = this.html(view.webview, mediaUri);

    view.webview.onDidReceiveMessage((msg) => {
      if (msg.type === "ready") {
        this.post({ type: "config", config: readConfig() });
        this.post({ type: "highscore", value: this.context.globalState.get(HIGHSCORE_KEY, 0) });
        if (this.lastStatus) this.post({ type: "audioStatus", ...this.lastStatus });
        this.post({ type: "track", track: this.lastTrack });
      } else if (msg.type === "highscore") {
        this.context.globalState.update(HIGHSCORE_KEY, msg.value);
      }
    });
    view.onDidChangeVisibility(() => this.syncRunning());
    view.onDidDispose(() => { this.view = null; this.syncRunning(); });
    this.syncRunning();
  }

  // Solo capturamos audio mientras el panel está visible
  syncRunning() {
    this.audio.sensitivity = readConfig().sensitivity;
    if (this.view && this.view.visible) {
      this.audio.start(readConfig().audioCommand);
      this.spotify.start();
    } else {
      this.audio.stop();
      this.spotify.stop();
    }
  }

  resetHighscore() {
    this.context.globalState.update(HIGHSCORE_KEY, 0);
    this.post({ type: "highscore", value: 0 });
  }

  restartAudio() {
    this.audio.stop();
    this.syncRunning();
  }

  post(msg) {
    if (this.view && this.view.visible) this.view.webview.postMessage(msg);
  }

  html(webview, mediaUri) {
    const nonce = crypto.randomBytes(16).toString("base64");
    const uri = (f) => webview.asWebviewUri(vscode.Uri.joinPath(mediaUri, f));
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${uri("main.css")}">
</head>
<body>
<canvas id="game" tabindex="0"></canvas>
<script nonce="${nonce}" src="${uri("main.js")}"></script>
</body>
</html>`;
  }

  dispose() {
    this.audio.stop();
    this.spotify.stop();
  }
}

function readConfig() {
  const c = vscode.workspace.getConfiguration("waveGd");
  return {
    idleTimeout: c.get("idleTimeout"),
    sensitivity: c.get("sensitivity"),
    speed: c.get("speed"),
    color: c.get("color"),
    audioCommand: c.get("audioCommand"),
  };
}

function activate(context) {
  const provider = new WaveViewProvider(context);
  context.globalState.setKeysForSync([HIGHSCORE_KEY]); // el récord viaja con Settings Sync
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("waveGd.view", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("waveGd.show", () =>
      vscode.commands.executeCommand("waveGd.view.focus")),
    vscode.commands.registerCommand("waveGd.restartAudio", () => provider.restartAudio()),
    vscode.commands.registerCommand("waveGd.resetHighscore", () => provider.resetHighscore()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("waveGd")) return;
      provider.post({ type: "config", config: readConfig() });
      provider.audio.sensitivity = readConfig().sensitivity;
      if (e.affectsConfiguration("waveGd.audioCommand")) provider.restartAudio();
    }),
    provider,
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
