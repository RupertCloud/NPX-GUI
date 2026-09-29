"use client"

import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"

// Server errors reach the browser without details in production, so offer the two likely fixes.
export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="py-16 text-center">
      <h1 className="font-heading text-2xl">Something went wrong</h1>
      <p className="mx-auto mt-2 max-w-md text-muted-foreground">
        npxhub couldn&apos;t load data from GitHub or npm. Try again. If your GitHub access was revoked or expired, sign in
        again.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={reset}>
          Try again
        </Button>
        <Link href="/login" className={buttonVariants()}>
          Sign in again
        </Link>
      </div>
    </div>
  )
}
