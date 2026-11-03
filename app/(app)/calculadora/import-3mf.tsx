"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import type { BambuPlate } from "@/lib/bambu3mf";
import { cn } from "@/lib/utils";

const MAX_BYTES = 100 * 1024 * 1024; // mesmo limite do bucket "files"

/**
 * Importa um .3mf fatiado do Bambu Studio. A leitura é feita no navegador
 * (o arquivo só sobe para o Storage ao salvar a ficha). Devolve todas as mesas (inclusive as não fatiadas);
 * quem chama mostra a lista para marcar quais entram.
 */
export function Import3mf({ onImport }: { onImport: (plates: BambuPlate[], file: File) => void }) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handle(file: File) {
    if (!/\.3mf$/i.test(file.name)) {
      toast.error("Envie um arquivo .3mf (ou .gcode.3mf) do Bambu Studio.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Arquivo maior que 100 MB.");
      return;
    }
    setLoading(true);
    try {
      // carregado sob demanda: o jszip só entra quando alguém importa
      const { parseBambu3mf } = await import("@/lib/bambu3mf");
      const result = await parseBambu3mf(file);
      if (!result.ok) {
        toast.error(result.error, { duration: 10_000 });
        return;
      }
      onImport(result.plates, file);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void handle(file);
      }}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-4 transition-colors hover:bg-accent/50",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        dragging && "border-primary bg-accent",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileUp className="size-5" aria-hidden />}
      </span>
      <span className="grid gap-0.5 text-sm">
        <span className="font-medium">Importar do Bambu Studio</span>
        <span className="text-muted-foreground">
          Arraste ou toque para escolher o <strong>.gcode.3mf</strong> da mesa fatiada.
        </span>
      </span>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept=".3mf,model/3mf,application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
        className="sr-only"
        disabled={loading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
        }}
      />
    </label>
  );
}
