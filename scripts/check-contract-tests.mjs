// Fails if any file under tests/contract/ differs from tests/contract/MANIFEST.sha256.
// The contract suite is the acceptance bar; it is edited only by the reviewer, who regenerates the manifest.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../tests/contract', import.meta.url).pathname
const manifestPath = join(root, 'MANIFEST.sha256')

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const actual = new Map(
  walk(root)
    .filter((p) => p !== manifestPath)
    .map((p) => [relative(root, p), createHash('sha256').update(readFileSync(p)).digest('hex')]),
)

if (process.argv.includes('--write')) {
  const lines = [...actual.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, h]) => `${h}  ${f}`)
  await import('node:fs').then((fs) => fs.writeFileSync(manifestPath, lines.join('\n') + '\n'))
  console.log(`wrote ${lines.length} entries to tests/contract/MANIFEST.sha256`)
  process.exit(0)
}

const expected = new Map(
  readFileSync(manifestPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [h, f] = l.split(/\s{2,}/)
      return [f, h]
    }),
)

const problems = []
for (const [f, h] of expected) {
  if (!actual.has(f)) problems.push(`missing: ${f}`)
  else if (actual.get(f) !== h) problems.push(`modified: ${f}`)
}
for (const f of actual.keys()) if (!expected.has(f)) problems.push(`unlisted: ${f}`)

if (problems.length) {
  console.error('Contract tests changed without a manifest update:\n  ' + problems.join('\n  '))
  console.error('Only the reviewer regenerates the manifest: node scripts/check-contract-tests.mjs --write')
  process.exit(1)
}
console.log(`contract tests intact (${actual.size} files)`)
