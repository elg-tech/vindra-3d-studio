# 🚀 PROMPT MESTRE — Sistema de Gestão Vindra 3D

> Cole este prompt inteiro no Claude Code (VS Code). Ou salve este arquivo na pasta do projeto e diga: **"Leia o PROMPT_VINDRA_3D.md e execute tudo, fase por fase."**

---

## 0. Quem você é e como vai trabalhar

Você é um engenheiro full-stack sênior e designer de produto. Vai construir do zero o **Vindra 3D Studio**, o sistema de gestão da minha loja de impressão 3D **Vindra 3D**. Eu vendo na Shopee, no TikTok Shop e direto (WhatsApp/Instagram). Tenho uma **Bambu Lab A1**, uso principalmente **PLA (~R$100/kg)** e faço produtos como suportes de controle (Xbox/PS5), chaveiros articulados e peças personalizadas sob encomenda.

O sistema precisa ser **de nível profissional**: bonito, rápido, mobile-first (vou usar muito no celular) e, acima de tudo, **exato no cálculo de custo**, pra eu nunca mais cobrar errado.

### Regras de trabalho (obrigatórias)
1. **Trabalhe em fases** (seção 9). No fim de cada fase: rode `npm run lint`, `npm run typecheck` e `npm run build`. Só faça commit se tudo passar.
2. **Commits pequenos e semânticos em português** (`feat: calculadora de custo`, `fix: arredondamento de preço`), com push depois de cada fase.
3. **Nunca commite segredos.** `.env.local` vai pro `.gitignore`; crie um `.env.example` documentado.
4. Antes de qualquer ação destrutiva (apagar arquivos, forçar push, resetar banco), **pergunte**.
5. Quando precisar de algo que só eu posso fazer (criar conta, colar chave), **pare e me dê o passo a passo exato**, com links e prints mentais de onde clicar.
6. Todo texto da interface em **português do Brasil**. Moeda `R$ 1.234,56` via `Intl.NumberFormat('pt-BR')`, datas `dd/MM/yyyy`, fuso `America/Sao_Paulo`.
7. Código limpo, tipado, sem `any`. Lógica de cálculo isolada em funções puras com **testes unitários** (Vitest).

---

## 1. Setup do projeto

- Crie a pasta: `C:\Projetos\vindra-3d-studio` (crie `C:\Projetos` se não existir).
- Inicialize o projeto nela.
- Repositório GitHub **privado**: `elg-tech/vindra-3d-studio`, criado via `gh repo create elg-tech/vindra-3d-studio --private --source=. --remote=origin`. Verifique antes com `gh auth status`; se não estiver logado, me avise.
- Branch principal: `main`.
- Git configurado com: nome `Enzo`, e-mail `elgsolucoestecnologicas@gmail.com` (só no escopo do repositório, `git config --local`).

---

## 2. Stack (não troque sem me perguntar)

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js (App Router, versão estável mais recente) + TypeScript** |
| UI | **Tailwind CSS + shadcn/ui + lucide-react** |
| Banco + Auth + Storage | **Supabase** (Postgres, Auth por e-mail, Storage para imagens e arquivos) |
| Acesso ao banco | `@supabase/ssr` + tipos gerados (`supabase gen types`) |
| Formulários | `react-hook-form` + `zod` |
| Gráficos | `recharts` |
| PDF de orçamento | `@react-pdf/renderer` |
| Leitura de .3mf | `jszip` (pra extrair metadados do Bambu Studio) |
| Datas | `date-fns` com locale `ptBR` |
| Testes | `vitest` |
| Deploy | **Vercel** |

Fixe versões no `package.json` (sem `latest`).

---

## 3. Identidade visual

- O logo está (ou vou colocar) em `public/logo.png` (ou `.svg`). **Se o arquivo existir, analise-o e extraia a paleta de cores principal** e use como tokens de tema. Se não existir, me peça antes da fase de UI e use temporariamente um tema neutro elegante (grafite + um acento vibrante).
- Defina as cores como CSS variables no `:root` com **modo claro e escuro** (dark mode por padrão, combina com 3D/tech).
- Estilo: moderno, limpo, cards com bordas suaves, micro-animações sutis, tipografia forte (ex.: `Inter` ou `Geist`), números grandes nos KPIs.
- Favicon e ícone PWA a partir do logo.
- **PWA instalável** (manifest + ícones) pra eu "instalar" no celular como app.

---

