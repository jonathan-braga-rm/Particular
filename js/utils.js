// Utilidades: formatação, parsing de valores, imagens, toasts

export const uid = () =>
  Date.now().toString(36) + '-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);

export function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function fmtMoney(valor, currency = 'BRL') {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(valor || 0);
  } catch {
    return (currency + ' ' + (valor || 0).toFixed(2)).replace('.', ',');
  }
}

export function fmtDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export function fmtDateFull(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDateHuman(iso) {
  const hoje = todayISO();
  if (iso === hoje) return 'Hoje';
  const ontem = addDays(hoje, -1);
  if (iso === ontem) return 'Ontem';
  const dt = parseISODate(iso);
  const wd = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()];
  return `${wd}, ${fmtDateFull(iso)}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(iso, n) {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + n);
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}
export function daysBetween(isoA, isoB) {
  return Math.round((parseISODate(isoB) - parseISODate(isoA)) / 86400000);
}

// ── Parsing robusto de valores: "R$ 1.234,56", "1,234.56", "12,5", "1234" ──
export function parseValorText(text) {
  if (typeof text === 'number') return isFinite(text) ? text : null;
  if (!text) return null;
  let s = String(text).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const neg = s.startsWith('-');
  s = s.replace(/-/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart = s, decPart = '';
  if (lastComma === -1 && lastDot === -1) {
    // só dígitos
  } else {
    const sepPos = Math.max(lastComma, lastDot);
    const after = s.slice(sepPos + 1);
    const before = s.slice(0, sepPos);
    if (after.length > 0 && after.length <= 2) {
      // último separador é decimal
      intPart = before; decPart = after;
    } else if (after.length === 3 && (lastComma === -1 || lastDot === -1)) {
      // "1.234" ou "1,234" — separador de milhar
      intPart = s;
    } else {
      intPart = before; decPart = after.slice(0, 2);
    }
  }
  intPart = intPart.replace(/[.,]/g, '');
  const v = parseFloat(intPart + '.' + (decPart || '0'));
  if (!isFinite(v)) return null;
  return neg ? -v : v;
}

export function normalizeMerchant(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Toasts gentis ──
export function toast(msg, kind = '', ms = 3200) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, ms);
}

export function haptic(ms = 12) {
  try { navigator.vibrate && navigator.vibrate(ms); } catch { /* sem suporte */ }
}

// ── Imagens: redimensiona para economizar espaço, mantendo legibilidade ──
export function resizeImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('falha ao processar imagem')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
    img.src = url;
  });
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataURL) {
  const [head, b64] = dataURL.split(',');
  const mime = (head.match(/data:(.*?);/) || [])[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}
