# Vindra 3D Studio

Sistema de gestão da **Vindra 3D** (impressão 3D): custo real de cada peça, filamentos e insumos, catálogo de
produtos, clientes, orçamentos com link para o cliente (PDF, Pix e WhatsApp), pedidos em quadro kanban, financeiro e
dashboard. Feito para usar no celular (PWA instalável) e no computador.

- **Produção:** <https://vindra-3d-studio.vercel.app> (Vercel, região `gru1`, São Paulo)
- **Banco e login:** Supabase (Postgres com RLS, Auth e Storage)
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui, Zod, Vitest

| Módulo | O que faz |
|---|---|
| Calculadora | Custo por peça (filamento, energia, depreciação, mão de obra, insumos, falhas), preço por canal, importação de `.3mf` do Bambu Studio |
| Filamentos e insumos | Carretéis com saldo em gramas, pesagem, movimentações, estoque mínimo |
| Produtos | Variações com ficha de custo e foto própria, preço e margem por canal (Venda direta, Shopee, TikTok) |
| Clientes e orçamentos | Orçamento com link público `/o/<token>`, aprovação pelo cliente, PDF, Pix copia e cola com QR, envio pelo WhatsApp |
| Pedidos | Quadro kanban, pagamentos em partes (sinal e restante), baixa de filamento, falhas, cancelamento com estorno |
| Financeiro e dashboard | Fluxo de caixa, DRE do mês, ponto de equilíbrio, CSV para o Excel, KPIs e gráficos |
| Configurações | Custos, taxas dos canais, impressoras, dados da loja e Pix, marcas, **backup** |

A história do projeto (fases, decisões e pendências) está em [`docs/PROGRESSO.md`](docs/PROGRESSO.md).

## Rodar localmente

Requisitos: Node.js 22 e npm.

```bash
npm install
cp .env.example .env.local   # preencha (ver "Variáveis de ambiente")
npm run dev                  # http://localhost:3000
```

O ambiente local aponta para o **mesmo projeto Supabase da produção**: o que você cria logado com a sua conta é dado
real. Para testar, use o usuário de teste (isolado pelo RLS).

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run lint` / `npm run typecheck` | ESLint e TypeScript |
| `npm test` | Testes unitários (Vitest). No Windows, rode de `C:\dev\vindra` com C maiúsculo |
| `npm run test:db` | Testes de banco no Supabase de verdade, com o usuário de teste (criam e apagam os próprios dados) |
| `npm run build` / `npm start` | Build e servidor de produção local |
| `npm run db:push` | Aplica as migrações de `supabase/migrations/` no projeto vinculado |
| `npm run db:types` | Regenera `lib/supabase/database.types.ts` a partir do banco |

## Variáveis de ambiente

| Nome | Onde pegar | Vai para a Vercel? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Sim |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → chave pública (anon/publishable) | Sim |
| `NEXT_PUBLIC_SITE_URL` | Endereço do site, sem barra no fim (local: `http://localhost:3000`) | Sim: `https://vindra-3d-studio.vercel.app` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role | **Não.** O app não usa; ela ignora o RLS |
| `E2E_EMAIL` / `E2E_PASSWORD` | Usuário de teste | **Não.** Só no `.env.local`, para testes |

`lib/env.ts` valida as três `NEXT_PUBLIC_*` ao subir: se faltar alguma, o build falha com a mensagem do Zod.
`NEXT_PUBLIC_SITE_URL` monta o link público do orçamento (WhatsApp, PDF, QR) e a imagem da prévia do link: em produção
precisa ser o domínio final. Na Vercel, marque as variáveis também para **Preview**, senão o preview da branch não sobe.

## Banco de dados e migrações

- Esquema em `supabase/migrations/` (Postgres 17). Todas as tabelas têm RLS: cada dono só lê e altera o que é seu.
- A página pública do orçamento não usa chave secreta: as funções `get_public_quote` e `approve_public_quote`
  (`security definer`, liberadas para `anon`) devolvem só os campos públicos, pelo token.
- Fotos no bucket público `product-images/<id do usuário>/produtos/`.

**Migração nova (produção tem dados reais):**
1. Só migração **aditiva**: criar tabela, coluna, índice ou função. Nada de `DROP` nem `ALTER` que apague ou mude dados.
2. Conferir antes: `npx supabase db push --linked --dry-run` (mostra o que vai rodar, sem aplicar).
3. Aplicar: `npm run db:push`, no seu terminal (o Claude Code não aplica migração).
4. `npm run db:types` e commit dos tipos.

## Deploy (Vercel + Supabase)

Já está configurado. O que existe hoje, para refazer se precisar:

