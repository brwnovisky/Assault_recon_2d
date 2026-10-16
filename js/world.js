import { DIRS } from "./config.js";
import { state } from "./state.js";
import { createOperator } from "./entities/operator.js";
import { createEnemy, updateVis } from "./entities/enemy.js";
import { faceDoor } from "./entities/unit.js";

export function buildWorld() {
  state.H = state.MAP.length;
  state.W = state.MAP[0].length;
  state.N = state.W * state.H;
  state.solid = new Uint8Array(state.N);
  state.opaque = new Uint8Array(state.N);
  state.doorIdx = new Int16Array(state.N).fill(-1);
  state.prev = new Int32Array(state.N);
  state.queue = new Int32Array(state.N);
  state.roomId = new Int16Array(state.N).fill(-1);
  state.doors = [];
  state.ops = [];
  state.enemies = [];
  state.tracers = [];
  state.lines = [];
  state.turn = 1;
  state.sel = 0;
  state.mode = null;
  state.planSeq = 0;
  state.status = "plan";
  state.entries = [[], []];

  for (let y = 0; y < state.H; y++) for (let x = 0; x < state.W; x++) {
    const c = state.MAP[y][x], k = y * state.W + x;
    if (c === "#" || c === "O") { state.solid[k] = 1; state.opaque[k] = 1; }
    else if (c === "X") state.solid[k] = 2;
    else if (c === "D") {
      state.doorIdx[k] = state.doors.length;
      state.doors.push({ x, y, open: false, vert: state.MAP[y - 1][x] === "#" });
      state.opaque[k] = 1;
    }
    else if (c === "S") { state.ops.push(createOperator(x, y, state.ops.length)); state.entries[0].push({ x, y }); }
    else if (c === "T") state.entries[1].push({ x, y });
    else if (c === "E") state.enemies.push(createEnemy(x, y));
  }

  let rc = 0;
  for (let k = 0; k < state.N; k++) {
    if (state.solid[k] === 1 || state.doorIdx[k] >= 0 || state.roomId[k] >= 0) continue;
    let h = 0, t = 0;
    state.queue[t++] = k;
    state.roomId[k] = rc;
    while (h < t) {
      const c = state.queue[h++], cx = c % state.W, cy = (c / state.W) | 0;
      for (let i = 0; i < 4; i++) {
        const nk = (cy + DIRS[i][1]) * state.W + cx + DIRS[i][0];
        if (state.solid[nk] === 1 || state.doorIdx[nk] >= 0 || state.roomId[nk] >= 0) continue;
        state.roomId[nk] = rc;
        state.queue[t++] = nk;
      }
    }
    rc++;
  }

  for (const d of state.doors) {
    d.rooms = [];
    for (let i = 0; i < 4; i++) {
      const r = state.roomId[(d.y + DIRS[i][1]) * state.W + d.x + DIRS[i][0]];
      if (r >= 0) d.rooms.push(r);
    }
  }

  for (const u of state.ops.concat(state.enemies)) faceDoor(u);
  updateVis();
}
