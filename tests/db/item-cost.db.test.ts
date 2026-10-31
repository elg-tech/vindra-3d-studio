/**
 * Teste de banco do custo no item avulso: `npm run test:db`.
 * Usuário de teste (E2E_EMAIL) é o dono; o segundo usuário (E2E_EMAIL_2) só serve para provar que outro usuário
 * não altera o item. Cria os próprios pedidos e orçamento e apaga tudo no fim.
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

const client = () =>
  createClient<Database>(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), { auth: { persistSession: false } });

let owner: SupabaseClient<Database>;
let other: SupabaseClient<Database>;
let anon: SupabaseClient<Database>;
const orderIds: string[] = [];
let quoteId = "";

const MANUAL = { cost: 12, labor: 5 };

async function createOrder() {
  const { data, error } = await owner.rpc("create_order", {
    p_order: {
      status: "awaiting_payment",
      shippingCost: 15,
      discountAmount: 0,
      totalAmount: 215,
      channelFees: 3.5,
      notes: "Teste de banco: custo do item avulso",
      items: [
        { description: "Avulso sem custo", quantity: 2, unitPrice: 50 },
        { description: "Avulso com custo", quantity: 1, unitPrice: 100, unitCost: 17, unitLaborCost: 5, costSource: "manual", costInput: MANUAL },
      ],
      payments: [
        { kind: "deposit", amount: 100 },
        { kind: "balance", amount: 115 },
      ],
    },
  });
  if (error) throw new Error(error.message);
  orderIds.push(data);
  await owner.from("order_payments").update({ paid_on: "2026-10-28", method: "pix", fee_amount: 0 }).eq("order_id", data).eq("kind", "deposit");
  const { data: items } = await owner.from("order_items").select("id, description").eq("order_id", data);
  const byName = (d: string) => items!.find((i) => i.description === d)!.id;
  return { id: data, noCost: byName("Avulso sem custo"), withCost: byName("Avulso com custo") };
}

/** Tudo do pedido que o custo do item nunca pode mudar. */
async function untouchable(orderId: string) {
  const { data: o } = await owner
    .from("orders")
    .select("total_amount, channel_fees, shipping_cost, discount_amount, status, order_items(id, description, quantity, unit_price), order_payments(kind, amount, paid_on, method, fee_amount)")
    .eq("id", orderId)
    .single();
  return {
    ...o!,
    order_items: [...o!.order_items].sort((a, b) => a.id.localeCompare(b.id)),
    order_payments: [...o!.order_payments].sort((a, b) => a.kind.localeCompare(b.kind)),
  };
}

const itemCost = async (itemId: string) =>
  (await owner.from("order_items").select("unit_cost, unit_labor_cost, cost_source, cost_input").eq("id", itemId).single()).data;

const setCost = (db: SupabaseClient<Database>, itemId: string, unitCost: number, labor: number, input: object = MANUAL) =>
  db.rpc("set_order_item_cost", {
    p_item_id: itemId,
    p_unit_cost: unitCost,
    p_unit_labor_cost: labor,
    p_cost_source: "manual",
    p_cost_input: input as never,
  });

beforeAll(async () => {
  owner = client();
  other = client();
  anon = client();
  const a = await owner.auth.signInWithPassword({ email: env("E2E_EMAIL"), password: env("E2E_PASSWORD") });
  if (a.error) throw new Error(`Login do usuário de teste: ${a.error.message}`);
  const b = await other.auth.signInWithPassword({ email: env("E2E_EMAIL_2"), password: env("E2E_PASSWORD_2") });
  if (b.error) throw new Error(`Login do segundo usuário de teste: ${b.error.message}`);
}, 30_000);

afterAll(async () => {
  if (!owner) return;
  for (const id of orderIds) await owner.from("orders").delete().eq("id", id);
  if (quoteId) await owner.from("quotes").delete().eq("id", quoteId);
  await owner.auth.signOut();
  await other?.auth.signOut();
});

