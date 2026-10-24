import { validateAttendanceData } from './attendance.js';

export const DASHBOARD_PORT_NAME = 'amizone-dashboard';
const REQUEST_TYPES = new Set(['get_status', 'get_attendance']);

let nextRequestNumber = 0;

export function validateExtensionSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('The extension returned invalid attendance data.');
  }
  if (snapshot.schemaVersion !== 1
    || typeof snapshot.semester !== 'string'
    || typeof snapshot.syncedAt !== 'string'
    || !Number.isFinite(Date.parse(snapshot.syncedAt))
    || !Array.isArray(snapshot.regular)
    || !Array.isArray(snapshot.flexi)) {
    throw new Error('The extension returned attendance data in an unsupported format.');
  }

  [...snapshot.regular, ...snapshot.flexi].forEach((subject) => {
    if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
      throw new Error('The extension returned a malformed attendance subject.');
    }
    if (typeof subject.valid !== 'boolean'
      || (typeof subject.code !== 'string' && typeof subject.name !== 'string')) {
      throw new Error('The extension returned a subject with invalid fields.');
    }

    const countsAreNull = subject.attended === null && subject.total === null;
    const countsAreValid = Number.isInteger(subject.attended)
      && Number.isInteger(subject.total)
      && subject.attended >= 0
      && subject.total >= 0
      && subject.attended <= subject.total;
    if ((!countsAreNull && !countsAreValid) || (subject.valid === true && !countsAreValid)) {
      throw new Error('The extension returned invalid attendance counts.');
    }
    if (subject.percentage !== null
      && (!Number.isFinite(subject.percentage) || subject.percentage < 0 || subject.percentage > 100)) {
      throw new Error('The extension returned an invalid attendance percentage.');
    }
    if (subject.valid === true && countsAreValid) {
      if (subject.total === 0) {
        if (subject.attended !== 0 || subject.percentage !== null) {
          throw new Error('The extension returned an invalid zero-class record.');
        }
      } else if (subject.percentage === null
        || Math.abs(subject.percentage - (subject.attended / subject.total) * 100) > 0.05) {
        throw new Error('The extension returned a percentage inconsistent with attendance counts.');
      }
    }
  });

  return {
    schemaVersion: 1,
    ...validateAttendanceData(snapshot)
  };
}

export function createExtensionClient(
  extensionId,
  { runtime = globalThis.chrome?.runtime, onUpdate = () => {}, timeoutMs = 5000 } = {}
) {
  if (!runtime || typeof runtime.connect !== 'function') {
    throw new Error('Chrome extension messaging is not available in this browser.');
  }
  if (!/^[a-p]{32}$/.test(extensionId || '')) {
    throw new Error('Set a valid VITE_EXTENSION_ID before starting the dashboard.');
  }

  const port = runtime.connect(extensionId, { name: DASHBOARD_PORT_NAME });
  const pendingRequests = new Map();
  let closedError = null;

  port.onMessage.addListener((message) => {
    if (message && message.type === 'attendance_updated') {
      onUpdate();
      return;
    }
    if (!message || typeof message.requestId !== 'string') return;

    const pending = pendingRequests.get(message.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingRequests.delete(message.requestId);
    if (message.ok !== true) {
      pending.reject(new Error(typeof message.error === 'string' ? message.error : 'Extension request failed.'));
      return;
    }
    pending.resolve(message);
  });

  port.onDisconnect.addListener(() => {
    const runtimeError = runtime.lastError;
    closedError = new Error(runtimeError?.message || 'Extension connection closed.');
    pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(closedError);
    });
    pendingRequests.clear();
  });

  function request(type) {
    if (!REQUEST_TYPES.has(type)) return Promise.reject(new Error('Unsupported extension request.'));
    if (closedError) return Promise.reject(closedError);

    const requestId = `${Date.now()}-${++nextRequestNumber}`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        reject(new Error('The extension did not respond in time.'));
      }, timeoutMs);
      pendingRequests.set(requestId, { resolve, reject, timeout });
      try {
        port.postMessage({ type, requestId });
      } catch (error) {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        reject(error instanceof Error ? error : new Error('Could not contact the extension.'));
      }
    });
  }

  function disconnect() {
    port.disconnect();
  }

  return { request, disconnect };
}
