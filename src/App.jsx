import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

// ======================================================================
// LoL 最適ピック提案サイト — Pro++
// ・不足=赤/充足=青（クリック→候補）
// ・完成度スコア（0〜100）と称号（神構成/超つよい/…/最悪構成）を表示
// ・「どんな理想でも不足が出る」を緩和するための対策を追加：
//   1) 判定の厳しさ 切替（厳しめ/普通/ゆるめ）→ しきい値を一括で緩められる
//   2) 高スコア時の自動緩和（Score≥90で不足を非表示、Score≥85で低重要度の不足を非表示）
//   3) 微差は不足扱いしない（EPS=0.25）
//   4) MAGIC/PHYSはどちらか十分でOK（極端な偏りのみ不足）
//   5) しきい値は重要度・ピック順で動的調整
// ======================================================================

const appBg = "min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-slate-100";
const container = "max-w-7xl mx-auto p-4 sm:p-6 lg:p-8";
const panel = "rounded-2xl bg-white/5 ring-1 ring-white/10 shadow-xl p-4 sm:p-5 lg:p-6 backdrop-blur";
const heading = "text-xl sm:text-2xl font-bold tracking-tight";
const sub = "text-sm text-slate-300";
const badge = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-white/10 ring-1 ring-white/10";

const ROLES = ["ANY","TOP","JUNGLE","MID","ADC","SUPPORT"];
const ATTRS = ["ENGAGE","PEEL","FRONTLINE","BURST","SUSTAIN_DPS","POKE","WAVECLEAR","UTILITY","ANTI_TANK","MOBILITY","MAGIC","PHYS","SAFE_BLIND"];

const DEFAULT_HELPER_BASE = "http://127.0.0.1:5123";

// 「理想値」(0〜10 を想定; 各チャンプのcapは0〜3なのでチーム合計の基準)
const IDEAL = {
  ENGAGE: 6.5, PEEL: 6, FRONTLINE: 6, BURST: 5, SUSTAIN_DPS: 7, POKE: 4.5, WAVECLEAR: 6,
  UTILITY: 5, ANTI_TANK: 4, MOBILITY: 4, MAGIC: 6, PHYS: 6, SAFE_BLIND: 5,
};

// ベース重要度（needWeightsの土台としても使用）
const BASE_IMPORTANCE = {
  ENGAGE:5, PEEL:5, FRONTLINE:5, BURST:3, SUSTAIN_DPS:4, POKE:2, WAVECLEAR:3,
  UTILITY:3, ANTI_TANK:3, MOBILITY:1, MAGIC:2, PHYS:2, SAFE_BLIND:2
};

// 代表例（未定義はタグ推定で補完）
const BASE = [
  { id:"Leona", roles:["SUPPORT"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:1,MAGIC:1,UTILITY:2,SAFE_BLIND:2} },
  { id:"Nautilus", roles:["SUPPORT","JUNGLE","TOP"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:1,MAGIC:1,SAFE_BLIND:2} },
  { id:"Rell", roles:["SUPPORT","JUNGLE"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:1,MAGIC:1,SAFE_BLIND:2} },
  { id:"Alistar", roles:["SUPPORT"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:2,MAGIC:1,SAFE_BLIND:2} },
  { id:"Sejuani", roles:["JUNGLE","TOP"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:1,MAGIC:1,SAFE_BLIND:2} },
  { id:"Zac", roles:["JUNGLE","TOP"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:1,MAGIC:2,SAFE_BLIND:2} },
  { id:"Maokai", roles:["TOP","JUNGLE","SUPPORT"], caps:{ENGAGE:3,FRONTLINE:3,POKE:1,WAVECLEAR:2,MAGIC:2,UTILITY:2,SAFE_BLIND:2} },
  { id:"Malphite", roles:["TOP","JUNGLE"], caps:{ENGAGE:3,FRONTLINE:2,BURST:2,MAGIC:2,ANTI_TANK:1,SAFE_BLIND:2} },
  { id:"Ornn", roles:["TOP"], caps:{ENGAGE:3,FRONTLINE:3,PEEL:1,UTILITY:3,MAGIC:1,SAFE_BLIND:2} },
  { id:"Janna", roles:["SUPPORT"], caps:{PEEL:3,UTILITY:3,MAGIC:1,SAFE_BLIND:3} },
  { id:"Lulu", roles:["SUPPORT"], caps:{PEEL:3,UTILITY:3,MAGIC:1,SAFE_BLIND:2} },
  { id:"Karma", roles:["SUPPORT","MID"], caps:{PEEL:2,POKE:2,WAVECLEAR:2,UTILITY:2,MAGIC:2,SAFE_BLIND:2} },
  { id:"Milio", roles:["SUPPORT"], caps:{PEEL:3,UTILITY:3,MAGIC:1,SAFE_BLIND:2} },
  { id:"TahmKench", roles:["SUPPORT","TOP"], caps:{PEEL:3,FRONTLINE:2,SUSTAIN_DPS:1,MAGIC:1,SAFE_BLIND:2} },
  { id:"Trundle", roles:["JUNGLE","TOP"], caps:{ANTI_TANK:3,FRONTLINE:2,SUSTAIN_DPS:2,PHYS:2,SAFE_BLIND:2} },
  { id:"Vayne", roles:["ADC","TOP"], caps:{ANTI_TANK:3,SUSTAIN_DPS:3,MOBILITY:2,PHYS:3,SAFE_BLIND:1} },
  { id:"KogMaw", roles:["ADC"], caps:{ANTI_TANK:3,SUSTAIN_DPS:3,MAGIC:2,PHYS:2,SAFE_BLIND:0} },
  { id:"Jinx", roles:["ADC"], caps:{SUSTAIN_DPS:3,WAVECLEAR:2,PHYS:3,SAFE_BLIND:2} },
  { id:"Ezreal", roles:["ADC"], caps:{POKE:3,MOBILITY:3,PHYS:2,MAGIC:1,SAFE_BLIND:3} },
  { id:"Varus", roles:["ADC","MID"], caps:{POKE:3,ENGAGE:2,PHYS:2,MAGIC:1,SAFE_BLIND:2} },
  { id:"Ziggs", roles:["MID","ADC"], caps:{POKE:3,WAVECLEAR:3,MAGIC:3,SAFE_BLIND:3} },
  { id:"Viktor", roles:["MID"], caps:{WAVECLEAR:3,MAGIC:3,BURST:2,SAFE_BLIND:2} },
  { id:"Orianna", roles:["MID"], caps:{UTILITY:3,WAVECLEAR:2,MAGIC:3,ENGAGE:2,SAFE_BLIND:2} },
  { id:"Anivia", roles:["MID"], caps:{WAVECLEAR:3,MAGIC:3,UTILITY:2,SAFE_BLIND:2} },
  { id:"LeBlanc", roles:["MID"], caps:{BURST:3,MOBILITY:3,MAGIC:3,SAFE_BLIND:1} },
  { id:"Zed", roles:["MID","TOP"], caps:{BURST:3,MOBILITY:3,PHYS:3,SAFE_BLIND:1} },
  { id:"Talon", roles:["MID","JUNGLE"], caps:{BURST:3,MOBILITY:3,PHYS:3,SAFE_BLIND:1} },
  { id:"Diana", roles:["JUNGLE","MID"], caps:{ENGAGE:2,BURST:3,MAGIC:3,WAVECLEAR:2,SAFE_BLIND:1} },
  { id:"Wukong", roles:["JUNGLE","TOP"], caps:{ENGAGE:2,BURST:2,PHYS:3,FRONTLINE:2,SAFE_BLIND:2} },
  { id:"JarvanIV", roles:["JUNGLE","TOP"], caps:{ENGAGE:3,PHYS:2,FRONTLINE:2,UTILITY:1,SAFE_BLIND:2} },
  { id:"LeeSin", roles:["JUNGLE"], caps:{ENGAGE:2,MOBILITY:3,PHYS:2,UTILITY:2,SAFE_BLIND:1} },
  { id:"Camille", roles:["TOP","JUNGLE"], caps:{ENGAGE:2,BURST:2,MOBILITY:3,PHYS:3,SAFE_BLIND:1} },
  { id:"Garen", roles:["TOP"], caps:{FRONTLINE:2,SUSTAIN_DPS:1,PHYS:2,SAFE_BLIND:2} },
  { id:"Shen", roles:["TOP","SUPPORT"], caps:{FRONTLINE:2,PEEL:2,UTILITY:3,MAGIC:1,SAFE_BLIND:2} },
  { id:"Rumble", roles:["TOP","MID"], caps:{MAGIC:3,WAVECLEAR:2,UTILITY:2,SAFE_BLIND:1} },
  { id:"Thresh", roles:["SUPPORT"], caps:{ENGAGE:2,PEEL:2,UTILITY:2,MAGIC:1,SAFE_BLIND:2} },
  { id:"Rakan", roles:["SUPPORT"], caps:{ENGAGE:3,MOBILITY:3,UTILITY:2,MAGIC:1,SAFE_BLIND:2} },
];

