# Progresso do Vindra 3D Studio

> Se o histórico da conversa sumir, leia `docs/` antes de qualquer coisa:
> este arquivo e o `docs/PROMPT_VINDRA_3D.md` (o prompt mestre com as fases e as regras de trabalho).
> Atualize este arquivo no fim de cada fase.
>
> **Quando o prompt e este arquivo divergirem, vale este arquivo.** O prompt é o original;
> as mudanças combinadas depois estão em "Onde o prompt ficou desatualizado" e em "Decisões".

Última atualização: 26/10/2026 (ajustes da Fase 5 e prompt versionado).

## Fases

| Fase | Assunto | Situação | Commits |
|---|---|---|---|
| 1 | Fundação | ✅ concluída | `2fad20c` |
| 2 | Supabase, RLS, seed e login | ✅ concluída | `3101cc6` |
| 3 | Layout, tema da marca e PWA | ✅ concluída | `a0a4d59` |
| 4 | Configurações, impressoras, filamentos e insumos | ✅ concluída | `95a3483` |
| 5 | Calculadora de custo e importação `.3mf` | ✅ concluída | `b8c4039`, ajustes em `627839a` |
| 6 | Produtos e variações | em andamento: migração e `lib/product-pricing.ts` prontos; faltam telas e calculadora | |
| 7 | Clientes, orçamentos, página pública e PDF | | |
| 8 | Pedidos (kanban) e baixa de filamento | | |
| 9 | Financeiro e dashboard | | |
| 10 | Polimento e deploy | | |

Antes de cada commit de fase: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passando.
O push vem depois que o Enzo confere no navegador.

## Onde o prompt ficou desatualizado

| Assunto | O prompt diz | O que vale |
|---|---|---|
| Pasta do projeto | `C:\Projetos\vindra-3d-studio` | `c:\dev\vindra` |
| Repositório | criar com `gh repo create` | criado pelo Enzo; `gh` não é usado, o push vai pelo git já autenticado no VS Code |
| Checagens antes do commit | lint, typecheck e build | também `npm test`; push só depois da conferência do Enzo |
| Mão de obra | `(minPreparo + minPós) / 60 × valorHora` no total | preparo por lote, pós por peça (ver "Decisões") |
| Página pública do orçamento | Server Component com a service role key **ou** função `security definer` | funções `security definer` `get_public_quote` e `approve_public_quote` (liberadas para `anon`), que devolvem só os campos públicos pelo token |
| `SUPABASE_SERVICE_ROLE_KEY` | colar na Vercel no deploy | não é usada nem exigida (`lib/env.ts` só valida as `NEXT_PUBLIC_*`); fica comentada no `.env.example` e só entra, inclusive na Vercel, se uma fase futura precisar |
| Purga na importação `.3mf` | não fala | fica em 0 e a interface não afirma que o fatiador já soma a purga (ver "Decisões") |

## Decisões

### Regra do ponto nos números
O leitor de números (`lib/numbers.ts`, `parseDecimal`) aceita o formato brasileiro.
Ponto seguido de grupos de exatamente 3 dígitos, sem vírgula e sem começar com 0, é separador de milhar;
nos outros casos é decimal. Com vírgula, a vírgula é o decimal.

| Digitado | Lido como |
|---|---|
| `1.000` | 1000 |
| `2.500` | 2500 |
| `1.010` | 1010 |
| `1.000,50` | 1000,5 |
| `0.125` | 0,125 |
| `0,125` | 0,125 |
| `12.5` | 12,5 |

Os casos estão em `tests/numbers.test.ts`.

### Avisos de valor fora do normal
Aviso, não bloqueio: pede confirmação antes de salvar. Os limites ficam em `UNUSUAL_LIMITS`
(`lib/unusual-values.ts`): tarifa de energia acima de R$ 3/kWh, hora de trabalho acima de R$ 500,
carretel abaixo de R$ 20 ou acima de R$ 500, peso líquido acima de 5.000 g, impressora acima de 1.000 W.

### Mão de obra: preparo por lote, pós por peça
Preparação e fatiamento contam uma vez por lote e são divididos pelas peças.
O pós-processamento conta por peça. A conta está em `lib/pricing.ts`.

