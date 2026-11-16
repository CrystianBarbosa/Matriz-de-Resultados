/* ===== Núcleo compartilhado: dados, métricas, formatação e gráficos SVG ===== */
const DATA = window.__DATA__;
const R = DATA.recs.map(a => ({ u: a[0], tipo: a[1], geo: a[2], ano: a[3], sem: a[4], p: a[3] + ' ' + a[4],
  dist: a[5], arm: a[6], mte: a[7], man: a[8], amb: a[9] }));
const PERIODS = [...new Set(R.map(r => r.p))].sort();
const YEARS = [...new Set(R.map(r => r.ano))].sort();
const GEOS = [...new Set(R.map(r => r.geo))].filter(Boolean).sort();
const TIPOS = [...new Set(R.map(r => r.tipo))].sort();
const UNITS = [...new Set(R.map(r => r.u))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

const IND = {
  mte:  { lab: 'Check MTE', long: 'Aderência ao Check do Ministério do Trabalho', kind: 'pct' },
  man:  { lab: 'Manutenção', long: 'Cultura de Manutenção e Conservação', kind: 'pct' },
  amb:  { lab: 'Ambiental', long: 'Aderência ao Check Ambiental', kind: 'pct' },
  dist: { lab: 'Frota Distribuição', long: 'Nível de criticidade — Frota Distribuição', kind: 'lvl' },
  arm:  { lab: 'Equip. Armazém', long: 'Nível de criticidade — Equipamentos Armazém', kind: 'lvl' },
};
const PCT_KEYS = ['mte', 'man', 'amb'];
const LVL_KEYS = ['dist', 'arm'];
const LVL_NAME = { 1: 'Nível 1', 2: 'Nível 2', 3: 'Nível 3', 4: 'Nível 4', 5: 'Nível 5' };

/* ---------- métricas ---------- */
const vals = (rows, f) => rows.map(r => r[f]).filter(v => v !== null && v !== undefined);
const mean = (rows, f) => { const v = vals(rows, f); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const count = (rows, f) => vals(rows, f).length;
const shareLvl = (rows, f, pred) => { const v = vals(rows, f); return v.length ? v.filter(pred).length / v.length : null; };
const lvlCounts = (rows, f) => { const c = [0, 0, 0, 0, 0]; vals(rows, f).forEach(v => { if (v >= 1 && v <= 5) c[v - 1]++; }); return c; };
/* métrica unificada: % para indicadores percentuais, "% em Nível 1" para níveis */
function metric(rows, k) { return IND[k].kind === 'pct' ? mean(rows, k) : shareLvl(rows, k, v => v === 1); }
const byPeriod = (rows, p) => rows.filter(r => r.p === p);
const byYear = (rows, y) => rows.filter(r => r.ano === y);
function unitRows(u) { return R.filter(r => r.u === u).sort((a, b) => a.p.localeCompare(b.p)); }

/* ---------- formatação pt-BR ---------- */
const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v, d = 1) => v === null || v === undefined || isNaN(v) ? '—' : (d === 0 ? nf0 : nf1).format(v * 100) + '%';
const fmtPP = d => d === null || isNaN(d) ? '—' : (d > 0 ? '+' : d < 0 ? '−' : '±') + nf1.format(Math.abs(d * 100)) + ' p.p.';
const fmtRel = (a, b) => (a === null || b === null || !a) ? '—' : ((b - a) / a > 0 ? '+' : (b - a) / a < 0 ? '−' : '±') + nf1.format(Math.abs((b - a) / a * 100)) + '%';
const fmtLvl = v => v === null || v === undefined ? '—' : nf2.format(v);
const sign = d => d === null || isNaN(d) ? 0 : (Math.abs(d) < 0.0005 ? 0 : Math.sign(d));
const arrow = d => sign(d) > 0 ? '▲' : sign(d) < 0 ? '▼' : '●';
function deltaHTML(d, kind = 'pp', invert = false) {
  const s = sign(d) * (invert ? -1 : 1);
  const cls = s > 0 ? 'up' : s < 0 ? 'down' : 'flat';
  const txt = kind === 'pp' ? fmtPP(d) : (d > 0 ? '+' : d < 0 ? '−' : '±') + nf2.format(Math.abs(d));
  return `<span class="delta ${cls}"><span aria-hidden="true">${arrow(s)}</span> ${txt}</span>`;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pLabel = p => p.replace(' ', ' · ');

/* ---------- tooltip ---------- */
const TT = (() => {
  const el = document.createElement('div'); el.className = 'tt'; el.setAttribute('role', 'tooltip');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
  return {
    show(html, x, y) {
      el.innerHTML = html; el.style.opacity = 1;
      const w = el.offsetWidth, h = el.offsetHeight;
      let left = x + 14, top = y + 14;
      if (left + w > innerWidth - 8) left = x - w - 14;
      if (top + h > innerHeight - 8) top = y - h - 14;
      el.style.left = Math.max(8, left) + 'px'; el.style.top = Math.max(8, top) + 'px';
    },
    hide() { el.style.opacity = 0; },
  };
})();
function bindTip(node, htmlFn) {
  node.addEventListener('mousemove', e => TT.show(htmlFn(), e.clientX, e.clientY));
  node.addEventListener('mouseleave', () => TT.hide());
  node.addEventListener('focus', () => { const b = node.getBoundingClientRect(); TT.show(htmlFn(), b.right, b.top); });
  node.addEventListener('blur', () => TT.hide());
}

/* ---------- utilitários SVG ---------- */
const NS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) { if (k === 'style') n.setAttribute('style', attrs[k]); else if (k === 'text') n.textContent = attrs[k]; else n.setAttribute(k, attrs[k]); }
  if (parent) parent.appendChild(n); return n;
}
function niceTicks(min, max, n = 4) {
  const span = max - min, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || mag * 10;
  const t = []; for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) t.push(+v.toFixed(10)); return t;
}
const onResize = (() => { const fns = []; let to; addEventListener('resize', () => { clearTimeout(to); to = setTimeout(() => fns.forEach(f => f()), 120); }); return f => fns.push(f); })();

