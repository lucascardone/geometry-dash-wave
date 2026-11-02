const { execFile } = require("child_process");
const { EventEmitter } = require("events");

const POLL_MS = 2000;

// Lee un string GVariant: 'texto' o "texto con 'comillas'"
function gvString(text, key) {
  const m = text.match(new RegExp(`'${key}': <(?:\\[)?(['"])((?:\\\\.|(?!\\1).)*)\\1`));
  return m ? m[2].replace(/\\(.)/g, "$1") : null;
}

/**
 * Consulta a Spotify por MPRIS (D-Bus) y emite 'track' con
 * { playing, title, artist } o null si Spotify no está abierto.
 */
class SpotifyWatcher extends EventEmitter {
  constructor() {
    super();
    this.timer = null;
    this.last = undefined;
  }

  start() {
    if (this.timer) return;
    this._poll();
    this.timer = setInterval(() => this._poll(), POLL_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  _poll() {
    execFile("gdbus", [
      "call", "--session",
      "--dest", "org.mpris.MediaPlayer2.spotify",
      "--object-path", "/org/mpris/MediaPlayer2",
      "--method", "org.freedesktop.DBus.Properties.GetAll",
      "org.mpris.MediaPlayer2.Player",
    ], { timeout: 1500 }, (err, stdout) => {
      let track = null;
      if (!err) {
        track = {
          playing: gvString(stdout, "PlaybackStatus") === "Playing",
          title: gvString(stdout, "xesam:title") || "",
          artist: gvString(stdout, "xesam:artist") || "",
        };
      }
      const key = JSON.stringify(track);
      if (key !== this.last) {
        this.last = key;
        this.emit("track", track);
      }
    });
  }
}

module.exports = { SpotifyWatcher };
