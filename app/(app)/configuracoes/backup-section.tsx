"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

class BackupError extends Error {
  constructor(message: string | null) {
    super(message ?? "");
  }
}

export function BackupSection() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch("/configuracoes/backup", { cache: "no-store" });
      // a rota responde texto simples com a mensagem; qualquer outra coisa (HTML de erro) vira a mensagem padrão
      if (!res.ok) throw new BackupError(res.headers.get("Content-Type")?.startsWith("text/plain") ? await res.text() : null);
      // sessão vencida: o proxy redireciona para o login e a resposta vira HTML
      if (res.headers.get("Content-Type") !== "application/zip") throw new BackupError("Sua sessão expirou. Entre de novo.");
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "vindra-backup.zip";
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup baixado. Guarde o arquivo fora do computador também (Drive, e-mail).");
    } catch (e) {
      // erro de rede do navegador vem em inglês ("Failed to fetch"): só mostra as mensagens nossas
      toast.error(e instanceof BackupError && e.message ? e.message : "Não foi possível gerar o backup. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup</CardTitle>
        <CardDescription>
          O plano grátis do Supabase não tem backup para baixar. Exporte seus dados de vez em quando (uma vez por mês, ou
          antes de mudanças grandes).
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
          <li>Um arquivo .zip com uma planilha CSV por tabela (abre no Excel) e um JSON completo.</li>
          <li>O JSON é o que serve para restaurar. As fotos dos produtos não vão no arquivo.</li>
        </ul>
        <Button onClick={download} disabled={busy} size="lg" className="justify-self-start">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          {busy ? "Gerando backup…" : "Exportar meus dados"}
        </Button>
      </CardContent>
    </Card>
  );
}
