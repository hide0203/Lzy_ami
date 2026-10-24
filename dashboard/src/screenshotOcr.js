const COUNT_AT_END = /(\d+)\s*[/|]\s*(\d+)\s*(?:\(\s*(\d+(?:[.,]\d+)?)\s*%?\s*\))?\s*$/;
const COURSE_CODE = /^[A-Z]{2,6}\d{2,4}$/i;
const COURSE_TOKEN = /\b[A-Z0-9]{4,}\b/gi;
const CODE_LIKE_TOKEN = /^([A-Z][A-Z0-9]{3,})\b\s*/i;
const SUBJECT_TYPE = /\s+(?:compulsory|elective(?:\s*&)?|regular|flexi)\s*$/i;
const ROMAN_NUMERALS = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
const LOWERCASE_TITLE_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

function normalizeLine(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function getOcrLines(result) {
  if (typeof result === 'string') return result.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  if (Array.isArray(result)) return result.map(normalizeLine).filter(Boolean);
  if (result?.data?.lines && Array.isArray(result.data.lines)) {
    return result.data.lines.map((line) => normalizeLine(line?.text)).filter(Boolean);
  }
  throw new Error('OCR output must be text or an array of recognized lines.');
}

function getTableCategory(headerText) {
  const text = headerText.toLowerCase();
  if (!text.includes('attendance') || !text.includes('course code')) return null;
  if (text.includes('group name') && text.includes('subject name')) return 'Flexi';
  if (!text.includes('group name') && text.includes('course name')) return 'Regular';
  return null;
}

function cleanSubjectName(value) {
  const cleaned = value
    .replace(SUBJECT_TYPE, '')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '');
  let isFirstWord = true;

  return cleaned.split(' ').map((word) => {
    const normalized = word.split('-').map((part) => {
      const match = part.match(/^([^A-Za-z]*)([A-Za-z]+)([^A-Za-z]*)$/);
      if (!match) return part;
      const [, prefix, letters, suffix] = match;
      const upper = letters.toUpperCase();
      if (ROMAN_NUMERALS.has(upper)) return prefix + upper + suffix;
      if (letters.length > 1 && letters === upper) return part;

      const lower = letters.toLowerCase();
      if (!isFirstWord && LOWERCASE_TITLE_WORDS.has(lower)) {
        isFirstWord = false;
        return prefix + lower + suffix;
      }
      isFirstWord = false;
      return prefix + lower.charAt(0).toUpperCase() + lower.slice(1) + suffix;
    }).join('-');
    return normalized;
  }).join(' ');
}

function extractCourseDetails(text) {
  let courseToken;
  let match;
  while ((match = COURSE_TOKEN.exec(text)) !== null) {
    if (COURSE_CODE.test(match[0])) {
      courseToken = { code: match[0].toUpperCase(), index: match.index, length: match[0].length };
      break;
    }
  }
  COURSE_TOKEN.lastIndex = 0;
  if (courseToken) {
    return {
      code: courseToken.code,
      name: cleanSubjectName(text.slice(courseToken.index + courseToken.length)),
      codeUnclear: false
    };
  }

  const firstToken = CODE_LIKE_TOKEN.exec(text);
  if (!firstToken || !/\d/.test(firstToken[1])) {
    return { code: '', name: cleanSubjectName(text), codeUnclear: false };
  }

  const name = cleanSubjectName(text.slice(firstToken[0].length));
  return { code: '', name, codeUnclear: true };
}

function parseRow(line, category) {
  const countMatch = COUNT_AT_END.exec(line);
  if (!countMatch) return null;

  const beforeCounts = line.slice(0, countMatch.index).trim();
  const { code, name, codeUnclear } = extractCourseDetails(beforeCounts);
  if (!name) return null;

  const attended = Number(countMatch[1]);
  const total = Number(countMatch[2]);
  const displayedPercentage = countMatch[3] === undefined
    ? null
    : Number(countMatch[3].replace(',', '.'));
  const validCounts = attended <= total && (total > 0 || attended === 0);
  const calculatedPercentage = total > 0
    ? Number(((attended / total) * 100).toFixed(2))
    : null;
  const percentageMatches = displayedPercentage === null
    || (total === 0
      ? displayedPercentage === 0
      : Math.abs(displayedPercentage - calculatedPercentage) <= 0.05);
  const valid = validCounts && percentageMatches;
  const warnings = [];
  if (!validCounts) warnings.push('OCR attendance counts are inconsistent; review this row.');
  if (!percentageMatches) warnings.push('OCR percentage does not match the attendance counts; review this row.');
  if (codeUnclear) warnings.push('Course code was unclear in the screenshot; subject name and counts were kept.');

  return {
    code,
    name,
    category,
    attended,
    total,
    percentage: validCounts ? calculatedPercentage : null,
    ocrPercentage: displayedPercentage,
    countsValid: validCounts,
    valid,
    warning: warnings.join(' ')
  };
}

export function parseAttendanceOcr(result) {
  const lines = getOcrLines(result);
  const regular = [];
  const flexi = [];
  const warnings = [];
  let category = null;

  lines.forEach((line, index) => {
    const headerContext = lines.slice(Math.max(0, index - 10), index + 1).join(' ');
    const currentLineCategory = getTableCategory(line);
    if (currentLineCategory) {
      category = currentLineCategory;
      return;
    }
    const detectedCategory = getTableCategory(headerContext);
    if (detectedCategory) {
      category = detectedCategory;
    }
    if (!COUNT_AT_END.test(line)) return;

    if (!category) {
      warnings.push(`Could not identify the table for OCR row: "${line}".`);
      return;
    }

    const subject = parseRow(line, category);
    if (!subject) {
      warnings.push(`Could not read the course code or name in OCR row: "${line}".`);
      return;
    }
    (category === 'Flexi' ? flexi : regular).push(subject);
  });

  if (regular.length + flexi.length === 0 && warnings.length === 0) {
    warnings.push('No attendance rows were recognized. Include the table headers and clear attendance cells.');
  }

  return {
    regular,
    flexi,
    warnings
  };
}
