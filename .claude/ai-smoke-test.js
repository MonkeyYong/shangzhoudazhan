// AI 引擎冒烟测试：stub DOM → 执行整个游戏脚本 → 驱动 AI 自对弈
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "商周大战.html"), "utf8");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

// ---- DOM / 浏览器 API 桩 ----
function gfxProxyFn() {}
const gfx = new Proxy(gfxProxyFn, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : gfx),
  apply: () => gfx,
});
function makeEl() {
  return {
    textContent: "", innerHTML: "", value: "battle", disabled: false, type: "",
    title: "", href: "", download: "",
    style: new Proxy({}, { get: () => () => {}, set: () => true }),
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, dispatchEvent() {}, setAttribute() {},
    appendChild() {}, removeChild() {}, scrollIntoView() {}, click() {},
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 640 }),
    getContext: () => gfx,
    width: 640, height: 640,
  };
}
const els = {};
const documentStub = {
  getElementById: (id) => (els[id] || (els[id] = makeEl())),
  querySelector: () => makeEl(),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  addEventListener() {},
  documentElement: makeEl(),
  body: makeEl(),
};
const sandbox = {
  document: documentStub,
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  addEventListener() {}, // window=sandbox：游戏顶层 window.addEventListener("resize",…) 需要此桩
  confirm: () => { throw new Error("confirm() 不应在 AI 管线被调用"); },
  alert() {},
  setTimeout, clearTimeout, console,
  FileReader: function () {},
  Blob: function () {},
  URL: { createObjectURL: () => "", revokeObjectURL() {} },
  Event: function () {},
};
sandbox.window = sandbox;
const vm = require("vm");
vm.createContext(sandbox);
// 顶层 let/const 不挂 global，用 getter 导出状态与函数供测试访问
const EXPORT = `
;globalThis.G = {
  get pieces(){return pieces;}, set pieces(v){pieces=v;},
  get turn(){return turn;}, set turn(v){turn=v;},
  get gameOver(){return gameOver;}, set gameOver(v){gameOver=v;},
  get moveLog(){return moveLog;},
  get replayIndex(){return replayIndex;},
  get replayMode(){return replayMode;},
  get currentPreset(){return currentPreset;}, set currentPreset(v){currentPreset=v;},
  get aiSide(){return aiSide;}, set aiSide(v){aiSide=v;},
  AI_LEVELS,
  makeSim, simAt, simGenMoves, simCanAttack, legalMoves, reachableCells, coordStr,
  aiChooseMove, aiPlayMove, aiMaybeSchedule,
  initPieces, startReplay, replayGoto, positionHash, humanUndo,
};`;
vm.runInContext(js + EXPORT, sandbox, { filename: "game.js" });

// ---- 测试 ----
const g = sandbox.G;
function assert(cond, msg) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("PASS:", msg);
}

// 1. 初始局面构建
g.currentPreset = "battle";
g.initPieces();
assert(g.pieces.length === 22, "初始局面 22 子（大战）");

// 2. makeSim 与全局一致
const sim = g.makeSim();
assert(sim.pieces.length === 22 && sim.turn === "white", "makeSim 复制局面与回合方");
assert(g.simAt(sim, 9, 0) && g.simAt(sim, 9, 0).type === "king", "simAt O(1) 查子（K1 武王）");

// 3. 着法生成与全局 legalMoves 交叉验证（逐子比对目标集合）
let mismatch = 0;
const simMoves = g.simGenMoves(sim, "white").concat(g.simGenMoves(sim, "black"));
for (const p of g.pieces) {
  const sp = sim.pieces.find(q => q.id === p.id);
  const a = g.legalMoves(p).map(m => m.col + "," + m.row + (m.capture ? "x" : "")).sort().join("|");
  const b = simMoves.filter(mv => mv.idx === sp.idx)
    .map(mv => mv.toCol + "," + mv.toRow + (mv.capture ? "x" : "")).sort().join("|");
  if (a !== b) { mismatch++; console.error("着法不一致:", g.coordStr(p.col, p.row), "\n  global:", a, "\n  sim:   ", b); }
}
assert(mismatch === 0, "simGenMoves 与全局 legalMoves 全子一致");

