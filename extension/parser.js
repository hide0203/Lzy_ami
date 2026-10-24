(function (global) {
  function normalizeText(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/\u00A0/g, ' ')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseAttendanceText(rawText) {
    const safeText = normalizeText(rawText || '');
    if (!safeText) {
      return {
        attended: null,
        total: null,
        percentage: null,
        raw: '',
        valid: false,
        warning: 'Missing attendance value.'
      };
    }

    const match = safeText.match(/^\s*(\d+)\s*\/\s*(\d+)\s*(?:\(\s*(\d+(?:\.\d+)?)\s*%?\s*\))?\s*$/i);
    if (!match) {
      return {
        attended: null,
        total: null,
        percentage: null,
        raw: safeText,
        valid: false,
        warning: 'Attendance text did not match the expected A/T (P%) format.'
      };
    }

    const attended = Number.parseFloat(match[1]);
    const total = Number.parseFloat(match[2]);
    const percentage = match[3] === undefined ? null : Number.parseFloat(match[3]);

    if (!Number.isFinite(attended) || !Number.isFinite(total) || total < 0 || attended < 0 || attended > total) {
      return {
        attended: null,
        total: null,
        percentage: null,
        raw: safeText,
        valid: false,
        warning: 'Attendance counts were invalid, negative, or attended classes exceeded total classes.'
      };
    }

    if (total === 0) {
      const validZeroRecord = attended === 0 && (percentage === null || percentage === 0);
      return {
        attended,
        total,
        percentage: null,
        raw: safeText,
        valid: validZeroRecord,
        warning: validZeroRecord ? '' : 'A zero-class attendance record must be 0/0 with no percentage or 0%.'
      };
    }

    const calculated = (attended / total) * 100;
    const tolerance = 0.05;
    const percentageMatches = percentage === null || Math.abs(percentage - calculated) <= tolerance;

    return {
      attended,
      total,
      percentage: percentage === null ? Number(calculated.toFixed(2)) : percentage,
      raw: safeText,
      valid: percentageMatches,
      warning: percentageMatches ? '' : 'Displayed attendance percentage did not match the attended/total values.'
    };
  }

  function findHeaderText(table) {
    if (!table) return '';
    const rows = Array.from(table.querySelectorAll('tr'));
    const textChunks = rows.slice(0, 6).map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map((cell) => normalizeText(cell.textContent || cell.innerText || '')).join(' | ');
    });
    return textChunks.join(' | ').toLowerCase();
  }

  function identifyColumnIndex(headers, variants) {
    const normalizedHeaders = headers.map((header) => normalizeText(header || '').toLowerCase());
    for (const variant of variants) {
      const index = normalizedHeaders.findIndex((header) => header === variant);
      if (index >= 0) return index;
    }
    for (const variant of variants) {
      const index = normalizedHeaders.findIndex((header) => header.includes(variant));
      if (index >= 0) return index;
    }
    return -1;
  }

  function getHeaderRow(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    return rows.find((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const headers = cells.map((cell) => normalizeText(cell.textContent || cell.innerText || '').toLowerCase());
      const hasAttendance = identifyColumnIndex(headers, ['attendance']) >= 0;
      const hasCourseCode = identifyColumnIndex(headers, ['course code']) >= 0;
      const hasCourseName = identifyColumnIndex(headers, ['course name']) >= 0;
      const hasSubjectName = identifyColumnIndex(headers, ['subject name']) >= 0;
      const hasGroupName = identifyColumnIndex(headers, ['group name']) >= 0;
      return hasAttendance && ((hasCourseCode && hasCourseName) || (hasGroupName && hasCourseCode && hasSubjectName));
    }) || null;
  }

  function extractTableRows(table, category) {
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return [];

    const headerRow = getHeaderRow(table);
    if (!headerRow) return [];

    const headerCells = Array.from(headerRow.querySelectorAll('th, td')).map((cell) => normalizeText(cell.textContent || cell.innerText || '').toLowerCase());
    const dataRows = rows.slice(rows.indexOf(headerRow) + 1);

    return dataRows
      .map((row) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (!cells.length) return null;

        const values = cells.map((cell) => normalizeText(cell.textContent || cell.innerText || ''));
        const codeIndex = identifyColumnIndex(headerCells, ['course code', 'code']);
        const groupNameIndex = identifyColumnIndex(headerCells, ['group name']);
        const nameIndex = identifyColumnIndex(headerCells, ['subject name', 'course name', 'name']);
        const typeIndex = identifyColumnIndex(headerCells, ['type']);
        const attendanceIndex = identifyColumnIndex(headerCells, ['attendance']);

        const rawCode = codeIndex >= 0 ? values[codeIndex] || '' : '';
        const groupName = groupNameIndex >= 0 ? values[groupNameIndex] || '' : '';
        const rawName = nameIndex >= 0 ? values[nameIndex] || '' : '';
        const type = typeIndex >= 0 ? values[typeIndex] || '' : '';
        const attendanceSource = attendanceIndex >= 0 ? values[attendanceIndex] || '' : '';

        const parsed = attendanceIndex < 0
          ? {
              attended: null,
              total: null,
              percentage: null,
              valid: false,
              warning: 'Attendance column was not found in the table headers.'
            }
          : !attendanceSource
            ? {
                attended: null,
                total: null,
                percentage: null,
                valid: false,
                warning: 'Attendance cell is empty.'
              }
          : parseAttendanceText(attendanceSource);
        if (!rawCode && !rawName && !groupName && !attendanceSource) {
          return null;
        }

        return {
          code: rawCode,
          groupName,
          name: rawName,
          type,
          category,
          attended: parsed.attended,
          total: parsed.total,
          percentage: parsed.percentage,
          rawAttendance: attendanceSource,
          valid: parsed.valid,
          status: parsed.valid && parsed.total === 0 ? 'No classes conducted' : null,
          warning: parsed.warning
        };
      })
      .filter(Boolean);
  }

  function findTableByHeaders(doc, requiredHeaders, optionalHeaders) {
    const tables = Array.from(doc.querySelectorAll('table'));
    return tables.find((table) => {
      const headerRow = getHeaderRow(table);
      if (!headerRow) return false;
      const headers = Array.from(headerRow.querySelectorAll('th, td'))
        .map((cell) => normalizeText(cell.textContent || cell.innerText || '').toLowerCase());
      const requiredMatch = requiredHeaders.every((header) => identifyColumnIndex(headers, [header]) >= 0);
      const excludedMatch = (optionalHeaders || []).every((header) => identifyColumnIndex(headers, [header]) < 0);
      return requiredMatch && excludedMatch;
    }) || null;
  }

  function findSemesterSelector(doc) {
    const selectors = Array.from(doc.querySelectorAll('select, .dropdown, .custom-select'));
    const candidate = selectors.find((element) => {
      const text = normalizeText(element.textContent || element.value || '').toLowerCase();
      return text.includes('semester') || /\bsem\b|\bsemester\b/i.test(text);
    });

    if (!candidate) return null;

    const selected = candidate.options && candidate.options.length
      ? candidate.options[candidate.selectedIndex || 0]
      : null;

    return {
      selector: candidate,
      value: selected ? normalizeText(selected.textContent || selected.value || '') : normalizeText(candidate.value || ''),
      element: candidate
    };
  }

  function deduplicateSubjects(subjects) {
    const seen = new Set();
    return subjects.filter((subject) => {
      const key = `${(subject.code || '').trim().toLowerCase()}|${(subject.name || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function evaluatePage(doc) {
    const url = (doc.location && doc.location.href) || '';
    const path = (doc.location && doc.location.pathname) || '';
    const hasMyCoursesText = /my courses|mycourses|course/i.test((doc.body ? doc.body.textContent || '' : ''));
    const supported = /amizone/i.test(url) && hasMyCoursesText;

    if (!supported && !/my courses|mycourses|course/i.test(path)) {
      return {
        supported: false,
        reason: 'Open My Courses and select your semester before syncing attendance.'
      };
    }

    return { supported: true, reason: '' };
  }

  function extractAttendanceFromPage(doc) {
    const pageCheck = evaluatePage(doc);
    if (!pageCheck.supported) {
      return {
        supported: false,
        page: 'Home',
        semester: null,
        regular: [],
        flexi: [],
        warnings: [pageCheck.reason],
        message: pageCheck.reason
      };
    }

    const semester = findSemesterSelector(doc);
    const regularTable = findTableByHeaders(doc, ['course code', 'course name', 'attendance']);
    const flexiTable = findTableByHeaders(doc, ['group name', 'course code', 'subject name', 'attendance']);

    const regular = deduplicateSubjects(extractTableRows(regularTable, 'Regular'));
    const flexi = deduplicateSubjects(extractTableRows(flexiTable, 'Flexi'));

    const warnings = [];
    if (!regularTable) warnings.push('Regular courses table was not identified by its column headers.');
    else if (regular.length === 0) warnings.push('Regular courses table was identified but produced no subject records.');
    if (!flexiTable) warnings.push('Flexi table was not identified by its column headers.');
    else if (flexi.length === 0) warnings.push('Flexi table was identified but produced no subject records.');
    regular.forEach((subject) => {
      if (!subject.valid) warnings.push(`Regular subject ${subject.code || subject.name || 'unknown'}: ${subject.warning || 'Missing or invalid attendance data.'}`);
    });
    flexi.forEach((subject) => {
      if (!subject.valid) warnings.push(`Flexi subject ${subject.code || subject.name || 'unknown'}: ${subject.warning || 'Missing or invalid attendance data.'}`);
    });

    const extractionStatus = !regularTable || !flexiTable || regular.length === 0 || flexi.length === 0
      ? (regular.length || flexi.length ? 'partial' : 'failed')
      : 'complete';

    return {
      supported: true,
      page: doc.title || 'Amizone',
      semester: semester ? semester.value : null,
      regular,
      flexi,
      tableStatus: {
        regularFound: Boolean(regularTable),
        regularCount: regular.length,
        flexiFound: Boolean(flexiTable),
        flexiCount: flexi.length
      },
      extractionStatus,
      warnings,
      message: extractionStatus === 'complete'
        ? 'Attendance extracted successfully.'
        : extractionStatus === 'partial'
          ? 'Partial extraction: one or more attendance tables were missing or contained no subject records.'
          : 'Attendance extraction failed: no subject records were found.'
    };
  }

  const api = {
    normalizeText,
    parseAttendanceText,
    getHeaderRow,
    findTableByHeaders,
    findSemesterSelector,
    extractTableRows,
    extractAttendanceFromPage,
    deduplicateSubjects,
    evaluatePage
  };

  global.AmizoneAttendanceParser = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
