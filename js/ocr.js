// OCR opcional (best-effort) com Tesseract.js — roda no aparelho, sem custo.
// A biblioteca é baixada da CDN na primeira utilização com internet e fica
// guardada no cache do service worker; depois disso funciona offline.
// Nunca bloqueia o registro do gasto: se falhar, o usuário digita normalmente.
import { parseValorText } from './utils.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
let _loading = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT_URL;
    s.onload = () => resolve();
    s.onerror = () => { _loading = null; reject(new Error('Sem conexão para baixar o leitor (só na 1ª vez).')); };
    document.head.appendChild(s);
  });
  return _loading;
}

// Extrai o valor mais provável do texto de um recibo:
// prioriza linhas com TOTAL; senão pega o maior valor monetário encontrado.
export function extractValor(texto) {
  const moneyRe = /(?:R\$\s*)?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})/g;
  const linhas = texto.split('\n');
  const totalLine = linhas.find(l => /total|valor\s+a\s+pagar|a\s+pagar/i.test(l) && moneyRe.test(l));
  moneyRe.lastIndex = 0;
  if (totalLine) {
    const m = [...totalLine.matchAll(moneyRe)];
    if (m.length) return parseValorText(m[m.length - 1][1]);
  }
  const todos = [...texto.matchAll(moneyRe)]
    .map(m => parseValorText(m[1]))
    .filter(v => v !== null && v > 0 && v < 1000000);
  return todos.length ? Math.max(...todos) : null;
}

// Extrai data dd/mm/aaaa ou dd/mm/aa → ISO
export function extractData(texto) {
  const m = texto.match(/(\d{2})[/\-.](\d{2})[/\-.](\d{4}|\d{2})/);
  if (!m) return null;
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  const dd = +d, mm = +mo, yy = +y;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yy < 2000 || yy > 2100) return null;
  return `${y}-${mo}-${d}`;
}

export async function runOCR(blob, onProgress) {
  await loadTesseract();
  const worker = await window.Tesseract.createWorker('eng', 1, {
    logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
  });
  try {
    const { data } = await worker.recognize(blob);
    const texto = data.text || '';
    return { valor: extractValor(texto), data: extractData(texto), texto };
  } finally {
    await worker.terminate();
  }
}
