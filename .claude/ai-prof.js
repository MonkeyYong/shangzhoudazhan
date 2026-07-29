// 单步 advanced 性能剖面
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
const EXPORT = `;globalThis.G = { AI_LEVELS, aiChooseMove, initPieces };`;
vm.runInContext(js + EXPORT, sandbox, { filename: "game.js" });
const g = sandbox.G;
g.initPieces();
const t0 = Date.now();
g.aiChooseMove("white", g.AI_LEVELS.advanced);
console.log("advanced total:", Date.now() - t0, "ms");
