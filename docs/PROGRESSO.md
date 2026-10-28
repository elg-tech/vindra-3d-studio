# Progresso do Vindra 3D Studio

> Se o histórico da conversa sumir, leia `docs/` antes de qualquer coisa:
> este arquivo e o `docs/PROMPT_VINDRA_3D.md` (o prompt mestre com as fases e as regras de trabalho).
> Atualize este arquivo no fim de cada fase.
>
> **Quando o prompt e este arquivo divergirem, vale este arquivo.** O prompt é o original;
> as mudanças combinadas depois estão em "Onde o prompt ficou desatualizado" e em "Decisões".

Última atualização: 27/10/2026 (Fase 9 concluída).

## Fases

| Fase | Assunto | Situação | Commits |
|---|---|---|---|
| 1 | Fundação | ✅ concluída | `2fad20c` |
| 2 | Supabase, RLS, seed e login | ✅ concluída | `3101cc6` |
| 3 | Layout, tema da marca e PWA | ✅ concluída | `a0a4d59` |
| 4 | Configurações, impressoras, filamentos e insumos | ✅ concluída | `95a3483` |
| 5 | Calculadora de custo e importação `.3mf` | ✅ concluída | `b8c4039`, ajustes em `627839a` |
| 6 | Produtos e variações | ✅ concluída | `6dd5665`, `1317450`, `62c4aef` |
| 7 | Clientes, orçamentos, página pública, PDF, Pix e WhatsApp | ✅ concluída | `cbc64fd` |
| 8 | Pedidos (kanban), pagamentos, baixa de filamento e falhas | ✅ concluída | `c43a95c`, `e11becc`, `f322f43`, `c99e144` |
| 9 | Financeiro e dashboard | ✅ concluída (plano em `docs/PLANO-FASE-9.md`) | `f18fac5`, ajustes em `f0e77be` |
| 10 | Polimento (deploy já feito) | em andamento na branch `fase-10` (escopo em "Fase 10: escopo final") | |

Antes de cada commit de fase: `npm run lint`, `npm run typecheck`, `npm test` e `npm run build` passando.
O push vem depois que o Enzo confere no navegador.
No Windows, rode os testes a partir de `C:\dev\vindra` (C maiúsculo): com o terminal em `c:\dev\vindra` o Vitest
não encontra os arquivos e mostra "no tests" (é o ambiente, não o código).

## Produção

- **Deploy feito pelo Enzo em 28/10/2026:** <https://vindra-3d-studio.vercel.app>, região `gru1`, variáveis
  `NEXT_PUBLIC_*` configuradas, **sem** `SUPABASE_SERVICE_ROLE_KEY`.
- Supabase Auth com Site URL e Redirect URLs da Vercel; cadastro público desligado.
- **Em uso real:** o primeiro orçamento de verdade foi enviado a um cliente pelo WhatsApp e funcionou.
- Regras de produção (branch, migração só aditiva, dados do Enzo intocáveis) no `CLAUDE.md`.

## Fase 10: escopo final

Pedido do Enzo em 28/10/2026; substitui a lista do `docs/PLANO-FASE-10.md` (o deploy saiu do escopo, o README só
documenta). Um commit por bloco, na branch `fase-10`:
1. Segurança e privacidade (cabeçalhos, CSP, noindex, robots, conferência de RLS, segredos e logs).
2. Robustez (404, `error.tsx`, estados vazios e de carregamento, avisos do build).
3. Backup ("Exportar meus dados": .zip com um CSV por tabela e um JSON completo).
4. Foto por variação.
5. Revisão de UX (1280 e 390).
6. Performance (imagens, JS da página pública; Lighthouse medido pelo Enzo no preview).
7. README completo.

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
Venda direta = verde da marca (`--chart-1`), Shopee = laranja (`--chart-2`), TikTok = violeta (`--chart-3`), outro canal = magenta
(`--chart-4`), neutro = cinza (`--chart-5`). Valores refeitos na Fase 9 (o azul antigo e o violeta reprovavam no
teste de daltonismo) e aprovados no validador da skill `dataviz` nos temas claro e escuro.
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
- **Aviso do topo em `/produtos`** conta produtos ativos com margem ruim, com preço em canal sem taxas e com
  alguma variação sem ficha ou sem custo de filamento (`missingCost`, mesmo que outra variação esteja pior).
  Variações inativas ficam fora da conta.
