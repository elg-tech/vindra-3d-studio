import { redirect } from "next/navigation";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { getCurrentUserId } from "@/lib/supabase/server";

// O proxy faz a checagem otimista; aqui validamos de verdade antes de renderizar.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* páginas largas (quadro de pedidos) marcam data-page-wide e usam a tela toda */}
        <main className="mx-auto w-full max-w-6xl flex-1 has-[[data-page-wide]]:max-w-none px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-6 md:pb-10">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
