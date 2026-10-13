const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { element } = require('./helpers/dom.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

async function exportPage(fail = false) {
  let listener;
  const body = element('body');
  const events = new Map();
  const snapshots = [];
  const images = [0, 1].map(i => ({ tagName: 'IMG', complete: true, naturalWidth: 100, naturalHeight: 200, src: `https://etdlib.bnu.edu.cn/${i}.jpg` }));
  const containers = images.map((image, i) => ({ id: `loadingBg${i}`, querySelector: () => image, scrollIntoView() {} }));
  const all = node => [node, ...node.children.flatMap(all)];
  const overlay = () => body.children.find(n => n.id === 'crow-pdf-export-overlay');
  const doc = {
    title: '测试论文', body, documentElement: body,
    querySelector: s => s.includes('.loadingBg') ? containers[0] : null,
    querySelectorAll: () => containers, getElementById: () => null,
    createElement: tag => { const n = element(tag); n.click = () => {}; return n; },
    addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type, fn) { if (events.get(type) === fn) events.delete(type); }
  };
  vm.runInNewContext(fs.readFileSync('bnu-etd-extension/content-script.js', 'utf8'), {
    document: doc, window: {}, location: { pathname: '/read/pdfindex1.jsp' },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } }, async sendMessage(msg) {
      const host = overlay();
      snapshots.push({ message: msg, host, nodes: host ? all(host.shadowRoot).map(n => ({ tagName: n.tagName, text: n.textContent, value: n.value })) : [] });
      return { ok: true };
    } } },
    fetch: async () => ({ ok: !fail, status: 403, arrayBuffer: async () => new Uint8Array([255,216,255,217]).buffer }),
    URL: class extends URL { static createObjectURL() { return 'blob:test'; } static revokeObjectURL() {} },
    setTimeout: fn => setImmediate(fn), clearTimeout, TextEncoder, Uint8Array, Blob
  });
  listener({ target: 'content-script', type: 'start-export' }, {}, () => {});
  for (let i = 0; i < 12; i++) await flush();
  return { snapshots, overlay: overlay(), events };
}

test('overlay shows phase, page counts and percent through loading and image download', async () => {
  const page = await exportPage();
  for (const phase of ['加载页面', '下载图像']) {
    for (const current of [0, 1, 2]) {
      const sample = page.snapshots.find(s => s.message.type === 'progress' && s.message.text === phase && s.message.current === current);
      assert.ok(sample?.host, `${phase} ${current}: visible overlay`);
      assert.ok(sample.nodes.some(n => n.text === `${current} / 2 · ${current * 50}%`));
      assert.ok(sample.nodes.some(n => n.tagName === 'PROGRESS' && n.value === current * 50));
    }
  }
  assert.equal(page.overlay, undefined);
  assert.ok(!page.events.has('wheel'));
  assert.ok(!page.events.has('keydown'));
});

test('export failure removes overlay and input blockers', async () => {
  const page = await exportPage(true);
  assert.ok(page.snapshots.some(s => s.host));
  assert.ok(page.snapshots.some(s => s.message.type === 'error'));
  assert.equal(page.overlay, undefined);
  assert.ok(!page.events.has('wheel'));
});
