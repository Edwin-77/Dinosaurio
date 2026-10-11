// =====================================================
//  Dinosaurio — hecho por Edwin 😎
//  Juego estilo "sin conexión" del navegador, en <canvas>
// =====================================================

// ---------- Tamaño lógico del juego ----------
const ANCHO = 600;
const ALTO = 170;
const SUELO = 140; // línea del suelo (y)

// ---------- Ajustes (parecidos al juego original) ----------
const CONFIG = {
  velocidadInicial: 6,
  velocidadMaxima: 13,
  aceleracion: 0.001, // cuánto acelera por cuadro
  gravedad: 0.6,
  fuerzaSalto: -10,
  saltoMinimo: -5, // si sueltas rápido, salto corto
  caidaRapida: 1.6, // gravedad extra al presionar ↓ en el aire
  velocidadPajaros: 8.5, // los pájaros aparecen desde esta velocidad
  puntosNoche: 700, // cada 700 puntos cambia entre día y noche
  huecoMinimo: 120,
  coeficienteHueco: 0.6,
};

// ---------- Canvas ----------
const lienzo = document.getElementById("lienzo");
const ctx = lienzo.getContext("2d");

function ajustarLienzo() {
  const escala = window.devicePixelRatio || 1;
  lienzo.width = ANCHO * escala;
  lienzo.height = ALTO * escala;
  lienzo.style.aspectRatio = ANCHO + " / " + ALTO;
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
ajustarLienzo();
window.addEventListener("resize", ajustarLienzo);

// ---------- Imágenes ----------
const imgDino = new Image();
imgDino.src = "dino.png";
const imgCactus = new Image();
imgCactus.src = "captus.png";

// ---------- Récord guardado ----------
function leerRecord() {
  try {
    return parseInt(localStorage.getItem("dinoRecord")) || 0;
  } catch (e) {
    return 0;
  }
}
function guardarRecord(valor) {
  try {
    localStorage.setItem("dinoRecord", String(valor));
  } catch (e) {}
}

// ---------- Sonidos (pitidos simples, sin archivos) ----------
let audio = null;
function pitido(frecuencia, duracion, tipo) {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const vol = audio.createGain();
    osc.type = tipo || "square";
    osc.frequency.value = frecuencia;
    vol.gain.setValueAtTime(0.06, audio.currentTime);
    vol.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duracion);
    osc.connect(vol);
    vol.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + duracion);
  } catch (e) {}
}
const sonido = {
  salto: () => pitido(620, 0.08),
  punto: () => {
    pitido(880, 0.08);
    setTimeout(() => pitido(1175, 0.12), 90);
  },
  choque: () => {
    pitido(180, 0.12, "sawtooth");
    setTimeout(() => pitido(120, 0.2, "sawtooth"), 110);
  },
};

// ---------- Estado del juego ----------
// estado: "inicio" | "jugando" | "pausa" | "perdido"
let estado = "inicio";
let velocidad, distancia, puntos, record, obstaculos, nubes, piedras, estrellas;
let siguienteObstaculo, cuadro, parpadeo, tiempoPerdido, noche, nocheNivel;

const dino = {
  x: 25,
  y: 0,
  vy: 0,
  ancho: 48,
  alto: 44,
  enAire: false,
  agachado: false,
  bajando: false, // ↓ presionado
  saltoPresionado: false,
};

function reiniciar() {
  velocidad = CONFIG.velocidadInicial;
  distancia = 0;
  puntos = 0;
  record = leerRecord();
  obstaculos = [];
  siguienteObstaculo = 300;
  cuadro = 0;
  parpadeo = 0;
  noche = false;
  nocheNivel = 0;
  document.body.classList.remove("noche");

  dino.y = SUELO - dino.alto;
  dino.vy = 0;
  dino.enAire = false;
  dino.agachado = false;

  nubes = [];
  for (let i = 0; i < 3; i++) nubes.push(nuevaNube(Math.random() * ANCHO));

  piedras = [];
  for (let i = 0; i < 40; i++) piedras.push(nuevaPiedra(Math.random() * ANCHO));

  estrellas = [];
  for (let i = 0; i < 6; i++) {
    estrellas.push({ x: Math.random() * ANCHO, y: 10 + Math.random() * 70 });
  }
}

