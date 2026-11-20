"""把演示页抓下来的真实 DOM + CSS 拼成管培生首页三版预览。
输入：home/root.html、home/page.css（从 127.0.0.1:5320 林夏首页抓取）
输出：home/index.html
"""
import re, os, sys

D = os.path.join(os.path.dirname(__file__), '..', 'home')
root = open(os.path.join(D, 'root.html'), encoding='utf-8').read()
css = open(os.path.join(D, 'page.css'), encoding='utf-8').read()

# ---------- 样式：去掉本地 @font-face，改由 Google Fonts 加载 ----------
css = re.sub(r'@font-face\s*\{[^}]*\}\s*', '', css)
css = css.replace('"Geist Sans"', '"Geist"')

# ---------- 拆出外壳与卡片 ----------
c0 = root.index('<div class="content">')
g0 = root.index('<div class="hm-t">')
m0 = root.index('</main>')
assert root[m0 - 12:m0] == '</div></div>'
shell_head = root[:c0]
head = root[c0 + len('<div class="content">'):g0]
grid = root[g0 + len('<div class="hm-t">'):m0 - 12]
shell_tail = root[m0 - 6:]

def sec(label):
    m = re.search(r'<section [^>]*aria-label="%s"[^>]*>.*?</section>' % re.escape(label), grid, re.S)
    assert m, label
    return m.group(0)

def svg_after(fragment, marker):
    i = fragment.index(marker)
    m = re.compile(r'<svg.*?</svg>', re.S).search(fragment, i)
    return m.group(0)

WEEK = sec('我的本周')
PROG = sec('我的进度')
RV = sec('最新点评')
WAIT = sec('等待点评')
RES = sec('当前岗位资料')
FEED = sec('团队动态')
TID = sec('AI 发现')
F1 = re.search(r'<article class="card focus" style="grid-area: f1;">.*?</article>', grid, re.S).group(0)
F2 = re.search(r'<article class="card focus" style="grid-area: f2;">.*?</article>', grid, re.S).group(0)

I_EXAM = svg_after(F1, 'tile d-exam')
I_PEN = svg_after(F2, 'tile d-grow')
I_RIGHT = svg_after(WEEK, 'class="more"')
I_CLOCK = svg_after(WAIT, 'tile d-ment')
I_INFO = svg_after(WAIT, 'margin-top: auto')
I_CHECK = svg_after(RV, 'chip ok')

# ---------- 下一步（深色卡）：内容取自原焦点卡 f1，下面接 f2 ----------
NEXT = f'''<article class="card dark nx" style="grid-area: nx;" aria-label="下一步">
<div class="r1"><span class="tile d-exam" aria-hidden="true">{I_EXAM}</span><span>下一步 · 周期任务 · 考核</span><span class="chip due">今天 20:00</span></div>
<h3>轻测 · 客服</h3>
<div class="foot"><div><div class="cd"><span class="n">9</span><span class="u">小时</span><span class="n">36</span><span class="u">分</span></div><div class="lbl">距截止</div></div><a class="btn pri" href="/growth/tasks/r-quiz-u-lin-2026-11-05">查看轻测</a></div>
<div class="then"><span class="tl">做完接着做</span><span class="tile sm d-grow" aria-hidden="true">{I_PEN}</span><span class="grow1"><b>一周来电归因复盘</b><small>路径任务 · 客服岗 · 明天 18:00</small></span><span class="pct"><span class="lbar thin d-grow" role="progressbar" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100"><i style="width: 50%;"></i></span>50%</span><a class="btn sec sm" href="/growth/tasks/t-u-lin-tt-9">继续写</a></div>
</article>'''

# ---------- 带教点评：等待点评 + 最新点评，零件原样搬 ----------
wait_doc = re.search(r'<a class="doc".*?</a>', WAIT, re.S).group(0)
wait_note = re.search(r'<p class="muted row".*?</p>', WAIT, re.S).group(0)
rv_row = re.search(r'<div class="row" style="margin-top: 14px; gap: 10px;">.*?</span></div>', RV, re.S).group(0)
rv_row = rv_row.replace('margin-top: 14px; ', '')
rv_quote = re.search(r'<p class="quote hm-clamp">.*?</p>', RV, re.S).group(0)
rv_date = re.search(r'<p class="muted" style="font-size: 11.5px; margin-top: 8px;">.*?</p>', RV, re.S).group(0)

