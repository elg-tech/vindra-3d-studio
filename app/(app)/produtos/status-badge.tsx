import { Badge } from "@/components/ui/badge";
import type { ChannelStatus } from "@/lib/product-pricing";
import { CHANNEL_STATUS_META } from "@/lib/products";
import { cn } from "@/lib/utils";

const TONE = {
  success: "border-success/40 text-success",
  warning: "border-warning/50 text-warning",
  destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "text-muted-foreground",
} as const;

export function StatusBadge({ status, className }: { status: ChannelStatus; className?: string }) {
  const meta = CHANNEL_STATUS_META[status];
  return (
    <Badge variant="outline" className={cn(TONE[meta.tone], className)}>
      {meta.label}
    </Badge>
  );
}
