"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copia um texto para a área de transferência e confirma no próprio botão. */
export function CopyButton({
  value,
  label,
  copiedMessage = "Copiado.",
  variant = "outline",
  className,
}: {
  value: string;
  label: string;
  copiedMessage?: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Button type="button" variant={variant} onClick={copy} className={className}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {label}
    </Button>
  );
}
