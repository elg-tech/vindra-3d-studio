import {
  Calculator,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Package,
  Settings,
  Spool,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Aparece na barra inferior do celular (máx. 4; o resto vai para "Mais"). */
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, mobile: true },
  { href: "/calculadora", label: "Calculadora", icon: Calculator, mobile: true },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList, mobile: true },
  { href: "/orcamentos", label: "Orçamentos", icon: FileText, mobile: true },
  { href: "/filamentos", label: "Filamentos", icon: Spool },
  { href: "/produtos", label: "Produtos", icon: Package },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/financeiro", label: "Financeiro", icon: Wallet },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
