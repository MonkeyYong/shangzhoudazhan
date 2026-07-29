// AI 棋力诊断：典型局面下各档 AI 的着法选择
const fs = require("fs");
const html = fs.readFileSync("D:/Codes/Projects/商周大战/codes/商周大战.html", "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];
function gfxFn() {}
const gfx = new Proxy(gfxFn, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : gfx), apply: () => gfx });
function makeEl() {
  return {
    textContent: "", innerHTML: "", value: "battle", disabled: false, type: "", title: "", href: "", download: "",
    style: new Proxy({}, { get: () => () => {}, set: () => true }),
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, dispatchEvent() {}, setAttribute() {},
    appendChild() {}, removeChild() {}, scrollIntoView() {}, click() {},
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 640 }),
    getContext: () => gfx, width: 640, height: 640,
  };
}
const els = {};
const sandbox = {
  document: {
    getElementById: (id) => (els[id] || (els[id] = makeEl())),
    querySelector: () => makeEl(), querySelectorAll: () => [],
    createElement: () => makeEl(), addEventListener() {},
    documentElement: makeEl(), body: makeEl(),
  },
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  confirm: () => false, alert() {},
  setTimeout, clearTimeout, console,
  FileReader: function () {}, Blob: function () {},
  URL: { createObjectURL: () => "", revokeObjectURL() {} }, Event: function () {},
};
sandbox.window = sandbox;
const vm = require("vm");
vm.createContext(sandbox);
const EXPORT = `;globalThis.G = {
  get pieces(){return pieces;}, set pieces(v){pieces=v;},
  get turn(){return turn;}, set turn(v){turn=v;},
  AI_LEVELS, aiChooseMove, initPieces, coordStr, legalMoves,
};`;
vm.runInContext(js + EXPORT, sandbox, { filename: "game.js" });
const g = sandbox.G;

let nextTestId = 1;
function P(side, type, col, row, extra) {
  return Object.assign({
    id: nextTestId++, side, type, col, row,
    state: type === "king" ? "imprisoned_invincible" : "free",
    isClone: false, hasMoved: false, activelyUnlocked: false, hoverT: 0,
  }, extra || {});
}
function setup(name, list, turnSide) {
  g.pieces.length = 0;
  for (const p of list) g.pieces.push(p);
  g.turn = turnSide || "white";
  console.log("\n===== " + name + "（" + g.turn + " to move）=====");
}
function show(level) {
  const t0 = Date.now();
  const mv = g.aiChooseMove(g.turn, g.AI_LEVELS[level]);
  const dt = Date.now() - t0;
  if (!mv) { console.log(level.padEnd(9) + ": （无着）"); return; }
  console.log(level.padEnd(9) + ": " + g.coordStr(mv.piece.col, mv.piece.row) + "→"
    + g.coordStr(mv.toCol, mv.toRow) + (mv.clone ? " 分身" : "")
    + (mv.piece.type !== "soldier" ? " [" + mv.piece.type + "]" : "")
    + "  (" + dt + "ms)");
}
function all() { for (const l of ["rookie", "advanced", "master"]) show(l); }

// 列字母: A=0 B=1 C=2 D=3 E=4 F=5 G=6 H=7 J=8 K=9 L=10 M=11 N=12 O=13 P=14 Q=15 R=16 S=17 T=18
const A = { A:0,B:1,C:2,D:3,E:4,F:5,G:6,H:7,J:8,K:9,L:10,M:11,N:12,O:13,P:14,Q:15,R:16,S:17,T:18 };

// 真实围困：双方武王各被 2 枚敌兵覆盖（禁锢不可动，杜绝"王自由后暴走"干扰战术测试）
function walls() {
  return [
    P("black", "soldier", A.H, 0), P("black", "soldier", A.K, 2),   // 围白王 K1
    P("white", "soldier", A.H, 18), P("white", "soldier", A.K, 16), // 围黑王 K19
  ];
}

// 1. 白吃一兵：白兵 H10 可直接吃黑兵 J10（直线 2 格，中路空）
setup("1. 白吃：H10×J10 直线2格", [
  ...walls(),
  P("white", "king", A.K, 0), P("black", "king", A.K, 18),
  P("white", "soldier", A.H, 9),
  P("black", "soldier", A.J, 9),
], "white");
all();

// 2. 白吃一兵（1格）：白兵 H10 吃黑兵 H11
setup("2. 白吃：H10×H11 邻格", [
  ...walls(),
  P("white", "king", A.K, 0), P("black", "king", A.K, 18),
  P("white", "soldier", A.H, 9),
  P("black", "soldier", A.H, 10),
], "white");
all();

// 3. 交换：白兵 H10 吃黑兵 J10 后，黑兵 L10 可回吃白兵（一换一，白先）
setup("3. 交换：H10×J10 后被 L10 回吃", [
  ...walls(),
  P("white", "king", A.K, 0), P("black", "king", A.K, 18),
  P("white", "soldier", A.H, 9),
  P("black", "soldier", A.J, 9),
  P("black", "soldier", A.L, 9),
], "white");
all();

// 4. 白吃分身（大子）：白兵 H10 可吃黑分身 J10（350 分大子）
setup("4. 白吃大子：H10×黑分身J10", [
  ...walls(),
  P("white", "king", A.K, 0), P("black", "king", A.K, 18),
  P("white", "soldier", A.H, 9),
  P("black", "clone", A.J, 9, { isClone: true }),
], "white");
all();

// 5. 两步后才能吃（需要调动）：白兵 H10，黑兵 M10（距离 4 格，需逼近）
setup("5. 调动进攻：白H10 vs 黑M10（距离4格）", [
  ...walls(),
  P("white", "king", A.K, 0), P("black", "king", A.K, 18),
  P("white", "soldier", A.H, 9),
  P("black", "soldier", A.M, 9),
], "white");
all();

// 6. 开局首步战略倾向（默认大战 22 子）
g.initPieces();
g.turn = "white";
setup("6. 开局首步（大战 22 子）", g.pieces.slice(), "white");
all();

// 7. 己方王被围、外围有敌兵可吃：救王 vs 吃子 的取舍
//    白王 K19 被黑兵 H19/K17/M19 围困（初始围困形态），白兵 H10 附近有黑兵 J10 可吃
setup("7. 救王 vs 吃子：白王被围，H10 可吃 J10", [
  ...walls(),
  P("white", "king", A.K, 18), P("black", "king", A.K, 0),
  P("black", "soldier", A.H, 18), P("black", "soldier", A.K, 16), P("black", "soldier", A.M, 18),
  P("white", "soldier", A.H, 9),
  P("black", "soldier", A.J, 9),
], "white");
all();

// 8. 三着吃子链（静态搜索鉴别题）：
//    白 F10×H10 吃黑兵 → 黑 J11×H10 回吃 → 白 H12×H10 再吃，净 +100。
//    无静态搜索时 depth=2 会判此链为 0（黑回吃后终止）而可能放弃吃子。
setup("8. 三着吃子链：F10×H10, 黑J11回吃, 白H12再吃", [
  ...walls(),
  P("white", "king", A.K, 0), P("black", "king", A.K, 18),
  P("white", "soldier", A.F, 9),   // F10
  P("white", "soldier", A.H, 11),  // H12
  P("black", "soldier", A.H, 9),   // H10
  P("black", "soldier", A.J, 10),  // J11
], "white");
all();
