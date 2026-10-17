import { CLASSIC } from "./config.js";

export const state = {
  MAP: CLASSIC,
  mapId: null,
  W: 0,
  H: 0,
  N: 0,
  solid: null,
  opaque: null,
  doorIdx: null,
  prev: null,
  queue: null,
  roomId: null,
  doors: [],
  ops: [],
  enemies: [],
  tracers: [],
  lines: [],
  turn: 1,
  sel: 0,
  mode: "move",
  status: "plan", // plan, exec, freeze, replay, over
  simTime: 0,
  lastShot: -9,
  lastMove: 0,
  uiDirty: true,
  entries: [[], []],
  Z: 1,
  OX: 0,
  OY: 0,
  planSeq: 0,
  freezeT: 0,
  replaySpeed: 1,
  replayFrames: [],
  lastReplay: null,
  replaySavedState: null,
  replayIdx: 0,
  replayPaused: false,
  store: null
};

export function say(m) {
  state.lines.push(m);
  if (state.lines.length > 2) state.lines.shift();
  state.uiDirty = true;
}

export function setDoor(i, open) {
  const d = state.doors[i];
  if (!open) d.slide = 0;
  d.open = open;
  state.opaque[d.y * state.W + d.x] = open ? 0 : 1;
}
