/**
 * Teste de banco da calculadora produção x venda (kits): `npm run test:db`.
 * Usuário de teste (E2E_EMAIL) é o dono; o segundo (E2E_EMAIL_2) só prova que outro usuário não altera.
 * Cria a própria ficha, produto, orçamento e pedido e apaga tudo no fim.
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
const sheetIds: string[] = [];
const productIds: string[] = [];
const quoteIds: string[] = [];
const orderIds: string[] = [];

const baseSheet = {
  name: "Teste de banco: tubarão (kits)",
  printerId: null,
  printMinutes: 116,
  prepMinutes: 10,
  postMinutes: 2,
  purgeG: 0,
  packagingCost: 1.2,
  quantity: 5,
  piecesPerPlate: 5,
  filaments: [{ filamentId: null, material: "PLA", colorHex: "#0086D6", grams: 26.71 }],
  sourceFilePath: null,
  notes: null,
};

async function saveSheet(sheet: object) {
  const { data, error } = await owner.rpc("save_cost_sheet", { p_sheet: sheet as never, p_unit_cost: 3.5 });
  if (error) throw new Error(error.message);
  if (!sheetIds.includes(data)) sheetIds.push(data);
  return data;
}

const readSheet = async (id: string) =>
  (
    await owner
      .from("cost_sheets")
      .select("pack_minutes, kit_sizes, cost_sheet_supplies(name, per_order)")
      .eq("id", id)
      .single()
  ).data;

beforeAll(async () => {
  owner = client();
  other = client();
  const a = await owner.auth.signInWithPassword({ email: env("E2E_EMAIL"), password: env("E2E_PASSWORD") });
  if (a.error) throw new Error(`Login do usuário de teste: ${a.error.message}`);
  const b = await other.auth.signInWithPassword({ email: env("E2E_EMAIL_2"), password: env("E2E_PASSWORD_2") });
  if (b.error) throw new Error(`Login do segundo usuário de teste: ${b.error.message}`);
}, 30_000);

afterAll(async () => {
  if (!owner) return;
  for (const id of orderIds) await owner.from("orders").delete().eq("id", id);
  for (const id of quoteIds) await owner.from("quotes").delete().eq("id", id);
  for (const id of productIds) await owner.from("products").delete().eq("id", id);
  for (const id of sheetIds) await owner.from("cost_sheets").delete().eq("id", id);
  await owner.auth.signOut();
  await other?.auth.signOut();
});

describe("kits (banco)", () => {
  it("ficha: tempo de embalar, kits e insumo por pedido; sem os campos novos, os padrões", async () => {
    const id = await saveSheet({
      ...baseSheet,
      packMinutes: 4,
      kitSizes: [1, 3, 5],
      extras: [
        { supplyId: null, name: "Ímã", quantity: 2, unitCost: 0.1, perOrder: false },
        { supplyId: null, name: "Etiqueta", quantity: 1, unitCost: 0.3, perOrder: true },
      ],
    });
    const saved = await readSheet(id);
    expect(saved?.pack_minutes).toBe(4);
    expect(saved?.kit_sizes).toEqual([1, 3, 5]);
    expect([...(saved?.cost_sheet_supplies ?? [])].sort((x, y) => x.name.localeCompare(y.name))).toEqual([
      { name: "Etiqueta", per_order: true },
      { name: "Ímã", per_order: false },
    ]);

    // chamada antiga (sem os campos novos): continua salvando, com os padrões
    const old = await saveSheet({ ...baseSheet, extras: [{ supplyId: null, name: "Argola", quantity: 1, unitCost: 0.15 }] });
    expect(await readSheet(old)).toEqual({ pack_minutes: 0, kit_sizes: [1], cost_sheet_supplies: [{ name: "Argola", per_order: false }] });
  }, 60_000);

  it("variação com peças por kit; sem o campo, 1; fora do limite, recusada", async () => {
    const sheetId = sheetIds[0] ?? (await saveSheet({ ...baseSheet, extras: [] }));
    const { data: productId, error } = await owner.rpc("save_product", {
      p_product: {
        name: "Teste de banco: tubarão",
        sku: null,
        active: true,
        variants: [
          { name: "Kit 1", sku: null, costSheetId: sheetId, active: true, prices: [] },
          { name: "Kit 5", sku: null, costSheetId: sheetId, piecesPerKit: 5, active: true, prices: [] },
        ],
      },
    });
    expect(error).toBeNull();
    productIds.push(productId!);
    const { data: variants } = await owner
      .from("product_variants")
      .select("name, pieces_per_kit")
      .eq("product_id", productId!)
      .order("sort_order");
    expect(variants).toEqual([
      { name: "Kit 1", pieces_per_kit: 1 },
      { name: "Kit 5", pieces_per_kit: 5 },
    ]);

    const bad = await owner.from("product_variants").update({ pieces_per_kit: 0 }).eq("product_id", productId!).eq("name", "Kit 1");
    expect(bad.error).not.toBeNull();
  }, 60_000);

  it("orçamento e pedido guardam as peças por kit do item", async () => {
    const { data: quoteId, error } = await owner.rpc("save_quote", {
      p_quote: {
        discountType: "amount",
        discountValue: 0,
        shippingCost: 0,
        items: [
          { description: "Tubarão Kit 5", quantity: 1, unitPrice: 44.9, piecesPerKit: 5 },
          { description: "Item antigo", quantity: 1, unitPrice: 10 },
        ],
      },
    });
    expect(error).toBeNull();
    quoteIds.push(quoteId!);
    const { data: qItems } = await owner.from("quote_items").select("description, pieces_per_kit").eq("quote_id", quoteId!).order("sort_order");
    expect(qItems).toEqual([
      { description: "Tubarão Kit 5", pieces_per_kit: 5 },
      { description: "Item antigo", pieces_per_kit: 1 },
    ]);

    const { data: orderId, error: orderError } = await owner.rpc("create_order", {
      p_order: {
        status: "queued",
        shippingCost: 0,
        discountAmount: 0,
        totalAmount: 89.8,
        channelFees: 0,
        notes: "Teste de banco: kits",
        items: [{ description: "Tubarão Kit 5", quantity: 2, unitPrice: 44.9, piecesPerKit: 5 }],
        payments: [],
      },
    });
    expect(orderError).toBeNull();
    orderIds.push(orderId!);
    const { data: oItems } = await owner.from("order_items").select("quantity, pieces_per_kit").eq("order_id", orderId!);
    expect(oItems).toEqual([{ quantity: 2, pieces_per_kit: 5 }]);
  }, 60_000);

  it("outro usuário não altera as peças por kit nem a ficha", async () => {
    const productId = productIds[0];
    const sheetId = sheetIds[0];
    const { data: before } = await owner.from("product_variants").select("id, pieces_per_kit").eq("product_id", productId);

    const upd = await other.from("product_variants").update({ pieces_per_kit: 9 }).eq("product_id", productId).select("id");
    expect(upd.data ?? []).toEqual([]);

    const rpc = await other.rpc("save_product", {
      p_product: { id: productId, name: "invasão", sku: null, active: true, variants: [] },
    });
    expect(rpc.error?.message).toContain("product_not_found");

    const sheet = await other.rpc("save_cost_sheet", {
      p_sheet: { ...baseSheet, id: sheetId, packMinutes: 99, kitSizes: [7], extras: [] } as never,
      p_unit_cost: 1,
    });
    expect(sheet.error?.message).toContain("cost_sheet_not_found");

    const { data: after } = await owner.from("product_variants").select("id, pieces_per_kit").eq("product_id", productId);
    expect(after).toEqual(before);
    expect((await readSheet(sheetId))?.kit_sizes).toEqual([1, 3, 5]);
  }, 60_000);
});