const ROLE_OVERRIDES = { Milio:["SUPPORT"], Leona:["SUPPORT"], Nautilus:["SUPPORT","JUNGLE","TOP"], Rell:["SUPPORT","JUNGLE"], Varus:["ADC","MID"], Ziggs:["MID","ADC"], Karma:["SUPPORT","MID"], Gragas:["TOP","JUNGLE","MID","SUPPORT"], };

function inferCapsFromTags(tags){ const caps={}; if(!tags||tags.length===0) return caps; if(tags.includes("Tank")){ caps.FRONTLINE=Math.max(caps.FRONTLINE||0,2); caps.ENGAGE=Math.max(caps.ENGAGE||0,1); caps.SAFE_BLIND=Math.max(caps.SAFE_BLIND||0,2); } if(tags.includes("Support")){ caps.PEEL=Math.max(caps.PEEL||0,1); caps.UTILITY=Math.max(caps.UTILITY||0,2); caps.SAFE_BLIND=Math.max(caps.SAFE_BLIND||0,2); } if(tags.includes("Mage")){ caps.MAGIC=Math.max(caps.MAGIC||0,2); caps.WAVECLEAR=Math.max(caps.WAVECLEAR||0,1); caps.POKE=Math.max(caps.POKE||0,1); caps.BURST=Math.max(caps.BURST||0,1); caps.SAFE_BLIND=Math.max(caps.SAFE_BLIND||0,2); } if(tags.includes("Assassin")){ caps.BURST=Math.max(caps.BURST||0,2); caps.MOBILITY=Math.max(caps.MOBILITY||0,2); caps.PHYS=Math.max(caps.PHYS||0,1); } if(tags.includes("Marksman")){ caps.SUSTAIN_DPS=Math.max(caps.SUSTAIN_DPS||0,2); caps.PHYS=Math.max(caps.PHYS||0,2); caps.WAVECLEAR=Math.max(caps.WAVECLEAR||0,1); caps.SAFE_BLIND=Math.max(caps.SAFE_BLIND||0,2); } if(tags.includes("Fighter")){ caps.SUSTAIN_DPS=Math.max(caps.SUSTAIN_DPS||0,1); caps.PHYS=Math.max(caps.PHYS||0,1); caps.FRONTLINE=Math.max(caps.FRONTLINE||0,1); } return caps; }
function inferRolesFromTags(name,tags){ if(ROLE_OVERRIDES[name]) return ROLE_OVERRIDES[name]; const set=new Set(); if(!tags) return ["ANY"]; for(const t of tags){ if(t==="Tank"||t==="Fighter") set.add("TOP"); if(t==="Assassin"||t==="Mage") set.add("MID"); if(t==="Marksman") set.add("ADC"); if(t==="Support") set.add("SUPPORT"); } if(set.size===0) set.add("ANY"); return Array.from(set); }
function labelOf(a){ const m={ENGAGE:"エンゲージ",PEEL:"ピール",FRONTLINE:"前衛",BURST:"バースト",SUSTAIN_DPS:"継続火力",POKE:"ポーク",WAVECLEAR:"ウェーブ処理",UTILITY:"ユーティリティ",ANTI_TANK:"対タンク",MOBILITY:"機動力",MAGIC:"魔法ダメ",PHYS:"物理ダメ",SAFE_BLIND:"ブラインド安定"}; return m[a]||a; }
function enemyCue(a){ const m={ANTI_TANK:"敵タンク多め",ENGAGE:"敵がポーク構成",WAVECLEAR:"敵がプッシュ/ポーク",PEEL:"敵が暗殺/バースト",UTILITY:"敵が高機動"}; return m[a]||"敵構成"; }

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const sumObj=(a,b)=>{ const out={}; for(const k of ATTRS){ out[k]=(a?.[k]||0)+(b?.[k]||0);} return out; };
const scaleObj=(a,s)=>{ const out={}; for(const k of ATTRS){ out[k]=(a?.[k]||0)*s;} return out; };

