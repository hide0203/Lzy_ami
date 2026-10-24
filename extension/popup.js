const pageStatus = document.getElementById('page-status');
const syncButton = document.getElementById('sync-button');
const exportButton = document.getElementById('export-button');
const loading = document.getElementById('loading');
const summary = document.getElementById('result-summary');
const regularCount = document.getElementById('regular-count');
const flexiCount = document.getElementById('flexi-count');
const previewPanel = document.getElementById('preview-panel');
const previewList = document.getElementById('preview-list');
const errorBox = document.getElementById('error-box');
const successBox = document.getElementById('success-box');
const warningBox = document.getElementById('warning-box');
let exportData = null;
const ATTENDANCE_STORAGE_KEY = window.AmizoneAttendanceData.STORAGE_KEY;

function setStatus(text, kind = 'neutral') {
  pageStatus.textContent = text;
  const box = document.getElementById('page-state');
  box.className = `status-box ${kind}`;
}

function hideAllMessages() {
  loading.classList.add('hidden');
  errorBox.classList.add('hidden');
  successBox.classList.add('hidden');
  warningBox.classList.add('hidden');
  previewPanel.classList.add('hidden');
  summary.classList.add('hidden');
  exportButton.classList.add('hidden');
  exportData = null;
}

function showWarning(text) {
  warningBox.textContent = text;
  warningBox.classList.remove('hidden');
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function describeUrl(url) {
  if (!url) return 'Unknown page';
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('amizone')) return parsed.pathname || 'Amizone page';
    return parsed.hostname;
  } catch (error) {
    return url;
  }
}

async function syncAttendance() {
  hideAllMessages();
  loading.classList.remove('hidden');

  try {
    const tab = await getCurrentTab();
    if (!tab || !tab.id) {
      throw new Error('Unable to access the active tab.');
    }

    const url = tab.url || '';
    const isSupported = /https:\/\/s\.amizone\.net\//i.test(url);
    setStatus(describeUrl(url), isSupported ? 'neutral' : 'warning');

    if (!isSupported) {
      throw new Error('Open Amizone, then go to My Courses and select your semester before syncing attendance.');
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'syncAttendance' });

    if (!response || !response.supported) {
      const message = response && response.message ? response.message : 'Open My Courses and select your semester before syncing attendance.';
      throw new Error(message);
    }

    loading.classList.add('hidden');
    summary.classList.remove('hidden');
    regularCount.textContent = String((response.regular || []).length);
    flexiCount.textContent = String((response.flexi || []).length);

    const previewItems = [...(response.regular || []), ...(response.flexi || [])]
      .slice(0, 8)
      .map((subject) => {
        const attendance = subject.status === 'No classes conducted'
          ? subject.status
          : `${subject.attended ?? 'N/A'}/${subject.total ?? 'N/A'} (${subject.percentage ?? 'N/A'}%)`;
        return `${subject.code || 'N/A'} — ${subject.name || 'Untitled subject'} (${subject.category || 'Regular'}) ${attendance}`;
      });

    if (previewItems.length) {
      previewList.replaceChildren(...previewItems.map((item) => {
        const listItem = document.createElement('li');
        listItem.textContent = item;
        return listItem;
      }));
      previewPanel.classList.remove('hidden');
    }

    const warnings = response.warnings || [];
    setStatus('Supported My Courses page', 'neutral');

    if (response.extractionStatus === 'failed') {
      errorBox.textContent = response.message || 'Attendance extraction failed.';
      errorBox.classList.remove('hidden');
      return;
    }

    if (response.extractionStatus === 'partial') {
      showWarning([response.message, ...warnings].filter(Boolean).join(' '));
      return;
    }

    if (response.extractionStatus !== 'complete') {
      errorBox.textContent = 'Attendance extraction failed: the page did not confirm all expected tables.';
      errorBox.classList.remove('hidden');
      return;
    }

    exportData = {
      schemaVersion: 1,
      semester: response.semester || '',
      syncedAt: new Date().toISOString(),
      regular: response.regular || [],
      flexi: response.flexi || []
    };
    exportData = window.AmizoneAttendanceData.validateAttendanceSnapshot(exportData);
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ [ATTENDANCE_STORAGE_KEY]: exportData }, () => {
        const storageError = chrome.runtime.lastError;
        if (storageError) reject(new Error(`Could not save synced attendance: ${storageError.message}`));
        else resolve();
      });
    });
    exportButton.classList.remove('hidden');

    if (warnings.length) {
      showWarning(warnings.join(' '));
    }

    successBox.textContent = response.message || 'Attendance extracted successfully.';
    successBox.classList.remove('hidden');
  } catch (error) {
    loading.classList.add('hidden');
    errorBox.textContent = error && error.message ? error.message : 'An unexpected error occurred.';
    errorBox.classList.remove('hidden');
    setStatus('Unsupported page', 'warning');
  }
}

(async function init() {
  try {
    const tab = await getCurrentTab();
    const url = tab && tab.url ? tab.url : '';
    if (url && /https:\/\/s\.amizone\.net\//i.test(url)) {
      setStatus('Amizone page detected', 'neutral');
    } else {
      setStatus('Not on an Amizone page', 'warning');
    }
  } catch (error) {
    setStatus('Page status unavailable', 'warning');
  }

  syncButton.addEventListener('click', syncAttendance);
  exportButton.addEventListener('click', () => {
    if (!exportData) return;

    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'amizone-attendance.json';
    link.click();
    URL.revokeObjectURL(blobUrl);
  });
})();
