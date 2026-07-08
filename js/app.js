// Gastos de Viagem — app principal (SPA vanilla, offline-first)
import * as db from './db.js';
import {
  uid, todayISO, fmtMoney, fmtDateHuman, fmtDateFull, parseISODate, addDays, daysBetween,
  parseValorText, normalizeMerchant, escapeHtml, toast, haptic,
  resizeImage, downloadBlob,
} from './utils.js';
import { budgetRing, categoryDonut, dailyBars, catColor } from './charts.js';
import { exportExcel, exportJSON, importJSON } from './export.js';
import { runOCR } from './ocr.js';

const DEFAULT_CATEGORIES = [
  { id: 'alimentacao', nome: 'Alimentação', emoji: '🍽️' },
  { id: 'transporte', nome: 'Transporte', emoji: '🚗' },
  { id: 'hospedagem', nome: 'Hospedagem', emoji: '🏨' },
  { id: 'passeios', nome: 'Passeios/Lazer', emoji: '🎢' },
  { id: 'compras', nome: 'Compras', emoji: '🛍️' },
  { id: 'saude', nome: 'Saúde', emoji: '💊' },
  { id: 'servicos', nome: 'Serviços', emoji: '🔧' },
  { id: 'outros', nome: 'Outros', emoji: '📌' },
];
const CURRENCIES = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'UYU', 'PYG', 'JPY', 'CAD', 'AUD', 'CHF'];
const PAY_OPTIONS = [
  { id: 'cartao', label: '💳 Cartão' },
  { id: 'pix', label: '⚡ Pix' },
  { id: 'dinheiro', label: '💵 Dinheiro' },
  { id: 'outro', label: '🔁 Outro' },
];

const S = {
  eventos: [],
  gastos: [],            // gastos do evento ativo
  categories: [],
  activeEventId: null,
  baseCurrency: 'BRL',
  theme: 'auto',
  ocrEnabled: true,
  merchantMap: {},
  lastCategoryId: null,
  currencyRates: {},
  view: 'dash',
  filters: { q: '', cat: null },
  eventFormId: undefined, // undefined = fechado, null = novo, string = editando
  deferredInstall: null,
};

// estado da folha de lançamento
const A = {
  editingId: null,
  cents: '',            // dígitos do valor (centavos)
  moeda: 'BRL',
  categoriaId: null,
  catManual: false,
  formaPagamento: null,
  imagemBlob: null,     // nova foto anexada nesta edição
  imagemId: null,       // foto já salva (edição)
  imagemRemovida: false,
  criadoEm: null,
};

const $ = (id) => document.getElementById(id);
const activeEvent = () => S.eventos.find(e => e.id === S.activeEventId) || null;
const catById = (id) => S.categories.find(c => c.id === id) || null;

/* ═══════════════ Inicialização ═══════════════ */

async function init() {
  applyTheme(localStorage.getItem('theme') || 'auto');
  await db.openDB();

  S.categories = await db.getSetting('categories', null);
  if (!S.categories) {
    S.categories = DEFAULT_CATEGORIES;
    await db.setSetting('categories', S.categories);
  }
  S.theme = await db.getSetting('theme', 'auto');
  S.baseCurrency = await db.getSetting('baseCurrency', 'BRL');
  S.ocrEnabled = await db.getSetting('ocrEnabled', true);
  S.merchantMap = await db.getSetting('merchantMap', {});
  S.lastCategoryId = await db.getSetting('lastCategoryId', null);
  S.currencyRates = await db.getSetting('currencyRates', {});
  S.activeEventId = await db.getSetting('activeEventId', null);
  applyTheme(S.theme);

  S.eventos = (await db.getAll('eventos')).sort((a, b) => b.criadoEm - a.criadoEm);
  if (S.activeEventId && !activeEvent()) S.activeEventId = null;
  if (!S.activeEventId) {
    const firstLive = S.eventos.find(e => !e.arquivado);
    if (firstLive) { S.activeEventId = firstLive.id; await db.setSetting('activeEventId', firstLive.id); }
  }
  await loadGastos();

  buildKeypad();
  buildPayChips();
  bindGlobalEvents();
  renderAll();

  // persistência confiável + service worker
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* opcional */ }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* file:// ou browser sem suporte */ });
  }
}

async function loadGastos() {
  S.gastos = S.activeEventId
    ? (await db.getAllByIndex('gastos', 'eventoId', S.activeEventId))
        .sort((a, b) => (a.data > b.data ? -1 : a.data < b.data ? 1 : b.criadoEm - a.criadoEm))
    : [];
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}

/* ═══════════════ Navegação e eventos globais ═══════════════ */

function bindGlobalEvents() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  $('fab').addEventListener('click', () => {
    if (!activeEvent()) {
      toast('Crie um evento primeiro para lançar gastos 🧳');
      switchView('events');
      openEventForm(null);
      return;
    }
    openAddSheet();
  });
  $('event-switcher').addEventListener('click', openEventPicker);
  document.querySelector('[data-close-picker]').addEventListener('click', closeEventPicker);

  // folha de lançamento
  $('add-close').addEventListener('click', closeAddSheet);
  document.querySelector('[data-close-add]').addEventListener('click', closeAddSheet);
  $('add-save').addEventListener('click', saveGasto);
  $('add-delete').addEventListener('click', deleteCurrentGasto);
  $('add-currency').addEventListener('change', onCurrencyChange);
  $('fx-rate').addEventListener('input', updateAmountDisplay);
  $('add-merchant').addEventListener('input', onMerchantInput);
  $('btn-camera').addEventListener('click', () => $('file-camera').click());
  $('btn-gallery').addEventListener('click', () => $('file-gallery').click());
  $('file-camera').addEventListener('change', onPhotoPicked);
  $('file-gallery').addEventListener('change', onPhotoPicked);
  $('thumb-remove').addEventListener('click', removePhoto);
  $('add-thumb').addEventListener('click', () => {
    if (A.imagemBlob) showImageBlob(A.imagemBlob);
    else if (A.imagemId) viewImage(A.imagemId);
  });
  $('btn-ocr').addEventListener('click', tryOCR);

  $('img-viewer-close').addEventListener('click', closeImageViewer);
  $('img-viewer').addEventListener('click', (e) => { if (e.target.id === 'img-viewer') closeImageViewer(); });

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    S.deferredInstall = e;
    if (S.view === 'settings') renderSettings();
  });
}