## 4. Módulos do sistema

### 4.1 🔐 Login
- Supabase Auth com e-mail e senha. Sistema de **um dono só** (eu), mas modelado com `owner_id` em todas as tabelas para permitir multiusuário no futuro.
- Tudo protegido por middleware, exceto a página pública de orçamento (4.7).

### 4.2 📊 Dashboard
KPIs do mês (com comparação ao mês anterior): faturamento, custo, **lucro líquido**, margem média, pedidos em andamento, orçamentos pendentes, taxa de aprovação de orçamentos, **gramas de filamento consumidas**, horas de impressora usadas.
Gráficos: faturamento x lucro por mês, vendas por canal (Shopee/TikTok/Direto), top 5 produtos por lucro, consumo de filamento por material/cor.
Alertas: carretel abaixo do estoque mínimo, pedidos com prazo vencendo, orçamentos expirando.

### 4.3 🧵 Filamentos (o coração do sistema)
Cadastro de carretéis:
- Marca, material (PLA, PLA Silk, PLA Matte, PETG, TPU, ABS, ASA, outro), cor (nome + hex com bolinha de cor), diâmetro.
- **Preço pago**, peso líquido (g), **frete rateado**, data de compra, fornecedor.
- **Custo por grama calculado** = (preço + frete) ÷ peso líquido.
- **Peso restante** (atualizado automaticamente quando um pedido é marcado como impresso), com barra de progresso visual.
- Estoque mínimo (alerta) e status: lacrado / em uso / acabou.
- Botão "Pesar carretel": eu digito o peso na balança, o sistema desconta o peso do carretel vazio (configurável por marca) e corrige o restante.
- Histórico de movimentações (entrada, consumo por pedido, ajuste, falha de impressão).
- Visão de custo médio por material (média ponderada dos carretéis).

### 4.4 🖨️ Impressoras e Configurações de Custo
Impressora (começar com **Bambu Lab A1**, permitir outras):
- Valor pago, vida útil estimada em horas (para **depreciação/hora**), consumo médio em watts (campo editável; sugerir medir com tomada medidora), custo de manutenção por hora (bico, mesa, correias).

Configurações globais (tela de Configurações):
- Tarifa de energia (R$/kWh) — campo editável, eu coloco o valor da minha conta.
- Valor da minha hora de trabalho (R$/h).
- Margem de falha (%) — padrão 10%.
- Markup/margem de lucro padrão (%).
- Imposto (%) — padrão 0 (vendo como CPF por enquanto; deixar pronto pra quando virar CNPJ/MEI).
- **Taxas por canal**, todas editáveis (NÃO cravar valores fixos no código, as taxas mudam): Shopee (comissão %, taxa fixa por item R$, frete grátis/programa %), TikTok Shop (comissão %, taxa fixa), Venda direta (taxa da maquininha/Pix %). Mostre um aviso: "confira as taxas atuais no painel do vendedor".
- Regra de arredondamento de preço: terminar em ,90 / ,99 / inteiro.
- Dados da loja para os orçamentos: nome, WhatsApp, Instagram, e-mail, cidade (Matão/SP), chave Pix, texto de condições padrão, validade padrão do orçamento (dias).

### 4.5 🧮 Calculadora de Custo (precisa ser perfeita)
Entrada por peça:
- **Filamentos usados** (multi-cor, pois a A1 pode ter AMS Lite): lista de {carretel ou material, gramas}. Incluir campo **"desperdício/purga (g)"** separado.
- Tempo de impressão (h:min).
- Tempo de preparação/fatiamento + pós-processamento (lixar, montar, pintar) em minutos.
- Embalagem (R$), insumos extras (argola, ímã, parafuso, cola, tinta) com quantidade e custo unitário. Criar cadastro de **insumos** reutilizáveis.
- Quantidade de peças e **peças por mesa** (se imprimo 4 de uma vez, o tempo e a energia se dividem).

