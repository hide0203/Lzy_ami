const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_ORIGINS,
  PORT_NAME,
  getSenderOrigin,
  isAllowedDashboard,
  isValidRequest
} = require('../external-api.js');

test('external API allows only configured local and production dashboard origins', () => {
  assert.deepEqual(ALLOWED_ORIGINS, [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://hide0203.github.io'
  ]);
  assert.equal(isAllowedDashboard({ url: 'http://localhost:5173/' }), true);
  assert.equal(isAllowedDashboard({ url: 'http://127.0.0.1:5173/dashboard' }), true);
  assert.equal(isAllowedDashboard({ url: 'https://hide0203.github.io/Lzy_ami/' }), true);
  assert.equal(isAllowedDashboard({ url: 'http://localhost:5174/' }), false);
  assert.equal(isAllowedDashboard({ url: 'https://localhost:5173/' }), false);
  assert.equal(isAllowedDashboard({ url: 'https://hide0203.github.io.evil.example/Lzy_ami/' }), false);
  assert.equal(isAllowedDashboard({ url: 'http://hide0203.github.io/Lzy_ami/' }), false);
  assert.equal(isAllowedDashboard({ url: 'https://example.com/' }), false);
  assert.equal(getSenderOrigin({ url: 'not a URL' }), '');
});

test('external API accepts only status and attendance read requests', () => {
  assert.equal(PORT_NAME, 'amizone-dashboard');
  assert.equal(isValidRequest({ type: 'get_status', requestId: '1' }), true);
  assert.equal(isValidRequest({ type: 'get_attendance', requestId: '2' }), true);
  assert.equal(isValidRequest({ type: 'delete_data', requestId: '3' }), false);
  assert.equal(isValidRequest({ type: 'get_attendance', requestId: '4', command: 'other' }), false);
  assert.equal(isValidRequest({ type: 'get_attendance' }), false);
  assert.equal(isValidRequest(null), false);
});
