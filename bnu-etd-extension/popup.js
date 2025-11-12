const startBtn = document.getElementById('start-btn');
const statusEl = document.getElementById('status');
const progressBar = document.getElementById('progress-bar');

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
          handleFailure(chrome.runtime.lastError.message);
          return;
        }
        if (!response?.ok) {
          handleFailure(response?.error || '内容页未响应');
          return;
        }
        updateStatus('已开始，请勿手动操作页面…');
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
