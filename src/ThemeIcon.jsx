import React from 'react';

// Presentation-only icons. Values, handlers and stored data stay with their views.
const artwork = {dashboard:'dashboard',leaderboard:'leaderboard',profiles:'profiles',race:'race',skill:'skill',luck:'luck',calc:'calc',streak:'streak',avatar:'avatar',sessions:'sessions',add:'add',pot:'pot',settings:'settings'};
const paths = {
  spade:'M12 2C9 6 3 9 3 14c0 5 6 5 9 1-1 4-2 6-3 7h6c-1-1-2-3-3-7 3 4 9 4 9-1 0-5-6-8-9-12z',
  diamond:'M12 2l8 10-8 10-8-10z',
  crownSmall:'M3 6l4 5 5-8 5 8 4-5-3 14H6z M6 17h12',
  sessions:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h8 M8 18h5',
  add:'M12 4v16 M4 12h16', minus:'M4 12h16',
  pot:'M4 6c0-4 16-4 16 0s-16 4-16 0 M4 6v6c0 4 16 4 16 0V6 M4 12v6c0 4 16 4 16 0v-6',
  settings:'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  crown:'M3 6l4 5 5-8 5 8 4-5-3 14H6z M6 17h12',
  calendar:'M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M8 14h2 M14 14h2 M8 18h2 M14 18h2',
  edit:'M4 16L16 4l4 4L8 20H4z M13 7l4 4',
  trash:'M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7',
  save:'M4 3h13l3 3v15H4z M8 3v6h8V3 M8 21v-8h8v8',
  lock:'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
  unlock:'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0 M12 14v3',
  check:'M4 12l5 5L20 5', close:'M6 6l12 12 M18 6L6 18',
  warning:'M12 3L2 21h20z M12 9v5 M12 17v1',
  reset:'M4 10a8 8 0 1 1 1 8 M4 4v6h6',
  search:'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M15 15l6 6',
  cards:'M4 6h11v15H4z M8 6V3h12v15h-5 M9.5 10l3 3-3 3-3-3z',
  chip:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0 M12 3v4 M12 17v4 M3 12h4 M17 12h4',
  box:'M3 7l9-4 9 4v11l-9 4-9-4z M3 7l9 4 9-4 M12 11v11 M7 5l10 4',
  mask:'M3 5l9 3 9-3v8c-1 6-6 8-9 9-3-1-8-3-9-9z M6 11l4 1 M14 12l4-1 M8 16q4 3 8 0',
  skull:'M5 11a7 7 0 1 1 14 0v4l-3 1v5H8v-5l-3-1z M8 11h2 M14 11h2 M12 16v5',
  ruler:'M3 17L17 3l4 4L7 21z M9 11l3 3 M13 7l3 3',
  bolt:'M13 2L4 14h7l-1 8 10-13h-7z',
  phone:'M5 3h4l2 5-3 2 6 6 2-3 5 2v4c-9 3-19-7-16-16z',
  pin:'M12 22S5 13 5 9a7 7 0 1 1 14 0c0 4-7 13-7 13z M14 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  medal:'M5 2l5 8 M19 2l-5 8 M16 2l-4 6-4-6 M19 16a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
};
export function ThemeIcon({name, label, rank}) {
  if (name === 'medal' && [1,2,3].includes(rank)) return <img className="theme-icon theme-icon-art" src={'/vip-icons/medal-'+rank+'.png'} alt={label||('อันดับ '+rank)}/>;
  if (artwork[name]) return <img className="theme-icon theme-icon-art" src={'/vip-icons/'+artwork[name]+'.png'} alt={label||''}/>;
  return <svg className={'theme-icon theme-icon-'+name} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role={label?'img':undefined} aria-label={label} aria-hidden={label?undefined:true}><path d={paths[name]||paths.chip}/>{rank&&<text x="12" y="19" textAnchor="middle" fontSize="8" stroke="none" fill="currentColor">{rank}</text>}</svg>;
}
const glyphs = {'♛':'crown','♠':'spade','♦':'diamond','📈':'streak','🏅':'medal','🥇':'medal','🥈':'medal','🥉':'medal','💀':'skull','📋':'sessions','🏆':'leaderboard','🏎':'race','🎰':'chip','📦':'box','🎭':'mask','❌':'close','🔍':'search','😵':'warning','👑':'crown','📝':'edit','✏':'edit','🗑':'trash','➕':'add','➖':'minus','📅':'calendar','📌':'pin','🎯':'skill','⚙':'settings','⚡':'bolt','✅':'check','⚠':'warning','💾':'save','💰':'pot','💵':'pot','👥':'profiles','🔐':'lock','🔓':'unlock','🔄':'reset','🧮':'calc','📞':'phone','🃏':'cards','📐':'ruler','🍀':'luck'};
export function themedLabel(value) {
  if(typeof value!=='string') return value;
  const parts=value.split(/([\u{1F300}-\u{1FAFF}\u2600-\u27BF]\uFE0F?)/u);
  return parts.map((part,i)=>{
    const char=part.replace(/\uFE0F/g,'');
    const name=glyphs[char];
    if(!name)return part;
    const rank={'🥇':1,'🥈':2,'🥉':3}[char];
    return <ThemeIcon key={i} name={name} rank={rank} label={rank?'อันดับ '+rank:undefined}/>;
  });
}
