const startBtn = document.getElementById('start-btn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');

document.getElementById('current-version').textContent = `v${chrome.runtime.getManifest().version}`;

checkForUpdates();

async function checkForUpdates() {
  const button = document.getElementById('update-btn');
  try {
    const response = await fetch(
      'https://api.github.com/repos/etShaw-zh/download_bnu_etdlib_pdf/releases/latest',
      {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!response.ok) {
      throw new Error('无法获取最新版本');
    }
    const release = await response.json();
    if (release.draft || release.prerelease) return;
    const comparison = compareVersions(release.tag_name, chrome.runtime.getManifest().version);
    if (comparison === null) return;
    if (comparison > 0) {
      button.classList.add('has-update');
      button.textContent = '有新版本 ↗';
      button.title = `发现新版本 ${release.tag_name}，点击下载`;
      // Only use release links belonging to this repository.
      const prefix = 'https://github.com/etShaw-zh/download_bnu_etdlib_pdf/releases/';
      if (typeof release.html_url === 'string' && release.html_url.startsWith(prefix)) {
        button.href = release.html_url;
      }
    } else {
      button.title = '当前已是最新版本，点击查看发布页面';
    }
  } catch {
    button.title = '自动检查暂时失败，点击打开发布页面手动检查';
  }
}

function compareVersions(latest, current) {
  const parse = value => {
    if (typeof value !== 'string' || !/^v?\d+(?:\.\d+){0,3}$/.test(value)) return null;
    return value.replace(/^v/, '').split('.').map(Number);
  };
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return null;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

let running = false;

startBtn.addEventListener('click', async () => {
  if (running) {
    return;
  }

  running = true;
  startBtn.disabled = true;
  updateStatus('正在连接内容页…');
  setProgress(0);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('无法找到当前标签页');
    }

    chrome.tabs.sendMessage(
      tab.id,
      { target: 'content-script', type: 'start-export' },
      response => {
        if (chrome.runtime.lastError) {
          const reason = chrome.runtime.lastError.message;
          handleFailure(/Receiving end does not exist/.test(reason)
            ? '请在论文详情页或阅读页使用插件；更新插件后请先刷新论文页面。'
            : reason);
          return;
        }
        if (!response?.ok) {
          handleFailure(response?.error || '内容页未响应');
          return;
        }
        updateStatus(response.openingReader
          ? '正在打开全文，进入阅读器后自动导出；若被拦截，请点击页面“查看全文”。'
          : '已开始，请勿手动操作页面…');
      }
    );
  } catch (error) {
    handleFailure(error.message);
  }
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.target !== 'popup') {
    return;
  }

  switch (message.type) {
    case 'status':
      updateStatus(message.text || '');
      break;
    case 'progress':
      if (typeof message.current === 'number' && typeof message.total === 'number') {
        const pct = Math.round((message.current / message.total) * 100);
        setProgress(pct);
        updateStatus(`${message.text || '加载中…'}（${message.current}/${message.total}）`);
      }
      break;
    case 'done':
      setProgress(100);
      updateStatus('PDF 已生成，浏览器正在保存文件。');
      finishRun();
      break;
    case 'error':
      handleFailure(message.error || '未知错误');
      break;
    default:
      break;
  }
});

function updateStatus(text) {
  statusEl.textContent = text;
}

function setProgress(percent) {
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function handleFailure(reason) {
  updateStatus(`执行失败：${reason}`);
  finishRun();
}

function finishRun() {
  running = false;
  startBtn.disabled = false;
}
