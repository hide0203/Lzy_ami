const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAttendanceText,
  normalizeText,
  extractTableRows,
  extractAttendanceFromPage
} = require('../parser.js');

function buildCell(text) {
  const content = Array.isArray(text) ? text.join('') : text;
  return {
    textContent: content,
    innerText: content,
    querySelectorAll: () => []
  };
}

function buildTable(rows) {
  const rowNodes = rows.map((cells) => ({
    querySelectorAll: (selector) => {
      if (selector === 'th, td' || selector === 'td, th') {
        return cells.map((cellText) => buildCell(cellText));
      }
      return [];
    }
  }));

  return {
    querySelectorAll: (selector) => {
      if (selector === 'tr') return rowNodes;
      return [];
    }
  };
}

function buildDocument(tables) {
  return {
    querySelectorAll: (selector) => selector === 'table' ? tables : [],
    location: {
      href: 'https://s.amizone.net/Academics/MyCourses',
      pathname: '/Academics/MyCourses'
    },
    body: {
      textContent: 'My Courses'
    },
    title: 'My Courses'
  };
}

test('parseAttendanceText handles 100% attendance', () => {
  const result = parseAttendanceText('24/24 (100.00)');
  assert.equal(result.attended, 24);
  assert.equal(result.total, 24);
  assert.equal(result.percentage, 100);
  assert.equal(result.valid, true);
});

test('parseAttendanceText handles attendance exactly at 75%', () => {
  const result = parseAttendanceText('15/20 (75.00)');
  assert.equal(result.attended, 15);
  assert.equal(result.total, 20);
  assert.equal(result.percentage, 75);
  assert.equal(result.valid, true);
});

test('parseAttendanceText handles attendance below target', () => {
  const result = parseAttendanceText('12/20 (60.00)');
  assert.equal(result.attended, 12);
  assert.equal(result.total, 20);
  assert.equal(result.percentage, 60);
  assert.equal(result.valid, true);
});

test('parseAttendanceText handles whitespace and nested content', () => {
  const result = parseAttendanceText('  7 / 8  ( 87.50 )  ');
  assert.equal(result.attended, 7);
  assert.equal(result.total, 8);
  assert.equal(result.percentage, 87.5);
  assert.equal(result.valid, true);
});

test('parseAttendanceText treats 0/0 as valid with unavailable percentage', () => {
  const result = parseAttendanceText('0/0 (0)');
  assert.equal(result.attended, 0);
  assert.equal(result.total, 0);
  assert.equal(result.percentage, null);
  assert.equal(result.valid, true);
  assert.equal(result.warning, '');
});

test('extractTableRows preserves a regular 0/0 subject without an invalid-data warning', () => {
  const table = buildTable([
    ['Course Code', 'Course Name', 'Type', 'Attendance'],
    ['MCA350', 'Minor Project', 'Project', '0/0 (0)']
  ]);

  const [subject] = extractTableRows(table, 'Regular');
  assert.equal(subject.code, 'MCA350');
  assert.equal(subject.name, 'Minor Project');
  assert.equal(subject.attended, 0);
  assert.equal(subject.total, 0);
  assert.equal(subject.percentage, null);
  assert.equal(subject.status, 'No classes conducted');
  assert.equal(subject.valid, true);
  assert.equal(subject.warning, '');
});

test('parseAttendanceText rejects invalid counts', () => {
  const result = parseAttendanceText('abc');
  assert.equal(result.valid, false);
  assert.match(result.warning, /did not match/i);
});

test('parseAttendanceText rejects inconsistent attendance counts and percentages', () => {
  const tooManyAttended = parseAttendanceText('21/20 (105.00)');
  const wrongPercentage = parseAttendanceText('25/28 (90.00)');
  const invalidZeroPercentage = parseAttendanceText('0/0 (100)');

  assert.equal(tooManyAttended.valid, false);
  assert.equal(wrongPercentage.valid, false);
  assert.equal(invalidZeroPercentage.valid, false);
});

test('extractTableRows keeps regular and flexi subject data distinct', () => {
  const table = buildTable([
    ['Course Code', 'Course Name', 'Type', 'Attendance'],
    ['MCA302', 'Information Storage Management', 'Theory', '25/28 (89.29)']
  ]);

  const rows = extractTableRows(table, 'Regular');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].code, 'MCA302');
  assert.equal(rows[0].name, 'Information Storage Management');
  assert.equal(rows[0].category, 'Regular');
  assert.equal(rows[0].attended, 25);
  assert.equal(rows[0].total, 28);
  assert.equal(rows[0].percentage, 89.29);
  assert.equal(rows[0].valid, true);
});

test('extractTableRows parses Flexi attendance from the observed Attendance column', () => {
  const table = buildTable([
    ['Group Name', 'Course Code', 'Subject Name', 'Type', 'Credit', 'Session Plans', 'Attendance'],
    [
      '2025 OE-Competitive Examinations for Employability – General Aptitude Test (GAT) :AICE ASCENT',
      'OEGAT380',
      'GAT – II – Intermediate Course',
      'Compulsory',
      '3.00',
      'View',
      ['18/', '22 ', '(81.82)']
    ]
  ]);

  const [subject] = extractTableRows(table, 'Flexi');
  assert.equal(subject.groupName, '2025 OE-Competitive Examinations for Employability – General Aptitude Test (GAT) :AICE ASCENT');
  assert.equal(subject.code, 'OEGAT380');
  assert.equal(subject.name, 'GAT – II – Intermediate Course');
  assert.equal(subject.type, 'Compulsory');
  assert.equal(subject.attended, 18);
  assert.equal(subject.total, 22);
  assert.equal(subject.percentage, 81.82);
  assert.equal(subject.valid, true);
  assert.equal(subject.warning, '');
});

