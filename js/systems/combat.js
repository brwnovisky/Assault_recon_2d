import { DT, TURN, OP_HALF, OP_RANGE, EN_HALF, EN_RANGE, NAMES, TRACER_LIFE } from "../config.js";
import { state, say } from "../state.js";
import { adiff, los } from "../pathfinding.js";
import { alertEnemy, updateWatch, watchAngle, takeFire, attackersOf } from "../entities/enemy.js";

function shoot(u, t, d) {
  const c = los(u.x, u.y, t.x, t.y);
  if (c < 0) return;
  let p = 0.85 - d * 0.035;
  if (c) p *= 0.5;
  if (u.moving) p *= 0.75;
  const hit = Math.random() < p, j = hit ? 0 : 0.9;
  state.tracers.push({
    tx: t.x + (Math.random() - .5) * j,
    ty: t.y + (Math.random() - .5) * j,
    t: TRACER_LIFE, en: u.id < 0, i: u.id < 0 ? state.enemies.indexOf(u) : u.id
  });
  u.cd = u.id < 0 ? 0.55 : 0.4;
  state.lastShot = state.simTime;

  for (const e of state.enemies) {
    if (!e.alive || e === u) continue;
    const dx = u.x - e.x, dy = u.y - e.y;
    if (!e.alert && dx * dx + dy * dy < 64) alertEnemy(e);
  }

  if (u.id >= 0 && t.alive) takeFire(t, u);

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

function fight(u, foes, half, range, react) {
  let best = null, bd = range;
  for (const f of foes) {
    if (!f.alive) continue;
    const dx = f.x - u.x, dy = f.y - u.y, d = Math.hypot(dx, dy);
    if (d > bd) continue;
    if (Math.abs(adiff(Math.atan2(dy, dx), u.a)) > half) continue;
    if (los(u.x, u.y, f.x, f.y) < 0) continue;
    best = f; bd = d;
  }
  if (best !== u.target) { u.target = best; u.react = react; }
  u.cd -= DT;
  if (best) {
    if (u.id < 0 && !u.alert) alertEnemy(u);
    const ang = Math.atan2(best.y - u.y, best.x - u.x);
    u.want = ang;
    u.react -= DT;
    if (u.react <= 0 && u.cd <= 0 && Math.abs(adiff(ang, u.a)) < 0.2) shoot(u, best, bd);
  }
  const d = adiff(u.want, u.a), m = TURN * DT;
  u.a += Math.abs(d) <= m ? d : Math.sign(d) * m;
}

export function resolveCombat() {
  for (const o of state.ops) if (o.alive) fight(o, state.enemies, OP_HALF, OP_RANGE, 0.3);
  for (const e of state.enemies) if (e.alive) {
    updateWatch(e);
    // Sob fogo, o inimigo vira para o atacante mais próximo e só engaja atacantes
    const atk = attackersOf(e);
    e.want = atk.length ? Math.atan2(atk[0].y - e.y, atk[0].x - e.x) : e.watchDoor >= 0 ? watchAngle(e) : e.base;
    fight(e, atk.length ? atk : state.ops, EN_HALF, EN_RANGE, e.alert ? 0.45 : 0.7);
  }

  for (let i = state.tracers.length - 1; i >= 0; i--) {
    state.tracers[i].t -= DT;
    if (state.tracers[i].t <= 0) state.tracers.splice(i, 1);
  }
}
