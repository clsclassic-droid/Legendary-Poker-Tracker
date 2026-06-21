import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbxfxhH1jGwsIJMUBHypzz5VZrKpnfDL2pgJePObM-JvXIp5CjAWaIH_4g1fJQXYjS03bA/exec";
const LOGO_SRC = "https://raw.githubusercontent.com/clsclassic-droid/Legendary-Poker-Tracker/main/src/f512d9a54b54e5e327ac49c65c60695a.jpeg";
const BG_SRC   = "https://github.com/clsclassic-droid/Legendary-Poker-Tracker/blob/main/sidebar-bg.jpg?raw=true";

// ─────────────────────────────────────────────────────────────────
// GOOGLE SHEETS API LAYER
// ─────────────────────────────────────────────────────────────────
async function apiGet() {
  const res = await fetch(API_URL + "?action=getData");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  const d = json.data;
  if (!d.nicknames) d.nicknames = {};
  if (d.settings) {
    // parse nicknames from settings if stored as key=value string
    const nk = d.settings?.nicknames;
    if (nk && typeof nk === 'string') {
      d.nicknames = Object.fromEntries(nk.split(',').map(p => p.split(':').map(s=>s.trim())).filter(p=>p.length===2));
    }
  }
  if (d.sessions) {
    d.sessions = d.sessions.map(s => {
      // date: strip time component
      const dateStr = String(s.date || "").slice(0, 10);
      // year/season: use stored values, fallback to computing from date
      let year   = Number(s.year)      || 0;
      let season = Number(s.season)    || 0;
      if ((!year || !season) && dateStr.length === 10) {
        const computed = (() => {
          const dt = new Date(dateStr + "T00:00:00");
          return { year: dt.getFullYear(), season: Math.ceil((dt.getMonth()+1)/3) };
        })();
        if (!year)   year   = computed.year;
        if (!season) season = computed.season;
      }
      return {
        ...s,
        year, season,
        sessionNo: Number(s.sessionNo) || 0,
        fee:       Number(s.fee)       || 0,
        date:      dateStr,
        rate: {
          chips: Number(s.rate?.chips) || 1000,
          baht:  Number(s.rate?.baht)  || 200,
        },
        entries: (s.entries || []).map(e => ({
          ...e,
          buyInChips:   Number(e.buyInChips)   || 0,
          cashOutChips: Number(e.cashOutChips) || 0,
          buyInBaht:    Number(e.buyInBaht)    || 0,
          cashOutBaht:  Number(e.cashOutBaht)  || 0,
          profitBaht:   Number(e.profitBaht)   || 0,
        })),
      };
    });
  }
  return d;
}
async function apiPost(body) {
  const res = await fetch(API_URL, { method:"POST", body:JSON.stringify(body) });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error);
  return json;
}


// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
const S_SHORT = ["","ม.ค.–มี.ค.","เม.ย.–มิ.ย.","ก.ค.–ก.ย.","ต.ค.–ธ.ค."];
const S_LABEL = ["","มกราคม–มีนาคม","เมษายน–มิถุนายน","กรกฎาคม–กันยายน","ตุลาคม–ธันวาคม"];

function dateToSeason(str) {
  const d = new Date(str + "T00:00:00");
  return { year: d.getFullYear(), season: Math.ceil((d.getMonth() + 1) / 3) };
}
function sesLabel(s) { return "ปี " + s.year + " ซีซั่น " + s.season + " เซสชั่น " + s.sessionNo; }
const c2b = (chips, r) => Math.round((chips / r.chips) * r.baht);
const b2c = (baht,  r) => Math.round((baht  / r.baht)  * r.chips);
const profit = (buy, sell, r) => c2b(sell - buy, r);
const fmt = n => { const v = Number(n) || 0; return v === 0 ? "0" : v.toLocaleString(); };

// ── Nickname helpers ──────────────────────────────────────────────
function getNick(player, nicknames) {
  return (nicknames || {})[player] || null;
}
function PlayerName({ player, nicknames, className="", block=false }) {
  const nick = getNick(player, nicknames);
  if (block && nick) {
    return (
      <span className={className}>
        <span className="block font-semibold">{player}</span>
        <span className="block text-zinc-500 font-normal text-xs">"{nick}"</span>
      </span>
    );
  }
  return (
    <span className={className}>
      {player}
      {nick && <span className="text-zinc-500 font-normal text-xs ml-1.5">"{nick}"</span>}
    </span>
  );
}

function ranked(entries) {
  return [...entries].sort((a,b) => b.profitBaht - a.profitBaht).map((e,i) => ({...e, rank: i+1}));
}

function buildSummary(players, sessions) {
  const map = {};
  players.forEach(p => { map[p] = { name:p, total:0, n:0, gold:0, silver:0, bronze:0, last:0, best:null, worst:null }; });
  sessions.forEach(s => {
    const r = ranked(s.entries);
    const lastRank = r.length;
    r.forEach(e => {
      if (!map[e.player]) map[e.player] = { name:e.player, total:0, n:0, gold:0, silver:0, bronze:0, last:0, best:null, worst:null };
      const p = map[e.player];
      p.total += e.profitBaht; p.n++;
      if (e.rank===1) p.gold++;
      if (e.rank===2) p.silver++;
      if (e.rank===3) p.bronze++;
      if (e.rank===lastRank && r.length>1) p.last++;
      if (p.best===null  || e.profitBaht > p.best)  p.best  = e.profitBaht;
      if (p.worst===null || e.profitBaht < p.worst) p.worst = e.profitBaht;
    });
  });
  return Object.values(map)
    .sort((a,b) => b.total - a.total)
    .map((p,i) => ({...p, rank: p.n > 0 ? i+1 : "-"}));
}

// ─────────────────────────────────────────────────────────────────
// UI ATOMS
// ─────────────────────────────────────────────────────────────────
function Profit({ v, sx="" }) {
  const cls = v > 0 ? "text-emerald-400" : v < 0 ? "text-red-400" : "text-zinc-500";
  const txt = v > 0 ? "+" + fmt(v) : fmt(v);
  return <span className={cls + " font-mono font-semibold text-sm"}>{txt}{sx}</span>;
}
function NInput({ value, onChange, ph="0" }) {
  return (
    <input type="number" value={value||""} placeholder={ph}
      onChange={e => onChange(Number(e.target.value)||0)}
      className="w-full border border-zinc-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.08)"}} />
  );
}
function Box({ children, className="" }) {
  return <div className={"border border-zinc-700/25 rounded-2xl p-4 " + className}
    style={{background:'rgba(15,10,3,0.05)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)'}}
  >{children}</div>;
}