/* ---------- gráfico de linhas (um eixo) com crosshair ---------- */
function lineChart(el, cfg) {
  const draw = () => {
    el.innerHTML = '';
    const W = Math.max(160, el.clientWidth), H = cfg.height || 300;
    const m = { t: 18, r: cfg.endLabels === false ? 18 : 118, b: 34, l: 46 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': cfg.aria || '' }, el);
    const all = cfg.series.flatMap(s => s.vals).filter(v => v !== null);
    let lo = cfg.yMin ?? Math.min(...all), hi = cfg.yMax ?? Math.max(...all);
    if (cfg.yMin === undefined) { const pad = (hi - lo) * 0.15 || 0.05; lo -= pad; hi += pad; }
    const ticks = niceTicks(lo, hi, 4); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const X = i => m.l + (cfg.x.length === 1 ? (W - m.l - m.r) / 2 : i * (W - m.l - m.r) / (cfg.x.length - 1));
    const Y = v => m.t + (1 - (v - lo) / (hi - lo)) * (H - m.t - m.b);
    ticks.forEach(t => {
      S('line', { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), style: 'stroke:var(--grid);stroke-width:1' }, svg);
      S('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick', text: cfg.fmt(t, 0) }, svg);
    });
    cfg.x.forEach((x, i) => S('text', { x: X(i), y: H - 10, 'text-anchor': 'middle', class: 'tick', text: x }, svg));
    const cross = S('line', { y1: m.t, y2: H - m.b, style: 'stroke:var(--axis);stroke-width:1;opacity:0' }, svg);
    const labels = [];
    cfg.series.forEach(s => {
      let d = '', pen = false;
      s.vals.forEach((v, i) => { if (v === null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i) + ' ' + Y(v); pen = true; });
      if (s.area) {
        const idx = s.vals.map((v, i) => v === null ? -1 : i).filter(i => i >= 0);
        if (idx.length > 1) S('path', { d: 'M' + idx.map(i => X(i) + ' ' + Y(s.vals[i])).join('L') + `L${X(idx[idx.length - 1])} ${H - m.b}L${X(idx[0])} ${H - m.b}Z`, style: `fill:${s.color};fill-opacity:.14;stroke:none` }, svg);
      }
      S('path', { d, style: `fill:none;stroke:${s.color};stroke-width:${s.width || 2};stroke-linejoin:round;stroke-linecap:round;${s.dash ? 'stroke-dasharray:4 4;' : ''}` }, svg);
      s.vals.forEach((v, i) => { if (v !== null && !s.noDots) S('circle', { cx: X(i), cy: Y(v), r: 4, style: `fill:${s.color};stroke:var(--surface);stroke-width:2` }, svg); });
      const li = s.vals.map((v, i) => v === null ? -1 : i).filter(i => i >= 0).pop();
      if (li !== undefined && cfg.endLabels !== false) labels.push({ y: Y(s.vals[li]), x: X(li), s, v: s.vals[li] });
    });
    labels.sort((a, b) => a.y - b.y); for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 30) labels[i].y = labels[i - 1].y + 30;
    labels.forEach(l => {
      const g = S('g', {}, svg);
      S('text', { x: l.x + 12, y: l.y - 2, class: 'endv', text: cfg.fmt(l.v) }, g);
      S('text', { x: l.x + 12, y: l.y + 12, class: 'endl', text: l.s.name }, g);
    });
    const colW = (W - m.l - m.r) / Math.max(1, cfg.x.length - 1);
    cfg.x.forEach((x, i) => {
      const hit = S('rect', { x: X(i) - colW / 2, y: m.t, width: colW, height: H - m.t - m.b, fill: 'transparent', tabindex: 0 }, svg);
      bindTip(hit, () => {
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.style.opacity = 1;
        return `<b>${esc(x)}</b>` + cfg.series.map(s => `<div class="tr"><i style="background:${s.color}"></i>${esc(s.name)}<b>${cfg.fmt(s.vals[i])}</b></div>`).join('') + (cfg.extraTip ? cfg.extraTip(i) : '');
      });
      hit.addEventListener('mouseleave', () => cross.style.opacity = 0);
    });
  };
  draw(); onResize(draw);
}