function updateOnlineStatus() {
  document.body.classList.toggle('is-offline', !navigator.onLine);
}

function switchView(view) {
  S.view = view;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  ['dash', 'list', 'events', 'settings'].forEach(v => $('view-' + v).classList.toggle('hidden', v !== view));
  renderCurrentView();
  window.scrollTo(0, 0);
}

function renderAll() {
  renderTopbar();
  renderCurrentView();
}
function renderCurrentView() {
  if (S.view === 'dash') renderDash();
  else if (S.view === 'list') renderList();
  else if (S.view === 'events') renderEvents();
  else renderSettings();
}

function renderTopbar() {
  const ev = activeEvent();
  $('topbar-event-name').textContent = ev ? ev.nome : 'Gastos de Viagem';
}

/* ═══════════════ Cálculos ═══════════════ */

const spentTotal = (gastos) => gastos.reduce((a, g) => a + (g.valorBase || 0), 0);

function eventStats(ev, gastos) {
  const spent = spentTotal(gastos);
  const budget = ev.budget || 0;
  const pct = budget > 0 ? spent / budget : 0;
  const hoje = todayISO();
  let stats = { spent, budget, pct, remaining: budget - spent, avg: null, projection: null, elapsed: null, totalDays: null };
  if (ev.dataInicio && ev.dataFim && ev.dataFim >= ev.dataInicio) {
    const totalDays = daysBetween(ev.dataInicio, ev.dataFim) + 1;
    const ref = hoje < ev.dataInicio ? ev.dataInicio : (hoje > ev.dataFim ? ev.dataFim : hoje);
    const elapsed = Math.max(1, daysBetween(ev.dataInicio, ref) + 1);
    const avg = spent / elapsed;
    stats.totalDays = totalDays;
    stats.elapsed = elapsed;
    stats.avg = avg;
    stats.projection = avg * totalDays;
  } else if (gastos.length) {
    const dias = [...new Set(gastos.map(g => g.data))];
    stats.avg = spent / dias.length;
  }
  return stats;
}

/* ═══════════════ Dashboard ═══════════════ */

