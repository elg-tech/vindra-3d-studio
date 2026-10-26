import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Logo da Vindra 3D. As duas versões são renderizadas e o CSS mostra a do tema
 * atual, evitando o "pisca" de trocar a imagem depois da hidratação.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span className={cn("relative inline-block aspect-[654/585]", className)}>
      <Image
        src="/logo-claro.png"
        alt="Vindra 3D"
        fill
        sizes="160px"
        priority={priority}
        className="object-contain dark:hidden"
      />
      <Image
        src="/logo-escuro.png"
        alt=""
        fill
        sizes="160px"
        priority={priority}
        className="hidden object-contain dark:block"
      />
    </span>
  );
}
