import { DT, DOOR_SPEED, DIRS } from "../config.js";
import { state } from "../state.js";

// Dobradiça e lado de abertura sorteados de forma estável por mapa e posição (iguais ao recarregar)
function doorHash(d) {
  let h = 2166136261;
  for (const c of state.MAP.join("") + d.x + "," + d.y) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

// Forma de cada área (roomId): `depth` é a maior distância de uma casa dela até parede ou porta
// (corredor de 2 casas dá 1, salas dão 2 ou mais) e `long` = casas / (2·depth)², ~1 numa sala
// quadrada e bem maior num corredor comprido
export function areaShapes() {
  const dist = new Int16Array(state.N).fill(-1), q = [], depth = [], size = [];
  for (let k = 0; k < state.N; k++) if (state.roomId[k] < 0) { dist[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], x = k % state.W, y = (k / state.W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy, nk = ny * state.W + nx;
      if (nx < 0 || ny < 0 || nx >= state.W || ny >= state.H || dist[nk] >= 0) continue;
      dist[nk] = dist[k] + 1;
      q.push(nk);
    }
  }
  for (let k = 0; k < state.N; k++) {
    const r = state.roomId[k];
    if (r < 0) continue;
    depth[r] = Math.max(depth[r] || 0, dist[k]);
    size[r] = (size[r] || 0) + 1;
  }
  return depth.map((d, r) => ({ depth: d, long: size[r] / (2 * d) ** 2 }));
}

// Quanto o lado a é mais "sala" que o lado b: mais largo e, na mesma largura, mais compacto
const roomier = (a, b) => !a || !b ? (a ? 1 : b ? -1 : 0) : (a.depth - b.depth) || (b.long - a.long);

// Folha fechada vai da dobradiça (hx, hy) na direção (ux, uy); abre girando para o lado (nx, ny).
// Abre para o lado mais "sala" (nunca para dentro de um corredor); empate, lado sorteado.
// A dobradiça fica logo à frente da face da parede do lado da abertura, para a folha poder
// girar até encostar na parede vizinha
export function initDoor(d, shapes) {
  const h = doorHash(d), end = h & 1, f = .55;
  const area = (dx, dy) => shapes[state.roomId[(d.y + dy) * state.W + d.x + dx]];
  const c = d.vert ? roomier(area(1, 0), area(-1, 0)) : roomier(area(0, 1), area(0, -1));
  const side = c ? Math.sign(c) : h & 2 ? 1 : -1;
  if (d.vert) {
    d.hx = d.x + .5 + side * f; d.hy = d.y + end; d.ux = 0; d.uy = end ? -1 : 1; d.nx = side; d.ny = 0;
  } else {
    d.hx = d.x + end; d.hy = d.y + .5 + side * f; d.ux = end ? -1 : 1; d.uy = 0; d.nx = 0; d.ny = side;
  }
  d.swing = 0;
  d.settled = false;
}

// Direção da folha com abertura `swing` (0 = fechada, π = encostada na parede do outro lado)
export const leafDir = (d, swing) => [d.ux * Math.cos(swing) + d.nx * Math.sin(swing), d.uy * Math.cos(swing) + d.ny * Math.sin(swing)];

// A folha nessa abertura bate em parede, caixa ou inimigo
function leafHits(d, swing) {
  const [lx, ly] = leafDir(d, swing);
  for (let t = .3; t <= 1.001; t += .1) {
    const px = d.hx + lx * t, py = d.hy + ly * t;
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= state.W || y >= state.H || state.opaque[y * state.W + x]) return true;
    if (state.solid[y * state.W + x] === 2 && px - x > .14 && px - x < .86 && py - y > .14 && py - y < .86) return true;
    for (const e of state.enemies) if (e.alive && (e.x - px) ** 2 + (e.y - py) ** 2 < .09) return true;
  }
  return false;
}

// Porta aberta ainda girando: quem a abriu espera
export const doorBusy = d => d.open && !d.settled;

function advance(d, step) {
  const next = Math.min(Math.PI, d.swing + step);
  if (leafHits(d, next)) d.settled = true;
  else {
    d.swing = next;
    if (next >= Math.PI) d.settled = true;
  }
}

export function updateDoors() {
  for (const d of state.doors) if (doorBusy(d)) { advance(d, DOOR_SPEED * DT); state.uiDirty = true; }
}

// Leva a porta aberta direto até onde ela para (restauração de partidas salvas sem a abertura)
export function settleDoor(d) {
  while (doorBusy(d)) advance(d, DOOR_SPEED * DT);
}