// 3b. 覆盖判定交叉验证：simCanAttack vs 全局 reachableCells（对每枚王格）
let covMismatch = 0;
const kings = g.pieces.filter(p => p.type === "king");
for (const k of kings) {
  for (const p of g.pieces) {
    if (p.side === k.side) continue;
    const sp = sim.pieces.find(q => q.id === p.id);
    const globalCovers = g.reachableCells(p).some(m => m.col === k.col && m.row === k.row);
    const simCovers = g.simCanAttack(sim, sp, k.col, k.row);
    if (globalCovers !== simCovers) { covMismatch++; console.error("覆盖不一致:", g.coordStr(p.col, p.row), "→", g.coordStr(k.col, k.row), "global:", globalCovers, "sim:", simCovers); }
  }
}
assert(covMismatch === 0, "simCanAttack 与全局 reachableCells 覆盖判定一致");

// 4. aiChooseMove 三档都能产出合法着法
for (const lvl of ["rookie", "advanced", "master"]) {
  const t0 = Date.now();
  const mv = g.aiChooseMove("white", g.AI_LEVELS[lvl]);
  const dt = Date.now() - t0;
  const ok = mv && g.legalMoves(mv.piece).some(m => m.col === mv.toCol && m.row === mv.toRow);
  assert(ok, lvl + " 选出合法着法（" + dt + "ms）：" +
    (mv ? g.coordStr(mv.piece.col, mv.piece.row) + "→" + g.coordStr(mv.toCol, mv.toRow) + (mv.clone ? " 分身" : "") : "null"));
}

// 5. AI 完整自对弈（双方高手档），验证管线不崩、终局自洽
g.initPieces();
g.turn = "white";
let moves = 0, terminal = null;
const t0g = Date.now();
while (moves < 300) {
  const mv = g.aiChooseMove(g.turn, g.AI_LEVELS.advanced);
  if (!mv) { console.error("FAIL: 无着但 gameOver 未置位"); process.exitCode = 1; break; }
  g.aiPlayMove(mv);
  moves++;
  if (g.gameOver) { terminal = g.gameOver; break; }
}
console.log("自对弈 " + moves + " 步，moveLog " + g.moveLog.length + " 条，耗时 " + (Date.now() - t0g) + "ms");
assert(terminal !== null || moves >= 300, "自对弈正常推进（终局=" + JSON.stringify(terminal) + "）");
assert(g.moveLog.length === moves, "每步均入棋谱");

// 6. 悔棋语义：AI 模式连撤两手、双人模式只撤一手（须在进入复盘前测试——复盘会重置对局状态）
g.aiSide = "black"; // 模拟 AI 对战模式
const before = g.moveLog.length;
g.humanUndo();
assert(g.moveLog.length === before - 2, "AI 模式悔棋连撤两手（" + before + " → " + g.moveLog.length + "）");
g.aiSide = null;
const before2 = g.moveLog.length;
g.humanUndo();
assert(g.moveLog.length === before2 - 1, "双人模式悔棋只撤一手（" + before2 + " → " + g.moveLog.length + "）");

// 7. 棋谱可被复盘完整重放（applyRecord 链路自洽）
const savedLog = g.moveLog.map(m => ({ ...m }));
g.startReplay(savedLog, "battle", "测试");
g.replayGoto(savedLog.length);
assert(g.replayIndex === savedLog.length, "复盘重放完整棋谱无中断（" + g.replayIndex + "/" + savedLog.length + "）");
console.log("重放终点哈希:", g.positionHash().slice(0, 60) + "...");

console.log(process.exitCode ? "== 有失败 ==" : "== 全部通过 ==");
