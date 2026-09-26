import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** The short note shown in place of an owner-only control for staff. */
export function OwnerOnlyNote({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
      <Lock className="h-3 w-3" aria-hidden="true" />
      {children ?? "Owner only"}
    </span>
  );
}