function renderDash() {
  const el = $('view-dash');
  const ev = activeEvent();
  if (!ev) {
    el.innerHTML = `
      <div class="empty-state card">
        <div class="big-ico">🧳</div>
        <p><b>Bem-vindo!</b><br>Crie seu primeiro evento de viagem para começar a registrar gastos.</p>
        <button class="btn-primary" id="dash-create-event">➕ Criar evento</button>
      </div>`;
    $('dash-create-event').addEventListener('click', () => { switchView('events'); openEventForm(null); });
    return;
  }

  const st = eventStats(ev, S.gastos);
  const cur = ev.moedaBase || 'BRL';
  let html = '';

  // alertas gentis
  if (st.budget > 0 && st.pct >= 1) {
    html += `<div class="banner danger">🚨 Budget estourado: ${fmtMoney(st.spent - st.budget, cur)} acima do planejado.</div>`;
  } else if (st.budget > 0 && st.pct >= 0.8) {
    html += `<div class="banner warn">⚠️ Você já usou ${Math.round(st.pct * 100)}% do budget. Restam ${fmtMoney(st.remaining, cur)}.</div>`;
  }

  // herói: anel + números
  html += `
    <div class="card">
      <div class="budget-hero">
        ${budgetRing(st.spent, st.budget)}
        <div class="budget-nums">
          <div class="big">${fmtMoney(st.spent, cur)}</div>
          <div class="sub">${st.budget > 0 ? 'de ' + fmtMoney(st.budget, cur) : 'sem budget definido'}</div>
          ${st.budget > 0 ? `<div class="remaining ${st.remaining >= 0 ? 'pos' : 'neg'}">
            ${st.remaining >= 0 ? 'Restam ' + fmtMoney(st.remaining, cur) : 'Estouro de ' + fmtMoney(-st.remaining, cur)}
          </div>` : ''}
        </div>
      </div>
    </div>`;

  // ritmo e projeção
  if (st.avg !== null && S.gastos.length) {
    let projHtml = '';
    if (st.projection !== null && st.budget > 0) {
      const delta = st.projection - st.budget;
      projHtml = `<div class="projection">${delta > 0
        ? `📈 Nesse ritmo, você termina <b>${fmtMoney(delta, cur)} acima</b> do budget.`
        : `📉 Nesse ritmo, você termina <b>${fmtMoney(-delta, cur)} abaixo</b> do budget. 👏`}</div>`;
    }
    html += `
      <div class="card">
        <h3>Ritmo de gasto</h3>
        <div class="pace-grid">
          <div class="pace-item"><div class="v">${fmtMoney(st.avg, cur)}</div><div class="k">média por dia</div></div>
          ${st.elapsed !== null
            ? `<div class="pace-item"><div class="v">${st.elapsed}/${st.totalDays}</div><div class="k">dias da viagem</div></div>`
            : `<div class="pace-item"><div class="v">${[...new Set(S.gastos.map(g => g.data))].length}</div><div class="k">dias com gastos</div></div>`}
        </div>
        ${projHtml}
      </div>`;
  }

  // rosca por categoria
  const porCat = S.categories
    .map(c => ({ ...c, total: spentTotal(S.gastos.filter(g => g.categoriaId === c.id)) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);
  const semCat = spentTotal(S.gastos.filter(g => !catById(g.categoriaId)));
  if (semCat > 0) porCat.push({ id: '_', nome: 'Sem categoria', emoji: '❔', total: semCat });
  if (porCat.length) {
    const total = spentTotal(S.gastos);
    html += `
      <div class="card">
        <h3>Por categoria</h3>
        <div class="donut-wrap">
          ${categoryDonut(porCat)}
          <div class="legend">
            ${porCat.map((c, i) => `
              <div class="legend-row">
                <span class="dot" style="background:${catColor(i)}"></span>
                <span class="name">${c.emoji} ${escapeHtml(c.nome)}</span>
                <span class="val">${fmtMoney(c.total, cur)}</span>
                <span class="muted small">${Math.round((c.total / total) * 100)}%</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  // linha do tempo diária
  if (S.gastos.length) {
    const byDay = {};
    S.gastos.forEach(g => { byDay[g.data] = (byDay[g.data] || 0) + (g.valorBase || 0); });
    const datas = Object.keys(byDay).sort();
    let ini = ev.dataInicio && ev.dataInicio < datas[0] ? ev.dataInicio : datas[0];
    let fim = datas[datas.length - 1];
    const hoje = todayISO();
    if (ev.dataInicio && ev.dataFim && hoje >= ev.dataInicio && hoje <= ev.dataFim && hoje > fim) fim = hoje;
    if (daysBetween(ini, fim) > 60) ini = addDays(fim, -60); // limite p/ desempenho
    const days = [];
    for (let d = ini; d <= fim; d = addDays(d, 1)) days.push({ data: d, total: byDay[d] || 0 });
    html += `
      <div class="card">
        <h3>Gasto por dia</h3>
        <div class="timeline-scroll" id="timeline-scroll">${dailyBars(days)}</div>
      </div>`;
  }

  // últimos gastos
  html += `<div class="card"><h3>Últimos gastos</h3><div id="dash-recent"></div>
    ${S.gastos.length > 5 ? `<button class="btn-secondary" id="dash-see-all">Ver todos (${S.gastos.length})</button>` : ''}
  </div>`;
  html += `<button class="btn-primary" id="dash-export-xlsx">📊 Exportar Excel</button>`;

  el.innerHTML = html;

  const recent = $('dash-recent');
  if (S.gastos.length) {
    recent.innerHTML = S.gastos.slice(0, 5).map(expenseRowHtml).join('');
    bindExpenseRows(recent);
  } else {
    recent.innerHTML = `<div class="empty-state"><div class="big-ico">🌴</div>Nenhum gasto ainda.<br>Toque no <b>+</b> para lançar o primeiro!</div>`;
  }
  const sc = $('timeline-scroll');
  if (sc) sc.scrollLeft = sc.scrollWidth;
  const seeAll = $('dash-see-all');
  if (seeAll) seeAll.addEventListener('click', () => switchView('list'));
  $('dash-export-xlsx').addEventListener('click', exportExcel);
}

/* ═══════════════ Lista de gastos ═══════════════ */

function expenseRowHtml(g) {
  const cat = catById(g.categoriaId);
  const ev = activeEvent();
  const cur = ev ? ev.moedaBase : 'BRL';
  const foreign = g.moeda && g.moeda !== cur;
  return `
    <button class="expense-row" data-gasto="${g.id}">
      <span class="emoji">${cat ? cat.emoji : '❔'}</span>
      <span class="mid">
        <span class="t1">${escapeHtml(g.estabelecimento || (cat ? cat.nome : 'Gasto'))}</span>
        <span class="t2">${cat ? escapeHtml(cat.nome) : ''}${g.notas ? ' · ' + escapeHtml(g.notas) : ''}</span>
      </span>
      ${g.imagemId ? '<span class="cam">📎</span>' : ''}
      <span class="val">${fmtMoney(g.valorBase, cur)}${foreign ? `<span class="orig">${fmtMoney(g.valor, g.moeda)}</span>` : ''}</span>
    </button>`;
}

function bindExpenseRows(container) {
  container.querySelectorAll('[data-gasto]').forEach(row => {
    row.addEventListener('click', () => {
      const g = S.gastos.find(x => x.id === row.dataset.gasto);
      if (g) openAddSheet(g);
    });
  });
}

function renderList() {
  const el = $('view-list');
  const ev = activeEvent();
  if (!ev) {
    el.innerHTML = `<div class="empty-state card"><div class="big-ico">🧳</div>Crie um evento para ver gastos.</div>`;
    return;
  }
  el.innerHTML = `
    <div class="search-row"><input id="list-search" placeholder="🔍 Buscar gasto, local, nota…" value="${escapeHtml(S.filters.q)}"></div>
    <div class="chips scroll" id="list-cat-chips"></div>
    <div id="list-groups"></div>`;

  const chips = $('list-cat-chips');
  const usedCats = S.categories.filter(c => S.gastos.some(g => g.categoriaId === c.id));
  chips.innerHTML = `<button class="chip ${!S.filters.cat ? 'on' : ''}" data-cat="">Todas</button>` +
    usedCats.map(c => `<button class="chip ${S.filters.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${c.emoji} ${escapeHtml(c.nome)}</button>`).join('');
  chips.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    S.filters.cat = ch.dataset.cat || null;
    renderList();
  }));

  $('list-search').addEventListener('input', (e) => {
    S.filters.q = e.target.value;
    renderListGroups();
  });
  renderListGroups();
}

