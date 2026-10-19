import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { handlePluginUpdateEscape, manualPluginUpdateCommand } from '../src/plugin-update-ui.js'
import { isDshCliEntry, isNewerVersion, isTrustedUpdateRequest, githubReleaseVersion, PLUGIN_UPDATE_HEADER, registerPluginUpdater, resolveUpdateRuntime, shouldNotifyParent } from '../lib/plugin-updater.js'

test('IM 独立更新只接受同源专用请求', () => {
  assert.equal(isNewerVersion('0.1.34', '0.1.35'), true)
  assert.equal(isNewerVersion('0.1.34', '0.1.34'), false)
  assert.equal(isNewerVersion('0.1.0-rc.2', '0.1.0-rc.10'), true)
  assert.equal(isNewerVersion('0.1.0-rc.10', '0.1.0-rc.2'), false)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', origin: 'http://localhost:3000', host: 'localhost:3000' }, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedUpdateRequest({ headers: { origin: 'http://localhost:3000', host: 'localhost:3000' } }), false)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', host: '127.0.0.1:19387' }, socket: { remoteAddress: '::1' } }), true)
  assert.equal(isTrustedUpdateRequest({ headers: { [PLUGIN_UPDATE_HEADER]: '1', origin: 'http://localhost:3000', host: 'localhost:3000' }, socket: { remoteAddress: '192.168.1.8' } }), false)
  assert.equal(manualPluginUpdateCommand('web', 'https://github.com/laoqiu/dsh-im-connect/archive/refs/tags/v1.0.9.tar.gz'), 'dsh plugin --profile web add https://github.com/laoqiu/dsh-im-connect/archive/refs/tags/v1.0.9.tar.gz')
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: '@deepseek-ai/dsh', bin: { dsh: 'lib/bin.js' } }, 'C:/tools/dsh'), true)
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: '@deepseek-ai/dsh', bin: { dsh: 'lib/other.js' } }, 'C:/tools/dsh'), false)
  assert.equal(isDshCliEntry('C:/tools/dsh/lib/bin.js', { name: 'other-cli', bin: { dsh: 'lib/bin.js' } }, 'C:/tools/dsh'), false)
})

test('IM 更新弹窗消费 ESC，避免继续关闭底层设置页', () => {
  const calls = []
  assert.equal(handlePluginUpdateEscape({
    key: 'Escape',
    preventDefault: () => calls.push('prevent'),
    stopPropagation: () => calls.push('stop'),
    stopImmediatePropagation: () => calls.push('stopImmediate'),
  }, () => calls.push('close')), true)
  assert.deepEqual(calls, ['prevent', 'stop', 'stopImmediate', 'close'])
})

