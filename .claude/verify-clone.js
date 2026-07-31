// 校验分身触发：士兵或马与武王互在行动范围 → 触发分身（含情形一/二，真实 + sim）
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
  setCloneUnlocked: (side, v) => { sideCloneUnlocked[side] = v; },
  setLostClone: (side, v) => { sideLostClone[side] = v; },
  cloneOffer: (moved) => { const r = cloneOfferCheck(moved); return { offered: r, cands: cloneCandidates.slice() }; },
  bigCount: (side) => bigCount(side),
  simFromPieces: (arr, turnSide="white", opts={}) => {
    const occ = new Int32Array(361).fill(-1);
    arr.forEach((p, i) => { if (!p.dead) occ[p.row * 19 + p.col] = i; p.idx = i; });
    return { pieces: arr, occ, turn: turnSide,
      lostClone: opts.lostClone || {white:false,black:false},
      cloneUnlocked: opts.cloneUnlocked || {white:false,black:false} };
  },
  simCloneOffered: (sim, moved) => simCloneOffered(sim, moved),
  simFirstCloneCand: (sim, moved) => simFirstCloneCand(sim, moved),
  mk: (type, col, row, side="white") => ({id:1,side,type,col,row,state:type==="king"?"imprisoned_invincible":"free",isClone:false,hasMoved:false,activelyUnlocked:false,hoverT:0,dead:false}),
};
`;

let fails=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c)fails++;};

try{ vm.runInContext(js+EXPORT, sandbox,{filename:"game.js"}) }catch(e){console.error("LOAD:",e.stack||e);process.exit(1)}
const V = sandbox.__V;

// 公共布局：白王(9,9)已解锁分身能力 + 黑王 + 黑兵
const whiteKing = V.mk("king", 9, 9, "white"); whiteKing.hasMoved = true; whiteKing.state = "free"; whiteKing.activelyUnlocked = true;
const blackKing = V.mk("king", 9, 0, "black");
const blackSoldier = V.mk("soldier", 3, 3, "black");

function freshWhite(extra) {
  V.setPieces([whiteKing, blackKing, blackSoldier, ...extra]);
  V.setCloneUnlocked("white", true);
  V.setLostClone("white", false);
}

// === 情形一：马进入武王范围（real） ===
{
  const horse = V.mk("horse", 10, 10, "white"); // 距白王(9,9) 切比雪夫 1 ≤ 2
  freshWhite([horse]);
  const r = V.cloneOffer(horse);
  ok(r.offered === true, "情形一 real：马进武王2格范围 → 触发分身");
  ok(r.cands.length === 1 && r.cands[0] === horse, "情形一 real：候选为该马");
}

// === 情形一：兵进入武王范围（real，回归不破） ===
{
  const sol = V.mk("soldier", 10, 10, "white");
  freshWhite([sol]);
  const r = V.cloneOffer(sol);
  ok(r.offered === true, "情形一 real：兵进武王2格范围 → 触发分身（回归）");
}

// === 情形二：武王进入马的范围（real） ===
{
  const horse = V.mk("horse", 11, 11, "white"); // 距白王(9,9) 切比雪夫 2 ≤ 2
  freshWhite([horse]);
  const r = V.cloneOffer(whiteKing);
  ok(r.offered === true, "情形二 real：武王进马2格范围 → 触发分身");
  ok(r.cands.length === 1 && r.cands[0] === horse, "情形二 real：候选为该马");
}

// === 负例：未解锁分身能力 → 不触发 ===
{
  const horse = V.mk("horse", 10, 10, "white");
  freshWhite([horse]);
  V.setCloneUnlocked("white", false); // 武王未首移 → 未解锁
  const r = V.cloneOffer(horse);
  ok(r.offered === false, "负例 real：未解锁分身能力 → 不触发");
}

// === sim：马进入武王范围 → simCloneOffered true、simFirstCloneCand 返回该马 ===
{
  const horse = V.mk("horse", 10, 10, "white");
  const sim = V.simFromPieces([whiteKing, horse, blackKing, blackSoldier], "white",
    { cloneUnlocked: {white:true,black:false} });
  ok(V.simCloneOffered(sim, horse) === true, "sim：马进武王范围 → 触发分身");
  ok(V.simFirstCloneCand(sim, horse) === horse, "sim：simFirstCloneCand 返回该马");
}

// === sim：武王进入马范围 ===
{
  const horse = V.mk("horse", 11, 11, "white");
  const sim = V.simFromPieces([whiteKing, horse, blackKing, blackSoldier], "white",
    { cloneUnlocked: {white:true,black:false} });
  ok(V.simCloneOffered(sim, whiteKing) === true, "sim：武王进马范围 → 触发分身");
  ok(V.simFirstCloneCand(sim, whiteKing) === horse, "sim：simFirstCloneCand 返回该马");
}

console.log(fails===0?"\nALL GREEN":"\n"+fails+" FAILURE(S)");
process.exit(fails===0?0:1);
