const DOWNLOAD_MESSAGE = 'download-pdf';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.target !== 'service-worker') {
    return;
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
