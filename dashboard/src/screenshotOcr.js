const COUNT_AT_END = /(\d+)\s*[/|]\s*(\d+)\s*(?:\(\s*(\d+(?:[.,]\d+)?)\s*%?\s*\))?\s*$/;
const COURSE_CODE = /\b(?=[A-Z0-9]{4,}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]+\b/g;

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

function parseRow(line, category) {
  const countMatch = COUNT_AT_END.exec(line);
  if (!countMatch) return null;

  const beforeCounts = line.slice(0, countMatch.index).trim();
  const courseCodeMatch = COURSE_CODE.exec(beforeCounts);
  COURSE_CODE.lastIndex = 0;
  if (!courseCodeMatch) return null;

  const code = courseCodeMatch[0];
  const name = beforeCounts.slice(courseCodeMatch.index + code.length)
    .replace(/\s+(?:regular|flexi)\s*$/i, '')
    .trim();
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

  return {
    code,
    name,
    category,
    attended,
    total,
    percentage: validCounts ? calculatedPercentage : null,
    valid,
    warning: !validCounts
      ? 'OCR attendance counts are inconsistent; review this row.'
      : !percentageMatches
        ? 'OCR percentage does not match the attendance counts; review this row.'
        : ''
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
    warnings,
    requiresReview: true
  };
}
