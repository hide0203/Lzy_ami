import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScreenshotAttendance } from './screenshotImport.js';

test('imports parsed screenshot rows without per-subject confirmation', () => {
  const data = buildScreenshotAttendance({
    regular: [
      { code: 'MCA350', name: 'Minor Project', attended: 0, total: 0, valid: true, warning: '' },
      { code: 'MCA302', name: 'Information Storage Management', attended: 25, total: 28, valid: true, warning: '' }
    ],
    flexi: [
      { code: 'OEGAT380', name: 'GAT II', attended: 18, total: 22, valid: true, warning: '' }
    ]
  }, '2026-10-24T00:00:00.000Z');

  assert.equal(data.regular[0].percentage, null);
  assert.equal(data.regular[0].valid, true);
  assert.equal(data.regular[0].status, 'No classes conducted');
  assert.equal(data.regular[1].percentage, 89.29);
  assert.equal(data.flexi[0].percentage, 81.82);
  assert.equal(data.flexi[0].category, 'Flexi');
  assert.equal(data.syncedAt, '2026-10-24T00:00:00.000Z');
});

test('imports uncertain OCR rows but preserves their invalid status and explanation', () => {
  const data = buildScreenshotAttendance({
    regular: [{
      code: 'MCA302',
      name: 'Information Storage Management',
      attended: 25,
      total: 28,
      valid: false,
      warning: 'OCR percentage did not match the counts.'
    }],
    flexi: []
  });

  assert.equal(data.regular[0].valid, false);
  assert.equal(data.regular[0].warning, 'OCR percentage did not match the counts.');
  assert.equal(data.regular[0].percentage, 89.29);
});

test('rejects an empty or malformed parse result without creating fake data', () => {
  assert.throws(
    () => buildScreenshotAttendance({ regular: [], flexi: [] }),
    /no attendance rows/i
  );
  assert.throws(() => buildScreenshotAttendance(null), /no readable attendance rows/i);
});
