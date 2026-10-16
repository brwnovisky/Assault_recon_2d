import { state } from "../state.js";

export function createUnit(x, y, hp, id) {
  return {
    x: x + .5, y: y + .5, a: 0, want: 0, base: 0,
    hp, max: hp, alive: true, id,
    target: null, react: 0, cd: 0, moving: false,
    path: [], acts: [], aims: [], pi: 0, holds: [],
    waiting: false, lock: 0, lockFrom: -1, lockTo: -1, planAt: Infinity,
    alert: false, watchDoor: -1, watchLeft: 0, seen: false, vis: false
  };
}

export const roomOf = u => state.roomId[(u.y | 0) * state.W + (u.x | 0)];

export function faceDoor(u) {
  const r = roomOf(u);
  let best = null, bd = 1e9;
  for (const d of state.doors) {
    const dd = (d.x + .5 - u.x) ** 2 + (d.y + .5 - u.y) ** 2 + (d.rooms.includes(r) ? 0 : 1e4);
    if (dd < bd) { bd = dd; best = d; }
  }
  if (best) u.a = u.want = u.base = Math.atan2(best.y + .5 - u.y, best.x + .5 - u.x);
}
