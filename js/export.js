// Export Excel (.xlsx real via SheetJS), backup JSON completo e importação
import * as db from './db.js';
import { blobToDataURL, dataURLToBlob, downloadBlob, todayISO, toast } from './utils.js';

const PAY_LABEL = { dinheiro: 'Dinheiro', cartao: 'Cartão', pix: 'Pix', outro: 'Outro' };

// ── Excel: uma linha por gasto, todos os eventos ──
export async function exportExcel() {
  if (typeof XLSX === 'undefined') {
    toast('Biblioteca Excel ainda não carregou. Tente de novo em instantes.', 'warn');
    return;
  }
  const [eventos, gastos, catsSetting] = await Promise.all([
    db.getAll('eventos'), db.getAll('gastos'), db.getSetting('categories', []),
  ]);
  if (!gastos.length) { toast('Nenhum gasto para exportar ainda.'); return; }

  const evMap = Object.fromEntries(eventos.map(e => [e.id, e]));
  const catMap = Object.fromEntries((catsSetting || []).map(c => [c.id, c]));

  const rows = gastos
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.criadoEm - b.criadoEm))
    .map(g => {
      const ev = evMap[g.eventoId];
      const cat = catMap[g.categoriaId];
      return {
        'Evento': ev ? ev.nome : '',
        'Data': g.data,
        'Valor': g.valor,
        'Moeda': g.moeda,
        'Taxa': g.moeda !== (ev?.moedaBase || 'BRL') ? (g.taxa || '') : '',
        [`Valor (${ev?.moedaBase || 'BRL'})`]: g.valorBase,
        'Categoria': cat ? cat.nome : g.categoriaId || '',
        'Estabelecimento': g.estabelecimento || '',
        'Forma de pagamento': PAY_LABEL[g.formaPagamento] || '',
        'Notas': g.notas || '',
        'Comprovante': g.imagemId ? 'Sim' : 'Não',
        'Registrado em': new Date(g.criadoEm).toLocaleString('pt-BR'),
      };
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 24 }, { wch: 11 }, { wch: 10 }, { wch: 7 }, { wch: 7 }, { wch: 12 },
    { wch: 16 }, { wch: 24 }, { wch: 16 }, { wch: 28 }, { wch: 11 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `gastos-viagem-${todayISO()}.xlsx`);
  toast(`Excel gerado: ${rows.length} gasto${rows.length > 1 ? 's' : ''} 📊`);
}

// ── Backup JSON completo (inclui imagens em base64) ──
export async function exportJSON() {
  const [eventos, gastos, imagens, settings] = await Promise.all([
    db.getAll('eventos'), db.getAll('gastos'), db.getAll('imagens'), db.getAll('settings'),
  ]);
  const imgs = [];
  for (const im of imagens) {
    try {
      imgs.push({ id: im.id, dataURL: await blobToDataURL(im.blob) });
    } catch { /* imagem corrompida: pula, mantém o resto do backup */ }
  }
  const payload = {
    app: 'gastos-viagem',
    version: 1,
    exportadoEm: new Date().toISOString(),
    settings, eventos, gastos, imagens: imgs,
  };
  downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }),
    `gastos-viagem-backup-${todayISO()}.json`);
  toast(`Backup criado: ${gastos.length} gastos, ${imgs.length} fotos 💾`);
}

// ── Restauração: substitui todos os dados pelo backup ──
export async function importJSON(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('Arquivo inválido: não é um JSON.'); }
  if (payload.app !== 'gastos-viagem' || !Array.isArray(payload.gastos)) {
    throw new Error('Este arquivo não parece ser um backup do app.');
  }
  const ok = confirm(
    `Restaurar backup de ${new Date(payload.exportadoEm).toLocaleString('pt-BR')}?\n\n` +
    `${payload.eventos.length} eventos, ${payload.gastos.length} gastos, ${payload.imagens.length} fotos.\n\n` +
    'ATENÇÃO: todos os dados atuais serão substituídos.');
  if (!ok) return false;

  await Promise.all([db.clear('eventos'), db.clear('gastos'), db.clear('imagens'), db.clear('settings')]);
  await db.putMany('eventos', payload.eventos || []);
  await db.putMany('gastos', payload.gastos || []);
  await db.putMany('settings', payload.settings || []);
  const imagens = (payload.imagens || []).map(im => ({ id: im.id, blob: dataURLToBlob(im.dataURL) }));
  await db.putMany('imagens', imagens);
  toast('Backup restaurado com sucesso ✅');
  return true;
}
