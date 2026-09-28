"use client"

import { useRouter } from "next/navigation"
import { signOut } from "firebase/auth"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { auth } from "@/lib/firebase/client"

export function SignOutButton() {
  const router = useRouter()
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await signOut(auth)
        await fetch("/api/session", { method: "DELETE" })
        router.replace("/login")
      }}
    >
      <LogOut /> Sign out
    </Button>
  )
}
