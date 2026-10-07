// The workflow npxhub adds to each repo (via PR). It is the only place `npm publish` runs.
// All inputs reach shell scripts through env vars, never ${{ }} interpolation (SEC-3).

export const WORKFLOW_FILE = "npxhub-publish.yml"
export const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILE}`
export const JOB_NAME = "npxhub publish"

// Step names in the workflow, in release order (REL-4). The release page maps job steps by these names.
export const RELEASE_STEPS = [
  "Checkout",
  "Bump version and commit",
  "Build and test",
  "Tag and GitHub release",
  "Publish to npm",
  "Verify install",
] as const

// Bump when the template changes; repos with an older marker are offered an update PR.
export const WORKFLOW_VERSION = 4
export const WORKFLOW_MARKER = `# npxhub-workflow: v${WORKFLOW_VERSION}`

export const isCurrentWorkflow = (content: string | null) => !!content?.includes(WORKFLOW_MARKER)

// Runs a workflow step with bash, mirrors its output to the GitHub log, and sends it to npxhub
// every 2 seconds so the release page can show it live. Requests are authenticated with the run's
// GitHub OIDC token (audience "npxhub"), so no secret is passed to the workflow. Values of env vars
// whose names contain TOKEN, SECRET, PASSWORD or KEY are replaced with ***. Sending problems never
// affect the step.
export const LOG_HELPER_JS = String.raw`"use strict"
const { spawn } = require("node:child_process")
const step = Number(process.argv[2])
const script = process.argv[3]
const url = process.env.NPXHUB_LOG_URL
const idUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
const idRequestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
const secrets = Object.keys(process.env)
  .filter((k) => ["TOKEN", "SECRET", "PASSWORD", "KEY"].some((s) => k.toUpperCase().includes(s)))
  .map((k) => process.env[k])
  .filter((v) => v && v.length >= 8)
let pending = ""
let queue = Promise.resolve()
let oidc = null
let oidcAt = 0
async function auth() {
  if (oidc && Date.now() - oidcAt < 240000) return oidc
  const res = await fetch(idUrl + "&audience=npxhub", {
    headers: { authorization: "bearer " + idRequestToken },
    signal: AbortSignal.timeout(10000),
  })
  oidc = (await res.json()).value
  oidcAt = Date.now()
  return oidc
}
function redact(text) {
  for (const s of secrets) text = text.split(s).join("***")
  return text
}
function send(final) {
  const cut = final ? pending.length : pending.lastIndexOf("\n") + 1
  if (!url || !idUrl || cut === 0) return queue
  const text = redact(pending.slice(0, cut))
  pending = pending.slice(cut)
  const body = JSON.stringify({ step: step, text: text })
  queue = queue
    .then(() => auth())
    .then((jwt) =>
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + jwt },
        body: body,
        signal: AbortSignal.timeout(10000),
      })
    )
    .catch(() => {})
  return queue
}
const timer = setInterval(() => send(false), 2000)
const child = spawn("bash", ["--noprofile", "--norc", "-eo", "pipefail", script], { stdio: ["inherit", "pipe", "pipe"] })
// Decode as UTF-8 so characters split across chunks (✓, emoji) stay intact.
child.stdout.setEncoding("utf8")
child.stderr.setEncoding("utf8")
child.stdout.on("data", (d) => {
  process.stdout.write(d)
  pending += d
})
child.stderr.on("data", (d) => {
  process.stderr.write(d)
  pending += d
})
child.on("close", (code) => {
  clearInterval(timer)
  if (code !== 0) pending += "\n[step exited with code " + code + "]\n"
  send(true).then(() => process.exit(code === null ? 1 : code))
})
`

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => (line ? " ".repeat(spaces) + line : line))
    .join("\n")