- **Foto do produto**: reduzida no navegador para WebP de até 1600 px e enviada para
  `product-images/<usuário>/produtos/`. A foto antiga sai ao salvar; uma trocada antes de salvar sai na hora.
  Exibida com `next/image` (host do Supabase liberado no `next.config.ts`).
- **"Salvar como produto"** na calculadora usa a versão salva da ficha: cria produto novo (primeira variação)
  ou acrescenta variação a um produto existente. Preços se definem na página do produto.
- **`save_product`** grava produto, variações e preços numa transação. Variações são atualizadas no lugar
  (orçamentos e pedidos apontam para elas); só as removidas da lista são apagadas.

### Orçamentos e clientes (Fase 7)
- **Preço padrão de item do catálogo**: preço da variação no canal "Venda direta"; vazio → sugerido desse canal.
- **Aprovado ou recusado fica travado** para edição; "Duplicar" cria um rascunho novo. Enviado pode ser editado
  (mesmo link; a página mostra "atualizado em").
- **Aprovação com versão**: cada edição do conteúdo incrementa `quotes.revision`. A página pública envia a
  revisão que carregou; se mudou, `approve_public_quote` recusa com `quote_outdated` e a página pede para
  recarregar.
- **A página pública não muda nada ao ser aberta** (o WhatsApp abre o link para gerar a prévia). Aprovar só por
  clique no botão (Server Action/RPC), nunca em GET.
- **"Converter em pedido"** fica para a Fase 8. Até lá, o cliente mostra "Total em orçamentos aprovados".
- **Sem "Recusar" na página pública**: só o dono recusa, pelo painel.
- **Pix**: além de copiar a chave, Pix copia e cola estático com valor (BR Code/EMV com CRC16) e QR Code,
  também no PDF. Valor = sinal (`quotes.deposit_pct`) se houver, senão o total. O tipo da chave fica nas
  Configurações (`settings.pix_key_type`): 11 dígitos podem ser CPF ou telefone, e telefone vai como `+55…`.
- **Pix testado pelo Enzo com o app do banco** (27/10/2026): QR da página, copia e cola e QR do PDF aceitos,
  valor do sinal certo, titular correto. Testes automáticos reproduzem o exemplo oficial do manual do BCB.
- **PDF** em Helvetica (embutida nos leitores), testado com acentos; sem símbolos fora dela (→, …, emoji):
  `pdfText` (`lib/pdf-text.ts`) troca ou remove. Separação de sílabas desligada (o react-pdf inseria "-" ao
  quebrar palavras, inclusive no Pix copia e cola); o código Pix sai em linhas de tamanho fixo.
- **Custo do item do orçamento** é calculado no servidor ao salvar (ficha da variação ou a ficha escolhida),
  com a mesma regra da calculadora. Fica guardado em `quote_items.unit_cost`: é o custo da época do orçamento.
  O lucro do painel usa as taxas do canal "Venda direta" e o imposto; o frete só passa pelo caixa.
- **Um formato só para o cliente** (`lib/quote-document.ts`): página pública, PDF e prévia do link partem dele.
  O painel monta o mesmo formato das tabelas (inclusive rascunho).

### Pedidos (Fase 8)
- **Número** `PED-AAAA-0001`. Um orçamento aprovado vira no máximo um pedido, que começa em "Aguardando pagamento".
- **Pagamento em partes** (`order_payments`): com sinal no orçamento, dois pagamentos (sinal e restante); sem sinal,
  um só (total). Cada um tem valor, data (hoje por padrão, editável) e forma (Pix, dinheiro, cartão).
  Selos: "Aguardando sinal" / "Aguardando pagamento", "Sinal pago", "Pago". Cada pagamento vira receita na Fase 9,
  com a data real. Aviso (não bloqueio) ao mover para "Imprimindo" sem sinal e para "Enviado"/"Entregue" sem o restante.
- **Pedido manual Shopee/TikTok** começa em "Na fila", já pago pela plataforma (selo "Pago na plataforma"), sem
  sinal/restante. Taxas do canal guardadas no pedido com os valores da venda.
- **Baixa de filamento** ao entrar em "Imprimindo" (ou direto em "Pronto"): confirma carretel e gramas reais por
  linha. "Mover sem baixar" marca o pedido como sem baixa. Baixa dupla é recusada no banco (`consumed_at`).
- **Cancelar** pergunta "As peças chegaram a ser impressas?": só devolve o filamento ao carretel se não. Perdas por
  falha nunca voltam.
- **Fila de impressão**: soma os tempos de "Na fila" e "Imprimindo"; em "Imprimindo" desconta o tempo desde a entrada
  na coluna (`status_changed_at`), sem ficar negativo.