function renderListGroups() {
  const box = $('list-groups');
  const ev = activeEvent();
  const cur = ev.moedaBase || 'BRL';
  const q = normalizeMerchant(S.filters.q);
  let list = S.gastos;
  if (S.filters.cat) list = list.filter(g => g.categoriaId === S.filters.cat);
  if (q) {
    list = list.filter(g => {
      const cat = catById(g.categoriaId);
      return normalizeMerchant(g.estabelecimento).includes(q)
        || normalizeMerchant(g.notas).includes(q)
        || (cat && normalizeMerchant(cat.nome).includes(q))
        || String(g.valorBase).includes(q.replace(',', '.'));
    });
  }
  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><div class="big-ico">🔍</div>Nenhum gasto encontrado.</div>`;
    return;
  }
  const groups = {};
  list.forEach(g => { (groups[g.data] = groups[g.data] || []).push(g); });
  box.innerHTML = Object.keys(groups).sort().reverse().map(data => `
    <div class="day-head"><span>${fmtDateHuman(data)}</span><span>${fmtMoney(spentTotal(groups[data]), cur)}</span></div>
    ${groups[data].map(expenseRowHtml).join('')}`).join('');
  bindExpenseRows(box);
}

/* ═══════════════ Eventos ═══════════════ */

function renderEvents() {
  const el = $('view-events');
  const live = S.eventos.filter(e => !e.arquivado);
  const arch = S.eventos.filter(e => e.arquivado);

  let html = `<button class="btn-primary" id="btn-new-event">➕ Novo evento</button><div id="event-form-slot"></div>`;
  html += live.map(eventCardHtml).join('');
  if (arch.length) {
    html += `<details class="card"><summary style="font-weight:700;cursor:pointer">🗄️ Arquivados (${arch.length})</summary>
      ${arch.map(eventCardHtml).join('')}</details>`;
  }
  if (!S.eventos.length) {
    html += `<div class="empty-state card"><div class="big-ico">🏖️</div>Nenhum evento ainda.<br>Crie um para começar — ex.: <i>"Férias de Julho"</i>.</div>`;
  }
  el.innerHTML = html;

  $('btn-new-event').addEventListener('click', () => openEventForm(null));
  el.querySelectorAll('[data-ev-activate]').forEach(b => b.addEventListener('click', () => setActiveEvent(b.dataset.evActivate)));
  el.querySelectorAll('[data-ev-edit]').forEach(b => b.addEventListener('click', () => openEventForm(b.dataset.evEdit)));
  el.querySelectorAll('[data-ev-arch]').forEach(b => b.addEventListener('click', () => toggleArchive(b.dataset.evArch)));
  el.querySelectorAll('[data-ev-del]').forEach(b => b.addEventListener('click', () => deleteEvent(b.dataset.evDel)));

  if (S.eventFormId !== undefined) renderEventForm();
}

function eventCardHtml(ev) {
  const isActive = ev.id === S.activeEventId;
  // total do evento é calculado sob demanda quando é o ativo; para os demais, mostra sem barra de progresso ao vivo
  const gastosEv = isActive ? S.gastos : null;
  const spent = gastosEv ? spentTotal(gastosEv) : null;
  const cur = ev.moedaBase || 'BRL';
  const pct = spent !== null && ev.budget > 0 ? Math.min(spent / ev.budget, 1) : null;
  return `
    <div class="card event-card">
      ${isActive ? '<span class="active-badge">ATIVO</span>' : ''}
      <div class="name">${escapeHtml(ev.nome)}</div>
      <div class="dates">${ev.dataInicio ? fmtDateFull(ev.dataInicio) + ' – ' + fmtDateFull(ev.dataFim || ev.dataInicio) : 'sem datas definidas'}</div>
      ${ev.budget > 0 ? `<div class="small muted">Budget: <b>${fmtMoney(ev.budget, cur)}</b></div>` : '<div class="small muted">Sem budget</div>'}
      ${pct !== null ? `
        <div class="mini-bar"><div class="${spent > ev.budget ? 'over' : ''}" style="width:${Math.round(pct * 100)}%"></div></div>
        <div class="nums"><span>${fmtMoney(spent, cur)} gasto</span><span>${fmtMoney(ev.budget - spent, cur)} ${ev.budget - spent >= 0 ? 'restante' : 'estourado'}</span></div>` : ''}
      ${ev.notas ? `<div class="small muted" style="margin-top:6px">${escapeHtml(ev.notas)}</div>` : ''}
      <div class="event-actions">
        ${!isActive && !ev.arquivado ? `<button class="primary" data-ev-activate="${ev.id}">Usar este</button>` : ''}
        <button data-ev-edit="${ev.id}">✏️ Editar</button>
        <button data-ev-arch="${ev.id}">${ev.arquivado ? '📂 Restaurar' : '🗄️ Arquivar'}</button>
        ${ev.arquivado ? `<button data-ev-del="${ev.id}" style="color:var(--danger)">🗑️</button>` : ''}
      </div>
    </div>`;
}

function openEventForm(id) {
  S.eventFormId = id;
  if (S.view !== 'events') switchView('events');
  else renderEvents();
  setTimeout(() => $('event-form-slot')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

function renderEventForm() {
  const slot = $('event-form-slot');
  const ev = S.eventFormId ? S.eventos.find(e => e.id === S.eventFormId) : null;
  slot.innerHTML = `
    <div class="card">
      <h3>${ev ? 'Editar evento' : 'Novo evento'}</h3>
      <div class="form-grid">
        <div><label>Nome</label><input id="ef-nome" placeholder="Ex.: Férias de Julho com Apollo" value="${escapeHtml(ev?.nome || '')}"></div>
        <div class="form-2col">
          <div><label>Budget total</label><input id="ef-budget" inputmode="decimal" placeholder="Ex.: 5.000" value="${ev?.budget ? String(ev.budget).replace('.', ',') : ''}"></div>
          <div><label>Moeda base</label><select id="ef-moeda">${CURRENCIES.map(c => `<option ${((ev?.moedaBase) || S.baseCurrency) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        </div>
        <div class="form-2col">
          <div><label>Início</label><input type="date" id="ef-inicio" value="${ev?.dataInicio || ''}"></div>
          <div><label>Fim</label><input type="date" id="ef-fim" value="${ev?.dataFim || ''}"></div>
        </div>
        <div><label>Notas</label><input id="ef-notas" placeholder="opcional" value="${escapeHtml(ev?.notas || '')}"></div>
        <button class="btn-primary" id="ef-save">${ev ? 'Salvar alterações' : 'Criar evento'}</button>
        <button class="btn-secondary" id="ef-cancel">Cancelar</button>
      </div>
    </div>`;
  $('ef-save').addEventListener('click', saveEventForm);
  $('ef-cancel').addEventListener('click', () => { S.eventFormId = undefined; renderEvents(); });
  if (!ev) $('ef-nome').focus();
}

async function saveEventForm() {
  const nome = $('ef-nome').value.trim();
  if (!nome) { toast('Dê um nome ao evento 🙂', 'warn'); return; }
  const budget = parseValorText($('ef-budget').value) || 0;
  const dataInicio = $('ef-inicio').value || null;
  const dataFim = $('ef-fim').value || null;
  if (dataInicio && dataFim && dataFim < dataInicio) { toast('A data de fim vem antes do início 📅', 'warn'); return; }

  const existing = S.eventFormId ? S.eventos.find(e => e.id === S.eventFormId) : null;
  const ev = {
    id: existing?.id || uid(),
    nome, budget,
    moedaBase: $('ef-moeda').value,
    dataInicio, dataFim,
    notas: $('ef-notas').value.trim(),
    arquivado: existing?.arquivado || false,
    criadoEm: existing?.criadoEm || Date.now(),
  };
  await db.put('eventos', ev);
  const idx = S.eventos.findIndex(e => e.id === ev.id);
  if (idx >= 0) S.eventos[idx] = ev; else S.eventos.unshift(ev);
  S.eventFormId = undefined;
  if (!existing && !activeEvent()) await setActiveEvent(ev.id, false);
  haptic();
  toast(existing ? 'Evento atualizado ✅' : `Evento "${ev.nome}" criado 🎉`);
  renderAll();
}

async function setActiveEvent(id, notify = true) {
  S.activeEventId = id;
  await db.setSetting('activeEventId', id);
  await loadGastos();
  if (notify) { haptic(); toast(`Evento ativo: ${activeEvent()?.nome} 🧳`); }
  renderAll();
}

async function toggleArchive(id) {
  const ev = S.eventos.find(e => e.id === id);
  if (!ev) return;
  ev.arquivado = !ev.arquivado;
  await db.put('eventos', ev);
  if (ev.arquivado && S.activeEventId === id) {
    const next = S.eventos.find(e => !e.arquivado);
    await setActiveEvent(next ? next.id : null, false);
  }
  toast(ev.arquivado ? 'Evento arquivado 🗄️' : 'Evento restaurado 📂');
  renderAll();
}

async function deleteEvent(id) {
  const ev = S.eventos.find(e => e.id === id);
  if (!ev) return;
  const gastosEv = await db.getAllByIndex('gastos', 'eventoId', id);
  if (!confirm(`Excluir "${ev.nome}" e seus ${gastosEv.length} gastos (incluindo fotos)?\n\nIsso não pode ser desfeito.`)) return;
  for (const g of gastosEv) {
    if (g.imagemId) await db.del('imagens', g.imagemId);
    await db.del('gastos', g.id);
  }
  await db.del('eventos', id);
  S.eventos = S.eventos.filter(e => e.id !== id);
  if (S.activeEventId === id) {
    const next = S.eventos.find(e => !e.arquivado);
    await setActiveEvent(next ? next.id : null, false);
  }
  toast('Evento excluído.');
  renderAll();
}

/* ── seletor rápido de evento (topbar) ── */
function openEventPicker() {
  const live = S.eventos.filter(e => !e.arquivado);
  if (!live.length) { switchView('events'); return; }
  $('event-picker-list').innerHTML = live.map(ev => `
    <button class="picker-row" data-pick="${ev.id}">
      <span>🧳 ${escapeHtml(ev.nome)}</span>
      ${ev.id === S.activeEventId ? '<span class="check">✓ ativo</span>' : ''}
    </button>`).join('') +
    `<button class="picker-row" data-pick-manage><span class="muted">⚙️ Gerenciar eventos…</span></button>`;
  $('sheet-event-picker').classList.remove('hidden');
  $('event-picker-list').querySelectorAll('[data-pick]').forEach(b =>
    b.addEventListener('click', async () => { closeEventPicker(); await setActiveEvent(b.dataset.pick); }));
  const manage = $('event-picker-list').querySelector('[data-pick-manage]');
  manage.addEventListener('click', () => { closeEventPicker(); switchView('events'); });
}
function closeEventPicker() { $('sheet-event-picker').classList.add('hidden'); }

/* ═══════════════ Folha de lançamento (fluxo estrela) ═══════════════ */

function buildKeypad() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'];
  $('keypad').innerHTML = keys.map(k => `<button data-key="${k}" aria-label="${k === '⌫' ? 'apagar' : k === 'C' ? 'limpar' : k}">${k}</button>`).join('');
  $('keypad').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    haptic(8);
    const k = b.dataset.key;
    if (k === 'C') A.cents = '';
    else if (k === '⌫') A.cents = A.cents.slice(0, -1);
    else if (A.cents.length < 10 && !(A.cents === '' && k === '0')) A.cents += k;
    updateAmountDisplay();
  }));
}

