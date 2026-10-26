import { LogOut } from "lucide-react";
import type { Metadata } from "next";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form action={logout}>
          <Button type="submit" variant="outline" size="sm">
            <LogOut aria-hidden />
            Sair
          </Button>
        </form>
      </header>
      <p className="text-muted-foreground">
        Login funcionando. O layout completo chega na Fase 3.
      </p>
    </main>
  );
}
