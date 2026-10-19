import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// 读发布产物 lib/client.js（npm test 先 build 再跑），确保验证的就是上线文件
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('大小写敏感工作区优先精确匹配，POSIX 路径不忽略大小写', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('function selectableWorkspace(')
  const end = source.indexOf('\n    function ', start + 1)
  const select = new Function(`${source.slice(start, end)}\nreturn selectableWorkspace;`)()
  const items = [{ path: '/srv/project' }, { path: '/srv/Project' }]
  assert.equal(select('/srv/Project', items), '/srv/Project')
  assert.equal(select('/srv/PROJECT', [{ path: '/srv/Project' }, { path: '/srv/PROJECT' }]), '/srv/PROJECT')
  assert.equal(select('/srv/Project', [{ path: '/srv/other' }, { path: '/srv/project' }]), '/srv/other')
})

test('没有已保存工作区时，新增账号默认落在下拉里能选中的工作区', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('function selectableWorkspace(')
  const end = source.indexOf('\n    function ', start + 1)
  assert.ok(start >= 0 && end > start, '新增账号必须用可选工作区收口默认目录')
  const selectableWorkspace = new Function(`${source.slice(start, end)}\nreturn selectableWorkspace;`)()
  const listed = [
    { path: 'D:/Repository/deepseek-harness-plugin/dsh-btw', title: 'dsh-btw' },
    { path: 'D:/Repository/deepseek-harness-plugin/dsh-codex-ui', title: 'dsh-codex-ui' },
  ]
  assert.equal(selectableWorkspace('C:/Users/YUJIYU/.dsh/profiles/desktop', listed), listed[0].path)
  assert.equal(selectableWorkspace('D:\\Repository\\deepseek-harness-plugin\\dsh-btw\\', listed), listed[0].path)
  assert.equal(selectableWorkspace('', []), '')
  const bind = source.slice(source.indexOf('function BindModal'), source.indexOf('function AccountSettingsPicker'))
  assert.match(bind, /selectableWorkspace\(defaults && defaults\.cwd, workspaces\)/)
})

test('没有工作区时不能保存，必须先创建', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = source.indexOf('function workspaceIsListed(')
    const end = source.indexOf('function BindModal(', start)
  assert.ok(start >= 0 && end > start, '保存前必须判断工作区是否在列表中')
  const workspaceIsListed = new Function(`${source.slice(start, end)}\nreturn workspaceIsListed;`)()
  assert.equal(workspaceIsListed('D:/profile', []), false)
  assert.equal(workspaceIsListed('', [{ path: 'D:/proj' }]), false)
    const slash = String.fromCharCode(92)
    assert.equal(workspaceIsListed(`D:${slash}proj${slash}`, [{ path: 'D:/proj' }]), true)
  const bind = source.slice(source.indexOf('function BindModal'), source.indexOf('function AccountSettingsPicker'))
  const picker = source.slice(source.indexOf('function AccountSettingsPicker'), source.indexOf('function CommandPermissionSettings'))
  assert.match(bind, /!workspaceIsListed\(settings\.cwd, workspaces\)/)
  assert.match(bind, /setError\(t\("bind.defaultsRequired"\)\)/)
  assert.match(picker, /items\.length === 0/)
  assert.match(picker, /composer\.workspaceRequired/)
  assert.match(source, /"composer\.workspaceRequired": "请先添加工作区，否则无法保存"/)
  assert.match(source, /"composer\.workspaceRequired": "Add a workspace before saving\."/)
})

test('bind modal captures escape before settings', () => {
  assert.match(client, /function BindModal/)
  assert.match(client, /stopImmediatePropagation/)
  assert.match(client, /addEventListener\(.keydown., onKeyDown, true\)/)
})


test('绑定成功后自动关闭配置弹窗，不连带关设置页', () => {
  assert.match(client, /finish\(800\)/)
  assert.match(client, /finished\.current/)
  assert.match(client, /className: "ima-bind-modal"/)
  assert.match(client, /keyboard: false/)
})

test('账号保存完成前显示保存中，不提前进入绑定成功分支', () => {
  assert.match(client, /status === "saving"/)
  assert.match(client, /t\("bind\.saving"\)/)
  assert.match(client, /"bind\.saving": "正在保存账号…"/)
  assert.match(client, /"bind\.saving": "Saving account…"/)
  assert.match(client, /if \(finished\.current \|\| saving\) return/)
  assert.match(client, /if \(event\.key !== "Escape"\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*if \(typeof event\.stopImmediatePropagation === "function"\) event\.stopImmediatePropagation\(\);\s*if \(saving\) return;/)
  assert.match(client, /maskClosable: !saving/)
})


function renderBinding(kind) {
  const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  const start = source.indexOf('function BindModal(')
  const end = source.indexOf('    const BUILT_IN_PERMISSION_LABELS', start)
  const h = React.createElement
  const Modal = ({ children, footer }) => h('section', { role: 'dialog' }, children, footer)
  const env = {
    useState: React.useState, useEffect: React.useEffect, useCallback: React.useCallback, useRef: React.useRef,
    h, Modal, Input: 'input', NoticeBar: 'aside',
    preferredAssistant: () => ({ provider: 'fixture', model: 'model' }),
    selectableWorkspace: () => '/workspace',
    hostModalButton: (label, onClick, variant, props) => h('button', { ...props, onClick }, label),
    hintOf: () => 'Scan to connect', channelLabel: ch => ch.label, fieldLabel: (_ch, field) => field.label,
  }
  const BindModal = new Function(...Object.keys(env), source.slice(start, end) + '; return BindModal;')(...Object.values(env))
  return renderToStaticMarkup(h(BindModal, {
    ch: { id: 'fixture', label: 'Fixture', kind, fields: [{ key: 'token', label: 'Token', secret: true }] },
    defaults: { permission: 'review' }, workspaces: [{ path: '/workspace' }], t: key => key,
  }))
}

test('扫码渠道的新增入口只渲染二维码操作，不显示凭据或账号配置', () => {
  const html = renderBinding('qr-or-credentials')
  assert.match(html, /action.generateQr/)
  assert.doesNotMatch(html, /<input|ima-account-settings|ima-command-permissions|role="tab"/)
})

test('仅凭据渠道保留 Token 输入，不显示账号配置', () => {
  const html = renderBinding('credentials')
  assert.match(html, /<input[^>]+type="password"/)
  assert.doesNotMatch(html, /action.generateQr|ima-account-settings|ima-command-permissions/)
})
