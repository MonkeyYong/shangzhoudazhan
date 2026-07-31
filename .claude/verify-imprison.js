// 复现 AI 走禁锢纣王 bug：simCoverage 漏算马的日字覆盖
// 真实 isImprisoned 计马（knightReach），sim 的 simCanAttack 把马当滑行棋子 → 漏算 → AI 误判王 free
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
  isImprisoned: (k) => isImprisoned(k),
  recomputeKings: () => recomputeKingStates(),
  simFromPieces: (arr, turnSide="white") => {
    const occ = new Int32Array(361).fill(-1);
    arr.forEach((p, i) => { if (!p.dead) occ[p.row * 19 + p.col] = i; p.idx = i; });
    return { pieces: arr, occ, turn: turnSide, lostClone: {white:false,black:false}, cloneUnlocked: {white:false,black:false} };
  },
  simCoverage: (sim, k) => simCoverage(sim, k),
  simCanAttack: (sim, p, tc, tr) => simCanAttack(sim, p, tc, tr),
  simKingStates: (sim) => simKingStates(sim),
  simMoves: (sim, side) => simGenMoves(sim, side),
  mk: (type, col, row, side="white") => ({id:1,side,type,col,row,state:type==="king"?"imprisoned_invincible":"free",isClone:false,hasMoved:false,activelyUnlocked:false,hoverT:0,dead:false}),
};
`;

let fails=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c)fails++;};

try{ vm.runInContext(js+EXPORT, sandbox,{filename:"game.js"}) }catch(e){console.error("LOAD:",e.stack||e);process.exit(1)}
const V = sandbox.__V;

// 场景：黑纣王 (9,0)，白兵 (9,1) 直进 1 格覆盖，白马 (8,2) 日字 (8+1,2-2)=(9,0) 覆盖
const blackKing = V.mk("king", 9, 0, "black");
const whiteSoldier = V.mk("soldier", 9, 1, "white");
const whiteHorse = V.mk("horse", 8, 2, "white");
const whiteKing = V.mk("king", 9, 18, "white");
const blackSoldier = V.mk("soldier", 3, 3, "black");
V.setPieces([blackKing, whiteSoldier, whiteHorse, whiteKing, blackSoldier]);

// 真实 isImprisoned：兵 + 马 = 2 → true
ok(V.isImprisoned(blackKing)===true, "真实 isImprisoned(黑王) = true（兵+马=2，马算日字覆盖）");

// sim 覆盖统计（修复后应与真实一致）
const sim = V.simFromPieces([blackKing, whiteSoldier, whiteHorse, whiteKing, blackSoldier], "black");
ok(V.simCanAttack(sim, whiteHorse, 9, 0)===true, "修复后 simCanAttack(白马→9,0) = true（马按日字覆盖）");
ok(V.simCoverage(sim, blackKing) === 2, "修复后 simCoverage(黑王) = 2（兵+马，与真实一致）");

// simKingStates 据此把王置禁锢
V.simKingStates(sim);
ok(blackKing.state === "imprisoned_invincible", "修复后 simKingStates 把黑王置 imprisoned_invincible");

// 进而 simGenMoves 跳过禁锢王，不生成王的走法
const moves = V.simMoves(sim, "black").filter(m => m.idx === blackKing.idx);
ok(moves.length === 0, "修复后 simGenMoves 不为禁锢黑王生成走法 → AI 不会走禁锢王");

console.log(fails===0?"\nALL GREEN":"\n"+fails+" FAILURE(S)");
process.exit(fails===0?0:1);