test('IM 客户端与 Host 绑定自身更新入口', async () => {
  const client = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const updateUi = await readFile(new URL('../src/plugin-update-ui.js', import.meta.url), 'utf8')
  const host = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(client, /packageName: "@michengai\/dsh-im-connect"/)
  assert.match(client, /titleRowSelector: "\.ima-title-row"/)
  assert.match(client, /createIcon: createPluginUpdateIcon/)
  assert.match(client, /ACTION_ICON_PATHS/)
  assert.match(client, /document\.createElementNS\("http:\/\/www\.w3\.org\/2000\/svg", "svg"\)/)
  assert.doesNotMatch(client, /react-dom\/client/)
  assert.match(updateUi, /data-mpi-label/)
  assert.match(updateUi, /variant: "outline", size: "sm"/)
  assert.match(updateUi, /className: "mpi-dialog"/)
  assert.match(updateUi, /host\.className = "mpi-check-host"/)
  assert.match(updateUi, /document\.addEventListener\("keydown", onKey, true\)/)
  assert.match(updateUi, /if \(version\.textContent !== versionLabel\)/)
  assert.match(updateUi, /color: "#e8b15a"/)
  assert.match(updateUi, /manualHintDesktop/)
  assert.match(updateUi, /else if \(payload\.latestCheckFailed\)/)
  assert.doesNotMatch(updateUi, /width:\s*680/)
  assert.doesNotMatch(updateUi, /zIndex:\s*1200/)
  assert.match(updateUi, /ReactDOM\.createRoot/)
  assert.doesNotMatch(updateUi, /require\("react-dom\/client"\)/)
  const packed = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(packed, /^\{\s*handlePluginUpdateEscape,/m)
  assert.ok(
    client.indexOf('const t = ctx.locale.bind(IM_LOCALE_NS)') < client.indexOf('ctx.effect(() => observePluginUpdate'),
    '更新 UI effect 同步执行前必须先初始化 locale 绑定',
  )
  assert.match(host, /endpoint: '\/api\/michengai\/dsh-im-connect\/update'/)
  assert.match(await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8'), /const notifyParent = shouldNotifyParent\(target\)/)
  assert.match(await readFile(new URL('../src/plugin-updater.ts', import.meta.url), 'utf8'), /isDshCliEntry/)
})

test('官方 Desktop 在线更新指向 desktop profile，且不通知父进程', () => {
  const runtime = resolveUpdateRuntime({
    get(name) {
      if (name === 'profileContext') return {
        name: 'desktop',
        dir: 'D:/profile/desktop',
        packageManager: { command: 'D:/Tools/DeepSeek Harness/DeepSeek Harness.exe', args: ['--expose-internals', 'D:/runtime/pnpm.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } },
      }
      return undefined
    },
  }, {
    argv: ['node', 'D:/app/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js'],
    env: {},
    cwd: 'D:/profile/desktop',
    homeDir: 'C:/Users/YUJIYU',
  })
  assert.equal(runtime.profileName, 'desktop')
  assert.equal(runtime.officialDesktop, true)
  assert.equal(runtime.canAutoUpdate, true)
  assert.equal(shouldNotifyParent(runtime, () => {}), false)
})

test('GitHub 更新仅接受 v 开头的稳定版本标签', () => {
  assert.equal(githubReleaseVersion({ tag_name: 'v1.0.9', draft: false, prerelease: false }), '1.0.9')
  for (const value of [null, {}, { tag_name: 'v1.0.9' }, { tag_name: '1.0.9', draft: false, prerelease: false },
    { tag_name: 'v1.1.0-beta.1', draft: false, prerelease: false },
    { tag_name: 'v1.0.9/../../main', draft: false, prerelease: false },
    { tag_name: 'v1.0.9', draft: true, prerelease: false }, { tag_name: 'v1.0.9', draft: false, prerelease: true }]) {
    assert.equal(githubReleaseVersion(value), undefined)
  }
})

test('检查与安装均来自 fork Release，查询失败和旧版本不会启动安装', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-im-release-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'package.json'), JSON.stringify({ version: '1.0.9' }))
  let release = { tag_name: 'v1.1.0', draft: false, prerelease: false }
  let httpStatus = 200
  let handler
  const installed = [], urls = []
  t.mock.method(globalThis, 'fetch', async (url) => {
    urls.push(url)
    return Response.json(release, { status: httpStatus })
  })
  registerPluginUpdater({
    webServer: { register(route) { handler = route.handler; return () => {} } },
    get(name) {
      if (name === 'profileContext') return { name: 'desktop', dir }
      if (name === 'pluginManager') return { async installBundle(spec) { installed.push(spec); return { application: 'restart-required' } } }
    },
  }, { endpoint: '/update', packageName: '@michengai/dsh-im-connect', repository: 'laoqiu/dsh-im-connect', manifestUrl: pathToFileURL(join(dir, 'package.json')) })
  const request = async method => {
    let status, body
    await handler({ method, headers: { [PLUGIN_UPDATE_HEADER]: '1', host: 'localhost:3000', origin: 'http://localhost:3000' }, socket: { remoteAddress: '::1' } }, {
      writeHead(code) { status = code }, end(value) { body = value ? JSON.parse(value) : undefined },
    })
    return { status, body }
  }
  const checked = await request('GET')
  assert.equal(checked.body.latestVersion, '1.1.0')
  assert.equal(checked.body.installSpec, 'https://github.com/laoqiu/dsh-im-connect/archive/refs/tags/v1.1.0.tar.gz')
  assert.equal(checked.body.updateAvailable, true)
  assert.equal((await request('POST')).status, 200)
  assert.deepEqual(installed, [checked.body.installSpec])
  release = { tag_name: 'v1.0.8', draft: false, prerelease: false }
  assert.equal((await request('POST')).body.updateAvailable, false)
  assert.equal(installed.length, 1)
  httpStatus = 403
  assert.equal((await request('GET')).body.latestCheckFailed, true)
  assert.equal((await request('POST')).status, 503)
  assert.equal(installed.length, 1)
  assert.ok(urls.length >= 5)
  assert.ok(urls.every(url => url === 'https://api.github.com/repos/laoqiu/dsh-im-connect/releases/latest'))
})