function buildPayChips() {
  $('pay-chips').innerHTML = PAY_OPTIONS.map(p => `<button class="chip" data-pay="${p.id}">${p.label}</button>`).join('');
  $('pay-chips').querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    A.formaPagamento = A.formaPagamento === ch.dataset.pay ? null : ch.dataset.pay;
    refreshPayChips();
    haptic(8);
  }));
}
function refreshPayChips() {
  $('pay-chips').querySelectorAll('.chip').forEach(ch => ch.classList.toggle('on', ch.dataset.pay === A.formaPagamento));
}

function currentValor() { return (parseInt(A.cents || '0', 10)) / 100; }
function currentTaxa() {
  const ev = activeEvent();
  if (A.moeda === (ev?.moedaBase || 'BRL')) return 1;
  return parseValorText($('fx-rate').value) || 1;
}

function updateAmountDisplay() {
  const v = currentValor();
  const amountEl = $('add-amount');
  amountEl.textContent = fmtMoney(v, A.moeda);
  amountEl.classList.toggle('zero', v === 0);
  const ev = activeEvent();
  const base = ev?.moedaBase || 'BRL';
  if (A.moeda !== base) {
    $('fx-base').textContent = fmtMoney(v * currentTaxa(), base);
  }
}

function renderCatChips(suggestedId = null) {
  const box = $('cat-chips');
  box.innerHTML = S.categories.map(c => `
    <button class="chip ${A.categoriaId === c.id ? 'on' : ''} ${suggestedId === c.id && A.categoriaId === c.id && !A.catManual ? 'suggested' : ''}"
      data-cat="${c.id}">${c.emoji} ${escapeHtml(c.nome)}</button>`).join('');
  box.querySelectorAll('.chip').forEach(ch => ch.addEventListener('click', () => {
    A.categoriaId = ch.dataset.cat;
    A.catManual = true;
    renderCatChips();
    haptic(8);
  }));
}

