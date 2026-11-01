import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScreenshotAttendance,
  combineScreenshotOcrPasses,
  mergeScreenshotParseResults
} from './screenshotImport.js';

test('merges subjects from multiple screenshots and removes overlapping rows', () => {
  const merged = mergeScreenshotParseResults([
    {
      regular: [{ code: 'MCA302', name: 'Information Storage Management', attended: 20, total: 28, valid: true }],
      flexi: [],
      warnings: ['A row could not be read.']
    },
    {
      regular: [
        { code: 'MCA302', name: 'Information Storage Management', attended: 25, total: 28, valid: true },
        { code: 'MCA350', name: 'Minor Project', attended: 0, total: 0, valid: true }
      ],
      flexi: [{ code: 'OE1', name: 'Flexi Course', attended: 5, total: 8, valid: true }],
      warnings: ['A row could not be read.']
    },
    {
      regular: [{ code: 'MCA302', name: 'Information Storage Management', attended: 20, total: 28, valid: true }],
      flexi: [],
      warnings: []
    }
  ]);

  assert.equal(merged.regular.length, 2);
  assert.equal(merged.regular[0].attended, 20);
  assert.equal(merged.regular[0].valid, false);
  assert.match(merged.regular[0].warning, /different attendance counts/i);
  assert.equal(merged.flexi.length, 1);
  assert.deepEqual(merged.warnings, ['A row could not be read.']);
});

test('combines complementary OCR passes from the same screenshot', () => {
  const merged = mergeScreenshotParseResults([
    {
      regular: [{ code: 'MCA302', name: 'Information Storage Management', attended: 25, total: 28, valid: true }],
      flexi: [],
      warnings: []
    },
    {
      regular: [{ code: 'BSS311', name: 'Behavioural Science III', attended: 2, total: 4, valid: true }],
      flexi: [{ code: 'OEGAT380', name: 'GAT II', attended: 18, total: 22, valid: true }],
      warnings: []
    }
  ]);

  assert.deepEqual(merged.regular.map(({ code }) => code), ['MCA302', 'BSS311']);
  assert.equal(merged.flexi.length, 1);
  assert.equal(merged.flexi[0].code, 'OEGAT380');
});

test('prefers the OCR pass with the most valid count reads and supplements missing subjects', () => {
  const result = combineScreenshotOcrPasses([
    {
      regular: [{ code: 'MCA302', name: 'Information Storage Management', attended: 17, total: 28, countsValid: true, valid: true }],
      flexi: [],
      warnings: [],
      pageSegMode: '11',
      text: 'low-quality text'
    },
    {
      regular: [
        { code: 'MCA302', name: 'Information Storage Management', attended: 25, total: 28, countsValid: true, valid: true },
        { code: 'MCA303', name: 'Python', attended: 28, total: 28, countsValid: true, valid: true }
      ],
      flexi: [],
      warnings: [],
      pageSegMode: '6',
      text: 'clearer text'
    }
  ]);

  assert.equal(result.pageSegMode, '6');
  assert.deepEqual(result.regular.map(({ code }) => code), ['MCA302', 'MCA303']);
  assert.equal(result.regular[0].attended, 25);
});

test('deduplicates a subject when only one OCR pass recognizes its code', () => {
  const merged = mergeScreenshotParseResults([
    {
      regular: [{ code: '', name: 'Information Storage Management', attended: 25, total: 28, valid: true }],
      flexi: [],
      warnings: []
    },
    {
      regular: [{ code: 'MCA302', name: 'Information Storage Management', attended: 25, total: 28, valid: true }],
      flexi: [],
      warnings: []
    }
  ]);

  assert.equal(merged.regular.length, 1);
  assert.equal(merged.regular[0].code, 'MCA302');
});

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
