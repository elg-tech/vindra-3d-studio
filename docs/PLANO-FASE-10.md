# Plano da Fase 10: polimento e deploy na Vercel

Proposta de 28/10/2026, **aprovada pelo Enzo em 28/10/2026** (as 6 decisões). Implementação ainda não começou:
o Enzo faz o deploy (passo 6) por conta própria e avisa quando terminar.

## Ponto de partida

- Fases 1 a 9 concluídas e no GitHub (`elg-tech/vindra-3d-studio`, `main`).
- O app roda local, apontando para o projeto Supabase que já é o de verdade (as contas do Enzo e de teste estão nele).
- A página pública do orçamento usa funções `security definer`; a `SUPABASE_SERVICE_ROLE_KEY` não é usada pelo app.
- `NEXT_PUBLIC_SITE_URL` monta o link público do orçamento (WhatsApp, PDF, QR): em produção precisa ser o domínio final.
- Pendências abertas (do `PROGRESSO.md`): Lighthouse da página pública, `.3mf` fatiado real, A1 x A1 mini, foto por
  variação, conferir o financeiro com pedidos reais.

## Decisões para aprovar

1. **Um projeto Supabase só.** Produção usa o mesmo projeto de hoje (os dados já estão lá). O desenvolvimento local
   continua apontando para ele. O usuário de teste fica (isolado pelo RLS) para o Playwright e o `npm run test:db`.
   Alternativa: um segundo projeto só para desenvolvimento; dá mais trabalho e não muda nada para a loja agora.
2. **Endereço inicial `https://vindra-3d-studio.vercel.app`** (gratuito). Domínio próprio fica opcional, no fim do
   passo a passo, e só exige trocar `NEXT_PUBLIC_SITE_URL` e as URLs do Supabase.
3. **Cadastro público desligado no Supabase.** Só o Enzo (e o usuário de teste) entram. Hoje qualquer pessoa com o
   endereço poderia criar uma conta vazia.
4. **A `SUPABASE_SERVICE_ROLE_KEY` não vai para a Vercel** (o app não usa). O prompt original manda colar; vale o
   `PROGRESSO.md`.
5. **Escopo fechado** (lista abaixo). O que aparecer fora dela vira pendência, não entra no meio da fase.
6. **Pendências antigas nesta fase:** Lighthouse (sim, é critério da fase). A1 x A1 mini: uma pergunta ao Enzo e,
   se precisar, ajuste do cadastro. `.3mf` fatiado real: só se o Enzo mandar o arquivo. Foto por variação e conferência
   do financeiro com pedidos reais ficam para depois do deploy (uso real).

## O que será feito

### 1. Revisão de UX no celular (390 px) e no desktop (1280 px)
- Prints de todas as telas, nos dois temas, com o usuário de teste e dados criados pelo próprio roteiro (apagados no fim).
- Lista do que estiver ruim, mostrada ao Enzo antes de corrigir. Pontos que serão conferidos:
  - alvos de toque de pelo menos 44 px na barra inferior, nos cards e nos menus;
  - barra inferior respeitando a área segura do iPhone (`env(safe-area-inset-bottom)`);
  - diálogos longos rolando por dentro, sem cortar o botão de confirmar;
  - teclado certo nos campos (`inputMode` decimal, data, telefone);
  - tabelas e textos longos sem rolagem horizontal da página;
  - estados vazios, carregamento (skeleton por página onde o carregamento demora) e mensagens de erro.
- PWA: instalar no Android e no iPhone, ícone, nome, cor da barra e abertura em tela cheia.

### 2. Acessibilidade
- `axe-core` (fora do projeto, como o Playwright) nas páginas principais e na página pública; corrigir o que for erro.
- Navegação só por teclado nos fluxos principais (calculadora, orçamento, mover pedido, lançamento).
- Contraste dos textos nos dois temas.

### 3. Performance
- Conferir o peso das páginas: Recharts só no dashboard, `@dnd-kit` só em pedidos, `@react-pdf` só no servidor.
- Consultas que carregam tudo (financeiro e dashboard leem todos os pedidos): medir; só mudar (filtro por período ou
  índice) se estiver lento.
- **Lighthouse da página pública > 90** no celular, medido na Vercel.

### 4. Segurança antes de publicar
- Conferência somente leitura: RLS ligado e com política em todas as tabelas; funções `security definer` devolvendo só
  campos públicos; nenhuma função liberada para `anon` além das duas da página pública.
