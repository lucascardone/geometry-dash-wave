import { useEffect, useRef, useCallback, useState } from "react";

const WAVE_IMG_SRC = "data:image/jpeg;base64,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";

const W = 700;
const H = 420;
const WAVE_X = W * 0.3;
const SPEED = 5;
const GRID = 44;
const TRAIL_LEN = 200;
const WAVE_SIZE = 35;
const IDLE_TIMEOUT = 5000; // 5s sin interacción → modo auto

// ─── Beat detection config ─────────────────────────────────
const FFT_SIZE = 1024;
const BASS_LOW = 1;    // índice freq (~43Hz)
const BASS_HIGH = 12;  // índice freq (~516Hz)
const BEAT_SENSITIVITY = 1.35; // cuánto por encima del promedio = beat
const BEAT_COOLDOWN = 80; // ms entre beats (evita doble-trigger)

export default function WaveGD() {
  const canvasRef = useRef(null);
  const holdingRef = useRef(false);
  const autoModeRef = useRef(false);
  const lastInteractRef = useRef(Date.now());
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const beatStateRef = useRef(false);     // true = en beat (holding up)
  const lastBeatTimeRef = useRef(0);
  const energyHistoryRef = useRef(new Float32Array(43).fill(0)); // ~2s de historial
  const energyIdxRef = useRef(0);

  const [mode, setMode] = useState("manual"); // "manual" | "auto"
  const [audioSource, setAudioSource] = useState(null); // null | "tab" | "mic"
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [audioError, setAudioError] = useState("");

  const setHold = useCallback((v) => {
    holdingRef.current = v;
    lastInteractRef.current = Date.now();
    if (autoModeRef.current) {
      autoModeRef.current = false;
      setMode("manual");
    }
  }, []);

  // ─── Conectar audio ──────────────────────────────────────
  const connectAudio = useCallback(async (type) => {
    try {
      setAudioError("");
      let stream;

      if (type === "tab") {
        // Captura de pestaña con audio (Chrome)
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,  // requerido por spec, lo ignoramos
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            sampleRate: 44100,
          },
        });
        // Detener video track de inmediato, solo necesitamos audio
        stream.getVideoTracks().forEach(t => t.stop());
      } else {
        // Micrófono
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      }

      if (audioCtxRef.current) audioCtxRef.current.close();
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      setAudioSource(type);
      setShowAudioModal(false);
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setAudioError("Permiso denegado. Intentá con la otra opción.");
      } else if (err.name === "NotSupportedError") {
        setAudioError("Tu navegador no soporta este método. Probá Chrome.");
      } else {
        setAudioError("Error: " + err.message);
      }
    }
  }, []);

  // ─── Canvas + game loop ───────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const waveImg = new Image();
    waveImg.src = WAVE_IMG_SRC;

    let waveY = H / 2;
    let bgOffset = 0;
    let trail = [];
    let currentAngle = Math.PI / 4;
    let raf;
    const freqData = new Uint8Array(FFT_SIZE / 2);

    // ── beat detection ──
    function detectBeat() {
      const analyser = analyserRef.current;
      if (!analyser) return;

      analyser.getByteFrequencyData(freqData);

      // Energía en banda de graves
      let energy = 0;
      for (let i = BASS_LOW; i <= BASS_HIGH; i++) {
        energy += freqData[i] / 255;
      }
      energy /= (BASS_HIGH - BASS_LOW + 1);

      // Actualizar historial circular
      energyHistoryRef.current[energyIdxRef.current % energyHistoryRef.current.length] = energy;
      energyIdxRef.current++;

      // Promedio local
      let avg = 0;
      for (let i = 0; i < energyHistoryRef.current.length; i++) avg += energyHistoryRef.current[i];
      avg /= energyHistoryRef.current.length;

      const now = performance.now();
      const isBeat = energy > avg * BEAT_SENSITIVITY && energy > 0.1;
      const cooldownOk = (now - lastBeatTimeRef.current) > BEAT_COOLDOWN;

      if (isBeat && cooldownOk) {
        beatStateRef.current = true;
        lastBeatTimeRef.current = now;
      } else if (!isBeat) {
        beatStateRef.current = false;
      }

      holdingRef.current = beatStateRef.current;
    }

    // ── idle check → auto mode ──
    function checkIdle() {
      if (!autoModeRef.current && analyserRef.current) {
        const elapsed = Date.now() - lastInteractRef.current;
        if (elapsed >= IDLE_TIMEOUT) {
          autoModeRef.current = true;
          setMode("auto");
        }
      }
    }

    function drawBg() {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#06061a");
      grad.addColorStop(1, "#020210");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.strokeStyle = "rgba(0,220,255,0.07)";
      ctx.lineWidth = 1;
      const ox = bgOffset % GRID;
      for (let x = -ox; x < W + GRID; x += GRID) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H + GRID; y += GRID) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();

      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = "rgba(0,0,0,0.07)";
        ctx.fillRect(0, y, W, 1);
      }
    }

    function drawTrailPath() {
      if (trail.length < 2) return;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = "rgba(0,230,255,0.55)";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#00ffff";
      ctx.shadowBlur = 12;
      ctx.lineJoin = "miter";
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
      ctx.lineTo(trail[trail.length - 1].x, trail[trail.length - 1].y + 2);
      ctx.lineTo(trail[0].x, trail[0].y + 2);
      ctx.closePath();
      ctx.fillStyle = "rgba(0,200,255,0.07)";
      ctx.fill();
      ctx.restore();
    }

    function drawWave(x, y, angle) {
      const half = WAVE_SIZE / 2;
      ctx.save();
      ctx.shadowColor = "#00ffff";
      ctx.beginPath();
      ctx.arc(x, y, half * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "#003355";
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(waveImg, -half, -half, WAVE_SIZE, WAVE_SIZE);
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.shadowColor = "#00ffff";
      ctx.drawImage(waveImg, -half, -half, WAVE_SIZE, WAVE_SIZE);
      ctx.restore();
    }

    // ── Visualizador de frecuencias (solo en modo auto) ──
    function drawFreqBars() {
      const analyser = analyserRef.current;
      if (!analyser || !autoModeRef.current) return;

      analyser.getByteFrequencyData(freqData);

      const barCount = 48;
      const barW = 3;
      const gap = 2;
      const startX = W - (barCount * (barW + gap)) - 12;
      const maxH = 40;
      const baseY = H - 12;

      ctx.save();
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < barCount; i++) {
        const v = freqData[i] / 255;
        const bh = Math.max(2, v * maxH);
        const hue = 180 + v * 60;
        ctx.fillStyle = `hsl(${hue}, 100%, 65%)`;
        ctx.shadowColor = `hsl(${hue}, 100%, 65%)`;
        ctx.shadowBlur = 4;
        ctx.fillRect(startX + i * (barW + gap), baseY - bh, barW, bh);
      }
      ctx.restore();
    }

    function drawHUD() {
      const isAuto = autoModeRef.current;
      const holding = holdingRef.current;

      // Estado de movimiento
      const label = holding ? "▲  SUBIENDO" : "▼  BAJANDO";
      const col = holding ? "#00ffff" : "#ff6699";
      ctx.save();
      ctx.font = "bold 11px 'Courier New', monospace";
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 8;
      ctx.globalAlpha = 0.85;
      ctx.fillText(label, 18, 26);
      ctx.restore();

      // Badge de modo
      const badge = isAuto ? "◉ AUTO · MÚSICA" : "◎ MANUAL";
      const badgeCol = isAuto ? "#00ff88" : "rgba(255,255,255,0.3)";
      ctx.save();
      ctx.font = "bold 10px 'Courier New', monospace";
      ctx.fillStyle = badgeCol;
      ctx.shadowColor = badgeCol;
      ctx.shadowBlur = isAuto ? 10 : 0;
      ctx.globalAlpha = 0.9;
      ctx.fillText(badge, 18, 44);
      ctx.restore();

      // Borde superior
      const eg = ctx.createLinearGradient(0, 0, W, 0);
      eg.addColorStop(0, "transparent");
      eg.addColorStop(0.5, isAuto ? "rgba(0,255,136,0.4)" : "rgba(0,200,255,0.5)");
      eg.addColorStop(1, "transparent");
      ctx.fillStyle = eg;
      ctx.fillRect(0, 0, W, 1);
      ctx.fillRect(0, H - 1, W, 1);
    }

    function loop() {
      checkIdle();
      if (autoModeRef.current) detectBeat();

      bgOffset += SPEED;
      waveY += holdingRef.current ? -SPEED : SPEED;
      waveY = Math.max(WAVE_SIZE / 2 + 2, Math.min(H - WAVE_SIZE / 2 - 2, waveY));

      const topLimit = WAVE_SIZE / 2 + 4;
      const bottomLimit = H - WAVE_SIZE / 2 - 4;
      const isAtTop = waveY <= topLimit + 2;
      const isAtBottom = waveY >= bottomLimit - 2;

      let targetAngle;
      if (isAtTop || isAtBottom) {
        targetAngle = Math.PI / 2;
      } else {
        targetAngle = holdingRef.current ? Math.PI / 4 : Math.PI * 3 / 4;
      }
      currentAngle += (targetAngle - currentAngle) * 0.18;

      for (let i = 0; i < trail.length; i++) trail[i].x -= SPEED;
      trail = trail.filter(p => p.x > -10);
      trail.push({ x: WAVE_X, y: waveY });
      if (trail.length > TRAIL_LEN) trail.shift();

      drawBg();
      drawTrailPath();
      drawFreqBars();
      drawWave(WAVE_X, waveY, currentAngle);
      drawHUD();

      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);

    const onKey = (e) => {
      if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
        setHold(e.type === "keydown");
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [setHold]);

  // ─── UI ──────────────────────────────────────────────────
  const modalBg = {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.85)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(6px)",
  };
  const modalBox = {
    background: "#080820",
    border: "1px solid rgba(0,200,255,0.25)",
    borderRadius: "4px",
    padding: "32px 40px",
    maxWidth: "380px",
    width: "100%",
    fontFamily: "'Courier New', monospace",
    boxShadow: "0 0 60px rgba(0,100,255,0.15)",
  };
  const btnStyle = (color) => ({
    display: "block", width: "100%",
    padding: "14px",
    marginBottom: "10px",
    background: "transparent",
    border: `1px solid ${color}`,
    color: color,
    fontFamily: "'Courier New', monospace",
    fontSize: "11px",
    fontWeight: "bold",
    letterSpacing: "2px",
    cursor: "pointer",
    transition: "all 0.15s",
    textTransform: "uppercase",
  });

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "100vh",
      background: "#030311", userSelect: "none",
    }}>
      {/* Modal de selección de audio */}
      {showAudioModal && (
        <div style={modalBg} onClick={() => setShowAudioModal(false)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ color: "#00ffff", fontSize: "12px", letterSpacing: "4px", marginBottom: "6px" }}>
              ◈ FUENTE DE AUDIO
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", marginBottom: "24px", lineHeight: 1.6 }}>
              Elegí cómo capturar la música que estás escuchando
            </div>

            <button
              style={btnStyle("#00ffff")}
              onMouseOver={e => e.target.style.background = "rgba(0,255,255,0.08)"}
              onMouseOut={e => e.target.style.background = "transparent"}
              onClick={() => connectAudio("tab")}
            >
              📺 &nbsp;Compartir pestaña
              <div style={{ fontSize: "9px", opacity: 0.5, marginTop: "4px", letterSpacing: "1px", fontWeight: "normal" }}>
                YouTube / Spotify Web — Chrome recomendado
              </div>
            </button>

            <button
              style={btnStyle("#ff6699")}
              onMouseOver={e => e.target.style.background = "rgba(255,102,153,0.08)"}
              onMouseOut={e => e.target.style.background = "transparent"}
              onClick={() => connectAudio("mic")}
            >
              🎙️ &nbsp;Micrófono
              <div style={{ fontSize: "9px", opacity: 0.5, marginTop: "4px", letterSpacing: "1px", fontWeight: "normal" }}>
                Funciona con parlantes — no con auriculares
              </div>
            </button>

            {audioError && (
              <div style={{ color: "#ff4444", fontSize: "10px", marginTop: "8px", lineHeight: 1.5 }}>
                ⚠ {audioError}
              </div>
            )}

            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", marginTop: "16px", lineHeight: 1.5 }}>
              El audio se procesa localmente. Nada sale del navegador.
            </div>
          </div>
        </div>
      )}

      <div style={{
        color: "#00ccff", fontFamily: "'Courier New', monospace",
        fontWeight: "bold", fontSize: "13px", letterSpacing: "6px",
        marginBottom: "14px", textShadow: "0 0 16px rgba(0,200,255,0.7)",
      }}>
        ◈ WAVE MODE ◈
      </div>

      <canvas
        ref={canvasRef} width={W} height={H}
        style={{
          border: "1px solid rgba(0,200,255,0.18)",
          boxShadow: mode === "auto"
            ? "0 0 0 1px rgba(0,255,136,0.15), 0 0 50px rgba(0,200,100,0.12)"
            : "0 0 0 1px rgba(0,200,255,0.05), 0 0 40px rgba(0,160,255,0.12)",
          cursor: "crosshair", maxWidth: "100%", display: "block", touchAction: "none",
          transition: "box-shadow 0.5s",
        }}
        onMouseDown={() => setHold(true)}
        onMouseUp={() => setHold(false)}
        onMouseLeave={() => setHold(false)}
        onTouchStart={(e) => { e.preventDefault(); setHold(true); }}
        onTouchEnd={(e) => { e.preventDefault(); setHold(false); }}
      />

      {/* Controles inferiores */}
      <div style={{
        marginTop: "14px", display: "flex", gap: "12px", alignItems: "center",
        flexWrap: "wrap", justifyContent: "center",
      }}>
        <div style={{
          color: "rgba(0,200,255,0.35)", fontFamily: "'Courier New', monospace",
          fontSize: "10px", letterSpacing: "2px",
        }}>
          CLICK / ESPACIO · MANTENER = SUBIR
        </div>

        <div style={{ color: "rgba(255,255,255,0.1)", fontSize: "10px" }}>·</div>

        <button
          onClick={() => setShowAudioModal(true)}
          style={{
            background: "transparent",
            border: `1px solid ${audioSource ? "#00ff88" : "rgba(0,200,255,0.3)"}`,
            color: audioSource ? "#00ff88" : "rgba(0,200,255,0.6)",
            fontFamily: "'Courier New', monospace",
            fontSize: "10px", letterSpacing: "2px",
            padding: "5px 12px", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {audioSource === "tab" ? "◉ PESTAÑA CONECTADA" :
           audioSource === "mic" ? "◉ MIC CONECTADO" :
           "♪ CONECTAR MÚSICA"}
        </button>

        {audioSource && (
          <div style={{
            color: mode === "auto" ? "#00ff88" : "rgba(255,255,255,0.25)",
            fontFamily: "'Courier New', monospace", fontSize: "10px", letterSpacing: "2px",
            transition: "color 0.3s",
          }}>
            {mode === "auto" ? "AUTO ACTIVO" : `AUTO EN ${Math.max(0, 5 - Math.floor((Date.now() - lastInteractRef.current) / 1000))}s`}
          </div>
        )}
      </div>
    </div>
  );
}