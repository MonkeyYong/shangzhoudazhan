const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "商周大战.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

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

const EXPORT = `
;globalThis.__V = {
  setPieces: (arr) => { pieces = arr; },
  setCustomLayout: (arr) => { customLayout = arr; },
  setSetupMode: (v) => { setupMode = v; },
  setSetupDirty: (v) => { setupDirty = v; },
  exportLayout: () => exportLayout(),
  mk: (type, col, row, side="white") => ({id:1,side,type,col,row,state:type==="king"?"imprisoned_invincible":"free",isClone:false,hasMoved:false,activelyUnlocked:false,hoverT:0,dead:false}),
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

console.log(fails===0?"\nALL GREEN":"\n"+fails+" FAILURE(S)");
process.exit(fails===0?0:1);
