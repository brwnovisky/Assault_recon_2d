const CLASSIC_PARAMS = {
  seed: "c5kp", w: 22, h: 15, rooms: 6, enemies: 7, crates: 8, extra: 3, corridors: 40, corrW: 2
};

export const CLASSIC_META = { name: "Clássico", source: "classic", params: CLASSIC_PARAMS };

export const CLASSIC = [
  "###O##################",
  "#..SS#..#....#..#....#",
  "#.X.S#..#....D..#XE.E#",
  "#...S#..#..E.#..#....#",
  "#....D..#....#..#....#",
  "####D#..D.X..D..D....#",
  "#....#..##########D###",
  "#....#..D.......#....#",
  "#....#..#....E..D....#",
  "#.X.X#E.#.......#.E..#",
  "#E...#..#...X...D....#",
  "###D##..##D###########",
  "#..........TTTT......#",
  "#....................#",
  "##############O#######"
];

export const DT = 1 / 60;
export const SPEED = 3.2;
export const TURN = 7;
export const OP_HALF = 0.96;
export const OP_RANGE = 10;
export const EN_HALF = 0.87;
export const EN_RANGE = 8.5;
export const MOVE_TIME = 15;
export const MOVE_BUDGET = MOVE_TIME * SPEED;
export const FREEZE_REAL = 1.2;
export const TRACER_LIFE = 0.14;
export const REPLAY_SPEEDS = [1, 0.5, 0.25];

export const NAMES = ["Alfa", "Bravo", "Charlie", "Delta"];
export const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const STORE_KEY = "ponto-de-entrada:v1";
export const MAX_MAPS = 30;

export const C = {};

export function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  C.board = g("--board");
  C.grid = g("--grid");
  C.wall = g("--wall");
  C.crate = g("--crate");
  C.door = g("--door");
  C.enemy = g("--enemy");
  C.ink = g("--ink");
  C.op = [g("--op0"), g("--op1"), g("--op2"), g("--op3")];
}


