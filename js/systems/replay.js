import { state, say } from "../state.js";
import { updateVis } from "../entities/enemy.js";

export function setSpeed(s) {
  state.slowMo = s;
  const b05 = document.getElementById("spd05");
  const b025 = document.getElementById("spd025");
  const ck = document.getElementById("clockSpeed");
  if (b05) b05.setAttribute("aria-pressed", String(s === 0.5));
  if (b025) b025.setAttribute("aria-pressed", String(s === 0.25));
  if (ck) ck.textContent = s === 0.5 ? "½×" : "¼×";
}

export function recordReplay() {
  state.replayFrames.push({
    simTime: state.simTime,
    lines: state.lines.slice(),
    doors: state.doors.map(d => d.open),
    ops: state.ops.map(o => ({ x: o.x, y: o.y, a: o.a, hp: o.hp, alive: o.alive, moving: o.moving, blocked: o.blocked })),
    enemies: state.enemies.map(e => ({ x: e.x, y: e.y, a: e.a, hp: e.hp, alive: e.alive, vis: e.vis, seen: e.seen })),
    tracers: state.tracers.map(t => ({ x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, t: t.t, en: t.en }))
  });
}

export function applyReplayFrame(f) {
  state.simTime = f.simTime;
  for (let i = 0; i < state.doors.length; i++) {
    state.doors[i].open = f.doors[i];
    state.opaque[state.doors[i].y * state.W + state.doors[i].x] = f.doors[i] ? 0 : 1;
  }
  for (let i = 0; i < state.ops.length; i++) {
    state.ops[i].x = f.ops[i].x; state.ops[i].y = f.ops[i].y; state.ops[i].a = f.ops[i].a;
    state.ops[i].hp = f.ops[i].hp; state.ops[i].alive = f.ops[i].alive;
    state.ops[i].moving = f.ops[i].moving; state.ops[i].blocked = f.ops[i].blocked;
  }
  for (let i = 0; i < state.enemies.length; i++) {
    state.enemies[i].x = f.enemies[i].x; state.enemies[i].y = f.enemies[i].y; state.enemies[i].a = f.enemies[i].a;
    state.enemies[i].hp = f.enemies[i].hp; state.enemies[i].alive = f.enemies[i].alive;
    state.enemies[i].vis = f.enemies[i].vis; state.enemies[i].seen = f.enemies[i].seen;
  }
  state.tracers = f.tracers.map(t => ({ ...t }));
  state.lines = f.lines.slice();
}

export function startReplay(req) {
  if (state.status !== "plan" && state.status !== "over") return;
  if (!state.lastReplay || !state.lastReplay.length) {
    say("Nenhum replay gravado neste turno.");
    return;
  }
  state.replaySavedState = {
    status: state.status, turn: state.turn, simTime: state.simTime, lines: state.lines.slice(),
    doors: state.doors.map(d => d.open),
    ops: state.ops.map(o => ({ x: o.x, y: o.y, a: o.a, want: o.want, hp: o.hp, alive: o.alive, moving: o.moving, blocked: o.blocked, blockedBy: o.blockedBy })),
    enemies: state.enemies.map(e => ({ x: e.x, y: e.y, a: e.a, want: e.want, base: e.base, hp: e.hp, alive: e.alive, alert: e.alert, heard: e.heard, seen: e.seen, vis: e.vis })),
    tracers: state.tracers.map(t => ({ ...t }))
  };
  state.status = "replay";
  state.replayIdx = 0;
  state.replayHoldEnd = 0;
  document.getElementById("over").hidden = true;
  applyReplayFrame(state.lastReplay[0]);
  say("Assistindo replay do turno...");
  state.uiDirty = true;
  req();
}

export function endReplay(req) {
  if (!state.replaySavedState) return;
  const s = state.replaySavedState;
  state.status = s.status;
  state.simTime = s.simTime;
  state.lines = s.lines.slice();
  for (let i = 0; i < state.doors.length; i++) {
    state.doors[i].open = s.doors[i];
    state.opaque[state.doors[i].y * state.W + state.doors[i].x] = s.doors[i] ? 0 : 1;
  }
  for (let i = 0; i < state.ops.length; i++) Object.assign(state.ops[i], s.ops[i]);
  for (let i = 0; i < state.enemies.length; i++) Object.assign(state.enemies[i], s.enemies[i]);
  state.tracers = s.tracers.map(t => ({ ...t }));
  if (state.status === "over") document.getElementById("over").hidden = false;
  state.replaySavedState = null;
  updateVis();
  say("Fim do replay.");
  state.uiDirty = true;
  req();
}


