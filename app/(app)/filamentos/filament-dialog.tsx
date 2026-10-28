"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { Tables } from "@/lib/supabase/database.types";
import { FilamentForm } from "./filament-form";

/** Botão "Novo carretel" ou "Editar" que abre o formulário em um diálogo. */
export function FilamentDialog({
  filament,
  brands,
}: {
  filament?: Tables<"filaments">;
  brands: Pick<Tables<"filament_brands">, "id" | "name">[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {filament ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden /> Editar
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden /> Novo carretel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        {open && <FilamentForm filament={filament ?? null} brands={brands} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
