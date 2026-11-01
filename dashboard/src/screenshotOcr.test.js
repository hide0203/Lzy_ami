import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttendanceOcr, parseAttendanceOcrRows } from './screenshotOcr.js';

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

test('parses all screenshot table rows using attendance-cell OCR and cleans column noise', () => {
  const rows = [
    ['Regular', 'BSS311 Behavioural Science-1ll (Leading Through Teams) Compulsory dy ®4/6 (66.67)', '4/6 (66.67)'],
    ['Regular', 'BCS311 Communication Skills -III Compulsory & ®16/16 (100.00)', '16/16 (100.00)'],
    ['Regular', 'MCA302 Information Storage Management Compulsory chy ®25/28 (89.29)', '25/28 (89.29)'],
    ['Regular', 'MCA350 Minor Project Compulsory Jy ®0/0 (0)', '0/0 (0)'],
    ['Regular', 'MCA303 Python Compulsory by ®28/28 (100.00)', '28/28 (100.00)'],
    ['Regular', 'MCA323 Python Lab Compulsory Jy ®20/20 (100.00)', '20/20 (100.00)'],
    ['Regular', 'MCA351 Report on Paper Presentation in Conference Compulsory & ®0/0 (0)', '0/0 (0)'],
    ['Regular', 'MCA352 Summer Internship Project Compulsory & ®0/0 (0)', '0/0 (0)'],
    ['Regular', 'MCI331 Cloud Computing Elective EX ®24/24 (100.00)', '24/24 (100.00)'],
    ['Regular', 'MCI341 Cloud Computing LAB Elective & ®7/8 (87.50)', '7/8 (87.50)'],
    ['Regular', 'MCA334 Digital Image Processing Elective & ®19/21 (90.48)', '19/21 (90.48)'],
    ['Regular', 'FLG311 German-III FBL EX ®21/24 (87.50)', '21/24 (87.50)'],
    ['Flexi', '2025 OE-Competitive Examinations for OEGAT380 GAT - II - Intermediate Course Compulsory 3.00 ®18/22 (81.82)', '18/22 (81.82)']
  ].map(([category, text, attendanceText]) => ({
    category,
    text,
    attendanceText,
    words: []
  }));
  const result = parseAttendanceOcrRows(rows);

  assert.equal(result.regular.length, 12);
  assert.equal(result.flexi.length, 1);
  assert.deepEqual(result.regular.map(({ attended, total }) => [attended, total]), [
    [4, 6], [16, 16], [25, 28], [0, 0], [28, 28], [20, 20],
    [0, 0], [0, 0], [24, 24], [7, 8], [19, 21], [21, 24]
  ]);
  assert.equal(result.regular[0].name, 'Behavioural Science-III (Leading Through Teams)');
  assert.equal(result.regular[0].percentage, 66.67);
  assert.equal(result.regular[3].percentage, null);
  assert.equal(result.regular[3].valid, true);
  assert.equal(result.flexi[0].name, 'GAT - II - Intermediate Course');
  assert.equal(result.flexi[0].percentage, 81.82);
  assert.deepEqual(result.warnings, []);
});

test('parses a Flexi row when its OCR crop also contains the table header', () => {
  const row = {
    category: 'Flexi',
    text: [
      'Group Name Course Code Subject Name Type Credit SessionPlans Attendance',
      '2025 OE-Management ABS OEMGH380 Strategic Management Behavior Compulsory 3.00 11/19 (57.89)'
    ].join('\n'),
    attendanceText: '11/19 (57.89)',
    attendanceYTop: 20,
    attendanceYBottom: 45,
    imageWidth: 1800,
    words: [
      ['OEMGH380', 360],
      ['Strategic', 515],
      ['Management', 620],
      ['Behavior', 755],
      ['Compulsory', 860],
      ['11/19', 1524]
    ].map(([text, x0]) => ({
      text,
      bbox: { x0, x1: x0 + 80, y1: 40 }
    }))
  };
  const result = parseAttendanceOcrRows([row]);

  assert.equal(result.regular.length, 0);
  assert.equal(result.flexi.length, 1);
  assert.equal(result.flexi[0].code, 'OEMGH380');
  assert.equal(result.flexi[0].name, 'Strategic Management Behavior');
  assert.equal(result.flexi[0].attended, 11);
  assert.equal(result.flexi[0].total, 19);
  assert.equal(result.flexi[0].percentage, 57.89);
  assert.deepEqual(result.warnings, []);
});

