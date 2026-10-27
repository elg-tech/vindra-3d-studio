import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABEL, type QuoteStatus } from "@/lib/quotes";
import { cn } from "@/lib/utils";

const TONE: Record<QuoteStatus, string> = {
  draft: "text-muted-foreground",
  sent: "border-primary/40 text-primary",
  approved: "border-success/40 bg-success/10 text-success",
  rejected: "border-destructive/40 text-destructive",
  expired: "border-warning/50 text-warning",
};

export function QuoteStatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn(TONE[status], className)}>
      {QUOTE_STATUS_LABEL[status]}
    </Badge>
  );
}
