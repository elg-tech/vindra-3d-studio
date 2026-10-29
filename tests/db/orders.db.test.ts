/**
 * Teste de banco (Supabase de verdade, com o usuário de teste do .env.local): `npm run test:db`.
 * Fica fora do `npm test`. Cria os próprios dados (carretel, orçamento, pedido) e apaga tudo no fim.
 */
import { readFileSync } from "node:fs";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

// lido direto: o loadEnvConfig do Next ignora o .env.local com NODE_ENV=test
const localEnv = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const env = (name: string) => {
  const value = localEnv[name];
  if (!value) throw new Error(`Falta ${name} no .env.local`);
  return value;
};

let db: SupabaseClient<Database>;
let spoolId = "";
let quoteId = "";

const remaining = async () => {
  const { data } = await db.from("filaments").select("remaining_g").eq("id", spoolId).single();
  return data?.remaining_g;
};

async function createTestOrder(opts: { channelId?: string; channelFees?: number; fromQuote?: boolean } = {}) {
  const { data, error } = await db.rpc("create_order", {
    p_order: {
      quoteId: opts.fromQuote === false ? null : quoteId,
      channelId: opts.channelId ?? null,
      status: "awaiting_payment",
      shippingCost: 0,
      discountAmount: 0,
      totalAmount: 100,
      channelFees: opts.channelFees ?? 0,
      items: [{ description: "Peça de teste", quantity: 1, unitPrice: 100, unitCost: 30, unitLaborCost: 10 }],
      payments: [
        { kind: "deposit", amount: 40 },
        { kind: "balance", amount: 60 },
      ],
    },
  });
  if (error) throw new Error(error.message);
  const { data: order } = await db.from("orders").select("id, number").eq("id", data).single();
  return order!;
}

beforeAll(async () => {
  db = createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
  const { error } = await db.auth.signInWithPassword({ email: env("E2E_EMAIL"), password: env("E2E_PASSWORD") });
  if (error) throw new Error(`Login do usuário de teste: ${error.message}`);

  const spool = await db
    .from("filaments")
    .insert({ material: "PLA", color_name: "Teste de banco", price_paid: 100, net_weight_g: 1000 })
    .select("id")
    .single();
  if (spool.error) throw new Error(spool.error.message);
  spoolId = spool.data.id;

  const quote = await db.from("quotes").insert({ status: "approved", notes: "Teste de banco" }).select("id").single();
  if (quote.error) throw new Error(quote.error.message);
  quoteId = quote.data.id;
}, 30_000);

afterAll(async () => {
  if (!db) return;
  await db.from("orders").delete().eq("quote_id", quoteId);
  if (quoteId) await db.from("quotes").delete().eq("id", quoteId);
  if (spoolId) await db.from("filaments").delete().eq("id", spoolId);
  await db.auth.signOut();
});

