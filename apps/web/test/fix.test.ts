import assert from "node:assert/strict"
import { test } from "node:test"
import { validateEdits } from "../src/lib/fix"

test("validateEdits: edits to shown files and new files inside the package only", () => {
  const shown = [{ path: "package.json", content: '{"name":"a"}' }]
  const existing = new Set(["package.json", "src/index.ts", ".github/workflows/ci.yml"])
  const e = (path: string, content = "x") => ({ path, content, reason: "r" })
  const out = validateEdits(
    [
      e("package.json", '{"name":"a","files":["dist"]}'), // changed shown file
      e(".npmignore", ".env*\n"), // new file: allowed
      e("src/index.ts"), // exists but wasn't shown: rejected
      e(".github/workflows/evil.yml"), // never under .github
      e("../outside"), // traversal
      e("/etc/passwd"), // absolute
      e("big.txt", "x".repeat(50_000)), // too large
    ],
    shown,
    existing,
    "."
  )
  assert.deepEqual(out.map((x) => [x.path, x.isNew]), [["package.json", false], [".npmignore", true]])
  // An unchanged shown file is dropped.
  assert.equal(validateEdits([e("package.json", '{"name":"a"}')], shown, existing, ".").length, 0)
  // In a monorepo package, new files must stay inside its directory.
  const mono = validateEdits([e("packages/cli/.npmignore"), e(".npmignore")], [], new Set(), "packages/cli")
  assert.deepEqual(mono.map((x) => x.path), ["packages/cli/.npmignore"])
})
