import { DT, MOVE_TIME } from "../config.js";
import { state } from "../state.js";
import { updateVis } from "../entities/enemy.js";
import { adiff } from "../pathfinding.js";
import { moveOperators } from "./movement.js";
import { resolveCombat } from "./combat.js";

export function step(callbacks) {
  state.simTime += DT;
  moveOperators();
  resolveCombat();
  updateVis();

  const liveE = state.enemies.some(e => e.alive), liveO = state.ops.some(o => o.alive);
  if (!liveE) return callbacks.finish(true);
  if (!liveO) return callbacks.finish(false);
  if (state.ops.some(o => o.alive && o.moving)) state.lastMove = state.simTime;
  if (state.simTime >= MOVE_TIME - 1e-9) return callbacks.freezeTurn(true);
  // Concluído: rota terminada e operador já virado para onde deve olhar (mira vigente)
  const done = state.ops.every(o => !o.alive || ((o.stopped || o.pi >= o.path.length) && Math.abs(adiff(o.want, o.a)) < 1e-6));
  const stalled = state.simTime - state.lastMove > 1;
  const quiet = !state.ops.some(u => u.alive && u.target) && !state.enemies.some(u => u.alive && u.target);
  if ((done || stalled) && quiet && state.simTime - state.lastShot > 0.8 && state.simTime > 0.5) callbacks.freezeTurn(false);
}
