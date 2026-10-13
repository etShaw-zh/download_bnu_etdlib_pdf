(function () {
  if (globalThis.__crowPdfLoaded) return;
  globalThis.__crowPdfLoaded = true;
  const TARGET = 'content-script';
  let running = false;
  let openingReader = false;
  let thesisMetadata = null;
  let exportOverlay = null;
  const imageBytesCache = new Map();

  // Capture metadata also when the user opens full text before using the popup.
  document.addEventListener('click', event => {
    if (openingReader || location.pathname !== '/detail') return;
    const button = event.target.closest?.('button');
    if (button && /查看全文/.test(button.textContent)) {
      const metadata = readDetailMetadata();
      if (metadata.title) {
        chrome.runtime.sendMessage({ target: 'service-worker', type: 'prepare-reader', metadata, autoStart: false }).catch(() => {});
      }
    }
  }, true);

  if (location.href?.startsWith('https://etdlib.bnu.edu.cn/') && /^\/read\/pdfindex[^/]*\.jsp$/.test(location.pathname)) {
    initializeReader().catch(error => reportError(error));
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.target !== TARGET) {
      return;
    }

    if (message.type === 'start-export') {
      if (running) {
        sendResponse({ ok: false, error: '已有任务正在执行，请稍候。' });
        return;
      }

      sendResponse({ ok: true, openingReader: location.pathname === '/detail' });
      startWorkflow();
    }
  });

  function startWorkflow() {
    if (running) return;
    running = true;
    runWorkflow().catch(() => {}).finally(() => { running = false; });
  }

  function readDetailMetadata() {
    const title = document.querySelector('.title-box .title')?.textContent.trim() || '';
    const row = Array.from(document.querySelectorAll('li')).find(node =>
      /^作者[:：]?$/.test((node.querySelector('label')?.textContent || '').replace(/\s+/g, ''))
    );
    const author = row?.querySelector('.text')?.textContent.trim() || '';
    return { title, author };
  }

  async function openDetailReader() {
    const metadata = readDetailMetadata();
    if (!metadata.title) throw new Error('未找到论文标题，请等待详情页加载完成后重试。');
    const button = Array.from(document.querySelectorAll('button')).find(node => /查看全文/.test(node.textContent));
    if (!button || button.disabled) throw new Error('未找到可用的“查看全文”按钮，请确认已登录并有全文阅读权限。');
    const response = await chrome.runtime.sendMessage({
      target: 'service-worker', type: 'prepare-reader', metadata, autoStart: true
    });
    if (!response?.ok) throw new Error(response?.error || '无法保存论文信息，请重试。');
    reportStatus('正在打开全文，进入阅读器后自动导出；若被浏览器拦截，请点击页面“查看全文”。');
    openingReader = true;
    try { button.click(); } finally { openingReader = false; }
  }

  async function initializeReader() {
    const response = await chrome.runtime.sendMessage({ target: 'service-worker', type: 'reader-ready' });
    if (!response?.ok) return;
    thesisMetadata = response.metadata;
    if (response.autoStart) {
      const deadline = Date.now() + 20000;
      while (!document.querySelector('.loadingBg[id^="loadingBg"], .fwr_page')) {
        if (Date.now() >= deadline) throw new Error('阅读器未加载完成，请在阅读页重新点击开始导出。');
        await delay(200);
      }
      startWorkflow();
    }
  }

  function reportError(error) {
    chrome.runtime.sendMessage({ target: 'popup', type: 'error', error: error?.message || String(error) }).catch(() => {});
  }

  async function runWorkflow() {
    try {
      imageBytesCache.clear();
      if (location.pathname === '/detail') {
        await openDetailReader();
        return;
      }
      assertSupportedPage();
      showExportOverlay();
      reportStatus('开始逐页加载，请勿关闭标签页。');
      const renderedPages = await loadAllPages();
      reportStatus('抓取图像数据中…');
      const pages = await fetchImages(renderedPages);
      reportStatus('正在生成 PDF…');
      await delay(0);
      const pdfBytes = buildPdfFromImages(pages);
      reportStatus('请求浏览器下载 PDF…');
      await triggerDownload(pdfBytes, buildFileName());
      chrome.runtime.sendMessage({ target: 'popup', type: 'done' }).catch(() => {});
    } catch (error) {
      reportError(error);
      throw error;
    } finally {
      hideExportOverlay();
      imageBytesCache.clear();
    }
  }

  function assertSupportedPage() {
    const container = document.querySelector('.loadingBg[id^="loadingBg"], .fwr_page');
    if (!container) {
      throw new Error('当前页面不是学位论文阅读器或尚未完全加载。');
    }
  }

  async function loadAllPages() {
    const expected = getExpectedPageCount();
    const containers = getPageContainers(expected);
    if (containers.length === 0) {
      throw new Error('未找到任何页面容器，页面结构可能已变化。');
    }

    const rendered = [];
    reportProgress('加载页面', 0, containers.length);
    for (let i = 0; i < containers.length; i += 1) {
      const container = containers[i];
      scrollPageIntoView(container.node);
      const element = await waitForRenderableElement(container.node);
      if (!element) {
        throw new Error(`第 ${container.index + 1} 页没有成功渲染，请刷新后重试。`);
      }
      rendered.push({ index: container.index, element });
      reportProgress('加载页面', i + 1, containers.length);
      await delay(120);
    }

    return rendered;
  }

  function getExpectedPageCount() {
    if (typeof window.endpage === 'number' && Number.isFinite(window.endpage)) {
      return window.endpage;
    }
    const hidden = document.getElementById('endpage');
    const count = hidden ? parseInt(hidden.value, 10) : NaN;
    return Number.isFinite(count) ? count : null;
  }

  function getPageContainers(expected) {
    const entries = [];
    const seen = new Set();

    const register = node => {
      if (!node) {
        return;
      }
      const idx = extractIndex(node.id);
      if (idx === null || seen.has(idx)) {
        return;
      }
      seen.add(idx);
      entries.push({ index: idx, node });
    };

    document.querySelectorAll('.loadingBg[id^="loadingBg"]').forEach(register);

    if (expected && entries.length < expected) {
      document.querySelectorAll('.fwr_page').forEach(page => register(page.querySelector('.loadingBg')));
    }

    entries.sort((a, b) => a.index - b.index);

    if (expected) {
      const limited = entries.slice(0, expected);
      if (limited.length === expected) {
        return limited;
      }
    }

    return entries;
  }

  function extractIndex(value) {
    if (!value) {
      return null;
    }
    const match = value.match(/(\d+)$/);
    return match ? parseInt(match[1], 10) : null;
  }

  function scrollPageIntoView(element) {
    const pane = document.getElementById('jspPane');
    if (pane && pane.contains(element)) {
      const paneRect = pane.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const delta = rect.top - paneRect.top - pane.clientHeight / 2;
      pane.scrollTop += delta;
    } else {
      element.scrollIntoView({ block: 'center' });
    }
  }

  async function waitForRenderableElement(container, timeout = 20000) {
    const existing = getRenderableElement(container);
    if (existing) {
      await ensureElementRenderable(existing);
      return existing;
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const candidate = getRenderableElement(container);
        if (candidate) {
          cleanup();
          ensureElementRenderable(candidate)
            .then(() => resolve(candidate))
            .catch(reject);
        }
      });

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('部分页面长时间未响应，请稍后重试。'));
      }, timeout);

      const cleanup = () => {
        observer.disconnect();
        clearTimeout(timer);
      };

      observer.observe(container, { childList: true, subtree: true });
    });
  }

  function getRenderableElement(container) {
    return container.querySelector('img[id^="ViewContainer_BG_"], img.fwr_page_bg_image, canvas[id^="canvas"]');
  }

  function ensureElementRenderable(element) {
    if (element.tagName === 'IMG') {
      return ensureImageLoaded(element).then(() => {
        warmImageBytes(element);
      });
    }
    if (element.tagName === 'CANVAS') {
      return Promise.resolve();
    }
    return Promise.reject(new Error('检测到未知的页面元素类型，无法导出。'));
  }

  function ensureImageLoaded(img, timeout = 15000) {
    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('部分页面长时间未响应，请稍后重试。'));
      }, timeout);

      const onLoad = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('加载页面时发生错误。'));
      };

      const cleanup = () => {
        clearTimeout(timer);
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      };

      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
    });
  }

  async function fetchImages(renderedPages) {
    const pages = [];
    reportProgress('下载图像', 0, renderedPages.length);
    for (let i = 0; i < renderedPages.length; i += 1) {
      const element = renderedPages[i]?.element;
      if (!element) {
        throw new Error(`第 ${renderedPages[i]?.index + 1 || i + 1} 页缺少可导出的内容。`);
      }
      const data = await getElementBytes(element);
      pages.push({
        data,
        width: getElementDimension(element, 'width'),
        height: getElementDimension(element, 'height')
      });
      reportProgress('下载图像', i + 1, renderedPages.length);
      if (i % 10 === 0) await delay(0);
    }
    return pages;
  }

  async function getElementBytes(element) {
    if (element.tagName === 'IMG') {
      return fetchImageBytes(element);
    }
    if (element.tagName === 'CANVAS') {
      return canvasToBytes(element);
    }
    throw new Error('检测到未知的页面元素类型，无法导出。');
  }

  async function fetchImageBytes(img) {
    const url = resolveImageUrl(img);
    return getOrCreateImageBytesTask(url);
  }

  function warmImageBytes(img) {
    const url = resolveImageUrl(img);
    getOrCreateImageBytesTask(url).catch(() => {
      // Ignore preload errors here; fetch phase will retry.
    });
  }

  function resolveImageUrl(img) {
    const src = img.currentSrc || img.src;
    if (!src) {
      throw new Error('页面图像地址为空，无法导出。');
    }
    return new URL(src, document.baseURI).href;
  }

  function getOrCreateImageBytesTask(url) {
    const cached = imageBytesCache.get(url);
    if (cached) {
      return cached;
    }

    const task = fetchImageBytesFromUrl(url).catch(error => {
      imageBytesCache.delete(url);
      throw error;
    });
    imageBytesCache.set(url, task);
    return task;
  }

  async function fetchImageBytesFromUrl(url) {
    const response = await fetch(url, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`无法下载图像：${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  function canvasToBytes(canvas) {
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 1);
    } catch (error) {
      throw new Error('无法读取画布内容，可能由于跨域限制。');
    }
    return dataUrlToBytes(dataUrl);
  }

  function dataUrlToBytes(dataUrl) {
    const parts = dataUrl.split(',');
    const base64 = parts.length > 1 ? parts[1] : parts[0];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function getElementDimension(element, key) {
    if (element.tagName === 'CANVAS') {
      return key === 'width' ? element.width : element.height;
    }
    const img = element;
    const value = key === 'width' ? img.naturalWidth : img.naturalHeight;
    if (value) {
      return Math.round(value);
    }
    const attr = img.getAttribute(key);
    if (attr) {
      const parsed = parseInt(attr, 10);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return key === 'width' ? 1190 : 1683;
  }

  function buildFileName(metadata = thesisMetadata) {
    const title = (metadata?.title || document.querySelector('.pdf-title')?.textContent || document.title || 'bnu-export').trim();
    const author = metadata?.author?.trim();
    const name = author ? `${title}_${author}` : title;
    const safe = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '').replace(/\s+/g, '_').replace(/[. ]+$/g, '');
    return `${safe || 'bnu-export'}.pdf`;
  }

  function reportStatus(text) {
    if (exportOverlay) {
      exportOverlay.phase.textContent = text;
      exportOverlay.count.textContent = '';
      exportOverlay.progress.removeAttribute('value');
    }
    chrome.runtime.sendMessage({ target: 'popup', type: 'status', text }).catch(() => {});
  }

  function reportProgress(text, current, total) {
    if (exportOverlay) {
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(current / total * 100))) : 0;
      exportOverlay.phase.textContent = text;
      exportOverlay.count.textContent = `${current} / ${total} · ${percent}%`;
      exportOverlay.progress.value = percent;
    }
    chrome.runtime.sendMessage({
      target: 'popup',
      type: 'progress',
      text,
      current,
      total
    }).catch(() => {});
  }

  function showExportOverlay() {
    if (exportOverlay) return;
    const host = document.createElement('div');
    host.id = 'crow-pdf-export-overlay';
    for (const [name, value] of Object.entries({
      position: 'fixed', inset: '0', 'z-index': '2147483647', display: 'block',
      'pointer-events': 'auto', 'touch-action': 'none'
    })) host.style.setProperty(name, value, 'important');
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { color-scheme: light; }
      * { box-sizing: border-box; }
      .backdrop { position: absolute; inset: 0; display: grid; place-items: center;
        padding: 24px; background: rgba(15, 23, 42, .62); overscroll-behavior: none;
        font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
      .card { width: min(100%, 380px); padding: 28px; border-radius: 16px; background: #fff;
        color: #1f2937; box-shadow: 0 20px 64px rgba(0, 0, 0, .25); }
      h2 { margin: 0 0 16px; font-size: 20px; line-height: 1.4; }
      .phase { margin: 0 0 8px; font-weight: 600; }
      .count { min-height: 23px; margin: 0 0 12px; color: #2563eb; font-variant-numeric: tabular-nums; }
      progress { display: block; width: 100%; height: 10px; border: 0; border-radius: 99px;
        overflow: hidden; accent-color: #2563eb; }
      progress::-webkit-progress-bar { background: #e2e8f0; border-radius: 99px; }
      progress::-webkit-progress-value { background: #2563eb; border-radius: 99px; }
      .note { margin: 16px 0 0; color: #64748b; font-size: 12px; }
    `;
    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    const card = document.createElement('section');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', '小鸦PDF 导出进度');
    card.tabIndex = -1;
    const heading = document.createElement('h2');
    heading.textContent = '小鸦PDF 正在导出';
    const phase = document.createElement('p');
    phase.className = 'phase';
    phase.setAttribute('role', 'status');
    const count = document.createElement('p');
    count.className = 'count';
    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = 0;
    progress.setAttribute('aria-label', '当前阶段进度');
    const note = document.createElement('p');
    note.className = 'note';
    note.textContent = '请保持此标签页在前台，不要手动滚动或切换页面。';
    card.append(heading, phase, count, progress, note);
    backdrop.append(card);
    root.append(style, backdrop);
    exportOverlay = { host, phase, count, progress, previousFocus: document.activeElement };
    document.body.append(host);
    document.addEventListener('wheel', blockManualScroll, { capture: true, passive: false });
    document.addEventListener('touchmove', blockManualScroll, { capture: true, passive: false });
    document.addEventListener('keydown', blockManualKeys, true);
    card.focus({ preventScroll: true });
  }

  function blockManualScroll(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function blockManualKeys(event) {
    if (!event.ctrlKey && !event.metaKey && !event.altKey &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Tab'].includes(event.key)) {
      blockManualScroll(event);
    }
  }

  function hideExportOverlay() {
    if (!exportOverlay) return;
    const { host, previousFocus } = exportOverlay;
    exportOverlay = null;
    host.remove();
    document.removeEventListener('wheel', blockManualScroll, true);
    document.removeEventListener('touchmove', blockManualScroll, true);
    document.removeEventListener('keydown', blockManualKeys, true);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  async function triggerDownload(pdfBytes, filename) {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename || 'bnu-export.pdf';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function buildPdfFromImages(pages) {
    const encoder = new TextEncoder();
    const objects = new Map();
    const totalObjects = 2 + pages.length * 3;

    const kids = [];
    for (let i = 0; i < pages.length; i += 1) {
      const pageObjId = 3 + i * 3;
      kids.push(`${pageObjId} 0 R`);
    }

    objects.set(1, [
      `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`
    ]);

    objects.set(2, [
      `2 0 obj\n<< /Type /Pages /Count ${pages.length} /Kids [ ${kids.join(' ')} ] >>\nendobj\n`
    ]);

    for (let i = 0; i < pages.length; i += 1) {
      const pageObjId = 3 + i * 3;
      const contentObjId = pageObjId + 1;
      const imageObjId = pageObjId + 2;
      const imageName = `/Im${i + 1}`;
      const { width, height, data } = pages[i];

      const contentStream = `q\n${width} 0 0 ${height} 0 0 cm\n${imageName} Do\nQ\n`;
      const encodedContent = encoder.encode(contentStream);

      objects.set(pageObjId, [
        `${pageObjId} 0 obj\n`,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] `,
        `/Resources << /XObject << ${imageName} ${imageObjId} 0 R >> >> `,
        `/Contents ${contentObjId} 0 R >>\n`,
        `endobj\n`
      ]);

      objects.set(contentObjId, [
        `${contentObjId} 0 obj\n`,
        `<< /Length ${encodedContent.length} >>\nstream\n`,
        encodedContent,
        `\nendstream\nendobj\n`
      ]);

      objects.set(imageObjId, [
        `${imageObjId} 0 obj\n`,
        `<< /Type /XObject /Subtype /Image /Name ${imageName} /Width ${width} /Height ${height} `,
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${data.length} >>\nstream\n`,
        data,
        `\nendstream\nendobj\n`
      ]);
    }

    const chunks = [];
    const offsets = new Array(totalObjects + 1).fill(0);
    let position = 0;

    const push = chunk => {
      const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
      chunks.push(bytes);
      position += bytes.length;
    };

    push('%PDF-1.4\n');

    for (let i = 1; i <= totalObjects; i += 1) {
      offsets[i] = position;
      const parts = objects.get(i);
      if (!parts) {
        continue;
      }
      for (const part of parts) {
        push(part);
      }
    }

    const xrefOffset = position;
    push(`xref\n0 ${totalObjects + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= totalObjects; i += 1) {
      push(`${offsets[i].toString().padStart(10, '0')} 00000 n \n`);
    }

    push(
      `trailer << /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    );

    return concatUint8Arrays(chunks);
  }

  function concatUint8Arrays(arrays) {
    const totalLength = arrays.reduce((sum, current) => sum + current.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      merged.set(arr, offset);
      offset += arr.length;
    }
    return merged;
  }
})();