function nuevaNube(x) {
  return { x: x, y: 20 + Math.random() * 55 };
}

function nuevaPiedra(x) {
  return {
    x: x,
    y: SUELO + 3 + Math.random() * 10,
    ancho: Math.random() < 0.8 ? 2 : 4,
  };
}

// ---------- Obstáculos ----------
function crearObstaculo() {
  const puedePajaro = velocidad >= CONFIG.velocidadPajaros;
  const r = Math.random();
  let o;

  if (puedePajaro && r < 0.25) {
    // Pájaro a tres alturas: bajo (saltar), medio (agacharse), alto (pasar por debajo)
    const alturas = [SUELO - 32, SUELO - 57, SUELO - 82];
    o = {
      tipo: "pajaro",
      x: ANCHO,
      y: alturas[Math.floor(Math.random() * alturas.length)],
      ancho: 46,
      alto: 30,
      extra: 0.8 + Math.random() * 0.8, // vuelan un poco más rápido que el suelo
    };
  } else {
    // Grupo de cactus (1 a 3). Los grandes y los grupos aparecen al ir más rápido.
    const grande = Math.random() < 0.5;
    const maxGrupo = velocidad > 8 ? 3 : velocidad > 7 ? 2 : 1;
    const cantidad = 1 + Math.floor(Math.random() * maxGrupo);
    const alto = grande ? 50 : 35;
    const anchoUno = Math.round(alto * 0.71);
    o = {
      tipo: "cactus",
      x: ANCHO,
      y: SUELO - alto,
      cantidad: cantidad,
      anchoUno: anchoUno,
      ancho: anchoUno * cantidad - (cantidad - 1) * 6,
      alto: alto,
      extra: 0,
    };
  }

  obstaculos.push(o);

  // Distancia hasta el próximo obstáculo (crece con la velocidad)
  const huecoMin = Math.round(o.ancho * velocidad + CONFIG.huecoMinimo * CONFIG.coeficienteHueco);
  const huecoMax = huecoMin * 1.5;
  siguienteObstaculo = huecoMin + Math.random() * (huecoMax - huecoMin);
}

// ---------- Cajas de choque (un poco más pequeñas que el dibujo, para ser justos) ----------
function cajasDino() {
  if (dino.agachado) {
    return [{ x: dino.x + 6, y: dino.y + 6, w: dino.ancho - 10, h: dino.alto - 8 }];
  }
  return [
    { x: dino.x + 22, y: dino.y + 3, w: 22, h: 16 }, // cabeza
    { x: dino.x + 8, y: dino.y + 16, w: 28, h: 22 }, // cuerpo
  ];
}

function cajasObstaculo(o) {
  if (o.tipo === "pajaro") {
    return [{ x: o.x + 6, y: o.y + 8, w: o.ancho - 12, h: o.alto - 14 }];
  }
  return [{ x: o.x + 4, y: o.y + 4, w: o.ancho - 8, h: o.alto - 4 }];
}

