import { DT, SPEED, MOVE_TIME, NAMES } from "../config.js";
import { state, say, setDoor } from "../state.js";
import { byPriority, activeAim, aimAngle } from "../entities/operator.js";

function blocker(o, k) {
  const cx = o.cur % state.W, cy = (o.cur / state.W) | 0;
  const nx = k % state.W, ny = (k / state.W) | 0;
  const diag = cx !== nx && cy !== ny;
  const k1 = cy * state.W + nx, k2 = ny * state.W + cx;

  for (const u of state.ops) {
    if (u === o || !u.alive) continue;

    // Impede a travessia na mesma diagonal em sentidos opostos
    if (diag && ((u.cur === k1 && u.res === k2) || (u.cur === k2 && u.res === k1))) return u;

    // Casa já reservada por outro operador
    if (u.res === k) return u;
    // Aliado parado na casa (não está saindo dela)
    if (u.cur === k && u.res < 0) return u;
  }
  return null;
}

export function moveOperators() {
  for (const o of state.ops.slice().sort(byPriority)) {
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
          setDoor(di, true);
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
    }
    // A mira vigente vale andando, bloqueado ou esperando; o combate (depois) tem prioridade.
    // Com parede na linha, o operador trava na quina até a linha abrir
    const aim = activeAim(o);
    if (aim) o.want = aimAngle(o, aim);
  }
}
