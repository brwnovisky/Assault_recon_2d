import { DIRS } from "./config.js";
import { state } from "./state.js";

export const adiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

// Paredes ocupam só a faixa central da casa (1/3), ligada às paredes e portas vizinhas
export const WALL_HALF = 1 / 6;
export const linksWall = (x, y) => x >= 0 && y >= 0 && x < state.W && y < state.H && (state.solid[y * state.W + x] === 1 || state.doorIdx[y * state.W + x] >= 0);

// Ponto (px, py) dentro de parede ou porta fechada
export function opaqueAt(px, py) {
  const x = Math.floor(px), y = Math.floor(py);
  if (x < 0 || y < 0 || x >= state.W || y >= state.H) return true;
  const k = y * state.W + x;
  if (!state.opaque[k]) return false;
  const fx = px - x - .5, fy = py - y - .5, inX = Math.abs(fx) <= WALL_HALF, inY = Math.abs(fy) <= WALL_HALF;
  const di = state.doorIdx[k];
  if (di >= 0) return state.doors[di].vert ? inX : inY;
  if (inX && inY) return true;
  if (inY && (fx < 0 ? linksWall(x - 1, y) : linksWall(x + 1, y))) return true;
  return inX && (fy < 0 ? linksWall(x, y - 1) : linksWall(x, y + 1));
}

export function los(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, n = Math.ceil(Math.hypot(dx, dy) * 10);
  let cover = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n, px = ax + dx * t, py = ay + dy * t;
    if (opaqueAt(px, py)) return -1;
    if (state.solid[(py | 0) * state.W + (px | 0)] === 2) cover = 1;
  }
  return cover;
}

// Distância até a primeira parede no ângulo a (DDA na grade; dentro de casa opaca, testa a faixa da parede)
export function rayDist(x, y, a, max) {
  const dx = Math.cos(a), dy = Math.sin(a), sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ix = Math.abs(1 / dx), iy = Math.abs(1 / dy);
  let cx = x | 0, cy = y | 0;
  let tx = dx ? (dx > 0 ? cx + 1 - x : x - cx) * ix : Infinity;
  let ty = dy ? (dy > 0 ? cy + 1 - y : y - cy) * iy : Infinity;
  for (;;) {
    let t;
    if (tx < ty) { t = tx; tx += ix; cx += sx; } else { t = ty; ty += iy; cy += sy; }
    if (t >= max) return max;
    if (cx < 0 || cy < 0 || cx >= state.W || cy >= state.H) return t;
    if (!state.opaque[cy * state.W + cx]) continue;
    const out = Math.min(tx, ty, max);
    for (let s = t; s < out; s += .04) if (opaqueAt(x + dx * s, y + dy * s)) return s;
  }
}

// `avoid`: casas (índices) que a rota não pode usar
export function bfs(sx, sy, tx, ty, avoid) {
  const s = sy * state.W + sx, t = ty * state.W + tx;
  if (state.solid[t] || s === t || (avoid && avoid.has(t))) return null;
  state.prev.fill(-2);
  state.prev[s] = -1;
  let h = 0, tl = 0;
  state.queue[tl++] = s;
  while (h < tl) {
    const k = state.queue[h++];
    if (k === t) break;
    const x = k % state.W, y = (k / state.W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.W || ny >= state.H) continue;
      const nk = ny * state.W + nx;
      if (state.solid[nk] || state.prev[nk] !== -2 || (avoid && avoid.has(nk))) continue;
      if (dx && dy && (
        state.solid[y * state.W + nx] ||
        state.solid[ny * state.W + x] ||
        state.doorIdx[y * state.W + nx] >= 0 ||
        state.doorIdx[ny * state.W + x] >= 0 ||
        state.doorIdx[nk] >= 0
      )) continue;
      state.prev[nk] = k;
      state.queue[tl++] = nk;
    }
  }
  if (state.prev[t] === -2) return null;
  const out = [];
  for (let k = t; k !== s; k = state.prev[k]) {
    out.push({ x: (k % state.W) + .5, y: ((k / state.W) | 0) + .5 });
  }
  return out.reverse();
}

export function pathLen(o) {
  let L = 0, px = o.x, py = o.y;
  for (const p of o.path) {
    L += Math.hypot(p.x - px, p.y - py);
    px = p.x;
    py = p.y;
  }
  return L;
}
