const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "商周大战.html"), "utf8");
const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m => m[1])
  .sort((a, b) => b.length - a.length)[0];

function gfxProxyFn(){}
const gfx = new Proxy(gfxProxyFn,{get:(t,k)=>(k===Symbol.toPrimitive?()=>"":gfx),apply:()=>gfx});
function makeEl(){return {textContent:"",innerHTML:"",value:"battle",disabled:false,type:"",title:"",href:"",download:"",dataset:{},style:new Proxy({},{get:()=>()=>{},set:()=>true}),classList:{add(){},remove(){},toggle(){},contains:()=>false},addEventListener(){},dispatchEvent(){},setAttribute(){},appendChild(){},removeChild(){},scrollIntoView(){},click(){},querySelector:()=>makeEl(),querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0,width:640,height:640}),getContext:()=>gfx,width:640,height:640}}
const els={};
const documentStub={getElementById:id=>(els[id]||(els[id]=makeEl())),querySelector:()=>makeEl(),querySelectorAll:()=>[],createElement:()=>makeEl(),addEventListener(){},documentElement:makeEl(),body:makeEl()};
const sandbox={document:documentStub,localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:1024,innerHeight:768,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),confirm:()=>false,alert(){},setTimeout,clearTimeout,console,FileReader:function(){},Blob:function(){},URL:{createObjectURL:()=>"",revokeObjectURL(){}},Event:function(){}};
sandbox.window=sandbox; vm.createContext(sandbox);

// 拦截 Blob 构造和 <a> 点击，记录下载内容
let capturedBlob = null;
const origBlob = sandbox.Blob;
sandbox.Blob = function(parts, opts){ capturedBlob = { parts, opts }; return new origBlob(parts, opts); };
const origCreate = documentStub.createElement;
documentStub.createElement = (tag) => {
  const el = origCreate(tag);
  if (tag === "a") { el.click = () => {}; }
  return el;
};

// Task 11: mock-fetch 沙箱（从磁盘读 4 个真实 JSON，兼容 cache-busting ?v=）
const mockFiles = {
  "codes/layouts/small.json":  fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "layouts", "small.json"), "utf8"),
  "codes/layouts/battle.json": fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "layouts", "battle.json"), "utf8"),
  "codes/layouts/final.json":  fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "layouts", "final.json"), "utf8"),
  "codes/layouts/custom.json": fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "layouts", "custom.json"), "utf8"),
};
sandbox.fetch = (url) => Promise.resolve({ json: () => Promise.resolve(JSON.parse(mockFiles[url.split("?")[0]])) });

const EXPORT = `
;globalThis.__V = {
  setPieces: (arr) => { pieces = arr; },
  setCustomLayout: (arr) => { customLayout = arr; },
  setSetupMode: (v) => { setupMode = v; },
  setSetupDirty: (v) => { setupDirty = v; },
  setPreset: (v) => { currentPreset = v; },
  exportLayout: () => exportLayout(),
  validate: (layout, key) => validateLoadedLayout(layout, key),
  mk: (type, col, row, side="white") => ({id:1,side,type,col,row,state:type==="king"?"imprisoned_invincible":"free",isClone:false,hasMoved:false,activelyUnlocked:false,hoverT:0,dead:false}),
  loadPresets: () => loadPresetLayouts(),
  loadedLayouts: () => loadedLayouts,
  ready: () => layoutsReady,
  preset: () => currentPreset,
  initPieces: () => initPieces(),
  pieces: () => pieces,
};
`;

let fails=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c)fails++;};

try{ vm.runInContext(js+EXPORT, sandbox,{filename:"game.js"}) }catch(e){console.error("LOAD:",e.stack||e);process.exit(1)}
const V = sandbox.__V;

// === exportLayout ===
V.setPieces([V.mk("king",9,18,"white"), V.mk("king",9,0,"black"), V.mk("soldier",5,5,"white"), V.mk("horse",3,3,"black")]);
try { V.exportLayout(); } catch(e){ ok(false, "exportLayout 不应抛错: "+e.message); }
ok(capturedBlob !== null, "exportLayout 创建了 Blob");
const exported = JSON.parse(capturedBlob.parts.join(""));
ok(exported.game==="商周大战", "exported.game === 商周大战");
ok(exported.preset==="custom", "exported.preset === custom");
ok(Array.isArray(exported.moves) && exported.moves.length===0, "exported.moves 为空数组");
ok(exported.layout.length===4, "exported.layout 含 4 枚棋子");
ok(exported.layout.find(x=>x[1]==="horse"), "exported.layout 保留 horse 类型");

// === importLayout 需 confirm 与 setupMode（这里仅确认函数存在；按钮行为手动验收）===
ok(typeof V.exportLayout === "function", "exportLayout 是函数（importLayout 需 setupMode，由手动验收）");

// === validateLoadedLayout（Task 10）===
const symLayout = [["white","king",9,18],["black","king",9,0],["white","soldier",5,5],["black","soldier",13,13]];
const asymLayout = [["white","king",9,18],["black","king",9,0],["white","soldier",5,5],["black","soldier",5,5]];
ok(symLayout && symLayout.length===4 && V.validate(symLayout,"x") && V.validate(symLayout,"x").length===4, "对称布局通过 validateLoadedLayout");
ok(V.validate(asymLayout,"x")===null, "破坏对称的布局被拒绝（返回 null）");
ok(V.validate([],"x")===null, "空布局被拒绝");
ok(V.validate([["white","dragon",0,0]],"x")===null, "未知 type 被过滤后为空→拒绝");

// === loadPresetLayouts + initPieces 接入（Task 11）===
V.loadPresets();
(async () => {
  // 等待 Promise 链
  await new Promise(r => setTimeout(r, 50));
  ok(V.ready()===true, "loadPresetLayouts 完成后 layoutsReady=true");
  // layout 数量从 disk 实际读（verify 不硬编码，将来同步修改 layouts 后仍正确）
  const expectedCounts = {
    small:  JSON.parse(mockFiles["codes/layouts/small.json"]).layout.length,
    battle: JSON.parse(mockFiles["codes/layouts/battle.json"]).layout.length,
    final:  JSON.parse(mockFiles["codes/layouts/final.json"]).layout.length,
  };
  ok(V.loadedLayouts().small && V.loadedLayouts().small.length===expectedCounts.small, "loadedLayouts.small = " + expectedCounts.small + " 枚");
  ok(V.loadedLayouts().battle && V.loadedLayouts().battle.length===expectedCounts.battle, "loadedLayouts.battle = " + expectedCounts.battle + " 枚");
  ok(V.loadedLayouts().final && V.loadedLayouts().final.length===expectedCounts.final, "loadedLayouts.final = " + expectedCounts.final + " 枚");
  // initPieces 用 loaded
  V.setPreset("final");
  V.initPieces();
  ok(V.pieces().length===expectedCounts.final, "initPieces 在 final 档使用 loadedLayouts（" + expectedCounts.final + " 枚）");
  // 回退：把 loadedLayouts 清掉某 key，应回落到 PRESETS（PRESETS 是固定 14 枚）
  V.loadedLayouts().small = null;
  V.setPreset("small");
  V.initPieces();
  ok(V.pieces().length===14, "loadedLayouts 缺失时回落到 PRESETS（small 14 枚）");
  console.log(fails===0?"\nALL GREEN":"\n"+fails+" FAILURE(S)");
  process.exit(fails===0?0:1);
})();
