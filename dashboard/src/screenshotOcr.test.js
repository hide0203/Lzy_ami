import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttendanceOcr } from './screenshotOcr.js';

test('parses regular and Flexi rows from OCR lines using their table headers', () => {
  const result = parseAttendanceOcr({
    data: {
      lines: [
        { text: 'Course Code Course Name Type Course Syllabus Session Plans Attendance' },
        { text: 'MCA302 Information Storage Management Regular 25/28 (89.29)' },
        { text: 'BSS311 Behavioural Science-III (Leading Through Teams) Regular 2/4 (50.00)' },
        { text: 'Group Name Course Code Subject Name Type Credit Session Plans Attendance' },
        { text: '2025 OE-Competitive Examinations for Employability OEGAT380 GAT II Intermediate Course Flexi 18/22 (81.82)' }
      ]
    }
  });

  assert.equal(result.regular.length + result.flexi.length, 3);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.regular.map(({ code, name, attended, total, percentage }) => ({
    code, name, attended, total, percentage
  })), [
    {
      code: 'MCA302',
      name: 'Information Storage Management',
      attended: 25,
      total: 28,
      percentage: 89.29
    },
    {
      code: 'BSS311',
      name: 'Behavioural Science-III (Leading Through Teams)',
      attended: 2,
      total: 4,
      percentage: 50
    }
  ]);
  assert.equal(result.flexi[0].code, 'OEGAT380');
  assert.equal(result.flexi[0].name, 'GAT II Intermediate Course');
  assert.equal(result.flexi[0].percentage, 81.82);
});

test('keeps 0/0 as no percentage and flags mismatching OCR percentages for review', () => {
  const result = parseAttendanceOcr([
    'Course Code Course Name Type Course Syllabus Session Plans Attendance',
    'MCA350 Minor Project Regular 0/0 (0)',
    'MCA302 Information Storage Management Regular 25/28 (90)'
  ]);

  assert.equal(result.regular[0].attended, 0);
  assert.equal(result.regular[0].total, 0);
  assert.equal(result.regular[0].percentage, null);
  assert.equal(result.regular[0].valid, true);
  assert.equal(result.regular[1].percentage, 89.29);
  assert.equal(result.regular[1].valid, false);
  assert.match(result.regular[1].warning, /does not match/i);
});

test('does not treat slash or percentage text in course names as attendance', () => {
  const result = parseAttendanceOcr([
    'Course Code Course Name Type Course Syllabus Session Plans Attendance',
    'MCA401 Report on 5/7 Techniques and 80 percent Regular 12/16 (75.00)'
  ]);

  assert.equal(result.regular.length, 1);
  assert.equal(result.regular[0].name, 'Report on 5/7 Techniques and 80 Percent');
  assert.equal(result.regular[0].attended, 12);
  assert.equal(result.regular[0].total, 16);
});

test('keeps names and attendance when OCR mangles mixed-case course codes', () => {
  const result = parseAttendanceOcr([
    'Course Code Course Name Type Course Syllabus Session Plans Attendance',
    'Bss3N Behavioural science-IiI (Leading Through Teams) Compulsory 4/6 (66.67)',
    'Mci2al Cloud Computing Elective & 24/24 (100.00)',
    'Mci4l Cloud Computing LAB Elective & 7/8 (87.50)'
  ]);

  assert.equal(result.regular.length, 3);
  assert.deepEqual(result.regular.map(({ code, name, attended, total, valid }) => ({
    code, name, attended, total, valid
  })), [
    {
      code: '',
      name: 'Behavioural Science-III (Leading Through Teams)',
      attended: 4,
      total: 6,
      valid: true
    },
    {
      code: '',
      name: 'Cloud Computing',
      attended: 24,
      total: 24,
      valid: true
    },
    {
      code: '',
      name: 'Cloud Computing LAB',
      attended: 7,
      total: 8,
      valid: true
    }
  ]);
  assert.equal(result.regular.every(({ warning }) => /code was unclear/i.test(warning)), true);
});

test('normalizes reliably recognized mixed-case course codes without guessing damaged codes', () => {
  const result = parseAttendanceOcr([
    'Course Code Course Name Type Course Syllabus Session Plans Attendance',
    'mca302 Information Storage Management Compulsory 25/28 (89.29)'
  ]);

  assert.equal(result.regular[0].code, 'MCA302');
  assert.equal(result.regular[0].name, 'Information Storage Management');
  assert.equal(result.regular[0].warning, '');
});

test('warns instead of guessing when an OCR row has no recognized table header', () => {
  const result = parseAttendanceOcr([
    'MCA302 Information Storage Management 25/28 (89.29)'
  ]);

  assert.equal(result.regular.length, 0);
  assert.equal(result.flexi.length, 0);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /could not identify the table/i);
});

test('rejects unsupported OCR output rather than returning empty attendance', () => {
  assert.throws(() => parseAttendanceOcr({}), /OCR output must be text or an array/i);
});
