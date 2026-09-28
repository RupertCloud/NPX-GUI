# npxhub web app (UI only)

The npxhub dashboard from the SRS (§2, §3, §5), built with Next.js (App Router), TypeScript and ShadCN.
All data is mocked in `src/lib/mock-data.ts`; there is no API, auth or GitHub/npm integration yet.

```sh
npm install
npm run dev   # http://localhost:3000
```

| Route | What it covers |
| --- | --- |
| `/packages` | Package list, stat tiles incl. "without provenance" (PKG-1) |
| `/packages/new` | Pick a repo, review what package.json contains (PKG-2) |
| `/packages/[name]` | Dist-tags, trusted-publisher values with copy buttons (NPM-2), settings, collaborators, `npm deprecate` command (NPM-4), history |
| `/publish` | Bump / explicit version with validation (REL-2), dist-tag, editable notes, pre-flight blockers and warnings |
| `/releases`, `/releases/[id]` | Release history and the six-step job view with logs (REL-4) |
| `/releases/run` | Simulated live run after clicking Publish (stands in for SSE, REL-5) |
| `/tokens` | Linked machines with revoke, GitHub App installations |
| `/link` | Device-code confirmation page for `npx npxhub` (Journey A) |
