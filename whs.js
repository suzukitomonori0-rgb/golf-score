/* 週末ゴルフ ハンディキャップ — WHS計算（ハンディページとスコアアプリで共通） */
(function(){
"use strict";
const r1=x=>Math.round(x*10)/10;
const dayKey=t=>{const d=new Date(t);return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate()};

/* ---------- コースデータ（スコアアプリと同じホール情報） [パー, ホールHDCP] ---------- */
const NINES={
 kodama:{W:{n:'西',d:[[5,5],[4,7],[3,2],[4,6],[4,8],[4,9],[5,4],[4,1],[3,3]]},
         S:{n:'南',d:[[4,4],[5,1],[4,2],[3,7],[4,6],[4,3],[4,5],[3,8],[5,9]]},
         E:{n:'東',d:[[4,9],[4,1],[4,3],[3,7],[5,6],[3,8],[5,5],[4,2],[4,4]]}},
 koga:{O:{n:'OUT',d:[[4,15],[4,9],[4,3],[5,1],[3,7],[4,13],[4,5],[3,11],[5,17]]},
       I:{n:'IN',d:[[5,10],[4,4],[3,16],[4,2],[4,14],[4,8],[3,12],[4,6],[5,18]]}}
};
const CNAME={kodama:'児玉CC',koga:'古河GL'};
const TEES={reg:'レギュラー',back:'バック'};
const COMBOS={kodama:{WS:'西・南',SE:'南・東',EW:'東・西'},koga:{OI:'OUT・IN'}};
function comboKey(course,a,b){if(course==='koga')return 'OI';const s=[a,b].sort().join('');return {SW:'WS',ES:'SE',EW:'EW'}[s]||s}
function holesOf(course,front,back){
  const N=NINES[course],out=[];
  [front,back].forEach((k,ix)=>N[k].d.forEach(([p,h])=>{
    // 児玉は各9ホールのHDCPが1〜9なので、前半を奇数・後半を偶数にして18ホールの順位にする
    out.push({p,h:course==='kodama'?(ix===0?h*2-1:h*2):h});
  }));
  return out;
}
// 名前が仮のもの・ゲストは一覧に出さない
const isGeneric=n=>/^プレーヤー[A-ZＡ-Ｚ]?$/.test(n)||/^ゲスト/.test(n);

function ratings(DATA){
  const R={};
  for(const c of (DATA&&DATA.courses)||[]){R[c.course]=R[c.course]||{};R[c.course][c.combo]=R[c.course][c.combo]||{};R[c.course][c.combo][c.tee]=c}
  return R;
}
function rounds(DATA){
  return ((DATA&&DATA.rounds)||[]).filter(r=>NINES[r.course]&&NINES[r.course][r.front]&&NINES[r.course][r.back])
    .map(r=>Object.assign({},r,{holes:holesOf(r.course,r.front,r.back),ck:comboKey(r.course,r.front,r.back)}));
}

/* ---------- WHS 計算 ---------- */
function courseHcp(hi,cr,sr,par){return Math.round(hi*sr/113+(cr-par))}
function strokesOn(ch,h18){
  if(ch>=0)return Math.floor(ch/18)+((h18<=ch%18)?1:0);
  return (h18>18+ch)?-1:0; // プラスハンディは易しいホールで打数を返す
}
// 枚数に応じた採用枚数と調整（WHS規則5.2）
function idxFrom(vals){
  const n=vals.length;if(n<3)return null;
  const T={3:[1,-2],4:[1,-1],5:[1,0],6:[2,-1],7:[2,0],8:[2,0],9:[3,0],10:[3,0],11:[3,0],12:[4,0],13:[4,0],14:[4,0],15:[5,0],16:[5,0],17:[6,0],18:[6,0],19:[7,0]};
  const [use,adj]=n>=20?[8,0]:T[n];
  const sorted=vals.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v).slice(0,use);
  const avg=sorted.reduce((a,b)=>a+b.v,0)/use;
  return {hi:Math.min(54,r1(avg+adj)),usedIdx:sorted.map(x=>x.i),use};
}
function compute(DATA){
  const RT=ratings(DATA),byP={};
  const rs=rounds(DATA).sort((a,b)=>a.date-b.date);
  for(const r of rs){
    if(r.excluded)continue;
    const x=RT[r.course]&&RT[r.course][r.ck]&&RT[r.course][r.ck][r.tee||'reg'];
    if(!x||!(x.sr>=55&&x.sr<=155)||!(x.cr>0))continue;
    const R={cr:+x.cr,sr:+x.sr,par:72};
    for(const p of r.players||[]){
      // 18ホール全部そろったスコアか、手入力の合計だけを使う
      if(p.s&&p.s.some(v=>v==null))continue;
      if(!p.s&&p.gross==null)continue;
      (byP[p.name]=byP[p.name]||[]).push({r,p,R});
    }
  }
  const out={};
  for(const name in byP){
    // 同じ日・同じコースで同じスコア（2台で記録した等）は1枚にまとめる
    const seen=new Set(),list=[];
    for(const e of byP[name]){const k=dayKey(e.r.date)+e.r.course+'|'+(e.p.s?e.p.s.join(','):'g'+e.p.gross);if(seen.has(k))continue;seen.add(k);list.push(e)}
    const scores=[],hiHist=[];let hi=null;
    for(const {r,p,R} of list){
      let ags,gross,capped=0;
      if(p.s){
        gross=p.s.reduce((a,b)=>a+b,0);
        const ch=hi==null?null:courseHcp(hi,R.cr,R.sr,R.par);
        ags=0;
        p.s.forEach((v,ix)=>{const H=r.holes[ix];const cap=ch==null?H.p+5:H.p+2+strokesOn(ch,H.h);if(v>cap){capped+=v-cap;ags+=cap}else ags+=v});
      }else{gross=ags=Number(p.gross)}
      const diff=r1((113/R.sr)*(ags-R.cr));
      const sc={date:r.date,uid:r.uid,course:r.course,ck:r.ck,tee:r.tee||'reg',gross,ags,capped,diff,adj:0,manual:!p.s};
      scores.push(sc);
      // 突出した好スコアの調整（規則5.9）
      if(hi!=null){const d=hi-diff,x=d>=10?2:d>=7?1:0;if(x){const k=scores.length-1;for(let j=Math.max(0,k-19);j<=k;j++)scores[j].adj-=x}}
      const res=idxFrom(scores.slice(-20).map(s=>r1(s.diff+s.adj)));
      if(res){
        let v=res.hi;
        // ソフトキャップ／ハードキャップ（規則5.8）
        if(scores.length>=20){
          const prev=hiHist.filter(x=>x.date>=r.date-365*864e5&&x.n>=20).map(x=>x.hi);
          if(prev.length){const low=Math.min(...prev);if(v-low>3)v=low+3+(v-low-3)/2;if(v-low>5)v=low+5;v=r1(v)}
        }
        hi=v;hiHist.push({date:r.date,hi,n:scores.length});
      }
    }
    const win=scores.slice(-20),res=idxFrom(win.map(s=>r1(s.diff+s.adj)));
    out[name]={name,hi,scores,used:new Set(res?res.usedIdx.map(i=>win[i].uid):[]),need:Math.max(0,3-scores.length)};
  }
  return out;
}

window.WHS={NINES,CNAME,TEES,COMBOS,comboKey,holesOf,isGeneric,ratings,rounds,courseHcp,strokesOn,idxFrom,compute,r1,dayKey};
})();
