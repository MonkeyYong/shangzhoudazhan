// 校验 sim 走法与真实规则对齐：
//   1) simGenMoves 王/分身 maxStep=1（与 reachableCells L1018、b7c003a 一致），不是 2
//   2) simHasAnyMove 马按日字步（被围邻接仍有跳步可走），不当滑行棋子
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
const sandbox={document:documentStub,localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},devicePixelRatio:1,innerWidth:1024,innerHeight:768,matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),confirm:()=>{throw new Error("confirm() 不应在此被调用")},alert(){},setTimeout,clearTimeout,console,FileReader:function(){},Blob:function(){},URL:{createObjectURL:()=>"",revokeObjectURL(){}},Event:function(){},fetch:()=>Promise.resolve({json:()=>Promise.resolve({layout:[]})})};
sandbox.window=sandbox; vm.createContext(sandbox);

const EXPORT = `
;globalThis.__V = {
  setPieces: (arr) => { pieces = arr; },
  simFromPieces: (arr, turnSide="white") => {
    const occ = new Int32Array(361).fill(-1);
    arr.forEach((p, i) => { if (!p.dead) occ[p.row * 19 + p.col] = i; p.idx = i; });
    return { pieces: arr, occ, turn: turnSide, lostClone: {white:false,black:false}, cloneUnlocked: {white:false,black:false} };
  },
  simMoves: (sim, side) => simGenMoves(sim, side),
  simHasAnyMove: (sim, side) => simHasAnyMove(sim, side),
  reach: (p) => reachableCells(p),
  mk: (type, col, row, side="white") => ({id:1,side,type,col,row,state:type==="king"?"imprisoned_invincible":"free",isClone:false,hasMoved:false,activelyUnlocked:false,hoverT:0,dead:false}),
};
`;

let fails=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c)fails++;};

try{ vm.runInContext(js+EXPORT, sandbox,{filename:"game.js"}) }catch(e){console.error("LOAD:",e.stack||e);process.exit(1)}
const V = sandbox.__V;

// === Task #1: simGenMoves 王 maxStep=1 ===
// 空棋盘中心 free 黑王 (9,9)：1 格 → 8 个目标；若 maxStep=2（旧 bug）→ 24 个
{
  const king = V.mk("king", 9, 9, "black");
  king.state = "free"; // 已解锁、可动的王
  const sim = V.simFromPieces([king], "black");
  const moves = V.simMoves(sim, "black");
  ok(moves.length === 8, "simGenMoves 中心 free 王 = 8 个目标（maxStep=1）, got " + moves.length);
  const tooFar = moves.filter(m => Math.max(Math.abs(m.toCol-9), Math.abs(m.toRow-9)) > 1);
  ok(tooFar.length === 0, "simGenMoves 王无 2 格走法（全部 ≤1 切比雪夫距离）");
}

// 对照真实 reachableCells：同位置 free 王也是 8 格
{
  const king = V.mk("king", 9, 9, "black");
  king.state = "free";
  V.setPieces([king]);
  ok(V.reach(king).length === 8, "真实 reachableCells free 王 = 8 格（对照）");
}

// === Task #2: simHasAnyMove 马按日字步 ===
// 白马 (9,9) 周围 8 邻接全被己方白兵占满（滑行无路），但日字目标空 → 应有可走
{
  const horse = V.mk("horse", 9, 9, "white");
  const adj = [[8,9],[10,9],[9,8],[9,10],[8,8],[8,10],[10,8],[10,10]]
    .map(([c,r]) => V.mk("soldier", c, r, "white"));
  const sim = V.simFromPieces([horse, ...adj], "white");
  ok(V.simHasAnyMove(sim, "white") === true, "simHasAnyMove 马被围邻接仍有日字跳步可走（不当滑行）");
}

// 反例：仅有禁锢王（imprisoned_invincible 被 simHasAnyMove 跳过）→ 无可走 → false
{
  const king = V.mk("king", 9, 9, "white"); // 默认 state=imprisoned_invincible
  const sim = V.simFromPieces([king], "white");
  ok(V.simHasAnyMove(sim, "white") === false, "simHasAnyMove 仅禁锢王 → false（禁锢子被跳过）");
}

console.log(fails===0?"\nALL GREEN":"\n"+fails+" FAILURE(S)");
process.exit(fails===0?0:1);