- **Custo e tempo dos itens** vêm da ficha no banco ao criar o pedido (orçamento: o custo guardado nele; sem ele, o de
  hoje). O custo da falha (filamento + máquina por hora da impressora padrão) é calculado no servidor.
- **Falha real** na página de pedidos: custo das falhas ÷ custo de produção dos pedidos dos últimos 90 dias, ao lado da
  margem de falha das Configurações (destaque quando passa dela).
- **Arrastar sem divergência de hidratação**: o `DndContext` tem `id` fixo (o dnd-kit gera ids diferentes no servidor e
  no navegador). `@dnd-kit/utilities` é dependência direta porque é importada.
- **Quadro no desktop** (ajustes de 27/10/2026): a partir de 1280px as 7 colunas dividem a largura da tela em partes
  iguais, sem rolagem (a página de pedidos usa a tela toda: `data-page-wide` libera o `max-w-6xl` do layout). Entre
  768 e 1280px continua rolando, com rolagem automática mais rápida ao arrastar perto da borda. Cards compactos:
  número, cliente, selo de pagamento, prazo, total, "Avançar →" (próxima etapa, com os mesmos avisos e a baixa) e
  "Mover para…".
- **Quadro sem rolagem a partir de 1024px** (ajuste de 27/10/2026): o card se adapta à largura da coluna (container
  query): em coluna estreita o "Avançar" vira só a seta (com rótulo para leitor de tela) e o número quebra nos hífens,
  nunca é cortado. Abaixo de 1024px (tablet) o quadro rola; no celular, abas.
- **"Mover para…" e arrastar não disputam o mouse**: botões e itens de menu não iniciam arraste (sensores próprios do
  dnd-kit); o número do pedido pode ser usado para segurar o card. O menu do card não prende o foco (`modal={false}`),
  para a confirmação de baixa aberta por ele não ser fechada. Teste dedicado: `e2e-menu` (cada tipo de destino, com o
  mouse, conferindo banco e tela).
- **O quadro não é recriado ao mover** (a `key` que o recriava fazia a rolagem voltar ao começo): só as colunas são
  atualizadas. Baixa cancelada ou erro devolvem o card à coluna real. Arrastar pelo teclado só com o foco no card,
  para Enter/Espaço continuarem funcionando nos botões.
- **Prazo** em dias úteis (seg–sex, sem feriados). **Arrastar** com `@dnd-kit` no desktop; no celular, abas por
  coluna e "Mover para…".

### Financeiro e dashboard (Fase 9)
- **As 5 decisões do plano** (`docs/PLANO-FASE-9.md`) valem como escritas: receitas e carretéis montados na hora (sem
  cópia em `transactions`, que guarda só lançamentos manuais); fluxo de caixa x DRE; pedido entra no DRE no mês em que
  ficou totalmente pago (plataforma: mês de criação); cancelado depois de pago segue como receita até um "Estorno"
  manual; custo dos produtos inclui a hora de trabalho.
- **Mão de obra guardada no item** (`order_items.unit_labor_cost`): hora de trabalho do custo por peça, com o mesmo
  acréscimo da margem de falha. Gravada ao criar o pedido (pela ficha de hoje, também nos pedidos de orçamento) e
  preenchida pela migração nos pedidos antigos. É o que o "Lucro líquido sem a sua hora" soma de volta.
- **Imposto no DRE sem contar duas vezes:** com alíquota nas Configurações, o imposto é estimado por ela e os
  lançamentos "Impostos" ficam só no caixa; sem alíquota, a linha do imposto é a soma desses lançamentos.
- **Frete no DRE:** linha "Frete repassado" (o frete cobrado nos pedidos sai, como no lucro do pedido da Fase 8).
  A categoria manual "Frete" é para fretes fora dos pedidos (a dica do formulário avisa).
- **Falhas** entram no DRE pelo mês em que aconteceram. **Cancelado sem peças impressas** (sem baixa) não tem custo de
  produção no DRE.
- **Ponto de equilíbrio:** despesas fixas do mês; se o mês ainda não tem nenhuma, usa as do mês anterior (avisado na
  tela). Margem de contribuição = (receita − taxas − imposto − frete − custo dos produtos) ÷ receita dos pedidos pagos
  nos últimos 90 dias. Margem ≤ 0 ou sem pedidos: não calcula e explica.
