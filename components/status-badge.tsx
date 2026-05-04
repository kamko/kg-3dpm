import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

const statusStyles: Record<TaskStatus, string> = {
  new: "border-border bg-white text-foreground",
  printing: "border-amber-200 bg-warning-soft text-foreground",
  done: "border-emerald-200 bg-success-soft text-foreground",
  failed: "border-rose-200 bg-danger-soft text-foreground",
  cancelled: "border-zinc-200 bg-zinc-100 text-muted-foreground",
};

type StatusBadgeProps = {
  status: TaskStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold uppercase tracking-[0.14em]",
        statusStyles[status],
      )}
    >
      {status}
    </span>
  );
}
