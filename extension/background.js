importScripts('data.js');
importScripts('external-api.js');

const { STORAGE_KEY, validateAttendanceSnapshot } = self.AmizoneAttendanceData;
const { PORT_NAME, isAllowedDashboard, isValidRequest } = self.AmizoneAttendanceExternalApi;
const connectedDashboards = new Set();

function readStoredSnapshot() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      try {
        resolve(result[STORAGE_KEY] ? validateAttendanceSnapshot(result[STORAGE_KEY]) : null);
      } catch (validationError) {
        reject(validationError);
      }
    });
  });
}

async function handleRequest(message) {
  const snapshot = await readStoredSnapshot();
  if (message.type === 'get_status') {
    return {
      type: 'status',
      available: Boolean(snapshot),
      syncedAt: snapshot ? snapshot.syncedAt : null
    };
  }
  return { type: 'attendance', data: snapshot };
}

function replyWithError(port, requestId, error) {
  try {
    port.postMessage({
      requestId,
      ok: false,
      error: error instanceof Error ? error.message : 'Request failed.'
    });
  } catch {
    port.disconnect();
  }
}

function onDashboardMessage(port, message) {
  if (!isValidRequest(message)) {
    replyWithError(port, message && typeof message.requestId === 'string' ? message.requestId : '', new Error('Unsupported dashboard request.'));
    return;
  }

  handleRequest(message).then((result) => {
    port.postMessage({ requestId: message.requestId, ok: true, ...result });
  }).catch((error) => replyWithError(port, message.requestId, error));
}

function handleExternalConnection(port) {
  if (port.name !== PORT_NAME || !isAllowedDashboard(port.sender)) {
    port.disconnect();
    return;
  }

  connectedDashboards.add(port);
  port.onMessage.addListener((message) => onDashboardMessage(port, message));
  port.onDisconnect.addListener(() => connectedDashboards.delete(port));
}

function notifyDashboards() {
  for (const port of connectedDashboards) {
    try {
      port.postMessage({ type: 'attendance_updated' });
    } catch {
      connectedDashboards.delete(port);
    }
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.storage) {
  chrome.runtime.onConnectExternal.addListener(handleExternalConnection);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]) notifyDashboards();
  });
}
