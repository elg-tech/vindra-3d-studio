# Plano da Fase 9: financeiro e dashboard

Aprovado pelo Enzo em 27/10/2026, com as 5 decisões abaixo e dois acréscimos (DRE com duas linhas de lucro e KPI
"A receber"). Implementação ainda não começou.

## Ponto de partida

O que já existe e esta fase usa:

- `order_payments`: sinal, restante ou pagamento único, com valor, data real (`paid_on`) e forma (Fase 8).
- `orders`: total, taxas do canal guardadas na venda (`channel_fees`), `paid_by_platform`, `paid_at`, status.
- `order_items`: custo por peça (`unit_cost`) e tempo de impressão.
- `filaments`: preço pago, frete, data de compra (`purchased_at`).
- `print_failures`: custo de cada falha.
- `filament_movements`: baixas (`consumption`) e perdas (`failure`).
- `transactions`: existe desde a Fase 2, vazia e sem uso no código.
- `recharts` já instalado.

## Decisões

1. **Receitas e compras de carretel calculadas na hora, sem cópia.** Montadas a partir dos pagamentos e dos carretéis,
   não copiadas para `transactions`. Desfazer um pagamento ou corrigir o preço de um carretel reflete na hora, sem
   risco de divergência. `transactions` fica só com os lançamentos manuais. Lançamento automático não é editado no
   Financeiro, e sim na origem (pagamento do pedido, carretel).
2. **Duas visões, para não contar o filamento duas vezes.**
   - **Fluxo de caixa:** dinheiro que entrou e saiu de verdade, incluindo as compras de carretel.
   - **DRE:** receita − taxas − imposto − custo dos produtos − falhas − despesas manuais. Compras de carretel ficam
     fora, porque o filamento já está no custo dos produtos (custo das fichas).
3. **Mês do pedido no DRE:** o mês em que ficou totalmente pago. Pedidos de plataforma: o mês em que foram criados.
   Receita e custo de um pedido caem sempre no mesmo mês.
4. **Pedido cancelado depois de pago:** o dinheiro continua como receita até ser lançado um estorno manual, na
   categoria "Estorno".
5. **Custo dos produtos inclui a hora de trabalho do Enzo** (preparo e pós), como nas fichas.

Acréscimos:

- **(a) DRE com duas linhas de lucro:** "Lucro líquido" (descontando a hora de trabalho) e "Lucro líquido sem a sua
  hora" (somando de volta a mão de obra que está no custo dos produtos).
- **(b) KPI "A receber":** soma dos restantes ainda não pagos de pedidos com sinal pago (pedidos não cancelados).

## O que será feito

### 1. Lançamentos do Financeiro (`/financeiro`)

- **Receitas automáticas, uma por pagamento recebido:**
  - sinal, restante ou pagamento único, na data em que foi pago;
  - pedidos de plataforma, pelo total, na data do pedido;
  - cada receita com as taxas do canal descontadas; com sinal e restante, a taxa é dividida entre os dois na
    proporção do valor.
- **Despesas automáticas:** cada carretel comprado (preço + frete), na data da compra (ou do cadastro, sem data).
- **Lançamentos manuais** em `transactions`:
  - despesas: peças e manutenção, ferramentas, embalagens, anúncios, software e assinaturas, frete, impostos,
    estorno, outros;
  - outras receitas;
  - despesa pode ser marcada como **fixa mensal** (`is_fixed`), que alimenta o ponto de equilíbrio.
- **Tela:** filtro por mês; lista com a origem (pedido, carretel ou manual, com link); totais do mês;
  **Exportar CSV** separado por ";" e com vírgula decimal (abre direto no Excel em português).

### 2. DRE simples do mês

Faturamento bruto → taxas → imposto → custo dos produtos → falhas → lucro bruto → despesas manuais →
**lucro líquido** e **lucro líquido sem a sua hora** (decisões 2, 3, 5 e acréscimo a).

### 3. Ponto de equilíbrio

Despesas fixas do mês ÷ margem de contribuição média dos pedidos dos últimos 90 dias = faturamento necessário no mês
para pagar as despesas fixas, com uma barra do quanto já foi faturado.

### 4. Dashboard (`/dashboard`)

- **KPIs do mês, comparados com o mês anterior:** faturamento, custo, lucro líquido, margem média, pedidos em
  andamento, orçamentos pendentes, taxa de aprovação de orçamentos, gramas de filamento consumidos (baixas e falhas),
  horas de impressora e **A receber** (acréscimo b).
- **Gráficos:** faturamento x lucro dos últimos 12 meses; vendas por canal; top 5 produtos por lucro; consumo de
  filamento por material e cor.
- **Alertas, cada um com link:** carretel abaixo do estoque mínimo; pedidos atrasados ou que vencem hoje ou amanhã;
  orçamentos que expiram em até 2 dias; orçamentos aprovados ainda não convertidos em pedido; produtos com margem
  ruim ou taxas não configuradas (Fase 6).
- **Cores:** antes dos gráficos, resolver a pendência da paleta de canais (azul e violeta lado a lado reprovam no
  teste de daltonismo), mantendo vermelho e âmbar fora das séries. Carregar a skill `dataviz` antes de escrever os
  gráficos.

### 5. Testes e conferência no fim da fase

- Unitários: rateio das taxas entre sinal e restante; DRE com as duas linhas de lucro; ponto de equilíbrio; KPIs com
  comparação e "A receber"; CSV com acentos e vírgula decimal; datas no fuso de São Paulo (pagamento de 31/10 às 23h
  fica em outubro).
- Banco: os lançamentos só aparecem para o dono (RLS); pagamento desfeito some da receita.
- Playwright em 1280px e 390px: lançar uma despesa, conferir o DRE e o CSV, ver o dashboard com dados de teste.
- Fim da fase: lint, typecheck, testes (rodar de `C:\dev\vindra`) e build; atualizar `docs/PROGRESSO.md`.
