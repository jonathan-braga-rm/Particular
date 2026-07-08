# 📋 Contexto do projeto — Gastos de Viagem

> Documento de *handoff*. Serve para retomar o desenvolvimento deste app de
> qualquer máquina ou de outra conta do Claude Code, sem perder o histórico do
> que já foi feito e do que falta. Leia isto primeiro; o **prompt pronto para
> colar** numa nova conversa está em [`PROMPT-INICIAL.md`](PROMPT-INICIAL.md).

---

## 1. O que é o app

PWA pessoal de **controle de gastos de viagem/férias**, **100% offline e custo
zero**. Feito para uso no celular (Samsung Galaxy S24 FE, Android) e hospedado
de graça no GitHub Pages. Sem backend, sem API paga, sem chave — tudo roda no
navegador e os dados ficam só no aparelho (IndexedDB).

Descrição completa das funcionalidades: veja o [`README.md`](README.md).

## 2. Onde está o código

- **Repositório:** `jonathan-braga-rm/Particular` (público)
- **URL do repo:** https://github.com/jonathan-braga-rm/Particular
- **Branch principal com o código pronto:** `main`
- **URL do app depois de publicado:** `https://jonathan-braga-rm.github.io/Particular/`

### Clonar de outra máquina

```bash
git clone https://github.com/jonathan-braga-rm/Particular.git
cd Particular
git checkout main   # garante a branch certa (veja o aviso na seção 6)
```

## 3. Stack e decisões-chave

- **Vanilla JS (módulos ES)** — sem framework, sem build step. Abre direto no
  navegador; deploy é só copiar os arquivos estáticos.
- **IndexedDB** para dados **e imagens** (blobs). Nada de localStorage para fotos.
- **PWA**: `manifest.json` + `sw.js` (service worker com pré-cache versionado) +
  ícones em `icons/`. Instalável, tela cheia, offline.
- **SheetJS (xlsx)** vendorizada em `vendor/xlsx.mini.min.js` para gerar `.xlsx`
  real **offline** (a CDN estava bloqueada no ambiente; por isso foi embutida).
- **Tesseract.js** (OCR opcional) carregado da CDN sob demanda e cacheado pelo
  service worker; roda no aparelho, best-effort, nunca bloqueia o registro.
- **Gráficos em SVG puro** (anel de budget, rosca por categoria, barras diárias),
  sem bibliotecas.
- **Dark mode** via `data-theme` no `<html>` (auto/claro/escuro).

## 4. Estrutura dos arquivos

```
index.html               shell do app (uma página, todas as telas)
styles.css               tema claro/escuro, mobile-first
js/app.js                lógica principal (views, lançamento, eventos, ajustes)
js/db.js                 camada IndexedDB (eventos, gastos, imagens, settings)
js/utils.js              formatação, parsing de valores BR/estrangeiro, imagens, toasts
js/charts.js             gráficos SVG (budgetRing, categoryDonut, dailyBars)
js/export.js             Excel (.xlsx), backup JSON completo e importação
js/ocr.js                OCR opcional via Tesseract.js
vendor/xlsx.mini.min.js  SheetJS embutida (offline)
sw.js                    service worker (pré-cache do app shell + runtime da CDN do OCR)
manifest.json            manifesto PWA
icons/                   ícones (192, 512, maskable, apple-touch)
README.md                documentação de uso, deploy e backup
CONTEXT.md               este arquivo
PROMPT-INICIAL.md        prompt pronto para colar numa nova conversa
```

### Modelo de dados (IndexedDB, DB `gastos-viagem`)

- **`eventos`**: `{ id, nome, budget, moedaBase, dataInicio, dataFim, notas, arquivado, criadoEm }`
- **`gastos`**: `{ id, eventoId, data, valor, moeda, taxa, valorBase, categoriaId, estabelecimento, formaPagamento, notas, imagemId, origem, criadoEm }`
- **`imagens`**: `{ id, blob }`
- **`settings`**: chave/valor (`categories`, `theme`, `baseCurrency`, `ocrEnabled`, `merchantMap`, `lastCategoryId`, `currencyRates`, `activeEventId`)

## 5. Como rodar e testar localmente

Precisa de um servidor HTTP (módulos ES e service worker não funcionam via `file://`):

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Há uma suíte de teste end-to-end (Playwright/Chromium) que foi usada no
desenvolvimento — cobre lançamento, foto, budget/alertas, multi-moeda,
export Excel/JSON, restauração de backup e funcionamento offline. Ela não está
versionada no repo (ficava em scratchpad), mas o app foi validado com 30
verificações passando e zero erros de console.

## 6. Estado do deploy — ⚠️ AÇÃO PENDENTE

O código está pronto e na `main`. Falta **um passo manual** que só o dono da
conta consegue fazer (não dá para automatizar: o token do GitHub Actions não
tem permissão para criar o site do Pages neste repo — tentamos e falhou com
`Resource not accessible by integration`).

**Passo pendente — ativar o GitHub Pages:**

1. https://github.com/jonathan-braga-rm/Particular → aba **Settings**.
2. Menu esquerdo → **Pages**.
3. **Source** = **Deploy from a branch**.
4. **Branch** = **`main`**, pasta **`/ (root)`** → **Save**.
5. Aguardar 1–2 min → a URL `https://jonathan-braga-rm.github.io/Particular/`
   fica no ar.

**⚠️ Branch padrão:** o repositório foi criado tendo
`claude/travel-expense-pwa-ogcs49` como branch **padrão** (o primeiro push
definiu isso). Recomenda-se mudar o padrão para `main` em
**Settings → General → Default branch** para evitar confusão ao clonar. O
código nas duas branches é equivalente, mas `main` é a linha oficial.

## 7. Histórico do que já foi feito

- Construído o app PWA completo do zero (todas as funcionalidades do escopo).
- Ícones gerados; SheetJS vendorizada; service worker configurado.
- Testado end-to-end no Chromium (viewport do S24 FE) — tudo passou.
- Repositório tornado **público** (requisito do Pages grátis).
- PR #1: app inicial → merged na `main`.
- PR #2: workflow de deploy via Actions → merged, mas o deploy **falhou**
  (token sem permissão para criar o Pages).
- PR #3: **removido** o workflow de Actions; decisão de publicar direto da
  branch (Deploy from a branch), que não depende de Actions.
- **Pendente:** o clique em Settings → Pages (seção 6).

## 8. Como continuar o desenvolvimento

O fluxo padrão pedido no ambiente: desenvolver numa branch, commitar, e abrir
PR para a `main`. Se for usar o Claude Code de novo, cole o prompt de
[`PROMPT-INICIAL.md`](PROMPT-INICIAL.md) no início da conversa para dar todo
o contexto de uma vez.

Ideias/backlog possível (nada obrigatório):
- Sincronização opcional entre aparelhos (hoje os dados são por-dispositivo).
- Metas por categoria (hoje o budget é geral por evento, por design).
- Gráfico de comparação entre eventos.
- Melhorar heurística do OCR para recibos brasileiros.