function fillCurrencySelect() {
  const ev = activeEvent();
  const base = ev?.moedaBase || 'BRL';
  const list = [base, ...CURRENCIES.filter(c => c !== base)];
  $('add-currency').innerHTML = list.map(c => `<option value="${c}">${c}</option>`).join('') + '<option value="__other">outra…</option>';
  $('add-currency').value = A.moeda;
}

function onCurrencyChange() {
  const sel = $('add-currency');
  if (sel.value === '__other') {
    const code = (prompt('Código da moeda (3 letras, ex.: MXN):') || '').trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) {
      if (![...sel.options].some(o => o.value === code)) {
        sel.insertAdjacentHTML('afterbegin', `<option value="${code}">${code}</option>`);
      }
      sel.value = code;
    } else {
      sel.value = A.moeda;
      return;
    }
  }
  A.moeda = sel.value;
  syncFxRow();
  updateAmountDisplay();
}

function syncFxRow() {
  const ev = activeEvent();
  const base = ev?.moedaBase || 'BRL';
  const foreign = A.moeda !== base;
  $('fx-row').classList.toggle('hidden', !foreign);
  if (foreign) {
    $('fx-code').textContent = A.moeda;
    $('fx-base-label').textContent = base;
    const last = S.currencyRates[A.moeda];
    if (!$('fx-rate').value && last) $('fx-rate').value = String(last).replace('.', ',');
  }
}

function suggestCategoryFor(merchant) {
  const norm = normalizeMerchant(merchant);
  if (!norm) return null;
  const cid = S.merchantMap[norm];
  return cid && catById(cid) ? cid : null;
}

function onMerchantInput() {
  if (A.catManual) return; // usuário já escolheu manualmente
  const sug = suggestCategoryFor($('add-merchant').value);
  if (sug && sug !== A.categoriaId) {
    A.categoriaId = sug;
    renderCatChips(sug);
  }
}

function fillMerchantDatalist() {
  db.getAll('gastos').then(all => {
    const names = [...new Map(
      all.filter(g => g.estabelecimento)
        .sort((a, b) => b.criadoEm - a.criadoEm)
        .map(g => [normalizeMerchant(g.estabelecimento), g.estabelecimento])
    ).values()].slice(0, 60);
    $('merchant-list').innerHTML = names.map(n => `<option value="${escapeHtml(n)}">`).join('');
  });
}

function openAddSheet(gasto = null) {
  const ev = activeEvent();
  A.editingId = gasto?.id || null;
  A.cents = gasto ? String(Math.round(gasto.valor * 100)) : '';
  A.moeda = gasto?.moeda || ev.moedaBase || 'BRL';
  A.catManual = !!gasto;
  A.formaPagamento = gasto?.formaPagamento || null;
  A.imagemBlob = null;
  A.imagemId = gasto?.imagemId || null;
  A.imagemRemovida = false;
  A.criadoEm = gasto?.criadoEm || null;

  // categoria default: gasto > última usada > primeira
  A.categoriaId = gasto?.categoriaId
    || (S.lastCategoryId && catById(S.lastCategoryId) ? S.lastCategoryId : S.categories[0]?.id);

  $('add-title').textContent = gasto ? 'Editar gasto' : 'Novo gasto';
  $('add-delete').classList.toggle('hidden', !gasto);
  $('add-date').value = gasto?.data || todayISO();
  $('add-merchant').value = gasto?.estabelecimento || '';
  $('add-notes').value = gasto?.notas || '';
  $('fx-rate').value = gasto && gasto.taxa && gasto.taxa !== 1 ? String(gasto.taxa).replace('.', ',') : '';

  fillCurrencySelect();
  syncFxRow();
  renderCatChips();
  refreshPayChips();
  fillMerchantDatalist();
  updateAmountDisplay();
  updateThumb();
  $('btn-ocr').textContent = '🔎 Ler valor';

  $('sheet-add').classList.remove('hidden');
}

function closeAddSheet() {
  $('sheet-add').classList.add('hidden');
  $('file-camera').value = '';
  $('file-gallery').value = '';
}

async function updateThumb() {
  const wrap = $('add-thumb-wrap');
  const thumb = $('add-thumb');
  let blob = A.imagemBlob;
  if (!blob && A.imagemId && !A.imagemRemovida) {
    const row = await db.get('imagens', A.imagemId);
    blob = row?.blob || null;
  }
  if (blob) {
    if (thumb.src) URL.revokeObjectURL(thumb.src);
    thumb.src = URL.createObjectURL(blob);
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
    thumb.removeAttribute('src');
  }
  $('btn-ocr').classList.toggle('hidden', !(S.ocrEnabled && blob));
}

async function onPhotoPicked(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    A.imagemBlob = await resizeImage(file);
    A.imagemRemovida = false;
    haptic();
    updateThumb();
  } catch {
    toast('Não consegui processar essa imagem 😕', 'warn');
  }
  e.target.value = '';
}

function removePhoto() {
  A.imagemBlob = null;
  A.imagemRemovida = true;
  updateThumb();
}

async function tryOCR() {
  let blob = A.imagemBlob;
  if (!blob && A.imagemId) {
    const row = await db.get('imagens', A.imagemId);
    blob = row?.blob;
  }
  if (!blob) return;
  const btn = $('btn-ocr');
  btn.disabled = true;
  btn.textContent = '⏳ Lendo…';
  try {
    const res = await runOCR(blob, p => { btn.textContent = `⏳ ${Math.round(p * 100)}%`; });
    let achou = false;
    if (res.valor && res.valor > 0) {
      A.cents = String(Math.round(res.valor * 100));
      updateAmountDisplay();
      achou = true;
    }
    if (res.data) { $('add-date').value = res.data; achou = true; }
    toast(achou ? 'Valor sugerido pela foto — confira antes de salvar 🔎' : 'Não consegui ler um valor nessa foto. Digite normalmente 🙂');
  } catch (err) {
    toast(err.message || 'Leitura indisponível agora. Digite normalmente 🙂', 'warn');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔎 Ler valor';
  }
}

