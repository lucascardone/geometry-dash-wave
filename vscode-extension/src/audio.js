const { spawn, spawnSync } = require("child_process");
const { EventEmitter } = require("events");

// ─── Config de análisis (equivalente al AnalyserNode del prototipo) ───
const SAMPLE_RATE = 22050;
const FFT_SIZE = 1024; // 22050/1024 ≈ 21.5 Hz por bin
const HOP = 512;       // ~23ms entre frames → ~43 frames/s
const BINS_OUT = 128;  // mandamos hasta ~2.7 kHz al webview
const SMOOTHING = 0.8;
const MIN_DB = -100;
const MAX_DB = -30;

// ─── Onset detection (spectral flux sobre los graves) ───
const KICK_LOW = 2;       // ~43 Hz
const KICK_HIGH = 12;     // ~260 Hz
const FLUX_HISTORY = 43;  // ~1s para el umbral adaptativo
const BEAT_COOLDOWN = 200; // ms
const MIN_FLUX = 1.5;

// ─── Tempo (autocorrelación del flux) e intensidad ───
const FPS = SAMPLE_RATE / HOP;   // ~43 frames/s
const TEMPO_WINDOW = 512;        // ~12s de flux
const TEMPO_EVERY = 43;          // recalculamos ~1 vez por segundo
const MIN_BPM = 60;
const MAX_BPM = 200;
const PRIOR_BPM = 120;           // sesgo para evitar errores de octava (x2 / ÷2)
const LOUD_SHORT = 1 - 1 / (FPS * 1.5); // EMA ~1.5s
const LOUD_LONG = 1 - 1 / (FPS * 20);   // EMA ~20s

function hasCommand(cmd) {
  return spawnSync("sh", ["-c", `command -v ${cmd}`]).status === 0;
}

function defaultCommand() {
  if (hasCommand("pw-record")) {
    return ["pw-record", ["-P", "{ stream.capture.sink=true }", "--rate", String(SAMPLE_RATE),
      "--channels", "1", "--format", "s16", "-"]];
  }
  if (hasCommand("parec")) {
    return ["parec", ["--device=@DEFAULT_MONITOR@", `--rate=${SAMPLE_RATE}`, "--channels=1",
      "--format=s16le", "--raw"]];
  }
  return null;
}

// FFT radix-2 iterativa, in-place
function makeFFT(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = Math.sin((2 * Math.PI * i) / n);
  }
  return (re, im) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const a = i + j, b = a + half;
          const tre = re[b] * cos[k] + im[b] * sin[k];
          const tim = -re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tre; im[b] = im[a] - tim;
          re[a] += tre; im[a] += tim;
        }
      }
    }
  };
}

const toByte = (mag) => {
  const v = ((20 * Math.log10(mag + 1e-12) - MIN_DB) / (MAX_DB - MIN_DB)) * 255;
  return v < 0 ? 0 : v > 255 ? 255 : v;
};

/**
 * Captura el audio del sistema (monitor de la salida por defecto) y emite
 * 'frame' con un Uint8Array de magnitudes por bin (0..255, igual que
 * AnalyserNode.getByteFrequencyData), 'beat' con la fuerza del golpe (0..1),
 * 'tempo' con { bpm, intensity } (~1 vez por segundo) y 'status' con { ok, message }.
 */
