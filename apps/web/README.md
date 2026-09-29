# npxhub web app

Publish dashboard for npm packages (see the SRS at the repo root). Next.js (App Router) + ShadCN, Firebase Auth,
Firestore, and GitHub Actions for the actual publish.

## How it works

- **Sign-in:** GitHub through Firebase Auth. The GitHub access token (scopes `repo`, `workflow`) is stored in Firestore,
  encrypted with AES-256-GCM, and used only for that user's own actions.
- **Packages:** pick one of your GitHub repos (optionally a subdirectory). npxhub reads `package.json`, then opens a PR
  adding `.github/workflows/npxhub-publish.yml`.
- **npm token:** a package admin pastes an npm granular access token once. npxhub encrypts it into the repo's
  `NPM_TOKEN` Actions secret and keeps no copy.
- **Releases:** Publish runs pre-flight checks against the real repo and registry, then dispatches the workflow, which
  bumps the version, builds and tests, blocks secret-looking files in the tarball, tags, creates the GitHub release,
  publishes (with provenance for public repos) and verifies the install with `npx`. The release page follows the run live.
- **Teams:** admins add collaborators by GitHub username as `developer` or `admin`. Access checks run on the server;
  GitHub's own repo permissions still apply to each user.
- **Registry data** (versions, dist-tags, downloads, provenance) comes from the public npm APIs.

## One-time Firebase setup

1. **Authentication → Sign-in method → GitHub:** enable it with a GitHub OAuth App's client ID and secret.
   Under **Settings → Authorized domains**, add your App Hosting domain (`<backend>--<project>.<region>.hosted.app`).
2. **Firestore:** create a database (Native mode) and publish `firestore.rules` (all client access denied; the server uses
   firebase-admin).
3. **Encryption key secret** (run from `apps/web`):
   ```sh
   openssl rand -base64 32 | firebase apphosting:secrets:set npxhub-token-key --data-file=-
   firebase apphosting:secrets:grantaccess npxhub-token-key --backend <backend-id>
   ```
4. **App Hosting backend:** root directory `apps/web`, live branch `main`.

If the server logs `PERMISSION_DENIED` from Firestore, grant the backend's service account
(`firebase-app-hosting-compute@<project>.iam.gserviceaccount.com`) the **Cloud Datastore User** role.

For repos in a GitHub organization that restricts third-party OAuth apps, an org owner must approve the OAuth app.

## Local development

```sh
cp .env.example .env.local   # fill in the values
npm install
npm run dev
npm test                     # unit tests
```
