/* 挑版页用的首页、成长档案页样式，定格在 2026-11-14 常浩挑版时的样子（提交 e7aa9e0 的 Home.tsx、Team.tsx）。
   不从页面文件直接引入：那两页后来按 v3.0 重做，样式一变，这里已选定的版式就跟着走样。 */
export const HOME_PAGE_CSS = `
.hm-t { margin-top: 20px; display: grid; gap: var(--gap); grid-template-columns: 1fr 1fr 1.08fr 1.08fr; grid-template-rows: 176px 292px auto auto;
  grid-template-areas: "f1 f2 week prog" "rv wait week prog" "res ai ai board" "feed feed feed tid"; align-items: stretch; }
.hm-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.hm-two > div { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); }
.hm-two .l { font-size: 11.5px; color: var(--mute); }
.hm-two .v { font-family: var(--num); font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.hm-two .v small { font-size: 13px; font-weight: 600; color: var(--ink2); margin-left: 2px; }
.hm-two .s { font-size: 11px; color: var(--mute); }
.hm-clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.hm-lb { margin-top: 8px; display: grid; }
.hm-lb .lr { display: flex; align-items: center; gap: 10px; padding: 7px 6px; border-radius: 10px; font-size: 13px; }
.hm-lb .lr.you { background: var(--acc-soft); color: var(--acc-ink); font-weight: 500; }
.hm-lb .n { width: 18px; text-align: center; font-family: var(--num); font-size: 12px; font-weight: 700; color: var(--faint); }
.hm-lb .n.hi { color: var(--ai-ink); }
.hm-lb .p { font-family: var(--num); font-weight: 700; }
.hm-tid { margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); transition: box-shadow var(--t); }
.hm-tid:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--ai) 40%, transparent); }
.hm-tid b { display: block; font-size: 12.5px; font-weight: 600; }
.hm-tid small { display: block; font-size: 11px; color: var(--mute); }
.hm-tid > .ico { width: 14px; height: 14px; color: var(--faint); }
.hm-feed { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 20px; margin-top: 12px; align-items: start; }
.hm-pin { display: flex; gap: 12px; align-items: center; padding: 12px; border-radius: 16px; background: var(--team-soft); transition: box-shadow var(--t); }
.hm-pin:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--team) 40%, transparent); }
.hm-pin .dt, .hm-ev .dt { width: 48px; flex: none; display: grid; justify-items: center; padding: 6px 0; border-radius: 12px; background: #fff; color: var(--ci, var(--team-ink)); box-shadow: 0 0 0 1px var(--line); }
.hm-pin .dt { color: var(--team-ink); }
.hm-pin .dt small, .hm-ev .dt small { font-size: 10.5px; }
.hm-pin .dt b, .hm-ev .dt b { font-size: 13px; font-weight: 700; }
.hm-pin small { display: block; font-size: 11px; color: var(--team-ink); }
.hm-pin b { display: block; font-size: 13px; font-weight: 600; line-height: 1.4; margin-top: 1px; }
.hm-pin span > span { display: block; font-size: 11.5px; color: var(--ink2); margin-top: 2px; }
.hm-ov { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
.hm-ov a { display: grid; gap: 2px; padding: 10px 12px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); transition: box-shadow var(--t); }
.hm-ov a:hover { box-shadow: 0 0 0 1px rgba(74,78,216,.35); }
.hm-ov .num { font-size: 22px; font-weight: 700; line-height: 1.1; }
.hm-ov small { font-size: 11.5px; color: var(--mute); }
.hm-2w { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 14px; }
.hm-ev { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border-radius: 14px; background: var(--well); box-shadow: 0 0 0 1px var(--line); margin-top: 8px; transition: box-shadow var(--t); }
a.hm-ev:hover { box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent); }
.hm-ev .dt { background: var(--cs); box-shadow: none; }
.hm-ev b { display: block; font-size: 13px; font-weight: 600; }
.hm-ev .who { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; font-size: 11.5px; color: var(--ink2); }
.hm-ev .who > span { white-space: nowrap; display: inline-flex; align-items: center; gap: 3px; }
.hm-ev .dot, .hm-dotk { width: 6px; height: 6px; border-radius: 50%; background: var(--due); display: inline-block; }
.hm-lv { width: 10px; height: 10px; border-radius: 50%; flex: none; margin: 0 11px; background: var(--grow); box-shadow: 0 0 0 4px var(--grow-soft); }
.hm-lv.warn { background: var(--warn); box-shadow: 0 0 0 4px var(--warn-soft); }
.hm-lv.error { background: var(--due); box-shadow: 0 0 0 4px var(--due-soft); }
.hm-lv.off { background: var(--faint); box-shadow: 0 0 0 4px rgba(21,25,38,.05); }
.hm-assets { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
.hm-assets .card { padding: 14px 16px; }
`;