- Cabeçalhos HTTP no `next.config.ts`: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`
  e `Permissions-Policy`. CSP completa fica fora (risco de quebrar o Next e o Supabase sem ganho grande agora).
- Supabase Auth: cadastro desligado, senha mínima, URLs de redirecionamento só do domínio de produção e do local.
- Conferir que nenhum segredo está no repositório nem no código do navegador.

### 5. README completo
O que é o sistema, prints (celular e desktop), como rodar local, variáveis de ambiente, migrações (`db:push`),
testes (`npm test` e `npm run test:db`), deploy na Vercel e o que fazer quando algo der errado.

### 6. Deploy na Vercel (passo a passo para o Enzo)

**Antes:** o Claude deixa `lint`, `typecheck`, `test` e `build` passando, faz o push e avisa.

1. **Entrar na Vercel:** acesse <https://vercel.com/signup>, escolha **Continue with GitHub** e entre com a conta que
   tem acesso à organização `elg-tech`. Plano **Hobby** (gratuito).
2. **Dar acesso ao repositório:** em **Add New… → Project**, clique em **Adjust GitHub App Permissions** (ou
   **Install** na organização `elg-tech`), escolha **Only select repositories → vindra-3d-studio** e salve.
3. **Importar:** de volta em **Add New… → Project**, clique em **Import** ao lado de `vindra-3d-studio`.
   - **Project Name:** `vindra-3d-studio` (define o endereço `vindra-3d-studio.vercel.app`; se estiver ocupado, a
     Vercel sugere outro, e você me diz qual ficou).
   - **Framework Preset:** Next.js (detectado sozinho). **Root Directory:** `./`. Não mexa em Build/Output.
4. **Variáveis de ambiente** (na mesma tela, em **Environment Variables**; copie do seu `.env.local`):
   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | o mesmo do `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | o mesmo do `.env.local` |
   | `NEXT_PUBLIC_SITE_URL` | `https://vindra-3d-studio.vercel.app` (o endereço do passo 3, sem barra no fim) |

   **Não** cole `SUPABASE_SERVICE_ROLE_KEY`, `E2E_EMAIL` nem `E2E_PASSWORD`.
5. Clique em **Deploy** e espere (2 a 4 minutos). Se der erro, copie o log e me mande.
6. **Região das funções:** no Supabase, veja a região em **Project Settings → General** (ex.: *South America (São
   Paulo)*). Na Vercel, **Settings → Functions → Function Region**, escolha a mais próxima (São Paulo = `gru1`),
   salve e faça **Deployments → ⋯ → Redeploy**.
7. **Supabase Auth** (<https://supabase.com/dashboard> → seu projeto):
   - **Authentication → URL Configuration:** **Site URL** = `https://vindra-3d-studio.vercel.app`; em **Redirect
     URLs**, **Add URL** com `https://vindra-3d-studio.vercel.app/**` e mantenha `http://localhost:3000/**`.
   - **Authentication → Sign In / Providers → Email** (ou **Settings**): desligue **Allow new users to sign up**.
8. **Teste rápido seu, no celular:**
   - abrir o endereço, entrar com a sua conta;
   - instalar o app: Android/Chrome → menu ⋮ → **Instalar app**; iPhone/Safari → **Compartilhar → Adicionar à Tela
     de Início**;
   - criar um orçamento de teste, enviar o link para você mesmo no WhatsApp (conferir a prévia com imagem), abrir o link
     **sem estar logado**, baixar o PDF, ler o Pix no app do banco (sem pagar) e depois excluir o orçamento.
9. **Daqui pra frente:** cada push na `main` publica sozinho. Por isso o push continua só depois da sua conferência.
10. **Domínio próprio (opcional, depois):** **Settings → Domains → Add**, siga as instruções de DNS do seu registrador
    e me avise: eu troco `NEXT_PUBLIC_SITE_URL` e você atualiza as URLs do passo 7.

### 7. Conferência depois do deploy (Claude)
- Lighthouse da página pública no endereço da Vercel (celular), com meta > 90; corrigir e medir de novo se precisar.
- Playwright no endereço de produção com o usuário de teste: login, calculadora, orçamento com link público, pedido,
  financeiro e dashboard, em 1280 e 390 px, apagando os dados criados.
- Cabeçalhos HTTP conferidos na resposta real.

## Testes e fim da fase
- Antes de cada commit: `lint`, `typecheck`, `npm test` (de `C:\dev\vindra`) e `build`; `npm run test:db` se mexer no banco.
- Playwright uma vez no local (revisão de UX) e uma vez em produção (passo 7).
- Atualizar `docs/PROGRESSO.md`: endereço de produção, decisões, Lighthouse medido e pendências que sobrarem.

## O que só o Enzo pode fazer
- Aprovar este plano (e as 6 decisões).
- ~~Responder: a impressora é a A1, a A1 mini ou as duas?~~ Respondido: é a A1 (o cadastro do seed já está certo).
- Se quiser fechar a pendência do `.3mf`: mandar um `.gcode.3mf` fatiado multicor e a pesagem real da peça.
- Os passos 1 a 8 do deploy (conta, permissões, variáveis, Supabase Auth, teste no celular).
- Rodar `npm run db:push` se alguma correção precisar de migração.
