import { DIRS } from "./config.js";
import { state } from "./state.js";

export const adiff = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

export function los(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, n = Math.ceil(Math.hypot(dx, dy) * 4);
  let cover = 0, last = -1;
  for (let i = 1; i < n; i++) {
    const t = i / n, k = ((ay + dy * t) | 0) * state.W + ((ax + dx * t) | 0);
    if (k === last) continue;
    last = k;
    if (state.opaque[k]) return -1;
    if (state.solid[k] === 2) cover = 1;
  }
  return cover;
}

export function bfs(sx, sy, tx, ty) {
  const s = sy * state.W + sx, t = ty * state.W + tx;
  if (state.solid[t] || s === t) return null;
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
      if (state.solid[nk] || state.prev[nk] !== -2) continue;
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

export function blocker(o, k) {
  const cx = o.cur % state.W, cy = (o.cur / state.W) | 0;
  const nx = k % state.W, ny = (k / state.W) | 0;
  const diag = cx !== nx && cy !== ny;
  const k1 = cy * state.W + nx, k2 = ny * state.W + cx;
  for (const u of state.ops) {
    if (u === o || !u.alive) continue;
    if (u.cur === k || u.res === k) return u;
    if (diag && ((u.cur === k1 && u.res === k2) || (u.cur === k2 && u.res === k1))) return u;
  }
  return null;
}


