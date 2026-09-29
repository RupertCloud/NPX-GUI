import { CheckCircle2, Circle, CircleSlash, Loader2, XCircle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ReleaseStatus, StepStatus } from "@/lib/data"

const styles: Record<ReleaseStatus | StepStatus, { icon: typeof Circle; className: string; label: string }> = {
  queued: { icon: Clock, className: "text-muted-foreground", label: "Queued" },
  pending: { icon: Circle, className: "text-muted-foreground", label: "Pending" },
  running: { icon: Loader2, className: "text-primary [&_svg]:animate-spin", label: "Running" },
  succeeded: { icon: CheckCircle2, className: "text-success", label: "Succeeded" },
  failed: { icon: XCircle, className: "text-destructive", label: "Failed" },
  cancelled: { icon: CircleSlash, className: "text-muted-foreground", label: "Cancelled" },
  skipped: { icon: CircleSlash, className: "text-muted-foreground", label: "Skipped" },
}

export function StatusBadge({ status, iconOnly = false }: { status: ReleaseStatus | StepStatus; iconOnly?: boolean }) {
  const { icon: Icon, className, label } = styles[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm font-medium", className)}>
      <Icon className="size-4" aria-hidden={!iconOnly} aria-label={iconOnly ? label : undefined} />
      {!iconOnly && label}
    </span>
  )
}
