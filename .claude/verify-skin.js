// 临时校验：stub DOM/Canvas → 执行整页脚本 → 切换皮肤，真正执行 paintShanShui 与 multiply 宫城路径
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "商周大战.html"), "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .sort((a, b) => b.length - a.length)[0];

function gfxProxyFn() {}
const gfx = new Proxy(gfxProxyFn, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => "" : gfx),
  apply: () => gfx,
});
function makeEl() {
  return {
    textContent: "", innerHTML: "", value: "battle", disabled: false, type: "",
    title: "", href: "", download: "", dataset: {},
    style: new Proxy({}, { get: () => () => {}, set: () => true }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, dispatchEvent() {}, setAttribute() {},
    appendChild() {}, removeChild() {}, scrollIntoView() {}, click() {},
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 640 }),
    getContext: () => gfx, width: 640, height: 640,
  };
}
const els = {};
const documentStub = {
  getElementById: (id) => (els[id] || (els[id] = makeEl())),
  querySelector: () => makeEl(), querySelectorAll: () => [],
  createElement: () => makeEl(), addEventListener() {},
  documentElement: makeEl(), body: makeEl(),
};
const sandbox = {
  document: documentStub,
  localStorage: { getItem: () => null, setItem() {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  addEventListener() {}, removeEventListener() {},
  devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768,
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  confirm: () => { throw new Error("confirm() 不应在此被调用"); },
  alert() {}, setTimeout, clearTimeout, console,
  FileReader: function () {}, Blob: function () {},
  URL: { createObjectURL: () => "", revokeObjectURL() {} }, Event: function () {},
  fetch: () => Promise.resolve({ json: () => Promise.resolve({ layout: [] }) }),
};
sandbox.window = sandbox;
vm.createContext(sandbox);

const EXPORT = `
;globalThis.__V = {
  apply: (id) => applySkin(id),
  skins: () => Object.keys(SKINS),
  cur: () => currentSkin,
  hasPaint: (id) => !!SKINS[id].board.paint,
  blend: (id) => SKINS[id].palace.blend || null,
};
`;

let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

try {
  vm.runInContext(js + EXPORT, sandbox, { filename: "game.js" });
} catch (e) {
  console.error("LOAD-TIME THROW:", e && e.stack || e);
  process.exit(1);
}

const V = sandbox.__V;
const skins = V.skins();
console.log("skins =", skins.join(", "));
ok(skins.indexOf("shanshui") >= 0, "SKINS 含 shanshui");
ok(skins.length === 5, "皮肤总数 = 5（warm/dark/qinglv/star/shanshui）");
ok(V.hasPaint("shanshui"), "shanshui 带 board.paint");
ok(V.blend("shanshui") == null, "shanshui 宫城已改回 alpha 叠加（无 blend，贴合截图观感）");
ok(V.blend("qinglv") == null, "qinglv 宫城无 blend（未被波及）");
ok(V.blend("warm") == null, "warm 宫城无 blend（未被波及）");

// 真正执行每个皮肤的 paint + render(含 multiply 宫城) 路径
for (const id of ["warm", "dark", "qinglv", "star", "shanshui"]) {
  try { V.apply(id); ok(V.cur() === id, "applySkin('" + id + "') 无抛错且生效"); }
  catch (e) { ok(false, "applySkin('" + id + "') 抛错: " + (e && e.message || e)); }
}

console.log(fails === 0 ? "\nALL GREEN" : "\n" + fails + " FAILURE(S)");
process.exit(fails === 0 ? 0 : 1);
