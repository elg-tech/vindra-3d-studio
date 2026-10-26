import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/supabase/server";

// O proxy faz a checagem otimista; aqui validamos de verdade antes de renderizar.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  return <>{children}</>;
}