function chocan(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ---------- Controles ----------
function saltar() {
  if (estado === "inicio") {
    estado = "jugando";
  } else if (estado === "perdido") {
    if (performance.now() - tiempoPerdido > 600) {
      reiniciar();
      estado = "jugando";
    }
    return;
  } else if (estado === "pausa") {
    estado = "jugando";
    return;
  }
  dino.saltoPresionado = true;
  if (!dino.enAire && !dino.agachado) {
    dino.vy = CONFIG.fuerzaSalto - velocidad / 10;
    dino.enAire = true;
    sonido.salto();
  }
}

function soltarSalto() {
  dino.saltoPresionado = false;
  // Salto corto si sueltas la tecla rápido
  if (dino.enAire && dino.vy < CONFIG.saltoMinimo) dino.vy = CONFIG.saltoMinimo;
}

function agachar(activo) {
  if (estado !== "jugando") return;
  dino.bajando = activo;
}

function pausar() {
  if (estado === "jugando") estado = "pausa";
  else if (estado === "pausa") estado = "jugando";
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (!e.repeat) saltar();
  } else if (e.code === "ArrowDown" || e.code === "KeyS") {
    e.preventDefault();
    agachar(true);
  } else if (e.code === "KeyP" || e.code === "Escape") {
    pausar();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") soltarSalto();
  if (e.code === "ArrowDown" || e.code === "KeyS") agachar(false);
});

// Tocar o hacer clic en el juego = saltar
lienzo.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  saltar();
});
lienzo.addEventListener("pointerup", soltarSalto);
lienzo.addEventListener("pointercancel", soltarSalto);

// Botones para celular
const btnSaltar = document.getElementById("btnSaltar");
const btnAgachar = document.getElementById("btnAgachar");
btnSaltar.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  saltar();
});
btnSaltar.addEventListener("pointerup", soltarSalto);
btnSaltar.addEventListener("pointerleave", soltarSalto);
btnAgachar.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  agachar(true);
});
["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
  btnAgachar.addEventListener(ev, () => agachar(false))
);

// Pausa automática si cambias de pestaña
document.addEventListener("visibilitychange", () => {
  if (document.hidden && estado === "jugando") estado = "pausa";
});

// ---------- Actualizar ----------
function actualizar(dt) {
  cuadro += dt;

  // Velocidad y puntos
  if (velocidad < CONFIG.velocidadMaxima) velocidad += CONFIG.aceleracion * dt;
  distancia += velocidad * dt;
  const nuevosPuntos = Math.floor(distancia * 0.025);
  if (Math.floor(nuevosPuntos / 100) > Math.floor(puntos / 100)) {
    parpadeo = 60; // parpadea el marcador cada 100 puntos
    sonido.punto();
  }
  if (Math.floor(nuevosPuntos / CONFIG.puntosNoche) > Math.floor(puntos / CONFIG.puntosNoche)) {
    noche = !noche;
    document.body.classList.toggle("noche", noche);
  }
  puntos = nuevosPuntos;
  if (parpadeo > 0) parpadeo -= dt;

  // Transición suave día/noche
  nocheNivel += ((noche ? 1 : 0) - nocheNivel) * 0.05 * dt;

  // Dino: agacharse solo en el suelo; en el aire ↓ hace caer más rápido
  dino.agachado = dino.bajando && !dino.enAire;
  if (dino.agachado) {
    dino.ancho = 58;
    dino.alto = 28;
  } else {
    dino.ancho = 48;
    dino.alto = 44;
  }

  if (dino.enAire) {
    dino.vy += CONFIG.gravedad * dt * (dino.bajando ? CONFIG.caidaRapida + 1 : 1);
    dino.y += dino.vy * dt;
    if (dino.y >= SUELO - dino.alto) {
      dino.y = SUELO - dino.alto;
      dino.vy = 0;
      dino.enAire = false;
    }
  } else {
    dino.y = SUELO - dino.alto;
  }

  // Obstáculos
  siguienteObstaculo -= velocidad * dt;
  if (siguienteObstaculo <= 0) crearObstaculo();

  for (const o of obstaculos) o.x -= (velocidad + o.extra) * dt;
  obstaculos = obstaculos.filter((o) => o.x + o.ancho > -10);

  // Nubes, piedras y estrellas (más lentas = efecto de profundidad)
  for (const n of nubes) n.x -= velocidad * 0.2 * dt;
  nubes = nubes.filter((n) => n.x > -60);
  if (nubes.length < 3 && Math.random() < 0.01 * dt) nubes.push(nuevaNube(ANCHO + 10));

  for (const p of piedras) p.x -= velocidad * dt;
  piedras = piedras.filter((p) => p.x > -5);
  while (piedras.length < 40) piedras.push(nuevaPiedra(ANCHO + Math.random() * 20));

  for (const s of estrellas) {
    s.x -= 0.15 * dt;
    if (s.x < -5) s.x = ANCHO + 5;
  }

  // Choques
  const cd = cajasDino();
  for (const o of obstaculos) {
    for (const co of cajasObstaculo(o)) {
      for (const c of cd) {
        if (chocan(c, co)) return perder();
      }
    }
  }
}

