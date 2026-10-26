# Vindra 3D Studio

Sistema de gestão da **Vindra 3D**: custo real de cada peça impressa, filamentos, orçamentos, pedidos e financeiro.
Feito para usar no celular (PWA) e no computador.

> README em construção. A versão completa (prints, deploy na Vercel, passo a passo) entra na Fase 10.

## Rodar localmente

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
npm run dev                  # http://localhost:3000
```

| Comando | O que faz |
|---|---|
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` | Checagens (rodam antes de cada commit de fase) |
| `npm run db:push` | Aplica as migrações de `supabase/migrations/` no projeto vinculado |
| `npm run db:types` | Gera `lib/supabase/database.types.ts` a partir do banco |

## Andamento

- [x] Fase 1 — Fundação
- [x] Fase 2 — Supabase, RLS e login
- [x] Fase 3 — Layout, tema e PWA
- [x] Fase 4 — Configurações, impressoras, filamentos e insumos
- [x] Fase 5 — Calculadora de custo e importação `.3mf`
- [ ] Fase 6 — Produtos e variações
- [ ] Fase 7 — Clientes, orçamentos, página pública e PDF
- [ ] Fase 8 — Pedidos (kanban) e baixa de filamento
- [ ] Fase 9 — Financeiro e dashboard
- [ ] Fase 10 — Polimento e deploy

## Pendências

- [ ] **Conferir as gramas importadas do `.3mf` com o resumo do Bambu Studio e com pesagem real.**
  A importação assume que os gramas por filamento do `slice_info.config` já incluem purga e torre
  (por isso deixa o campo "purga" em 0). Isso ainda não foi verificado com um arquivo fatiado de verdade:
  o único `.3mf` real testado até agora era um projeto salvo **sem fatiar** (Bambu Studio 2.4), que não
  traz tempo nem gramas. Para conferir: fatie uma mesa multicor, use *Arquivo → Exportar → Exportar
  arquivo de mesa fatiada*, compare a soma dos filamentos com o total (modelo + purga + torre) do
  Bambu Studio e com o peso consumido na balança.
- [ ] Revisar a paleta de canais nos gráficos (azul e violeta adjacentes reprovam no validador de
  daltonismo) — Fase 9.
