const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { element } = require('./helpers/dom.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const title = '社交媒体时代中国年轻人情感问题及应对措施探究';

function detail({ author = '韩里夫', button = true } = {}) {
  let listener, clicked = false;
  const messages = [];
  const doc = {
    title: '首页',
    querySelector: selector => selector === '.title-box .title' ? { textContent: title } : null,
    querySelectorAll: selector => selector === 'li' ? [{ querySelector: s => s === 'label' ? { textContent: ' 作者： ' } : { textContent: author } }] :
      selector === 'button' && button ? [{ textContent: ' 查看全文 ', disabled: false, click() { clicked = true; } }] : [],
    addEventListener() {}
  };
  vm.runInNewContext(fs.readFileSync('bnu-etd-extension/content-script.js', 'utf8'), {
    document: doc, location: { pathname: '/detail', href: 'https://etdlib.bnu.edu.cn/detail?keyid=one' },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; } }, sendMessage: async msg => { messages.push(msg); return { ok: true }; } } },
    URL, setTimeout, clearTimeout, TextEncoder
  });
  return { messages, get clicked() { return clicked; }, async start() {
    let response;
    listener({ target: 'content-script', type: 'start-export' }, {}, r => { response = r; });
    await flush();
    return response;
  } };
}

test('detail page saves title and author before opening full text', async () => {
  const page = detail();
  assert.equal((await page.start()).ok, true);
  const prepare = page.messages.find(m => m.type === 'prepare-reader');
  assert.ok(prepare);
  assert.equal(prepare.metadata.title, title);
  assert.equal(prepare.metadata.author, '韩里夫');
  assert.equal(prepare.autoStart, true);
  assert.equal(page.clicked, true);
});

test('missing full text button reports a helpful error without clicking', async () => {
  const page = detail({ button: false });
  await page.start();
  assert.equal(page.clicked, false);
  assert.match(page.messages.find(m => m.type === 'error')?.error || '', /查看全文/);
});

function worker() {
  let listener, createdListener, updatedListener;
  const storage = {};
  vm.runInNewContext(fs.readFileSync('bnu-etd-extension/service-worker.js', 'utf8'), {
    chrome: {
      runtime: { onMessage: { addListener(fn) { listener = fn; } } },
      storage: { session: {
        async get(key) { return { [key]: storage[key] }; },
        async set(data) { Object.assign(storage, data); },
        async remove(key) { delete storage[key]; }
      } },
      tabs: { async get(id) { return { id, openerTabId: [2, 4].includes(id) ? 1 : undefined }; },
        async update() {}, onCreated: { addListener(fn) { createdListener = fn; } }, onUpdated: { addListener(fn) { updatedListener = fn; } }, onRemoved: { addListener() {} } }
    }, Date, URL, setTimeout, clearTimeout, Blob, crypto: require("node:crypto").webcrypto
  });
  return { storage, async created(id, url = "https://etdlib.bnu.edu.cn/loading") { createdListener?.({ id, openerTabId: 1, url }); await flush(); }, async updated(id, url) { updatedListener?.(id, { url }); await flush(); }, async message(type, tabId, data = {}) {
    let response;
    listener({ target: 'service-worker', type, ...data }, { tab: { id: tabId, url: type === 'prepare-reader' ? 'https://etdlib.bnu.edu.cn/detail?keyid=one' : 'https://etdlib.bnu.edu.cn/read/pdfindex1.jsp?fid=one' } }, r => { response = r; });
    await flush();
    return response;
  } };
}

for (const tabId of [1, 2]) {
  test(`metadata reaches ${tabId === 1 ? 'same-tab' : 'new-tab'} reader, automatic export consumed once`, async () => {
    const w = worker();
    assert.equal((await w.message('prepare-reader', 1, { metadata: { title, author: '韩里夫' }, autoStart: true })).ok, true);
    if (tabId === 2) await w.created(2);
    const ready = await w.message('reader-ready', tabId);
    assert.equal(ready.metadata.title, title);
    assert.equal(ready.autoStart, true);
    assert.equal((await w.message('reader-ready', tabId)).autoStart, false);
  });
}

test('unrelated reader never uses another thesis metadata', async () => {
  const w = worker();
  await w.message('prepare-reader', 1, { metadata: { title, author: '韩里夫' }, autoStart: true });
  const ready = await w.message('reader-ready', 3);
  assert.equal(ready.autoStart, false);
  assert.equal(ready.metadata, null);
});

test('filename uses metadata and strips unsafe filename characters', () => {
  let source = fs.readFileSync('bnu-etd-extension/content-script.js', 'utf8');
  source = source.replace('  function reportStatus(text) {', '  globalThis.filename = buildFileName;\n  function reportStatus(text) {');
  const context = { document: { title: '首页', querySelector: () => null, addEventListener() {}, querySelectorAll: () => [] },
    location: { pathname: '/detail' }, chrome: { runtime: { onMessage: { addListener() {} } } }, URL };
  vm.runInNewContext(source, context);
  assert.equal(context.filename({ title, author: '韩里夫' }), `${title}_韩里夫.pdf`);
  assert.equal(context.filename({ title: 'A/B:*?', author: '张三' }), 'AB_张三.pdf');
  assert.equal(context.filename({ title, author: '' }), `${title}.pdf`);
  assert.equal(context.filename(), '首页.pdf');
});

