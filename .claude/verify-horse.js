// 校验马兵种：类型系统 + 走法 + 机制
const fs = require("fs"), path = require("path"), vm = require("vm");
const html = fs.readFileSync(path.join("D:", "Codes", "Projects", "商周大战", "codes", "商周大战.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function gfxProxyFn(){}
const gfx = new Proxy(gfxProxyFn,{get:(t,k)=>(k===Symbol.toPrimitive?()=>"":gfx),apply:()=>gfx});
function makeEl(){return {textContent:"",innerHTML:"",value:"battle",disabled:false,type:"",title:"",href:"",download:"",dataset:{},style:new Proxy({},{get:()=>()=>{},set:()=>true}),classList:{add(){},remove(){},toggle(){},contains:()=>false},addEventListener(){},dispatchEvent(){},setAttribute(){},appendChild(){},removeChild(){},scrollIntoView(){},click(){},querySelector:()=>makeEl(),querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0,width:640,height:640}),getContext:()=>gfx,width:640,height:640}}
const els={};
const documentStub={getElementById:id=>(els[id]||(els[id]=makeEl())),querySelector:()=>makeEl(),querySelectorAll:()=>[],createElement:()=>makeEl(),addEventListener(){},documentElement:makeEl(),body:makeEl()};
const sandbox={document:documentStub,localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:1024,innerHeight:768,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),confirm:()=>{throw new Error("confirm() 不应在此被调用")},alert(){},setTimeout,clearTimeout,console,FileReader:function(){},Blob:function(){},URL:{createObjectURL:()=>"",revokeObjectURL(){}},Event:function(){}};
sandbox.window=sandbox; vm.createContext(sandbox);

const EXPORT = `
;globalThis.__V = {
  setPieces: (arr) => { pieces = arr; },
  setTurn: (t) => { turn = t; },
  reach: (p) => reachableCells(p),
  legal: (p) => legalMoves(p),
  simMoves: (sim, side) => simGenMoves(sim, side),
  simFromPieces: (arr, turnSide="white") => {
    const occ = new Int32Array(361).fill(-1);
    arr.forEach((p, i) => { if (!p.dead) occ[p.row * 19 + p.col] = i; });
    return { pieces: arr, occ, turn: turnSide, lostClone: {white:false,black:false}, cloneUnlocked: {white:false,black:false} };
  },
  norm: (d) => normLayoutItem(d),
  smallCount: (side) => smallPieceCountOf(side),
  validate: () => validateSetup(),
  pieceCounts: () => setupPieceCounts(),
  recomputeKings: () => recomputeKingStates(),
  Z_TYPE, AI_VAL,
  mk: (type, col, row, side="white") => ({id:1,side,type,col,row,state:type==="king"?"imprisoned_invincible":"free",isClone:false,hasMoved:false,activelyUnlocked:false,hoverT:0,dead:false}),
};
`;

let fails=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c)fails++;};

try{ vm.runInContext(js+EXPORT, sandbox,{filename:"game.js"}) }catch(e){console.error("LOAD:",e.stack||e);process.exit(1)}
const V = sandbox.__V;

// === 类型系统（Task 2）===
ok(V.Z_TYPE.horse===3, "Z_TYPE.horse === 3");
ok(V.AI_VAL.horse===300, "AI_VAL.horse === 300");
const n1 = V.norm(["white","horse",5,5]); ok(n1 && n1[1]==="horse", "normLayoutItem 接受 horse");
ok(V.norm(["white","dragon",0,0])===null, "normLayoutItem 拒绝未知 type");

// === 走法（Task 3）===
V.setPieces([V.mk("horse",9,9)]);
const r = V.reach(V.mk("horse",9,9));
ok(r.length===8, "中心马 8 个目标格");
const cs = r.map(m=>m.col+","+m.row).sort().join(" ");
ok(cs==="10,11 10,7 11,10 11,8 7,10 7,8 8,11 8,7", "日字 8 格坐标正确");

V.setPieces([V.mk("horse",9,9), V.mk("soldier",9,10,"white"), V.mk("soldier",10,9,"white")]);
ok(V.reach(V.mk("horse",9,9)).length===8, "马跳跃不被中间友军阻挡");

V.setPieces([V.mk("horse",9,9), V.mk("soldier",11,10,"black")]);
const cap = V.reach(V.mk("horse",9,9)).find(m=>m.col===11&&m.row===10);
ok(!!cap && cap.capture===true, "马可吃敌方");

V.setPieces([V.mk("horse",9,9), V.mk("king",11,10,"black")]);
ok(!V.reach(V.mk("horse",9,9)).find(m=>m.col===11&&m.row===10), "马不吃未移动的敌方 king");

V.setPieces([V.mk("horse",0,0)]);
const r5 = V.reach(V.mk("horse",0,0));
ok(r5.length===2 && r5.find(m=>m.col===1&&m.row===2) && r5.find(m=>m.col===2&&m.row===1), "角 (0,0) 日字 = (1,2)(2,1)");

V.setPieces([V.mk("horse",9,9), V.mk("soldier",11,10,"black")]);
const sim = V.simFromPieces([V.mk("horse",9,9), V.mk("soldier",11,10,"black")]);
const sm = V.simMoves(sim, "white");
ok(sm.length===8 && sm.find(m=>m.toCol===11&&m.toRow===10 && m.capture), "simGenMoves 与 reachableCells 等价（含吃子）");

// === 机制（Task 5）===
V.setPieces([V.mk("king",9,18,"white"), V.mk("horse",5,5,"white"), V.mk("soldier",7,7,"white"), V.mk("king",9,0,"black"), V.mk("horse",3,3,"black")]);
ok(V.smallCount("white")===2, "smallPieceCountOf white = horse+soldier=2");
ok(V.smallCount("black")===1, "smallPieceCountOf black = horse=1");

V.setTurn("white");
ok(V.validate()===null, "validateSetup 通过（双方各 1 王 + ≥1 小棋子 + 有合法行动）");

console.log(fails===0?"\nALL GREEN":"\n"+fails+" FAILURE(S)");
process.exit(fails===0?0:1);