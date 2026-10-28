import { defineConfig } from "vitest/config";

// Testes de banco (Supabase de verdade): `npm run test:db`. Ficam fora do `npm test`.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    fileParallelism: false,
  },
});
