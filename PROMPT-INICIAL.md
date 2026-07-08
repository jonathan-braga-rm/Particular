# 🚀 Prompt para iniciar em uma nova conversa do Claude Code

Copie **todo o bloco abaixo** e cole como a primeira mensagem numa nova conversa
do Claude Code (em outra máquina ou outra conta), com este repositório aberto.
Ele dá todo o contexto do projeto de uma vez.

---

```
Estou retomando um projeto já existente neste repositório: um PWA pessoal de
controle de gastos de viagem/férias, 100% offline e custo zero. Antes de
qualquer coisa, LEIA os arquivos CONTEXT.md e README.md na raiz do repositório
— eles têm todo o contexto, a arquitetura, o estado do deploy e o histórico do
que já foi feito.

Resumo rápido:
- App PWA em vanilla JS (módulos ES), sem build step. Estrutura: index.html,
  styles.css, js/*.js (app, db, utils, charts, export, ocr), sw.js,
  manifest.json, icons/, vendor/xlsx.mini.min.js (SheetJS embutida).
- Dados e imagens em IndexedDB (DB "gastos-viagem"). Sem backend, sem chave.
- Repositório: jonathan-braga-rm/Particular (público). Código pronto na branch
  main. Hospedagem no GitHub Pages: https://jonathan-braga-rm.github.io/Particular/
- Restrições inegociáveis: custo ZERO, funciona 100% offline, mobile-first para
  Samsung Galaxy S24 FE, fricção mínima no lançamento de gastos (~3 toques +
  valor), foto do comprovante por gasto, budget por evento, dashboard, export
  Excel (.xlsx real) e backup/restauração JSON.

Regras de trabalho:
- Não use nada pago nem que dependa de servidor. Tudo client-side e offline.
- Para rodar/testar localmente: `python3 -m http.server 8000` (service worker e
  módulos ES não funcionam via file://).
- Ao alterar arquivos do app shell, lembre de atualizar a lista PRECACHE e a
  constante VERSION em sw.js.
- Desenvolva numa branch, commite com mensagens claras e abra PR para a main.

Primeiro, leia CONTEXT.md e README.md e me diga que entendeu o estado atual.
Depois vou te passar a próxima tarefa.
```

---

## Dica extra: backup dos seus dados

O **código** vive no GitHub, mas os **seus gastos** ficam só no aparelho
(IndexedDB). Para levar seus dados de um celular/notebook para outro:

1. No app → **Ajustes → 💾 Backup completo (JSON com fotos)** — salva um arquivo.
2. No outro aparelho → **Ajustes → 📥 Restaurar backup** — selecione esse arquivo.

Isso é independente do GitHub e é a única forma de mover os lançamentos entre
dispositivos (por design, não há servidor que sincronize).
