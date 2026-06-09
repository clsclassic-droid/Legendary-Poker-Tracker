import { useState, useEffect, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────
const API_URL = "https://script.google.com/macros/s/AKfycbxfxhH1jGwsIJMUBHypzz5VZrKpnfDL2pgJePObM-JvXIp5CjAWaIH_4g1fJQXYjS03bA/exec";
const LOGO_SRC = "https://raw.githubusercontent.com/clsclassic-droid/Legendary-Poker-Tracker/main/src/f512d9a54b54e5e327ac49c65c60695a.jpeg";

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
      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-amber-500 focus:outline-none" />
  );
}
function Box({ children, className="" }) {
  return <div className={"bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 " + className}>{children}</div>;
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
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-6 text-center">
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
        <div className="flex bg-zinc-800 rounded-lg p-0.5 gap-0.5">
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
          <div className="absolute bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs shadow-xl pointer-events-none z-10"
            style={{left:Math.min(Math.max((hov/(pts.length-1))*100,8),65)+"%", top:"2px", transform:"translateX(-50%)", minWidth:"110px"}}>
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
          className="bg-gradient-to-br from-amber-900/40 to-amber-800/10 border border-amber-500/40 rounded-2xl p-3 text-left hover:border-amber-400/70 transition-colors">
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
          className="bg-zinc-900/60 border border-zinc-700 rounded-2xl p-3 text-left hover:border-zinc-500 transition-colors">
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
          className="bg-gradient-to-br from-purple-900/30 to-purple-800/10 border border-purple-500/30 rounded-2xl p-3 text-left hover:border-purple-400/60 transition-colors">
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
          <div key={label} className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-2 py-2 text-center">
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
        <div className="text-center py-4 bg-zinc-900/60 border border-zinc-800 rounded-2xl">
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
            <div key={label} className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3 text-center">
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
              <div key={label} className="bg-zinc-800/50 rounded-xl p-2">
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
                <div key={i} className="flex items-center justify-between bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2">
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
            className="w-full flex items-center gap-3 bg-zinc-900/60 border border-zinc-800 hover:bg-zinc-800/40 hover:border-zinc-700 rounded-2xl px-4 py-3 text-left transition-colors">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-lg flex-shrink-0">
              {p.rank===1 ? "🥇" : p.rank===2 ? "🥈" : p.rank===3 ? "🥉" : "🃏"}
            </div>
            <div className="flex-1">
              <div className="text-white font-bold"><PlayerName player={p.name} nicknames={data.nicknames}/></div>
              <div className="text-zinc-500 text-xs">{p.n} เซสชั่น · Win rate {p.n>0?Math.round((p.gold/p.n)*100):0}%</div>
            </div>
            <div className="flex gap-1 text-xs mr-2">
              {p.gold>0   && <span className="bg-amber-500/20 border border-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full">🥇{p.gold}</span>}
              {p.silver>0 && <span className="bg-zinc-600/30 border border-zinc-600 text-zinc-300 px-1.5 py-0.5 rounded-full">🥈{p.silver}</span>}
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
  const timerRef = useState(null);

  const TOP_N = 8;
  const COLORS = ['#f0b429','#34d399','#60a5fa','#f87171','#a78bfa','#fb923c','#4ade80','#f472b6','#94a3b8','#fbbf24','#e2e8f0','#c084fc'];

  const colorMap = useMemo(() => {
    const m = {};
    players.forEach((p,i) => { m[p] = COLORS[i % COLORS.length]; });
    return m;
  }, [players]);

  // Build cumulative profit per session per player
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
  const top = scores.slice(0, TOP_N);
  const ses = sessions[curSes];

  if (total === 0) return null;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 space-y-3">
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
          className={"px-3 py-1.5 rounded-lg text-xs font-bold transition-colors " + (playing ? "bg-zinc-700 text-white" : "bg-amber-500 text-black")}>
          {playing ? "⏸ หยุด" : "▶ Play"}
        </button>
        <button onClick={() => { setPlaying(false); setCurSes(0); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors">
          ↺ Reset
        </button>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-zinc-600 text-xs">ความเร็ว:</span>
          {[1,2,4].map(s => (
            <button key={s} onClick={() => setSpeed(s)}
              className={"px-2 py-1 rounded-md text-xs border transition-colors " + (speed===s ? "bg-amber-500/15 text-amber-400 border-amber-500/30" : "bg-zinc-800 text-zinc-500 border-zinc-700")}>
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
          className="flex-1 h-1 rounded-full appearance-none bg-zinc-700 accent-amber-400 cursor-pointer"/>
        <span className="text-zinc-600 text-[10px] font-mono flex-shrink-0">เซสชั่น {total}</span>
      </div>

      {/* Bars */}
      <div className="space-y-1.5">
        {top.map((s, rank) => {
          const pct = Math.max(2, (Math.abs(s.profit) / maxAbs) * 94);
          const isPos = s.profit >= 0;
          return (
            <div key={s.name} className="flex items-center gap-2" style={{height:'34px'}}>
              {/* Name left */}
              <div className="flex-shrink-0 text-right" style={{width:'72px'}}>
                <div className="text-xs font-bold leading-tight truncate" style={{color: s.color}}>{s.name}</div>
                {s.nick && <div className="text-[9px] text-zinc-600 truncate">"{s.nick}"</div>}
              </div>
              {/* Bar */}
              <div className="flex-1 h-full bg-zinc-800/60 rounded-lg overflow-hidden relative">
                <div
                  className="h-full rounded-lg flex items-center justify-end pr-2 transition-all"
                  style={{
                    width: pct + '%',
                    background: isPos ? s.color : 'rgba(248,113,113,0.4)',
                    transition: 'width 0.4s ease',
                    minWidth: '2px',
                  }}>
                  <span className="text-[10px] font-bold font-mono whitespace-nowrap"
                    style={{color: isPos ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.8)'}}>
                    {isPos ? '+' : ''}{fmt(s.profit)} ฿
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
            className={"flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition-colors "+(filter.startsWith("sea:")?"bg-amber-500/10 border-amber-500/40 text-amber-400":"bg-zinc-900 border-zinc-700 text-zinc-500 focus:border-zinc-500")}>
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
            className={"flex-1 border rounded-lg px-3 py-1.5 text-xs focus:outline-none transition-colors "+(filter.startsWith("sid:")?"bg-amber-500/10 border-amber-500/40 text-amber-400":"bg-zinc-900 border-zinc-700 text-zinc-500 focus:border-zinc-500")}>
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
                    {p.silver>0 && <span className="bg-zinc-400/20 border border-zinc-400/30 text-zinc-300 px-1.5 py-0.5 rounded-full">🥈×{p.silver}</span>}
                    {p.bronze>0 && <span className="bg-orange-700/20 border border-orange-700/30 text-orange-300 px-1.5 py-0.5 rounded-full">🥉×{p.bronze}</span>}
                    {p.last>0   && <span className="bg-red-900/30 border border-red-700/30 text-red-400 px-1.5 py-0.5 rounded-full">💀×{p.last}</span>}
                    <span className="bg-zinc-700/40 border border-zinc-600/40 text-zinc-500 px-1.5 py-0.5 rounded-full">{p.n} เซสชั่น</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Box className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-800 text-zinc-400 bg-zinc-900/80">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">ผู้เล่น</th>
                  <th className="px-2 py-2 text-right">กำไร/ขาดทุน (฿)</th>
                  <th className="px-2 py-2 text-center">🥇</th><th className="px-2 py-2 text-center">🥈</th>
                  <th className="px-2 py-2 text-center">🥉</th><th className="px-2 py-2 text-center">💀</th>
                  <th className="px-1 py-2 text-right hidden sm:table-cell w-16">เซสชั่น</th>
                </tr></thead>
                <tbody>
                  {summary.map(p => (
                    <tr key={p.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
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
      {/* Racing Bar Chart */}
      {data.sessions.length > 1 && (
        <RacingBarChart sessions={data.sessions} players={data.players} nicknames={data.nicknames}/>
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
          <div key={s.internalId} className="bg-zinc-900/60 border border-zinc-800 rounded-2xl overflow-hidden">
            <button className="w-full flex items-center justify-between px-4 py-4 hover:bg-zinc-800/30 transition-colors text-left" onClick={()=>setOpen(isOpen?null:s.internalId)}>
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
                {s.note && <p className="mt-3 text-zinc-500 text-sm bg-zinc-800/40 rounded-lg px-3 py-2">📝 {s.note}</p>}
                {(onEdit || onDelete) && (
                  <div className="flex gap-2 mt-4 justify-end">
                    {onEdit   && <button onClick={()=>onEdit(s)} className="px-4 py-1.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm">✏️ แก้ไข</button>}
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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:border-amber-500 focus:outline-none"/>
          {errs.date && <p className="text-red-400 text-xs mt-1">{errs.date}</p>}
        </div>
        <div>
          <label className="block text-zinc-400 text-sm mb-1">📝 หมายเหตุ</label>
          <input type="text" value={note} onChange={e=>setNote(e.target.value)} placeholder="เช่น บ้านแนน..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/>
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
                <button onClick={()=>setSesNo(n=>Math.max(1,n-1))} className="w-8 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-bold text-lg flex-shrink-0">−</button>
                <input type="number" min="1" value={sesNo} onChange={e=>setSesNo(Number(e.target.value)||1)}
                  className={"w-full text-center bg-zinc-800 border rounded-lg py-1.5 text-white font-mono font-bold text-xl focus:outline-none "+(isDup?"border-red-500":"border-zinc-600 focus:border-amber-500")}/>
                <button onClick={()=>setSesNo(n=>n+1)} className="w-8 h-9 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-bold text-lg flex-shrink-0">+</button>
              </div>
              {errs.sesNo ? <p className="text-red-400 text-xs mt-1 text-center">{errs.sesNo}</p> : <p className="text-zinc-600 text-xs mt-1 text-center">ปรับได้</p>}
            </div>
          </div>
          <div className="mt-3 bg-zinc-900/50 rounded-xl px-3 py-2 text-center">
            <span className="text-amber-300 font-bold font-mono text-sm">📋 ปี {year} · ซีซั่น {season} · เซสชั่นที่ {sesNo}</span>
          </div>
        </div>
      )}

      {/* Rate + Fee */}
      <Box className="space-y-3">
        <div className="text-zinc-300 font-semibold text-sm">⚙️ ตั้งค่าเซสชั่นนี้</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-zinc-800/60 rounded-xl p-3 space-y-2">
            <div className="text-amber-400 text-xs font-semibold">🎰 อัตราแลกชิป</div>
            <div className="flex items-center gap-2">
              <div className="flex-1"><label className="text-zinc-500 text-xs">ชิป</label><NInput value={rate.chips} onChange={v=>setRate(r=>({...r,chips:v}))}/></div>
              <span className="text-zinc-500 mt-4">=</span>
              <div className="flex-1"><label className="text-zinc-500 text-xs">บาท</label><NInput value={rate.baht} onChange={v=>setRate(r=>({...r,baht:v}))}/></div>
            </div>
            <div className="text-zinc-500 text-xs font-mono">1 ชิป ≈ {rate.chips>0?(rate.baht/rate.chips).toFixed(4):0} ฿</div>
            {errs.rate && <p className="text-red-400 text-xs">{errs.rate}</p>}
          </div>
          <div className="bg-zinc-800/60 rounded-xl p-3 space-y-2">
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
        <div className="flex bg-zinc-800 rounded-lg p-0.5">
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
        <div className="px-4 py-3 border-b border-zinc-800 text-zinc-400 text-sm flex justify-between">
          <span>บันทึกชิปแต่ละคน ({mode==="chips"?"ชิป":"บาท"})</span>
          <span className="text-xs text-zinc-600">{active}/{rows.length} คน</span>
        </div>
        <div className="divide-y divide-zinc-800">
          {rows.map((r,i) => {
            const pb  = profit(r.buy, r.sell, rate);
            const act = r.buy>0 || r.sell>0;
            return (
              <div key={r.player} className={"px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 "+(act?"":"opacity-50")}>
                <div className="flex items-center gap-2 min-w-[80px]">
                  <span className={"w-2 h-2 rounded-full flex-shrink-0 "+(pb>0?"bg-emerald-400":pb<0?"bg-red-400":"bg-zinc-600")}/>
                  <span className="text-white font-medium"><PlayerName player={r.player} nicknames={data.nicknames}/></span>
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
          <div className="flex bg-zinc-800 rounded-lg p-0.5">
            <button onClick={()=>setType("income")}  className={"flex-1 py-2 rounded-md text-sm font-medium transition-colors "+(type==="income"?"bg-emerald-600 text-white":"text-zinc-400 hover:text-white")}>➕ รายรับ</button>
            <button onClick={()=>setType("expense")} className={"flex-1 py-2 rounded-md text-sm font-medium transition-colors "+(type==="expense"?"bg-red-600 text-white":"text-zinc-400 hover:text-white")}>➖ รายจ่าย</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-zinc-500 text-xs">วันที่</label><input type="date" value={dt} onChange={e=>setDt(e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:border-amber-500 focus:outline-none"/></div>
            <div><label className="text-zinc-500 text-xs">จำนวนเงิน (฿)</label><NInput value={amt} onChange={setAmt}/></div>
          </div>
          <div><label className="text-zinc-500 text-xs">รายการ</label><input type="text" value={txt} onChange={e=>setTxt(e.target.value)} placeholder="เช่น ค่าอาหาร..." className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/></div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <button onClick={submit} className={"w-full py-2.5 rounded-xl font-bold text-sm text-white transition-colors "+(type==="income"?"bg-emerald-600 hover:bg-emerald-500":"bg-red-600 hover:bg-red-500")}>บันทึกรายการ</button>
        </Box>
      )}
      <div className="space-y-2">
        <div className="text-zinc-500 text-xs font-semibold">ประวัติรายการ ({pot.transactions.length})</div>
        {pot.transactions.length===0 && <Box><div className="text-center py-6 text-zinc-600 text-sm">ยังไม่มีรายการ</div></Box>}
        {pot.transactions.map(tx => (
          <div key={tx.id} className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 rounded-xl px-4 py-3">
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
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"/>
          <button onClick={addPlayer} className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold">เพิ่ม</button>
        </div>
        <div className="space-y-2">
          {players.map(p => (
            <div key={p} className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2">
              <span className="text-white font-medium text-sm w-16 flex-shrink-0">{p}</span>
              <input
                value={nicknames[p] || ""}
                onChange={e => setNick(p, e.target.value)}
                placeholder="Nickname..."
                className="flex-1 bg-zinc-900 border border-zinc-600 rounded-lg px-3 py-1.5 text-zinc-300 text-xs placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none pr-16"
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
    if (!pw.trim()) { setErr("กรุณากรอก password"); return; }
    setChecking(true);
    setErr("");
    try {
      const stored = data?.settings?.adminPassword || data?.adminPassword || "";
      if (pw === stored) {
        localStorage.setItem("lspc_admin", "1");
        onLogin();
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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder-zinc-600 focus:border-amber-500 focus:outline-none"
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
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
      <Spinner/>
      <div className="text-amber-400 text-sm">กำลังโหลดข้อมูลจาก Google Sheets...</div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 px-6">
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
    { id:"sessions",    icon:"📋", label:"เซสชั่น",  adminOnly: false },
    { id:"add",         icon:"➕", label:"บันทึก",   adminOnly: true  },
    { id:"pot",         icon:"💰", label:"กองกลาง",  adminOnly: false },
    { id:"settings",    icon:"⚙️", label:"ตั้งค่า",  adminOnly: true  },
  ];
  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-3 flex items-center gap-2">
          <img src={LOGO_SRC} alt="Legendary Secrets Poker Club" className="h-14 w-14 rounded-xl object-cover flex-shrink-0 my-1"/>
          <div className="flex flex-1 items-center justify-between overflow-x-auto">
            <div className="flex">
              {TABS.map(t => (
                <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== "add") setEditSes(null); }}
                  className={"flex items-center gap-1 px-2 sm:px-2.5 py-4 text-xs font-medium border-b-2 transition-colors whitespace-nowrap " + (tab === t.id ? "border-amber-400 text-amber-400" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
                  <span>{t.icon}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 pl-2">
              <span className={"text-xs font-mono " + (potBal >= 0 ? "text-purple-400" : "text-red-400")}>
                💰 {fmt(potBal)} ฿
              </span>
              {isAdmin
                ? <button onClick={() => { localStorage.removeItem("lspc_admin"); setIsAdmin(false); setTab("dashboard"); }}
                    className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700 transition-colors">
                    🔓 Logout
                  </button>
                : <button onClick={() => setTab("login")}
                    className="text-xs px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 border border-zinc-700 transition-colors">
                    🔐 Login
                  </button>
              }
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {tab === "dashboard"   && <DashboardView data={data}
          onGoLeader={name => { setProfileSel(name); setTab("profiles"); }}
          onGoLatestSes={id => { setOpenSesId(id); setTab("sessions"); }}
          onGoPot={() => setTab("pot")}
        />}
        {tab === "leaderboard" && <LeaderboardView data={data}/>}
        {tab === "profiles"    && <PlayerProfilesView data={data} initialSel={profileSel} onClearSel={()=>setProfileSel(null)}/>}
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
  );
}