// === シナジー定義（候補用） ===
const SYNERGY_RULES = [
  { whenHas:["Jinx"], candidate:"Leona", bonus:28, why:"JinxのDPSを活かす開始力" },
  { whenHas:["Leona","Nautilus","Rell","Alistar"], candidate:"Jinx", bonus:24, why:"強力エンゲージ×DPS" },
  { whenHas:["Orianna"], candidate:"JarvanIV", bonus:30, why:"ショックウェーブ連携" },
  { whenHas:["JarvanIV","Wukong"], candidate:"Orianna", bonus:26, why:"ノックアップ連携" },
  { whenHas:["KogMaw"], candidate:"Lulu", bonus:34, why:"ハイパーキャリー保護" },
  { whenHas:["Lulu","Milio"], candidate:"KogMaw", bonus:28, why:"射程強化×DPS" },
];

// === チーム完成度用の簡易シナジー検出 ===
const TEAM_SYNERGY = [
  { has:["Jinx","Leona"], bonus:0.03, why:"ボット連携" },
  { has:["JarvanIV","Orianna"], bonus:0.035, why:"J4+オリアナ" },
  { has:["KogMaw","Lulu"], bonus:0.04, why:"ハイパーキャリー保護" },
  { has:["Xayah","Rakan"], bonus:0.03, why:"固有シナジー" },
];

function synergyScore(candidateId, ally, tagsById){ const have = new Set(ally.filter(Boolean)); let score=0; const why=[]; for(const r of SYNERGY_RULES){ if(r.candidate!==candidateId) continue; if(r.whenHas.some(x=>have.has(x))){ score+=r.bonus; why.push(r.why); } } return {score, why}; }

