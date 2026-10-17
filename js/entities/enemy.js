import { OP_RANGE, OP_HALF, DT, WATCH_SWITCH, THREAT_MEMORY } from "../config.js";
import { state } from "../state.js";
import { adiff, los } from "../pathfinding.js";
import { createUnit, roomOf } from "./unit.js";

export const createEnemy = (x, y) => createUnit(x, y, 2, -1);

// Sorteia a porta vigiada entre as da própria sala, trocando de porta quando houver outra
function pickDoor(e) {
  const r = roomOf(e), room = [];
  state.doors.forEach((d, i) => { if (d.rooms.includes(r)) room.push(i); });
  const others = room.filter(i => i !== e.watchDoor), pool = others.length ? others : room;
  if (pool.length) e.watchDoor = pool[(Math.random() * pool.length) | 0];
  e.watchLeft = WATCH_SWITCH;
}

// Inimigo alertado vigia uma porta sorteada da sala e troca de porta a cada WATCH_SWITCH s
export function alertEnemy(e) {
  e.alert = true;
  pickDoor(e);
}

export function updateWatch(e) {
  if (e.alert && (e.watchLeft -= DT) < 1e-9) pickDoor(e);
}

// Inimigo sob fogo lembra quem atirou nele (máscara de ids) por THREAT_MEMORY s desde o último disparo
export function takeFire(e, o) {
  if (!e.alert) alertEnemy(e);
  e.attackers |= 1 << o.id;
  e.threatLeft = THREAT_MEMORY;
}

// Atacantes vivos do inimigo, do mais próximo ao mais distante
export function attackersOf(e) {
  if (e.attackers && (e.threatLeft -= DT) < 1e-9) e.attackers = 0;
  return state.ops
    .filter(o => o.alive && e.attackers & 1 << o.id)
    .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
}

export function watchAngle(e) {
  const d = state.doors[e.watchDoor];
  return Math.atan2(d.y + .5 - e.y, d.x + .5 - e.x);
}

export function updateVis() {
  for (const e of state.enemies) {
    e.vis = false;
    if (!e.alive) continue;
    for (const o of state.ops) {
      if (!o.alive) continue;
      const dx = e.x - o.x, dy = e.y - o.y;
      if (dx * dx + dy * dy > OP_RANGE * OP_RANGE) continue;
      if (Math.abs(adiff(Math.atan2(dy, dx), o.a)) > OP_HALF) continue;
      if (los(o.x, o.y, e.x, e.y) < 0) continue;
      e.vis = e.seen = true;
      break;
    }
  }
}


