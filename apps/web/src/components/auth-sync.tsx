"use client"

import { useEffect } from "react"
import { onIdTokenChanged } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import { postSession } from "@/lib/firebase/session-client"

// Firebase refreshes the ID token hourly; mirror it into the session cookie.
export function AuthSync() {
  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (user) await postSession(await user.getIdToken()).catch(() => {})
      }),
    []
  )
  return null
}
