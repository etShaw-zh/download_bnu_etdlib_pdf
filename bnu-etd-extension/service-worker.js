const DOWNLOAD_MESSAGE = 'download-pdf';
let readerQueue = Promise.resolve();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'service-worker') {
    return;
  }

  if (message.type === 'prepare-reader' || message.type === 'reader-ready') {
    readerQueue = readerQueue.then(() => handleReaderMessage(message, sender))
      .then(sendResponse, error => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.type === DOWNLOAD_MESSAGE) {
    const { buffer, filename } = message;
    const blob = new Blob([buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download(
      {
        url,
        filename: filename || 'bnu-export.pdf',
        saveAs: true
      },
      downloadId => {
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ ok: true, downloadId });
      }
    );

    return true;
  }
});

async function handleReaderMessage(message, sender) {
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') throw new Error('无法识别论文标签页');
  const url = new URL(sender.tab.url);
  if (url.origin !== 'https://etdlib.bnu.edu.cn') throw new Error('不支持的页面');
  const pendingKey = id => `pending-reader:${id}`;
  const readerKey = `reader-metadata:${tabId}`;
  if (message.type === 'prepare-reader') {
    if (url.pathname !== '/detail' || !message.metadata?.title) throw new Error('未找到论文详情信息');
    const previous = (await chrome.storage.session.get(pendingKey(tabId)))[pendingKey(tabId)];
    const continueRequest = previous?.expires > Date.now() && previous.metadata.title === message.metadata.title &&
      previous.metadata.author === (message.metadata.author || '') && previous.autoStart;
    await chrome.storage.session.set({
      [pendingKey(tabId)]: {
        metadata: { title: message.metadata.title, author: message.metadata.author || '' },
        requestId: crypto.randomUUID(),
        autoStart: Boolean(message.autoStart || continueRequest), expires: Date.now() + 120000
      }
    });
    return { ok: true };
  }
  if (!/^\/read\/pdfindex[^/]*\.jsp$/.test(url.pathname)) throw new Error('当前页面不是论文阅读器');
  const bound = (await chrome.storage.session.get(readerKey))[readerKey];
  const keys = [`opened-reader:${tabId}`, pendingKey(tabId)];
  for (const key of keys) {
    const pending = (await chrome.storage.session.get(key))[key];
    if (!pending) continue;
    await chrome.storage.session.remove(key);
    if (pending.expires < Date.now()) continue;
    await chrome.storage.session.set({ [readerKey]: { metadata: pending.metadata, url: url.href } });
    if (pending.autoStart) await chrome.tabs.update(tabId, { active: true });
    return { ok: true, metadata: pending.metadata, autoStart: pending.autoStart };
  }
  if (bound?.url === url.href) return { ok: true, metadata: bound.metadata, autoStart: false };
  await chrome.storage.session.remove(readerKey);
  return { ok: true, metadata: null, autoStart: false };
}

// Snapshot the request before /loading navigates to the actual reader, so a
// second thesis opened from the same detail tab cannot overwrite its metadata.
chrome.tabs.onCreated.addListener(tab => {
  if (typeof tab.openerTabId !== 'number') return;
  readerQueue = readerQueue.then(async () => {
    const key = `pending-reader:${tab.openerTabId}`;
    const pending = (await chrome.storage.session.get(key))[key];
    if (!pending || pending.expires < Date.now()) return;
    await chrome.storage.session.set({ [`reader-candidate:${tab.id}`]: { pending, sourceId: tab.openerTabId } });
    const url = tab.pendingUrl || tab.url;
    if (url) await bindReaderCandidate(tab.id, url);
  }).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url) return;
  readerQueue = readerQueue.then(() => bindReaderCandidate(tabId, change.url)).catch(() => {});
});

async function bindReaderCandidate(tabId, value) {
  const key = `reader-candidate:${tabId}`;
  const candidate = (await chrome.storage.session.get(key))[key];
  if (!candidate) return;
  const url = new URL(value);
  // A newly created tab can initially report about:blank before /loading.
  if (url.href === 'about:blank') return;
  await chrome.storage.session.remove(key);
  if (url.origin !== 'https://etdlib.bnu.edu.cn' ||
      !(url.pathname === '/loading' || /^\/read\/pdfindex[^/]*\.jsp$/.test(url.pathname)) ||
      candidate.pending.expires < Date.now()) return;
  await chrome.storage.session.set({ [`opened-reader:${tabId}`]: candidate.pending });
  const sourceKey = `pending-reader:${candidate.sourceId}`;
  const current = (await chrome.storage.session.get(sourceKey))[sourceKey];
  if (current?.requestId === candidate.pending.requestId) await chrome.storage.session.remove(sourceKey);
}

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove([`pending-reader:${tabId}`, `reader-candidate:${tabId}`, `opened-reader:${tabId}`, `reader-metadata:${tabId}`]).catch(() => {});
});