async function saveGasto() {
  const ev = activeEvent();
  if (!ev) return;
  const valor = currentValor();
  if (valor <= 0) { toast('Digite o valor do gasto 💰', 'warn'); return; }

  const base = ev.moedaBase || 'BRL';
  const taxa = A.moeda === base ? 1 : currentTaxa();
  const valorBase = Math.round(valor * taxa * 100) / 100;
  const estabelecimento = $('add-merchant').value.trim();
  const data = $('add-date').value || todayISO();

  // detecção de duplicado (novo gasto com mesmo dia + valor + estabelecimento)
  if (!A.editingId && estabelecimento) {
    const norm = normalizeMerchant(estabelecimento);
    const dup = S.gastos.find(g => g.data === data
      && Math.abs((g.valorBase || 0) - valorBase) < 0.005
      && normalizeMerchant(g.estabelecimento) === norm);
    if (dup && !confirm(`Já existe um gasto de ${fmtMoney(valorBase, base)} em "${estabelecimento}" nesse dia.\n\nRegistrar mesmo assim?`)) {
      return;
    }
  }

  const stBefore = eventStats(ev, S.gastos.filter(g => g.id !== A.editingId));

  // imagem
  let imagemId = A.imagemRemovida ? null : A.imagemId;
  if (A.imagemBlob) {
    imagemId = imagemId || uid();
    await db.put('imagens', { id: imagemId, blob: A.imagemBlob });
  } else if (A.imagemRemovida && A.imagemId) {
    await db.del('imagens', A.imagemId);
  }

  const gasto = {
    id: A.editingId || uid(),
    eventoId: ev.id,
    data,
    valor,
    moeda: A.moeda,
    taxa,
    valorBase,
    categoriaId: A.categoriaId,
    estabelecimento,
    formaPagamento: A.formaPagamento,
    notas: $('add-notes').value.trim(),
    imagemId,
    origem: imagemId ? 'foto' : 'manual',
    criadoEm: A.criadoEm || Date.now(),
  };
  await db.put('gastos', gasto);

  // aprendizado estabelecimento → categoria
  if (estabelecimento && A.categoriaId) {
    S.merchantMap[normalizeMerchant(estabelecimento)] = A.categoriaId;
    db.setSetting('merchantMap', S.merchantMap);
  }
  if (A.categoriaId) { S.lastCategoryId = A.categoriaId; db.setSetting('lastCategoryId', A.categoriaId); }
  if (A.moeda !== base && taxa !== 1) { S.currencyRates[A.moeda] = taxa; db.setSetting('currencyRates', S.currencyRates); }

  await loadGastos();
  closeAddSheet();
  haptic(20);
  toast(A.editingId ? 'Gasto atualizado ✅' : `${fmtMoney(valorBase, base)} registrado ✅`);

  // alertas gentis ao cruzar 80% / 100%
  const stAfter = eventStats(ev, S.gastos);
  if (ev.budget > 0) {
    if (stBefore.pct < 1 && stAfter.pct >= 1) {
      setTimeout(() => toast(`🚨 Budget de "${ev.nome}" estourado em ${fmtMoney(stAfter.spent - ev.budget, base)}.`, 'danger', 5000), 600);
    } else if (stBefore.pct < 0.8 && stAfter.pct >= 0.8) {
      setTimeout(() => toast(`⚠️ Você passou de 80% do budget. Restam ${fmtMoney(stAfter.remaining, base)}.`, 'warn', 5000), 600);
    }
  }
  renderAll();
}

async function deleteCurrentGasto() {
  if (!A.editingId) return;
  if (!confirm('Excluir este gasto?')) return;
  const g = S.gastos.find(x => x.id === A.editingId);
  if (g?.imagemId) await db.del('imagens', g.imagemId);
  await db.del('gastos', A.editingId);
  await loadGastos();
  closeAddSheet();
  toast('Gasto excluído 🗑️');
  renderAll();
}

/* ═══════════════ Visualizador de comprovante ═══════════════ */

async function viewImage(imagemId) {
  const row = await db.get('imagens', imagemId);
  if (!row) { toast('Imagem não encontrada 😕', 'warn'); return; }
  showImageBlob(row.blob);
}
function showImageBlob(blob) {
  const img = $('img-viewer-img');
  if (img.src) URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
  $('img-viewer').classList.remove('hidden');
}
function closeImageViewer() {
  const img = $('img-viewer-img');
  if (img.src) URL.revokeObjectURL(img.src);
  img.removeAttribute('src');
  $('img-viewer').classList.add('hidden');
}

/* ═══════════════ Ajustes ═══════════════ */