function perder() {
  estado = "perdido";
  tiempoPerdido = performance.now();
  sonido.choque();
  if (navigator.vibrate) navigator.vibrate(150);
  if (puntos > record) {
    record = puntos;
    guardarRecord(record);
  }
}

// ---------- Dibujar ----------
function colorTinta() {
  return nocheNivel > 0.5 ? "#d6d6d6" : "#535353";
}

function mezclar(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16);
  const b = parseInt(c2.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return "rgb(" + r + "," + g + "," + bl + ")";
}

function dibujarFondo() {
  ctx.fillStyle = mezclar("#f7f7f7", "#202124", nocheNivel);
  ctx.fillRect(0, 0, ANCHO, ALTO);

  // Luna y estrellas de noche
  if (nocheNivel > 0.05) {
    ctx.globalAlpha = nocheNivel;
    ctx.fillStyle = "#f1f1f1";
    for (const s of estrellas) ctx.fillRect(s.x, s.y, 2, 2);
    ctx.beginPath();
    ctx.arc(480, 32, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mezclar("#f7f7f7", "#202124", nocheNivel);
    ctx.beginPath();
    ctx.arc(486, 28, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function dibujarNube(n) {
  ctx.fillStyle = nocheNivel > 0.5 ? "#4a4b4e" : "#e0e0e0";
  ctx.beginPath();
  ctx.arc(n.x + 12, n.y + 8, 8, 0, Math.PI * 2);
  ctx.arc(n.x + 24, n.y + 4, 10, 0, Math.PI * 2);
  ctx.arc(n.x + 36, n.y + 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(n.x + 6, n.y + 8, 36, 8);
}

function dibujarSuelo() {
  ctx.fillStyle = colorTinta();
  ctx.fillRect(0, SUELO, ANCHO, 1.5);
  for (const p of piedras) ctx.fillRect(p.x, p.y, p.ancho, 1.5);
}

function dibujarDino() {
  const muerto = estado === "perdido";
  // Pequeño rebote al correr (como el paso del original)
  const paso = estado === "jugando" && !dino.enAire && Math.floor(cuadro / 6) % 2 === 0 ? 1.5 : 0;

  if (imgDino.complete && imgDino.naturalWidth) {
    ctx.save();
    if (muerto) ctx.filter = "grayscale(1) brightness(0.9)";
    ctx.drawImage(imgDino, dino.x, dino.y - paso, dino.ancho, dino.alto + paso);
    ctx.restore();
  } else {
    ctx.fillStyle = colorTinta();
    ctx.fillRect(dino.x, dino.y, dino.ancho, dino.alto);
  }

  if (muerto) {
    // Ojo de "X"
    const ex = dino.x + dino.ancho * 0.78;
    const ey = dino.y + dino.alto * 0.18;
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex - 3, ey - 3);
    ctx.lineTo(ex + 3, ey + 3);
    ctx.moveTo(ex + 3, ey - 3);
    ctx.lineTo(ex - 3, ey + 3);
    ctx.stroke();
  }
}

function dibujarCactus(o) {
  for (let i = 0; i < o.cantidad; i++) {
    const x = o.x + i * (o.anchoUno - 6);
    if (imgCactus.complete && imgCactus.naturalWidth) {
      ctx.drawImage(imgCactus, x, o.y, o.anchoUno, o.alto);
    } else {
      ctx.fillStyle = "#4a8f3a";
      ctx.fillRect(x + o.anchoUno * 0.35, o.y, o.anchoUno * 0.3, o.alto);
    }
  }
}

function dibujarPajaro(o) {
  const alasArriba = Math.floor(cuadro / 10) % 2 === 0;
  const x = o.x;
  const y = o.y + 12;
  ctx.fillStyle = colorTinta();

  // Cuerpo y cabeza con pico
  ctx.beginPath();
  ctx.ellipse(x + 26, y + 4, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 8, y + 1);
  ctx.lineTo(x, y + 4);
  ctx.lineTo(x + 10, y + 6);
  ctx.fill();
  // Cola
  ctx.beginPath();
  ctx.moveTo(x + 40, y + 2);
  ctx.lineTo(x + 46, y - 1);
  ctx.lineTo(x + 44, y + 6);
  ctx.fill();
  // Ala
  ctx.beginPath();
  ctx.moveTo(x + 18, y + 2);
  ctx.lineTo(x + 32, y + 2);
  ctx.lineTo(x + 22, alasArriba ? y - 12 : y + 16);
  ctx.closePath();
  ctx.fill();
}

function texto(t, x, y, tam, alinear) {
  ctx.font = "bold " + tam + "px 'Courier New', monospace";
  ctx.textAlign = alinear || "left";
  ctx.fillStyle = colorTinta();
  ctx.fillText(t, x, y);
}

function cincoDigitos(n) {
  return String(Math.min(n, 99999)).padStart(5, "0");
}

function dibujarMarcador() {
  // Cada 100 puntos el número parpadea mostrando el múltiplo de 100
  let actual = cincoDigitos(puntos);
  if (parpadeo > 0) {
    actual = Math.floor(parpadeo / 8) % 2 === 0 ? cincoDigitos(Math.floor(puntos / 100) * 100) : "";
  }
  texto(actual, ANCHO - 10, 22, 15, "right");
  if (record > 0) {
    ctx.globalAlpha = 0.7;
    texto("HI " + cincoDigitos(record), ANCHO - 70, 22, 15, "right");
    ctx.globalAlpha = 1;
  }
}

function dibujarReiniciar(cx, cy) {
  ctx.strokeStyle = colorTinta();
  ctx.fillStyle = colorTinta();
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, Math.PI * 0.25, Math.PI * 1.85);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 15, cy - 11);
  ctx.lineTo(cx + 15, cy + 1);
  ctx.lineTo(cx + 3, cy - 1);
  ctx.closePath();
  ctx.fill();
}

function dibujar() {
  dibujarFondo();
  nubes.forEach(dibujarNube);
  dibujarSuelo();
  for (const o of obstaculos) {
    if (o.tipo === "cactus") dibujarCactus(o);
    else dibujarPajaro(o);
  }
  dibujarDino();
  if (estado !== "inicio") dibujarMarcador();

  if (estado === "inicio") {
    texto("Presiona ESPACIO o toca para jugar", ANCHO / 2, 70, 14, "center");
  } else if (estado === "pausa") {
    texto("PAUSA", ANCHO / 2, 60, 18, "center");
    texto("toca o presiona P para seguir", ANCHO / 2, 82, 12, "center");
  } else if (estado === "perdido") {
    texto("G A M E   O V E R", ANCHO / 2, 55, 18, "center");
    dibujarReiniciar(ANCHO / 2, 88);
  }
}

// ---------- Bucle principal ----------
let ultimoTiempo = performance.now();
function bucle(ahora) {
  // dt = 1 equivale a un cuadro a 60 FPS; así va igual de rápido en cualquier pantalla
  const dt = Math.min((ahora - ultimoTiempo) / (1000 / 60), 3);
  ultimoTiempo = ahora;
  if (estado === "jugando") actualizar(dt);
  dibujar();
  requestAnimationFrame(bucle);
}

reiniciar();
requestAnimationFrame(bucle);
