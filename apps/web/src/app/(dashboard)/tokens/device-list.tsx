"use client"

import { useState } from "react"
import { Laptop } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { timeAgo } from "@/lib/format"
import type { Device } from "@/lib/mock-data"

export function DeviceList({ initial }: { initial: Device[] }) {
  const [list, setList] = useState(initial)

  if (list.length === 0) {
    return (
      <p className="text-muted-foreground">
        No linked machines. Run <code className="font-mono">npx npxhub</code> in a terminal to link one.
      </p>
    )
  }

  return (
    <ul className="divide-y rounded-lg border">
      {list.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
          <Laptop className="size-4 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{d.name}</div>
            <div className="text-xs text-muted-foreground">
              {d.os} · CLI {d.cliVersion} · linked {timeAgo(d.createdAt)}
            </div>
          </div>
          <span className="text-sm text-muted-foreground">used {timeAgo(d.lastUsedAt)}</span>
          <Dialog>
            <DialogTrigger render={<Button variant="destructive" size="sm" />}>Revoke</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Revoke {d.name}?</DialogTitle>
                <DialogDescription>
                  The CLI on this machine will fail with exit code 2 on its next call until it is linked again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <DialogClose
                  render={<Button variant="destructive" />}
                  onClick={() => {
                    setList((l) => l.filter((x) => x.id !== d.id))
                    toast.success(`${d.name} revoked`)
                  }}
                >
                  Revoke
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </li>
      ))}
    </ul>
  )
}
