> **⚠️ RESPONDA SEMPRE EM PORTUGUÊS.**

# Vindra 3D Studio

Antes de qualquer coisa, leia `docs/PROGRESSO.md` (fases, decisões e pendências) e
`docs/PROMPT_VINDRA_3D.md` (prompt mestre com as fases e as regras de trabalho).

O prompt é o original e ficou desatualizado em alguns pontos. **Quando o prompt e o `PROGRESSO.md`
divergirem, vale o `PROGRESSO.md`** (ex.: pasta `c:\dev\vindra`, preparo por lote x pós por peça,
página pública via função `security definer`).

Siga também o `AGENTS.md` (gerado pelo `next dev`): o Next.js 16 mudou APIs e convenções; consulte
`node_modules/next/dist/docs/` antes de escrever código do Next.

No fim de cada fase, atualize `docs/PROGRESSO.md` com o hash do commit, as decisões novas e as pendências.

## Segredos e acesso ao banco

- **`SUPABASE_SERVICE_ROLE_KEY` só pode ser usada com pedido explícito do Enzo na conversa**, e só para o que ele
  pediu. Ela ignora o RLS e enxerga a conta de todo mundo. Nunca use por iniciativa própria, nem para "só conferir".
- O usuário de teste (`E2E_EMAIL`/`E2E_PASSWORD`) serve só para o Playwright e para os testes de banco (`npm run test:db`).
  O segundo (`E2E_EMAIL_2`/`E2E_PASSWORD_2`) serve só para os testes de banco de "outro usuário não altera".
- Migrações: o Enzo roda `npm run db:push` no terminal dele; avise quando houver migração nova e espere.

## Produção (desde 28/10/2026)

O app está em uso real em <https://vindra-3d-studio.vercel.app>.

- **Push na `main` = deploy em produção.** Trabalhe numa branch (ex.: `fase-10`) e faça push só nela (gera preview
  na Vercel). Merge na `main` só com o ok do Enzo, depois que ele conferir o preview.
- **Migração mexe em dados reais:** só aditiva (nada de `DROP` nem `ALTER` destrutivo), com dry-run antes
  (`supabase db push --linked --dry-run`), e o Enzo roda o `db:push` no terminal dele.
- **Nunca apague nem altere dados da conta do Enzo.** Testes e prints só com o usuário de teste.
