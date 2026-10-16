export function rng(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  let a = h >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function generate(p) {
  const r = rng(p.seed), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const shuffle = a => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const gw = p.w, gh = p.h, g = Array.from({ length: gh }, () => Array(gw).fill("#"));
  const cw = Math.min(3, Math.max(2, p.corrW | 0 || 2));
  const MIN_PARTS_2ND = 6;

  const border = [];
  let rx0 = 0, ry0 = 0, rx1 = gw - 1, ry1 = gh - 1;
  if (p.corridors > 0) {
    for (const side of ["top", "left", "bottom", "right"]) {
      if (r() * 200 >= p.corridors) continue;
      let nx0 = rx0, ny0 = ry0, nx1 = rx1, ny1 = ry1;
      if (side === "top") ny0 = cw + 1;
      else if (side === "bottom") ny1 = gh - 2 - cw;
      else if (side === "left") nx0 = cw + 1;
      else nx1 = gw - 2 - cw;
      const bw = nx1 - nx0, bh = ny1 - ny0;
      if (Math.min(bw, bh) < 4 || Math.max(bw, bh) < 8) continue;
      rx0 = nx0; ry0 = ny0; rx1 = nx1; ry1 = ny1; border.push(side);
    }
  }

  const leaves = [{ x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 }], splits = [];
  while (leaves.length < p.rooms) {
    let i = -1, ba = 0;
    leaves.forEach((l, k) => {
      if ((l.w >= 8 || l.h >= 8) && l.w * l.h > ba) { ba = l.w * l.h; i = k; }
    });
    if (i < 0) break;
    const l = leaves[i], v = l.w >= 8 && (l.h < 8 || l.w > l.h * 1.25 || (l.h <= l.w * 1.25 && r() < .5));
    const len = v ? l.w : l.h, cor = p.corridors > 0 && len >= 9 + cw && r() * 100 < p.corridors, gap = cor ? cw + 1 : 0;
    if (v) {
      const s = ri(4, l.w - 4 - gap);
      leaves.splice(i, 1, { x: l.x, y: l.y, w: s, h: l.h }, { x: l.x + s + gap, y: l.y, w: l.w - s - gap, h: l.h });
      splits.push({ v: 1, c: l.x + s, a: l.y + 1, b: l.y + l.h - 1, cor, e0: l.y, e1: l.y + l.h });
    } else {
      const s = ri(4, l.h - 4 - gap);
      leaves.splice(i, 1, { x: l.x, y: l.y, w: l.w, h: s }, { x: l.x, y: l.y + s + gap, w: l.w, h: l.h - s - gap });
      splits.push({ v: 0, c: l.y + s, a: l.x + 1, b: l.x + l.w - 1, cor, e0: l.x, e1: l.x + l.w });
    }
  }

  const cells = l => {
    const o = [];
    for (let y = l.y + 1; y < l.y + l.h; y++) for (let x = l.x + 1; x < l.x + l.w; x++) o.push([x, y]);
    return o;
  };
  for (const l of leaves) for (const [x, y] of cells(l)) g[y][x] = ".";

  const isCor = new Uint8Array(gw * gh);
  for (const side of border) for (let k = 1; k <= cw; k++) {
    if (side === "top" || side === "bottom") {
      const y = side === "top" ? k : gh - 1 - k;
      for (let x = 1; x < gw - 1; x++) { g[y][x] = "."; isCor[y * gw + x] = 1; }
    } else {
      const x = side === "left" ? k : gw - 1 - k;
      for (let y = 1; y < gh - 1; y++) { g[y][x] = "."; isCor[y * gw + x] = 1; }
    }
  }

  for (const s of splits) if (s.cor) for (let t = s.a; t <= s.b; t++) for (let k = 1; k <= cw; k++) {
    const x = s.v ? s.c + k : t, y = s.v ? t : s.c + k; g[y][x] = "."; isCor[y * gw + x] = 1;
  }

  for (const s of splits) if (s.cor) for (const [e, dir] of [[s.e0, -1], [s.e1, 1]]) {
    let ok = true;
    for (let k = 1; k <= cw && ok; k++) {
      const x = s.v ? s.c + k : e + dir, y = s.v ? e + dir : s.c + k;
      ok = x >= 0 && y >= 0 && x < gw && y < gh && isCor[y * gw + x] === 1;
    }
    if (ok) for (let k = 1; k <= cw; k++) {
      const x = s.v ? s.c + k : e, y = s.v ? e : s.c + k; g[y][x] = "."; isCor[y * gw + x] = 1;
    }
  }

  const isF = (x, y) => g[y][x] === ".";
  const canDoor = (x, y) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1 && g[y][x] === "#" && (
    (isF(x - 1, y) && isF(x + 1, y) && g[y - 1][x] === "#" && g[y + 1][x] === "#") ||
    (isF(x, y - 1) && isF(x, y + 1) && g[y][x - 1] === "#" && g[y][x + 1] === "#")
  );

  const doorOn = (s, line) => {
    const c = [];
    for (let t = s.a; t <= s.b; t++) {
      const x = s.v ? line : t, y = s.v ? t : line;
      if (canDoor(x, y)) c.push([x, y]);
    }
    if (c.length) {
      const [x, y] = c[ri(0, c.length - 1)];
      g[y][x] = "D";
    }
  };

  for (const s of splits) { doorOn(s, s.c); if (s.cor) doorOn(s, s.c + cw + 1); }
  for (const side of border) {
    const v = side === "left" || side === "right";
    const line = side === "top" || side === "left" ? cw + 1 : side === "bottom" ? gh - 2 - cw : gw - 2 - cw;
    const s = { v, a: 1, b: v ? gh - 2 : gw - 2 };
    doorOn(s, line);
    if ((v ? gh : gw) >= 18) doorOn(s, line);
  }

  const ex = [];
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) if (canDoor(x, y)) ex.push([x, y]);
  let added = 0;
  for (const [x, y] of shuffle(ex)) {
    if (added >= p.extra) break;
    if (canDoor(x, y)) { g[y][x] = "D"; added++; }
  }

  const near = (x, y, ch) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy][x + dx] === ch) return true;
    return false;
  };

  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], reg = new Int16Array(gw * gh).fill(-1), regs = [];
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    if (g[y][x] !== "." || reg[y * gw + x] >= 0) continue;
    const id = regs.length, list = [], st = [[x, y]];
    reg[y * gw + x] = id;
    while (st.length) {
      const c = st.pop(); list.push(c);
      for (const [dx, dy] of D4) {
        const nx = c[0] + dx, ny = c[1] + dy;
        if (g[ny][nx] !== "." || reg[ny * gw + nx] >= 0) continue;
        reg[ny * gw + nx] = id; st.push([nx, ny]);
      }
    }
    regs.push(list);
  }

  const taken = new Set(), key = c => c[1] * gw + c[0], dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const isInnerWall = (x, y) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1 && (g[y][x] === "#" || g[y][x] === "D");
  const touchesWall = c => D4.some(([dx, dy]) => isInnerWall(c[0] + dx, c[1] + dy));

  const entryAt = corner => {
    let anchor = null;
    for (const list of regs) for (const c of list) {
      if (!taken.has(key(c)) && (!anchor || dd(c, corner) < dd(anchor, corner))) anchor = c;
    }
    if (!anchor) return null;
    const id = reg[key(anchor)];
    const steps = new Map([[key(anchor), 0]]), all = [anchor];
    for (let h = 0; h < all.length; h++) {
      const c = all[h], s = steps.get(key(c));
      for (const [dx, dy] of D4) {
        const n = [c[0] + dx, c[1] + dy], k = key(n);
        if (reg[k] !== id || steps.has(k) || taken.has(k)) continue;
        steps.set(k, s + 1); all.push(n);
      }
    }
    const st = stack(all, steps); if (st) return { slots: st, reg: id };
    for (const R of [6, 10, 16, 1e9]) {
      const r = fila(all.filter(c => steps.get(key(c)) <= R), all, anchor);
      if (r) return { slots: r, reg: id };
    }
    const near4 = all.slice().sort((a, b) => dd(a, anchor) - dd(b, anchor)).slice(0, 4);
    return near4.length === 4 ? { slots: near4, reg: id } : null;
  };

  function stack(all, steps) {
    const inReg = new Set(all.map(key));
    let door = null, front = null, bs = 1e9;
    for (const c of all) for (const [dx, dy] of D4) {
      const x = c[0] + dx, y = c[1] + dy;
      if (g[y][x] === "D" && steps.get(key(c)) < bs) { bs = steps.get(key(c)); door = [x, y]; front = c; }
    }
    if (!door) return null;
    const nrm = [door[0] - front[0], door[1] - front[1]];
    const ax = nrm[0] ? [0, 1] : [1, 0];
    const line = c => (ax[0] ? c[1] === front[1] : c[0] === front[0]) && isInnerWall(c[0] + nrm[0], c[1] + nrm[1]);
    const sides = [1, -1].map(s => {
      let n = 0, c = front;
      while (n < 4) { c = [c[0] + ax[0] * s, c[1] + ax[1] * s]; if (!inReg.has(key(c)) || !line(c)) break; n++; }
      const f = [front[0] + ax[0] * s, front[1] + ax[1] * s];
      return { n, f, d: inReg.has(key(f)) ? steps.get(key(f)) : 1e9 };
    }).sort((a, b) => b.n - a.n || a.d - b.d);
    if (!sides[0].n) return null;
    const slots = [sides[0].f], used = new Set([key(sides[0].f), key(front)]);
    while (slots.length < 4) {
      let pick = null, ps = 1e9;
      const last = slots[slots.length - 1];
      for (const s of slots) for (const [dx, dy] of D4) {
        const n = [s[0] + dx, s[1] + dy], k = key(n);
        if (!inReg.has(k) || used.has(k)) continue;
        const sc = (line(n) ? 0 : touchesWall(n) ? 100 : 200) + (s === last ? 0 : 50) + dd(n, door);
        if (sc < ps) { ps = sc; pick = n; }
      }
      if (!pick) return null;
      slots.push(pick); used.add(key(pick));
    }
    return slots;
  }

  function fila(local, all, anchor) {
    const mx = (gw - 1) / 2, my = (gh - 1) / 2, lines = new Map();
    for (const c of local) for (const [dx, dy] of D4) {
      const wx = c[0] + dx, wy = c[1] + dy;
      if (!isInnerWall(wx, wy)) continue;
      const lk = dx ? "x" + wx : "y" + wy;
      let L = lines.get(lk);
      if (!L) { L = { inner: dx ? Math.abs(wx - mx) / mx : Math.abs(wy - my) / my, cells: [], lk }; lines.set(lk, L); }
      L.cells.push(c);
    }
    let best = null;
    for (const L of lines.values()) {
      if (!best || L.inner < best.inner - 1e-9 || (Math.abs(L.inner - best.inner) < 1e-9 && L.cells.length > best.cells.length)) best = L;
    }
    if (!best) return null;
    const onWall = c => D4.some(([dx, dy]) => isInnerWall(c[0] + dx, c[1] + dy) && (dx ? "x" + (c[0] + dx) : "y" + (c[1] + dy)) === best.lk);
    const inLocal = new Set(all.map(key));
    const start = best.cells.reduce((a, b) => dd(b, anchor) < dd(a, anchor) ? b : a);
    const slots = [start], used = new Set([key(start)]);
    while (slots.length < 4) {
      let pick = null, ps = 1e9;
      const last = slots[slots.length - 1];
      for (const s of slots) for (const [dx, dy] of D4) {
        const n = [s[0] + dx, s[1] + dy], k = key(n);
        if (!inLocal.has(k) || used.has(k)) continue;
        const sc = (onWall(n) ? 0 : touchesWall(n) ? 100 : 200) + (s === last ? 0 : 50) + dd(n, anchor);
        if (sc < ps) { ps = sc; pick = n; }
      }
      if (!pick) return null;
      slots.push(pick); used.add(key(pick));
    }
    return slots;
  }

  const roomReg = l => reg[(l.y + 1) * gw + l.x + 1];
  const free = es => leaves.filter(l => !es.some(e => e && e.reg === roomReg(l)));
  const cA = [1, 1], cB = [gw - 2, gh - 2], parts = leaves.length + splits.filter(s => s.cor).length + border.length;
  let entA = null, entB = null;
  if (parts >= MIN_PARTS_2ND) {
    entA = entryAt(cA);
    for (const c of entA.slots) taken.add(key(c));
    entB = entryAt(cB);
    if (entB && !free([entA, entB]).length) entB = null;
  }
  if (!entB) {
    taken.clear();
    entA = entryAt(r() < .5 ? cA : cB);
    for (const c of entA.slots) taken.add(key(c));
  }
  for (const [x, y] of entA.slots) g[y][x] = "S";
  if (entB) for (const [x, y] of entB.slots) g[y][x] = "T";

  const ext = [];
  for (const e of [entA, entB]) {
    if (!e) continue;
    const tail = e.slots[3];
    let best = null, bd = 1e9;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const vb = x === 0 || x === gw - 1, hb = y === 0 || y === gh - 1;
      if (!(vb || hb) || (vb && hb)) continue;
      const ix = x === 0 ? 1 : x === gw - 1 ? gw - 2 : x, iy = y === 0 ? 1 : y === gh - 1 ? gh - 2 : y;
      if (reg[iy * gw + ix] !== e.reg) continue;
      const along = vb ? [[x, y - 1], [x, y + 1], [x, y]] : [[x - 1, y], [x + 1, y], [x, y]];
      if (along.some(([ax, ay]) => ext.some(o => o[0] === ax && o[1] === ay))) continue;
      const d = dd([ix, iy], tail);
      if (d < bd) { bd = d; best = [x, y]; }
    }
    if (best) ext.push(best);
  }

  const dist = new Int16Array(gw * gh).fill(-1), bq = [];
  for (const c of entA.slots.concat(entB ? entB.slots : [])) { dist[key(c)] = 0; bq.push(c); }
  for (let h = 0; h < bq.length; h++) {
    const c = bq[h];
    for (const [dx, dy] of D4) {
      const n = [c[0] + dx, c[1] + dy];
      if (g[n[1]][n[0]] === "#" || dist[key(n)] >= 0) continue;
      dist[key(n)] = dist[key(c)] + 1; bq.push(n);
    }
  }

  const others = shuffle(free([entA, entB]));
  let pools = others.map(l => shuffle(cells(l).filter(([x, y]) => !near(x, y, "D") && dist[y * gw + x] >= 6)));
  if (!pools.some(c => c.length)) pools = others.map(l => shuffle(cells(l).filter(([x, y]) => !near(x, y, "D"))));

  const sees = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    const n = Math.ceil(d * 4);
    for (let i = 1; i < n; i++) {
      const t = i / n, c = g[(a[1] + .5 + dy * t) | 0][(a[0] + .5 + dx * t) | 0];
      if (c === "#" || c === "D") return false;
    }
    return true;
  };

  const allSlots = entA.slots.concat(entB ? entB.slots : []), hidden = [], hk = new Set();
  for (const e of [entA, entB]) {
    if (e && isCor[key(e.slots[0])]) {
      for (const c of regs[e.reg]) {
        const k = key(c);
        if (hk.has(k) || g[c[1]][c[0]] !== "." || near(c[0], c[1], "D") || dist[k] < 6 || allSlots.some(s => sees(s, c))) continue;
        if (ext.some(o => Math.abs(o[0] - c[0]) <= 1 && Math.abs(o[1] - c[1]) <= 1)) continue;
        hk.add(k); hidden.push(c);
      }
    }
  }
  if (hidden.length) pools.push(shuffle(hidden));

  let placed = 0;
  while (placed < p.enemies && pools.some(c => c.length)) {
    for (const c of pools) {
      if (placed >= p.enemies) break;
      let s;
      while ((s = c.pop()) && near(s[0], s[1], "E"));
      if (s) { g[s[1]][s[0]] = "E"; placed++; }
    }
  }

  let open = 0;
  for (const row of g) for (const c of row) if (c !== "#") open++;
  const s0 = key(entA.slots[0]);
  const connected = () => {
    const seen = new Uint8Array(gw * gh), st = [s0]; seen[s0] = 1; let n = 0;
    while (st.length) {
      const k = st.pop(); n++; const x = k % gw, y = (k / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, c = g[ny][nx], nk = ny * gw + nx;
        if (c === "#" || c === "X" || seen[nk]) continue;
        seen[nk] = 1; st.push(nk);
      }
    }
    return n === open;
  };

  const cand = shuffle([].concat(...leaves.map(cells)).filter(([x, y]) => g[y][x] === "." && !near(x, y, "D") && !ext.some(o => Math.abs(o[0] - x) <= 1 && Math.abs(o[1] - y) <= 1)));
  const want = Math.round(cand.length * p.crates / 100);
  let cr = 0;
  for (const [x, y] of cand) {
    if (cr >= want) break;
    g[y][x] = "X"; open--;
    if (connected()) cr++; else { g[y][x] = "."; open++; }
  }
  for (const [x, y] of ext) g[y][x] = "O";
  return { rows: g.map(r => r.join("")), rooms: leaves.length, enemies: placed, corridors: splits.filter(s => s.cor).length + border.length, entries: entB ? 2 : 1 };
}


