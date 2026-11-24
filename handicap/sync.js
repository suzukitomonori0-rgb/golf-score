/* 週末ゴルフ ハンディキャップ — スコアの送信と読み込み（児玉・古河のアプリとハンディページで共通） */
(function(){
"use strict";
// ↓ Google Apps Script の「ウェブアプリのURL」をここに貼る
const ENDPOINT='https://script.google.com/macros/s/AKfycbzl38EFADz_jKgnHqdjSAXVFwVee2I_19UGC6lKS7is6FKAa_Q2ToAXliN_G_nghs6G3Q/exec';

const CACHE_KEY='wgh-cache-v1';
const sentKey=src=>'wgh-sent-v1:'+src;
function readJSON(k,def){try{const v=JSON.parse(localStorage.getItem(k));return v==null?def:v}catch(e){return def}}
function writeJSON(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

// アプリの履歴1件を、送信用の小さな形にする
function compact(app,rec){
  let front,back;
  if(app.course==='kodama'){front=rec.front||'W';back=rec.back||'S'}
  else if(app.src==='koga'){front='O';back='I'}          // 旧古河版はホール番号固定（1〜9=OUT）
  else{front=rec.front||'O';back=rec.back||(front==='O'?'I':'O')}
  const n=rec.count||(rec.players||[]).length,players=[];
  for(let i=0;i<n;i++){
    const name=((rec.players&&rec.players[i]&&rec.players[i].name)||'').trim();if(!name)continue;
    const s=[];
    for(let h=1;h<=18;h++){const H=rec.holes&&rec.holes[h];const v=H&&H.done&&H.s?H.s[i]:null;s.push(v>0?Number(v):null)}
    players.push({name,s});
  }
  return {uid:app.src+':'+rec.id,src:app.src,date:rec.id,course:app.course,front,back,players};
}

let busy=false;
// まだ送っていないラウンドを送る（電波が無ければ次の機会に再送）
async function push(){
  const app=window.WGH_APP;if(!ENDPOINT||!app||busy)return {sent:0};
  const hist=readJSON(app.hkey,[]);if(!Array.isArray(hist)||!hist.length)return {sent:0};
  const sent=new Set(readJSON(sentKey(app.src),[]));
  const pending=hist.filter(r=>r&&r.id&&!sent.has(app.src+':'+r.id)).slice(0,50);
  if(!pending.length)return {sent:0};
  busy=true;
  try{
    const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({rounds:pending.map(r=>compact(app,r))})});
    const j=await res.json();
    if(j&&j.ok){(j.accepted||[]).forEach(u=>sent.add(u));writeJSON(sentKey(app.src),[...sent]);return {sent:j.added||0}}
  }catch(e){}finally{busy=false}
  return {sent:0,error:true};
}

// 全員分のラウンドとコース情報を読み込む（つながらなければ前回の内容）
async function load(){
  if(!ENDPOINT)return {data:readJSON(CACHE_KEY,null),offline:true,unset:true};
  try{
    const res=await fetch(ENDPOINT+(ENDPOINT.includes('?')?'&':'?')+'t='+Date.now(),{cache:'no-store'});
    const j=await res.json();
    if(j&&j.ok){const data={rounds:j.rounds||[],courses:j.courses||[],at:Date.now()};writeJSON(CACHE_KEY,data);return {data,offline:false}}
  }catch(e){}
  return {data:readJSON(CACHE_KEY,null),offline:true};
}

// 手入力のラウンドを送る（ハンディページ用）
async function postRounds(rounds){
  if(!ENDPOINT)throw new Error('送信先が未設定です');
  const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({rounds})});
  const j=await res.json();if(!j||!j.ok)throw new Error((j&&j.error)||'送信に失敗しました');return j;
}

window.WGH={ENDPOINT,push,load,postRounds,configured:!!ENDPOINT};
window.wghSync=push;

// スコアアプリでは、開いた時・電波が戻った時・画面に戻った時・1分ごとに未送信分を送る
if(window.WGH_APP&&ENDPOINT){
  setTimeout(push,1500);
  window.addEventListener('online',push);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')push()});
  setInterval(push,60000);
}
})();
