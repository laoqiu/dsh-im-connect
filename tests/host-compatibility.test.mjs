import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

const root = process.env.DSH_BOOT_CONTRACT_ROOT
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('host installation accepts alpha.2 without an exemption and preserves the existing release list', { skip: !root }, async () => {
  const { evaluatePluginCompatibility } = await import(pathToFileURL(join(root, 'lib/index.js')).href)
  const previous = { ...manifest, peerDependencies: Object.fromEntries(Object.entries(manifest.peerDependencies)
    .map(([name, range]) => [name, range.split(' || ').filter(version => version !== '0.2.1-alpha.2').join(' || ')])) }
  assert.ok(evaluatePluginCompatibility(previous, {}, '0.2.1-alpha.2'))
  for (const version of ['0.2.1-alpha.2', '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-rc.1', '0.2.1-rc.2']) {
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, version)
  }
  for (const version of ['0.2.1-alpha.1', '0.2.1-alpha.3', '0.2.1-alpha.5', '0.2.0']) {
    assert.ok(evaluatePluginCompatibility(manifest, {}, version), version)
  }
})

test('development dependencies use the alpha.2 SDK and satisfy the declared peers', { skip: !root }, async () => {
  const require = createRequire(join(root, 'package.json'))
  const semver = require('semver')
  for (const [name, range] of Object.entries(manifest.peerDependencies)) {
    if (!name.startsWith('@deepseek-ai/')) continue
    assert.equal(semver.satisfies(manifest.devDependencies[name], range), true, name)
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(manifest.devDependencies[name], '0.2.1-alpha.2')
  }
})
