# 🧳 Gastos de Viagem

App pessoal de controle de gastos de férias/viagem. **100% offline, 100% grátis** — PWA instalável, feito para celular (otimizado para o Samsung Galaxy S24 FE).

## O que ele faz

- ➕ **Lançamento em ~3 toques + valor**: botão gigante, teclado numérico próprio (estilo app de banco: digite `1 2 3 4` → `R$ 12,34`), categoria em 1 toque, data e evento já preenchidos.
- 📎 **Foto do comprovante** por gasto (câmera ou galeria), com visualização em tela cheia. As fotos são redimensionadas e guardadas no IndexedDB do aparelho.
- 🎯 **Budget geral por evento** ("Férias de Julho com Apollo"): anel de progresso, valor restante, % consumido e **alertas gentis em 80% e 100%**.
- 📊 **Dashboard**: distribuição por categoria (rosca), gasto por dia (linha do tempo), ritmo médio por dia e **projeção de estouro** ("nesse ritmo, você termina R$ X acima/abaixo").
- 🧾 **Lista com busca e filtros** (texto, categoria), agrupada por dia.
- 🧠 **Aprendizado estabelecimento → categoria**: registrou "Padoca do Zé" como Alimentação uma vez, na próxima ele já sugere.
- 👯 **Detecção de duplicado**: avisa se você registrar o mesmo valor + estabelecimento + dia duas vezes.
- 💱 **Multi-moeda**: gasto em USD/EUR/etc. com taxa informada por você; o budget é sempre na moeda base do evento.
- 🔎 **OCR opcional** (Tesseract.js, roda no aparelho): botão "Ler valor" tenta pré-preencher valor e data a partir da foto. Best-effort — nunca bloqueia o registro; pode ser desligado em Ajustes.
- 📊 **Exportar Excel**: gera um `.xlsx` real (SheetJS embutida, offline) com uma linha por gasto — botão visível no Dashboard e em Ajustes.
- 💾 **Backup completo em JSON** (incluindo fotos em base64) e **restauração**.
- 🌙 Dark mode (auto/claro/escuro), funciona offline sempre, dados nunca saem do aparelho.

## Como rodar local

Não há build — é um site estático. Só precisa de um servidor HTTP simples (módulos ES e service worker não funcionam via `file://`):

```bash
# opção 1 (Python)
python3 -m http.server 8000

# opção 2 (Node)
npx serve .
```

Abra `http://localhost:8000` no navegador.

## Deploy no GitHub Pages (passo a passo)

1. Faça push deste repositório para o GitHub (branch `main` ou a que preferir).
2. No GitHub, abra o repositório → **Settings** → **Pages**.
3. Em **Build and deployment / Source**, escolha **Deploy from a branch**.
4. Selecione a branch (ex.: `main`) e a pasta **/ (root)** → **Save**.
5. Aguarde ~1 minuto. O app fica disponível em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

> Todos os caminhos do app são relativos, então funciona em qualquer subpasta do Pages sem configurar nada.
>
> **Nota:** em contas gratuitas o GitHub Pages exige que o repositório seja **público**. Como os dados ficam só no seu aparelho (nada é enviado ao site), o repositório público expõe apenas o código, nunca seus gastos.

## Instalar na tela inicial do Galaxy S24 FE

1. Abra a URL do app no **Chrome** do celular.
2. Toque no menu **⋮** (canto superior direito).
3. Toque em **"Adicionar à tela inicial"** → **"Instalar"** (ou use o aviso de instalação que o Chrome mostra sozinho; também há um botão *Instalar app* em **Ajustes** dentro do app).
4. O ícone aparece na tela inicial e o app abre em **tela cheia**, como app nativo — inclusive sem internet, em modo avião.

Dica: depois de instalar, abra o app uma vez **com internet** se quiser usar o OCR — o leitor (~15 MB) é baixado nessa primeira vez e depois funciona offline.

## Backup e restauração

- **Ajustes → 💾 Backup completo (JSON com fotos)**: gera um arquivo `gastos-viagem-backup-AAAA-MM-DD.json` com tudo (eventos, gastos, configurações e fotos). Salve no Google Drive de tempos em tempos.
- **Ajustes → 📥 Restaurar backup**: selecione o arquivo JSON para restaurar. **Atenção:** a restauração substitui todos os dados atuais.
- **Exportar Excel** (Dashboard ou Ajustes): gera `gastos-viagem-AAAA-MM-DD.xlsx` com todos os gastos de todos os eventos, uma linha por gasto (evento, data, valor, moeda, taxa, valor na moeda base, categoria, estabelecimento, forma de pagamento, notas, comprovante).

O app pede ao navegador **armazenamento persistente** (`navigator.storage.persist()`), o que protege os dados de limpezas automáticas. Ainda assim: **apagar os dados do Chrome ou desinstalar o app apaga os dados** — mantenha backups.

## Estrutura

```
index.html          shell do app (uma página)
styles.css          tema claro/escuro, mobile-first
js/app.js           lógica principal (views, lançamento, eventos, ajustes)
js/db.js            IndexedDB (eventos, gastos, imagens, settings)
js/utils.js         formatação, parsing de valores BR/estrangeiro, imagens
js/charts.js        gráficos SVG (anel, rosca, barras) sem dependências
js/export.js        Excel (.xlsx), backup JSON e importação
js/ocr.js           OCR opcional via Tesseract.js (CDN + cache offline)
vendor/xlsx.mini.min.js  SheetJS embutida (funciona offline)
sw.js               service worker (pré-cache do app shell)
manifest.json       manifesto PWA
icons/              ícones do app
```

## Privacidade

Sem backend, sem API, sem chave, sem analytics. Tudo roda no navegador e os dados ficam **apenas no IndexedDB do seu aparelho**.