test('manual fallback click preserves requested automatic export', async () => {
  const w = worker();
  const metadata = { title, author: '韩里夫' };
  await w.message('prepare-reader', 1, { metadata, autoStart: true });
  await w.message('prepare-reader', 1, { metadata, autoStart: false });
  await w.created(2);
  assert.equal((await w.message('reader-ready', 2)).autoStart, true);
});

test('expired handoff cannot trigger an unrelated later export', async () => {
  const w = worker();
  await w.message('prepare-reader', 1, { metadata: { title }, autoStart: true });
  w.storage['pending-reader:1'].expires = 0;
  assert.equal((await w.message('reader-ready', 2)).autoStart, false);
});

test('reader automatically exports with thesis filename even after popup closes', async () => {
  let downloaded, pdf;
  const canvas = { tagName: 'CANVAS', width: 100, height: 200, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
  const container = { id: 'loadingBg0', querySelector: () => canvas, scrollIntoView() {} };
  const doc = {
    title: '首页', addEventListener() {}, removeEventListener() {},
    querySelector: selector => selector.includes('.loadingBg') ? container : null,
    querySelectorAll: () => [container], getElementById: () => null,
    createElement: tag => { const n = element(tag); n.click = function () { downloaded = this.download; }; return n; },
    body: element('body')
  };
  vm.runInNewContext(fs.readFileSync('bnu-etd-extension/content-script.js', 'utf8'), {
    document: doc, window: {},
    location: { pathname: '/read/pdfindex1.jsp', href: 'https://etdlib.bnu.edu.cn/read/pdfindex1.jsp?fid=one' },
    chrome: { runtime: { onMessage: { addListener() {} }, async sendMessage(message) {
      if (message.type === 'reader-ready') return { ok: true, autoStart: true, metadata: { title, author: '韩里夫' } };
      throw new Error('Receiving end does not exist.');
    } } },
    URL: { createObjectURL(blob) { pdf = blob; return 'blob:pdf'; }, revokeObjectURL() {} },
    setTimeout(fn) { setImmediate(fn); }, clearTimeout() {}, TextEncoder, Uint8Array, Blob, atob
  });
  for (let i = 0; i < 12; i++) await flush();
  assert.equal(downloaded, `${title}_韩里夫.pdf`);
  assert.match(Buffer.from(await pdf.arrayBuffer()).toString(), /^%PDF-1.4/);
});


test('overlapping readers from one detail tab retain their own metadata', async () => {
  const w = worker();
  await w.message('prepare-reader', 1, { metadata: { title: '论文A', author: '作者A' }, autoStart: true });
  await w.created(2);
  await w.message('prepare-reader', 1, { metadata: { title: '论文B', author: '作者B' }, autoStart: true });
  await w.created(4);
  const a = await w.message('reader-ready', 2);
  const b = await w.message('reader-ready', 4);
  assert.equal(a.metadata.title, '论文A');
  assert.equal(b.metadata.title, '论文B');
  assert.equal(a.autoStart, true);
  assert.equal(b.autoStart, true);
});


test('repeating a same-tab export honors the new request', async () => {
  const w = worker();
  for (let i = 0; i < 2; i++) {
    await w.message('prepare-reader', 1, { metadata: { title }, autoStart: true });
    assert.equal((await w.message('reader-ready', 1)).autoStart, true);
  }
});

test('existing reader reload never consumes a later pending thesis', async () => {
  const w = worker();
  await w.message('prepare-reader', 1, { metadata: { title: '论文A' }, autoStart: true });
  await w.created(2);
  await w.message('reader-ready', 2);
  await w.message('prepare-reader', 1, { metadata: { title: '论文B' }, autoStart: true });
  const reload = await w.message('reader-ready', 2);
  assert.equal(reload.metadata.title, '论文A');
  assert.equal(reload.autoStart, false);
  assert.equal(w.storage['pending-reader:1'].metadata.title, '论文B');
});


test('unrelated new tab does not steal blocked export request', async () => {
  const w = worker();
  const metadata = { title };
  await w.message('prepare-reader', 1, { metadata, autoStart: true });
  await w.created(3, 'https://example.com/');
  await w.message('prepare-reader', 1, { metadata, autoStart: false });
  await w.created(2);
  assert.equal((await w.message('reader-ready', 2)).autoStart, true);
});

test('unknown initial tab URL retains snapshot until loading URL appears', async () => {
  const w = worker();
  await w.message('prepare-reader', 1, { metadata: { title: '论文A' }, autoStart: true });
  await w.created(2, '');
  await w.message('prepare-reader', 1, { metadata: { title: '论文B' }, autoStart: true });
  await w.updated(2, 'https://etdlib.bnu.edu.cn/loading');
  assert.equal((await w.message('reader-ready', 2)).metadata.title, '论文A');
  await w.created(4);
  assert.equal((await w.message('reader-ready', 4)).metadata.title, '论文B');
});
