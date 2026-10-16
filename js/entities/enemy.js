import { OP_RANGE, OP_HALF, DT, WATCH_SWITCH } from "../config.js";
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