### Purga não confirmada
A importação do `.3mf` deixa o campo de purga em 0, supondo que as gramas por filamento do
`slice_info.config` já incluem purga e torre. Isso **ainda não foi verificado** com um arquivo fatiado real.
Por isso nenhum texto da interface afirma que o Bambu já inclui a purga:
- dica do campo: "Deixe 0 se o fatiador já somou purga e torre nas gramas."
- aviso da importação: "Confira se a purga já está somada nas gramas e quantas peças cabem por mesa."

### Cores de canal
Venda direta = verde da marca (`--chart-1`), Shopee = laranja (`--chart-2`), TikTok = violeta (`--chart-3`).
Vermelho e âmbar não são cor de série: ficam só para prejuízo/atraso e alerta.
Os tokens estão em `app/globals.css`.

### Usuário de teste para o Playwright
Existe um usuário só para testes locais, com `E2E_EMAIL` e `E2E_PASSWORD` no `.env.local` (fora do git).
- Usar só para logar no Playwright e tirar prints locais (desktop 1280px, celular 390px).
- Nunca usar esse login para outra coisa.
- Nunca gravar a senha em arquivo versionado nem mostrá-la na saída: o script lê o `.env.local` na hora.
- O Playwright fica fora do projeto (`playwright-core` numa pasta temporária, usando o Edge do Windows),
  então o `package.json` não muda.

### Produtos (Fase 6)
- **Margem sempre recalculada na hora** (`lib/product-pricing.ts`) com os preços dos carretéis e as taxas
  atuais. O `unit_cost` guardado na ficha é só cache e não entra na conta.
- **Preço vazio** num canal = "Sem preço", com o sugerido ao lado (margem padrão). Não conta como margem ruim.
- **Margem ruim** = canal com preço em prejuízo ou abaixo da margem mínima das Configurações.
- **Canal com taxas em branco**: selo "Taxas não configuradas" no lugar de "ok", contado no aviso do topo.
  Margem ruim tem prioridade sobre esse selo.
- **Ficha compartilhada**: várias variações podem usar a mesma ficha. Na calculadora, ao abrir ou salvar
  uma ficha em uso, mostrar "Usada em N variações: [nomes]".
- **Carretel que acabou ou foi excluído**: a ficha passa a usar a média atual do material e mostra aviso
  (vale também na calculadora, porque a regra está em `resolveFilament`, `lib/cost-sheet.ts`).
  A exclusão é detectada pela coluna `cost_sheet_filaments.spool_removed`, marcada por trigger quando o
  banco zera o `filament_id`; salvar a ficha de novo limpa a marca.
- **Custo do material sem carretel válido** (regra única em `evaluateSheet`/`resolveFilament`,
  `lib/cost-sheet.ts`, usada pela calculadora, pelo salvamento e pelos produtos):
  1. média do estoque (só carretéis com saldo);
  2. sem estoque: custo por grama do último carretel do material (pela data de compra; sem data, pelo
     cadastro), com aviso "Sem estoque de [material], usando o último preço pago.";
  3. material nunca comprado: **sem custo de filamento**. Nunca conta como R$ 0. Nos produtos é tão grave
     quanto "sem ficha"; na calculadora o preço fica "—". A ficha pode ser salva, com `unit_cost` vazio.
- **SKU único no catálogo inteiro** do usuário (produtos e variações juntos), sem diferenciar maiúsculas
  nem espaços nas pontas. Garantido por trigger (`check_catalog_sku`); SKU vazio vira null.
- **`save_product`** grava produto, variações e preços numa transação. Variações são atualizadas no lugar
  (orçamentos e pedidos apontam para elas); só as removidas da lista são apagadas.

## Pendências

- [ ] **`.3mf` fatiado real.** O único `.3mf` real testado era um projeto **sem fatiar** (sem tempo nem gramas).
  Fatiar uma mesa multicor, exportar com *Arquivo → Exportar → Exportar arquivo de mesa fatiada*
  (`.gcode.3mf`) e comparar a soma dos filamentos com o total do Bambu Studio (modelo + purga + torre)
  e com a pesagem real. Se não bater, a importação precisa preencher a purga com a diferença.
- [ ] **Conferir impressora A1 x A1 mini.** O seed cadastra uma Bambu Lab A1, mas o `.3mf` real recebido
  era de uma A1 mini. Confirmar qual impressora é usada (ou se são as duas) e ajustar o cadastro.
- [ ] Revisar a paleta de canais nos gráficos: azul e violeta lado a lado reprovam no validador de
  daltonismo (Fase 9).
