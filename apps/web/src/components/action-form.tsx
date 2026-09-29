"use client"

import { useActionState } from "react"
import { cn } from "@/lib/utils"
import type { ActionResult } from "@/app/(dashboard)/actions"

// A form bound to a server action that returns { ok } or { error }, shown under the fields.
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>
  className?: string
  children: React.ReactNode
}) {
  const [state, formAction] = useActionState(action, undefined)
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.ok && <p className={cn("mt-2 text-sm text-success")}>{state.ok}</p>}
    </form>
  )
}
