import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // App Hosting provides FIREBASE_WEBAPP_CONFIG at build time; locally set NEXT_PUBLIC_FIREBASE_CONFIG.
    NEXT_PUBLIC_FIREBASE_CONFIG: process.env.FIREBASE_WEBAPP_CONFIG ?? process.env.NEXT_PUBLIC_FIREBASE_CONFIG ?? "",
  },
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