test('extractTableRows preserves Flexi subject name and warns when Attendance cell is empty', () => {
  const table = buildTable([
    ['Group Name', 'Course Code', 'Subject Name', 'Type', 'Credit', 'Session Plans', 'Attendance'],
    ['Group / Name', 'OEGAT380', 'GAT / Intermediate Course', 'Compulsory', '3.00', 'View', '']
  ]);

  const [subject] = extractTableRows(table, 'Flexi');
  assert.equal(subject.code, 'OEGAT380');
  assert.equal(subject.name, 'GAT / Intermediate Course');
  assert.equal(subject.attended, null);
  assert.equal(subject.total, null);
  assert.equal(subject.percentage, null);
  assert.equal(subject.valid, false);
  assert.match(subject.warning, /attendance cell is empty/i);
});

test('extractAttendanceFromPage classifies the sanitized main and Flexi tables by headers', () => {
  const regularTable = buildTable([
    ['Course Code', 'Course Name', 'Type', 'Course Syllabus', 'Session Plans', 'Attendance'],
    ['BSS311', 'Behavioural Science-III (Leading Through Teams)', 'Compulsory', '', 'View', '2/4 (50.00)'],
    ['BCS311', 'Communication Skills -III', 'Compulsory', '', 'View', '16/16 (100.00)'],
    ['MCA302', 'Information Storage Management', 'Compulsory', '', 'View', '25/28 (89.29)'],
    ['MCA350', 'Minor Project', 'Compulsory', '', 'View', '0/0 (0)'],
    ['MCA303', 'Python', 'Compulsory', '', 'View', '28/28 (100.00)'],
    ['MCA323', 'Python Lab', 'Compulsory', '', 'View', '20/20 (100.00)'],
    ['MCA351', 'Report on Paper Presentation in Conference', 'Compulsory', '', 'View', '0/0 (0)'],
    ['MCA352', 'Summer Internship Project', 'Compulsory', '', 'View', '0/0 (0)'],
    ['MCI331', 'Cloud Computing', 'Elective', '', 'View', '24/24 (100.00)'],
    ['MCI341', 'Cloud Computing LAB', 'Elective', '', 'View', '7/8 (87.50)'],
    ['MCA334', 'Digital Image Processing', 'Elective', '', 'View', '19/21 (90.48)'],
    ['FLG311', 'German-III', 'FBL', '', 'View', '21/24 (87.50)']
  ]);
  const flexiTable = buildTable([
    ['Group Name', 'Course Code', 'Subject Name', 'Type', 'Credit', 'Session Plans', 'Attendance'],
    [
      '2025 OE-Competitive Examinations for Employability – General Aptitude Test (GAT) :AICE ASCENT',
      'OEGAT380',
      'GAT – II – Intermediate Course',
      'Compulsory',
      '3.00',
      'View',
      '18/22 (81.82)'
    ]
  ]);
  const result = extractAttendanceFromPage(buildDocument([flexiTable, regularTable]));

  assert.equal(result.supported, true);
  assert.equal(result.extractionStatus, 'complete');
  assert.deepEqual(result.tableStatus, {
    regularFound: true,
    regularCount: 12,
    flexiFound: true,
    flexiCount: 1
  });
  assert.equal(result.regular.length, 12);
  assert.equal(result.flexi.length, 1);
  assert.equal(result.regular.find((subject) => subject.code === 'MCA350').percentage, null);
  assert.equal(result.regular.find((subject) => subject.code === 'MCA350').status, 'No classes conducted');
  assert.equal(result.regular.find((subject) => subject.code === 'MCA302').percentage, 89.29);
  assert.equal(result.flexi[0].code, 'OEGAT380');
  assert.equal(result.flexi[0].attended, 18);
  assert.equal(result.flexi[0].total, 22);
  assert.equal(result.flexi[0].percentage, 81.82);
});

test('extractAttendanceFromPage reports partial extraction when the regular table is absent', () => {
  const flexiTable = buildTable([
    ['Group Name', 'Course Code', 'Subject Name', 'Type', 'Credit', 'Session Plans', 'Attendance'],
    ['General Aptitude Test', 'OEGAT380', 'GAT Intermediate', 'Compulsory', '3.00', 'View', '18/22 (81.82)']
  ]);

  const result = extractAttendanceFromPage(buildDocument([flexiTable]));
  assert.equal(result.extractionStatus, 'partial');
  assert.equal(result.regular.length, 0);
  assert.equal(result.flexi.length, 1);
  assert.match(result.message, /partial extraction/i);
  assert.ok(result.warnings.some((warning) => /regular courses table was not identified/i.test(warning)));
});

test('normalizeText collapses whitespace', () => {
  assert.equal(normalizeText('  Python   Lab   '), 'Python Lab');
  assert.equal(normalizeText('MCA\n323'), 'MCA 323');
});
