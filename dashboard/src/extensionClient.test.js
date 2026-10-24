import test from 'node:test';
import assert from 'node:assert/strict';
import { createExtensionClient, validateExtensionSnapshot } from './extensionClient.js';

const EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function createMockRuntime({ connectError = null, responseFor = () => ({}) } = {}) {
  const messageListeners = [];
  const disconnectListeners = [];
  const sentMessages = [];
  const port = {
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
    postMessage(message) {
      sentMessages.push(message);
      const response = responseFor(message);
      if (response !== undefined) {
        queueMicrotask(() => messageListeners.forEach((listener) => listener({ requestId: message.requestId, ok: true, ...response })));
      }
    },
    disconnect() {
      disconnectListeners.forEach((listener) => listener());
    }
  };

  return {
    runtime: {
      lastError: null,
      connect(id, options) {
        if (connectError) throw connectError;
        assert.equal(id, EXTENSION_ID);
        assert.equal(options.name, 'amizone-dashboard');
        return port;
      }
    },
    port,
    sentMessages,
    emit: (message) => messageListeners.forEach((listener) => listener(message))
  };
}

test('extension client requests only the attendance read operation', async () => {
  const mock = createMockRuntime({
    responseFor: (message) => message.type === 'get_attendance'
      ? { type: 'attendance', data: null }
      : {}
  });
  const client = createExtensionClient(EXTENSION_ID, { runtime: mock.runtime });
  const response = await client.request('get_attendance');

  assert.equal(response.type, 'attendance');
  assert.deepEqual(mock.sentMessages.map(({ type }) => type), ['get_attendance']);
  await assert.rejects(client.request('delete_data'), /unsupported extension request/i);
});

test('extension client exposes a clear unavailable-extension error', () => {
  const mock = createMockRuntime({ connectError: new Error('Extension is unavailable') });
  assert.throws(
    () => createExtensionClient(EXTENSION_ID, { runtime: mock.runtime }),
    /Extension is unavailable/
  );
});

test('extension client reports invalid IDs and unavailable Chrome messaging', () => {
  assert.throws(
    () => createExtensionClient('not-an-extension-id', { runtime: { connect() {} } }),
    /valid VITE_EXTENSION_ID/
  );
  assert.throws(
    () => createExtensionClient(EXTENSION_ID, { runtime: undefined }),
    /not available/
  );
});

test('extension client rejects a request that times out', async () => {
  const mock = createMockRuntime({ responseFor: () => undefined });
  const client = createExtensionClient(EXTENSION_ID, { runtime: mock.runtime, timeoutMs: 5 });
  await assert.rejects(client.request('get_status'), /did not respond in time/i);
});

test('extension client receives attendance update notifications', () => {
  const mock = createMockRuntime();
  let updateCount = 0;
  const client = createExtensionClient(EXTENSION_ID, {
    runtime: mock.runtime,
    onUpdate: () => { updateCount += 1; }
  });
  mock.emit({ type: 'attendance_updated' });

  assert.equal(updateCount, 1);
  client.disconnect();
});

test('external attendance snapshots are validated and normalized', () => {
  const snapshot = validateExtensionSnapshot({
    schemaVersion: 1,
    semester: 'Semester 1',
    syncedAt: '2026-10-24T01:00:00.000Z',
    regular: [{ code: 'R1', name: 'Project', attended: 0, total: 0, percentage: null, valid: true }],
    flexi: [{ code: 'F1', name: 'Flexi', attended: 18, total: 22, percentage: 81.82, valid: true }]
  });

  assert.equal(snapshot.regular[0].percentage, null);
  assert.equal(snapshot.regular[0].status, 'No classes conducted');
  assert.equal(snapshot.flexi[0].category, 'Flexi');
});

test('external attendance snapshot rejects malformed metadata and counts', () => {
  const valid = {
    schemaVersion: 1,
    semester: '',
    syncedAt: '2026-10-24T01:00:00.000Z',
    regular: [],
    flexi: []
  };

  assert.throws(() => validateExtensionSnapshot({ ...valid, syncedAt: 'not-a-date' }), /unsupported format/i);
  assert.throws(() => validateExtensionSnapshot({
    ...valid,
    regular: [{ code: 'R1', name: 'Invalid', attended: 3, total: 2, percentage: 150, valid: true }]
  }), /invalid attendance counts/i);
  assert.throws(() => validateExtensionSnapshot({
    ...valid,
    regular: [{ code: 'R1', name: 'Missing validity', attended: 1, total: 2, percentage: 50 }]
  }), /invalid fields/i);
});
