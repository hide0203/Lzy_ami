const test = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, validateAttendanceSnapshot } = require('../data.js');

const validSnapshot = {
  schemaVersion: 1,
  semester: 'Semester 1',
  syncedAt: '2026-10-24T01:00:00.000Z',
  regular: [
    { code: 'R1', name: 'Project', attended: 0, total: 0, percentage: null, valid: true }
  ],
  flexi: [
    { code: 'F1', name: 'Elective', attended: 18, total: 22, percentage: 81.82, valid: true }
  ]
};

test('validates and preserves zero-class subjects and Flexi data', () => {
  const snapshot = validateAttendanceSnapshot(validSnapshot);
  assert.equal(STORAGE_KEY, 'latestAttendance');
  assert.equal(snapshot.regular[0].percentage, null);
  assert.equal(snapshot.regular[0].status, 'No classes conducted');
  assert.equal(snapshot.flexi[0].category, 'Flexi');
});

test('rejects invalid attendance records before storage', () => {
  assert.throws(() => validateAttendanceSnapshot({
    ...validSnapshot,
    flexi: [{ code: 'F1', name: 'Bad record', attended: 23, total: 22, percentage: 104.55, valid: true }]
  }), /invalid attendance counts/i);
  assert.throws(() => validateAttendanceSnapshot({
    ...validSnapshot,
    regular: [{ code: 'R1', name: 'Bad percentage', attended: 18, total: 22, percentage: 85, valid: true }]
  }), /percentage inconsistent/i);
  assert.throws(() => validateAttendanceSnapshot({ ...validSnapshot, syncedAt: 'unknown' }), /timestamp/i);
});

test('preserves explicitly invalid parser rows for the dashboard to flag', () => {
  const snapshot = validateAttendanceSnapshot({
    ...validSnapshot,
    regular: [{
      code: 'R2',
      name: 'Missing attendance',
      attended: null,
      total: null,
      percentage: null,
      valid: false,
      warning: 'Attendance cell is empty.'
    }]
  });
  assert.equal(snapshot.regular[0].valid, false);
  assert.equal(snapshot.regular[0].warning, 'Attendance cell is empty.');
});
