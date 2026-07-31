// 验证：摆子每档独立保存 — 5 项关键不变量
//  - loadedLayouts 含 4 档（含 custom）
//  - initPieces(custom) 走 loadedLayouts["custom"]
//  - markSetupDirty 不再切档
//  - startFromSetup（校验通过）触发下载，文件名 = currentPreset + ".json"
//  - 全局无 customLayout 变量、无 localStorage 自定义存取函数
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(
  path.join("D:", "Codes", "Projects", "商周大战", "codes", "商周大战.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// --- DOM stub（沿用 verify-layout.js 模板） ---
function gfxProxyFn(){}
const gfx = new Proxy(gfxProxyFn, {get:(t,k)=>(k===Symbol.toPrimitive?()=>"":gfx), apply:()=>gfx});
function makeEl(tag){
  const el = {
    textContent:"", innerHTML:"", value:"battle", disabled:false, type:"",
    title:"", href:"", download:"", dataset:{},
    style: new Proxy({}, {get:()=>()=>{}, set:()=>true}),
    classList: {add(){}, remove(){}, toggle(){}, contains:()=>false},
    addEventListener(){}, dispatchEvent(){}, setAttribute(){},
    appendChild(){}, removeChild(){}, scrollIntoView(){}, click(){},
    querySelector:()=>makeEl(), querySelectorAll:()=>[],
    getBoundingClientRect:()=>({left:0,top:0,width:640,height:640}),
    getContext:()=>gfx, width:640, height:640,
  };
  if (tag === "a") {
    Object.defineProperty(el, "download", {
      get(){ return el._download; }, set(v){ el._download = v; },
    });
    Object.defineProperty(el, "href", {
      get(){ return el._href; }, set(v){ el._href = v; },
    });
  }
  return el;
}
const els = {};
const documentStub = {
  getElementById: (id) => (els[id] || (els[id] = makeEl())),
  querySelector: () => makeEl(), querySelectorAll: () => [],
  createElement: (tag) => makeEl(tag),
  addEventListener(){}, documentElement: makeEl(), body: makeEl(),
};

// --- Sandbox ---
const sandbox = {
  document: documentStub,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  addEventListener(){}, removeEventListener(){},
  devicePixelRatio: 1, innerWidth: 1024, innerHeight: 768,
  matchMedia: () => ({matches:false, addEventListener(){}, removeEventListener(){}}),
  confirm: () => false, alert(){},
  setTimeout, clearTimeout, console,
  FileReader: function(){}, Event: function(){},
  Blob: function(){},
  URL: { createObjectURL: () => "", revokeObjectURL() {} },
  fetch: (url) => {
    // mock：4 个 layout 全部给一份最小合法布局（含 horse 兼容）
    const mkLayout = (preset) => ({
      game: "商周大战", preset, moves: [],
      layout: [
        ["white","king",9,18], ["black","king",9,0],
        ["white","soldier",7,6], ["black","soldier",11,12],
      ],
    });
    return Promise.resolve({ json: () => Promise.resolve(mkLayout("x")) });
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);

// --- 拦截 Blob 与 <a>.click（用对象容器，sandbox 内可读写） ---
const capture = { blob: null, download: null };
sandbox.capture = capture;
const origBlob = sandbox.Blob;
sandbox.Blob = function(parts, opts){
  capture.blob = { parts, opts };
  return new origBlob(parts, opts);
};
const origCreate = documentStub.createElement;
documentStub.createElement = (tag) => {
  const el = origCreate(tag);
  if (tag === "a") {
    el.click = () => { capture.download = el._download || ""; };
  }
  return el;
};

// --- 测试 hooks（Export 到 globalThis.__V） ---
const EXPORT = `
;globalThis.__V = {
  setPieces: (arr) => { pieces = arr; },
  setSetupMode: (v) => { setupMode = v; },
  setSetupDirty: (v) => { setupDirty = v; },
  setPreset: (v) => { currentPreset = v; },
  setSetupSnapshot: (v) => { setupSnapshot = v; },
  setSetupEntryPreset: (v) => { setupEntryPreset = v; },
  setValidateSetupOK: (v) => { validateSetup = () => v ? null : "mock fail"; },
  markDirty: () => markSetupDirty(),
  save: () => startFromSetup(),
  downloadAsJson: (k) => downloadLayoutAsJson(k),
  loadPresets: () => loadPresetLayouts(),
  loadedLayouts: () => loadedLayouts,
  ready: () => layoutsReady,
  preset: () => currentPreset,
  initPieces: () => initPieces(),
  piecesLen: () => pieces.length,
  setNextId: (v) => { nextId = v; },
  resetCapture: () => { capture.blob = null; capture.download = null; },
  getBlob: () => capture.blob,
  getDownload: () => capture.download,
  has: (name) => typeof globalThis[name] !== "undefined",
};
`;
let fails = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };

try {
  vm.runInContext(js + EXPORT, sandbox, { filename: "game.js" });
} catch (e) {
  console.error("LOAD:", e.stack || e);
  process.exit(1);
}
const V = sandbox.__V;

// ───── 行为断言 ─────
(async () => {
  // (T1) 加载 4 档
  V.loadPresets();
  await new Promise(r => setTimeout(r, 50));
  ok(V.ready() === true, "loadPresetLayouts 完成后 layoutsReady=true");
  ok(V.loadedLayouts().small !== undefined, "loadedLayouts.small 存在");
  ok(V.loadedLayouts().battle !== undefined, "loadedLayouts.battle 存在");
  ok(V.loadedLayouts().final !== undefined, "loadedLayouts.final 存在");
  ok(V.loadedLayouts().custom !== undefined, "loadedLayouts.custom 存在（第 4 档）");

  // (T2/T3) initPieces 在 custom 档走 loadedLayouts["custom"]
  V.setPreset("custom");
  V.setNextId(1);
  V.initPieces();
  const customLen = (V.loadedLayouts().custom || []).length;
  ok(V.piecesLen() === customLen, "initPieces(custom) 长度 = loadedLayouts.custom.length");

  // (T4) 全局无 customLayout 变量、无 localStorage 读写
  ok(!V.has("customLayout"), "全局无 customLayout 变量（localStorage 路线已下线）");
  ok(!V.has("loadCustomLayout"), "无 loadCustomLayout 函数");
  ok(!V.has("saveCustomLayout"), "无 saveCustomLayout 函数");
  ok(!V.has("syncCustomSub"), "无 syncCustomSub 函数");
  ok(!V.has("CUSTOM_LAYOUT_KEY"), "无 CUSTOM_LAYOUT_KEY 常量");

  // (T5) markSetupDirty 不再切档
  V.setPreset("battle");
  V.setSetupMode(true);
  V.setSetupDirty(false);
  V.markDirty();
  ok(V.preset() === "battle", "markSetupDirty 后 currentPreset 仍为 battle（不切到 custom）");

  // (T6) startFromSetup（mock 校验通过）触发下载，文件名 = presetKey
  V.resetCapture();
  V.setPreset("battle");
  V.setSetupSnapshot(null);
  V.setSetupEntryPreset("battle");
  V.setSetupMode(true);
  V.setSetupDirty(true); // 标记有改动，触发走"保存到文件"路径
  V.setValidateSetupOK(true);
  V.save();
  ok(V.getBlob() !== null, "startFromSetup 走通校验后创建了 Blob（浏览器下载内容）");
  if (V.getBlob()) {
    const parsed = JSON.parse(V.getBlob().parts.join(""));
    ok(parsed.game === "商周大战", "下载 JSON .game = 商周大战");
    ok(parsed.preset === "battle", "下载 JSON .preset = 当前档 battle");
    ok(Array.isArray(parsed.moves) && parsed.moves.length === 0, "下载 JSON .moves 为空数组");
    ok(Array.isArray(parsed.layout), "下载 JSON .layout 为数组");
  }
  ok(V.getDownload() === "battle.json", "下载触发 <a> 的 download 属性 = battle.json");
  ok(V.preset() === "battle", "保存后 currentPreset 仍是 battle（不切档）");

  console.log(fails === 0 ? "\nALL GREEN" : "\n" + fails + " FAILURE(S)");
  process.exit(fails === 0 ? 0 : 1);
})();
