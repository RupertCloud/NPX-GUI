import "server-only"
import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

// On App Hosting, credentials and project come from the runtime environment.
// Locally, set GOOGLE_APPLICATION_CREDENTIALS and GOOGLE_CLOUD_PROJECT.
const app = getApps()[0] ?? initializeApp()

export const adminAuth = getAuth(app)
export const db = getFirestore(app)