def review(two):
    return f'''<section class="card vcol rvm{' two' if two else ''}" style="grid-area: rv;" aria-label="带教点评">
<div class="hd"><h2>带教点评</h2><a class="more" href="/growth/me">全部{I_RIGHT}</a></div>
<div class="rvm-b">
<div class="rvm-w vcol"><div class="sec-l"><span>等待点评</span><span>1 份</span></div>{wait_doc}{wait_note}</div>
<div class="rvm-l vcol"><div class="sec-l"><span>最新点评</span></div>{rv_row}{rv_quote}{rv_date}</div>
</div>
</section>'''

# ---------- 进度：顶部两个数字格换成双圆环，其余原样 ----------
def ring(r, pct, color):
    c = 2 * 3.14159265 * r
    return (f'<circle cx="52" cy="52" r="{r}" fill="none" stroke="rgba(21,25,38,.07)" stroke-width="10"></circle>'
            f'<circle cx="52" cy="52" r="{r}" fill="none" stroke="{color}" stroke-width="10" stroke-linecap="round" '
            f'stroke-dasharray="{c * pct:.1f} {c:.1f}" transform="rotate(-90 52 52)"></circle>')

RINGS = f'''<div class="hm-ring"><svg viewBox="0 0 104 104" role="img" aria-label="完成 5/6，时间 30%">{ring(44, 5 / 6, 'var(--grow)')}{ring(30, .30, 'var(--ink)')}</svg>
<div class="lg"><div><i style="background: var(--grow);"></i><span class="l">完成进度</span><span class="v">5<small>/ 6</small></span><span class="s">已通过 / 应完成</span></div>
<div><i style="background: var(--ink);"></i><span class="l">时间进度</span><span class="v">30<small>%</small></span><span class="s">第 57 / 191 天</span></div></div></div>'''
a = PROG.index('<div class="hm-two">')
b = PROG.index('<div class="row" style="margin-top: 10px;', a)
PROG_R = PROG[:a] + RINGS + PROG[b:]

# ---------- 横向周视图：数据与原「我的本周」时间轴一致 ----------
DAYS = [
    ('周一', '11.02', 'past', []),
    ('周二', '11.03', 'past', []),
    ('周三', '11.04', 'past', [('d-grow done', '话术演练录音', '18:00 · 已提交')]),
    ('今天', '11.05', 'today', [('d-exam', '轻测 · 客服', '20:00 · 轻测')]),
    ('周五', '11.06', '', [('d-grow', '一周来电归因复盘', '18:00 · 路径任务')]),
    ('周六', '11.07', '', []),
    ('周日', '11.08', '', [('d-week', '第 45 周周报', '22:00 · 周报')]),
]
days_html = ''.join(
    f'<div class="wd {cls}"><div class="dh"><span>{w}</span><b>{d}</b></div>'
    + ''.join(f'<div class="we {c}"><b>{n}</b><small>{s}</small></div>' for c, n, s in evs)
    + '</div>' for w, d, cls, evs in DAYS)
week_hd = re.search(r'<div class="hd">.*?</a></div>', WEEK, re.S).group(0)
week_ft = WEEK[WEEK.index('<div class="divider dash"'):WEEK.rindex('</section>')]
WEEK_H = f'''<section class="card vcol wkh" aria-label="我的本周" style="grid-area: week;">{week_hd}
<div class="wk7">{days_html}</div>
<div class="wk-next"><span class="lb">下周四 11.12</span><span class="wi d-acc"><b class="num">09:00</b>换站 → 到销售站</span><span class="wi d-team"><b class="num">19:30</b>用 Claude 做行业研究 · 团队活动</span></div>
{week_ft}</section>'''

FEED2 = FEED.replace('<section class="card "', '<section class="card feed2"', 1)