export const WORKFLOW_YAML = `# Added by npxhub. Releases are started from the npxhub dashboard.
${WORKFLOW_MARKER}
name: npxhub publish
run-name: npxhub \${{ inputs.release_id }}

on:
  workflow_dispatch:
    inputs:
      version: { description: "Version to publish", required: true, type: string }
      tag: { description: "npm dist-tag", required: true, type: string, default: latest }
      git_tag: { description: "Git tag to create", required: true, type: string }
      directory: { description: "Package directory", required: false, type: string, default: "." }
      notes: { description: "Release notes", required: false, type: string, default: "" }
      provenance: { description: "Publish with provenance", required: false, type: boolean, default: false }
      release_id: { description: "npxhub release id", required: true, type: string }
      log_url: { description: "Where to send live step output", required: false, type: string, default: "" }

permissions:
  contents: write
  id-token: write

concurrency:
  group: npxhub-publish-\${{ inputs.directory }}
  cancel-in-progress: false

jobs:
  publish:
    name: ${JOB_NAME}
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: \${{ inputs.directory }}
    env:
      VERSION: \${{ inputs.version }}
      DIST_TAG: \${{ inputs.tag }}
      GIT_TAG: \${{ inputs.git_tag }}
      NOTES: \${{ inputs.notes }}
      NPXHUB_LOG_URL: \${{ inputs.log_url }}
    steps:
      - name: Checkout
        uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v5
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org

      - name: Set up npxhub log
        run: |
          cat > /tmp/npxhub-log.cjs <<'NPXHUB_EOF'
${indent(LOG_HELPER_JS, 10)}
          NPXHUB_EOF

      - name: Bump version and commit
        shell: node /tmp/npxhub-log.cjs 2 {0}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          npm version "$VERSION" --no-git-tag-version --allow-same-version
          # A first release can equal the version already in package.json; then there is nothing to commit.
          if git diff --quiet; then echo "package.json already at $VERSION"; else git commit -am "chore(release): $GIT_TAG"; fi

      - name: Build and test
        shell: node /tmp/npxhub-log.cjs 3 {0}
        run: |
          if [ -f package-lock.json ]; then npm ci
          elif [ -f "$GITHUB_WORKSPACE/package-lock.json" ]; then (cd "$GITHUB_WORKSPACE" && npm ci)
          else npm install; fi
          npm run build --if-present
          npm test --if-present
          npm pack --dry-run --json > "$RUNNER_TEMP/pack.json"
          node -e '
            const files = require(process.env.RUNNER_TEMP + "/pack.json")[0].files.map(f => f.path)
            // Templates such as .env.example or .env.staging.example are allowed; real env files and keys are not.
            const secretLike = files.filter(p => /(^|\\/)(\\.env[^/]*|[^/]*\\.pem|id_rsa[^/]*)$/.test(p))
            const bad = secretLike.filter(p => !/\\.(example|sample|template|dist|pub)$/.test(p))
            if (secretLike.length > bad.length) console.log("Allowed templates: " + secretLike.filter(p => !bad.includes(p)).join(", "))
            console.log(files.length + " files in tarball")
            if (bad.length) { console.error("Blocked: secret-looking files in tarball: " + bad.join(", ")); process.exit(1) }
          '

      - name: Tag and GitHub release
        shell: node /tmp/npxhub-log.cjs 4 {0}
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          # Safe to re-run after a failed release: reuse an existing tag and release.
          if git rev-parse -q --verify "refs/tags/$GIT_TAG" > /dev/null; then
            echo "Tag $GIT_TAG already exists"
            git push origin "HEAD:$GITHUB_REF_NAME"
          else
            git tag -a "$GIT_TAG" -m "$GIT_TAG"
            git push origin "HEAD:$GITHUB_REF_NAME" --follow-tags
          fi
          FLAGS=(--title "$GIT_TAG" --notes "$NOTES")
          if [ "$DIST_TAG" != "latest" ]; then FLAGS+=(--prerelease); fi
          if gh release view "$GIT_TAG" > /dev/null 2>&1; then echo "Release $GIT_TAG already exists"; else gh release create "$GIT_TAG" "\${FLAGS[@]}"; fi

      - name: Publish to npm
        shell: node /tmp/npxhub-log.cjs 5 {0}
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
          PROVENANCE: \${{ inputs.provenance }}
        run: |
          if [ -z "$NODE_AUTH_TOKEN" ]; then echo "NPM_TOKEN secret is not set on this repo"; exit 1; fi
          FLAGS=(--access public --tag "$DIST_TAG")
          if [ "$PROVENANCE" = "true" ]; then FLAGS+=(--provenance); fi
          npm publish "\${FLAGS[@]}"

      - name: Verify install
        shell: node /tmp/npxhub-log.cjs 6 {0}
        run: |
          NAME=$(node -p "require('./package.json').name")
          HAS_BIN=$(node -p "Boolean(require('./package.json').bin)")
          for _ in $(seq 1 20); do npm view "$NAME@$VERSION" version > /dev/null 2>&1 && break; sleep 6; done
          cd "$(mktemp -d)"
          if [ "$HAS_BIN" = "true" ]; then
            timeout 120 npx -y "$NAME@$VERSION" --version < /dev/null || timeout 120 npx -y "$NAME@$VERSION" --help < /dev/null
          else
            npm install "$NAME@$VERSION" --no-save
          fi
`