describe("cancelar e excluir pedido (banco)", () => {
  it("cancelar com estorno e depois excluir devolve tudo, como se o pedido nunca tivesse existido", async () => {
    const order = await createTestOrder();
    expect(await remaining()).toBe(1000);

    // baixa de 200 g e falha de 50 g
    let r = await db.rpc("consume_order_filament", { p_order_id: order.id, p_lines: [{ filamentId: spoolId, grams: 200 }] });
    expect(r.error).toBeNull();
    const failure = await db.rpc("record_print_failure", {
      p_order_id: order.id,
      p_failure: { filamentId: spoolId, grams: 50, minutes: 30, cost: 5 },
    });
    expect(failure.error).toBeNull();
    expect(await remaining()).toBe(750);

    // sinal pago; cancelar com peças impressas e estorno do sinal
    await db.from("order_payments").update({ paid_on: "2026-10-28", method: "pix" }).eq("order_id", order.id).eq("kind", "deposit");
    r = await db.rpc("cancel_order", { p_order_id: order.id, p_printed: true, p_refund: 40 });
    expect(r.error).toBeNull();
    expect(await remaining()).toBe(750);
    const { data: refund } = await db.from("transactions").select("kind, category, gross_amount, description").eq("order_id", order.id).single();
    expect(refund).toEqual({ kind: "expense", category: "refund", gross_amount: 40, description: `Estorno do pedido ${order.number}` });

    // confirmação com número errado é recusada e nada muda
    r = await db.rpc("delete_order", { p_order_id: order.id, p_number: "PED-0000-0000" });
    expect(r.error?.message).toContain("order_number_mismatch");
    expect((await db.from("orders").select("id").eq("id", order.id)).data).toHaveLength(1);

    // excluir (o número digitado não diferencia maiúsculas)
    r = await db.rpc("delete_order", { p_order_id: order.id, p_number: ` ${order.number.toLowerCase()} ` });
    expect(r.error).toBeNull();
    expect(await remaining()).toBe(1000);
    expect((await db.from("orders").select("id").eq("id", order.id)).data).toHaveLength(0);
    for (const table of ["order_items", "order_payments", "print_failures", "transactions", "filament_movements"] as const) {
      const { data } = await db.from(table).select("id").eq("order_id", order.id);
      expect(data, table).toHaveLength(0);
    }

    // o orçamento de origem volta a poder virar pedido
    const again = await createTestOrder();
    r = await db.rpc("delete_order", { p_order_id: again.id, p_number: again.number });
    expect(r.error).toBeNull();
  }, 60_000);

  it("cancelar sem peças impressas devolve a baixa; sem estorno não lança nada", async () => {
    const order = await createTestOrder();
    await db.rpc("consume_order_filament", { p_order_id: order.id, p_lines: [{ filamentId: spoolId, grams: 120 }] });
    expect(await remaining()).toBe(880);
    const r = await db.rpc("cancel_order", { p_order_id: order.id, p_printed: false });
    expect(r.error).toBeNull();
    expect(await remaining()).toBe(1000);
    expect((await db.from("transactions").select("id").eq("order_id", order.id)).data).toHaveLength(0);
    await db.rpc("delete_order", { p_order_id: order.id, p_number: order.number });
  }, 60_000);

  it("Venda direta: taxa por pagamento (sinal no Pix, restante no crédito) e desfazer", async () => {
    const { data: channels } = await db.from("sales_channels").select("id, kind");
    const direct = channels!.find((c) => c.kind === "direct")!;
    const other = channels!.find((c) => c.kind !== "direct")!;
    const order = await createTestOrder({ channelId: direct.id, fromQuote: false });
    const fees = async () => (await db.from("orders").select("channel_fees").eq("id", order.id).single()).data?.channel_fees;
    const payment = async (kind: string) =>
      (await db.from("order_payments").select("method, fee_amount").eq("order_id", order.id).eq("kind", kind).single()).data;

    let r = await db.rpc("set_order_payment", { p_order_id: order.id, p_kind: "deposit", p_paid_on: "2026-10-28", p_method: "pix", p_fee: 0 });
    expect(r.error).toBeNull();
    r = await db.rpc("set_order_payment", { p_order_id: order.id, p_kind: "balance", p_paid_on: "2026-10-29", p_method: "credit", p_fee: 2.99 });
    expect(r.error).toBeNull();
    expect(await payment("balance")).toEqual({ method: "credit", fee_amount: 2.99 });
    expect(await fees()).toBe(2.99);

    // desfazer o restante tira a taxa dele
    r = await db.rpc("set_order_payment", {
      p_order_id: order.id,
      p_kind: "balance",
      p_paid_on: null as unknown as string,
      p_method: null as unknown as string,
      p_fee: null as unknown as number,
    });
    expect(r.error).toBeNull();
    expect(await payment("balance")).toEqual({ method: null, fee_amount: null });
    expect(await fees()).toBe(0);

    // forma inválida é recusada; "card" (registro antigo) continua aceito
    r = await db.rpc("set_order_payment", { p_order_id: order.id, p_kind: "balance", p_paid_on: "2026-10-29", p_method: "boleto", p_fee: 0 });
    expect(r.error).not.toBeNull();
    const legacy = await db.from("order_payments").update({ paid_on: "2026-10-29", method: "card" }).eq("order_id", order.id).eq("kind", "balance");
    expect(legacy.error).toBeNull();
    await db.rpc("delete_order", { p_order_id: order.id, p_number: order.number });

    // outro canal: a taxa do pedido não muda ao marcar pagamento
    const shop = await createTestOrder({ channelId: other.id, channelFees: 12.5, fromQuote: false });
    r = await db.rpc("set_order_payment", { p_order_id: shop.id, p_kind: "deposit", p_paid_on: "2026-10-28", p_method: "pix", p_fee: null as unknown as number });
    expect(r.error).toBeNull();
    expect((await db.from("orders").select("channel_fees").eq("id", shop.id).single()).data?.channel_fees).toBe(12.5);
    await db.rpc("delete_order", { p_order_id: shop.id, p_number: shop.number });
  }, 60_000);
});
