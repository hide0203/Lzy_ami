import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAttendance, validateAttendanceData } from './attendance.js';

test('zero classes have no percentage or projection', () => {
  const result = calculateAttendance({ attended: 0, total: 0 }, 75);
  assert.equal(result.status, 'no-classes');
  assert.equal(result.percentage, null);
  assert.equal(result.classesToAttend, null);
  assert.equal(result.classesToSkip, null);
  assert.equal(result.recommendation, 'No classes conducted');
});

test('below-target attendance reports the exact classes needed', () => {
  const result = calculateAttendance({ attended: 2, total: 4 }, 75);
  assert.equal(result.classesToAttend, 4);
  assert.equal(result.recommendation, 'Attend the next 4 classes to reach 75%');
});

test('at-target attendance does not suggest skipping', () => {
  const result = calculateAttendance({ attended: 15, total: 20 }, 75);
  assert.equal(result.status, 'at-target');
  assert.equal(result.classesToSkip, 0);
  assert.equal(result.recommendation, "At target — don't skip");
});

test('above-target attendance shows the maximum number of classes to skip', () => {
  const result = calculateAttendance({ attended: 25, total: 28 }, 75);
  assert.equal(result.status, 'on-track');
  assert.equal(result.classesToSkip, 5);
  assert.equal(result.recommendation, 'You can skip 5 classes');
});

test('target of 100 does not claim that below-target attendance can recover', () => {
  const result = calculateAttendance({ attended: 9, total: 10 }, 100);
  assert.equal(result.classesToAttend, null);
  assert.match(result.recommendation, /cannot be reached/i);
});

test('invalid counts are flagged', () => {
  const result = calculateAttendance({ attended: 11, total: 10 }, 75);
  assert.equal(result.valid, false);
  assert.equal(result.status, 'invalid');
});

test('JSON data preserves categories and normalizes zero-class percentage', () => {
  const data = validateAttendanceData({
    semester: 'Semester 1',
    syncedAt: '2026-10-24T00:00:00.000Z',
    regular: [{ code: 'X1', name: 'Project', attended: 0, total: 0, percentage: 0 }],
    flexi: [{ code: 'F1', name: 'Flexi subject', attended: 18, total: 22, percentage: 81.82 }]
  });

  assert.equal(data.regular[0].category, 'Regular');
  assert.equal(data.regular[0].percentage, null);
  assert.equal(data.regular[0].status, 'No classes conducted');
  assert.equal(data.flexi[0].category, 'Flexi');
  assert.equal(data.flexi[0].percentage, 81.82);
});