function renderSettings() {
  const el = $('view-settings');
  el.innerHTML = `
    <div class="card">
      <h3>Exportar & backup</h3>
      <button class="btn-primary" id="set-export-xlsx">📊 Exportar Excel</button>
      <button class="btn-secondary" id="set-export-json">💾 Backup completo (JSON com fotos)</button>
      <button class="btn-secondary" id="set-import-json">📥 Restaurar backup</button>
      <input type="file" id="set-import-file" accept=".json,application/json" hidden>
      <p class="small muted" style="margin:10px 2px 0">O backup JSON inclui todos os eventos, gastos e fotos.
      Guarde o arquivo no Google Drive ou similar de vez em quando.</p>
      <p class="small muted" id="storage-info" style="margin:6px 2px 0"></p>
    </div>

    <div class="card">
      <h3>Preferências</h3>
      <div class="settings-row">
        <div><div class="lbl">Tema</div></div>
        <div class="seg" id="set-theme">
          <button data-t="auto" class="${S.theme === 'auto' ? 'on' : ''}">Auto</button>
          <button data-t="light" class="${S.theme === 'light' ? 'on' : ''}">Claro</button>
          <button data-t="dark" class="${S.theme === 'dark' ? 'on' : ''}">Escuro</button>
        </div>
      </div>
      <div class="settings-row">
        <div><div class="lbl">Moeda padrão p/ novos eventos</div></div>
        <select id="set-currency" class="currency-chip">${CURRENCIES.map(c => `<option ${S.baseCurrency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="settings-row">
        <div>
          <div class="lbl">Ler valor da foto (OCR)</div>
          <div class="sub">Best-effort, roda no aparelho. Baixa o leitor (~15 MB) na 1ª vez com internet; depois funciona offline. Pode errar — sempre confira.</div>
        </div>
        <button class="switch ${S.ocrEnabled ? 'on' : ''}" id="set-ocr" role="switch" aria-checked="${S.ocrEnabled}" aria-label="OCR"></button>
      </div>
      <div class="settings-row ${S.deferredInstall ? '' : 'hidden'}">
        <div><div class="lbl">Instalar app</div><div class="sub">Adicionar à tela inicial</div></div>
        <button class="chip on" id="set-install">Instalar</button>
      </div>
    </div>

    <div class="card">
      <h3>Categorias</h3>
      <div id="cat-manage"></div>
      <button class="btn-secondary" id="cat-add">➕ Nova categoria</button>
    </div>

    <p class="small muted" style="text-align:center">Gastos de Viagem · 100% offline · seus dados ficam só no seu aparelho</p>`;

  $('set-export-xlsx').addEventListener('click', exportExcel);
  $('set-export-json').addEventListener('click', exportJSON);
  $('set-import-json').addEventListener('click', () => $('set-import-file').click());
  $('set-import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const done = await importJSON(file);
      if (done) { await reloadAfterImport(); }
    } catch (err) {
      toast(err.message, 'danger');
    }
    e.target.value = '';
  });

  $('set-theme').querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    S.theme = b.dataset.t;
    applyTheme(S.theme);
    await db.setSetting('theme', S.theme);
    renderSettings();
  }));
  $('set-currency').addEventListener('change', async (e) => {
    S.baseCurrency = e.target.value;
    await db.setSetting('baseCurrency', S.baseCurrency);
    toast(`Moeda padrão: ${S.baseCurrency}`);
  });
  $('set-ocr').addEventListener('click', async () => {
    S.ocrEnabled = !S.ocrEnabled;
    await db.setSetting('ocrEnabled', S.ocrEnabled);
    renderSettings();
  });
  const install = $('set-install');
  if (install) install.addEventListener('click', async () => {
    if (!S.deferredInstall) return;
    S.deferredInstall.prompt();
    await S.deferredInstall.userChoice;
    S.deferredInstall = null;
    renderSettings();
  });

  renderCatManage();
  $('cat-add').addEventListener('click', addCategory);

  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(({ usage, quota }) => {
      const mb = (n) => (n / 1048576).toFixed(1);
      $('storage-info').textContent = `Armazenamento usado: ${mb(usage)} MB de ${mb(quota)} MB disponíveis.`;
    });
  }
}

async function reloadAfterImport() {
  S.categories = await db.getSetting('categories', DEFAULT_CATEGORIES);
  S.theme = await db.getSetting('theme', 'auto');
  S.baseCurrency = await db.getSetting('baseCurrency', 'BRL');
  S.ocrEnabled = await db.getSetting('ocrEnabled', true);
  S.merchantMap = await db.getSetting('merchantMap', {});
  S.lastCategoryId = await db.getSetting('lastCategoryId', null);
  S.currencyRates = await db.getSetting('currencyRates', {});
  S.activeEventId = await db.getSetting('activeEventId', null);
  S.eventos = (await db.getAll('eventos')).sort((a, b) => b.criadoEm - a.criadoEm);
  if (S.activeEventId && !activeEvent()) S.activeEventId = null;
  if (!S.activeEventId) S.activeEventId = S.eventos.find(e => !e.arquivado)?.id || null;
  applyTheme(S.theme);
  await loadGastos();
  renderAll();
}

function renderCatManage() {
  const box = $('cat-manage');
  box.innerHTML = S.categories.map(c => `
    <div class="cat-manage-row">
      <span>${c.emoji}</span><span class="nm">${escapeHtml(c.nome)}</span>
      <button data-cat-edit="${c.id}" aria-label="Renomear">✏️</button>
      <button data-cat-del="${c.id}" aria-label="Excluir">🗑️</button>
    </div>`).join('');
  box.querySelectorAll('[data-cat-edit]').forEach(b => b.addEventListener('click', () => editCategory(b.dataset.catEdit)));
  box.querySelectorAll('[data-cat-del]').forEach(b => b.addEventListener('click', () => deleteCategory(b.dataset.catDel)));
}

async function addCategory() {
  const nome = (prompt('Nome da nova categoria:') || '').trim();
  if (!nome) return;
  const emoji = (prompt('Emoji da categoria (opcional):') || '🏷️').trim() || '🏷️';
  S.categories.push({ id: uid(), nome, emoji });
  await db.setSetting('categories', S.categories);
  renderCatManage();
  toast(`Categoria "${nome}" criada ✅`);
}

async function editCategory(id) {
  const cat = catById(id);
  if (!cat) return;
  const nome = (prompt('Novo nome:', cat.nome) || '').trim();
  if (!nome) return;
  const emoji = (prompt('Emoji:', cat.emoji) || cat.emoji).trim() || cat.emoji;
  cat.nome = nome; cat.emoji = emoji;
  await db.setSetting('categories', S.categories);
  renderCatManage();
}

async function deleteCategory(id) {
  const cat = catById(id);
  if (!cat) return;
  if (S.categories.length <= 1) { toast('Mantenha pelo menos uma categoria 🙂', 'warn'); return; }
  const all = await db.getAll('gastos');
  const usados = all.filter(g => g.categoriaId === id);
  const fallback = S.categories.find(c => c.id !== id);
  const msg = usados.length
    ? `Excluir "${cat.nome}"? ${usados.length} gasto(s) serão movidos para "${fallback.nome}".`
    : `Excluir a categoria "${cat.nome}"?`;
  if (!confirm(msg)) return;
  for (const g of usados) { g.categoriaId = fallback.id; await db.put('gastos', g); }
  S.categories = S.categories.filter(c => c.id !== id);
  await db.setSetting('categories', S.categories);
  // limpa aprendizados que apontavam para a categoria removida
  for (const k of Object.keys(S.merchantMap)) if (S.merchantMap[k] === id) delete S.merchantMap[k];
  await db.setSetting('merchantMap', S.merchantMap);
  await loadGastos();
  renderCatManage();
  toast('Categoria excluída.');
}

init();