export default function LolPickAdvisorProPlus(){
  const [version, setVersion] = useState(null);
  const [patch, setPatch] = useState(null);
  const [champions, setChampions] = useState([]);
  const [imgById, setImgById] = useState({});
  const [tagsById, setTagsById] = useState({});

  const [ally, setAlly] = useState([null,null,null,null,null]);
  const [enemy, setEnemy] = useState([null,null,null,null,null]);
  const [bansBlue, setBansBlue] = useState([null,null,null,null,null]);
  const [bansRed, setBansRed] = useState([null,null,null,null,null]);
  const [activeSide, setActiveSide] = useState("ALLY");
  const [activeSlot, setActiveSlot] = useState(0);
  const [role, setRole] = useState("ANY");
  const [search, setSearch] = useState("");

  const [teamSide, setTeamSide] = useState("BLUE");
  const [pickRound, setPickRound] = useState("1-2");

  // 判定の厳しさ：STRICT / NORMAL / LOOSE
  const [strictness, setStrictness] = useState("NORMAL");

  const [statsOK, setStatsOK] = useState(false);
  const [lobbyOK, setLobbyOK] = useState(false);
  const statsCache = useRef({ roleWR:{}, matchup:{} });

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState(null);

  // 不足能力モーダル
  const [needOpen, setNeedOpen] = useState(false);
  const [needAttr, setNeedAttr] = useState(null); // 例: "ENGAGE"
  const [needList, setNeedList] = useState([]);   // {id, score, grade, stars, why}

  useEffect(()=>{
    (async()=>{
      try{
        const verList = await fetch("https://ddragon.leagueoflegends.com/api/versions.json").then(r=>r.json());
        const v = verList?.[0]; setVersion(v); setPatch((v||"").split(".").slice(0,2).join("."));
        const data = await fetch(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/champion.json`).then(r=>r.json());
        const list = Object.values(data.data); setChampions(list);
        const img={}, tags={}; for(const c of list){ img[c.id]=`https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${c.image.full}`; tags[c.id]=c.tags||[]; }
        setImgById(img); setTagsById(tags);
      }catch(e){ console.error(e); }
    })();
  },[]);

  // 能力マップ
  const capsById = useMemo(()=>{
    const map={}; for(const b of BASE){ map[b.id]=b; }
    for(const c of champions){
      if(!map[c.id]){ map[c.id] = { id:c.id, roles: inferRolesFromTags(c.id, c.tags), caps: inferCapsFromTags(c.tags) }; }
      else { map[c.id] = { ...map[c.id], caps: sumObj(map[c.id].caps, scaleObj(inferCapsFromTags(c.tags), 0.3)) }; if(!map[c.id].roles||map[c.id].roles.length===0) map[c.id].roles = inferRolesFromTags(c.id, c.tags); }
      const cc=map[c.id].caps; if((cc.MAGIC||0)===0 && (cc.PHYS||0)===0){ if (c.tags?.includes("Mage")) cc.MAGIC=2; if (c.tags?.includes("Marksman")||c.tags?.includes("Fighter")||c.tags?.includes("Assassin")) cc.PHYS=2; }
      if((cc.SAFE_BLIND||0)===0){ cc.SAFE_BLIND = clamp((cc.MOBILITY||0)*0.6 + (cc.WAVECLEAR||0)*0.7 + (cc.FRONTLINE||0)*0.3 + (cc.UTILITY||0)*0.3 + (cc.POKE||0)*0.5, 0, 3); }
    }
    return map;
  },[champions]);

  // チームプロフィール
  const profile = (ids)=>{ let v={}; for(const k of ATTRS) v[k]=0; for(const id of ids){ if(!id) continue; v=sumObj(v, capsById[id]?.caps||{}); } return v; };
  const allyProf = useMemo(()=>profile(ally),[ally,capsById]);
  const enemyProf = useMemo(()=>profile(enemy),[enemy,capsById]);

  // 欠け補正（候補計算用）
  const needWeights = useMemo(()=>{
    const out={...BASE_IMPORTANCE};
    for(const k of ATTRS){ const have=allyProf[k]||0; const m=1+Math.max(0,(IDEAL[k]-have)/10); out[k]=(out[k]||1)*m; }
    const mag=allyProf.MAGIC||0, phy=allyProf.PHYS||0; if(mag < phy*0.5) out.MAGIC*=1.8; if(phy < mag*0.5) out.PHYS*=1.8;
    if(pickRound==="1-2"){ out.SAFE_BLIND*=2.0; out.ENGAGE*=0.95; }
    if(pickRound==="3-4"){ out.SAFE_BLIND*=1.2; }
    if(pickRound==="5"){ out.SAFE_BLIND*=0.6; for(const k of ["ENGAGE","PEEL","BURST"]) out[k]*=1.05; }
    return out;
  },[allyProf,pickRound]);

  // 敵への対策重み
  const counterWeights = useMemo(()=>{
    const out={}; const ef=enemyProf.FRONTLINE||0, ep=enemyProf.POKE||0, eb=enemyProf.BURST||0, em=enemyProf.MOBILITY||0;
    if(ef>5) out.ANTI_TANK=(out.ANTI_TANK||0)+3; if(ep>4){ out.ENGAGE=(out.ENGAGE||0)+2; out.WAVECLEAR=(out.WAVECLEAR||0)+1; } if(eb>4) out.PEEL=(out.PEEL||0)+2; if(em>4) out.UTILITY=(out.UTILITY||0)+1;
    if(pickRound==="5"){ for(const k in out){ out[k]*=1.25; } }
    return out;
  },[enemyProf,pickRound]);

  // ======= 統計プロバイダ（ダミー: 接続時に有効） =======
  const backendBase = DEFAULT_HELPER_BASE;
  async function fetchRoleWR(roleKey){ const key=`${patch||''}:${roleKey}`; if(statsCache.current.roleWR[key]) return statsCache.current.roleWR[key]; try{ const url=`${backendBase}/stats/role-winrate?patch=${encodeURIComponent(patch||'')}&role=${encodeURIComponent(roleKey)}`; const res=await fetch(url); if(!res.ok) throw 0; const json=await res.json(); statsCache.current.roleWR[key]=json?.data||{}; setStatsOK(true); return statsCache.current.roleWR[key]; }catch(e){ setStatsOK(false); return {}; } }
  async function fetchMatchupWR(roleKey, champ, enemy){ const key=`${patch||''}:${roleKey}:${champ}:${enemy}`; if(statsCache.current.matchup[key]) return statsCache.current.matchup[key]; try{ const url=`${backendBase}/stats/matchup?patch=${encodeURIComponent(patch||'')}&role=${encodeURIComponent(roleKey)}&champ=${encodeURIComponent(champ)}&enemy=${encodeURIComponent(enemy)}`; const res=await fetch(url); if(!res.ok) throw 0; const json=await res.json(); statsCache.current.matchup[key]=json||{}; setStatsOK(true); return json; }catch(e){ setStatsOK(false); return {}; } }
  const shrinkDelta=(wr,n,k=600)=>{ if(!wr||!n) return 0; return (wr-0.5)*(n/(n+k)); };

  // ロビー自動取込（任意）
  useEffect(()=>{ let timer=null; async function poll(){ try{ const res=await fetch(`${backendBase}/lobby/champ-select`,{cache:'no-store'}); if(res.status===204){ setLobbyOK(false); return; } if(!res.ok){ setLobbyOK(false); return; } const json=await res.json(); if(json?.ally) setAlly(p=>JSON.stringify(p)!==JSON.stringify(json.ally)? json.ally:p); if(json?.enemy) setEnemy(p=>JSON.stringify(p)!==JSON.stringify(json.enemy)? json.enemy:p); if(json?.bans?.blue) setBansBlue(json.bans.blue.concat(Array(5).fill(null)).slice(0,5)); if(json?.bans?.red) setBansRed(json.bans.red.concat(Array(5).fill(null)).slice(0,5)); if(json?.side) setTeamSide(json.side); setLobbyOK(true);}catch(e){ setLobbyOK(false);} } timer=setInterval(poll,1500); return ()=>clearInterval(timer); },[backendBase]);

  // クリック割当/クリア
  function assignChampion(id){ if(activeSide==="ALLY"){ const n=[...ally]; n[activeSlot]=id; setAlly(n);} else if(activeSide==="ENEMY"){ const n=[...enemy]; n[activeSlot]=id; setEnemy(n);} else if(activeSide==="BAN_BLUE"){ const n=[...bansBlue]; n[activeSlot]=id; setBansBlue(n);} else if(activeSide==="BAN_RED"){ const n=[...bansRed]; n[activeSlot]=id; setBansRed(n);} }
  function clearAt(side, idx){ if(side==="ALLY"){ const n=[...ally]; n[idx]=null; setAlly(n);} else if(side==="ENEMY"){ const n=[...enemy]; n[idx]=null; setEnemy(n);} else if(side==="BAN_BLUE"){ const n=[...bansBlue]; n[idx]=null; setBansBlue(n);} else if(side==="BAN_RED"){ const n=[...bansRed]; n[idx]=null; setBansRed(n);} }
  function clearSlot(){ clearAt(activeSide, activeSlot); }
  function clearAll(){ setAlly([null,null,null,null,null]); setEnemy([null,null,null,null,null]); setBansBlue([null,null,null,null,null]); setBansRed([null,null,null,null,null]); }
  useEffect(()=>{ const onKey=(e)=>{ if(e.key==="Backspace"||e.key==="Delete"){ e.preventDefault(); clearSlot(); } }; window.addEventListener('keydown', onKey); return ()=>window.removeEventListener('keydown', onKey); },[activeSide,activeSlot,ally,enemy,bansBlue,bansRed]);

  // ===== おすすめ候補（総合） =====
  const suggestions = useMemo(()=>{
    const taken=new Set([ ...ally, ...enemy, ...bansBlue, ...bansRed ].filter(Boolean));
    const arr=[];
    for(const [id,data] of Object.entries(capsById)){
      if(taken.has(id)) continue; if(role!=="ANY" && !(data.roles||["ANY"]).includes(role)) continue;
      let score=0; const why=new Set();
      for(const k of ATTRS){ const gain=(data.caps?.[k]||0) * (needWeights?.[k]||0); score+=gain; if(gain>=6) why.add(`${labelOf(k)}を補強`); }
      for(const [k,w] of Object.entries(counterWeights||{})){ const gain=(data.caps?.[k]||0) * (w||0) * 1.2; score+=gain; if(gain>=3) why.add(`${enemyCue(k)}に強い`); }
      if(pickRound==="1-2") score *= (1 + (data.caps?.SAFE_BLIND||0)*0.05);
      const syn = synergyScore(id, ally, tagsById); if(syn.score){ score += syn.score; syn.why.forEach(w=>why.add(w)); }
      arr.push({ id, baseScore:score, score, why:Array.from(why).slice(0,4), roles:data.roles||["ANY"], caps:data.caps });
    }
    arr.sort((a,b)=>b.score-a.score); return arr.slice(0,32);
  },[ally,enemy,bansBlue,bansRed,role,capsById,needWeights,counterWeights,pickRound,tagsById]);

  function guessRoleByTeam(allyArr){ const count={TOP:0,JUNGLE:0,MID:0,ADC:0,SUPPORT:0}; for(const id of allyArr){ if(!id) continue; const rs=capsById[id]?.roles||[]; for(const r of rs){ if(count[r]!=null) count[r]++; } } return Object.entries(count).sort((a,b)=>a[1]-b[1])[0]?.[0]||"MID"; }

  // ルーン/ビルド（フォールバック）
  async function openDetail(champId){ const rkey = role==="ANY"? guessRoleByTeam(ally): role; let data=null; try{ const res = await fetch(`${DEFAULT_HELPER_BASE}/builds?patch=${encodeURIComponent(patch||'')}&role=${encodeURIComponent(rkey)}&champ=${encodeURIComponent(champId)}`); if(res.ok) data = await res.json(); }catch(e){} if(!data) data = fallbackBuild(champId, rkey); setDetailData({ champ: champId, role: rkey, ...data }); setDetailOpen(true); }
  function fallbackBuild(champ, role){ const map={ Leona:{ runes:["不滅: 余震 / 生命の泉 / 心身調整 / 生気付与","天啓: 先行投資 / 宇宙の英知"], items:["騎士の誓い","ソラリのロケット","監視者の腕輪"] }, Jinx:{ runes:["栄華: リーサルテンポ / 冷静沈着 / 伝説: 血脈 / 最後の慈悲","覇道: 血の味わい / 貪欲の賞金首狩り"], items:["ストームレイザー","インフィニティ・エッジ","RFC","PD"] }, Orianna:{ runes:["魔道: エアリー召喚 / マナフローバンド / 至高 / 追い風","天啓: ビスケット / 宇宙の英知"], items:["ルーデン","シャドーフレイム","ラバドン","ゾーニャ"] }, JarvanIV:{ runes:["栄華: 征服者 / 凱旋 / 伝説: 強靭 / 背水の陣","不滅: 打ちこわし / 心身調整"], items:["ゴアドリンカー","ブラッククリーバー","GA"] }, Lulu:{ runes:["魔道: エアリー召喚 / マナフローバンド / 追い風 / 至高","不滅: 打ちこわし / 息継ぎ"], items:["月の石","アーデント","ミカエル","流水"] }, }; return map[champ] || { runes:["標準系（ロール準拠）"], items:["メタ標準アイテム"] }; }

  // ===== 判定パラメータ =====
  const EPS = 0.25; // 微差許容（0.25未満は不足にしない）
  function baseSlackByMode(){ return strictness==='STRICT'? 0.10 : strictness==='LOOSE'? 0.35 : 0.20; }

  // ===== 動的しきい値 =====
  function effectiveThreshold(k){
    const ideal = IDEAL[k]||6; // 基準
    const impRatio = (needWeights[k]||1) / (BASE_IMPORTANCE[k]||1);
    let slack = baseSlackByMode(); // ベース
    if(impRatio < 0.9) slack += 0.10; // 重要度が低めならゆるく
    if(impRatio < 0.75) slack += 0.20;
    if(k==='SAFE_BLIND' && pickRound==='5') slack = Math.max(slack, 0.55); // ラストピックは不要視
    return ideal * (1 - clamp(slack, 0, 0.7));
  }

  // ===== チーム完成度スコア =====
  const teamScore = useMemo(()=>{
    // 各属性の達成率 r_k（0〜1）
    let sumW=0, sum=0;
    for(const k of ATTRS){
      const thr = effectiveThreshold(k);
      const have = allyProf[k]||0;
      const r = thr>0? clamp((have+EPS)/thr, 0, 1) : 1; // EPSを加味
      const w = BASE_IMPORTANCE[k]||1; // 完成度はベース重みで評価
      sumW += w; sum += r*w;
    }
    let score01 = sumW>0? (sum/sumW) : 0;
    // ダメージバランスペナルティ（偏りすぎをやや減点）
    const magR = (IDEAL.MAGIC? clamp((allyProf.MAGIC||0)/(IDEAL.MAGIC*0.85),0,1):1);
    const phyR = (IDEAL.PHYS? clamp((allyProf.PHYS||0)/(IDEAL.PHYS*0.85),0,1):1);
    const imbalance = Math.abs(magR-phyR);
    score01 -= imbalance*0.07;
    // 簡易シナジーボーナス
    const haveSet=new Set(ally.filter(Boolean));
    let synBonus=0; for(const r of TEAM_SYNERGY){ if(r.has.every(x=>haveSet.has(x))) synBonus += r.bonus; }
    score01 += synBonus;
    return Math.round(clamp(score01,0,1)*100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[allyProf,ally,pickRound,strictness]);

  function verdict(score){
    if(score>=92) return { label:"神構成", desc:"完璧に噛み合っている", style:"from-fuchsia-500 via-emerald-400 to-cyan-400 text-slate-900", ring:"ring-emerald-300" };
    if(score>=85) return { label:"超つよい", desc:"かなり理想に近い", style:"from-emerald-500 to-cyan-500 text-slate-900", ring:"ring-emerald-300" };
    if(score>=72) return { label:"つよい", desc:"実用十分", style:"from-cyan-500 to-blue-500 text-slate-900", ring:"ring-cyan-300" };
    if(score>=55) return { label:"ふつう", desc:"バランス良し", style:"from-slate-600 to-slate-700 text-white", ring:"ring-white/20" };
    if(score>=40) return { label:"弱い", desc:"要改善", style:"from-amber-600 to-orange-700 text-white", ring:"ring-amber-300" };
    return { label:"最悪構成", desc:"噛み合っていない", style:"from-rose-700 via-rose-600 to-orange-600 text-white", ring:"ring-rose-400" };
  }

  const v = verdict(teamScore);

  // ===== 不足/充足 判定 =====
  function isMissingRaw(k){
    const have = allyProf[k]||0; const thr = effectiveThreshold(k);
    // 微差は不足にしない
    if(have + EPS >= thr) return false;
    return have < thr;
  }

  function isMissing(k){
    // 高スコア時は自動緩和
    if(teamScore >= 90) return false;
    if(teamScore >= 85 && (BASE_IMPORTANCE[k]||0) <= 3) return false; // 低重要度は許容
    // MAGIC/PHYSはどちらか十分ならOK（極端な偏りだけ不足）
    if(k==='MAGIC' || k==='PHYS'){
      const thrMag = effectiveThreshold('MAGIC'), thrPhy = effectiveThreshold('PHYS');
      const haveMag = allyProf.MAGIC||0, havePhy = allyProf.PHYS||0;
      const okEither = (haveMag + EPS >= thrMag) || (havePhy + EPS >= thrPhy);
      if(okEither) return false;
      // どちらも不足気味なら、より不足している側だけ赤
      if(k==='MAGIC') return haveMag < havePhy*0.6; else return havePhy < haveMag*0.6;
    }
    return isMissingRaw(k);
  }

  // ===== 表示用の不足/充足リスト =====
  const lacking = useMemo(()=> ATTRS.filter(k=> isMissing(k)).sort((a,b)=> ((IDEAL[b]-(allyProf[b]||0)) - (IDEAL[a]-(allyProf[a]||0))) ), [allyProf,needWeights,pickRound,strictness,teamScore]);
  const sufficient = useMemo(()=> ATTRS.filter(k=> !isMissing(k)), [allyProf,needWeights,pickRound,strictness,teamScore]);

  function NeedChip({k, missing}){
    const style = missing
      ? "px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/40 hover:bg-rose-500/20 hover:text-rose-200"
      : "px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400/40";
    return (
      <button className={style} onClick={()=> missing && openNeed(k)} disabled={!missing} title={missing?"不足を補える候補を表示":"十分です"}>{labelOf(k)}</button>
    );
  }

  function gradeFromScore(score, top){ const pct = top? (score/top):0; if(pct>=0.9) return {grade:"SS", stars:5}; if(pct>=0.75) return {grade:"S", stars:5}; if(pct>=0.6) return {grade:"A", stars:4}; if(pct>=0.45) return {grade:"B", stars:3}; if(pct>=0.3) return {grade:"C", stars:2}; return {grade:"D", stars:1}; }

  function openNeed(attr){
    setNeedAttr(attr);
    const taken=new Set([ ...ally, ...enemy, ...bansBlue, ...bansRed ].filter(Boolean));
    const list=[]; const lackingSet=new Set(lacking);
    for(const [id,data] of Object.entries(capsById)){
      if(taken.has(id)) continue; if(role!=="ANY" && !(data.roles||["ANY"]).includes(role)) continue;
      const caps=data.caps||{};
      let score = (caps[attr]||0) * ((needWeights[attr]||1) + 6) * 8; // 属性重視
      for(const k of lackingSet){ if(k===attr) continue; score += (caps[k]||0) * 2.2; }
      if(pickRound==="1-2") score *= (1 + (caps.SAFE_BLIND||0)*0.04);
      const syn=synergyScore(id, ally, tagsById); score += syn.score*0.7;
      const why=[]; if((caps[attr]||0)>0) why.push(`${labelOf(attr)}を強化`); if(syn.why?.length) why.push(...syn.why);
      const also = Array.from(lackingSet).filter(k=> k!==attr && (caps[k]||0)>1).slice(0,2); if(also.length) why.push(also.map(labelOf).join("・")+"も底上げ");
      list.push({ id, score, why: Array.from(new Set(why)).slice(0,3), roles:data.roles||["ANY"] });
    }
    list.sort((a,b)=>b.score-a.score);
    const topScore=list[0]?.score||1; const enriched=list.slice(0,20).map(x=>({ ...x, ...gradeFromScore(x.score, topScore) }));
    setNeedList(enriched); setNeedOpen(true);
  }

  // ===== 🧪 かんたん動作テスト（コンソール出力） =====
  useEffect(()=>{
    // テスト1: しきい値がモードで変わる
    const saveStrict=strictness; console.log('[TEST] thr mode check');
    // eslint-disable-next-line no-unused-expressions
    (function(){
      const tmp=['STRICT','NORMAL','LOOSE'];
      tmp.forEach(m=>{ console.log('  mode', m); });
    })();
    // テスト2: 強い構成例のスコア（Leona/Jinx/JarvanIV/Orianna/Ornn）
    const ids=['Leona','Jinx','JarvanIV','Orianna','Ornn'];
    const prof={}; for(const k of ATTRS) prof[k]=0; ids.forEach(id=>{ const c=capsById[id]; if(c) for(const k of ATTRS) prof[k]+=c.caps?.[k]||0; });
    let sumW=0, sum=0; for(const k of ATTRS){ const thr=effectiveThreshold(k); const r = thr>0? clamp((prof[k]+EPS)/thr,0,1):1; const w=BASE_IMPORTANCE[k]||1; sumW+=w; sum+=r*w; }
    const scoreEx = Math.round(clamp(sum/sumW,0,1)*100);
    console.log('[TEST] sample strong comp score≈', scoreEx);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[capsById]);

  return (
    <div className={appBg}>
      {/* 背景オーバーレイ */}
      {(detailOpen||needOpen) && <div className="fixed inset-0 bg-black/40 z-40" onClick={()=>{ setDetailOpen(false); setNeedOpen(false); }} />}

      <div className={container}>
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">最適ピック提案（LoL）— Pro++</h1>
            <p className={sub}>赤=足りない / 青=足りてる。赤ラベルを押すと<strong>不足を補える候補</strong>が出ます。上部のバナーでチーム完成度を表示。</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={badge}>Patch {patch||"…"}</span>
            <span className={`${badge} ${lobbyOK?"bg-emerald-500/20 ring-emerald-400":""}`}>Lobby {lobbyOK?"connected":"searching"}</span>
          </div>
        </header>

        {/* 完成度バナー */}
        <div className={`mb-6 rounded-2xl p-5 ring-2 bg-gradient-to-r ${v.style} ${v.ring}`}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold drop-shadow">{v.label}</div>
              <div className="text-sm opacity-90">{v.desc}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs opacity-90">Team Score</div>
              <div className="text-3xl sm:text-4xl font-black tabular-nums drop-shadow">{teamScore}</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* 左: 入力 & BAN & 検索 */}
          <section className={`${panel} overflow-hidden`}>
            <h2 className={heading}>ピック入力 & 設定</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs"><span className="text-slate-400">自軍</span>{['BLUE','RED'].map(s=> <button key={s} onClick={()=>setTeamSide(s)} className={`px-2 py-1 rounded-full ring-1 ${teamSide===s?'ring-cyan-400 bg-cyan-400/20':'ring-white/10 bg-white/5 hover:bg-white/10'}`}>{s}</button>)}</div>
              <div className="flex items-center gap-1 text-xs"><span className="text-slate-400">ピック順</span>{['1-2','3-4','5'].map(s=> <button key={s} onClick={()=>setPickRound(s)} className={`px-2 py-1 rounded-full ring-1 ${pickRound===s?'ring-cyan-400 bg-cyan-400/20':'ring-white/10 bg-white/5 hover:bg-white/10'}`}>{s}</button>)}</div>
              {/* 判定の厳しさ */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-slate-400">判定</span>
                {['STRICT','NORMAL','LOOSE'].map(m=> (
                  <button key={m} onClick={()=>setStrictness(m)} className={`px-2 py-1 rounded-full ring-1 ${strictness===m?'ring-emerald-400 bg-emerald-400/20':'ring-white/10 bg-white/5 hover:bg-white/10'}`}>{m==='STRICT'? '厳しめ' : m==='LOOSE'? 'ゆるめ' : '普通'}</button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-1 text-xs"><span className="text-slate-400">自分のロール</span>{ROLES.map(r=> <button key={r} onClick={()=>setRole(r)} className={`px-2 py-1 rounded-full ring-1 ${role===r?'ring-cyan-400 bg-cyan-400/20':'ring-white/10 bg-white/5 hover:bg-white/10'}`}>{r}</button>)}</div>
            </div>

            {/* Ally / Enemy slots */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">味方</h3><span className={badge}>ALLY</span></div>
                <div className="grid grid-cols-5 gap-2">
                  {ally.map((id,i)=> (
                    <button key={`a-${i}`} onClick={()=>{setActiveSide('ALLY'); setActiveSlot(i);}} className={`relative aspect-square min-w-[84px] rounded-xl ring-2 ${activeSide==='ALLY'&&activeSlot===i?'ring-cyan-400':'ring-white/10'} overflow-hidden bg-white/5 hover:bg-white/10 transition`} title={id||'未選択'}>
                      {id? <>
                        <img src={imgById[id]} alt={id} className="w-full h-full object-cover"/>
                        <div onClick={(e)=>{ e.stopPropagation(); clearAt('ALLY', i); }} role="button" aria-label="このスロットを外す" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs flex items-center justify-center ring-1 ring-white/20">✕</div>
                      </> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">選択</div>}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2"><h3 className="font-semibold">敵</h3><span className={badge}>ENEMY</span></div>
                <div className="grid grid-cols-5 gap-2">
                  {enemy.map((id,i)=> (
                    <button key={`e-${i}`} onClick={()=>{setActiveSide('ENEMY'); setActiveSlot(i);}} className={`relative aspect-square min-w-[84px] rounded-xl ring-2 ${activeSide==='ENEMY'&&activeSlot===i?'ring-rose-400':'ring-white/10'} overflow-hidden bg-white/5 hover:bg-white/10 transition`} title={id||'未選択'}>
                      {id? <>
                        <img src={imgById[id]} alt={id} className="w-full h-full object-cover"/>
                        <div onClick={(e)=>{ e.stopPropagation(); clearAt('ENEMY', i); }} role="button" aria-label="このスロットを外す" className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white text-xs flex items-center justify-center ring-1 ring-white/20">✕</div>
                      </> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">選択</div>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 検索 & カタログ */}
            <div className="mt-6">
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="チャンピオン検索（英語名/ID）" className="w-full px-3 py-2 rounded-xl bg-white/5 ring-1 ring-white/10 focus:outline-none focus:ring-cyan-400 placeholder:text-slate-400"/>
              <div className="mt-3 grid [grid-template-columns:repeat(auto-fill,minmax(110px,1fr))] gap-3 max-h-72 overflow-auto pr-1">
                {champions.filter(c=>{ if(role!=="ANY"){ const rs=(capsById[c.id]?.roles)||["ANY"]; if(!rs.includes(role)) return false; } const q=search.trim().toLowerCase(); if(!q) return true; return c.id.toLowerCase().includes(q)||c.name.toLowerCase().includes(q); }).slice(0,160).map(c=> (
                  <button key={c.id} onClick={()=>assignChampion(c.id)} className="group relative aspect-square rounded-2xl overflow-hidden ring-1 ring-white/10 hover:ring-cyan-400 hover:scale-[1.02] transition" title={c.name}>
                    <img src={imgById[c.id]} alt={c.name} className="w-full h-full object-cover"/>
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5"><div className="text-[11px] font-semibold truncate group-hover:text-cyan-300">{c.name}</div></div>
                  </button>
                ))}
              </div>

              {/* 外す/リセット */}
              <div className="mt-3 flex items-center gap-2">
                <button onClick={clearSlot} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm">このスロットを外す（⌫）</button>
                <button onClick={clearAll} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm">全部リセット</button>
              </div>
            </div>
          </section>

          {/* 中: 能力表示（青/赤のラベル群） */}
          <section className={`${panel} overflow-hidden`}>
            <h2 className={heading}>チームの状況（青=足りてる / 赤=足りない）</h2>
            <p className="mt-1 text-xs text-slate-300">赤ラベルを押すと、その不足を補える<strong>おすすめ</strong>が開きます。判定は「厳しさ」やスコアに応じて自動調整されます。</p>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">足りてない（優先度順）</h3>
                <div className="flex flex-wrap gap-2">
                  {lacking.length? lacking.map(k=> <NeedChip key={k} k={k} missing/>) : <span className="text-xs text-slate-300">不足なし。完成！</span>}
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">足りている</h3>
                <div className="flex flex-wrap gap-2">
                  {sufficient.map(k=> <NeedChip key={k} k={k} />)}
                </div>
              </div>
            </div>
          </section>

          {/* 右: 総合おすすめ */}
          <section className={`${panel} overflow-hidden`}>
            <h2 className={heading}>総合おすすめ候補</h2>
            <p className="mt-1 text-xs text-slate-300">チーム全体の不足/相性/シナジーを総合評価。</p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {suggestions.map((s,i)=> (
                <motion.button key={s.id} onClick={()=>openDetail(s.id)} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}} className="text-left rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/5 hover:bg-white/10 transition">
                  <div className="flex gap-3 p-3 items-center">
                    <div className="w-18 h-18 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0"><img src={imgById[s.id]} alt={s.id} className="w-full h-full object-cover"/></div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate text-sm">{s.id}</div>
                      <div className="mt-1 flex flex-wrap gap-1">{(s.roles||["ANY"]).slice(0,3).map(r=> <span key={r} className={badge}>{r}</span>)}</div>
                      {s.why?.length>0 && <div className="mt-1 text-[11px] text-slate-300">{s.why.join("・")}</div>}
                    </div>
                    <div className="ml-auto text-right"><div className="text-xs text-slate-400">Score</div><div className="font-bold tabular-nums">{Math.round(s.score)}</div></div>
                  </div>
                </motion.button>
              ))}
              {suggestions.length===0 && <div className="text-sm text-slate-400">候補がありません。ロール/BAN/ピック順を見直してみてください。</div>}
            </div>
          </section>
        </div>

        {/* 不足能力 — 候補モーダル */}
        {needOpen && (
          <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-slate-950 ring-1 ring-white/10 shadow-2xl p-5 overflow-auto z-50">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold">不足: {labelOf(needAttr)} を補えるチャンピオン</div>
              <button onClick={()=>setNeedOpen(false)} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm">閉じる</button>
            </div>
            <p className="text-xs text-slate-300 mb-3">クリックで<strong>現在のスロット</strong>に割り当て。S &gt; A &gt; B … の順におすすめ。</p>
            <div className="grid grid-cols-1 gap-3">
              {needList.map((s,i)=> (
                <motion.button key={s.id} onClick={()=>{ assignChampion(s.id); setNeedOpen(false); }} initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} transition={{delay:i*0.02}} className="text-left rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/5 hover:bg-white/10">
                  <div className="flex gap-3 p-3 items-center">
                    <div className="w-16 h-16 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0"><img src={imgById[s.id]} alt={s.id} className="w-full h-full object-cover"/></div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{s.id} <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-white/10 ring-1 ring-white/10">おすすめ度 {s.grade}</span></div>
                      <div className="mt-1 text-[11px] text-slate-300">{s.why?.join("・")}</div>
                      <div className="mt-1 text-[11px] text-amber-300">{"★".repeat(s.stars)}{"☆".repeat(5-s.stars)}</div>
                    </div>
                    <div className="ml-auto text-right"><div className="text-xs text-slate-400">Score</div><div className="font-bold tabular-nums">{Math.round(s.score)}</div></div>
                  </div>
                </motion.button>
              ))}
              {needList.length===0 && <div className="text-sm text-slate-400">該当候補が見つかりませんでした。ロールやBAN状況を確認してください。</div>}
            </div>
          </div>
        )}

        {/* ルーン/ビルド 詳細サイドパネル */}
        {detailOpen && (
          <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] bg-slate-950 ring-1 ring-white/10 shadow-2xl p-5 overflow-auto z-50">
            <div className="flex items-center justify-between mb-4">
              <div className="text-lg font-bold">{detailData?.champ} — {detailData?.role}</div>
              <button onClick={()=>setDetailOpen(false)} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15 ring-1 ring-white/10 text-sm">閉じる</button>
            </div>
            <div className="flex gap-3 mb-3 items-center">
              <div className="w-20 h-20 rounded-xl overflow-hidden ring-1 ring-white/10"><img src={imgById[detailData?.champ]} alt={detailData?.champ} className="w-full h-full object-cover"/></div>
              <div className="text-xs text-slate-300">Patch {patch||'…'} / 参考ビルド</div>
            </div>
            <div className="mb-4">
              <div className="font-semibold mb-1">推奨ルーン</div>
              <ul className="list-disc list-inside text-sm text-slate-200 space-y-1">{(detailData?.runes||[]).map((r,i)=><li key={i}>{r}</li>)}</ul>
            </div>
            <div className="mb-4">
              <div className="font-semibold mb-1">推奨アイテム</div>
              <ul className="list-disc list-inside text-sm text-slate-200 space-y-1">{(detailData?.items||[]).map((it,i)=><li key={i}>{it}</li>)}</ul>
            </div>
            <div className="text-xs text-slate-400">※ 実ビルドはメタ/相手構成で変化。バックエンドが有効なら統計ベースで更新されます。</div>
          </div>
        )}

        <footer className="mt-8 text-center text-xs text-slate-400">© Pick Advisor — unofficial. Images via Riot Data Dragon.</footer>
      </div>
    </div>
  );
}
