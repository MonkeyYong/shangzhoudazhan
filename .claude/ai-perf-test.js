// AI 性能测试：各档单步耗时 + 节点统计
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
const EXPORT = `
;globalThis.G = {
  get pieces(){return pieces;}, get turn(){return turn;}, set turn(v){turn=v;},
  get gameOver(){return gameOver;}, set gameOver(v){gameOver=v;},
  get moveLog(){return moveLog;},
  AI_LEVELS, aiChooseMove, aiPlayMove, initPieces, coordStr,
};`;
vm.runInContext(js + EXPORT, sandbox, { filename: "game.js" });
const g = sandbox.G;

g.initPieces();
// 各档开局首步耗时（白方）
for (const lvl of ["rookie", "advanced", "master"]) {
  const t0 = Date.now();
  const mv = g.aiChooseMove("white", g.AI_LEVELS[lvl]);
  const dt = Date.now() - t0;
  console.log(lvl + ": " + dt + "ms → " +
    g.coordStr(mv.piece.col, mv.piece.row) + "→" + g.coordStr(mv.toCol, mv.toRow));
}
// 推进几步后测中局耗时（双方各走 2 步高手档）
for (let i = 0; i < 4; i++) {
  const mv = g.aiChooseMove(g.turn, g.AI_LEVELS.advanced);
  g.aiPlayMove(mv);
}
console.log("--- 中局（4 步后）---");
for (const lvl of ["advanced", "master"]) {
  const t0 = Date.now();
  const mv = g.aiChooseMove(g.turn, g.AI_LEVELS[lvl]);
  const dt = Date.now() - t0;
  console.log(lvl + ": " + dt + "ms");
}
