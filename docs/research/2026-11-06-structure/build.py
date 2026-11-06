# -*- coding: utf-8 -*-
"""拼装 report.html：先跑 analysis.py（生成 coverage.md），再用同一份 PAGES/NEW 生成逐页对照表。"""
import os, html
HERE = os.path.dirname(os.path.abspath(__file__))
ns = {'__file__': os.path.join(HERE, 'analysis.py')}
exec(open(os.path.join(HERE, 'analysis.py'), encoding='utf-8').read(), ns)
PAGES, NEW = ns['PAGES'], ns['NEW']
e = html.escape
ST = {'保留': 'keep', '修订': 'rev', '删除（并入）': 'del'}
def ev_o(s):
    return e(s)
def figc_of(pst, disp, ph, fig):
    if fig != '—': return e(fig)
    if pst in ('占位', '未做'): return f'{ph}另出'
    return '沿用原型' if disp == '保留' else '沿用原型界面'
def rows_of(filter_fn):
    rows, cur = [], None
    for i, (blk, page, ln, pst, pev, disp, note, ph, fig) in enumerate(PAGES, 1):
        if not filter_fn(disp): continue
        if blk != cur:
            rows.append(f'<tr class="grp"><td colspan="7">{e(blk)}</td></tr>'); cur = blk
        rows.append(f'<tr><td class="id">#{i}</td><td><b>{e(page)}</b><br><span class="cap">{e(ln.replace("L","PRD L"))}</span></td><td>{e(pst)}<br><span class="cap">{e(pev)}</span></td><td><span class="st {ST[disp]}">{e(disp)}</span></td><td>{e(note)}</td><td class="nw">{e(ph)}</td><td>{figc_of(pst, disp, ph, fig)}</td></tr>')
    return ''.join(rows)
HEAD = '<thead><tr><th>#</th><th>PRD 页面</th><th>原型现状</th><th>新结构</th><th>说明</th><th>期</th><th>原型图</th></tr></thead>'
newrows = ''.join(f'<tr><td class="id">N{i}</td><td><b>{e(a)}</b></td><td>{e(b)}</td><td><span class="st new">新增</span></td><td>{e(c)}</td><td>{e(d) if d != "—" else "二期另出"}</td><td><span class="cap">{e(f)}</span></td></tr>' for i, (a, b, c, d, f) in enumerate(NEW, 1))
nchg = sum(1 for r in PAGES if r[5] != '保留')
table = (f'<div class="tw"><table class="t wide">{HEAD}<tbody>' + rows_of(lambda d: d != '保留') + '</tbody></table></div>'
         + '<div class="tw" style="margin-top:16px"><table class="t wide"><thead><tr><th>#</th><th>新增页面</th><th>职责</th><th></th><th>期</th><th>原型图</th><th>来源</th></tr></thead><tbody>' + newrows + '</tbody></table></div>'
         + f'<details class="more"><summary>PRD 第 3 节 40 页全表（含保留不动的 {len(PAGES)-nchg} 页）</summary><div class="tw"><table class="t wide">{HEAD}<tbody>' + rows_of(lambda d: True) + '</tbody></table></div></details>'
         + '<p class="fig-cap"><b>表 7</b>「原型图」列：P1–P8 是本页画出的高保真原型；「沿用原型」= 页面不变，原型里已有界面；「沿用原型界面」= 改动只在数据或规则层；「某期另出」= 原型里只是占位或没做、本次也没画，随该期另画。一期页面里没画的只有机器人接口密钥和工作日日历两个设置页。数据与计数和 coverage.md 第 1、2 节同源（build.py 从同一份清单生成）。</p>')
parts = ['p1-head.html', 'p2-hero.html', 'p3-root-onto.html', 'p4-todo.html', 'p5-time.html', 'p6-ia.html', 'p7-end.html', 'p8-js.html']
out = ''.join(open(os.path.join(HERE, 'parts', p), encoding='utf-8').read() for p in parts)
assert '<!--PAGES_TABLE-->' in out
out = out.replace('<!--PAGES_TABLE-->', table)
out = out.replace('.wk-c:nth-child(7n),.wk-h:nth-child(7n){border-right:0}', '.wk-h:nth-child(7),.wk-c:last-child{border-right:0}')
import re
out = re.sub(r'<td>([一二三]期)</td>', r'<td class="nw">\1</td>', out)
open(os.path.join(HERE, 'report.html'), 'w', encoding='utf-8').write(out)
print('report.html', len(out.encode('utf-8')), 'bytes')
