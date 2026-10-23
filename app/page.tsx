import { Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Box className="size-5" aria-hidden />
          </div>
          <CardTitle className="text-2xl">Vindra 3D Studio</CardTitle>
          <CardDescription>
            Fundação pronta. Próximo passo: Supabase e login.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled className="w-full">
            Entrar (em breve)
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
