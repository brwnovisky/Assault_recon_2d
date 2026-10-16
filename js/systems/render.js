import { C, OP_HALF, OP_RANGE, EN_HALF, EN_RANGE } from "../config.js";
import { state } from "../state.js";
import { adiff, los } from "../pathfinding.js";

let cv, ctx, bg, bgx, TS = 32, dpr = 1;

export function getTS() { return TS; }

export function initRenderer(canvasElement) {
  cv = canvasElement;
  ctx = cv.getContext("2d");
  bg = document.createElement("canvas");
  bgx = bg.getContext("2d");
}

export function clampView() {
  state.Z = Math.min(4, Math.max(1, state.Z));
  state.OX = Math.min(Math.max(0, state.OX), state.W - state.W / state.Z);
  state.OY = Math.min(Math.max(0, state.OY), state.H - state.H / state.Z);
}

export function zoomAt(nz, px, py, req) {
  const mx = state.OX + px / (TS * state.Z), my = state.OY + py / (TS * state.Z);
  state.Z = Math.min(4, Math.max(1, nz));
  state.OX = mx - px / (TS * state.Z);
  state.OY = my - py / (TS * state.Z);
  clampView();
  req();
}

export function layout(req) {
  const st = document.getElementById("stage"), w = st.clientWidth, h = st.clientHeight;
  if (!w || !h) return;
  TS = Math.max(6, Math.min(48, Math.floor(Math.min(w / state.W, h / state.H))));
  dpr = Math.min(2, window.devicePixelRatio || 1);
  for (const c of [cv, bg]) {
    c.width = state.W * TS * dpr;
    c.height = state.H * TS * dpr;
  }
  cv.style.width = state.W * TS + "px";
  cv.style.height = state.H * TS + "px";
  clampView();
  drawStatic();
  req();
}

function drawExit(g, x, y) {
  const vert = x === 0 || x === state.W - 1, out = vert ? (x === 0 ? -1 : 1) : (y === 0 ? -1 : 1);
  g.fillStyle = C.wall;
  if (vert) {
    g.fillRect(x - .01, y - .01, 1.02, .18);
    g.fillRect(x - .01, y + .83, 1.02, .18);
  } else {
    g.fillRect(x - .01, y - .01, .18, 1.02);
    g.fillRect(x + .83, y - .01, .18, 1.02);
  }
  g.fillStyle = C.door;
  g.globalAlpha = .6;
  if (vert) g.fillRect(out < 0 ? x : x + .84, y + .18, .16, .65);
  else g.fillRect(x + .18, out < 0 ? y : y + .84, .65, .16);
  g.globalAlpha = 1;
}

export function drawStatic() {
  bgx.setTransform(dpr * TS, 0, 0, dpr * TS, 0, 0);
  paintStatic(bgx);
}

function paintStatic(g) {
  g.fillStyle = C.board;
  g.fillRect(0, 0, state.W, state.H);
  g.strokeStyle = C.grid;
  g.lineWidth = 0.03;
  g.beginPath();
  for (let x = 1; x < state.W; x++) { g.moveTo(x, 0); g.lineTo(x, state.H); }
  for (let y = 1; y < state.H; y++) { g.moveTo(0, y); g.lineTo(state.W, y); }
  g.stroke();
  for (let y = 0; y < state.H; y++) for (let x = 0; x < state.W; x++) {
    const s = state.solid[y * state.W + x];
    if (s === 1) {
      if (state.MAP[y][x] === "O") drawExit(g, x, y);
      else { g.fillStyle = C.wall; g.fillRect(x - .01, y - .01, 1.02, 1.02); }
    } else if (s === 2) {
      g.fillStyle = C.crate;
      g.fillRect(x + .14, y + .14, .72, .72);
      g.strokeStyle = C.board;
      g.lineWidth = 0.06;
      g.beginPath();
      g.moveTo(x + .22, y + .22); g.lineTo(x + .78, y + .78);
      g.moveTo(x + .78, y + .22); g.lineTo(x + .22, y + .78);
      g.stroke();
    }
  }
}

