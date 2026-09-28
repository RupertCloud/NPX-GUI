"use client"

import { getApp, getApps, initializeApp } from "firebase/app"
import { getAuth, GithubAuthProvider } from "firebase/auth"

// Injected at build time from App Hosting's FIREBASE_WEBAPP_CONFIG (see next.config.ts).
const config = JSON.parse(process.env.NEXT_PUBLIC_FIREBASE_CONFIG || "{}")

export const app = getApps().length ? getApp() : initializeApp(config)
export const auth = getAuth(app)

// repo: read package.json, open the workflow PR, set the NPM_TOKEN secret.
// workflow: required to push a file under .github/workflows.
export const githubProvider = new GithubAuthProvider()
githubProvider.addScope("repo")
githubProvider.addScope("workflow")
