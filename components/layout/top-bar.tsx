import { LogOut } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/(auth)/login/actions";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-4 md:px-6">
        <Link href="/dashboard" className="md:hidden" aria-label="Ir para o Dashboard">
          <Logo className="w-10" />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" aria-label="Sair">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