// ─────────────────────────────────────────────────────────────────
// MINI CHART (กำไรสะสม + อันดับ)
// ─────────────────────────────────────────────────────────────────
function MiniChart({ player, sessions }) {
  const [mode, setMode] = useState("profit");
  const [hov,  setHov]  = useState(null);

  const pts = useMemo(() => {
    let cum = 0;
    return sessions
      .map(s => ({ s, e: s.entries.find(x => x.player===player) }))
      .filter(x => x.e)
      .map((x, i) => {
        cum += x.e.profitBaht;
        // คำนวณ rank จาก profitBaht เสมอ (Sheets อาจไม่มี rank field)
        const r = ranked(x.s.entries);
        const myRank = r.find(e => e.player === player)?.rank ?? 0;
        return { i, label:"S"+x.s.season+"#"+x.s.sessionNo, date:x.s.date,
          p: x.e.profitBaht, cum, rank: myRank, tot: x.s.entries.length };
      });
  }, [player, sessions]);

  if (pts.length < 2) return (
    <div className="border border-zinc-700/25 rounded-2xl p-6 text-center" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
      <div className="text-3xl mb-2">📈</div>
      <div className="text-zinc-400 text-sm font-medium">ยังไม่มีกราฟ</div>
      <div className="text-zinc-600 text-xs mt-1">ต้องมีอย่างน้อย 2 เซสขึ้นไป<br/>ปัจจุบันเล่นไป {pts.length} เซส</div>
    </div>
  );

  // ── ขยายกราฟ ──────────────────────────────────────────────
  const W=400, H=200, PL=44, PR=12, PT=16, PB=28;
  const cW=W-PL-PR, cH=H-PT-PB;

  const vals = mode==="profit" ? pts.map(x=>x.cum) : pts.map(x=>x.rank);

  // rank mode: ใช้ขอบ 1..tot แทน min/max จริง → จุดอยู่บรรทัดตรงเสมอ
  const maxTot = mode==="rank" ? Math.max(...pts.map(p=>p.tot)) : 0;
  const mn  = mode==="profit" ? Math.min(...vals) : 1;
  const mx  = mode==="profit" ? Math.max(...vals) : maxTot;
  const rng = mx - mn || 1;

  // rank: #1=ดีสุด → Y บนสุด (PT), #maxTot → Y ล่างสุด (PT+cH)
  //   formula: toY(1)=PT, toY(maxTot)=PT+cH  →  PT + (v-1)/(maxTot-1)*cH
  // profit: สูง=ดี → Y บนสุด
  //   formula: toY(mx)=PT, toY(mn)=PT+cH  →  PT + cH - (v-mn)/rng*cH
  const toY = v => mode==="rank"
    ? PT + ((v - 1) / (maxTot - 1 || 1)) * cH
    : PT + cH - ((v - mn) / rng) * cH;
  const toX = i => PL + (i / (pts.length - 1)) * cW;

  const path = pts.map((p,i) => (i===0?"M":"L")+" "+toX(i).toFixed(1)+" "+toY(vals[i]).toFixed(1)).join(" ");

  // rank mode → ไม่มี fill (เส้นล้วน), profit → fill ตามปกติ
  const fillBase = PT + cH;
  const fill = path+" L "+toX(pts.length-1).toFixed(1)+" "+fillBase+" L "+PL+" "+fillBase+" Z";

  const up = mode==="profit" ? vals[vals.length-1] >= vals[0] : vals[vals.length-1] <= vals[0];
  const lc = mode==="profit" ? (up?"#34d399":"#f87171") : "#f0b429";
  const fc = mode==="profit" ? (up?"rgba(52,211,153,.07)":"rgba(248,113,113,.07)") : "none";

  const h = hov!==null ? pts[hov] : null;
  // ซ่อน dots เมื่อเซสเยอะ — hover ยังแสดงเสมอ
  const showDots = pts.length <= 40;
  // strokeWidth บางลงเมื่อเซสเยอะ
  const sw = pts.length > 50 ? "1" : "1.5";

  // Y-axis grid: rank→ แสดงทุก rank (1..maxTot), profit→ 3 จุด
  const gridTicks = mode==="rank"
    ? Array.from({length: maxTot}, (_,i) => {
        const v = i + 1;
        return { y: toY(v), v };
      })
    : [0, 0.5, 1].map(t => ({
        y: PT + cH * t,
        v: Math.round(mx - rng * t),
      }));

  return (
    <Box>
      <div className="flex items-center justify-between mb-2">
        <span className="text-zinc-400 text-xs font-semibold">{mode==="profit"?"📈 กำไรสะสม":"🏅 อันดับแต่ละเซส"}</span>
        <div className="flex rounded-lg p-0.5 gap-0.5" style={{background:"rgba(255,255,255,0.08)"}}>
          {[["profit","📈"],["rank","🏅"]].map(([id,icon]) => (
            <button key={id} onClick={()=>{setMode(id);setHov(null);}}
              className={"px-2.5 py-1 rounded-md text-xs font-semibold transition-all " + (mode===id?"bg-amber-500 text-black":"text-zinc-400 hover:text-white")}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div className="relative" onMouseLeave={()=>setHov(null)}>
        <svg viewBox={"0 0 "+W+" "+H} className="w-full" style={{height:190}}>
          {gridTicks.map(({y,v},i) => (
            <g key={i}>
              <line x1={PL} y1={y} x2={W-PR} y2={y} stroke="#3f3f46" strokeWidth=".5" strokeDasharray="3,3"/>
              <text x={PL-4} y={y+4} textAnchor="end" fontSize="9" fill="#71717a" fontFamily="monospace">
                {mode==="profit" ? (v>0?"+":"")+(v/1000).toFixed(1)+"k" : "#"+v}
              </text>
            </g>
          ))}
          {mode==="profit" && mn<0 && mx>0 && (
            <line x1={PL} y1={toY(0)} x2={W-PR} y2={toY(0)} stroke="#52525b" strokeWidth="1" strokeDasharray="4,2"/>
          )}
          {mode==="profit" && <path d={fill} fill={fc}/>}
          <path d={path} fill="none" stroke={lc} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"/>
          {pts.map((p,i) => (
            <g key={i}>
              <rect
                x={i===0?PL:(toX(i-1)+toX(i))/2} y={PT}
                width={i===0?(toX(0)+toX(1))/2-PL : i===pts.length-1?W-PR-(toX(i-1)+toX(i))/2 : (toX(i)+toX(i+1))/2-(toX(i-1)+toX(i))/2}
                height={cH} fill="transparent"
                style={{cursor:"pointer"}}
                onMouseEnter={()=>setHov(i)}
                onTouchStart={()=>setHov(hov===i?null:i)}
              />
              {(showDots || hov===i) && (
                <circle cx={toX(i)} cy={toY(vals[i])} r={hov===i?5:2.5}
                  fill={hov===i?lc:"#18181b"} stroke={lc} strokeWidth={hov===i?2:1.5}/>
              )}
            </g>
          ))}
          {hov!==null && <line x1={toX(hov)} y1={PT} x2={toX(hov)} y2={PT+cH} stroke={lc} strokeWidth="1" strokeDasharray="3,2" opacity=".5"/>}

        </svg>

        {h && (
          <div className="absolute border border-zinc-700/30 rounded-xl px-3 py-2 text-xs shadow-xl pointer-events-none z-10"
            style={{left:Math.min(Math.max((hov/(pts.length-1))*100,8),65)+"%", top:"2px", transform:"translateX(-50%)", minWidth:"110px", background:"rgba(20,12,2,0.9)", backdropFilter:"blur(12px)"}}>
            <div className="text-amber-300 font-bold mb-1">{h.label}</div>
            {mode==="profit"
              ? <><div className="flex justify-between gap-2"><span className="text-zinc-400">เซสนี้</span><Profit v={h.p} sx=" ฿"/></div>
                  <div className="flex justify-between gap-2 mt-0.5"><span className="text-zinc-400">สะสม</span><Profit v={h.cum} sx=" ฿"/></div></>
              : <><div className="flex justify-between gap-2"><span className="text-zinc-400">อันดับ</span><span className="text-amber-300 font-mono font-bold">#{h.rank}/{h.tot}</span></div>
                  <div className="flex justify-between gap-2 mt-0.5"><span className="text-zinc-400">กำไร</span><Profit v={h.p} sx=" ฿"/></div></>
            }
          </div>
        )}
      </div>

      <div className="flex justify-between mt-1 text-xs font-mono text-zinc-600">
        <span>{pts[0].label}</span>
        <span className={up?(mode==="profit"?"text-emerald-400":"text-amber-400"):(mode==="profit"?"text-red-400":"text-red-400")}>
          {mode==="profit" ? ((pts[pts.length-1].cum>0?"+":"")+fmt(pts[pts.length-1].cum)+" ฿")
                           : ("เฉลี่ย #"+(pts.reduce((s,p)=>s+p.rank,0)/pts.length).toFixed(1))}
        </span>
        <span>{pts[pts.length-1].label}</span>
      </div>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────
function DashboardView({ data, onGoLeader, onGoLatestSes, onGoPot }) {
  const latest  = data.sessions[data.sessions.length-1] ?? null;
  const summary = useMemo(() => buildSummary(data.players, data.sessions), [data]);
  const leader  = summary.find(p => p.n > 0) ?? null;
  const pot     = data.pot?.balance ?? 0;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">📊 ภาพรวม</h2>

      <div className="grid grid-cols-3 gap-3">
        {/* Leader — กดแล้วไปหน้า profile ผู้นำ */}
        <button onClick={()=>leader&&onGoLeader(leader.name)}
          className="border border-amber-500/40 rounded-2xl p-3 text-left hover:border-amber-400/70 transition-colors" style={{background:"rgba(25,14,2,0.06)",backdropFilter:"blur(6px)"}}>
          <div className="text-amber-400 text-xs font-semibold mb-1">🏆 นำอยู่</div>
          {leader
            ? <>
                <div className="text-white font-black text-lg leading-none">{leader.name}</div>
                <Profit v={leader.total} sx=" ฿"/>
                <div className="text-zinc-500 text-[10px] mt-1">{leader.n} เซสชั่น · 🥇×{leader.gold}</div>
              </>
            : <div className="text-zinc-600 text-xs">ยังไม่มีข้อมูล</div>}
        </button>
        {/* Latest session — กดแล้วไปหน้าเซสชั่น พร้อมเปิดเซสล่าสุด */}
        <button onClick={()=>latest&&onGoLatestSes(latest.internalId)}
          className="border border-zinc-700/25 rounded-2xl p-3 text-left hover:border-zinc-600 transition-colors" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
          <div className="text-sky-400 text-xs font-semibold mb-1">📋 เซสล่าสุด</div>
          {latest
            ? <>
                <div className="text-white font-black text-sm">ปี {latest.year}</div>
                <div className="text-amber-300 text-sm font-bold">S{latest.season} เซสชั่น {latest.sessionNo}</div>
                <div className="text-zinc-500 text-[10px] mt-1">{String(latest.date||"").slice(0,10)}</div>
              </>
            : <div className="text-zinc-600 text-xs">ยังไม่มีเซส</div>}
        </button>
        {/* Pot — กดแล้วไปหน้ากองกลาง */}
        <button onClick={onGoPot}
          className="border border-purple-500/30 rounded-2xl p-3 text-left hover:border-purple-400/60 transition-colors" style={{background:"rgba(15,8,25,0.06)",backdropFilter:"blur(6px)"}}>
          <div className="text-purple-400 text-xs font-semibold mb-1">💰 กองกลาง</div>
          <div className={"font-mono font-black text-lg " + (pot>=0?"text-purple-300":"text-red-400")}>{fmt(pot)} ฿</div>
          <div className="text-zinc-600 text-[10px] mt-1">{data.sessions.length} เซสชั่น · {data.players.length} คน</div>
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          ["เซสทั้งหมด", data.sessions.length,                                        "text-white"],
          ["ผู้เล่น",    data.players.length,                                          "text-white"],
          ["ซีซั่น",     latest ? "S"+latest.season+"/"+latest.year : "-",             "text-amber-300"],
          ["ปีนี้",      data.sessions.filter(s=>s.year===new Date().getFullYear()).length, "text-sky-300"],
        ].map(([label,value,color]) => (
          <div key={label} className="border border-zinc-700/25 rounded-xl px-2 py-2 text-center" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
            <div className={"font-mono font-black text-lg "+color}>{value}</div>
            <div className="text-zinc-600 text-[10px] mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Top 3 */}
      {summary.filter(p=>p.n>0).length > 0 && (
        <Box>
          <div className="text-zinc-400 text-xs font-semibold mb-3">🏅 Top 3 ตอนนี้</div>
          <div className="space-y-2">
            {summary.filter(p=>p.n>0).slice(0,3).map((p,i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-lg">{["🥇","🥈","🥉"][i]}</span>
                <span className="text-white font-semibold flex-1"><PlayerName player={p.name} nicknames={data.nicknames}/></span>
                <div className="flex gap-1 text-xs">
                  {p.gold>0   && <span className="text-amber-300">🥇{p.gold}</span>}
                  {p.silver>0 && <span className="text-zinc-300">🥈{p.silver}</span>}
                  {p.last>0   && <span className="text-red-400">💀{p.last}</span>}
                </div>
                <Profit v={p.total} sx=" ฿"/>
              </div>
            ))}
          </div>
        </Box>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PLAYER PROFILES
// ─────────────────────────────────────────────────────────────────
function PlayerProfilesView({ data, initialSel=null, onClearSel }) {
  const [sel, setSel] = useState(initialSel);
  const summary = useMemo(() => buildSummary(data.players, data.sessions), [data]);

  if (sel) {
    const stats = summary.find(p=>p.name===sel) ?? { name:sel, total:0, n:0, gold:0, silver:0, bronze:0, last:0, best:null, worst:null, rank:"-" };
    const winRate = stats.n > 0 ? Math.round((stats.gold/stats.n)*100) : 0;
    const history = data.sessions
      .map(s => {
        const e = s.entries.find(e => e.player === sel);
        if (!e) return null;
        const r = ranked(s.entries);
        const myRank = r.find(x => x.player === sel)?.rank ?? 0;
        return { s, e: { ...e, rank: myRank } };
      })
      .filter(x => x);

    // nav: เรียงตาม summary (leaderboard order)
    const ranked_players = summary.filter(p => p.n > 0);
    const curIdx = ranked_players.findIndex(p => p.name === sel);
    const prevPlayer = curIdx > 0 ? ranked_players[curIdx - 1] : null;
    const nextPlayer = curIdx < ranked_players.length - 1 ? ranked_players[curIdx + 1] : null;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {/* ปุ่ม back: วงกลมสีทอง */}
          <button onClick={()=>setSel(null)}
            className="w-9 h-9 rounded-full bg-amber-400 hover:bg-amber-300 flex items-center justify-center flex-shrink-0 transition-colors">
            <span className="text-black font-bold text-base">‹</span>
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white">{sel}</h2>
            <div className="text-zinc-500 text-xs">อันดับ <span className="text-amber-300 font-bold">{stats.rank}</span> · {stats.n} เซสชั่น</div>
          </div>
          {/* ปุ่ม nav ← → แบบ B: สี่เหลี่ยมมน border ทอง */}
          <div className="flex gap-2 flex-shrink-0">
            {prevPlayer ? (
              <div className="flex flex-col items-center gap-0.5">
                <button onClick={()=>setSel(prevPlayer.name)}
                  className="w-10 h-10 rounded-xl border-2 border-amber-400 hover:bg-amber-400/10 flex items-center justify-center transition-colors">
                  <span className="text-amber-400 font-bold text-lg">‹</span>
                </button>
                <span className="text-zinc-600 text-[10px]">ก่อนหน้า</span>
              </div>
            ) : <div className="w-10"/>}
            {nextPlayer ? (
              <div className="flex flex-col items-center gap-0.5">
                <button onClick={()=>setSel(nextPlayer.name)}
                  className="w-10 h-10 rounded-xl border-2 border-amber-400 hover:bg-amber-400/10 flex items-center justify-center transition-colors">
                  <span className="text-amber-400 font-bold text-lg">›</span>
                </button>
                <span className="text-zinc-600 text-[10px]">ถัดไป</span>
              </div>
            ) : <div className="w-10"/>}
          </div>
        </div>

        {/* Total */}
        <div className="text-center py-4 border border-zinc-700/25 rounded-2xl" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
          <div className="text-zinc-500 text-sm mb-1">กำไร / ขาดทุนรวม</div>
          <div className={"font-mono font-black text-4xl "+(stats.total>=0?"text-emerald-400":"text-red-400")}>
            {stats.total>0?"+":""}{fmt(stats.total)} ฿
          </div>
          <div className="text-zinc-600 text-xs mt-1">จาก {stats.n} เซสชั่น</div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Win Rate", winRate+"%",                                     "text-amber-300"],
            ["ดีที่สุด",  stats.best!==null  ? (stats.best>0?"+":"")+fmt(stats.best) : "-", "text-emerald-400"],
            ["แย่ที่สุด", stats.worst!==null ? fmt(stats.worst)     : "-", "text-red-400"],
          ].map(([label,value,color]) => (
            <div key={label} className="border border-zinc-700/25 rounded-xl p-3 text-center" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
              <div className={"font-mono font-bold text-lg "+color}>{value}</div>
              <div className="text-zinc-600 text-xs mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Chart */}
        <MiniChart player={sel} sessions={data.sessions}/>

        {/* Medals */}
        <Box>
          <div className="text-zinc-400 text-xs font-semibold mb-3">🏅 เหรียญรางวัล</div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["🥇",stats.gold,"ทอง","text-amber-300"],["🥈",stats.silver,"เงิน","text-zinc-300"],
              ["🥉",stats.bronze,"ทองแดง","text-orange-300"],["💀",stats.last,"โหล่","text-red-400"]].map(([emoji,count,label,color]) => (
              <div key={label} className="rounded-xl p-2" style={{background:"rgba(255,255,255,0.05)"}}>
                <div className="text-xl">{emoji}</div>
                <div className={"font-mono font-black text-xl "+color}>{count}</div>
                <div className="text-zinc-600 text-[10px]">{label}</div>
              </div>
            ))}
          </div>
        </Box>

        {/* History */}
        <div>
          <div className="text-zinc-400 text-xs font-semibold mb-2">📋 ประวัติแต่ละเซส</div>
          <div className="space-y-1.5">
            {history.map((x,i) => {
              const lastRank = ranked(x.s.entries).length;
              const myRank  = ranked(x.s.entries).find(r => r.player === sel)?.rank ?? 0;
              const em = myRank===1?"🥇":myRank===2?"🥈":myRank===3?"🥉":myRank===lastRank?"💀":"#"+myRank;
              return (
                <div key={i} className="flex items-center justify-between border border-zinc-700/25 rounded-xl px-3 py-2" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{em}</span>
                    <div>
                      <div className="text-xs font-mono text-zinc-400">S{x.s.season} เซสชั่น{x.s.sessionNo}</div>
                      <div className="text-zinc-600 text-[10px]">{x.s.date?.slice(0,10) ?? x.s.date}</div>
                    </div>
                  </div>
                  <Profit v={x.e.profitBaht} sx=" ฿"/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Player list
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">👤 Player Profiles</h2>
      <p className="text-zinc-500 text-sm">กดชื่อเพื่อดูสถิติและกราฟ</p>
      <div className="space-y-2">
        {summary.map(p => (
          <button key={p.name} onClick={()=>setSel(p.name)}
            className="w-full flex items-center gap-3 border border-zinc-700/25 hover:border-zinc-600/70 rounded-2xl px-4 py-3 text-left transition-colors" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
            <div className="w-9 h-9 rounded-xl border border-zinc-700/25 flex items-center justify-center text-lg flex-shrink-0" style={{background:"rgba(255,255,255,0.07)"}}>
              {p.rank===1 ? "🥇" : p.rank===2 ? "🥈" : p.rank===3 ? "🥉" : "🃏"}
            </div>
            <div className="flex-1">
              <div className="text-white font-bold"><PlayerName player={p.name} nicknames={data.nicknames}/></div>
              <div className="text-zinc-500 text-xs">{p.n} เซสชั่น · Win rate {p.n>0?Math.round((p.gold/p.n)*100):0}%</div>
            </div>
            <div className="flex gap-1 text-xs mr-2">
              {p.gold>0   && <span className="bg-amber-500/20 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full">🥇{p.gold}</span>}
              {p.silver>0 && <span className=" border border-zinc-600 text-zinc-300 px-1.5 py-0.5 rounded-full">🥈{p.silver}</span>}
              {p.last>0   && <span className="bg-red-900/30 border border-red-700/30 text-red-400 px-1.5 py-0.5 rounded-full">💀{p.last}</span>}
            </div>
            <div className="text-right flex-shrink-0">
              <Profit v={p.total} sx=" ฿"/>
            </div>
            <span className="text-zinc-600">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// RACING BAR CHART
// ─────────────────────────────────────────────────────────────────
function RacingBarChart({ sessions, players, nicknames }) {
  const [curSes, setCurSes] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const COLORS = ['#f0b429','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c','#4ade80','#f472b6','#94a3b8','#fbbf24','#e2e8f0','#c084fc'];
  const ROW_H = 42; // height per row in px

  const colorMap = useMemo(() => {
    const m = {};
    players.forEach((p,i) => { m[p] = COLORS[i % COLORS.length]; });
    return m;
  }, [players]);

  const cumulData = useMemo(() => {
    const cum = {};
    players.forEach(p => { cum[p] = []; });
    let running = {};
    players.forEach(p => { running[p] = 0; });
    sessions.forEach(s => {
      s.entries.forEach(e => {
        if (running[e.player] !== undefined) running[e.player] += e.profitBaht;
      });
      players.forEach(p => { cum[p].push(running[p] || 0); });
    });
    return cum;
  }, [sessions, players]);

  const total = sessions.length;

  function getScores(si) {
    return players
      .map(p => ({ name: p, profit: (cumulData[p]?.[si] ?? 0), color: colorMap[p], nick: (nicknames||{})[p]||'' }))
      .sort((a,b) => b.profit - a.profit);
  }

  useEffect(() => {
    if (!playing) return;
    if (curSes >= total - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setCurSes(s => s + 1), 600 / speed);
    return () => clearTimeout(t);
  }, [playing, curSes, speed, total]);

  function togglePlay() {
    if (curSes >= total - 1) setCurSes(0);
    setPlaying(p => !p);
  }

  const scores = getScores(curSes);
  const maxAbs = Math.max(...scores.map(s => Math.abs(s.profit)), 1);

  // ── Animated display values (วิ่งทีละ 10) ──
  const [displayVals, setDisplayVals] = useState(() => {
    const m = {};
    players.forEach(p => { m[p] = 0; });
    return m;
  });
  const animRef = useState({})[0]; // store per-player interval refs

  useEffect(() => {
    scores.forEach(s => {
      const target = s.profit;
      const current = displayVals[s.name] ?? 0;
      if (current === target) return;

      // clear existing
      if (animRef[s.name]) clearInterval(animRef[s.name]);

      const step = 10;
      const diff = target - current;
      const steps = Math.ceil(Math.abs(diff) / step);
      const dur = speed === 4 ? 80 : speed === 2 ? 150 : 300; // ms total
      const interval = Math.max(10, Math.floor(dur / steps));

      animRef[s.name] = setInterval(() => {
        setDisplayVals(prev => {
          const cur = prev[s.name] ?? 0;
          if (cur === target) {
            clearInterval(animRef[s.name]);
            return prev;
          }
          const remaining = target - cur;
          const move = remaining > 0
            ? Math.min(step, remaining)
            : Math.max(-step, remaining);
          const next = cur + move;
          if (next === target) clearInterval(animRef[s.name]);
          return { ...prev, [s.name]: next };
        });
      }, interval);
    });
  }, [curSes]);

  if (total === 0) return null;

  const containerHeight = players.length * ROW_H;

  return (
    <div className="border border-zinc-700/25 rounded-2xl p-4 space-y-3" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-white font-bold text-sm">🏆 Ranking Race</div>
          <div className="text-zinc-500 text-xs">กำไรสะสมแต่ละเซส</div>
        </div>
        <div className="bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1 text-amber-400 font-mono font-bold text-xs">
          เซส {curSes + 1} / {total}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={togglePlay}
          className={"px-3 py-1.5 rounded-lg text-xs font-bold transition-colors " + (playing ? " text-white" : "bg-amber-500 text-black")}>
          {playing ? "⏸ หยุด" : "▶ Play"}
        </button>
        <button onClick={() => { setPlaying(false); setCurSes(0); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white border border-zinc-700/30 transition-colors" style={{background:"rgba(255,255,255,0.06)"}}>
          ↺ Reset
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-zinc-600 text-xs">ความเร็ว:</span>
          {[1,2,4].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={"px-2 py-1 rounded-md text-xs border transition-colors " + (speed===s ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-white/5 text-zinc-500 border-zinc-700/30")}>
              {s}×
            </button>
          ))}
        </div>
      </div>

      {/* Slider */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-600 text-[10px] font-mono flex-shrink-0">เซสชั่น 1</span>
        <input type="range" min={0} max={total-1} value={curSes}
          onChange={e => { setPlaying(false); setCurSes(Number(e.target.value)); }}
          className="flex-1 h-1 rounded-full appearance-none  accent-amber-400 cursor-pointer"/>
        <span className="text-zinc-600 text-[10px] font-mono flex-shrink-0">เซสชั่น {total}</span>
      </div>

      {/* Animated Bars — absolute positioned so rows animate up/down */}
      <div className="relative w-full" style={{ height: containerHeight + 'px' }}>
        {scores.map((s, rankIdx) => {
          const pct = Math.max(2, (Math.abs(s.profit) / maxAbs) * 94);
          const isPos = s.profit >= 0;
          const yPos = rankIdx * ROW_H;
          const dur = speed === 4 ? '0.1s' : speed === 2 ? '0.2s' : '0.4s';
          return (
            <div
              key={s.name}
              className="absolute w-full flex items-center gap-2"
              style={{
                top: 0,
                transform: `translateY(${yPos}px)`,
                transition: `transform ${dur} cubic-bezier(0.4,0,0.2,1)`,
                height: ROW_H + 'px',
              }}
            >
              {/* Rank badge */}
              <div className="flex-shrink-0 text-center" style={{width:'22px'}}>
                <span className="text-[10px] font-bold text-zinc-500">#{rankIdx+1}</span>
              </div>
              {/* Name */}
              <div className="flex-shrink-0 text-right" style={{width:'60px'}}>
                <div className="text-xs font-bold leading-tight truncate" style={{color: s.color}}>{s.name}</div>
                {s.nick && <div className="text-[9px] text-zinc-600 truncate">"{s.nick}"</div>}
              </div>
              {/* Bar */}
              <div className="flex-1 rounded-lg overflow-hidden relative" style={{background:"rgba(255,255,255,0.06)",height:'30px'}}>
                <div
                  className="h-full rounded-lg flex items-center justify-end pr-2" 
                  style={{
                    width: pct + '%',
                    background: isPos ? s.color : 'rgba(248,113,113,0.6)',
                    transition: `width ${dur} ease`,
                    minWidth: '4px',
                  }}>
                  <span className="text-[10px] font-bold font-mono whitespace-nowrap"
                    style={{color: isPos ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)'}}>
                    {(displayVals[s.name] ?? 0) >= 0 ? '+' : ''}{fmt(displayVals[s.name] ?? 0)} ฿
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Session dots */}
      <div className="flex gap-1 flex-wrap pt-1">
        {sessions.map((_, i) => (
          <div key={i} onClick={() => { setPlaying(false); setCurSes(i); }}
            className="cursor-pointer rounded-full transition-all"
            style={{
              width: i === curSes ? '8px' : '5px',
              height: i === curSes ? '8px' : '5px',
              background: i < curSes ? 'rgba(240,180,41,0.4)' : i === curSes ? '#f0b429' : '#333',
              marginTop: i === curSes ? '0px' : '1.5px',
            }}
          />
        ))}
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────
// RACE VIEW (standalone page)
// ─────────────────────────────────────────────────────────────────
function RaceView({ data }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">🏎️ Ranking Race</h2>
      <p className="text-zinc-500 text-sm">กำไรสะสมแต่ละเซสชั่น</p>
      {data.sessions.length > 1
        ? <RacingBarChart sessions={data.sessions} players={data.players} nicknames={data.nicknames}/>
        : <Box><div className="text-center py-12 text-zinc-600"><div className="text-4xl mb-3">🏎️</div>ต้องมีอย่างน้อย 2 เซสชั่นขึ้นไป</div></Box>
      }
    </div>
  );
}

function LeaderboardView({ data }) {
  const [filter, setFilter] = useState("all");

  const seasonKeys = useMemo(() => [...new Set(data.sessions.map(s=>s.year+"-"+s.season))].sort((a,b)=>b.localeCompare(a)), [data.sessions]);
  const yearKeys   = useMemo(() => [...new Set(data.sessions.map(s=>String(s.year)))].sort((a,b)=>b-a), [data.sessions]);
  const latest     = data.sessions[data.sessions.length-1] ?? null;

  const filtered = useMemo(() => {
    if (filter==="all")            return data.sessions;
    if (filter==="latest")         return latest ? [latest] : [];
    if (filter.startsWith("sea:")) { const [y,s]=filter.slice(4).split("-").map(Number); return data.sessions.filter(x=>x.year===y&&x.season===s); }
    if (filter.startsWith("yr:"))  { const y=Number(filter.slice(3)); return data.sessions.filter(x=>x.year===y); }
    if (filter.startsWith("sid:")) { const id=Number(filter.slice(4)); return data.sessions.filter(x=>x.internalId===id); }
    return data.sessions;
  }, [data.sessions, filter, latest]);

  const summary = useMemo(() => buildSummary(data.players, filtered), [data.players, filtered]);
  const top3 = summary.filter(p=>p.n>0).slice(0,3);
  const MEDAL = ["🥇","🥈","🥉"];
  const GRAD  = ["bg-gradient-to-br from-amber-900/40 to-amber-700/10 border-amber-500/40","bg-gradient-to-br from-zinc-700/40 to-zinc-600/10 border-zinc-500/40","bg-gradient-to-br from-orange-900/30 to-orange-800/10 border-orange-700/40"];

  const filterLabel = filter==="all" ? "ทั้งหมด ("+data.sessions.length+" เซส)"
    : filter==="latest" && latest ? "เซสล่าสุด — "+sesLabel(latest)
    : filter.startsWith("sea:") ? (()=>{const[y,s]=filter.slice(4).split("-");return "ปี "+y+" ซีซั่น "+s;})()
    : filter.startsWith("yr:")  ? "ปี "+filter.slice(3)
    : filter.startsWith("sid:") ? (()=>{const id=Number(filter.slice(4));const s=data.sessions.find(x=>x.internalId===id);return s?sesLabel(s):"-";})()
    : "-";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">🏆 Leaderboard</h2>
        <p className="text-zinc-500 text-sm mt-0.5">แสดงผล: <span className="text-amber-300">{filterLabel}</span></p>
      </div>

      {/* Filter — minimal */}
      <div className="space-y-2">
        {/* Chips row */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            ["all",    "ทั้งหมด"],
            ["latest", "ล่าสุด"],
            ...yearKeys.map(y => ["yr:"+y, "ปี "+y]),
          ].map(([key, label]) => (
            <button key={key} onClick={()=>{setFilter(key);}}
              className={"px-3 py-1.5 rounded-full text-xs font-medium border transition-colors flex-shrink-0 "+(
                filter===key
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/40"
                  : "bg-transparent text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600"
              )}>
              {label}
            </button>
          ))}
        </div>
        {/* 2 dropdowns — filtered by selected year/season */}
        <div className="flex gap-2">
          {/* Season dropdown: show only seasons of selected year */}
          <select
            value={filter.startsWith("sea:")?filter:""}
            onChange={e=>e.target.value&&setFilter(e.target.value)}
            className={"flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition-colors "+(filter.startsWith("sea:")?"bg-amber-500/10 border-amber-500/40 text-amber-400":"bg-white/5 border-zinc-700/30 text-zinc-400 focus:border-zinc-500")}>
            <option value="">ซีซั่น</option>
            {seasonKeys
              .filter(k => {
                if (!filter.startsWith("yr:")) return true;
                const selYear = filter.slice(3);
                return k.startsWith(selYear+"-");
              })
              .map(k=>{
                const[y,s]=k.split("-");
                return <option key={k} value={"sea:"+k}>ปี {y} S{s} ({S_SHORT[Number(s)]})</option>;
              })}
          </select>
          {/* Session dropdown: filtered by year and/or season */}
          <select
            value={filter.startsWith("sid:")?filter:""}
            onChange={e=>e.target.value&&setFilter(e.target.value)}
            className={"flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition-colors "+(filter.startsWith("sid:")?"bg-amber-500/10 border-amber-500/40 text-amber-400":"bg-white/5 border-zinc-700/30 text-zinc-400 focus:border-zinc-500")}>
            <option value="">เซสชั่น</option>
            {[...data.sessions]
              .reverse()
              .filter(s => {
                if (filter.startsWith("yr:")) {
                  return String(s.year) === filter.slice(3);
                }
                if (filter.startsWith("sea:")) {
                  const [y,se] = filter.slice(4).split("-").map(Number);
                  return s.year===y && s.season===se;
                }
                return true;
              })
              .map(s=><option key={s.internalId} value={"sid:"+s.internalId}>{sesLabel(s)}</option>)}
          </select>
        </div>
      </div>


      {filtered.length===0 ? (
        <Box><div className="text-center py-8 text-zinc-600"><div className="text-3xl mb-2">🃏</div>ไม่มีข้อมูลในช่วงที่เลือก</div></Box>
      ) : (
        <>
          {top3.length>0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {top3.map((p,i) => (
                <div key={p.name} className={"rounded-2xl border p-4 "+GRAD[i]}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{MEDAL[i]}</span>
                    <div>
                      <div className="text-white font-bold text-lg leading-tight">{p.name}</div>
                      <div className="text-xs font-normal" style={{color:"rgba(255,255,255,0.4)"}}>
                        {(data.nicknames||{})[p.name] ? `"${(data.nicknames||{})[p.name]}"` : "—"}
                      </div>
                    </div>
                  </div>
                  <div className={"font-mono text-2xl font-black mt-1 "+(p.total>=0?"text-emerald-400":"text-red-400")}>{p.total>0?"+":""}{fmt(p.total)} ฿</div>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                    {p.gold>0   && <span className="bg-amber-500/20 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full">🥇×{p.gold}</span>}
                    {p.silver>0 && <span className=" border border-zinc-400/30 text-zinc-300 px-1.5 py-0.5 rounded-full">🥈×{p.silver}</span>}
                    {p.bronze>0 && <span className="bg-orange-700/20 border border-orange-700/30 text-orange-300 px-1.5 py-0.5 rounded-full">🥉×{p.bronze}</span>}
                    {p.last>0   && <span className="bg-red-900/30 border border-red-700/30 text-red-400 px-1.5 py-0.5 rounded-full">💀×{p.last}</span>}
                    <span className=" border border-zinc-600/40 text-zinc-500 px-1.5 py-0.5 rounded-full">{p.n} เซสชั่น</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Box className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-800 text-zinc-400 bg-transparent">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">ผู้เล่น</th>
                  <th className="px-2 py-2 text-right">กำไร/ขาดทุน (฿)</th>
                  <th className="px-2 py-2 text-center">🥇</th><th className="px-2 py-2 text-center">🥈</th>
                  <th className="px-2 py-2 text-center">🥉</th><th className="px-2 py-2 text-center">💀</th>
                  <th className="px-1 py-2 text-right hidden sm:table-cell w-16">เซสชั่น</th>
                </tr></thead>
                <tbody>
                  {summary.map(p => (
                    <tr key={p.name} className="border-b border-zinc-800/50 hover:bg-white/5 transition-colors">
                      <td className="px-2 py-2.5 text-zinc-500 font-mono text-xs">{p.rank}</td>
                      <td className="px-3 py-2 font-semibold text-white">
                        <div className="font-semibold text-white text-sm">{p.name}</div>
                        {(data.nicknames||{})[p.name]
                          ? <div className="text-zinc-500 text-xs font-normal">"{(data.nicknames||{})[p.name]}"</div>
                          : null}
                      </td>
                      <td className="px-2 py-2 text-right"><Profit v={p.total} sx=" ฿"/></td>
                      <td className="px-2 py-2 text-center font-mono text-amber-400 font-semibold">{p.gold>0?p.gold:<span className="text-zinc-700">-</span>}</td>
                      <td className="px-2 py-2 text-center font-mono text-zinc-300 font-semibold">{p.silver>0?p.silver:<span className="text-zinc-700">-</span>}</td>
                      <td className="px-2 py-2 text-center font-mono text-orange-400 font-semibold">{p.bronze>0?p.bronze:<span className="text-zinc-700">-</span>}</td>
                      <td className="px-2 py-2 text-center font-mono text-red-400 font-semibold">{p.last>0?p.last:<span className="text-zinc-700">-</span>}</td>
                      <td className="px-1 py-2 text-right text-zinc-400 hidden sm:table-cell font-mono w-16">{p.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        </>
      )}

    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────────
function SessionsView({ data, onEdit, onDelete, initialOpen=null }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">📋 ประวัติเซสชั่น</h2>
      {data.sessions.length===0 && <Box><div className="text-center py-12 text-zinc-600"><div className="text-4xl mb-3">🃏</div>ยังไม่มีเซสชั่น</div></Box>}
      {[...data.sessions].reverse().map(s => {
        const r = ranked(s.entries);
        const isOpen = open===s.internalId;
        const pot = s.entries.reduce((a,e)=>a+e.buyInBaht,0);
        const fee = s.entries.length*s.fee;
        return (
          <div key={s.internalId} className="border border-zinc-700/25 rounded-2xl overflow-hidden" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
            <button className="w-full flex items-center justify-between px-4 py-4 hover:bg-white/5 transition-colors text-left" onClick={()=>setOpen(isOpen?null:s.internalId)}>
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <div className="text-amber-400 font-bold font-mono text-base">เซสชั่น {s.sessionNo}</div>
                  <div className="text-zinc-600 text-[10px] font-mono">S{s.season}/{s.year}</div>
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{String(s.date || "").slice(0,10)}</div>
                  <div className="text-zinc-500 text-xs">{s.entries.length} ผู้เล่น · {fmt(pot)} ฿ · <span className="text-purple-400">ส่วนกลาง {fmt(fee)} ฿</span></div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                  <div className="text-emerald-400 text-sm font-semibold">🥇 <PlayerName player={r[0]?.player||''} nicknames={data.nicknames}/></div>
                  <div className="text-emerald-300 text-xs font-mono">+{fmt(r[0]?.profitBaht)} ฿</div>
                </div>
                <span className="text-zinc-500">{isOpen?"▲":"▼"}</span>
              </div>
            </button>
            {isOpen && (
              <div className="border-t border-zinc-800 px-4 pb-4">
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="bg-amber-900/30 border border-amber-700/40 text-amber-300 px-3 py-1 rounded-full font-mono">🎰 {fmt(s.rate.chips)} ชิป = {fmt(s.rate.baht)} ฿</span>
                  <span className="bg-purple-900/30 border border-purple-700/40 text-purple-300 px-3 py-1 rounded-full font-mono">📦 {fmt(s.fee)} ฿/คน</span>
                </div>
                <div className="overflow-x-auto mt-3">
                  <table className="w-full text-sm">
                    <thead><tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="py-2 text-left">#</th><th className="py-2 text-left">ผู้เล่น</th>
                      <th className="py-2 text-right">ซื้อ(ชิป)</th><th className="py-2 text-right">แลก(ชิป)</th>
                      <th className="py-2 text-right hidden sm:table-cell">ซื้อ(฿)</th><th className="py-2 text-right hidden sm:table-cell">แลก(฿)</th>
                      <th className="py-2 text-right">กำไร(฿)</th>
                    </tr></thead>
                    <tbody>{r.map(e => (
                      <tr key={e.player} className="border-b border-zinc-800/30">
                        <td className="py-2 text-zinc-500">{e.rank}</td>
                        <td className="py-2 font-medium text-white"><PlayerName player={e.player} nicknames={data.nicknames}/></td>
                        <td className="py-2 text-right font-mono text-zinc-400">{fmt(e.buyInChips)}</td>
                        <td className="py-2 text-right font-mono text-zinc-400">{fmt(e.cashOutChips)}</td>
                        <td className="py-2 text-right font-mono text-zinc-500 hidden sm:table-cell">{fmt(e.buyInBaht)}</td>
                        <td className="py-2 text-right font-mono text-zinc-500 hidden sm:table-cell">{fmt(e.cashOutBaht)}</td>
                        <td className="py-2 text-right"><Profit v={e.profitBaht} sx=" ฿"/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {s.note && <p className="mt-3 text-zinc-500 text-sm rounded-lg px-3 py-2" style={{background:"rgba(255,255,255,0.06)"}}>📝 {s.note}</p>}
                {(onEdit || onDelete) && (
                  <div className="flex gap-2 mt-4 justify-end">
                    {onEdit   && <button onClick={()=>onEdit(s)} className="px-4 py-1.5 rounded-lg  hover:bg-zinc-600 text-white text-sm">✏️ แก้ไข</button>}
                    {onDelete && <button onClick={()=>onDelete(s.internalId)} className="px-4 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-800/50 text-red-400 text-sm">🗑️ ลบ</button>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SESSION FORM
// ─────────────────────────────────────────────────────────────────
function SessionForm({ data, editSession, onSave, onCancel, saving }) {
  const today = new Date().toISOString().slice(0,10);
  const [date, setDate]   = useState(editSession?.date ?? today);
  const [note, setNote]   = useState(editSession?.note ?? "");
  const [rate, setRate]   = useState(editSession?.rate ?? {...data.chipRate});
  const [fee,  setFee]    = useState(editSession?.fee  ?? data.defaultFee);
  const [mode, setMode]   = useState("chips");
  const [qv,   setQv]     = useState(0);
  const [qok,  setQok]    = useState(false);
  const [errs, setErrs]   = useState({});
  const [rows, setRows]   = useState(
    editSession ? editSession.entries.map(e=>({player:e.player, buy:e.buyInChips, sell:e.cashOutChips}))
                : data.players.map(p=>({player:p, buy:0, sell:0}))
  );

  const {year, season} = useMemo(() => date ? dateToSeason(date) : {year:null,season:null}, [date]);
  const sameSes = useMemo(() => data.sessions.filter(s=>s.year===year&&s.season===season&&s.internalId!==editSession?.internalId), [data.sessions,year,season,editSession]);
  const autoNo  = useMemo(() => editSession ? editSession.sessionNo : sameSes.length===0 ? 1 : Math.max(...sameSes.map(s=>s.sessionNo))+1, [editSession,sameSes]);
  const [sesNo, setSesNo] = useState(autoNo);
  useEffect(()=>{ if(!editSession) setSesNo(autoNo); },[autoNo,editSession]);
  const isDup = sameSes.some(s=>s.sessionNo===sesNo);

  const gc = v => mode==="baht" ? b2c(v,rate) : v;
  const dv = c => mode==="baht" ? c2b(c,rate) : c;
  const upd = (i,field,v) => { const n=[...rows]; n[i]={...n[i],[field]:gc(v)}; setRows(n); };

  const totBuy  = rows.reduce((s,r)=>s+r.buy,0);
  const totSell = rows.reduce((s,r)=>s+r.sell,0);
  const bal     = totBuy===totSell;
  const diff    = totSell-totBuy;
  const active  = rows.filter(r=>r.buy>0||r.sell>0).length;

  function applyQF() {
    if (!qv) return;
    setRows(rows.map(r=>({...r, buy:gc(qv)})));
    setQok(true); setTimeout(()=>setQok(false),1500);
  }

  function save() {
    const e = {};
    if (!date)             e.date   = "กรุณาเลือกวันที่";
    if (!sesNo||sesNo<1)   e.sesNo  = "หมายเลขไม่ถูกต้อง";
    if (isDup)             e.sesNo  = "เซสชั่นที่ "+sesNo+" มีอยู่แล้วในซีซั่นนี้";
    if (!bal)              e.bal    = "ชิปไม่สมดุล";
    if (rate.chips<=0||rate.baht<=0) e.rate = "อัตราต้องมากกว่า 0";
    setErrs(e);
    if (Object.keys(e).length) return;
    const clean = rows.filter(r=>r.buy>0||r.sell>0);
    onSave({
      internalId: editSession?.internalId ?? data.nextInternalId,
      year, season, sessionNo:sesNo, date, note, rate, fee,
      entries: clean.map(r=>({
        player:r.player, buyInChips:r.buy, cashOutChips:r.sell,
        buyInBaht:c2b(r.buy,rate), cashOutBaht:c2b(r.sell,rate),
        profitBaht:profit(r.buy,r.sell,rate)
      }))
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">{editSession?"✏️ แก้ไขเซสชั่น":"➕ บันทึกเซสชั่นใหม่"}</h2>
        {onCancel && <button onClick={onCancel} className="text-zinc-500 hover:text-white text-sm">ยกเลิก ✕</button>}
      </div>

      {/* Date + Note */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-zinc-400 text-sm mb-1">📅 วันที่เล่น</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            className="w-full border border-zinc-600 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.08)"}}/>
          {errs.date && <p className="text-red-400 text-xs mt-1">{errs.date}</p>}
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-1">📝 หมายเหตุ</label>
          <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="เช่น บ้านแนน..."
            className="w-full border border-zinc-600/60 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.06)"}}/>
        </div>
      </div>

      {/* Season badge */}
      {year && season && (
        <div className="bg-gradient-to-r from-sky-900/30 to-zinc-900/10 border border-sky-700/40 rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-sky-400 text-xs font-semibold mb-1">📌 คำนวณจากวันที่</div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-bold text-lg">ปี {year}</span>
                <span className="bg-sky-500/20 border border-sky-500/40 text-sky-300 px-3 py-0.5 rounded-full font-mono text-sm font-bold">ซีซั่น {season}</span>
                <span className="text-zinc-500 text-sm">{S_SHORT[season]}</span>
              </div>
              <div className="text-zinc-600 text-xs mt-1">{sameSes.length>0?"ซีซั่นนี้มี "+sameSes.length+" เซสแล้ว":"เซสแรกของซีซั่นนี้!"}</div>
            </div>
            <div className="sm:w-36">
              <div className="text-amber-400 text-xs font-semibold mb-1">🎯 เซสชั่นที่</div>
              <div className="flex items-center gap-1">
                <button onClick={()=>setSesNo(n=>Math.max(1,n-1))} className="w-8 h-9 rounded-lg  hover:bg-zinc-600 text-white font-bold text-lg flex-shrink-0">−</button>
                <input type="number" min="1" value={sesNo} onChange={e=>setSesNo(Number(e.target.value)||1)}
                  className={"w-full text-center border border-zinc-600/60 rounded-lg py-1.5 text-white font-mono font-bold text-xl focus:outline-none "+(isDup?"border-red-500":"border-zinc-600 focus:border-amber-500")}/>
                <button onClick={()=>setSesNo(n=>n+1)} className="w-8 h-9 rounded-lg  hover:bg-zinc-600 text-white font-bold text-lg flex-shrink-0">+</button>
              </div>
              {errs.sesNo ? <p className="text-red-400 text-xs mt-1 text-center">{errs.sesNo}</p> : <p className="text-zinc-600 text-xs mt-1 text-center">ปรับได้</p>}
            </div>
          </div>
          <div className="mt-3 rounded-xl px-3 py-2 text-center">
            <span className="text-amber-300 font-bold font-mono text-sm">📋 ปี {year} · ซีซั่น {season} · เซสชั่นที่ {sesNo}</span>
          </div>
        </div>
      )}

      {/* Rate + Fee */}
      <Box className="space-y-3">
        <div className="text-zinc-300 font-semibold text-sm">⚙️ ตั้งค่าเซสชั่นนี้</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-xl p-3 space-y-2" style={{background:"rgba(255,255,255,0.06)"}}>
            <div className="text-amber-400 text-xs font-semibold">🎰 อัตราแลกชิป</div>
            <div className="flex items-center gap-2">
              <div className="flex-1"><label className="text-zinc-500 text-xs">ชิป</label><NInput value={rate.chips} onChange={v=>setRate(r=>({...r,chips:v}))}/></div>
              <span className="text-zinc-500 mt-4">=</span>
              <div className="flex-1"><label className="text-zinc-500 text-xs">บาท</label><NInput value={rate.baht} onChange={v=>setRate(r=>({...r,baht:v}))}/></div>
            </div>
            <div className="text-zinc-500 text-xs font-mono">1 ชิป ≈ {rate.chips>0?(rate.baht/rate.chips).toFixed(4):0} ฿</div>
            {errs.rate && <p className="text-red-400 text-xs">{errs.rate}</p>}
          </div>
          <div className="rounded-xl p-3 space-y-2" style={{background:"rgba(255,255,255,0.06)"}}>
            <div className="text-purple-400 text-xs font-semibold">📦 ค่าส่วนกลาง/คน</div>
            <NInput value={fee} onChange={setFee}/>
            <div className="text-zinc-500 text-xs font-mono">{active} คน × {fmt(fee)} = <span className="text-purple-300">{fmt(active*fee)} ฿</span></div>
          </div>
        </div>
      </Box>

      {/* Quick Fill */}
      <div className="bg-gradient-to-r from-amber-900/30 to-zinc-900/20 border border-amber-600/40 rounded-2xl p-4">
        <div className="text-amber-300 text-sm font-bold mb-1">⚡ ซื้อชิปเหมือนกันทุกคน</div>
        <div className="text-zinc-600 text-xs mb-3">กรอกครั้งเดียว ใส่ทุกคนพร้อมกัน</div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-zinc-500 text-xs">{mode==="baht"?"บาท":"ชิป"}ที่ซื้อ</label>
            <NInput value={qv} onChange={setQv} ph={mode==="chips"?"1,000":"200"}/>
            {qv>0 && <div className="text-zinc-600 text-xs mt-0.5 font-mono">= {fmt(mode==="chips"?c2b(qv,rate):b2c(qv,rate))} {mode==="chips"?"฿":"ชิป"}/คน</div>}
          </div>
          <div className="flex flex-col gap-1.5">
            <button onClick={applyQF} className={"px-4 py-2.5 rounded-xl font-bold text-sm transition-all "+(qok?"bg-emerald-500 text-white":"bg-amber-500 hover:bg-amber-400 text-black")}>
              {qok ? "✅ ใส่แล้ว!" : "ใส่ทุกคน"}
            </button>
            <button onClick={()=>setRows(rows.map(r=>({...r,buy:0})))} className="px-4 py-1.5 rounded-xl text-zinc-500 hover:text-white text-xs border border-zinc-700 transition-colors">ล้างค่า</button>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 text-sm">กรอกเป็น:</span>
        <div className="flex rounded-lg p-0.5" style={{background:"rgba(255,255,255,0.08)"}}>
          {[["chips","🎰 ชิป"],["baht","💵 บาท"]].map(([m,label]) => (
            <button key={m} onClick={()=>setMode(m)} className={"px-4 py-1.5 rounded-md text-sm font-medium transition-colors "+(mode===m?"bg-amber-500 text-black":"text-zinc-400 hover:text-white")}>{label}</button>
          ))}
        </div>
      </div>

      {/* Balance */}
      <div className={"rounded-xl px-4 py-3 border "+(bal?"bg-emerald-900/20 border-emerald-700/40":"bg-red-900/20 border-red-700/40")}>
        <div className="flex items-center justify-between gap-4">
          <span className={"text-sm font-medium flex-shrink-0 "+(bal?"text-emerald-400":"text-red-400")}>{bal?"✅ ยอดสมดุล":"⚠️ ยอดไม่สมดุล"}</span>
          <div className="text-xs font-mono text-right space-y-0.5">
            <div className="text-zinc-400">ซื้อ <span className="text-white">{fmt(totBuy)}</span> ชิป</div>
            <div className="text-zinc-400">แลก <span className="text-white">{fmt(totSell)}</span> ชิป</div>
            {!bal && (
              <div className={"border-t pt-0.5 "+(diff>0?"border-emerald-700/40":"border-red-700/40")}>
                <span className="text-zinc-500">ต่าง </span>
                <span className={diff>0?"text-emerald-400 font-bold":"text-red-400 font-bold"}>{diff>0?"+":""}{fmt(diff)} ชิป · {diff>0?"+":"-"}{fmt(c2b(Math.abs(diff),rate))} ฿</span>
                <span className={"ml-1 "+(diff>0?"text-emerald-600":"text-red-600")}>({diff>0?"เกิน":"ขาด"})</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {errs.bal && <p className="text-red-400 text-sm text-center">{errs.bal}</p>}

      {/* Entries */}
      <Box className="overflow-hidden p-0">
        <div className="px-4 py-3 border-b border-zinc-800 text-zinc-400 text-sm flex justify-between items-center">
          <span>บันทึกชิปแต่ละคน ({mode==="chips"?"ชิป":"บาท"})</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-600">{active}/{rows.length} คน</span>
            {/* ปุ่มเพิ่มผู้เล่น — แสดงเฉพาะตอนแก้ไข และมีคนที่ยังไม่ได้อยู่ในรายการ */}
            {(() => {
              const inRows = rows.map(r => r.player);
              const available = data.players.filter(p => !inRows.includes(p));
              if (available.length === 0) return null;
              return (
                <div className="relative group">
                  <button className="text-xs px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 hover:bg-amber-500/25 transition-colors">
                    + เพิ่มผู้เล่น
                  </button>
                  <div className="absolute right-0 top-full mt-1 border border-zinc-700/30 rounded-xl shadow-xl z-20 hidden gro" style={{background:"rgba(15,10,3,0.92)",backdropFilter:"blur(16px)"}} className="group-hover:block group-focus-within:block min-w-[120px]">
                    {available.map(p => (
                      <button key={p} onClick={() => setRows(prev => [...prev, {player:p, buy:0, sell:0}])}
                        className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-white/10 hover:text-white transition-colors first:rounded-t-xl last:rounded-b-xl">
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="divide-y divide-zinc-800">
          {rows.map((r,i) => {
            const pb  = profit(r.buy, r.sell, rate);
            const act = r.buy>0 || r.sell>0;
            return (
              <div key={r.player} className={"px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 "+(act?"":"opacity-50")}>
                <div className="flex items-center gap-2 min-w-[80px]">
                  <span className={"w-2 h-2 rounded-full flex-shrink-0 "+(pb>0?"bg-emerald-400":pb<0?"bg-red-400":"")}/>
                  <span className="text-white font-medium"><PlayerName player={r.player} nicknames={data.nicknames}/></span>
                  <button onClick={() => setRows(prev => prev.filter(x => x.player !== r.player))}
                    className="ml-1 text-zinc-600 hover:text-red-400 text-xs transition-colors">✕</button>
                </div>
                <div className="flex gap-2 flex-1">
                  <div className="flex-1">
                    <label className="text-zinc-600 text-xs">ซื้อ {mode==="baht"?"(฿)":"(ชิป)"}</label>
                    <NInput value={dv(r.buy)} onChange={v=>upd(i,"buy",v)}/>
                    {r.buy>0 && <div className="text-zinc-600 text-xs mt-0.5 font-mono">= {mode==="chips"?fmt(c2b(r.buy,rate))+" ฿":fmt(r.buy)+" ชิป"}</div>}
                  </div>
                  <div className="flex-1">
                    <label className="text-zinc-600 text-xs">แลก {mode==="baht"?"(฿)":"(ชิป)"}</label>
                    <NInput value={dv(r.sell)} onChange={v=>upd(i,"sell",v)}/>
                    {r.sell>0 && <div className="text-zinc-600 text-xs mt-0.5 font-mono">= {mode==="chips"?fmt(c2b(r.sell,rate))+" ฿":fmt(r.sell)+" ชิป"}</div>}
                  </div>
                </div>
                <div className="text-right min-w-[90px]">
                  <div className="text-xs text-zinc-600">กำไร/ขาดทุน</div>
                  <Profit v={pb} sx=" ฿"/>
                  {act && <div className="text-purple-400 text-xs font-mono">-{fmt(fee)} ฿ ส่วนกลาง</div>}
                  {act && <Profit v={pb-fee} sx=" ฿ สุทธิ"/>}
                </div>
              </div>
            );
          })}
        </div>
      </Box>

      <button onClick={save} disabled={saving}
        className={"w-full py-3 rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-2 "+(saving?"bg-amber-500/50 text-black":"bg-amber-500 hover:bg-amber-400 text-black")}>
        {saving ? <><span className="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"/>{" กำลังบันทึก..."}</> : (editSession?"💾 บันทึกการแก้ไข":"💾 บันทึกเซสชั่น")}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// POT
// ─────────────────────────────────────────────────────────────────
function PotView({ data, onAddTx, onDeleteTx, saving }) {
  const pot = data.pot || {balance:0,transactions:[]};
  const [add,  setAdd]  = useState(false);
  const [type, setType] = useState("income");
  const [amt,  setAmt]  = useState(0);
  const [txt,  setTxt]  = useState("");
  const [dt,   setDt]   = useState(new Date().toISOString().slice(0,10));
  const [err,  setErr]  = useState("");

  const inc = Math.abs(pot.transactions.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0)) || 0;
  const exp = Math.abs(pot.transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0)) || 0;

  function submit() {
    if (!amt||amt<=0) { setErr("กรุณาระบุจำนวนเงิน"); return; }
    if (!txt.trim())  { setErr("กรุณาระบุรายการ"); return; }
    setErr("");
    const tx = {id:Date.now(),type,amount:amt,note:txt.trim(),date:dt};
    onAddTx(tx);
    setAmt(0); setTxt(""); setAdd(false);
  }
  function del(id) { onDeleteTx(id); }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold text-white">💰 กองกลาง</h2><p className="text-zinc-500 text-sm">รายรับ-รายจ่ายเงินส่วนกลาง</p></div>
        {onAddTx && <button onClick={()=>setAdd(!add)} className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm">{add?"ยกเลิก":"+ เพิ่มรายการ"}</button>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-emerald-900/20 border border-emerald-700/30 rounded-2xl p-3 text-center"><div className="text-emerald-400 text-xs font-semibold mb-1">รายรับรวม</div><div className="text-emerald-300 font-mono font-black text-lg">{inc>0?"+":""}{fmt(inc)}</div><div className="text-zinc-600 text-xs">฿</div></div>
        <div className="bg-red-900/20 border border-red-700/30 rounded-2xl p-3 text-center"><div className="text-red-400 text-xs font-semibold mb-1">รายจ่ายรวม</div><div className="text-red-400 font-mono font-black text-lg">{exp > 0 ? "-" : ""}{fmt(exp)}</div><div className="text-zinc-600 text-xs">฿</div></div>
        <div className={"border rounded-2xl p-3 text-center "+(pot.balance>=0?"bg-amber-900/20 border-amber-700/30":"bg-red-900/30 border-red-700/40")}><div className="text-amber-400 text-xs font-semibold mb-1">คงเหลือ</div><div className={"font-mono font-black text-xl "+(pot.balance>=0?"text-amber-300":"text-red-400")}>{fmt(pot.balance)}</div><div className="text-zinc-600 text-xs">฿</div></div>
      </div>
      {add && (
        <Box className="space-y-3">
          <div className="text-zinc-300 font-semibold text-sm">เพิ่มรายการ</div>
          <div className="flex rounded-lg p-0.5" style={{background:"rgba(255,255,255,0.08)"}}>
            <button onClick={()=>setType("income")}  className={"flex-1 py-2 rounded-md text-sm font-medium transition-colors "+(type==="income"?"bg-emerald-600 text-white":"text-zinc-400 hover:text-white")}>➕ รายรับ</button>
            <button onClick={()=>setType("expense")} className={"flex-1 py-2 rounded-md text-sm font-medium transition-colors "+(type==="expense"?"bg-red-600 text-white":"text-zinc-400 hover:text-white")}>➖ รายจ่าย</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-zinc-500 text-xs">วันที่</label><input type="date" value={dt} onChange={e=>setDt(e.target.value)} className="w-full border border-zinc-600/60 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.06)"}}/></div>
            <div><label className="text-zinc-500 text-xs">จำนวนเงิน (฿)</label><NInput value={amt} onChange={setAmt}/></div>
          </div>
          <div><label className="text-zinc-500 text-xs">รายการ</label><input type="text" value={txt} onChange={e=>setTxt(e.target.value)} placeholder="เช่น ค่าอาหาร..." className="w-full border border-zinc-600/60 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/></div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <button onClick={submit} className={"w-full py-2.5 rounded-xl font-bold text-sm text-white transition-colors "+(type==="income"?"bg-emerald-600 hover:bg-emerald-500":"bg-red-600 hover:bg-red-500")}>บันทึกรายการ</button>
        </Box>
      )}
      <div className="space-y-2">
        <div className="text-zinc-500 text-xs font-semibold">ประวัติรายการ ({pot.transactions.length})</div>
        {pot.transactions.length===0 && <Box><div className="text-center py-6 text-zinc-600 text-sm">ยังไม่มีรายการ</div></Box>}
        {pot.transactions.map(tx => (
          <div key={tx.id} className="flex items-center justify-between border border-zinc-700/25 rounded-xl px-4 py-3" style={{background:"rgba(15,10,3,0.05)",backdropFilter:"blur(6px)"}}>
            <div className="flex items-center gap-3">
              <span className={"text-lg "+(tx.type==="income"?"text-emerald-400":"text-red-400")}>{tx.type==="income"?"➕":"➖"}</span>
              <div><div className="text-white text-sm font-medium">{tx.note}</div><div className="text-zinc-600 text-xs">{String(tx.date||"").slice(0,10)}</div></div>
            </div>
            <div className="flex items-center gap-3">
              <span className={"font-mono font-semibold text-sm "+(tx.type==="income"?"text-emerald-400":"text-red-400")}>{tx.type==="income"?"+":"-"}{fmt(tx.amount)} ฿</span>
              {onDeleteTx && <button onClick={()=>del(tx.id)} className="text-zinc-700 hover:text-red-400 text-xs">🗑</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────
function SettingsView({ data, onUpdate, saving }) {
  const [players,       setPlayers]       = useState(data.players);
  const [newName,       setNewName]       = useState("");
  const [rate,          setRate]          = useState({...data.chipRate});
  const [fee,           setFee]           = useState(data.defaultFee);
  const [nicknames,     setNicknames]     = useState({...( data.nicknames||{} )});
  const [adminPassword, setAdminPassword] = useState(data.adminPassword || "");
  const [showPw,        setShowPw]        = useState(false);
  const [saved,         setSaved]         = useState(false);

  function addPlayer() { const n=newName.trim(); if(!n||players.includes(n)) return; setPlayers([...players,n]); setNewName(""); }
  function rmPlayer(n) { setPlayers(players.filter(p=>p!==n)); const nn={...nicknames}; delete nn[n]; setNicknames(nn); }
  function setNick(player, val) { setNicknames(prev=>({...prev, [player]: val})); }
  async function save() {
    await onUpdate({players, chipRate:rate, defaultFee:fee, nicknames, adminPassword});
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">⚙️ ตั้งค่า</h2>
      <Box className="space-y-3">
        <div className="text-amber-400 font-semibold text-sm">🎰 อัตราแลกชิป (ค่าเริ่มต้น)</div>
        <div className="flex items-center gap-3">
          <div className="flex-1"><label className="text-zinc-500 text-xs">ชิป</label><NInput value={rate.chips} onChange={v=>setRate(r=>({...r,chips:v}))}/></div>
          <span className="text-zinc-400 mt-4 font-bold">=</span>
          <div className="flex-1"><label className="text-zinc-500 text-xs">บาท</label><NInput value={rate.baht} onChange={v=>setRate(r=>({...r,baht:v}))}/></div>
        </div>
        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-2 text-amber-300 text-sm font-mono">{fmt(rate.chips)} ชิป = {fmt(rate.baht)} ฿ · 1 ชิป ≈ {rate.chips>0?(rate.baht/rate.chips).toFixed(4):0} ฿</div>
      </Box>
      <Box className="space-y-3">
        <div className="text-purple-400 font-semibold text-sm">📦 ค่าส่วนกลางต่อคน (ค่าเริ่มต้น)</div>
        <NInput value={fee} onChange={setFee}/>
        <div className="bg-purple-900/20 border border-purple-700/30 rounded-xl px-4 py-2 text-purple-300 text-sm font-mono">ทุกคนจ่าย {fmt(fee)} ฿/เซสชั่น</div>
      </Box>
      <Box className="space-y-3">
        <div className="text-zinc-300 font-semibold text-sm">👥 ผู้เล่น</div>
        <div className="flex gap-2">
          <input value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addPlayer()} placeholder="ชื่อผู้เล่นใหม่..."
            className="flex-1 border border-zinc-600/60 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.06)"}}/>
          <button onClick={addPlayer} className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold">เพิ่ม</button>
        </div>
        <div className="space-y-2">
          {players.map(p => (
            <div key={p} className="flex items-center gap-2 border border-zinc-700/30 rounded-xl px-3 py-2" style={{background:"rgba(255,255,255,0.06)"}}>
              <span className="text-white font-medium text-sm w-16 flex-shrink-0">{p}</span>
              <input
                value={nicknames[p] || ""}
                onChange={e => setNick(p, e.target.value)}
                placeholder="Nickname..."
                className="flex-1 border border-zinc-600/60 rounded-lg px-3 py-1.5 text-zinc-300 text-xs placeholder-zinc-600 focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.06)"}}
              />
              <button onClick={()=>rmPlayer(p)} className="text-zinc-600 hover:text-red-400 text-xs flex-shrink-0">✕</button>
            </div>
          ))}
        </div>
      </Box>
      <Box className="space-y-2">
        <div className="text-zinc-400 font-semibold text-sm">📅 ช่วงซีซั่น</div>
        {[1,2,3,4].map(s => (
          <div key={s} className="flex items-center gap-3 text-sm">
            <span className="bg-sky-500/20 border border-sky-500/30 text-sky-300 px-2 py-0.5 rounded-full text-xs w-16 text-center">ซีซั่น {s}</span>
            <span className="text-zinc-400">{S_LABEL[s]}</span>
          </div>
        ))}
      </Box>
      <Box className="space-y-3">
        <div className="text-red-400 font-semibold text-sm">🔐 Admin Password</div>
        <div className="relative">
          <input
            type={showPw ? "text" : "password"}
            value={adminPassword}
            onChange={e => setAdminPassword(e.target.value)}
            placeholder="ตั้ง password สำหรับ admin..."
            className="w-full border border-zinc-600/60 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none pr-16" style={{background:"rgba(255,255,255,0.08)"}}
          />
          <button onClick={()=>setShowPw(p=>!p)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs">
            {showPw ? "ซ่อน" : "แสดง"}
          </button>
        </div>
        <div className="text-zinc-600 text-xs">ใช้ password นี้สำหรับกด Login ในแอป</div>
      </Box>
      <button onClick={save} className={"w-full py-3 rounded-xl font-bold text-base transition-all "+(saved?"bg-emerald-500 text-white":"bg-amber-500 hover:bg-amber-400 text-black")}>
        {saved?"✅ บันทึกแล้ว!":"💾 บันทึกการตั้งค่า"}
      </button>
    </div>
  );
}

// ─── StreetOutCard — dropdown table of hands ───────────────────
function StreetOutCard({ street, desc, mult, outsNeeded, isOk, validHands, allHands }) {
  const [open, setOpen] = useState(false);
  const failHands = allHands.filter(h => h.out < outsNeeded);

  return (
    <div className={"rounded-xl border overflow-hidden " + (isOk ? "border-emerald-500/25" : "border-red-500/25")}
      style={{background: isOk ? "rgba(5,30,15,0.2)" : "rgba(30,5,5,0.2)"}}>
      {/* Header row — always visible */}
      <button className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        onClick={() => setOpen(o => !o)}>
        <div>
          <div className={"text-sm font-semibold " + (isOk ? "text-emerald-300" : "text-red-300")}>{street}</div>
          <div className="text-zinc-600 text-[10px]">{desc} · ×{mult} rule</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className={"font-mono font-black text-xl " + (isOk ? "text-emerald-400" : "text-red-400")}>
              ≥ {outsNeeded} out
            </div>
            <div className="text-zinc-600 text-[10px]">≈{(outsNeeded * mult).toFixed(0)}% equity</div>
          </div>
          <span className={"text-zinc-600 text-xs transition-transform " + (open ? "rotate-180" : "")}>▼</span>
        </div>
      </button>

      {/* Dropdown table */}
      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2">
          {/* column headers */}
          <div className="flex text-[10px] text-zinc-600 mb-1 px-1">
            <span className="w-6"/>
            <span className="flex-1">Hand / Draw</span>
            <span className="w-8 text-right">Out</span>
          </div>
          {/* fail hands — faded */}
          {failHands.map((h, i) => (
            <div key={i} className="flex items-center gap-2 px-1 py-1 opacity-30">
              <span className="w-6 text-center text-xs">{"♠♥♦♣"[i%4]}</span>
              <span className="flex-1 text-xs text-zinc-500">{h.name}</span>
              <span className="w-8 text-right text-xs font-mono text-red-500">{h.out}</span>
            </div>
          ))}
          {/* threshold line */}
          {failHands.length > 0 && (
            <div className="relative my-1.5">
              <div className={"border-t border-dashed " + (isOk ? "border-emerald-600/50" : "border-red-600/50")}/>
              <span className={"absolute right-0 -top-2.5 text-[9px] px-1 " + (isOk ? "text-emerald-500" : "text-red-500")}
                style={{background:"rgba(0,0,0,0.5)"}}>≥ {outsNeeded} out ✓</span>
            </div>
          )}
          {/* valid hands — highlighted */}
          {validHands.length === 0
            ? <div className="text-center text-zinc-600 text-xs py-2">ต้องการ out มากเกินไป</div>
            : validHands.map((h, i) => (
              <div key={i} className={"flex items-center gap-2 px-1 py-1.5 rounded-lg " + (isOk ? "text-emerald-300" : "text-red-300")}>
                <span className="w-6 text-center text-sm">{"♠♥♦♣"[i%4]}</span>
                <span className="flex-1 text-xs font-medium">{h.name}</span>
                <span className={"w-8 text-right text-xs font-mono font-bold " + (isOk ? "text-emerald-400" : "text-red-400")}>{h.out}</span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STREAK VIEW
// ─────────────────────────────────────────────────────────────────
const STREAK_ITEMS = [
  // หมวด คู่
  { id:"pair_flop",   group:"🃏 ติดคู่",    label:"ติดคู่ที่ Flop",              prob:32.46, avgEvery:3  },
  { id:"pair_turn",   group:"🃏 ติดคู่",    label:"ติดคู่ที่ Turn เท่านั้น",     prob:8.63,  avgEvery:12 },
  { id:"pair_river",  group:"🃏 ติดคู่",    label:"ติดคู่ที่ River เท่านั้น",    prob:7.68,  avgEvery:13 },
  { id:"pair_5",      group:"🃏 ติดคู่",    label:"ติดคู่ภายใน 5 ใบ รวม",       prob:48.77, avgEvery:2  },
  // หมวด Set
  { id:"set_flop",    group:"🎯 ติด Set",   label:"ติด Set ที่ Flop",            prob:11.76, avgEvery:9  },
  { id:"set_turn",    group:"🎯 ติด Set",   label:"ติด Set ที่ Turn เท่านั้น",   prob:3.75,  avgEvery:27 },
  { id:"set_river",   group:"🎯 ติด Set",   label:"ติด Set ที่ River เท่านั้น",  prob:3.67,  avgEvery:27 },
  { id:"set_5",       group:"🎯 ติด Set",   label:"ติด Set ภายใน 5 ใบ รวม",     prob:19.18, avgEvery:5  },
  // หมวด Flush
  { id:"flush_flop",  group:"♦️ Flush",     label:"ติด Flush สมบูรณ์ที่ Flop",  prob:0.84,  avgEvery:119},
  { id:"flush_draw",  group:"♦️ Flush",     label:"มี Flush Draw ที่ Flop",      prob:10.94, avgEvery:9  },
  { id:"flush_turn",  group:"♦️ Flush",     label:"Draw → ติดที่ Turn",          prob:19.15, avgEvery:5  },
  { id:"flush_river", group:"♦️ Flush",     label:"Draw → ติดที่ River",         prob:15.82, avgEvery:6  },
  { id:"flush_tr",    group:"♦️ Flush",     label:"Draw → ติดใน Turn หรือ River",prob:34.97, avgEvery:3  },
  // หมวด Straight
  { id:"str_flop",    group:"♠️ Straight",  label:"ติด Straight สมบูรณ์ที่ Flop",prob:2.61, avgEvery:38 },
  { id:"oesd_flop",   group:"♠️ Straight",  label:"มี OESD ที่ Flop",            prob:10.5,  avgEvery:10 },
  { id:"oesd_turn",   group:"♠️ Straight",  label:"OESD → ติดที่ Turn",          prob:17.02, avgEvery:6  },
  { id:"oesd_river",  group:"♠️ Straight",  label:"OESD → ติดที่ River",         prob:14.43, avgEvery:7  },
  { id:"oesd_tr",     group:"♠️ Straight",  label:"OESD → ติดใน Turn หรือ River",prob:31.45, avgEvery:3  },
  { id:"gut_tr",      group:"♠️ Straight",  label:"Gutshot → Turn หรือ River",   prob:16.47, avgEvery:6  },
];

function StreakView() {
  const initState = () => {
    const s = {};
    STREAK_ITEMS.forEach(item => { s[item.id] = 0; });
    return s;
  };
  const [counts,  setCounts]  = useState(initState);
  const [history, setHistory] = useState(() => {
    // history: { [id]: [{count, time}] }
    const h = {};
    STREAK_ITEMS.forEach(item => { h[item.id] = []; });
    return h;
  });
  const [openHist, setOpenHist] = useState(null); // id ที่เปิด history dropdown

  function tick(id) {
    setCounts(prev => ({ ...prev, [id]: prev[id] + 1 }));
  }
  function hit(id) {
    // บันทึกว่าครั้งนี้ใช้ไป count+1 ครั้ง (นับรวมครั้งที่ติดด้วย)
    const count = counts[id] + 1;
    const now   = new Date();
    const timeStr = now.getHours().toString().padStart(2,"0") + ":" + now.getMinutes().toString().padStart(2,"0");
    setHistory(prev => ({
      ...prev,
      [id]: [...prev[id], { count, time: timeStr }]
    }));
    setCounts(prev => ({ ...prev, [id]: 0 })); // reset counter
  }
  function reset(id) {
    setCounts(prev => ({ ...prev, [id]: 0 }));
  }
  function resetAll() {
    setCounts(initState());
  }
  function clearHistory(id) {
    setHistory(prev => ({ ...prev, [id]: [] }));
  }

  // จัดกลุ่ม
  const groups = [...new Set(STREAK_ITEMS.map(i => i.group))];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">🎯 Streak</h2>
          <p className="text-zinc-500 text-sm mt-0.5">นับว่าแต่ละสถานการณ์ยังไม่เกิดมากี่ครั้งแล้ว</p>
        </div>
        <button onClick={resetAll}
          className="px-3 py-1.5 rounded-xl text-xs text-zinc-500 hover:text-red-400 border border-zinc-700/30 transition-colors"
          style={{background:"rgba(255,255,255,0.04)"}}>
          🔄 Reset ทั้งหมด
        </button>
      </div>

      {groups.map(group => (
        <div key={group}>
          <div className="text-amber-400 text-xs font-bold mb-2 px-1">{group}</div>
          <div className="space-y-2">
            {STREAK_ITEMS.filter(i => i.group === group).map(item => {
              const count = counts[item.id];
              const over  = count > item.avgEvery;
              const ratio = item.avgEvery > 0 ? (count / item.avgEvery) : 0;
              const pct   = Math.min(ratio * 100, 100);
              return (
                <div key={item.id} className={"rounded-xl border px-3 py-2.5 " + (
                  count === 0 ? "border-zinc-700/25" :
                  over ? "border-red-500/30" : "border-emerald-500/20"
                )} style={{background: count === 0 ? "rgba(255,255,255,0.03)" :
                  over ? "rgba(30,5,5,0.25)" : "rgba(5,20,10,0.25)"}}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">{item.label}</div>
                      <div className="text-zinc-600 text-[10px] mt-0.5">
                        โอกาส {item.prob}% · ควรเกิด 1 ใน ~{item.avgEvery} ครั้ง
                      </div>
                    </div>
                    {/* Counter */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <div className="text-right">
                        <div className={"font-mono font-black text-2xl leading-none " + (
                          count === 0 ? "text-zinc-600" :
                          over ? "text-red-400" : "text-emerald-400"
                        )}>{count}</div>
                        <div className="text-zinc-600 text-[9px]">ครั้ง</div>
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {count > 0 && (
                    <div className="mb-2">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{background:"rgba(255,255,255,0.06)"}}>
                        <div className={"h-full rounded-full transition-all " + (over ? "bg-red-500" : "bg-emerald-500")}
                          style={{width: pct + "%"}}/>
                      </div>
                      <div className="flex justify-between text-[9px] text-zinc-700 mt-0.5">
                        <span>0</span>
                        <span className={over ? "text-red-500" : "text-zinc-600"}>
                          {over ? `เกินค่าเฉลี่ย ${count - item.avgEvery} ครั้ง ⚠️` : `${item.avgEvery - count} ครั้งจะถึงค่าเฉลี่ย`}
                        </span>
                        <span>~{item.avgEvery}</span>
                      </div>
                    </div>
                  )}

                  {/* Buttons */}
                  <div className="flex gap-2">
                    <button onClick={() => tick(item.id)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border border-zinc-700/30 text-zinc-300 hover:text-white hover:border-amber-500/40 transition-colors"
                      style={{background:"rgba(255,255,255,0.06)"}}>
                      ☐ ยังไม่ติด +1
                    </button>
                    <button onClick={() => hit(item.id)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                      style={{background:"rgba(5,30,15,0.3)"}}>
                      ✅ ติดแล้ว! บันทึก
                    </button>
                    {count > 0 && (
                      <button onClick={() => reset(item.id)}
                        className="px-3 py-2 rounded-lg text-xs text-zinc-600 hover:text-red-400 border border-zinc-700/20 transition-colors"
                        style={{background:"rgba(255,255,255,0.03)"}}>
                        ↺
                      </button>
                    )}
                  </div>

                  {/* History */}
                  {history[item.id].length > 0 && (
                    <div className="mt-2">
                      <button onClick={() => setOpenHist(openHist === item.id ? null : item.id)}
                        className="w-full flex items-center justify-between text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors py-1">
                        <span>📋 ประวัติ ({history[item.id].length} ครั้ง) · เฉลี่ย {(history[item.id].reduce((s,h)=>s+h.count,0)/history[item.id].length).toFixed(1)} ครั้ง/ติด</span>
                        <span>{openHist === item.id ? "▲" : "▼"}</span>
                      </button>
                      {openHist === item.id && (
                        <div className="mt-1 rounded-lg overflow-hidden" style={{background:"rgba(255,255,255,0.03)"}}>
                          <div className="flex text-[9px] text-zinc-700 px-3 py-1 border-b border-white/5">
                            <span className="w-6">#</span>
                            <span className="flex-1">ใช้ไปกี่ครั้ง</span>
                            <span className="w-12 text-right">เวลา</span>
                            <span className="w-12 text-right">vs เฉลี่ย</span>
                          </div>
                          {history[item.id].map((h, i) => {
                            const diff = h.count - item.avgEvery;
                            return (
                              <div key={i} className="flex items-center text-xs px-3 py-1.5 border-b border-white/5 last:border-0">
                                <span className="w-6 text-zinc-600 text-[10px]">{i+1}</span>
                                <span className="flex-1 font-mono font-bold text-white">{h.count} ครั้ง</span>
                                <span className="w-12 text-right text-zinc-600 text-[10px]">{h.time}</span>
                                <span className={"w-12 text-right text-[10px] font-mono " + (diff > 0 ? "text-red-400" : "text-emerald-400")}>
                                  {diff > 0 ? "+" : ""}{diff}
                                </span>
                              </div>
                            );
                          })}
                          <button onClick={() => clearHistory(item.id)}
                            className="w-full text-[10px] text-zinc-700 hover:text-red-400 py-1.5 transition-colors border-t border-white/5">
                            🗑 ล้างประวัติ
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CALCULATOR VIEW (Pot Odds)
// ─────────────────────────────────────────────────────────────────
function CalcView() {
  const [pot,     setPot]     = useState(0);
  const [call,    setCall]    = useState(0);
  const [selHand, setSelHand] = useState("");

  const total  = pot + call;
  const equity = total > 0 ? (call / total) * 100 : 0;
  const ratio  = call > 0 ? (pot / call).toFixed(2) : "—";

  function reset() { setPot(0); setCall(0); setSelHand(""); }

  const callPresets = [50, 100, 200, 300, 500];
  const potPresets  = [100, 200, 300, 500, 1000];

  // hand list พร้อม out count
  const HANDS = [
    { name: "Pocket pair → set",             out: 2  },
    { name: "One overcard",                   out: 3  },
    { name: "Gutshot straight",               out: 4  },
    { name: "Two overcards",                  out: 6  },
    { name: "One overcard + gutshot",         out: 7  },
    { name: "Open-ended straight",            out: 8  },
    { name: "Flush draw",                     out: 9  },
    { name: "Two overcards + gutshot",        out: 10 },
    { name: "Flush draw + gutshot",           out: 12 },
    { name: "Flush draw + overcard",          out: 12 },
    { name: "Flush draw + gutshot + overcard",out: 13 },
    { name: "Flush draw + two overcards",     out: 15 },
    { name: "Flush draw + open-ended",        out: 17 },
    { name: "Flush draw + open-ended + two overcards", out: 21 },
  ];

  const hand = HANDS.find(h => h.name === selHand) ?? null;
  // equity ของ hand (rule of 4, flop→river)
  const handEquity = hand ? hand.out * 4 : null;
  // pot ขั้นต่ำที่ต้องการให้ call คุ้ม: call/(pot+call) = handEquity/100
  // → pot = call*(100/handEquity - 1)
  const minPot = hand && call > 0 ? Math.ceil(call * (100 / handEquity - 1)) : null;
  const handOk = hand && pot > 0 && call > 0 ? pot >= minPot : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white">🧮 Pot Odds Calculator</h2>
        <p className="text-zinc-500 text-sm mt-0.5">คำนวณ % equity ที่ต้องการเพื่อ call คุ้ม</p>
      </div>

      {/* Inputs */}
      <Box className="space-y-4">
        {/* Pot */}
        <div>
          <label className="block text-zinc-400 text-sm font-semibold mb-2">💰 Pot ปัจจุบัน</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setPot(v => Math.max(0, v - 5))}
              className="w-10 h-10 rounded-xl border border-zinc-700/30 text-zinc-300 text-lg font-bold hover:text-white hover:border-amber-500/40 transition-colors flex-shrink-0 flex items-center justify-center"
              style={{background:"rgba(255,255,255,0.06)"}}>−</button>
            <input type="number" value={pot||""} placeholder="100"
              onChange={e => setPot(Number(e.target.value)||0)}
              className="w-1/3 border border-zinc-600/40 rounded-xl px-3 py-2 text-white font-mono text-sm font-bold focus:border-amber-500 focus:outline-none text-center"
              style={{background:"rgba(255,255,255,0.06)"}}/>
            <button onClick={() => setPot(v => v + 5)}
              className="w-10 h-10 rounded-xl border border-zinc-700/30 text-zinc-300 text-lg font-bold hover:text-white hover:border-amber-500/40 transition-colors flex-shrink-0 flex items-center justify-center"
              style={{background:"rgba(255,255,255,0.06)"}}>+</button>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {potPresets.map(v => (
              <button key={v} onClick={() => setPot(v)}
                className="px-3 py-1 rounded-lg text-xs border border-zinc-700/30 text-zinc-400 hover:text-amber-300 hover:border-amber-500/30 transition-colors"
                style={{background:"rgba(255,255,255,0.05)"}}>
                {v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Call + Hand dropdown */}
        <div>
          <label className="block text-zinc-400 text-sm font-semibold mb-2">📞 Call Amount + 🃏 Hand ที่ถือ</label>
          <div className="flex items-center gap-2">
            <button onClick={() => setCall(v => Math.max(0, v - 5))}
              className="w-10 h-10 rounded-xl border border-zinc-700/30 text-zinc-300 text-lg font-bold hover:text-white hover:border-amber-500/40 transition-colors flex-shrink-0 flex items-center justify-center"
              style={{background:"rgba(255,255,255,0.06)"}}>−</button>
            <input type="number" value={call||""} placeholder="20"
              onChange={e => setCall(Number(e.target.value)||0)}
              className="w-1/3 border border-zinc-600/40 rounded-xl px-3 py-2 text-white font-mono text-sm font-bold focus:border-amber-500 focus:outline-none text-center"
              style={{background:"rgba(255,255,255,0.06)"}}/>
            <button onClick={() => setCall(v => v + 5)}
              className="w-10 h-10 rounded-xl border border-zinc-700/30 text-zinc-300 text-lg font-bold hover:text-white hover:border-amber-500/40 transition-colors flex-shrink-0 flex items-center justify-center"
              style={{background:"rgba(255,255,255,0.06)"}}>+</button>
            <select value={selHand} onChange={e => setSelHand(e.target.value)}
              className="flex-1 border border-zinc-600/40 rounded-xl px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
              style={{background:"rgba(15,10,3,0.7)", color: selHand ? "white" : "#6b7280"}}>
              <option value="">🃏 Hand...</option>
              {HANDS.map(h => (
                <option key={h.name} value={h.name}>{h.name} ({h.out} out)</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            {callPresets.map(v => (
              <button key={v} onClick={() => setCall(v)}
                className="px-3 py-1 rounded-lg text-xs border border-zinc-700/30 text-zinc-400 hover:text-amber-300 hover:border-amber-500/30 transition-colors"
                style={{background:"rgba(255,255,255,0.05)"}}>
                {v.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* Hand result — แสดงเมื่อเลือก hand */}
        {hand && call > 0 && (
          <div className={"rounded-xl px-4 py-3 border " + (handOk ? "border-emerald-500/30" : handOk === false ? "border-red-500/30" : "border-zinc-700/30")}
            style={{background: handOk ? "rgba(5,30,15,0.35)" : handOk === false ? "rgba(30,5,5,0.35)" : "rgba(255,255,255,0.04)"}}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-white">{hand.name}</span>
              <span className="font-mono font-bold text-amber-300">{hand.out} out · ~{handEquity}%</span>
            </div>
            {minPot !== null && (
              <div className="text-xs text-zinc-400 space-y-1">
                <div className="flex justify-between">
                  <span>Pot ขั้นต่ำที่ call คุ้ม</span>
                  <span className="font-mono font-bold text-white">{minPot.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Pot ปัจจุบัน</span>
                  <span className={"font-mono font-bold " + (handOk ? "text-emerald-400" : "text-red-400")}>
                    {pot > 0 ? pot.toLocaleString() : "—"}
                  </span>
                </div>
                {pot > 0 && (
                  <div className={"mt-1 pt-1 border-t border-white/5 font-semibold " + (handOk ? "text-emerald-400" : "text-red-400")}>
                    {handOk ? "✅ Pot ถึงแล้ว — call คุ้ม" : "❌ Pot ยังไม่ถึง — ควร fold"}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Box>

      {/* Formula display */}
      {total > 0 && (
        <Box>
          <div className="text-zinc-400 text-xs font-semibold mb-3">📐 สูตรคำนวณ</div>
          <div className="text-center py-2">
            <div className="text-zinc-400 text-sm font-mono">
              ({call.toLocaleString()} ÷ ({pot.toLocaleString()} + {call.toLocaleString()})) × 100
            </div>
            <div className="text-zinc-500 text-xs mt-1 font-mono">
              = ({call.toLocaleString()} ÷ {total.toLocaleString()}) × 100
            </div>
          </div>
        </Box>
      )}

      {/* Result */}
      <div className={"rounded-2xl p-6 text-center border " + (
        total === 0 ? "border-zinc-700/25" :
        equity <= 25 ? "border-emerald-500/40" :
        equity <= 33 ? "border-amber-500/40" :
        "border-red-500/40"
      )} style={{background: total === 0 ? "rgba(15,10,3,0.05)" :
        equity <= 25 ? "rgba(5,30,15,0.3)" :
        equity <= 33 ? "rgba(30,20,5,0.3)" :
        "rgba(30,5,5,0.3)"}}>
        {total === 0 ? (
          <div className="text-zinc-600">
            <div className="text-4xl mb-2">🃏</div>
            <div className="text-sm">กรอก Pot และ Call เพื่อคำนวณ</div>
          </div>
        ) : (
          <>
            <div className="text-zinc-400 text-sm mb-1">Equity ที่ต้องการ</div>
            <div className={"font-mono font-black text-6xl mb-2 " + (
              equity <= 25 ? "text-emerald-400" :
              equity <= 33 ? "text-amber-400" :
              "text-red-400"
            )}>
              {equity.toFixed(1)}%
            </div>
            <div className="text-zinc-400 text-sm">
              Pot Odds = <span className="text-white font-mono font-bold">{ratio} : 1</span>
            </div>
            <div className={"mt-3 text-sm font-semibold " + (
              equity <= 25 ? "text-emerald-300" :
              equity <= 33 ? "text-amber-300" :
              "text-red-300"
            )}>
              {equity <= 25 ? "✅ Call คุ้มมาก — ต้องการ equity น้อย" :
               equity <= 33 ? "⚠️ Call พอได้ — ต้องมี hand ที่ดีพอสมควร" :
               "❌ Call ไม่คุ้ม — ต้องการ equity สูงมาก"}
            </div>
          </>
        )}
      </div>

      {/* Guide — Outs */}
      <Box>
        <div className="text-zinc-400 text-xs font-semibold mb-3">🃏 จำนวน Out ที่ต้องการ (Rule of 2 & 4)</div>
        <div className="space-y-2">
          {total > 0 ? (
            // แสดง out ที่ต้องการตาม equity ที่คำนวณได้
            [
              { street: "Call ที่ Flop", mult: 4, desc: "ยังมี 2 ใบ (turn+river)" },
              { street: "Call ที่ Turn", mult: 2, desc: "เหลือ 1 ใบ (river)" },
              { street: "All-in ที่ Flop", mult: 4, desc: "ได้ดู 2 ใบ (turn+river)" },
            ].map(({ street, mult, desc }) => {
              const outsNeeded = Math.ceil(equity / mult);
              const isOk = outsNeeded <= 9;
              // map out → hand examples
              // ทุก hand draw ที่มี out >= outsNeeded
              const allHands = [
                { out: 2,  name: "Pocket pair → set" },
                { out: 3,  name: "One overcard" },
                { out: 4,  name: "Gutshot straight" },
                { out: 6,  name: "Two overcards" },
                { out: 7,  name: "One overcard + gutshot" },
                { out: 8,  name: "Open-ended straight" },
                { out: 9,  name: "Flush draw" },
                { out: 10, name: "Two overcards + gutshot" },
                { out: 12, name: "Flush draw + gutshot" },
                { out: 12, name: "Flush draw + overcard" },
                { out: 13, name: "Flush draw + gutshot + overcard" },
                { out: 15, name: "Flush draw + two overcards" },
                { out: 17, name: "Flush draw + open-ended" },
                { out: 21, name: "Flush draw + open-ended + two overcards" },
              ];
              const validHands = outsNeeded <= 0 ? [] : allHands.filter(h => h.out >= outsNeeded);
              const exampleText = validHands.length === 0 ? (outsNeeded > 15 ? "แทบทุก draw รวมกัน" : "—")
                : validHands.map(h => h.name).join(", ");
              return (
                <StreetOutCard key={street}
                  street={street} desc={desc} mult={mult}
                  outsNeeded={outsNeeded} isOk={isOk}
                  validHands={validHands} allHands={allHands}
                />
              );
            })
          ) : (
            // แสดงตาราง out อ้างอิงทั่วไป
            <div>
              <div className="grid grid-cols-4 gap-1 mb-2 text-[10px] text-zinc-600 font-semibold px-1">
                <span>Out</span><span className="text-center">Flop→River</span><span className="text-center">Turn→River</span><span className="text-center">ตัวอย่าง</span>
              </div>
              {[
                [2, "8%",  "4%",  "Pocket pair → set"],
                [4, "16%", "8%",  "Gutshot straight"],
                [6, "24%", "12%", "Two pair → full house"],
                [8, "32%", "16%", "Open-ended straight"],
                [9, "36%", "18%", "Flush draw"],
                [12,"48%", "24%", "Flush + gutshot"],
                [15,"60%", "30%", "Flush + open-ended"],
              ].map(([out, pct4, pct2, ex]) => (
                <div key={out} className="grid grid-cols-4 gap-1 px-1 py-1.5 border-b border-zinc-800/30 text-xs items-center">
                  <span className="font-mono font-bold text-amber-300">{out} out</span>
                  <span className="text-center font-mono text-zinc-300">{pct4}</span>
                  <span className="text-center font-mono text-zinc-300">{pct2}</span>
                  <span className="text-zinc-500 text-[10px] truncate">{ex}</span>
                </div>
              ))}
              <div className="text-zinc-600 text-[10px] mt-2 text-center">กรอก Pot + Call เพื่อดูว่าต้องการกี่ out</div>
            </div>
          )}
        </div>
      </Box>

      {/* Reset */}
      <button onClick={reset}
        className="w-full py-2.5 rounded-xl text-sm text-zinc-500 hover:text-white border border-zinc-700/30 transition-colors"
        style={{background:"rgba(255,255,255,0.04)"}}>
        🔄 รีเซ็ต
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────
function Spinner() {
  return <div className="inline-block w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />;
}


// ─────────────────────────────────────────────────────────────────
// LOGIN VIEW
// ─────────────────────────────────────────────────────────────────
function LoginView({ data, onLogin, onCancel }) {
  const [pw,  setPw]  = useState("");
  const [err, setErr] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit() {
    setChecking(true);
    setErr("");
    try {
      const stored = data?.settings?.adminPassword || data?.adminPassword || "";
      // ถ้า password ใน Sheets ว่างเปล่า → login ได้เลย
      if (stored === "" || pw === stored) {
        localStorage.setItem("lspc_admin", "1");
        onLogin();
      } else if (!pw.trim()) {
        setErr("กรุณากรอก password");
      } else {
        setErr("Password ไม่ถูกต้อง");
      }
    } catch(e) {
      setErr("เกิดข้อผิดพลาด");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">🔐 Admin Login</h2>
        <button onClick={onCancel} className="text-zinc-500 hover:text-white text-sm">ยกเลิก ✕</button>
      </div>
      <Box className="space-y-4">
        <div>
          <label className="block text-zinc-400 text-sm mb-1">Password</label>
          <input
            type="password" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="กรอก admin password..."
            className="w-full border border-zinc-600/60 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none" style={{background:"rgba(255,255,255,0.06)"}}
          />
          {err && <p className="text-red-400 text-sm mt-1">{err}</p>}
        </div>
        <button onClick={submit} disabled={checking}
          className="w-full py-3 rounded-xl font-bold text-base bg-amber-500 hover:bg-amber-400 text-black transition-colors">
          {checking ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
        </button>
      </Box>
    </div>
  );
}

export default function App() {
  const [data,    setData]    = useState(null);
  const [tab,       setTab]       = useState("dashboard");
  const [editSes,   setEditSes]   = useState(null);
  const [profileSel, setProfileSel] = useState(null);
  const [openSesId,  setOpenSesId]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("lspc_admin") === "1");
  const [menuOpen, setMenuOpen] = useState(false);

  async function refresh() {
    try {
      const d = await apiGet();
      setData(d);
      setError(null);
    } catch(e) {
      setError("โหลดข้อมูลไม่ได้: " + e.message);
    }
  }

  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  async function saveSes(ses) {
    setSaving(true);
    try {
      const isEdit = data.sessions.some(s => s.internalId === ses.internalId);
      await apiPost({ action: "saveSession", session: ses });
      if (!isEdit) {
        // สร้างใหม่ → เพิ่ม nextInternalId + บันทึก pot เต็มจำนวน
        await apiPost({ action: "saveSettings", settings: {
          players: data.players, chipRate: data.chipRate,
          defaultFee: data.defaultFee, nextInternalId: data.nextInternalId + 1
        }});
        const ft = ses.entries.length * ses.fee;
        if (ft > 0) {
          const tx = { id: Date.now(), type: "income", amount: ft, date: ses.date,
            note: "ค่าส่วนกลาง ปี"+ses.year+" S"+ses.season+" เซส"+ses.sessionNo+" ("+ses.entries.length+" คน × "+fmt(ses.fee)+" ฿)" };
          await apiPost({ action: "savePotTransaction", transaction: tx });
        }
      } else {
        // แก้ไข → เปรียบเทียบ fee เก่า vs ใหม่ แล้ว adjust กองกลางตามผลต่าง
        const oldSes = data.sessions.find(s => s.internalId === ses.internalId);
        const oldFt  = oldSes ? (oldSes.entries.length * (oldSes.fee || 0)) : 0;
        const newFt  = ses.entries.length * ses.fee;
        const diff   = newFt - oldFt;
        if (diff !== 0) {
          const tx = {
            id: Date.now(),
            type: diff > 0 ? "income" : "expense",
            amount: Math.abs(diff),
            date: ses.date,
            note: "ปรับส่วนกลาง ปี"+ses.year+" S"+ses.season+" เซส"+ses.sessionNo+" (แก้ไข: "+(diff>0?"+":"")+fmt(diff)+" ฿)"
          };
          await apiPost({ action: "savePotTransaction", transaction: tx });
        }
      }
      await refresh();
      setEditSes(null);
      setTab("sessions");
    } catch(e) { alert("บันทึกไม่สำเร็จ: " + e.message); }
    finally { setSaving(false); }
  }

  async function delSes(id) {
    if (!window.confirm("ลบเซสชั่นนี้?")) return;
    try {
      await apiPost({ action: "deleteSession", internalId: id });
      await refresh();
    } catch(e) { alert("ลบไม่สำเร็จ: " + e.message); }
  }

  async function saveSettings(cfg) {
    setSaving(true);
    try {
      await apiPost({ action: "saveSettings", settings: {
        ...cfg,
        nextInternalId: data.nextInternalId,
        nicknames: cfg.nicknames||{},
        adminPassword: cfg.adminPassword !== undefined ? cfg.adminPassword : (data.adminPassword || ""),
      }});
      await refresh();
    } catch(e) { alert("บันทึกไม่สำเร็จ: " + e.message); }
    finally { setSaving(false); }
  }

  async function addPotTx(tx) {
    setSaving(true);
    try {
      await apiPost({ action: "savePotTransaction", transaction: tx });
      await refresh();
    } catch(e) { alert("บันทึกไม่สำเร็จ: " + e.message); }
    finally { setSaving(false); }
  }

  async function delPotTx(id) {
    try {
      await apiPost({ action: "deletePotTransaction", id });
      await refresh();
    } catch(e) { alert("ลบไม่สำเร็จ: " + e.message); }
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{backgroundImage:`url(${BG_SRC})`,backgroundSize:"cover",backgroundPosition:"center"}}>
      <Spinner/>
      <div className="text-amber-400 text-sm">กำลังโหลดข้อมูลจาก Google Sheets...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6" style={{backgroundImage:`url(${BG_SRC})`,backgroundSize:"cover",backgroundPosition:"center"}}>
      <div className="text-4xl">⚠️</div>
      <div className="text-red-400 text-center text-sm">{error}</div>
      <div className="text-zinc-600 text-xs text-center">ตรวจสอบว่า Apps Script Deploy ถูกต้องแล้วหรือยัง</div>
      <button onClick={() => { setLoading(true); refresh().finally(() => setLoading(false)); }}
        className="px-6 py-2 rounded-xl bg-amber-500 text-black font-bold text-sm">ลองใหม่</button>
    </div>
  );

  const potBal = data.pot?.balance ?? 0;
  const ALL_TABS = [
    { id:"dashboard",   icon:"📊", label:"ภาพรวม",  adminOnly: false },
    { id:"leaderboard", icon:"🏆", label:"Rank",     adminOnly: false },
    { id:"profiles",    icon:"👤", label:"Players",  adminOnly: false },
    { id:"race",        icon:"🏎️", label:"Race",      adminOnly: false },
    { id:"calc",        icon:"🧮", label:"Calc",      adminOnly: false },
    { id:"streak",      icon:"🎯", label:"Streak",    adminOnly: false },
    { id:"sessions",    icon:"📋", label:"เซสชั่น",  adminOnly: false },
    { id:"add",         icon:"➕", label:"บันทึก",   adminOnly: true  },
    { id:"pot",         icon:"💰", label:"กองกลาง",  adminOnly: false },
    { id:"settings",    icon:"⚙️", label:"ตั้งค่า",  adminOnly: true  },
  ];
  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen text-white" style={{
      backgroundImage: `url(${BG_SRC})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }}>
      {/* dark overlay */}
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.05)',zIndex:0,pointerEvents:'none'}}/>
      <div style={{position:'relative',zIndex:1,minHeight:'100vh'}}>
      {/* ── DESKTOP header (sm ขึ้นไป) ── */}
      <header className="hidden sm:block border-b border-zinc-800/60 sticky top-0 z-40" style={{background:"rgba(8,5,1,0.8)",backdropFilter:"blur(16px)"}}>
        <div className="max-w-3xl mx-auto px-3 flex items-center gap-2">
          <img src={LOGO_SRC} alt="Legendary Secrets Poker Club" className="h-14 w-14 rounded-xl object-cover flex-shrink-0 my-1"/>
          <div className="flex flex-1 items-center justify-between overflow-x-auto">
            <div className="flex">
              {TABS.map(t => (
                <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== "add") setEditSes(null); }}
                  className={"flex items-center gap-1 px-2 sm:px-2.5 py-4 text-xs font-medium border-b-2 transition-colors whitespace-nowrap " + (tab === t.id ? "border-amber-400 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 pl-2">
              <span className={"text-xs font-mono " + (potBal >= 0 ? "text-purple-400" : "text-red-400")}>
                💰 {fmt(potBal)} ฿
              </span>
              {isAdmin
                ? <button onClick={() => { localStorage.removeItem("lspc_admin"); setIsAdmin(false); setTab("dashboard"); }}
                    className="text-xs px-2 py-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white border border-zinc-700 transition-colors">
                    🔓 Logout
                  </button>
                : <button onClick={() => setTab("login")}
                    className="text-xs px-2 py-1 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-amber-400 border border-zinc-700 transition-colors">
                    🔐 Login
                  </button>
              }
            </div>
          </div>
        </div>
      </header>

      {/* ── MOBILE header (< sm) ── */}
      <div className="sm:hidden sticky top-0 z-40" style={{background:"rgba(8,5,1,0.85)",backdropFilter:"blur(16px)"}}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/60">
          {/* Hamburger ซ้าย */}
          <button onClick={() => setMenuOpen(o => !o)}
            className="w-9 h-9 rounded-xl border border-zinc-700/30 flex flex-col items-center justify-center gap-1.5 flex-shrink-0" style={{background:"rgba(255,255,255,0.08)"}}>
            <span className={"block w-4 h-0.5  transition-all duration-200 " + (menuOpen ? "rotate-45 translate-y-2" : "")}/>
            <span className={"block w-4 h-0.5  transition-all duration-200 " + (menuOpen ? "opacity-0" : "")}/>
            <span className={"block w-4 h-0.5  transition-all duration-200 " + (menuOpen ? "-rotate-45 -translate-y-2" : "")}/>
          </button>
          {/* Logo + ชื่อ กลาง */}
          <div className="flex items-center gap-2">
            <img src={LOGO_SRC} alt="logo" className="h-9 w-9 rounded-lg object-cover"/>
            <div className="leading-tight">
              <div className="text-amber-400 font-bold text-xs tracking-widest">LEGENDARY</div>
              <div className="text-zinc-400 text-[10px] tracking-widest">SECRETS POKER</div>
            </div>
          </div>
          {/* กองกลาง ขวา */}
          <button onClick={() => { setTab("pot"); setMenuOpen(false); }}
            className={"text-sm font-mono font-bold px-3 py-1.5 rounded-xl border transition-colors " + (potBal >= 0 ? "text-amber-400 border-amber-500/30 bg-amber-500/10" : "text-red-400 border-red-500/30 bg-red-500/10")}>
            💰 {fmt(potBal)} ฿
          </button>
        </div>
        {/* Dropdown — อยู่ใน flow ไม่ทับ content */}
        {menuOpen && (
          <div className="border-b border-amber-900/30" style={{background:"rgba(20,12,2,0.92)",backdropFilter:"blur(20px)"}}>
            <div className="py-1">
              {TABS.map(t => (
                <button key={t.id} onClick={() => { setTab(t.id); setMenuOpen(false); if (t.id !== "add") setEditSes(null); }}
                  className={"w-full flex items-center gap-3 px-5 py-3 text-sm font-medium transition-colors " + (tab === t.id ? "text-amber-400 bg-amber-500/10" : "text-zinc-300 hover:text-amber-300 hover:bg-white/5")}>
                  <span className="text-base">{t.icon}</span>
                  <span>{t.label}</span>
                  {tab === t.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"/>}
                </button>
              ))}
              <div className="mx-4 my-1 border-t border-amber-900/30"/>
              {isAdmin
                ? <button onClick={() => { localStorage.removeItem("lspc_admin"); setIsAdmin(false); setTab("dashboard"); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
                    <span className="text-base">🔓</span><span>Logout</span>
                  </button>
                : <button onClick={() => { setTab("login"); setMenuOpen(false); }}
                    className="w-full flex items-center gap-3 px-5 py-3 text-sm text-zinc-500 hover:text-amber-400 hover:bg-white/5 transition-colors">
                    <span className="text-base">🔐</span><span>Admin Login</span>
                  </button>
              }
            </div>
          </div>
        )}
      </div>
      <main className="max-w-3xl mx-auto px-4 py-6" style={{position:"relative",zIndex:1}}>
        {tab === "dashboard"   && <DashboardView data={data}
          onGoLeader={name => { setProfileSel(name); setTab("profiles"); }}
          onGoLatestSes={id => { setOpenSesId(id); setTab("sessions"); }}
          onGoPot={() => setTab("pot")}
        />}
        {tab === "leaderboard" && <LeaderboardView data={data}/>}
        {tab === "profiles"    && <PlayerProfilesView data={data} initialSel={profileSel} onClearSel={()=>setProfileSel(null)}/>}
        {tab === "race"        && <RaceView data={data}/>}
        {tab === "calc"        && <CalcView/>}
        {tab === "streak"      && <StreakView/>}
        {tab === "sessions"    && !editSes && <SessionsView data={data}
          onEdit={isAdmin ? (s => { setEditSes(s); setTab("add"); }) : null}
          onDelete={isAdmin ? delSes : null}
          initialOpen={openSesId}/>}
        {tab === "add"         && isAdmin && <SessionForm data={data} editSession={editSes} onSave={saveSes} saving={saving} onCancel={editSes ? () => { setEditSes(null); setTab("sessions"); } : null}/>}
        {tab === "pot"         && <PotView data={data} onAddTx={isAdmin ? addPotTx : null} onDeleteTx={isAdmin ? delPotTx : null} saving={saving}/>}
        {tab === "settings"    && isAdmin && <SettingsView data={data} onUpdate={saveSettings} saving={saving}/>}
        {tab === "login"       && <LoginView data={data} onLogin={() => { setIsAdmin(true); setTab("dashboard"); }} onCancel={() => setTab("dashboard")}/>}
      </main>
      </div>
    </div>
  );
}
