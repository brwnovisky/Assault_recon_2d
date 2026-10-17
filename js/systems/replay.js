import { REPLAY_SPEEDS } from "../config.js";
import { state, say, setDoor } from "../state.js";
import { updateVis } from "../entities/enemy.js";

const FRAME_OPS = ["x", "y", "a", "hp", "alive", "moving", "blocked"];
const FRAME_ENEMIES = ["x", "y", "a", "hp", "alive", "vis", "seen"];
const SAVED_OPS = [...FRAME_OPS, "want", "blockedBy"];
const SAVED_ENEMIES = [...FRAME_ENEMIES, "want", "base", "alert", "watchDoor", "watchLeft", "attackers", "threatLeft"];

const pick = (u, keys) => Object.fromEntries(keys.map(k => [k, u[k]]));

function snapshot(opKeys, enemyKeys) {
  return {
    simTime: state.simTime,
    lines: state.lines.slice(),
    doors: state.doors.map(d => d.open),
    ops: state.ops.map(o => pick(o, opKeys)),
    enemies: state.enemies.map(e => pick(e, enemyKeys)),
    tracers: state.tracers.map(t => ({ ...t }))
  };
}

function applySnapshot(s) {
  state.simTime = s.simTime;
  state.lines = s.lines.slice();
  s.doors.forEach((open, i) => setDoor(i, open));
  s.ops.forEach((o, i) => Object.assign(state.ops[i], o));
  s.enemies.forEach((e, i) => Object.assign(state.enemies[i], e));
  state.tracers = s.tracers.map(t => ({ ...t }));
  state.uiDirty = true;
}

export function cycleSpeed() {
  state.replaySpeed = REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(state.replaySpeed) + 1) % REPLAY_SPEEDS.length];
  state.uiDirty = true;
}

export function recordReplay() {
  state.replayFrames.push(snapshot(FRAME_OPS, FRAME_ENEMIES));
}

export function startReplay(req) {
  if (state.status !== "plan" && state.status !== "over") return;
  if (!state.lastReplay || !state.lastReplay.length) {
    say("Nenhum replay gravado neste turno.");
    return;
  }
  state.replaySavedState = { status: state.status, ...snapshot(SAVED_OPS, SAVED_ENEMIES) };
  state.status = "replay";
  state.replayIdx = 0;
  state.replayPaused = false;
  applySnapshot(state.lastReplay[0]);
  say("Assistindo replay do turno...");
  req();
}

export function stepReplay() {
  if (state.replayIdx < state.lastReplay.length - 1) {
    state.replayIdx++;
    applySnapshot(state.lastReplay[state.replayIdx]);
  } else {
    state.replayPaused = true;
    state.uiDirty = true;
  }
}

export function toggleReplay() {
  state.replayPaused = !state.replayPaused;
  if (!state.replayPaused && state.replayIdx >= state.lastReplay.length - 1) {
    state.replayIdx = 0; // Se estava no fim e deu play, recomeça
  }
  state.uiDirty = true;
}

export function seekReplay(time) {
  state.replayPaused = true;
  let bestIdx = 0, minDist = 1e9;
  for (let i = 0; i < state.lastReplay.length; i++) {
    const d = Math.abs(state.lastReplay[i].simTime - time);
    if (d < minDist) { minDist = d; bestIdx = i; }
  }
  state.replayIdx = bestIdx;
  applySnapshot(state.lastReplay[bestIdx]);
}

export function endReplay(req) {
  if (!state.replaySavedState) return;
  applySnapshot(state.replaySavedState);
  state.status = state.replaySavedState.status;
  state.replaySavedState = null;
  updateVis();
  say("Fim do replay.");
  req();
}