describe("custo do item avulso (banco)", () => {
  it("create_order grava a origem e o custo do avulso", async () => {
    const order = await createOrder();
    expect(await itemCost(order.withCost)).toEqual({ unit_cost: 17, unit_labor_cost: 5, cost_source: "manual", cost_input: MANUAL });
    expect(await itemCost(order.noCost)).toEqual({ unit_cost: null, unit_labor_cost: null, cost_source: null, cost_input: null });
  }, 60_000);

  it("o dono define o custo em pedido Entregue; preço, pagamentos e taxas ficam intactos", async () => {
    const order = await createOrder();
    await owner.from("orders").update({ status: "delivered" }).eq("id", order.id);
    const before = await untouchable(order.id);

    const r = await setCost(owner, order.noCost, 17, 5);
    expect(r.error).toBeNull();
    expect(await itemCost(order.noCost)).toEqual({ unit_cost: 17, unit_labor_cost: 5, cost_source: "manual", cost_input: MANUAL });
    expect(await untouchable(order.id)).toEqual(before);

    // remover o custo volta a "sem custo"
    const cleared = await owner.rpc("set_order_item_cost", {
      p_item_id: order.noCost,
      p_unit_cost: null as unknown as number,
      p_unit_labor_cost: null as unknown as number,
      p_cost_source: null as unknown as string,
      p_cost_input: null as never,
    });
    expect(cleared.error).toBeNull();
    expect((await itemCost(order.noCost))?.unit_cost).toBeNull();
    expect(await untouchable(order.id)).toEqual(before);
  }, 60_000);

  it("pedido cancelado também aceita o custo", async () => {
    const order = await createOrder();
    const c = await owner.rpc("cancel_order", { p_order_id: order.id, p_printed: true });
    expect(c.error).toBeNull();
    const before = await untouchable(order.id);
    expect((await setCost(owner, order.noCost, 8, 0)).error).toBeNull();
    expect((await itemCost(order.noCost))?.unit_cost).toBe(8);
    expect(await untouchable(order.id)).toEqual(before);
  }, 60_000);

  it("outro usuário e quem não entrou não alteram o item", async () => {
    const order = await createOrder();
    const before = await itemCost(order.noCost);

    const r = await setCost(other, order.noCost, 1, 0);
    expect(r.error?.message).toContain("item_not_found");
    // nem direto na tabela (RLS): nenhuma linha muda
    const direct = await other.from("order_items").update({ unit_cost: 1 }).eq("id", order.noCost).select("id");
    expect(direct.data ?? []).toHaveLength(0);
    // nem vê o item
    expect((await other.from("order_items").select("id").eq("id", order.noCost)).data).toHaveLength(0);

    const a = await setCost(anon, order.noCost, 1, 0);
    expect(a.error).not.toBeNull();

    expect(await itemCost(order.noCost)).toEqual(before);
  }, 60_000);

  it("custo negativo e mão de obra maior que o custo são recusados", async () => {
    const order = await createOrder();
    expect((await setCost(owner, order.noCost, -1, 0)).error?.message).toContain("invalid_cost");
    expect((await setCost(owner, order.noCost, 5, 6)).error?.message).toContain("invalid_labor_cost");
    expect((await itemCost(order.noCost))?.unit_cost).toBeNull();
  }, 60_000);

  it("orçamento guarda o custo do avulso e a página pública não mostra", async () => {
    const { data, error } = await owner.rpc("save_quote", {
      p_quote: {
        discountType: "amount",
        discountValue: 0,
        shippingCost: 0,
        notes: "Teste de banco: custo do item avulso",
        items: [
          { description: "Avulso do orçamento", quantity: 2, unitPrice: 40, unitCost: 17, unitLaborCost: 5, costSource: "manual", costInput: MANUAL },
        ],
      },
    });
    expect(error).toBeNull();
    quoteId = data!;
    const { data: item } = await owner
      .from("quote_items")
      .select("unit_price, unit_cost, unit_labor_cost, cost_source, cost_input")
      .eq("quote_id", quoteId)
      .single();
    expect(item).toEqual({ unit_price: 40, unit_cost: 17, unit_labor_cost: 5, cost_source: "manual", cost_input: MANUAL });

    await owner.from("quotes").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", quoteId);
    const { data: q } = await owner.from("quotes").select("token").eq("id", quoteId).single();
    const pub = await anon.rpc("get_public_quote", { p_token: q!.token });
    expect(pub.error).toBeNull();
    const text = JSON.stringify(pub.data);
    expect(text).toContain("Avulso do orçamento");
    for (const secret of ["unit_cost", "unit_labor_cost", "cost_source", "cost_input", "labor"]) expect(text).not.toContain(secret);
  }, 60_000);
});
