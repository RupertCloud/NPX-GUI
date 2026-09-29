"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { FirebaseError } from "firebase/app"
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  signInWithPopup,
  type OAuthCredential,
} from "firebase/auth"
import { Button } from "@/components/ui/button"
import { auth, githubProvider } from "@/lib/firebase/client"
import { postSession } from "@/lib/firebase/session-client"

export function LoginButton({ next }: { next: string }) {
  const router = useRouter()
  const [state, setState] = useState<"checking" | "idle" | "busy">("checking")
  const [error, setError] = useState<string>()
  const signingIn = useRef(false)
  // GitHub credential waiting to be linked to an existing account with the same email.
  const [pending, setPending] = useState<OAuthCredential | null>(null)

  // Returning user with a Firebase session: refresh the cookie and continue.
  useEffect(
    () =>
      onAuthStateChanged(auth, async (user) => {
        if (signingIn.current) return
        if (!user) return setState("idle")
        try {
          await postSession(await user.getIdToken())
          router.replace(next)
        } catch {
          setState("idle")
        }
      }),
    [next, router]
  )

  async function signIn() {
    signingIn.current = true
    setState("busy")
    setError(undefined)
    try {
      const result = await signInWithPopup(auth, githubProvider)
      const githubToken = GithubAuthProvider.credentialFromResult(result)?.accessToken
      if (!githubToken) throw new Error("GitHub did not return an access token")
      await postSession(await result.user.getIdToken(), githubToken)
      router.replace(next)
    } catch (e) {
      const credential = GithubAuthProvider.credentialFromError(e as FirebaseError)
      if ((e as FirebaseError).code === "auth/account-exists-with-different-credential" && credential?.accessToken) {
        setPending(credential)
        setError("Your GitHub email already has an account here, created with Google. Continue with Google once to link GitHub to it.")
      } else {
        setError((e as Error).message)
      }
      setState("idle")
      signingIn.current = false
    }
  }

  // Sign in to the existing account with Google, then attach the GitHub credential to it.
  async function linkGitHub() {
    if (!pending) return
    signingIn.current = true
    setState("busy")
    setError(undefined)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      await linkWithCredential(result.user, pending)
      await postSession(await result.user.getIdToken(true), pending.accessToken)
      router.replace(next)
    } catch (e) {
      setError((e as Error).message)
      setState("idle")
      signingIn.current = false
    }
  }

  return (
    <>
      <Button size="lg" className="mt-8 w-full" onClick={pending ? linkGitHub : signIn} disabled={state !== "idle"}>
        {state === "checking"
          ? "Checking session…"
          : state === "busy"
            ? "Signing in…"
            : pending
              ? "Continue with Google"
              : "Sign in with GitHub"}
      </Button>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}