# B 版：本周 + 下周两行（下周只有原时间轴里 11.12 的两项）
NEXT_DAYS = [
    ('周一', '11.09', '', []), ('周二', '11.10', '', []), ('周三', '11.11', '', []),
    ('周四', '11.12', '', [('d-acc', '换站 → 到销售站', '09:00 · 换站'), ('d-team', '用 Claude 做行业研究', '19:30 · 团队活动')]),
    ('周五', '11.13', '', []), ('周六', '11.14', '', []), ('周日', '11.15', '', []),
]
next_html = ''.join(
    f'<div class="wd {cls}"><div class="dh"><span>{w}</span><b>{d}</b></div>'
    + ''.join(f'<div class="we {c}"><b>{n}</b><small>{s}</small></div>' for c, n, s in evs)
    + '</div>' for w, d, cls, evs in NEXT_DAYS)
WEEK_H2 = f'''<section class="card vcol wkh" aria-label="我的本周" style="grid-area: week;">{week_hd}
<div class="wk7 two"><div class="wl">本周</div>{days_html}<div class="wl">下周 · 销售站</div>{next_html}</div>
{week_ft}</section>'''

# ---------- 三版 ----------
VERS = {
    'a': ('A 原位替换', '下一步、带教点评放在原来两张焦点卡、两张点评卡的位置；本周、进度不动，进度顶部换成双圆环',
          NEXT + review(True) + WEEK + PROG_R + RES + FEED2 + TID),
    'b': ('B 本周横排', '下一步和带教点评并排在第一行；本周改成横向周视图（本周 + 下周），进度在右侧',
          NEXT + review(True) + WEEK_H2 + PROG_R + RES + FEED2 + TID),
    'c': ('C 右侧状态栏', '进度竖排在右列；左边是下一步、横向周视图，下面是带教点评、资料、AI 发现，团队动态通栏',
          NEXT + review(True) + WEEK_H + PROG_R + RES + FEED + TID),
}

EXTRA = open(os.path.join(os.path.dirname(__file__), 'extra.css'), encoding='utf-8').read()

grids = ''.join(f'<div class="hm-t v-{k}" data-v="{k}"{"" if k == "a" else " hidden"}>{body}</div>' for k, (_, _, body) in VERS.items())
seg = ''.join(f'<button type="button" data-k="{k}" aria-pressed="{"true" if k == "a" else "false"}">{t}</button>' for k, (t, _, _) in VERS.items())
notes = {k: n for k, (_, n, _) in VERS.items()}

page = f'''<title>管培生首页三版</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&family=Manrope:wght@500;600;700;800&display=swap">
<style>
{css}
{EXTRA}
</style>
{shell_head}<div class="content">{head}{grids}</div>{shell_tail}
<div class="vsw" role="group" aria-label="切换版式"><span class="seg-l">版式</span><div class="seg">{seg}</div><span class="vnote" id="vnote">{notes['a']}</span></div>
<script>
(() => {{
  const NOTES = {notes!r};
  const set = k => {{
    document.querySelectorAll('.hm-t[data-v]').forEach(g => g.hidden = g.dataset.v !== k);
    document.querySelectorAll('.vsw button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    document.getElementById('vnote').textContent = NOTES[k];
  }};
  document.querySelectorAll('.vsw button').forEach(b => b.addEventListener('click', () => {{ set(b.dataset.k); if (location.hash !== '#' + b.dataset.k) history.replaceState(null, '', '#' + b.dataset.k); }}));
  const fromHash = () => {{ const k = location.hash.slice(1); if (NOTES[k]) set(k); }};
  addEventListener('hashchange', fromHash); fromHash();
  // 原型里的站内链接只做展示
  document.addEventListener('click', e => {{ const a = e.target.closest('a[href^="/"]'); if (a) e.preventDefault(); }});
  // 窄屏（手机）整页按 1440 宽等比缩小，不横向滚动
  const app = document.querySelector('.app');
  const fit = () => {{
    const w = document.documentElement.clientWidth;
    if (w < 1440) {{ document.body.style.minWidth = '0'; app.style.width = '1440px'; app.style.zoom = String(w / 1440); }}
    else {{ document.body.style.minWidth = ''; app.style.width = ''; app.style.zoom = ''; }}
  }};
  addEventListener('resize', fit); fit();
}})();
</script>
'''
page = page.replace("'", "'")
out = os.path.join(D, 'index.html')
open(out, 'w', encoding='utf-8').write(page)
print('ok', len(page))

# 本地自查用：补上发布时平台会加的 doctype 外壳
shell = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
         '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
         '<style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>')
open(os.path.join(D, 'preview.html'), 'w', encoding='utf-8').write(shell + page + '</body></html>')