/* ---------- barras 100% empilhadas por nível ---------- */
const LVL_COLORS = ['var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)', 'var(--l5)'];
const LVL_INK = ['var(--l1-ink)', 'var(--l2-ink)', 'var(--l3-ink)', 'var(--l4-ink)', 'var(--l5-ink)'];
function stacked100(el, cfg) {
  const draw = () => {
    el.innerHTML = '';
    const W = Math.max(280, el.clientWidth), H = cfg.height || 280, m = { t: 8, r: 8, b: 40, l: 40 };
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': cfg.aria || '' }, el);
    const n = cfg.x.length, slot = (W - m.l - m.r) / n, bw = Math.min(64, slot * 0.62);
    const Y = v => m.t + (1 - v) * (H - m.t - m.b);
    [0, .25, .5, .75, 1].forEach(t => S('text', { x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick', text: nf0.format(t * 100) + '%' }, svg));
    cfg.counts.forEach((c, i) => {
      const tot = c.reduce((a, b) => a + b, 0), cx = m.l + slot * i + slot / 2;
      S('text', { x: cx, y: H - 22, 'text-anchor': 'middle', class: 'tick', text: cfg.x[i] }, svg);
      S('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'tick sub', text: 'n=' + tot }, svg);
      if (!tot) return;
      let acc = 0;
      c.forEach((v, k) => {
        if (!v) return;
        const y0 = Y(acc / tot), y1 = Y((acc + v) / tot); acc += v;
        const h = Math.max(0, y0 - y1 - 2);
        const sel = cfg.sel, on = !sel || (sel.lvl === k + 1 && (sel.i === null || sel.i === i));
        const r = S('rect', { x: cx - bw / 2, y: y1 + 1, width: bw, height: h, rx: 3, style: `fill:${LVL_COLORS[k]};opacity:${on ? 1 : .22};${cfg.onPick ? 'cursor:pointer;' : ''}${sel && on ? 'stroke:var(--ink);stroke-width:2;' : ''}`, tabindex: 0 }, svg);
        if (h > 17 && bw > 30) S('text', { x: cx, y: y1 + 1 + h / 2 + 4, 'text-anchor': 'middle', class: 'seg', style: `fill:${LVL_INK[k]};opacity:${on ? 1 : .35};pointer-events:none`, text: nf0.format(v / tot * 100) + '%' }, svg);
        bindTip(r, () => `<b>${esc(cfg.x[i])} · ${LVL_NAME[k + 1]}</b><div class="tr">${v} de ${tot} auditorias<b>${fmtPct(v / tot)}</b></div>${cfg.onPick ? '<div class="tr" style="margin-top:6px">Clique para ver as unidades</div>' : ''}`);
        if (cfg.onPick) {
          const go = () => { TT.hide(); cfg.onPick(i, k + 1); };
          r.addEventListener('click', go); r.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        }
      });
    });
  };
  draw(); onResize(draw);
}

/* ---------- barras horizontais (ranking / delta divergente) ---------- */
function hbars(el, items, cfg = {}) {
  const draw = () => {
    el.innerHTML = '';
    const W = Math.max(280, el.clientWidth), rowH = cfg.rowH || 26, lw = cfg.labelW || 150, vw = 86;
    const H = items.length * rowH + 8;
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': cfg.aria || '' }, el);
    const vs = items.map(d => d.v);
    const lo = cfg.diverging ? Math.min(0, ...vs) : (cfg.min ?? 0), hi = cfg.diverging ? Math.max(0, ...vs) : (cfg.max ?? Math.max(...vs));
    const span = (hi - lo) || 1, X = v => lw + (v - lo) / span * (W - lw - vw);
    if (cfg.diverging) S('line', { x1: X(0), x2: X(0), y1: 0, y2: H, style: 'stroke:var(--axis);stroke-width:1' }, svg);
    items.forEach((d, i) => {
      const y = i * rowH + 4, h = rowH - 8;
      S('text', { x: lw - 10, y: y + h / 2 + 4, 'text-anchor': 'end', class: 'blab', text: d.label.length > 24 ? d.label.slice(0, 23) + '…' : d.label }, svg);
      const x0 = X(Math.min(0, d.v) * (cfg.diverging ? 1 : 0) + (cfg.diverging ? 0 : lo)), x1 = X(cfg.diverging ? Math.max(0, d.v) : d.v);
      const a = cfg.diverging ? Math.min(X(0), X(d.v)) : X(lo), w = Math.max(2, Math.abs((cfg.diverging ? X(d.v) - X(0) : X(d.v) - X(lo))));
      const color = d.color || (cfg.diverging ? (d.v * (cfg.invert ? -1 : 1) >= 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--s1)');
      const r = S('rect', { x: a, y, width: w, height: h, rx: 4, style: `fill:${color}`, tabindex: 0 }, svg);
      const tx = cfg.diverging ? (d.v >= 0 ? X(d.v) + 6 : X(0) + 6) : X(d.v) + 6;
      S('text', { x: Math.min(tx, W - vw + 6), y: y + h / 2 + 4, class: 'bval', text: d.txt || cfg.fmt(d.v) }, svg);
      if (d.tip) bindTip(r, () => d.tip);
      void x0; void x1;
    });
  };
  draw(); onResize(draw);
}

/* ---------- sparkline ---------- */
function sparkline(el, v, color = 'var(--s1)') {
  const draw = () => {
    el.innerHTML = '';
    const W = Math.max(80, el.clientWidth), H = el.clientHeight || 36, p = 4;
    const vv = v.filter(x => x !== null); if (vv.length < 2) return;
    const lo = Math.min(...vv), hi = Math.max(...vv), sp = hi - lo || 1;
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, el);
    const X = i => p + i * (W - 2 * p) / (v.length - 1), Y = x => p + (1 - (x - lo) / sp) * (H - 2 * p);
    let d = '', pen = false; v.forEach((x, i) => { if (x === null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i) + ' ' + Y(x); pen = true; });
    const idx = v.map((x, i) => x === null ? -1 : i).filter(i => i >= 0);
    if (!v.some(x => x === null)) S('path', { d: d + `L${X(idx[idx.length - 1])} ${H}L${X(idx[0])} ${H}Z`, style: `fill:${color};fill-opacity:.12;stroke:none` }, svg);
    S('path', { d, style: `fill:none;stroke:${color};stroke-width:2;stroke-linecap:round;stroke-linejoin:round` }, svg);
    const li = v.map((x, i) => x === null ? -1 : i).filter(i => i >= 0).pop();
    S('circle', { cx: X(li), cy: Y(v[li]), r: 3.5, style: `fill:${color};stroke:var(--surface);stroke-width:2` }, svg);
  };
  draw(); onResize(draw);
}

/* ---------- trilha de evolução (dumbbell): um ponto por ano em cada linha ---------- */
/* rows: [{label, vals:[...por ano], ns:[...], hl:bool}] · cfg: {years, fmt, ref:[...por ano], refName} */
const YEAR_COLORS = ['var(--y1)', 'var(--y2)', 'var(--y3)', 'var(--y4)'];
function dumbbell(el, rows, cfg) {
  const draw = () => {
    el.innerHTML = '';
    const W = Math.max(300, el.clientWidth), rowH = 54, top = 34, lw = Math.min(150, W * 0.13 + 14), rw = W < 640 ? 96 : 128;
    const H = top + rows.length * rowH + 26;
    const svg = S('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': cfg.aria || '' }, el);
    const all = rows.flatMap(r => r.vals).concat(cfg.ref || []).filter(v => v !== null);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = Math.max(0.01, (hi - lo) * 0.12);
    lo = Math.max(0, lo - pad); hi = Math.min(1, hi + pad);
    const ticks = niceTicks(lo, hi, 5); lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks[ticks.length - 1]);
    const X = v => lw + (v - lo) / (hi - lo) * (W - lw - rw);
    ticks.forEach(t => {
      S('line', { x1: X(t), x2: X(t), y1: top - 6, y2: H - 4, style: 'stroke:var(--grid);stroke-width:1' }, svg);
      S('text', { x: X(t), y: top - 14, 'text-anchor': 'middle', class: 'tick', text: cfg.fmt(t, 0) }, svg);
    });
    const last = cfg.years.length - 1;
    if (cfg.ref && cfg.ref[last] !== null) {
      const xr = X(cfg.ref[last]);
      S('line', { x1: xr, x2: xr, y1: top - 4, y2: H - 18, style: 'stroke:var(--ink-2);stroke-width:1.5;opacity:.55' }, svg);
      S('text', { x: xr, y: H - 4, 'text-anchor': 'middle', class: 'tick', style: 'fill:var(--ink-2)', text: `${cfg.refName || 'Rede'} ${cfg.years[last]}: ${cfg.fmt(cfg.ref[last])}` }, svg);
    }
    rows.forEach((r, i) => {
      const cy = top + i * rowH + rowH / 2 - 4, g = S('g', {}, svg);
      if (r.hl) S('rect', { x: 0, y: cy - rowH / 2 + 4, width: W, height: rowH - 4, rx: 10, style: 'fill:var(--hl)' }, g);
      S('text', { x: 12, y: cy + 5, class: 'dlab', style: r.hl ? 'font-weight:800' : '', text: r.label }, g);
      const pts = r.vals.map((v, k) => v === null ? null : { x: X(v), v, k }).filter(Boolean);
      if (pts.length > 1) {
        const xs = pts.map(p => p.x);
        S('line', { x1: Math.min(...xs), x2: Math.max(...xs), y1: cy, y2: cy, style: 'stroke:var(--track);stroke-width:10;stroke-linecap:round' }, g);
        const a = pts[0], b = pts[pts.length - 1], up = b.v >= a.v;
        S('line', { x1: a.x, x2: b.x, y1: cy, y2: cy, style: `stroke:${up ? 'var(--pos)' : 'var(--neg)'};stroke-width:3;stroke-linecap:round;opacity:.75` }, g);
      }
      pts.forEach(p => {
        const isLast = p.k === last;
        S('circle', { cx: p.x, cy, r: isLast ? 8 : 6, style: `fill:${YEAR_COLORS[p.k]};stroke:var(--surface);stroke-width:2.5` }, g);
        if (isLast) S('text', { x: p.x, y: cy - 14, 'text-anchor': 'middle', class: 'dval', text: cfg.fmt(p.v) }, g);
        if (p.k === 0 && pts.length > 1) S('text', { x: p.x, y: cy + 21, 'text-anchor': 'middle', class: 'dfirst', text: cfg.years[0] + ': ' + cfg.fmt(p.v) }, g);
        const hit = S('circle', { cx: p.x, cy, r: 14, fill: 'transparent', tabindex: 0 }, g);
        bindTip(hit, () => `<b>${esc(r.label)} · ${cfg.years[p.k]}</b><div class="tr"><i style="background:${YEAR_COLORS[p.k]}"></i>Resultado<b>${cfg.fmt(p.v)}</b></div>` + (r.ns ? `<div class="tr">Auditorias<b>${r.ns[p.k]}</b></div>` : '') + (cfg.ref && cfg.ref[p.k] !== null ? `<div class="tr">${cfg.refName || 'Rede'}<b>${cfg.fmt(cfg.ref[p.k])}</b></div>` : ''));
      });
      const f = r.vals[0], l = r.vals[last];
      if (f !== null && l !== null) {
        const d = l - f, s = sign(d);
        const bx = W - rw + 18, cls = s > 0 ? 'pos' : s < 0 ? 'neg' : 'flat';
        S('rect', { x: bx, y: cy - 14, width: rw - 26, height: 28, rx: 14, class: 'badge ' + cls }, g);
        S('text', { x: bx + (rw - 26) / 2, y: cy + 5, 'text-anchor': 'middle', class: 'badget ' + cls, text: arrow(d) + ' ' + fmtPP(d).replace(' p.p.', '') + (rw < 128 ? '' : ' p.p.') }, g);
      }
    });
  };
  draw(); onResize(draw);
}

/* ---------- selo de criticidade (mesmo formato dos fechamentos) ---------- */
const SEAL_GRAD = { 1: ['#62e3b4', '#0f9c74'], 2: ['#b9abff', '#6346d4'], 3: ['#5bd6f7', '#1d55cc'], 4: ['#ffd76e', '#f0841a'], 5: ['#ff8f80', '#d42a3a'] };
const SEAL_PATH = (() => {          // estrela serrilhada de 30 pontas, raio 50/45 em caixa 100x100
  const n = 30, pts = [];
  for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n - Math.PI / 2, r = i % 2 ? 44.5 : 49.5; pts.push((50 + r * Math.cos(a)).toFixed(2) + ' ' + (50 + r * Math.sin(a)).toFixed(2)); }
  return 'M' + pts.join('L') + 'Z';
})();
function ensureSealDefs() {
  if (document.getElementById('seal-defs')) return;
  const w = document.createElement('div');
  w.innerHTML = `<svg id="seal-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(SEAL_GRAD).map(([l, g]) =>
    `<linearGradient id="sg${l}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g[0]}"/><stop offset="1" stop-color="${g[1]}"/></linearGradient>`).join('')}
    <path id="seal-ring" d="M50 50 m-35 0 a35 35 0 1 1 70 0 a35 35 0 1 1 -70 0"/></defs></svg>`;
  document.body.prepend(w.firstChild);
}
/* full=true: selo grande com anel "VISITA DEMARCO · CRITICIDADE" e a palavra NÍVEL */
function sealSVG(l, size = 28, full = false) {
  if (!l) return '';
  ensureSealDefs();
  const num = full
    ? `<text x="50" y="62" text-anchor="middle" font-size="40" font-weight="900" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.18);stroke-width:2">${l}</text>
       <text x="50" y="76" text-anchor="middle" font-size="10.5" font-weight="900" letter-spacing="1" fill="#fff">NÍVEL</text>
       <text font-size="6.4" font-weight="700" letter-spacing=".9" fill="#fff" fill-opacity=".85"><textPath href="#seal-ring" startOffset="0">VISITA DEMARCO · CRITICIDADE · VISITA DEMARCO · CRITICIDADE ·</textPath></text>`
    : `<text x="50" y="68" text-anchor="middle" font-size="50" font-weight="900" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.2);stroke-width:3">${l}</text>`;
  return `<svg class="seal" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Nível ${l}">
    <path d="${SEAL_PATH}" fill="url(#sg${l})"/>
    <circle cx="50" cy="50" r="${full ? 41 : 39}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="${full ? 1.2 : 3}"/>${num}</svg>`;
}

/* ---------- escala sequencial para heatmap ---------- */
function seqColor(v, lo, hi) {
  if (v === null || v === undefined) return null;
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const ramp = getComputedStyle(document.documentElement).getPropertyValue('--seq').split(',').map(s => s.trim());
  return ramp[Math.min(ramp.length - 1, Math.floor(t * ramp.length))];
}

/* cor de texto legível sobre um fundo hex (luminância relativa WCAG) */
function inkOn(hex) {
  if (!hex || hex[0] !== '#') return 'var(--ink)';
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return (1.05) / (L + 0.05) >= (L + 0.05) / 0.05 ? '#ffffff' : '#0b0b0b';
}

/* ---------- comparação ano contra ano ---------- */
function yoy(rows, k) {
  const y = YEARS.map(a => ({ ano: a, v: metric(byYear(rows, a), k), n: count(byYear(rows, a), k) }));
  return y;
}

/* ---------- tabela → CSV ---------- */
function downloadCSV(name, header, rows) {
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })); a.download = name; a.click();
}

/* ---------- notas de qualidade ---------- */
function notesHTML() {
  return `<details class="notes"><summary>Notas sobre a base de dados (${DATA.notes.length})</summary><ul>${DATA.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  <p>Fonte: Matriz Visitas 2025.xlsx · aba Resumo · ${R.length} auditorias de ${UNITS.length} unidades · atualizado em ${esc(DATA.gerado)}.</p></details>`;
}