- **KPIs:** "Custos" = tudo o que separa faturamento + outras receitas do lucro líquido; margem e aprovação comparam em
  pontos percentuais; aprovação = aprovados ÷ orçamentos enviados no mês; horas de impressora = tempo dos pedidos
  baixados no mês + tempo perdido em falhas; "Pedidos em andamento" e "Orçamentos pendentes" são do momento (sem
  comparação). Top 5 produtos: pedidos pagos no mês, taxas e imposto rateados pelo valor do item, frete fora; item sem
  custo fica de fora.
- **Gráficos:** só o de 12 meses usa Recharts (faturamento em cinza, lucro em verde, prejuízo em vermelho, tooltip e
  tabela para leitor de tela). Canais, produtos e filamento são barras em HTML com rótulo e valor escritos; no
  filamento a cor real vai numa bolinha e a barra fica neutra.
- **CSV** com BOM, ";" e vírgula decimal, valor líquido negativo nas despesas (soma direto no Excel).
- **Lançamento manual** só no Financeiro; pagamentos e carretéis se corrigem na origem. Checks no banco: categoria
  conforme o tipo, valor > 0, só despesa pode ser fixa.
- **Resumo de margem dos produtos** saiu da página para `loadProductSummaries` (`lib/product-loaders.ts`), usado por
  `/produtos` e pelos alertas do dashboard.
- **Cancelar pedido** (ajuste de 28/10/2026): perguntas de escolha única. "As peças chegaram a ser impressas?" só
  aparece quando houve baixa (sem baixa a resposta não muda nada). "Houve pagamento: devolver ao cliente?" só aparece com
  pagamento; "Sim" lança na mesma transação (`cancel_order(..., p_refund)`) uma despesa "Estorno" de hoje ligada ao
  pedido (`transactions.order_id`, com link no Financeiro). O valor é calculado no servidor (`refundAmount`): o que o
  cliente pagou; pedido de plataforma, total − taxas (o que entrou no caixa).
- **Excluir pedido** (para pedidos de teste ou lançados por engano; pedido real que não vai acontecer é "Cancelar"):
  `delete_order` apaga pedido, itens, pagamentos, falhas e estornos, devolve ao carretel a baixa e as perdas por falha e
  libera o orçamento de origem. Confirmação digitando o número, conferida também no banco (`order_number_mismatch`).
- **Testes de banco** em `tests/db` (`npm run test:db`, fora do `npm test`): rodam no Supabase de verdade com o
  usuário de teste, criam os próprios dados e apagam tudo no fim. O `.env.local` é lido direto (o `loadEnvConfig` do
  Next ignora esse arquivo com `NODE_ENV=test`).
- **Cursor global** em `app/globals.css`, fora das camadas (vence os utilitários dos componentes): pointer em botões,
  links, menus, abas, selects, radios e checkboxes; not-allowed em desabilitados; grab nos cards do quadro. A lista de
  pointer fica em `:where()` (especificidade zero) para as regras de desabilitado e de arrastar vencerem.
- **Migrações:** o `supabase db push` é bloqueado no modo automático do Claude Code; o Enzo aplica pelo terminal
  (`npm run db:push`) e depois o Claude regenera os tipos.

## Pendências

- [ ] **Conferir o financeiro com pedidos reais.** A conta de teste não tinha pedidos pagos na conferência da
  Fase 9: DRE, gráficos, top 5 e "A receber" com pedidos foram cobertos só pelos testes unitários. Conferir com o
  primeiro mês de vendas (sinal e restante em meses diferentes, um pedido Shopee, uma falha).
- [ ] **Lighthouse da página pública** (meta > 90): medir na Vercel, na Fase 10.

- [ ] **`.3mf` fatiado real.** O único `.3mf` real testado era um projeto **sem fatiar** (sem tempo nem gramas).
  Fatiar uma mesa multicor, exportar com *Arquivo → Exportar → Exportar arquivo de mesa fatiada*
  (`.gcode.3mf`) e comparar a soma dos filamentos com o total do Bambu Studio (modelo + purga + torre)
  e com a pesagem real. Se não bater, a importação precisa preencher a purga com a diferença.
- [x] **Impressora A1 x A1 mini:** o Enzo confirmou em 28/10/2026 que é a **A1** (o seed já cadastra a A1). O `.3mf`
  de A1 mini recebido era só um arquivo de modelo.
- [ ] **Foto por variação.** O banco já tem `product_variants.image_path`, mas a tela só tem a foto do produto.
  Acrescentar o envio por variação (mesmo fluxo da foto do produto) e usar no orçamento quando houver.