function cone(u, half, range, color, alpha) {
  ctx.beginPath();
  ctx.moveTo(u.x, u.y);
  const R = 24;
  for (let i = 0; i <= R; i++) {
    const a = u.a - half + 2 * half * i / R, cx = Math.cos(a), sy = Math.sin(a);
    let d = 0.3;
    while (d < range) {
      if (state.opaque[((u.y + sy * d) | 0) * state.W + ((u.x + cx * d) | 0)]) break;
      d += 0.15;
    }
    ctx.lineTo(u.x + cx * d, u.y + sy * d);
  }
  ctx.closePath();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

const endOf = o => o.path.length ? o.path[o.path.length - 1] : o;

function aimPreview(o, col) {
  const s = endOf(o);
  let a = o.a;
  if (o.aim) a = Math.atan2(o.aim.y - s.y, o.aim.x - s.x);
  else if (o.path.length) {
    const q = o.path.length > 1 ? o.path[o.path.length - 2] : o;
    a = Math.atan2(s.y - q.y, s.x - q.x);
  }
  const opened = [];
  for (const p of o.path) {
    const k = (p.y | 0) * state.W + (p.x | 0);
    if (state.doorIdx[k] >= 0 && state.opaque[k]) {
      state.opaque[k] = 0;
      opened.push(k);
    }
  }
  ctx.fillStyle = col;
  for (let y = 0; y < state.H; y++) for (let x = 0; x < state.W; x++) {
    const k = y * state.W + x;
    if (state.solid[k] === 1) continue;
    const dx = x + .5 - s.x, dy = y + .5 - s.y, d2 = dx * dx + dy * dy;
    if (d2 > OP_RANGE * OP_RANGE) continue;
    if (d2 > 0.01 && Math.abs(adiff(Math.atan2(dy, dx), a)) > OP_HALF) continue;
    const c = los(s.x, s.y, x + .5, y + .5);
    if (c < 0) continue;
    ctx.globalAlpha = c ? 0.1 : 0.24;
    ctx.fillRect(x + .06, y + .06, .88, .88);
  }
  ctx.globalAlpha = 1;
  for (const k of opened) state.opaque[k] = 1;
}

function drawX(px, py, col, a) {
  ctx.globalAlpha = a;
  ctx.strokeStyle = col;
  ctx.lineWidth = .08;
  ctx.beginPath();
  ctx.moveTo(px - .22, py - .22); ctx.lineTo(px + .22, py + .22);
  ctx.moveTo(px + .22, py - .22); ctx.lineTo(px - .22, py + .22);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state.Z === 1) {
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(dpr * TS, 0, 0, dpr * TS, 0, 0);
  } else {
    const s = dpr * TS * state.Z;
    ctx.setTransform(s, 0, 0, s, -state.OX * s, -state.OY * s);
    paintStatic(ctx);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const d of state.doors) {
    ctx.fillStyle = C.door;
    if (!d.open) {
      d.vert ? ctx.fillRect(d.x + .36, d.y, .28, 1) : ctx.fillRect(d.x, d.y + .36, 1, .28);
    } else {
      ctx.globalAlpha = .55;
      d.vert ? ctx.fillRect(d.x + .36, d.y, .28, .14) : ctx.fillRect(d.x, d.y + .36, .14, .28);
      ctx.globalAlpha = 1;
    }
  }

  if (state.status === "plan" && state.turn === 1) {
    ctx.strokeStyle = C.ink; ctx.globalAlpha = .4; ctx.lineWidth = .05; ctx.setLineDash([.12, .1]);
    for (const ent of state.entries) for (const s of ent) ctx.strokeRect(s.x + .1, s.y + .1, .8, .8);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  for (const e of state.enemies) if (e.alive && e.vis) cone(e, EN_HALF, EN_RANGE, C.enemy, 0.09);

  const preview = state.status === "plan" && state.ops[state.sel].alive && (state.mode === "aim" || !!state.ops[state.sel].aim);
  state.ops.forEach((o, i) => {
    if (o.alive && (state.status === "exec" || state.status === "replay" || (i === state.sel && !preview))) {
      cone(o, OP_HALF, OP_RANGE, C.op[i], (state.status === "exec" || state.status === "replay") ? 0.1 : 0.15);
    }
  });

  if (preview) aimPreview(state.ops[state.sel], C.op[state.sel]);

  state.ops.forEach((o, i) => {
    if (!o.alive || state.status === "replay") return;
    const col = C.op[i];
    const fa = state.status === "plan" && i !== state.sel && state.mode !== "wait" ? 0.22 : 1;
    ctx.globalAlpha = fa;
    if (o.pi < o.path.length) {
      ctx.strokeStyle = col; ctx.lineWidth = i === state.sel ? 0.09 : 0.06; ctx.setLineDash([0.18, 0.14]);
      ctx.beginPath(); ctx.moveTo(o.x, o.y);
      for (let k = o.pi; k < o.path.length; k++) ctx.lineTo(o.path[k].x, o.path[k].y);
      ctx.stroke(); ctx.setLineDash([]);
      let c = 0; ctx.fillStyle = col;
      for (const a of o.acts) if (typeof a === "number") {
        c += a;
        if (c - 1 >= o.pi) {
          const p = o.path[c - 1]; ctx.beginPath(); ctx.arc(p.x, p.y, .13, 0, 7); ctx.fill();
        }
      }
    }
    if (o.aim) {
      const s = o.pi < o.path.length ? endOf(o) : o;
      ctx.strokeStyle = col; ctx.lineWidth = 0.04; ctx.globalAlpha = .8 * fa;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(o.aim.x, o.aim.y); ctx.stroke();
      ctx.beginPath(); ctx.arc(o.aim.x, o.aim.y, .22, 0, 7);
      ctx.moveTo(o.aim.x - .32, o.aim.y); ctx.lineTo(o.aim.x + .32, o.aim.y);
      ctx.moveTo(o.aim.x, o.aim.y - .32); ctx.lineTo(o.aim.x, o.aim.y + .32);
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = fa;
    for (const h of o.holds) {
      if (state.status !== "plan" && h.done) continue;
      const ax = h.hx + .5, ay = h.hy + .5, bx = h.tx + .5, by = h.ty + .5;
      ctx.strokeStyle = col; ctx.lineWidth = .04; ctx.setLineDash([.06, .12]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = col; ctx.fillRect(ax + .12, ay - .52, .1, .3); ctx.fillRect(ax + .28, ay - .52, .1, .3);
      ctx.fillStyle = C.op[h.op]; ctx.beginPath();
      ctx.moveTo(bx, by - .24); ctx.lineTo(bx + .24, by); ctx.lineTo(bx, by + .24); ctx.lineTo(bx - .24, by);
      ctx.closePath(); ctx.fill();
    }
    if (state.pendingHold && state.pendingHold.op === i) {
      const t = state.pendingHold.at === 0 ? o : o.path[state.pendingHold.at - 1];
      ctx.strokeStyle = col; ctx.lineWidth = .07; ctx.setLineDash([.1, .1]);
      ctx.beginPath(); ctx.arc(t.x, t.y, .42, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  });

  for (const t of state.tracers) {
    ctx.globalAlpha = Math.min(1, t.t / 0.1);
    ctx.strokeStyle = t.en ? C.enemy : C.ink;
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Inimigos com Fuzil AK-47
  for (const e of state.enemies) {
    if (!e.seen) continue;
    if (!e.alive) { drawX(e.x, e.y, C.enemy, .5); continue; }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);

    if (e.vis) {
      // 0. Sombra suave
      ctx.fillStyle = "rgba(8, 12, 16, 0.45)";
      ctx.beginPath();
      ctx.ellipse(0.02, 0.02, 0.19, 0.21, 0, 0, 2 * Math.PI);
      ctx.fill();

      // 1. Botas
      ctx.fillStyle = "#0B0F13";
      ctx.beginPath();
      ctx.ellipse(-0.08, -0.13, 0.045, 0.024, 0.15, 0, 2 * Math.PI);
      ctx.ellipse(-0.15, 0.08, 0.045, 0.024, -0.1, 0, 2 * Math.PI);
      ctx.fill();

      // 2. Tronco perfilado
      ctx.fillStyle = C.enemy;
      ctx.beginPath();
      ctx.moveTo(-0.15, 0.02);
      ctx.lineTo(-0.13, 0.17);
      ctx.lineTo(-0.02, 0.16);
      ctx.lineTo(0.08, 0.05);
      ctx.lineTo(0.06, -0.10);
      ctx.lineTo(0.02, -0.18);
      ctx.lineTo(-0.09, -0.17);
      ctx.lineTo(-0.14, -0.08);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 0.015;
      ctx.strokeStyle = "#0E1318";
      ctx.stroke();

      const yg = 0.095;

      // 3. Braços
      ctx.beginPath();
      ctx.moveTo(0.01, -0.17);
      ctx.lineTo(0.12, -0.12);
      ctx.lineTo(0.23, yg - 0.02);
      ctx.lineTo(0.21, yg + 0.02);
      ctx.lineTo(0.10, -0.06);
      ctx.lineTo(0.04, -0.12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-0.06, 0.16);
      ctx.lineTo(0.03, 0.16);
      ctx.lineTo(0.11, yg + 0.03);
      ctx.lineTo(0.08, yg - 0.01);
      ctx.lineTo(0.01, 0.11);
      ctx.lineTo(-0.06, 0.10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 4. Colete
      ctx.fillStyle = "#1E1815";
      ctx.beginPath();
      ctx.roundRect(-0.10, -0.10, 0.15, 0.20, 0.02);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#2D221D";
      ctx.fillRect(-0.07, -0.13, 0.09, 0.032);
      ctx.fillRect(-0.09, 0.085, 0.09, 0.032);
      for (const py of [-0.06, -0.01, 0.04]) {
        ctx.fillRect(-0.01, py, 0.045, 0.034);
      }

      // 5. Fuzil AK-47 apoiado no ombro direito
      ctx.fillStyle = "rgba(6, 9, 12, 0.35)";
      ctx.fillRect(-0.03, yg - 0.01, 0.44, 0.03);

      // Coronha de madeira
      ctx.fillStyle = "#5C361B";
      ctx.fillRect(-0.03, yg - 0.010, 0.08, 0.020);

      // Caixa da culatra
      ctx.fillStyle = "#222933";
      ctx.fillRect(0.05, yg - 0.011, 0.12, 0.024);

      // Carregador curvo
      ctx.fillStyle = "#63391A";
      ctx.beginPath();
      ctx.moveTo(0.09, yg - 0.011);
      ctx.lineTo(0.12, yg - 0.011);
      ctx.lineTo(0.145, yg - 0.038);
      ctx.lineTo(0.115, yg - 0.040);
      ctx.closePath();
      ctx.fill();

      // Guarda-mão de madeira
      ctx.fillStyle = "#6B3E1F";
      ctx.fillRect(0.17, yg - 0.011, 0.09, 0.022);

      // Cano de aço
      ctx.fillStyle = "#2A333E";
      ctx.fillRect(0.26, yg - 0.006, 0.12, 0.012);

      // Ponto de mira
      ctx.fillStyle = "#14181E";
      ctx.fillRect(0.38, yg - 0.010, 0.022, 0.020);

      // 6. Luvas
      ctx.fillStyle = "#141A21";
      ctx.beginPath();
      ctx.ellipse(0.10, yg + 0.012, 0.017, 0.012, 0.4, 0, 2 * Math.PI);
      ctx.ellipse(0.23, yg - 0.006, 0.018, 0.012, -0.3, 0, 2 * Math.PI);
      ctx.fill();

      // 7. Cabeça
      ctx.fillStyle = "#182028";
      ctx.beginPath();
      ctx.ellipse(-0.03, 0.015, 0.065, 0.055, 0, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = C.enemy;
      ctx.beginPath();
      ctx.ellipse(-0.04, 0.020, 0.085, 0.080, 0, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = "#0E1318";
      ctx.stroke();

      ctx.fillStyle = "#0E1318";
      ctx.beginPath();
      ctx.roundRect(0.005, -0.025, 0.024, 0.09, 0.004);
      ctx.fill();
    } else {
      ctx.strokeStyle = C.enemy; ctx.lineWidth = .06; ctx.globalAlpha = .6;
      ctx.beginPath();
      ctx.ellipse(-0.06, 0, 0.13, 0.22, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0.05, 0.08); ctx.lineTo(0.42, 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Operadores com Carabina M4, Supressor e Passadas
  state.ops.forEach((o, i) => {
    const col = C.op[i];
    if (!o.alive) { drawX(o.x, o.y, col, .6); return; }

    if (i === state.sel && state.status === "plan") {
      ctx.strokeStyle = col; ctx.lineWidth = .05; ctx.beginPath(); ctx.arc(o.x, o.y, .46, 0, 7); ctx.stroke();
    }

    if (state.status === "exec" && o.blocked) {
      ctx.strokeStyle = C.enemy; ctx.lineWidth = .05; ctx.setLineDash([.08, .08]);
      ctx.beginPath(); ctx.arc(o.x, o.y, .45, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(o.a);

    const isMoving = (state.status === "exec" || state.status === "replay") && o.moving;
    const legCadence = isMoving ? state.simTime * 14 : 0;
    const stride = isMoving ? Math.sin(legCadence) * 0.14 : 0;

    // 0. Sombra suave no solo
    ctx.fillStyle = "rgba(8, 12, 16, 0.45)";
    ctx.beginPath();
    ctx.ellipse(0.02, 0.02, 0.19, 0.21, 0, 0, 2 * Math.PI);
    ctx.fill();

    // 1. Botas tácticas (Passo dinâmico)
    ctx.fillStyle = "#0B0F13";
    ctx.beginPath();
    ctx.ellipse(-0.08 + stride, -0.13, 0.045, 0.024, 0.15, 0, 2 * Math.PI);
    ctx.ellipse(-0.15 - stride, 0.08, 0.045, 0.024, -0.1, 0, 2 * Math.PI);
    ctx.fill();

    // 2. Tronco anatómico (Postura perfilada/bladed: ombro esquerdo avança, ombro direito recua)
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(-0.15, 0.02);
    ctx.lineTo(-0.13, 0.17);  // Ombro direito (recuado para suporte)
    ctx.lineTo(-0.02, 0.16);  // Encaixe da coronha
    ctx.lineTo(0.08, 0.05);   // Peitoral direito
    ctx.lineTo(0.06, -0.10);  // Peitoral esquerdo
    ctx.lineTo(0.02, -0.18);  // Ombro esquerdo (projetado em frente)
    ctx.lineTo(-0.09, -0.17);
    ctx.lineTo(-0.14, -0.08);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.015;
    ctx.strokeStyle = "#0E1318";
    ctx.stroke();

    // Eixo da arma no ombro direito
    const yg = 0.095;

    // 3. Braços
    // Braço esquerdo: estendido em frente a cruzar o peito para segurar o guarda-mão
    ctx.beginPath();
    ctx.moveTo(0.01, -0.17);
    ctx.lineTo(0.12, -0.12);
    ctx.lineTo(0.23, yg - 0.02);
    ctx.lineTo(0.21, yg + 0.02);
    ctx.lineTo(0.10, -0.06);
    ctx.lineTo(0.04, -0.12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Braço direito: fletido junto à lateral direita, punho no gatilho
    ctx.beginPath();
    ctx.moveTo(-0.06, 0.16);
    ctx.lineTo(0.03, 0.16);
    ctx.lineTo(0.11, yg + 0.03);
    ctx.lineTo(0.08, yg - 0.01);
    ctx.lineTo(0.01, 0.11);
    ctx.lineTo(-0.06, 0.10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Colete balístico táctico (Plate Carrier e bolsas MOLLE)
    ctx.fillStyle = "#182029";
    ctx.beginPath();
    ctx.roundRect(-0.10, -0.10, 0.15, 0.20, 0.02);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#222C38";
    ctx.fillRect(-0.07, -0.13, 0.09, 0.032);
    ctx.fillRect(-0.09, 0.085, 0.09, 0.032);

    ctx.fillStyle = "#2B3746";
    for (const py of [-0.06, -0.01, 0.04]) {
      ctx.fillRect(-0.01, py, 0.045, 0.034);
    }

    // 5. Carabina M4 (Alinhada ao ombro direito: yg = 0.095)
    ctx.fillStyle = "rgba(6, 9, 12, 0.35)";
    ctx.fillRect(-0.03, yg - 0.01, 0.44, 0.03);

    // Coronha encaixada no ombro direito
    ctx.fillStyle = "#2B343E";
    ctx.fillRect(-0.03, yg - 0.009, 0.08, 0.018);
    ctx.fillStyle = "#141920";
    ctx.fillRect(-0.04, yg - 0.012, 0.012, 0.024);

    // Caixa da culatra (Receiver)
    ctx.fillStyle = "#1D242C";
    ctx.fillRect(0.05, yg - 0.011, 0.12, 0.022);

    // Carregador STANAG voltado para o centro/peito
    ctx.fillStyle = "#13181E";
    ctx.beginPath();
    ctx.moveTo(0.09, yg - 0.011);
    ctx.lineTo(0.12, yg - 0.011);
    ctx.lineTo(0.135, yg - 0.036);
    ctx.lineTo(0.105, yg - 0.036);
    ctx.closePath();
    ctx.fill();

    // Ótica Holográfica com lente azul
    ctx.fillStyle = "#0D1116";
    ctx.fillRect(0.08, yg - 0.007, 0.045, 0.014);
    ctx.fillStyle = "#38BDF8";
    ctx.fillRect(0.115, yg - 0.005, 0.006, 0.010);

    // Guarda-mão e ranhuras
    ctx.fillStyle = "#27313B";
    ctx.fillRect(0.17, yg - 0.010, 0.11, 0.020);
    ctx.fillStyle = "#1B222A";
    for (const rx of [0.19, 0.22, 0.25]) {
      ctx.fillRect(rx, yg - 0.010, 0.012, 0.020);
    }

    // Supressor
    ctx.fillStyle = "#141920";
    ctx.beginPath();
    ctx.roundRect(0.28, yg - 0.009, 0.14, 0.018, 0.003);
    ctx.fill();
    ctx.fillStyle = "#090C0F";
    ctx.fillRect(0.415, yg - 0.006, 0.012, 0.012);

    // 6. Luvas tácticas
    ctx.fillStyle = "#141A21";
    // Mão direita: empunhadura do gatilho (pistol grip)
    ctx.beginPath();
    ctx.ellipse(0.10, yg + 0.012, 0.017, 0.012, 0.4, 0, 2 * Math.PI);
    // Mão esquerda: envolve o guarda-mão à frente
    ctx.ellipse(0.23, yg - 0.006, 0.018, 0.012, -0.3, 0, 2 * Math.PI);
    ctx.fill();

    // 7. Cabeça e capacete com bochecha junto à coronha
    ctx.fillStyle = "#182028";
    ctx.beginPath();
    ctx.ellipse(-0.03, 0.015, 0.065, 0.055, 0, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(-0.04, 0.020, 0.085, 0.080, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#0E1318";
    ctx.stroke();

    // Auriculares ComTac
    ctx.fillStyle = "#13181E";
    ctx.fillRect(-0.06, -0.070, 0.036, 0.018);
    ctx.fillRect(-0.06, 0.092, 0.036, 0.018);

    // Óculos de proteção frontal
    ctx.fillStyle = "#0D1217";
    ctx.beginPath();
    ctx.roundRect(0.005, -0.025, 0.024, 0.09, 0.004);
    ctx.fill();
    ctx.fillStyle = "#1E2E3E";
    ctx.fillRect(0.017, -0.015, 0.006, 0.07);

    ctx.restore();
  });
}