Fórmula (implemente em `lib/pricing.ts`, pura e testada):
```
custoFilamento  = Σ(gramas × custoPorGrama) + purga × custoPorGrama
custoEnergia    = (watts / 1000) × horasImpressão × tarifaKwh
depreciação     = (valorImpressora / vidaÚtilHoras) × horasImpressão
manutenção      = custoManutençãoHora × horasImpressão
maoDeObra       = (minPreparo + minPós) / 60 × valorHora
insumos         = embalagem + Σ(extras)
subtotal        = soma de tudo acima
custoComFalha   = subtotal × (1 + margemFalha)
custoUnitário   = custoComFalha / quantidade

preçoSugerido(canal) = (custoUnitário + taxaFixaCanal) / (1 − comissão% − imposto% − margemDesejada%)
```
- Validar que o denominador fique > 0 (senão mostrar erro: "margem + taxas passam de 100%").
- Mostrar **breakdown visual** (gráfico de rosca + tabela): quanto é filamento, energia, máquina, mão de obra, insumos.
- Mostrar **lado a lado** o preço sugerido para Shopee, TikTok e Venda direta, com **lucro líquido real** em R$ e % de cada um.
- Modo inverso: "Quero vender por R$ X na Shopee, qual meu lucro?"
- Botões: "Salvar como produto", "Adicionar a um orçamento".

**🔥 Recurso matador — importar do Bambu Studio:** upload de arquivo `.3mf` fatiado (ou `.gcode.3mf`). Use `jszip` para abrir e ler `Metadata/slice_info.config` (e/ou cabeçalho do gcode), extraindo **tempo de impressão, gramas por filamento, tipo e cor de cada filamento** e preenchendo a calculadora automaticamente. Escreva testes com um arquivo de exemplo. Se o arquivo não tiver os metadados (não foi fatiado), mostrar mensagem clara pedindo para exportar "plate fatiado". O preenchimento manual sempre continua disponível.

### 4.6 📦 Catálogo de Produtos
- Produtos com foto (Supabase Storage), nome, SKU, descrição, **variações** (ex.: tamanho P/M/G ou Xbox/PS5), cada variação com sua própria ficha de custo (da calculadora).
- Preço de venda atual por canal e **lucro real** com aquele preço (alerta vermelho se o lucro estiver abaixo da margem mínima).
- Campo de origem/licença do modelo 3D (autoral, MakerWorld CC0, comprado etc.) e link.
- Quando eu mudar o preço do filamento ou uma taxa, **recalcular tudo** e mostrar quais produtos ficaram com margem ruim.

### 4.7 💸 Orçamentos (pra eu "passar bonito")
- Criar orçamento: cliente (cadastrado ou rápido: nome + WhatsApp), itens (do catálogo ou personalizados vindos da calculadora), quantidade, desconto (R$ ou %), frete, prazo de produção, validade, observações, condições de pagamento (Pix, sinal de 50% etc.).
- Numeração automática: `VND-2026-0001`.
- Status: rascunho → enviado → aprovado / recusado / expirado.
- **Página pública lindona** em `/o/[token]` (token aleatório, não adivinhável): logo, dados do orçamento, fotos dos itens, total, validade com contagem regressiva, chave Pix com botão copiar, e botões **"Aprovar orçamento"** e **"Falar no WhatsApp"**. Quando o cliente aprova, o status muda e aparece no dashboard. Mobile-first, carregamento rápido, com Open Graph (imagem de preview bonita quando eu colar o link no WhatsApp).
- **PDF profissional** do orçamento com a identidade da Vindra 3D (logo, cores, tabela de itens, totais, condições, contato).
- Botão **"Enviar no WhatsApp"**: abre `https://wa.me/55...` com mensagem pronta e o link público.
- O cliente **nunca** vê o custo, só o preço.
- Botão "Converter em pedido".

### 4.8 🛠️ Pedidos / Produção
- Pedido vindo de orçamento, ou manual (venda Shopee/TikTok: canal + número do pedido da plataforma).
- **Kanban arrastável**: Aguardando pagamento → Na fila → Imprimindo → Pós-processamento → Pronto → Enviado → Entregue.
- Prazo com destaque de atraso, código de rastreio, observações.
- Ao mover para "Imprimindo" ou "Pronto", confirmar **quais carretéis foram usados** e descontar as gramas do estoque automaticamente (com possibilidade de ajustar o real).
- Registrar **falha de impressão** (gramas perdidas + tempo), que entra como custo do pedido e alimenta a estatística real de falha.
- Fila de impressão: estimativa de quando a impressora fica livre somando os tempos.

### 4.9 👥 Clientes
Nome, WhatsApp, Instagram, e-mail, cidade, observações, histórico de orçamentos/pedidos, total gasto. Busca rápida.