class AudioCapture extends EventEmitter {
  constructor() {
    super();
    this.proc = null;
    this.fft = makeFFT(FFT_SIZE);
    this.window = new Float64Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    }
    this.ring = new Float64Array(FFT_SIZE);
    this.ringPos = 0;
    this.sinceHop = 0;
    this.smoothed = new Float64Array(BINS_OUT);
    this.re = new Float64Array(FFT_SIZE);
    this.im = new Float64Array(FFT_SIZE);
    this.leftover = null;
    this.sensitivity = 1.5;
    this.prevRaw = new Float64Array(BINS_OUT);
    this.fluxHistory = new Float64Array(FLUX_HISTORY);
    this.fluxIdx = 0;
    this.prevFlux = 0;
    this.time = 0;
    this.lastBeat = -Infinity;
    this.tempoBuf = new Float64Array(TEMPO_WINDOW);
    this.tempoPos = 0;
    this.tempoFrames = 0;
    this.bpm = 0;
    this.loudShort = 0;
    this.loudLong = 0;
    this.bpmCandidate = 0;
    this.bpmVotes = 0;
  }

  start(customCommand) {
    if (this.proc) return;
    let cmd;
    if (customCommand && customCommand.trim()) {
      cmd = ["sh", ["-c", customCommand]];
    } else {
      cmd = defaultCommand();
    }
    if (!cmd) {
      this.emit("status", { ok: false, message: "No encontré pw-record ni parec para capturar audio" });
      return;
    }

    const proc = spawn(cmd[0], cmd[1], { stdio: ["ignore", "pipe", "pipe"] });
    this.proc = proc;
    let stderr = "";
    proc.stdout.on("data", (buf) => this._onData(buf));
    proc.stderr.on("data", (d) => { stderr = (stderr + d.toString()).slice(-500); });
    proc.on("error", (err) => {
      this.emit("status", { ok: false, message: `Error de captura: ${err.message}` });
    });
    proc.on("exit", (code, signal) => {
      if (this.proc === proc) {
        this.proc = null;
        if (signal !== "SIGTERM") {
          this.emit("status", { ok: false, message: `La captura terminó (${code ?? signal}) ${stderr.trim()}` });
        }
      }
    });
    this.emit("status", { ok: true, message: `Capturando audio del sistema (${cmd[0]})` });
  }

  stop() {
    if (!this.proc) return;
    const p = this.proc;
    this.proc = null;
    p.kill("SIGTERM");
  }

  _onData(buf) {
    if (this.leftover) {
      buf = Buffer.concat([this.leftover, buf]);
      this.leftover = null;
    }
    const n = buf.length >> 1;
    if (buf.length & 1) this.leftover = buf.subarray(buf.length - 1);
    for (let i = 0; i < n; i++) {
      this.ring[this.ringPos] = buf.readInt16LE(i * 2) / 32768;
      this.ringPos = (this.ringPos + 1) % FFT_SIZE;
      if (++this.sinceHop >= HOP) {
        this.sinceHop = 0;
        this._analyse();
      }
    }
  }

  _analyse() {
    const { re, im, ring, window: w } = this;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = ring[(this.ringPos + i) % FFT_SIZE] * w[i];
      im[i] = 0;
    }
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) energy += ring[i] * ring[i];
    const rms = Math.sqrt(energy / FFT_SIZE);
    this.fft(re, im);
    const out = new Uint8Array(BINS_OUT);
    let flux = 0;
    for (let k = 0; k < BINS_OUT; k++) {
      const mag = Math.hypot(re[k], im[k]) / FFT_SIZE;
      const raw = toByte(mag);
      if (k >= KICK_LOW && k <= KICK_HIGH) flux += Math.max(0, raw - this.prevRaw[k]);
      this.prevRaw[k] = raw;
      this.smoothed[k] = SMOOTHING * this.smoothed[k] + (1 - SMOOTHING) * mag;
      out[k] = toByte(this.smoothed[k]);
    }
    flux /= KICK_HIGH - KICK_LOW + 1;
    this.time += (HOP / SAMPLE_RATE) * 1000;
    this._detectBeat(flux);
    this._trackTempo(flux, rms);
    this.emit("frame", out);
  }

  _trackTempo(flux, rms) {
    this.tempoBuf[this.tempoPos] = flux;
    this.tempoPos = (this.tempoPos + 1) % TEMPO_WINDOW;
    this.loudShort = LOUD_SHORT * this.loudShort + (1 - LOUD_SHORT) * rms;
    // al principio promediamos todo lo escuchado, después ~20s
    const longAlpha = Math.max(1 - LOUD_LONG, 1 / (this.tempoFrames + 1));
    this.loudLong += longAlpha * (rms - this.loudLong);
    if (++this.tempoFrames % TEMPO_EVERY) return;

    // intensidad: parte actual vs el promedio del tema (1 = normal)
    const intensity = this.loudLong > 1e-4 ? Math.min(2, this.loudShort / this.loudLong) : 0;
    if (this.loudShort < 0.005) { // silencio
      this.emit("tempo", { bpm: this.bpm, intensity: 0 });
      return;
    }

    // flux en orden temporal, sin la media
    const n = Math.min(this.tempoFrames, TEMPO_WINDOW);
    if (n < FPS * 4) return;
    const x = new Float64Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) {
      x[i] = this.tempoBuf[(this.tempoPos - n + i + TEMPO_WINDOW) % TEMPO_WINDOW];
      mean += x[i];
    }
    mean /= n;
    for (let i = 0; i < n; i++) x[i] -= mean;

    const minLag = Math.floor((60 * FPS) / MAX_BPM);
    const maxLag = Math.ceil((60 * FPS) / MIN_BPM);
    const ac = new Float64Array(maxLag + 2);
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) sum += x[i] * x[i - lag];
      ac[lag] = sum / (n - lag);
    }
    let best = 0, bestScore = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      const bpm = (60 * FPS) / lag;
      const prior = Math.exp(-0.5 * (Math.log2(bpm / PRIOR_BPM) / 0.9) ** 2);
      const score = ac[lag] * prior;
      if (score > bestScore) { bestScore = score; best = lag; }
    }
    if (bestScore <= 0) return;
    // interpolación parabólica para afinar el lag
    const a = ac[best - 1], b = ac[best], c = ac[best + 1];
    const d = a - 2 * b + c;
    const lag = best + (d < 0 ? (0.5 * (a - c)) / d : 0);
    const bpm = (60 * FPS) / lag;
    // suavizado; un cambio grande (otra canción) tiene que repetirse 3 veces
    if (!this.bpm || Math.abs(bpm - this.bpm) <= 12) {
      this.bpm = this.bpm ? 0.8 * this.bpm + 0.2 * bpm : bpm;
      this.bpmVotes = 0;
    } else if (Math.abs(bpm - this.bpmCandidate) <= 12 && ++this.bpmVotes >= 3) {
      this.bpm = bpm;
      this.bpmVotes = 0;
    } else if (Math.abs(bpm - this.bpmCandidate) > 12) {
      this.bpmCandidate = bpm;
      this.bpmVotes = 1;
    }
    this.emit("tempo", { bpm: this.bpm, intensity });
  }

  // Beat = el flux supera promedio + sensitivity·desvío del último segundo
  // y es un pico local (el frame anterior fue el máximo)
  _detectBeat(flux) {
    const h = this.fluxHistory;
    let mean = 0;
    for (let i = 0; i < h.length; i++) mean += h[i];
    mean /= h.length;
    let variance = 0;
    for (let i = 0; i < h.length; i++) variance += (h[i] - mean) ** 2;
    const std = Math.sqrt(variance / h.length);

    const prev = this.prevFlux;
    const threshold = mean + this.sensitivity * std;
    if (prev > threshold && prev >= flux && prev > MIN_FLUX && this.time - this.lastBeat > BEAT_COOLDOWN) {
      this.lastBeat = this.time;
      this.emit("beat", Math.min(1, (prev - mean) / (std * 4 + 1e-6)));
    }
    h[this.fluxIdx++ % h.length] = flux;
    this.prevFlux = flux;
  }
}

module.exports = { AudioCapture, SAMPLE_RATE, FFT_SIZE };
