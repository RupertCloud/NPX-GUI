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

export const WORKFLOW_YAML = `# Added by npxhub. Releases are started from the npxhub dashboard.
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
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org

      - name: Bump version and commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          npm version "$VERSION" --no-git-tag-version --allow-same-version
          git commit -am "chore(release): $GIT_TAG"

      - name: Build and test
        run: |
          if [ -f package-lock.json ]; then npm ci
          elif [ -f "$GITHUB_WORKSPACE/package-lock.json" ]; then (cd "$GITHUB_WORKSPACE" && npm ci)
          else npm install; fi
          npm run build --if-present
          npm test --if-present
          npm pack --dry-run --json > "$RUNNER_TEMP/pack.json"
          node -e '
            const files = require(process.env.RUNNER_TEMP + "/pack.json")[0].files.map(f => f.path)
            const bad = files.filter(p => /(^|\\/)(\\.env[^/]*|[^/]*\\.pem|id_rsa[^/]*)$/.test(p))
            console.log(files.length + " files in tarball")
            if (bad.length) { console.error("Blocked: secret-looking files in tarball: " + bad.join(", ")); process.exit(1) }
          '

      - name: Tag and GitHub release
        env:
          GH_TOKEN: \${{ github.token }}
        run: |
          git tag -a "$GIT_TAG" -m "$GIT_TAG"
          git push origin "HEAD:$GITHUB_REF_NAME" --follow-tags
          FLAGS=(--title "$GIT_TAG" --notes "$NOTES")
          if [ "$DIST_TAG" != "latest" ]; then FLAGS+=(--prerelease); fi
          gh release create "$GIT_TAG" "\${FLAGS[@]}"

      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
          PROVENANCE: \${{ inputs.provenance }}
        run: |
          if [ -z "$NODE_AUTH_TOKEN" ]; then echo "NPM_TOKEN secret is not set on this repo"; exit 1; fi
          FLAGS=(--access public --tag "$DIST_TAG")
          if [ "$PROVENANCE" = "true" ]; then FLAGS+=(--provenance); fi
          npm publish "\${FLAGS[@]}"

      - name: Verify install
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
