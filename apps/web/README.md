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
- **Run with npx:** for a package with no `bin`, npxhub opens a PR adding a fixed launcher script
  (`bin/<name>.cjs`) plus `bin`/`files` in package.json, so `npx <package>` starts the app locally. The launcher either
  runs an npm script (server apps) or serves a built static folder, supports `--port`, `--no-open`, `--version` and
  `--help`, and checks required env vars.
- **AI (optional, bring your own key):** in Settings, add an Anthropic-compatible or OpenAI-compatible provider. The key
  is encrypted like the GitHub token. npxhub then uses it to configure launchers from the repo (start command, port,
  build output, env vars; the model never writes the launcher code) and to diagnose failed releases, proposing fixes as
  PRs limited to files the job log mentions.
- **Next step per package:** the Packages list shows one button per package for the most useful fix: merge or
  update the workflow, add the npm token, fix a failed release with AI, or make the package runnable with npx.
- **Background jobs:** AI and launcher work runs as a job stored in Firestore (`jobs` collection). The server starts it
  with a separate request to its own `/api/jobs/<id>/run` endpoint (authenticated with a per-job HMAC), so it keeps
  running when the page is refreshed or closed; pages poll the job and show the result. A job that stops reporting
  for 15 minutes is shown as failed and can be started again.
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
