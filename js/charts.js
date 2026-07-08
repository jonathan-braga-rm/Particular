// Gráficos em SVG puro — sem dependências
import { escapeHtml, fmtDateShort } from './utils.js';

// Anel de budget: % consumido
export function budgetRing(spent, budget, size = 120) {
  const pct = budget > 0 ? Math.min(spent / budget, 1) : 0;
  const over = budget > 0 && spent > budget;
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = over ? 'var(--danger)' : (pct >= 0.8 ? 'var(--warn)' : 'var(--accent)');
  const pctLabel = budget > 0 ? Math.round((spent / budget) * 100) + '%' : '—';
  return `
  <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Budget consumido: ${pctLabel}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--chip)" stroke-width="12"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="12"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"
      transform="rotate(-90 ${size / 2} ${size / 2})" style="transition: stroke-dashoffset .5s"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
      font-size="${size / 4.6}" font-weight="800" fill="${color}">${pctLabel}</text>
  </svg>`;
}

const PALETTE = ['#0d9488', '#f59e0b', '#6366f1', '#ec4899', '#22c55e', '#f97316', '#06b6d4', '#a855f7', '#ef4444', '#84cc16'];
export const catColor = (i) => PALETTE[i % PALETTE.length];

// Rosca por categoria. items: [{nome, emoji, total}] já ordenado desc
export function categoryDonut(items, size = 130) {
  const total = items.reduce((a, b) => a + b.total, 0);
  if (total <= 0) return '';
  const cx = size / 2, cy = size / 2, r = (size - 26) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = items.map((it, i) => {
    const frac = it.total / total;
    const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${catColor(i)}" stroke-width="20"
      stroke-dasharray="${Math.max(frac * c - 1.5, 0.4)} ${c}" stroke-dashoffset="${-offset * c}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
    offset += frac;
    return seg;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Distribuição por categoria">${segs}</svg>`;
}

// Linha do tempo: barras diárias. days: [{data, total}] em ordem cronológica
export function dailyBars(days, opts = {}) {
  if (!days.length) return '';
  const barW = 26, gap = 8, h = 130, padB = 24, padT = 16;
  const w = days.length * (barW + gap) + gap;
  const max = Math.max(...days.map(d => d.total), 0.01);
  const bars = days.map((d, i) => {
    const bh = Math.max((d.total / max) * (h - padB - padT), d.total > 0 ? 3 : 0);
    const x = gap + i * (barW + gap);
    const y = h - padB - bh;
    const isMax = d.total === max && d.total > 0;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${bh || 0.5}" rx="5"
        fill="${d.total > 0 ? (isMax ? 'var(--warn)' : 'var(--accent)') : 'var(--chip)'}"/>
      <text x="${x + barW / 2}" y="${h - 8}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${escapeHtml(fmtDateShort(d.data))}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Gasto por dia">${bars}</svg>`;
}
