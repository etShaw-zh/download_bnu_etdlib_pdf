const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function popup(release, version = '0.1.0', ok = true) {
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', title: '', style: {}, classes: new Set(),
      classList: { add(name) { elements.get(id).classes.add(name); } },
      addEventListener() {}
    });
    return elements.get(id);
  };
  vm.runInNewContext(fs.readFileSync('bnu-etd-extension/popup.js', 'utf8'), {
    document: { getElementById: get },
    chrome: { runtime: { getManifest: () => ({ version }), onMessage: { addListener() {} } } },
    fetch: async () => { if (release instanceof Error) throw release; return { ok, json: async () => release }; },
    AbortSignal, URL
  });
  await new Promise(resolve => setImmediate(resolve));
  return get('update-btn');
}

test('new release highlights button and links to release page', async () => {
  const btn = await popup({ tag_name: 'v0.2.0', html_url: 'https://github.com/etShaw-zh/download_bnu_etdlib_pdf/releases/tag/v0.2.0' });
  assert.equal(btn.textContent, '有新版本 ↗');
  assert.ok(btn.classes.has('has-update'));
  assert.match(btn.href, /\/tag\/v0.2.0$/);
});

test('compares numeric components rather than version strings', async () => {
  assert.ok((await popup({ tag_name: 'v0.10.0' }, '0.9.0')).classes.has('has-update'));
  for (const tag_name of ['v0.1.0', 'v0.0.9', 'v0.1', 'v0.2.0-beta.1', 'bad']) {
    assert.ok(!(await popup({ tag_name })).classes.has('has-update'), tag_name);
  }
});

test('network and API failures leave manual update link usable', async () => {
  for (const [release, ok] of [[new Error('offline'), true], [{}, false], [{}, true]]) {
    const btn = await popup(release, '0.1.0', ok);
    assert.ok(!btn.classes.has('has-update'));
  }
});