test('uses regular subject-cell words when OCR damages the code and type columns', () => {
  const result = parseAttendanceOcrRows([
    {
      category: 'Regular',
      text: 'B8ss311 Behavioural Science-1ll (Leading Through Teams) Compulsory 4/6',
      attendanceText: '4/6 (66.67)',
      attendanceYTop: 20,
      attendanceYBottom: 45,
      imageWidth: 1800,
      words: [
        ['B8ss311', 70],
        ['Behavioural', 220],
        ['Science-1ll', 340],
        ['(Leading', 450],
        ['Through', 540],
        ['Teams)', 630],
        ['Compulsory', 750],
        ['4/6', 1520]
      ].map(([text, x0]) => ({
        text,
        bbox: { x0, x1: x0 + 80, y1: 40 }
      }))
    },
    {
      category: 'Regular',
      text: 'FLG3N German-iil #81 S ®10/24 (41.67)',
      attendanceText: '10/24 (41.67)',
      attendanceYTop: 20,
      attendanceYBottom: 45,
      imageWidth: 1800,
      words: [
        ['FLG3N', 70],
        ['German-iil', 220],
        ['#81', 750],
        ['S', 890],
        ['10/24', 1520]
      ].map(([text, x0]) => ({
        text,
        bbox: { x0, x1: x0 + 80, y1: 40 }
      }))
    }
  ]);

  assert.equal(result.regular.length, 2);
  assert.equal(result.regular[0].name, 'Behavioural Science-III (Leading Through Teams)');
  assert.equal(result.regular[0].attended, 4);
  assert.equal(result.regular[0].total, 6);
  assert.equal(result.regular[0].percentage, 66.67);
  assert.equal(result.regular[1].name, 'German-III');
  assert.equal(result.regular[1].attended, 10);
  assert.equal(result.regular[1].total, 24);
  assert.equal(result.regular[1].percentage, 41.67);
});

test('keeps a subject with an unreadable attendance cell without inventing counts', () => {
  const result = parseAttendanceOcrRows([{
    category: 'Regular',
    text: 'MCA401 Subject Name with 5/7 in the title Compulsory',
    attendanceText: '',
    words: []
  }]);

  assert.equal(result.regular.length, 1);
  assert.equal(result.regular[0].name, 'Subject Name with 5/7 in the Title');
  assert.equal(result.regular[0].attended, null);
  assert.equal(result.regular[0].total, null);
  assert.equal(result.regular[0].valid, false);
  assert.match(result.regular[0].warning, /attendance cell/i);
});

test('joins course details and attendance recognized on separate lines', () => {
  const result = parseAttendanceOcr([
    'Course Code Course Name Type Course Syllabus Session Plans Attendance',
    'MCA302 Information Storage',
    'Management Compulsory',
    '25/28 (89.29)'
  ]);

  assert.equal(result.regular.length, 1);
  assert.equal(result.regular[0].code, 'MCA302');
  assert.equal(result.regular[0].name, 'Information Storage Management');
  assert.equal(result.regular[0].attended, 25);
  assert.equal(result.regular[0].total, 28);
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

test('normalizes OCR variants of Roman numeral subject suffixes', () => {
  const result = parseAttendanceOcr([
    'Course Code Course Name Type Course Syllabus Session Plans Attendance',
    'BSS311 Behavioural Science- Ill (Leading Through Teams) Compulsory 4/6',
    'BCS311 Communication Skills -1lI Compulsory 16/16'
  ]);

  assert.deepEqual(result.regular.map(({ name }) => name), [
    'Behavioural Science-III (Leading Through Teams)',
    'Communication Skills -III'
  ]);
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
