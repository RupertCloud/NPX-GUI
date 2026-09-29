import Link from "next/link"
import { ActionForm } from "@/components/action-form"
import { JobStatus } from "@/components/job-status"
import { SubmitButton } from "@/components/submit-button"
import { buttonVariants } from "@/components/ui/button"
import type { NextStep } from "@/lib/health"
import { toJobView } from "@/lib/jobs"
import { makeRunnable, mergePackagePr, openWorkflowPrAction, suggestReleaseFix } from "@/app/(dashboard)/actions"

// One-click next action for a package row.
export function NextStepCell({ step, packageId, hasAi }: { step: NextStep; packageId: string; hasAi: boolean }) {
  const link = (href: string, text: string) => (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm" })}>
      {text}
    </Link>
  )
  switch (step.kind) {
    case "job":
      return <JobStatus initial={{ ...toJobView(step.job), logs: [] }} label={step.label} compact />
    case "merge-workflow":
      return (
        <ActionForm action={mergePackagePr.bind(null, packageId, "workflow")}>
          <SubmitButton size="sm">Merge setup PR #{step.number}</SubmitButton>
        </ActionForm>
      )
    case "workflow":
      return (
        <ActionForm action={openWorkflowPrAction.bind(null, packageId)}>
          <SubmitButton size="sm" variant="outline">
            {step.outdated ? "Update workflow" : "Add workflow"}
          </SubmitButton>
        </ActionForm>
      )
    case "token":
      return link(`/packages/${packageId}`, "Add npm token")
    case "fix":
      return hasAi ? (
        <ActionForm action={suggestReleaseFix.bind(null, step.releaseId)}>
          <SubmitButton size="sm">Fix {step.version} with AI</SubmitButton>
        </ActionForm>
      ) : (
        link(`/releases/${step.releaseId}`, `See why ${step.version} failed`)
      )
    case "merge-launcher":
      return (
        <ActionForm action={mergePackagePr.bind(null, packageId, "launcher")}>
          <SubmitButton size="sm">Merge npx PR #{step.number}</SubmitButton>
        </ActionForm>
      )
    case "runnable":
      return (
        <ActionForm action={makeRunnable.bind(null, packageId)}>
          <SubmitButton size="sm" variant="outline">
            Make runnable with npx
          </SubmitButton>
        </ActionForm>
      )
    case "ready":
      return link(`/publish?package=${packageId}`, "Release")
    case "unknown":
      return <span className="text-sm text-muted-foreground" title={step.reason}>Couldn&apos;t check GitHub</span>
  }
}