1. **Vercel:** projeto importado do GitHub (`elg-tech/vindra-3d-studio`), preset Next.js, sem mudar Build/Output.
   Variáveis da tabela acima (Production e Preview). **Settings → Functions → Function Region:** `gru1` (São Paulo,
   perto do Supabase).
2. **Supabase Auth → URL Configuration:** Site URL `https://vindra-3d-studio.vercel.app`; Redirect URLs
   `https://vindra-3d-studio.vercel.app/**` e `http://localhost:3000/**`.
3. **Supabase Auth → Sign In / Providers → Email:** cadastro de novos usuários **desligado**.
4. **Domínio próprio (opcional):** Vercel → Settings → Domains; depois trocar `NEXT_PUBLIC_SITE_URL` e as URLs do passo 2.

Segurança já no código: cabeçalhos HTTP e CSP em `next.config.ts`, `noindex` em tudo e `robots.txt` liberando só
`/login` (orçamento de cliente nunca vai para buscador), `Referrer-Policy: no-referrer` em `/o/`.

## Regras de produção

- **Push na `main` = deploy em produção.** Trabalhe numa branch e faça push nela: a Vercel gera um preview com URL
  própria. Merge na `main` só depois de conferir o preview.
- **Migração só aditiva**, com dry-run antes (ver acima).
- **Nunca apague nem altere dados da conta real** em teste. Testes e prints só com o usuário de teste.
- A `SUPABASE_SERVICE_ROLE_KEY` não entra no app nem na Vercel.

## Backup

O plano grátis do Supabase não tem backup para baixar. Faça o seu:

1. **Configurações → Backup → Exportar meus dados.** Baixa `vindra-backup-AAAA-MM-DD.zip` com:
   - `backup.json`: todos os seus dados, como estão no banco (é o arquivo que restaura);
   - `csv/<tabela>.csv`: uma planilha por tabela para o Excel (`;` e vírgula decimal);
   - `LEIA-ME.txt`.
2. Guarde o arquivo **fora do computador** também (Google Drive, e-mail). Sugestão: uma vez por mês e antes de
   mudanças grandes.

As **fotos dos produtos não vão no .zip** (ficam no Storage). Para guardar as fotos, baixe a pasta do bucket
`product-images` em Supabase → Storage.

### Restaurar

A restauração **só acrescenta**: linha que já existe (mesmo id) fica como está. Serve para recuperar o que foi apagado
ou para carregar tudo num projeto novo.

1. Descompacte o .zip e gere o SQL (não conecta no banco, só escreve o arquivo):
   ```bash
   node scripts/restaurar-backup.ts caminho/backup.json > restaurar.sql
   ```
   Restaurando em **outro projeto ou outro usuário** (o id do usuário muda): crie o usuário no Auth, copie o id dele
   e use `--dono=<id>`, que troca o dono de todas as linhas:
   ```bash
   node scripts/restaurar-backup.ts backup.json --dono=00000000-0000-0000-0000-000000000000 > restaurar.sql
   ```
2. Projeto novo: aplique antes as migrações (`npm run db:push` com o projeto novo vinculado).
3. Supabase → **SQL Editor** → cole o conteúdo de `restaurar.sql` → **Run**. Roda numa transação: ou entra tudo ou
   nada. Os gatilhos ficam desligados durante a carga (os números de orçamento e pedido vêm do backup).
   **Não rode sem a linha `set local session_replication_role = replica`:** com os gatilhos ligados, cada carretel
   inserido ganharia uma movimentação de compra a mais e o saldo dos carretéis seria somado de novo. Se o SQL Editor
   recusar essa linha, pare e peça ajuda (dá para carregar tabela a tabela com os gatilhos desligados).
   (A geração do SQL tem testes; a restauração completa ainda não foi ensaiada num projeto de verdade.)
4. Envie as fotos de volta para `product-images/<id do usuário>/produtos/` com os mesmos nomes de arquivo.
5. Abra o app e confira: produtos, orçamentos, pedidos e o financeiro do mês.

## Quando algo der errado

| Sintoma | O que fazer |
|---|---|
| Build falha na Vercel com erro do Zod em `lib/env.ts` | Falta variável `NEXT_PUBLIC_*` naquele ambiente (Production ou Preview) |
| Login volta para a tela de login | Conferir as Redirect URLs do Supabase Auth (passo 2 do deploy) |
| Link do orçamento abre `localhost` | `NEXT_PUBLIC_SITE_URL` errada na Vercel; corrigir e fazer Redeploy |
| Erro de banco depois de um deploy | Migração não aplicada: `npm run db:push` |
| Algo quebrou em produção | Vercel → Deployments → deploy anterior → **Promote to Production** (volta na hora); depois corrigir numa branch |
| `npm test` diz "no tests" no Windows | Rodar de `C:\dev\vindra` (C maiúsculo) |