export const TEAM_PAGE_CSS = `
.tm-card{display:flex;flex-direction:column;padding:18px 20px 16px}
.tm-name{display:block;font-size:15px;font-weight:600}
.tm-card small{display:block;font-size:11.5px}
.tm-now{margin-top:16px;display:flex;align-items:baseline;gap:8px}
.tm-now .lbl{font-size:11.5px;color:var(--mute)}
.tm-now b{font-size:20px;font-weight:600;letter-spacing:-.01em}
.tm-wk{margin-left:auto;font-size:11.5px;color:var(--mute)}
.tm-kv{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.tm-kv>div{padding:8px 10px;border-radius:12px;background:var(--well);box-shadow:0 0 0 1px var(--line);display:grid;gap:1px;min-width:0}
.tm-kv span{font-size:11px;color:var(--mute)}
.tm-kv b{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-others{margin-top:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.tm-o{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t),box-shadow var(--t)}
.tm-o:hover{background:#fff;box-shadow:0 0 0 1px var(--line2),0 8px 18px -12px rgba(28,36,64,.3)}
.tm-o b{display:flex;align-items:center;gap:8px;font-weight:600}
.tm-o small{display:block;font-size:11.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-o-n{display:flex;gap:14px;flex:none;font-size:11px;color:var(--mute)}
.tm-o-n span{display:grid;justify-items:center}
.tm-o-n b{font-size:16px;color:var(--ink)}
.tm-hero{margin-top:0;display:flex;gap:18px;align-items:flex-start;padding:22px 24px}
.tm-hero .av.lg{width:64px;height:64px;font-size:24px}
.tm-hero h1{font-size:var(--fs-3xl);font-weight:300;letter-spacing:-.01em;line-height:1.1;margin-right:4px}
.tm-bio{margin-top:10px;font-size:13.5px;line-height:1.75;color:var(--ink2);max-width:560px}
.tm-hero-kv{display:grid;grid-template-columns:repeat(2,minmax(0,auto));gap:8px 22px;padding:4px 0 0 22px;border-left:1px solid var(--line);flex:none}
.tm-hero-kv>div{display:grid;gap:2px}
.tm-hero-kv span{font-size:11.5px;color:var(--mute)}
.tm-hero-kv b{font-size:13px;font-weight:600;white-space:nowrap}
.tm-hero-act{display:grid;gap:8px;flex:none;justify-items:end}
.tm-comp{margin-top:16px;display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);font-size:12.5px}
.tm-comp b{font-size:17px;font-weight:700}
.tm-hand{display:flex;flex-direction:column}
.tm-hand-list{margin-top:12px;display:grid;gap:8px}
.tm-hand-list b{font-size:13px;font-weight:600}
.tm-hand-list ol{margin:8px 0 0;padding-left:18px;display:grid;gap:4px;font-size:12.5px;line-height:1.65;color:var(--ink2)}
.tm-foot{margin-top:auto;padding-top:12px;display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--mute)}
.tm-tl{list-style:none;margin:12px 0 0;padding:0;position:relative;display:grid;gap:2px}
.tm-tl::before{content:"";position:absolute;left:85px;top:10px;bottom:10px;width:2px;border-radius:2px;background:rgba(21,25,38,.07)}
.tm-tl li{display:grid;grid-template-columns:62px 36px minmax(0,1fr);align-items:center;gap:6px;min-height:40px}
.tm-tl-d{font-size:12px;font-weight:600;color:var(--ink2);text-align:right;display:grid;line-height:1.25}
.tm-tl-d small{font-size:10.5px;font-weight:500;color:var(--faint)}
.tm-tl-dot{position:relative;z-index:1;justify-self:center;width:26px;height:26px;border-radius:9px;display:grid;place-items:center;background:var(--cs);color:var(--ci);box-shadow:0 0 0 3px #F6F7FA}
.tm-tl-dot .ico{width:13px;height:13px}
.tm-tl-t{font-size:13px;color:var(--ink);display:flex;align-items:center;gap:6px;line-height:1.5}
.tm-tl-t .ico{color:var(--faint);flex:none}
.tm-locked{margin-top:14px;padding:26px 20px;border-radius:16px;background:var(--sunk);text-align:center;display:grid;justify-items:center;gap:6px}
.tm-locked>span{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:#fff;color:var(--ink2);box-shadow:0 0 0 1px var(--line)}
.tm-locked b{font-size:13.5px;font-weight:600}
.tm-locked p{font-size:12.5px;color:var(--mute);line-height:1.7;max-width:320px}
.tm-subs{margin-top:10px;display:grid;gap:6px}
.tm-sub{display:grid;gap:3px;padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t),box-shadow var(--t)}
.tm-sub:hover{background:#fff;box-shadow:0 0 0 1px var(--line2),0 6px 14px -8px rgba(28,36,64,.2)}
.tm-sub b{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-sub small{font-size:11.5px;color:var(--mute);padding-left:32px}
.tm-q{padding-left:32px;font-size:12.5px;line-height:1.65;color:var(--ink2)}
.tm-q span{color:var(--mute);margin-left:4px}
.tm-assets{margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tm-asset{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;background:var(--well);box-shadow:0 0 0 1px var(--line);transition:background var(--t)}
.tm-asset:hover{background:#fff}
.tm-asset b{display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tm-asset small{display:block;font-size:11.5px;color:var(--mute)}
.tm-asset>.ico{color:var(--faint)}
.tm-noasset{margin-top:12px;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:var(--sunk);font-size:12.5px;color:var(--ink2)}
`;
