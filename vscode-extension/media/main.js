// @ts-check
(function () {
  const vscode = acquireVsCodeApi();
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));

  // ─── Config (la extensión la pisa con los settings de VS Code) ───
  let config = { idleTimeout: 5, speed: 1, color: "#00e6ff" };

  // Los beats los detecta la extensión (src/audio.js); acá solo los usamos
  const BEAT_MEMORY = 2000; // ms sin beats → consideramos que no hay música
  let lastBeat = 0;
  let beatTimes = [];           // beats de los últimos segundos, para medir qué tan "violenta" está la canción
  let spectrum = new Uint8Array(128);

  // Velocidad según la canción: BPM e intensidad que calcula la extensión
  let bpm = 0;
  let intensity = 1;
  let songSpeed = 1; // multiplicador actual, se acerca de a poco al objetivo

  // ─── Estado ───
  let W = 0, H = 0, dpr = 1;
  let holding = false;          // manual: botón apretado
  let autoUp = false;           // auto: dirección actual
  let autoMode = false;
  let lastInteract = performance.now();
  let edgeSince = 0;
  let waveY = 0;
  let angle = Math.PI / 4;
  let bgOffset = 0;
  let pulse = 0;                // 1 en el beat, decae
  let trail = [];
  let particles = [];
  let audioStatus = { ok: false, message: "Esperando audio…" };
  let track = null;

  // ─── Pirámides estilo Nine Circles (toggle arriba a la derecha) ───
  const saved = vscode.getState() || {};
  let pyramids = !!saved.pyramids;
  let sections = [];            // tramos de pirámides, en x de mundo (misma escala que bgOffset)
  let steering = false;         // auto: el piloto está siguiendo un canal
  let shake = 0, flash = 0;
  let btn = { x: 0, y: 0, w: 0, h: 0 };

  // ─── Récord (solo en manual, dentro del laberinto) ───
  // Se mide en bloques (1 bloque = 1/10 del alto, así no depende del tamaño del panel); el mini vale doble.
  // El récord lo guarda la extensión (globalState), así sobrevive a reinicios.
  let best = 0;
  let run = 0;                  // bloques de la partida actual
  let beatBest = false;         // esta partida ya superó el récord anterior
  let lastSaved = 0;
  let recordFx = 0;             // cartel de "nuevo récord", decae

  // ─── Mini wave: más chico, sube y baja al doble (pendiente 2:1, como en GD) ───
  const MINI_SCALE = 0.55;
  let mini = false;
  let sizeScale = 1;            // se anima hacia 1 o MINI_SCALE
  let portals = [];             // { x (mundo), mini }
  let plannedMini = false;      // modo en el que va a estar el wave al final de lo ya generado
  let miniWant = false;         // lo que pide la canción (auto) o el azar (manual)
  let miniChanged = 0;
  let heat = 0;                 // segundos acumulados de "parte intensa" (negativo = tranquila)
  let randomSwitchAt = performance.now() + 15000;

  // ─── Medidas que dependen del tamaño del panel ───
  const waveSize = () => Math.max(14, Math.min(40, H * 0.085));
  // px/s: ~1 pantalla por segundo, como el wave de GD (el mini va un poco más lento para que sea jugable)
  const speedPx = (isMini = mini) => H * 1.1 * config.speed * songSpeed * (isMini ? 0.85 : 1);
  const waveX = () => Math.min(W * 0.3, 260);
  const curSize = () => waveSize() * sizeScale;
  const slope = () => (mini ? 2 : 1);

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const prevH = H;
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    waveY = prevH ? (waveY / prevH) * H : H / 2;
    trail = [];
    if (H !== prevH) { sections = []; portals = []; plannedMini = mini; } // la geometría depende del alto
  }
  new ResizeObserver(resize).observe(canvas);

  function rgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex) || [null, "00e6ff"];
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ─── Input manual ───
  function setHold(v) {
    holding = v;
    lastInteract = performance.now();
    if (autoMode) {
      autoMode = false;
    }
  }
  const inBtn = (x, y) => x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h;
  function saveBest() {
    vscode.postMessage({ type: "highscore", value: best });
    lastSaved = performance.now();
  }

  function endRun() {
    if (beatBest) {
      saveBest();
      recordFx = 1;
    }
    run = 0;
    beatBest = false;
  }

  function togglePyramids() {
    endRun();
    pyramids = !pyramids;
    vscode.setState({ ...saved, pyramids });
  }
  canvas.addEventListener("mousedown", (e) => {
    e.preventDefault();
    canvas.focus();
    if (inBtn(e.offsetX, e.offsetY)) return togglePyramids();
    setHold(true);
  });
  canvas.addEventListener("mousemove", (e) => { canvas.style.cursor = inBtn(e.offsetX, e.offsetY) ? "pointer" : ""; });
  window.addEventListener("mouseup", () => { if (holding) setHold(false); });
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), t = e.touches[0];
    if (t && inBtn(t.clientX - r.left, t.clientY - r.top)) return togglePyramids();
    setHold(true);
  }, { passive: false });
  canvas.addEventListener("touchend", (e) => { e.preventDefault(); setHold(false); }, { passive: false });
  const KEYS = ["Space", "ArrowUp", "KeyW"];
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyP" && !e.repeat) return togglePyramids();
    if (KEYS.includes(e.code)) { e.preventDefault(); setHold(true); }
  });
  window.addEventListener("keyup", (e) => { if (KEYS.includes(e.code)) { e.preventDefault(); setHold(false); } });
  window.addEventListener("blur", () => { if (holding) setHold(false); });

  // ─── Mensajes desde la extensión ───
  window.addEventListener("message", (e) => {
    const msg = e.data;
    if (msg.type === "spectrum") {
      spectrum = Uint8Array.from(msg.bins);
    } else if (msg.type === "beat") {
      lastBeat = performance.now();
      beatTimes.push(lastBeat);
      onBeat(msg.strength);
    } else if (msg.type === "tempo") {
      bpm = msg.bpm;
      intensity = msg.intensity;
    } else if (msg.type === "config") {
      config = { ...config, ...msg.config };
    } else if (msg.type === "audioStatus") {
      audioStatus = msg;
    } else if (msg.type === "track") {
      track = msg.track;
    } else if (msg.type === "highscore") {
      best = msg.value || 0;
      if (Math.floor(run) <= best) beatBest = false;
    }
  });

  function onBeat(strength) {
    pulse = Math.max(pulse, 0.5 + strength * 0.5);
    stepLayers();
    if (sections.some((s) => s.hot && s.x0 - bgOffset < W && s.x1 - bgOffset > 0)) strobe = 0.6 + strength * 0.4;
    if (autoMode && !steering) {
      // Cerca de un borde ignoramos el beat que lo mandaría más contra ese borde
      const rel = waveY / H;
      const next = !autoUp;
      if ((rel < 0.25 && next) || (rel > 0.75 && !next)) return;
      autoUp = next;
      burst(6 + Math.round(strength * 8));
    }
  }

  function burst(n, power = 1, color = null) {
    const x = waveX(), y = waveY;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (40 + Math.random() * 120) * power;
      particles.push({ x, y, vx: Math.cos(a) * v - speedPx() * 0.5, vy: Math.sin(a) * v, life: 1, color });
    }
  }

  const hasMusic = () => performance.now() - lastBeat < BEAT_MEMORY;

  // 120 BPM a intensidad normal = velocidad base
  function targetSongSpeed() {
    if (!hasMusic() || !bpm) return 1;
    const tempo = Math.max(0.85, Math.min(1.6, bpm / 120));
    const energy = 0.9 + 0.1 * Math.max(0, Math.min(2, intensity));
    return tempo * energy;
  }

  // ─── Pirámides y rombos ───
  // Cada tramo es un camino en zigzag con la misma pendiente que el wave (1 normal, 2 mini).
  // Piso y techo quedan a G/2 del camino: como paredes con pirámides o como rombos flotantes
  // metidos en cada vuelta. Los largos de cada tramo cambian según un patrón, así que salen
  // pirámides grandes, chicas, escalonadas, etc.
  const HAZARD = "#ff2d55";
  const PORTAL_MINI = "#ff5ad2";
  const PORTAL_NORMAL = "#40ff8a";
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const STRUCT_COLOR = "#ff2d55"; // un solo color para todo el laberinto
  let strobe = 0; // destello en los beats mientras hay un tramo intenso en pantalla

  // Onda de capas: cada estructura tiene LAYERS capas concéntricas (0 = centro, la última = borde).
  // En cada beat se prende la siguiente, de adentro hacia afuera, y la anterior se apaga.
  const LAYERS = 5;
  const layerLit = new Array(LAYERS).fill(0);
  let layerIdx = -1, layerTimer = 0;
  function stepLayers() {
    layerIdx = (layerIdx + 1) % LAYERS;
    layerLit[layerIdx] = 1;
    layerTimer = 0;
  }

  // Energía de la canción 0..1 (con qué tan fuerte está la parte actual y la densidad de beats)
  function songEnergy() {
    if (!hasMusic()) return null;
    const rate = beatTimes.length / 3;
    return Math.max(0, Math.min(1, Math.max((intensity - 0.8) / 0.6, (rate - 1.5) / 2.5)));
  }

  // Largo de un beat en px (lo que avanza el wave entre beats), o 0 si no hay tempo
  const beatPx = (isMini) => (hasMusic() && bpm > 0 ? (speedPx(isMini) * 60) / bpm : 0);

  // Arma el tramo con la canción: cada vuelta del zigzag cae en un beat (o una subdivisión),
  // y la energía decide el patrón, qué tan apretado es el canal y cuánto dura.
  // fromY: altura donde termina el tramo anterior, para que el laberinto siga sin cortes
  // prev: tramo anterior pegado a este (para seguir su estilo y empalmar el ancho del canal)
  function makeSection(x0, isMini, fromY = null, prev = null) {
    const k = isMini ? 2 : 1;
    const ws = waveSize() * (isMini ? MINI_SCALE : 1);
    const L = H - 4;
    const music = songEnergy();
    const e = music ?? Math.random() * 0.6;
    // El mini sube al doble, así que el canal real es mucho más finito: le damos bastante más hueco
    let G = isMini
      ? Math.max(ws * 4, L * (0.36 - 0.06 * e + Math.random() * 0.04))
      : Math.max(ws * 2.4, L * (0.4 - 0.15 * e + Math.random() * 0.05));
    const minG = isMini ? ws * 3.4 : ws * 2.2;
    const margin = L * 0.05;
    const top = 2 + margin, bot = H - 2 - margin; // entre estos tienen que quedar los bordes del canal

    // Paso = beat, partido a la mitad hasta que entre en el alto disponible.
    // El mini usa el paso más largo que entre (vueltas menos seguidas); el normal deja lugar para pasos dobles.
    const bp = beatPx(isMini);
    let step = bp || L * (isMini ? 0.2 : 0.14);
    if (bp) while (step * k > (L - 2 * margin - G) * (isMini ? 0.95 : 0.5)) step /= 2;

    // Ajuste: lo que falta desde x0 hasta el próximo beat. Como los tramos van pegados, el primer
    // segmento mide eso y así las vueltas vuelven a caer en el beat aunque cambie el tempo.
    let fill = 0;
    if (bp && fromY !== null) {
      const now = performance.now(), beatMs = 60000 / bpm;
      const arrive = now + ((x0 - bgOffset - waveX()) / speedPx()) * 1000;
      const ahead = (((lastBeat - arrive) % beatMs) + beatMs) % beatMs;
      fill = ((ahead / 1000) * speedPx(isMini)) % step;
    }

    let x = x0, y, dir, ymin, ymax;
    const pts = [];
    if (isMini) {
      // El mini va de punta a punta de un rango que mide justo n pasos: así cada vuelta cae en el beat
      // y el paso puede ser largo (vueltas menos seguidas). Solo achicamos el paso si no entra,
      // y si se puede, nunca por debajo de ~0,16 s entre vueltas.
      const minStepM = speedPx(true) * 0.16;
      const gFor = (nn, st) => Math.min(G, bot - top - nn * k * st);
      let n;
      for (;;) {
        n = gFor(2, step) >= minG ? 2 : 1;
        const g = gFor(n, step);
        if (g >= minG || (step / 2 < minStepM && g >= ws * 2.4) || step < 2) break;
        step /= 2;
      }
      const span = k * step;
      G = Math.max(ws * 2.4, gFor(n, step));
      if (fromY !== null) G = Math.min(G, 2 * Math.min(fromY - top, bot - fromY));
      const yLo = top + G / 2, yHi = bot - G / 2; // límites para cualquier punto del camino
      const loMin = yLo, loMax = Math.max(yLo, yHi - n * span);

      let lo = loMin + Math.random() * (loMax - loMin);
      if (fromY === null) {
        y = Math.random() < 0.5 ? lo : lo + n * span;
        pts.push([x, y]);
      } else {
        // Ajuste de ida y vuelta (a + b = lo que falta hasta el beat + j pasos): deja el camino
        // en una punta del rango a cualquier altura, sin salirse de la grilla del beat.
        pts.push([x, fromY]);
        y = fromY;
        fill %= step;
        if (fill > step * 0.97) fill = 0;
        let best = null;
        for (let c = 0; c <= 6; c++) {
          const l = loMin + (loMax - loMin) * ((c + Math.random() * 0.5) / 6.5);
          for (const target of [l, l + n * span]) {
            for (let j = 0; j < 4; j++) {
              const T = fill + j * step, D = (target - fromY) / k;
              if (Math.abs(D) > T + 1e-6) continue;
              const s1 = Math.abs(D) < 1e-6 ? (target === l ? -1 : 1) : Math.sign(D);
              const bLen = (T - Math.abs(D)) / 2;
              const over = target + s1 * k * bLen;
              if (over < yLo - 0.5 || over > yHi + 0.5) continue;
              if (!best || T < best.T - 1e-6 || (Math.abs(T - best.T) < 1e-6 && Math.random() < 0.5)) {
                best = { lo: l, target, T, aLen: T - bLen, bLen, s1 };
              }
              break;
            }
          }
        }
        if (best) {
          lo = best.lo;
          if (best.aLen > 0.5) { x += best.aLen; y += best.s1 * k * best.aLen; pts.push([x, y]); }
          if (best.bLen > 0.5) { x += best.bLen; y -= best.s1 * k * best.bLen; pts.push([x, y]); }
          y = best.target;
        } else {
          // no debería pasar: seguimos igual dentro de los límites
          lo = Math.max(loMin, Math.min(loMax, fromY));
          y = lo;
        }
      }
      ymin = lo;
      ymax = lo + n * span;
      dir = Math.abs(y - ymin) < Math.abs(y - ymax) ? 1 : -1;
      y = dir > 0 ? ymin : ymax;
    } else {
      if (fromY !== null) G = Math.min(G, 2 * Math.min(fromY - top, bot - fromY));
      ymin = top + G / 2;
      ymax = bot - G / 2;
      const room = ymax - ymin;
      while (bp && step * k > room * 0.5 && step > 2) step /= 2;
      fill %= step;
      if (fill < step * 0.03 || fill > step * 0.97) fill = 0;
      y = fromY !== null ? Math.max(ymin, Math.min(ymax, fromY)) : ymin + Math.random() * room;
      pts.push([x, y]);
      dir = y - ymin > ymax - y ? -1 : 1; // -1 = sube
      if (fill > 0) {
        x += fill;
        y += dir * k * fill; // hacia el lado con más lugar: siempre entra (paso ≤ medio alto)
        pts.push([x, y]);
        dir = -dir;
      }
    }

    const styles = e < 0.4
      ? [["wall", "wall"], ["wall", "wall"], ["wall", "wall"], ["diamond", "wall"], ["wall", "diamond"]]
      : [["wall", "wall"], ["diamond", "wall"], ["wall", "diamond"], ["diamond", "diamond"], ["diamond", "diamond"]];
    // casi siempre seguimos con el estilo del tramo anterior, así parece una sola estructura
    const [floor, ceil] = prev && Math.random() < 0.75 ? [prev.floor, prev.ceil] : pick(styles);
    const pattern = pick(e < 0.35 ? ["regular", "regular", "growing"]
      : e < 0.7 ? ["regular", "growing", "stairs", "bigsmall"]
      : ["bigsmall", "random", "stairs", "growing"]);

    // Multiplicadores en pasos (enteros, para no salirse del beat). El mini usa pasos cortos.
    const maxM = isMini ? 2 : 3;
    const regular = isMini ? 1 : pick([1, 2]);
    const GROW = [1, 1, 2, 2, 3, 3, 2, 2, 1, 1];
    let drift = Math.random() < 0.5 ? -1 : 1; // stairs: hacia dónde suben los escalones
    const want = (i, dir) => {
      switch (pattern) {
        case "regular": return regular;
        case "growing": return GROW[i % GROW.length];
        case "stairs": return dir === drift ? 3 : 1;
        case "bigsmall": return i % 2 ? 1 : 2;
        default: return 1 + Math.floor(Math.random() * 3);
      }
    };

    // Duración: frases de 4 u 8 beats (más largas cuanto más intensa); sin música, cantidad fija
    const beats = isMini ? 4 : e > 0.5 ? 8 : 4;
    const totalSteps = bp ? Math.max(4, Math.round((beats * bp) / step)) : 8 + Math.floor(Math.random() * 6);

    for (let i = 0, used = 0; used < totalSteps; i++) {
      const fits = (d) => Math.floor(((d < 0 ? y - ymin : ymax - y) + 0.5) / (k * step));
      if (pattern === "stairs" && dir === drift && fits(dir) < 3) drift = -drift;
      let m = Math.min(want(i, dir), maxM, fits(dir), totalSteps - used);
      if (m < 1) { dir = -dir; m = Math.max(1, Math.min(want(i, dir), maxM, fits(dir), totalSteps - used)); }
      x += m * step;
      y = Math.max(ymin, Math.min(ymax, y + dir * k * m * step));
      pts.push([x, y]);
      used += m;
      dir = -dir;
    }

    // Polígonos en coordenadas de mundo
    // Hueco por punto: el primero arranca con el del tramo anterior y pasa al nuevo a lo largo
    // del primer segmento, así las paredes empalman sin escalón.
    const gs = pts.map(() => G);
    if (prev) gs[0] = Math.min(prev.gs[prev.gs.length - 1], 2 * Math.min(pts[0][1] - 2, H - 2 - pts[0][1]));
    const wallLine = (sign) => pts.map(([px, py], i) => [px, py + (sign * gs[i]) / 2]);
    const polys = [];
    if (floor === "wall") polys.push({ kind: "floor", pts: [...wallLine(1), [x, H + 10], [x0, H + 10]] });
    if (ceil === "wall") polys.push({ kind: "ceil", pts: [...wallLine(-1), [x, -10], [x0, -10]] });
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i];
      const peak = py < pts[i - 1][1] && py < pts[i + 1][1];
      const half = Math.min(px - pts[i - 1][0], pts[i + 1][0] - px) * 0.92;
      if (half < 2) continue;
      if (peak && floor === "diamond") {
        const t = py + G / 2;
        polys.push({ kind: "diamond", pts: [[px, t], [px + half, t + k * half], [px, t + 2 * k * half], [px - half, t + k * half]] });
      } else if (!peak && ceil === "diamond") {
        const b = py - G / 2;
        polys.push({ kind: "diamond", pts: [[px, b], [px + half, b - k * half], [px, b - 2 * k * half], [px - half, b - k * half]] });
      }
    }
    return { x0, x1: x, pts, gs, polys, G, k, floor, ceil, wallLine, mini: isMini, color: STRUCT_COLOR, hot: e >= 0.7 };
  }

  // y del centro del camino en x de mundo
  function pathY(s, x) {
    const p = s.pts;
    if (x <= p[0][0]) return p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (x <= p[i][0]) {
        const [ax, ay] = p[i - 1], [bx, by] = p[i];
        return ay + ((by - ay) * (x - ax)) / Math.max(1e-6, bx - ax);
      }
    }
    return p[p.length - 1][1];
  }

  // Los tramos van pegados: cada uno arranca donde termina el anterior (o en el portal que los separa),
  // así siempre hay laberinto. Solo el primero arranca fuera de pantalla, en un beat.
  function spawnSections() {
    if (!pyramids) return;
    const last = sections[sections.length - 1];
    if (last && last.x1 > bgOffset + W * 1.5) return;
    const lp = portals[portals.length - 1];
    if (last && last.x1 > bgOffset) {
      const x0 = Math.max(last.x1, lp ? lp.x : -Infinity);
      const joined = x0 === last.x1;
      sections.push(makeSection(x0, plannedMini, joined ? last.pts[last.pts.length - 1][1] : null, joined ? last : null));
      return;
    }

    let x0 = bgOffset + W + 20;
    if (lp) x0 = Math.max(x0, lp.x + H * 1.3); // lugar para acomodarse después del portal
    // Corremos el inicio para que el wave llegue justo en un beat
    const bp = beatPx(plannedMini);
    if (bp) {
      const v = speedPx(plannedMini), beatMs = 60000 / bpm, now = performance.now();
      const arrive = now + ((x0 - bgOffset - waveX()) / v) * 1000;
      const onBeat = lastBeat + Math.ceil((arrive - lastBeat) / beatMs) * beatMs;
      x0 += ((onBeat - arrive) / 1000) * v;
    }
    sections.push(makeSection(x0, plannedMini));
  }

  // ¿Mini o normal? En auto con música: según qué tan intensa/rápida está la canción.
  // Si no, alterna cada tanto para que igual aparezcan portales.
  function updateMiniWant(now, dt) {
    beatTimes = beatTimes.filter((t) => now - t < 3000);
    if (autoMode && hasMusic()) {
      const rate = beatTimes.length / 3;
      const hot = intensity > 1.25 || (bpm >= 150 && intensity > 1.05) || rate > 3.2;
      heat = Math.max(-2, Math.min(2, heat + (hot ? dt : -dt)));
      if (now - miniChanged > 4000) {
        if (!miniWant && heat > 1.2) { miniWant = true; miniChanged = now; }
        else if (miniWant && heat < -1.5) { miniWant = false; miniChanged = now; }
      }
      randomSwitchAt = now + 15000;
    } else if (now >= randomSwitchAt) {
      miniWant = !miniWant;
      miniChanged = now;
      randomSwitchAt = now + (miniWant ? 6000 + Math.random() * 6000 : 12000 + Math.random() * 12000);
    }

    if (miniWant !== plannedMini) {
      let x = bgOffset + W + 20;
      const last = sections[sections.length - 1];
      // con laberinto, el portal va justo en la unión con el próximo tramo
      if (last) x = pyramids && last.x1 > bgOffset ? last.x1 : Math.max(x, last.x1 + H * 0.5);
      const lp = portals[portals.length - 1];
      if (lp) x = Math.max(x, lp.x + H * 0.5);
      portals.push({ x, mini: miniWant });
      plannedMini = miniWant;
    }
  }

  function passPortals() {
    const wx = bgOffset + waveX();
    while (portals.length && portals[0].x <= wx) {
      const p = portals.shift();
      if (p.mini !== mini) {
        mini = p.mini;
        pulse = 1;
        burst(24, 1.6, p.mini ? PORTAL_MINI : PORTAL_NORMAL);
      }
    }
  }

  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function segDist(x, y, [ax, ay], [bx, by]) {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  }

  function hitSection() {
    const wx = bgOffset + waveX();
    const r = curSize() * 0.18; // hitbox chiquita, como en GD
    for (const s of sections) {
      if (wx + r < s.x0 || wx - r > s.x1) continue;
      for (const poly of s.polys) {
        if (inPoly(poly.pts, wx, waveY)) return s;
        for (let i = 0; i < poly.pts.length; i++) {
          if (segDist(wx, waveY, poly.pts[i], poly.pts[(i + 1) % poly.pts.length]) < r) return s;
        }
      }
    }
    return null;
  }

  function crash(s) {
    if (!autoMode) endRun();
    sections.splice(sections.indexOf(s), 1);
    shake = 1;
    flash = 1;
    burst(40, 2.2, s.color);
    burst(20, 1.4);
  }

  // Piloto automático: devuelve la dirección para seguir el centro del camino, o null si no hay tramo cerca
  function steer(dx) {
    const wx = bgOffset + waveX();
    const s = sections.find((s) => s.x1 > wx);
    if (!s) return null;
    const cy = pathY(s, Math.max(s.x0, wx + dx));
    const inside = wx + dx >= s.x0;
    if (!inside && s.x0 - wx > Math.abs(waveY - cy) / slope() + H * 0.15) return null;
    return cy < waveY;
  }

  // Arma las formas a dibujar: las paredes de tramos pegados se unen en una sola pieza
  // (sin bordes verticales en las uniones); los rombos van sueltos.
  function shapesOnScreen() {
    const shapes = [];
    const runs = { floor: null, ceil: null };
    const close = (side) => {
      const r = runs[side];
      if (!r) return;
      const edge = side === "floor" ? H + 10 : -10;
      shapes.push({ kind: side, pts: [...r.line, [r.line[r.line.length - 1][0], edge], [r.line[0][0], edge]], line: r.line });
      runs[side] = null;
    };
    let prevS = null;
    for (const s of sections) {
      const visible = s.x1 - bgOffset > 0 && s.x0 - bgOffset < W;
      const joined = prevS && Math.abs(s.x0 - prevS.x1) < 1;
      for (const side of ["floor", "ceil"]) {
        if (!joined) close(side);
        if (s[side] !== "wall") { close(side); continue; }
        if (!visible && !runs[side]) continue;
        const line = s.wallLine(side === "floor" ? 1 : -1);
        if (runs[side]) runs[side].line.push(...line.slice(1));
        else runs[side] = { line: line.slice() };
      }
      if (visible) for (const poly of s.polys) if (poly.kind === "diamond") shapes.push(poly);
      if (!visible && s.x0 - bgOffset >= W) { close("floor"); close("ceil"); break; }
      prevS = s;
    }
    close("floor");
    close("ceil");
    return shapes;
  }

  // Estructuras: relleno negro y capas concéntricas (rombos dentro de rombos; en las paredes,
  // líneas paralelas a la superficie que en cada pirámide quedan como triángulos concéntricos).
  // Solo brilla la capa de la onda; las demás quedan casi invisibles. El borde nunca se apaga
  // del todo, para que siempre se vea por dónde pasar.
  function drawPyramids() {
    if (!sections.length) return;
    ctx.save();
    ctx.lineJoin = "miter";
    const col = STRUCT_COLOR;
    const wallGap = Math.max(8, H * 0.06); // separación vertical entre las líneas de las paredes

    // Dibuja una capa con su nivel de luz (0 = apagada, 1 = prendida)
    const glowLine = (path, level) => {
      if (level < 0.02) return;
      path();
      if (level > 0.15) {
        ctx.lineWidth = 9;
        ctx.strokeStyle = rgba(col, 0.22 * level);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.strokeStyle = rgba(col, 0.45 * level);
        ctx.stroke();
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(col, Math.min(1, 0.2 + 0.8 * level));
      ctx.globalAlpha = Math.min(1, level * 1.5);
      ctx.stroke();
      if (level > 0.5) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * level})`;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    for (const shape of shapesOnScreen()) {
      const trace = () => {
        ctx.beginPath();
        shape.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x - bgOffset, y) : ctx.moveTo(x - bgOffset, y)));
        ctx.closePath();
      };
      trace();
      ctx.fillStyle = "#030008";
      ctx.fill();

      // Paredes: copias del contorno corridas hacia adentro hasta el borde del panel (mismos ángulos,
      // así en cada pirámide quedan triángulos anidados). La línea j pertenece a la capa
      // LAYERS-1 - (j % LAYERS): la onda va de adentro hacia la superficie y se repite cada LAYERS
      // líneas, así toda la pared se ilumina pareja.
      const sgn = shape.kind === "floor" ? 1 : -1;
      const wallLines = (i) => () => {
        ctx.beginPath();
        const edge = shape.kind === "floor" ? H : 0;
        let maxDepth = 0;
        for (const [, y] of shape.line) maxDepth = Math.max(maxDepth, sgn * (edge - y));
        const n = Math.ceil(maxDepth / wallGap);
        for (let j = LAYERS - 1 - i; j <= n; j += LAYERS) {
          if (j === 0) continue; // la superficie es el borde, va aparte
          const d = sgn * wallGap * j;
          shape.line.forEach(([x, y], q) => (q ? ctx.lineTo(x - bgOffset, y + d) : ctx.moveTo(x - bgOffset, y + d)));
        }
      };

      // capa i (0 = centro … LAYERS-1 = borde)
      const layerPath = (i) => {
        if (shape.kind === "diamond") {
          if (i === LAYERS - 1) return trace;
          const cx = shape.pts[0][0], cy = (shape.pts[0][1] + shape.pts[2][1]) / 2;
          const f = (i + 1) / LAYERS;
          return () => {
            ctx.beginPath();
            shape.pts.forEach(([x, y], j) => {
              const X = cx + (x - cx) * f - bgOffset, Y = cy + (y - cy) * f;
              j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
            });
            ctx.closePath();
          };
        }
        return wallLines(i);
      };
      const level = (i) => Math.min(1, Math.max(i === LAYERS - 1 ? 0.16 : 0.1, layerLit[i]) + strobe * 0.35);

      // capas de adentro, recortadas a la forma
      ctx.save();
      trace();
      ctx.clip();
      ctx.globalCompositeOperation = "lighter";
      // (en las paredes la capa de afuera también tiene líneas adentro, cada LAYERS)
      const inner = shape.kind === "diamond" ? LAYERS - 1 : LAYERS;
      for (let i = 0; i < inner; i++) glowLine(layerPath(i), level(i));
      ctx.restore();

      // borde (el brillo puede salir hacia afuera)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      glowLine(trace, level(LAYERS - 1));
      ctx.restore();
    }
    ctx.restore();
  }

  // Destello de fondo del estrobo, teñido con el color del tramo intenso en pantalla
  function drawStrobe() {
    if (strobe < 0.03) return;
    const s = sections.find((s) => s.hot && s.x0 - bgOffset < W && s.x1 - bgOffset > 0);
    if (!s) return;
    ctx.fillStyle = rgba(s.color, strobe * 0.12);
    ctx.fillRect(0, 0, W, H);
  }

  function drawPortals(now) {
    ctx.save();
    for (const p of portals) {
      const x = p.x - bgOffset;
      if (x < -50 || x > W + 50) continue;
      const col = p.mini ? PORTAL_MINI : PORTAL_NORMAL;
      const ry = H * (p.mini ? 0.26 : 0.34), rx = Math.max(6, H * 0.05);
      ctx.fillStyle = rgba(col, 0.08);
      ctx.fillRect(x - rx * 0.4, 0, rx * 0.8, H);
      ctx.shadowColor = col;
      ctx.shadowBlur = 16 + pulse * 10;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(3, rx * 0.45);
      ctx.beginPath();
      ctx.ellipse(x, H / 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.ellipse(x, H / 2, rx * 0.55, ry * (0.85 + 0.05 * Math.sin(now / 120)), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ─── Dibujo ───
  function drawBg() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    // un poco más claro que las estructuras (negras) para que se recorten bien
    g.addColorStop(0, `rgb(${24 + pulse * 10},${20 + pulse * 12},${50 + pulse * 30})`);
    g.addColorStop(1, "#0e0c24");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const grid = Math.max(24, H / 9);
    ctx.strokeStyle = rgba(config.color, 0.06 + pulse * 0.1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ox = bgOffset % grid;
    for (let x = -ox; x < W + grid; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H + grid; y += grid) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawSpectrum() {
    const bars = Math.min(96, Math.floor(W / 6));
    if (bars < 4) return;
    const bw = W / bars;
    const maxH = H * 0.22;
    ctx.save();
    for (let i = 0; i < bars; i++) {
      // escala aproximadamente logarítmica sobre los 128 bins
      const bin = Math.min(127, Math.floor(Math.pow(i / bars, 1.6) * 120) + 1);
      const v = spectrum[bin] / 255;
      const bh = Math.max(1, v * v * maxH);
      ctx.fillStyle = rgba(config.color, 0.08 + v * 0.22);
      ctx.fillRect(i * bw + 1, H - bh, bw - 2, bh);
    }
    ctx.restore();
  }

  function drawEdges() {
    ctx.save();
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 8 + pulse * 12;
    ctx.fillStyle = rgba(config.color, 0.5 + pulse * 0.4);
    ctx.fillRect(0, 0, W, 2);
    ctx.fillRect(0, H - 2, W, 2);
    ctx.restore();
  }

  function drawTrail() {
    if (trail.length < 2) return;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(trail[0].x, trail[0].y);
      for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    };
    ctx.save();
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    // halo
    path();
    ctx.strokeStyle = rgba(config.color, 0.18 + pulse * 0.15);
    ctx.lineWidth = curSize() * 0.55;
    ctx.stroke();
    // núcleo
    path();
    ctx.strokeStyle = rgba(config.color, 0.85);
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 12;
    ctx.lineWidth = Math.max(1.5, curSize() * 0.12);
    ctx.stroke();
    path();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  // Sprite del wave (vector, mismas proporciones que la imagen del prototipo; apunta hacia arriba)
  const ARROW = [[0, -0.4], [0.32, 0.3], [0, 0.19], [-0.32, 0.3]];
  const CHEVRON = [[-0.19, 0.4], [-0.13, 0.27], [0, 0.23], [0.13, 0.27], [0.19, 0.4], [0, 0.33]];

  function poly(pts, s) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
    ctx.closePath();
  }

  function drawWave() {
    const s = curSize() * 1.6 * (1 + pulse * 0.15);
    ctx.save();
    ctx.translate(waveX(), waveY);
    ctx.rotate(angle);
    ctx.lineJoin = "miter";
    ctx.shadowColor = config.color;
    ctx.shadowBlur = 14 + pulse * 16;
    poly(ARROW, s);
    ctx.fillStyle = config.color;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.strokeStyle = "#000";
    ctx.stroke();
    poly(CHEVRON, s);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawParticles(dt) {
    ctx.save();
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 1.8;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color || config.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.restore();
    particles = particles.filter((p) => p.life > 0);
  }

  function drawHUD(now) {
    const fs = Math.max(8, Math.min(12, H * 0.07));
    const pad = Math.max(5, Math.min(10, H * 0.05));
    const fit = (txt, maxW) => {
      if (ctx.measureText(txt).width <= maxW) return txt;
      while (txt.length > 2 && ctx.measureText(txt + "…").width > maxW) txt = txt.slice(0, -1);
      return txt + "…";
    };
    ctx.save();
    ctx.font = `bold ${fs}px 'Courier New', monospace`;
    ctx.textBaseline = "top";

    // Toggle de pirámides
    const label = W < 220 ? "▲" : "▲ PIRÁMIDES";
    const bp = fs * 0.5;
    btn = { w: ctx.measureText(label).width + bp * 2, h: fs + bp * 1.4, x: 0, y: pad - bp * 0.7 };
    btn.x = W - pad - btn.w;
    ctx.fillStyle = pyramids ? rgba(HAZARD, 0.25) : "rgba(0,0,0,0.35)";
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = pyramids ? HAZARD : "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);
    ctx.fillStyle = pyramids ? HAZARD : "rgba(255,255,255,0.5)";
    ctx.shadowColor = HAZARD;
    ctx.shadowBlur = pyramids ? 8 : 0;
    ctx.fillText(label, btn.x + bp, pad);
    ctx.shadowBlur = 0;
    const textW = btn.x - pad * 2;

    // Puntaje y récord, debajo del botón
    if (pyramids && H >= 60) {
      const RECORD = "#ffd23f";
      const txt = autoMode ? `★ ${best}` : `${Math.floor(run)}  ★ ${best}`;
      ctx.textAlign = "right";
      ctx.fillStyle = beatBest && !autoMode ? RECORD : "rgba(255,255,255,0.75)";
      ctx.shadowColor = RECORD;
      ctx.shadowBlur = beatBest && !autoMode ? 8 : 0;
      ctx.fillText(txt, W - pad, btn.y + btn.h + fs * 0.4);
      ctx.shadowBlur = 0;
      ctx.textAlign = "left";
      if (recordFx > 0) {
        const big = Math.max(12, Math.min(26, H * 0.12));
        ctx.save();
        ctx.font = `bold ${big}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = Math.min(1, recordFx * 2);
        ctx.fillStyle = RECORD;
        ctx.shadowColor = RECORD;
        ctx.shadowBlur = 16;
        ctx.fillText("¡NUEVO RÉCORD!", W / 2, H * 0.5 - (1 - recordFx) * H * 0.1);
        ctx.restore();
      }
    }

    let badge, col;
    if (autoMode) {
      badge = "◉ AUTO";
      col = "#00ff88";
    } else {
      const left = Math.max(0, Math.ceil(config.idleTimeout - (now - lastInteract) / 1000));
      badge = holding ? "◎ MANUAL" : `◎ MANUAL ${left}s`;
      col = "rgba(255,255,255,0.45)";
    }
    if (mini) badge += " · MINI";
    if (hasMusic() && bpm) badge += ` · ${Math.round(bpm)} BPM`;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = autoMode ? 8 : 0;
    ctx.fillText(fit(badge, textW), pad, pad);

    ctx.shadowBlur = 0;
    let line2 = null;
    if (track && track.title) {
      line2 = `${track.playing ? "♪" : "❚❚"} ${track.title}${track.artist ? " — " + track.artist : ""}`;
    } else if (!audioStatus.ok) {
      line2 = `⚠ ${audioStatus.message}`;
    }
    if (line2 && H >= 80) {
      ctx.fillStyle = audioStatus.ok ? rgba(config.color, 0.7) : "#ff6680";
      ctx.font = `${fs}px 'Courier New', monospace`;
      ctx.fillText(fit(line2, textW), pad, pad + fs * 1.4);
    }
    ctx.restore();
  }

  // ─── Loop ───
  let prev = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;

    if (holding) lastInteract = now;
    if (!autoMode && now - lastInteract >= config.idleTimeout * 1000) {
      autoMode = true;
      autoUp = holding;
      endRun();
    }

    sizeScale += ((mini ? MINI_SCALE : 1) - sizeScale) * Math.min(1, dt * 10);
    const half = curSize() / 2;
    const top = half + 4, bottom = H - half - 4;
    const atTop = waveY <= top + 0.5, atBottom = waveY >= bottom - 0.5;

    songSpeed += (targetSongSpeed() - songSpeed) * Math.min(1, dt * 1.2);
    const v = speedPx();
    const dx = v * dt;

    updateMiniWant(now, dt);
    spawnSections();
    passPortals();
    sections = sections.filter((s) => s.x1 > bgOffset - 50);

    // En auto, si viene un canal de pirámides lo seguimos; si no, mandan los beats
    const dir = autoMode ? steer(dx) : null;
    steering = dir !== null;
    if (steering) autoUp = dir;

    // En auto, si quedó pegado a un borde un rato (silencio o pocos beats), rebota
    if (autoMode && !steering) {
      if ((atTop && autoUp) || (atBottom && !autoUp)) {
        if (!edgeSince) edgeSince = now;
        if (now - edgeSince > (hasMusic() ? 400 : 0)) { autoUp = !autoUp; edgeSince = 0; }
      } else {
        edgeSince = 0;
      }
    }

    const up = autoMode ? autoUp : holding;
    bgOffset += dx;
    const k = slope();
    waveY += up ? -dx * k : dx * k;
    waveY = Math.max(top, Math.min(bottom, waveY));

    const onEdge = (waveY <= top + 0.5 && up) || (waveY >= bottom - 0.5 && !up);
    const tilt = Math.atan(k);
    const target = onEdge ? Math.PI / 2 : up ? Math.PI / 2 - tilt : Math.PI / 2 + tilt;
    angle += (target - angle) * Math.min(1, dt * 12);

    for (const p of trail) p.x -= dx;
    while (trail.length && trail[0].x < -20) trail.shift();
    trail.push({ x: waveX(), y: waveY });

    // Puntaje: solo en manual y mientras el wave está dentro del laberinto
    const wxNow = bgOffset + waveX();
    if (pyramids && !autoMode && sections.some((s) => s.x0 <= wxNow && s.x1 >= wxNow)) {
      run += (dx / (H / 10)) * (mini ? 2 : 1);
      if (Math.floor(run) > best) {
        if (!beatBest && best > 0) recordFx = 1; // lo acabás de pasar
        beatBest = true;
        best = Math.floor(run);
        if (now - lastSaved > 2000) saveBest();
      }
    }
    recordFx = Math.max(0, recordFx - dt * 0.6);

    const hit = hitSection();
    if (hit) crash(hit);

    pulse *= Math.exp(-dt * 5);
    strobe *= Math.exp(-dt * 14);
    // sin música la onda sigue sola, a un ritmo fijo
    layerTimer += dt;
    if (!hasMusic() && layerTimer >= 0.3) stepLayers();
    for (let i = 0; i < LAYERS; i++) if (i !== layerIdx) layerLit[i] *= Math.exp(-dt * 18);
    shake *= Math.exp(-dt * 8);
    flash *= Math.exp(-dt * 6);

    ctx.save();
    if (shake > 0.02) {
      const m = shake * Math.min(8, H * 0.04);
      ctx.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m);
    }
    drawBg();
    drawStrobe();
    drawSpectrum();
    drawPyramids();
    drawPortals(now);
    drawTrail();
    drawParticles(dt);
    drawWave();
    drawEdges();
    ctx.restore();
    if (flash > 0.02) {
      ctx.fillStyle = rgba(HAZARD, flash * 0.3);
      ctx.fillRect(0, 0, W, H);
    }
    drawHUD(now);

    requestAnimationFrame(loop);
  }

  resize();
  requestAnimationFrame(loop);
  vscode.postMessage({ type: "ready" });
})();