### 4.10 💰 Financeiro
- Lançamentos de **receita** (automáticos a partir de pedidos pagos, já com as taxas do canal descontadas) e **despesas** (filamento comprado vira despesa automaticamente, mais outras: peças, ferramentas, embalagens, anúncios, software como assinaturas).
- Categorias, filtro por mês, DRE simples: faturamento bruto → taxas → custo dos produtos → lucro bruto → despesas → **lucro líquido**.
- Exportar CSV.
- Ponto de equilíbrio: "quanto preciso vender para pagar as despesas fixas do mês".

---

## 5. Banco de dados (Supabase)

- Crie as migrações SQL em `supabase/migrations/` (versionadas no repositório). Tabelas sugeridas: `settings`, `printers`, `sales_channels`, `filaments`, `filament_movements`, `supplies`, `products`, `product_variants`, `cost_sheets`, `cost_sheet_filaments`, `customers`, `quotes`, `quote_items`, `orders`, `order_items`, `print_failures`, `transactions`.
- Valores monetários em `numeric(12,2)` (ou inteiros em centavos — escolha um e seja consistente). Gramas em `numeric(10,2)`.
- `created_at`, `updated_at` (trigger) e `owner_id uuid references auth.users` em tudo.
- **Row Level Security ATIVADA em todas as tabelas**, com políticas `owner_id = auth.uid()`.
- A página pública do orçamento acessa os dados **somente pelo servidor** (Server Component com a service role key, que fica APENAS em variável de ambiente do servidor) ou por função `security definer` que retorna só os campos públicos do orçamento pelo token. Nunca expor custo.
- Bucket de Storage `product-images` (leitura pública) e `files` (privado, para .3mf).
- Seed opcional com: impressora Bambu Lab A1, um carretel PLA de 1kg a R$100, canais Shopee/TikTok/Direto com taxas em branco para eu preencher.
- Gere os tipos TypeScript a partir do schema.

---

## 6. Qualidade

- Testes Vitest para `lib/pricing.ts` (casos: peça simples, multi-cor, várias por mesa, margem impossível, arredondamento) e para o parser de `.3mf`.
- Estados de carregamento (skeletons), estados vazios bonitos com chamada para ação, toasts de sucesso/erro.
- Validação com zod no cliente e no servidor (Server Actions).
- Acessível (labels, contraste, navegação por teclado).
- Responsivo de verdade: sidebar no desktop, barra inferior de navegação no celular.
- Lighthouse > 90 na página pública do orçamento.

---

## 7. Estrutura de pastas sugerida
```
app/
  (auth)/login
  (app)/dashboard, filamentos, calculadora, produtos, orcamentos, pedidos, clientes, financeiro, configuracoes
  o/[token]            ← página pública do orçamento
  api/quote-pdf/[id]   ← geração de PDF
components/ (ui do shadcn + componentes do domínio)
lib/ pricing.ts, bambu3mf.ts, format.ts, supabase/
supabase/migrations/
tests/
```

---

## 8. Deploy e documentação

- `README.md` caprichado em português: o que é, prints, como rodar local, variáveis de ambiente, como aplicar as migrações e **passo a passo para deploy na Vercel** (importar repo do GitHub, colar variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`) e configurar no Supabase a URL de redirect do Auth com o domínio da Vercel.
- Garantir que o `npm run build` passe sem erros (é o que a Vercel roda).

---

## 9. Ordem de execução (uma fase por vez, commit + push no fim de cada)

1. **Fundação:** pasta, Next.js, Tailwind, shadcn, lint, Vitest, repo privado no GitHub, primeiro push.
2. **Supabase:** me guie a criar o projeto e pegar as chaves; migrações, RLS, seed, tipos, login funcionando.
3. **Layout e tema:** identidade a partir do logo, sidebar/bottom nav, dark mode, PWA.
4. **Configurações + Impressoras + Filamentos + Insumos.**
5. **Calculadora de custo** (com testes) + **importação .3mf do Bambu Studio**.
6. **Produtos e variações.**
7. **Clientes + Orçamentos + página pública + PDF + WhatsApp.**
8. **Pedidos (kanban) + baixa automática de filamento + falhas.**
9. **Financeiro + Dashboard com gráficos e alertas.**
10. **Polimento:** revisão de UX no celular, performance, README, checklist de deploy na Vercel.

Comece agora pela **Fase 1**. Antes de escrever código, me mostre em poucas linhas o plano da fase e confirme a pasta e o nome do repositório. Bora fazer o sistema mais insano de impressão 3D do Brasil. 🔥
