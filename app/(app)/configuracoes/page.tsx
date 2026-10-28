import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { BackupSection } from "./backup-section";
import { BrandsSection } from "./brands-section";
import { ChannelsSection } from "./channels-section";
import { CostSettingsForm } from "./cost-settings-form";
import { PrintersSection } from "./printers-section";
import { StoreSettingsForm } from "./store-settings-form";

export const metadata: Metadata = { title: "Configurações" };

const TABS = [
  ["custos", "Custos"],
  ["canais", "Canais"],
  ["impressoras", "Impressoras"],
  ["loja", "Loja"],
  ["marcas", "Marcas"],
  ["backup", "Backup"],
] as const;

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const tab = TABS.some(([value]) => value === aba) ? aba : "custos";

  const supabase = await createClient();
  const [settings, channels, printers, brands] = await Promise.all([
    supabase.from("settings").select("*").single(),
    supabase.from("sales_channels").select("*").order("sort_order"),
    supabase.from("printers").select("*").order("is_default", { ascending: false }).order("name"),
    supabase.from("filament_brands").select("*").order("name"),
  ]);

  if (settings.error) throw new Error("Não foi possível carregar as configurações.");

  return (
    <div className="grid gap-6">
      <PageHeader title="Configurações" description="Custos, taxas dos canais, impressoras, dados da loja e backup." />

      <Tabs defaultValue={tab} className="gap-6">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            {TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="custos">
          <CostSettingsForm settings={settings.data} />
        </TabsContent>
        <TabsContent value="canais">
          <ChannelsSection channels={channels.data ?? []} taxPct={settings.data.tax_pct} />
        </TabsContent>
        <TabsContent value="impressoras">
          <PrintersSection printers={printers.data ?? []} energyRate={settings.data.energy_rate_kwh} />
        </TabsContent>
        <TabsContent value="loja">
          <StoreSettingsForm settings={settings.data} />
        </TabsContent>
        <TabsContent value="marcas">
          <BrandsSection brands={brands.data ?? []} />
        </TabsContent>
        <TabsContent value="backup">
          <BackupSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
