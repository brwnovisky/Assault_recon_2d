import { DT, SPEED, TURN, OP_HALF, OP_RANGE, EN_HALF, EN_RANGE, MOVE_TIME, NAMES } from "../config.js";
import { state, say } from "../state.js";
import { adiff, los, blocker } from "../pathfinding.js";
import { updateVis } from "../entities/enemy.js";

export function shoot(u, t, d) {
  const c = los(u.x, u.y, t.x, t.y);
  if (c < 0) return;
  let p = 0.85 - d * 0.035;
  if (c) p *= 0.5;
  if (u.moving) p *= 0.75;
  const hit = Math.random() < p, j = hit ? 0 : 0.9;
  state.tracers.push({
    x1: u.x, y1: u.y,
    x2: t.x + (Math.random() - .5) * j,
    y2: t.y + (Math.random() - .5) * j,
    t: 0.14, en: u.id < 0
  });
  u.cd = u.id < 0 ? 0.55 : 0.4;
  state.lastShot = state.simTime;

  for (const e of state.enemies) {
    if (!e.alive || e === u) continue;
    const dx = u.x - e.x, dy = u.y - e.y;
    if (dx * dx + dy * dy < 64) {
      e.alert = true;
      if (!e.target) e.heard = Math.atan2(dy, dx);
    }
  }

  if (!hit) return;
  t.hp--;
  if (t.hp <= 0) {
    t.alive = false; t.target = null; t.seen = true;
    say(u.id >= 0 ? `${NAMES[u.id]} neutralizou um alvo.` : `${NAMES[t.id]} foi abatido.`);
  } else if (t.id >= 0) {
    say(`${NAMES[t.id]} foi ferido.`);
  }
  state.uiDirty = true;
}

export function fight(u, foes, half, range, omni, react) {
  let best = null, bd = range;
  for (const f of foes) {
    if (!f.alive) continue;
    const dx = f.x - u.x, dy = f.y - u.y, d = Math.hypot(dx, dy);
    if (d > bd) continue;
    if (!omni && Math.abs(adiff(Math.atan2(dy, dx), u.a)) > half) continue;
    if (los(u.x, u.y, f.x, f.y) < 0) continue;
    best = f; bd = d;
  }
  if (best !== u.target) { u.target = best; u.react = react; }
  u.cd -= DT;
  if (best) {
    if (u.id < 0) u.alert = true;
    const ang = Math.atan2(best.y - u.y, best.x - u.x);
    u.want = ang;
    u.react -= DT;
    if (u.react <= 0 && u.cd <= 0 && Math.abs(adiff(ang, u.a)) < 0.2) shoot(u, best, bd);
  }
  const d = adiff(u.want, u.a), m = TURN * DT;
  u.a += Math.abs(d) <= m ? d : Math.sign(d) * m;
}

export function step(callbacks) {
  state.simTime += DT;
  for (const o of state.ops) {
    if (!o.alive) continue;
    o.moving = false; o.want = o.a; o.waiting = false; o.blocked = false;
    const h = o.holds.find(h => !h.done && h.at === o.pi);
    if (h) {
      const y = state.ops[h.op];
      if (!y.alive || y.pi >= h.ti) {
        h.done = true;
        if (y.alive) say(`${NAMES[o.id]} recebeu o sinal de ${NAMES[y.id]}.`);
      } else {
        o.waiting = true;
      }
    }
    if (!o.waiting && !o.stopped && o.pi < o.path.length) {
      let sp = SPEED * DT * (o.target ? 0.7 : 1);
      while (sp > 1e-9 && o.pi < o.path.length) {
        const p = o.path[o.pi], k = ((p.y | 0) * state.W) + (p.x | 0);
        if (o.res !== k) {
          if (state.simTime >= MOVE_TIME) { o.stopped = true; break; }
          const by = blocker(o, k);
          if (by) {
            o.blocked = true; o.want = Math.atan2(p.y - o.y, p.x - o.x);
            if (o.blockedBy !== by.id) {
              o.blockedBy = by.id; say(`${NAMES[o.id]} bloqueado por ${NAMES[by.id]}.`);
            }
            break;
          }
          o.res = k; o.blockedBy = -1;
        }
        const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy), di = state.doorIdx[k];
        if (di >= 0 && !state.doors[di].open && d < 1.05) {
          state.doors[di].open = true;
          state.opaque[k] = 0;
          say(`${NAMES[o.id]} abriu a porta.`);
        }
        o.moving = true;
        if (d > 1e-4) o.want = Math.atan2(dy, dx);
        if (d <= sp + 1e-9) {
          o.x = p.x; o.y = p.y; o.pi++; o.cur = k; o.res = -1;
          sp = Math.max(0, sp - d);
          if (o.holds.some(h => !h.done && h.at === o.pi)) break;
        } else {
          o.x += dx / d * sp; o.y += dy / d * sp; sp = 0;
        }
      }
      if (!o.moving && !o.blocked && o.aim) o.want = Math.atan2(o.aim.y - o.y, o.aim.x - o.x);
    } else if (o.aim && !o.waiting) {
      o.want = Math.atan2(o.aim.y - o.y, o.aim.x - o.x);
    }
  }

  for (const o of state.ops) if (o.alive) fight(o, state.enemies, OP_HALF, OP_RANGE, false, 0.3);
  for (const e of state.enemies) if (e.alive) {
    e.want = e.heard != null ? e.heard : e.base;
    fight(e, state.ops, EN_HALF, EN_RANGE, e.alert, e.alert ? 0.45 : 0.7);
  }

  for (let i = state.tracers.length - 1; i >= 0; i--) {
    state.tracers[i].t -= DT;
    if (state.tracers[i].t <= 0) state.tracers.splice(i, 1);
  }
  updateVis();

  const liveE = state.enemies.some(e => e.alive), liveO = state.ops.some(o => o.alive);
  if (!liveE) return callbacks.finish(true);
  if (!liveO) return callbacks.finish(false);
  if (state.ops.some(o => o.alive && o.moving)) state.lastMove = state.simTime;
  if (state.simTime >= MOVE_TIME - 1e-9) return callbacks.freezeTurn(true);
  const done = state.ops.every(o => !o.alive || o.stopped || o.pi >= o.path.length);
  const stalled = state.simTime - state.lastMove > 1;
  const quiet = !state.ops.some(u => u.alive && u.target) && !state.enemies.some(u => u.alive && u.target);
  if ((done || stalled) && quiet && state.simTime - state.lastShot > 0.8 && state.simTime > 0.5) callbacks.freezeTurn(false);
}


