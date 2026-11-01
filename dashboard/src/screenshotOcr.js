const COUNT_AT_END = /(\d+)\s*[/|]\s*(\d+)\s*(?:\(\s*(\d+(?:[.,]\d+)?)\s*%?\s*\))?\s*$/;
const COUNT_IN_TEXT = /(\d+)\s*[/|]\s*(\d+)(?:\s*\(\s*(\d+(?:[.,]\d+)?)\s*%?\s*\))?/g;
const COURSE_CODE = /^[A-Z]{2,6}\d{3}$/i;
const COURSE_TOKEN = /\b[A-Z0-9]{4,}\b/gi;
const CODE_LIKE_TOKEN = /^([A-Z][A-Z0-9]{3,})\b\s*/i;
const ROMAN_NUMERALS = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);
const LOWERCASE_TITLE_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

export async function prepareScreenshotForOcr(file) {
  let bitmap;
  let image;

  if (typeof createImageBitmap === 'function') {
    bitmap = await createImageBitmap(file);
    image = bitmap;
  } else {
    image = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const element = new Image();
      element.onload = () => {
        URL.revokeObjectURL(url);
        resolve(element);
      };
      element.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The selected screenshot could not be opened.'));
      };
      element.src = url;
    });
  }

  const maxWidth = 1800;
  const maxHeight = 3600;
  let cropTop = 0;
  let cropHeight = image.height;
  const canvas = document.createElement('canvas');
  let attendanceBands = [];

  try {
    const scanCanvas = document.createElement('canvas');
    const scanScale = Math.min(1, 512 / image.width);
    scanCanvas.width = Math.max(1, Math.round(image.width * scanScale));
    scanCanvas.height = Math.max(1, Math.round(image.height * scanScale));
    const scanContext = scanCanvas.getContext('2d', { willReadFrequently: true });
    if (!scanContext) throw new Error('Could not prepare the screenshot for reading.');
    scanContext.drawImage(image, 0, 0, scanCanvas.width, scanCanvas.height);
    const pixels = scanContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height).data;
    const attendanceColumnStart = Math.floor(scanCanvas.width * 0.78);
    const attendanceColumnEnd = Math.floor(scanCanvas.width * 0.99);
    const attendanceRowThreshold = Math.max(4, Math.floor(scanCanvas.width * 0.015));
    const attendanceRows = [];
    for (let y = 0; y < scanCanvas.height; y += 1) {
      let purplePixels = 0;
      for (let x = attendanceColumnStart; x < attendanceColumnEnd; x += 1) {
        const offset = (y * scanCanvas.width + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (
          red > 100
          && red < 205
          && green > 45
          && green < 185
          && blue > red + 10
          && blue > green + 15
        ) {
          purplePixels += 1;
        }
      }
      if (purplePixels >= attendanceRowThreshold) attendanceRows.push(y);
    }

    if (attendanceRows.length > 0) {
      let bandStart = attendanceRows[0];
      let lastBandRow = attendanceRows[0];
      attendanceRows.slice(1).forEach((row) => {
        if (row - lastBandRow > 3) {
          if (lastBandRow - bandStart >= 5) attendanceBands.push([bandStart, lastBandRow]);
          bandStart = row;
        }
        lastBandRow = row;
      });
      if (lastBandRow - bandStart >= 5) attendanceBands.push([bandStart, lastBandRow]);
      attendanceBands = attendanceBands.filter(([start]) => start > scanCanvas.height * 0.12);

      const verticalGaps = attendanceBands.slice(1).map((band, index) => {
        const previousCenter = (attendanceBands[index][0] + attendanceBands[index][1]) / 2;
        const currentCenter = (band[0] + band[1]) / 2;
        return { index: index + 1, gap: currentCenter - previousCenter };
      });
      const regularGaps = verticalGaps.map(({ gap }) => gap).filter((gap) => gap < 36);
      const typicalGap = regularGaps.length
        ? regularGaps.sort((first, second) => first - second)[Math.floor(regularGaps.length / 2)]
        : 0;
      const flexiStart = verticalGaps.find(({ gap }) => gap > Math.max(36, typicalGap * 2.5))?.index
        ?? attendanceBands.length;

      const verticalMargin = Math.ceil(scanCanvas.height * 0.04);
      const firstAttendanceRow = attendanceBands.length ? attendanceBands[0][0] : attendanceRows[0];
      const lastAttendanceRow = attendanceBands.length
        ? attendanceBands[attendanceBands.length - 1][1]
        : attendanceRows[attendanceRows.length - 1];
      const firstRow = Math.max(0, firstAttendanceRow - verticalMargin);
      const lastCropRow = Math.min(scanCanvas.height - 1, lastAttendanceRow + verticalMargin);
      cropTop = Math.floor(firstRow / scanScale);
      cropHeight = Math.min(
        image.height - cropTop,
        Math.ceil((lastCropRow - firstRow + 1) / scanScale)
      );
      attendanceBands = attendanceBands.map(([start, end], index) => {
        const rowHeight = Math.ceil((end - start + 1) / scanScale);
          const isFlexi = index >= flexiStart;
          const rowMargin = isFlexi
            ? Math.max(14, rowHeight)
            : Math.max(8, Math.ceil(rowHeight * 0.4));
        const rowTop = Math.max(0, Math.floor(start / scanScale) - rowMargin);
        const rowBottom = Math.min(
          image.height,
          Math.ceil((end + 1) / scanScale) + rowMargin
        );
        const rowCanvas = document.createElement('canvas');
        const rowScale = Math.min(3, maxWidth / image.width, maxHeight / (rowBottom - rowTop));
        rowCanvas.width = Math.max(1, Math.round(image.width * rowScale));
        rowCanvas.height = Math.max(1, Math.round((rowBottom - rowTop) * rowScale));
        const attendanceYTop = (start / scanScale - rowTop) * rowScale;
        const attendanceYBottom = ((end + 1) / scanScale - rowTop) * rowScale;
        const rowContext = rowCanvas.getContext('2d');
        if (!rowContext) throw new Error('Could not prepare an attendance row for reading.');
        rowContext.imageSmoothingEnabled = true;
        rowContext.imageSmoothingQuality = 'high';
        rowContext.filter = 'grayscale(1) contrast(1.35)';
        rowContext.drawImage(
          image,
          0,
          rowTop,
          image.width,
          rowBottom - rowTop,
          0,
          0,
          rowCanvas.width,
          rowCanvas.height
        );
        return {
          image: rowCanvas,
          category: isFlexi ? 'Flexi' : 'Regular',
          attendanceYTop,
          attendanceYBottom
        };
      });
    } else {
      const rowThreshold = Math.max(2, Math.floor(scanCanvas.width * 0.01));
      const mergeGap = Math.max(8, Math.floor(scanCanvas.height * 0.02));
      const runs = [];
      let runStart = -1;
      let lastContentRow = -1;

      for (let y = 0; y < scanCanvas.height; y += 1) {
        let inkPixels = 0;
        for (let x = 0; x < scanCanvas.width; x += 1) {
          const offset = (y * scanCanvas.width + x) * 4;
          if (pixels[offset] < 235 || pixels[offset + 1] < 235 || pixels[offset + 2] < 235) {
            inkPixels += 1;
          }
        }
        if (inkPixels >= rowThreshold) {
          if (runStart < 0) runStart = y;
          if (lastContentRow >= 0 && y - lastContentRow > mergeGap) {
            runs.push({ start: runStart, end: lastContentRow });
            runStart = y;
          }
          lastContentRow = y;
        }
      }
      if (runStart >= 0) runs.push({ start: runStart, end: lastContentRow });

      const contentRuns = runs.filter((run) => run.end - run.start >= scanCanvas.height * 0.002);
      const contentTop = contentRuns.length ? contentRuns[0].start : -1;
      const contentBottom = contentRuns.length ? contentRuns[contentRuns.length - 1].end : -1;
      if (contentTop >= 0 && contentBottom - contentTop < scanCanvas.height * 0.92) {
        cropTop = Math.floor(contentTop / scanScale);
        cropHeight = Math.min(
          image.height - cropTop,
          Math.ceil((contentBottom - contentTop + 1) / scanScale)
        );
      }
    }

    const scale = Math.min(3, maxWidth / image.width, maxHeight / cropHeight);
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare the screenshot for reading.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.filter = 'grayscale(1) contrast(1.35)';
    context.drawImage(
      image,
      0,
      cropTop,
      image.width,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close();
  }

  return { image: canvas, rows: attendanceBands };
}

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
  const typePosition = value.search(/\s+(?:compulsory|elective(?:\s*&)?|regular|flexi|fbl)\b/i);
  const subjectText = (typePosition >= 0 ? value.slice(0, typePosition) : value)
    .replace(/\s+<\s*1$/i, '-III');
  const cleaned = subjectText
    .replace(/-\s+(?=[1Iil|][1Iil|]{0,3}(?:\s|$|\()(?!\s*-))/g, '-')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/([(])\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s:;,.-]+|[\s:;,.-]+$/g, '')
    .replace(/^[\]\[|®]+|[\]\[|®]+$/g, '');
  let isFirstWord = true;

  return cleaned.split(' ').map((word) => {
    const normalized = word.split('-').map((part, partIndex) => {
      const romanMatch = part.match(/^([^A-Za-z0-9]*)([1Iil|]{1,4})([^A-Za-z0-9]*)$/);
      if (romanMatch && (/[1I|]/.test(romanMatch[2]) || (partIndex > 0 && /^[il]{1,4}$/i.test(romanMatch[2])))) {
        const roman = romanMatch[2].replace(/[1l|]/gi, 'I').toUpperCase();
        if (ROMAN_NUMERALS.has(roman)) return romanMatch[1] + roman + romanMatch[3];
      }
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
  let pendingLines = [];

  lines.forEach((line, index) => {
    const headerContext = lines.slice(Math.max(0, index - 10), index + 1).join(' ');
    const currentLineCategory = getTableCategory(line);
    if (currentLineCategory) {
      category = currentLineCategory;
      pendingLines = [];
      return;
    }
    const detectedCategory = getTableCategory(headerContext);
    if (detectedCategory) {
      if (category !== detectedCategory) pendingLines = [];
      category = detectedCategory;
    }
    if (!COUNT_AT_END.test(line)) {
      if (category) {
        pendingLines.push(line);
        if (pendingLines.length > 4) pendingLines.shift();
      }
      return;
    }

    if (!category) {
      warnings.push(`Could not identify the table for OCR row: "${line}".`);
      return;
    }

    const subject = parseRow([...pendingLines, line].join(' '), category);
    pendingLines = [];
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

export function parseAttendanceOcrRows(rows) {
  const regular = [];
  const flexi = [];
  const warnings = [];

  rows.forEach(({
    category,
    text,
    attendanceText,
    words = [],
    attendanceYTop,
    attendanceYBottom,
    imageWidth
  }) => {
    const attendanceMatch = [...String(attendanceText || '').matchAll(COUNT_IN_TEXT)].at(-1);
    const header = category === 'Flexi'
      ? 'Group Name Course Code Subject Name Type Credit Session Plans Attendance'
      : 'Course Code Course Name Type Course Syllabus Session Plans Attendance';
    const rowText = String(text || '')
      .split(/\r?\n/)
      .map(normalizeLine)
      .filter((line) => line && !(getTableCategory(line) && !COUNT_AT_END.test(line)))
      .join(' ');

    if (!attendanceMatch) {
      const { code, name, codeUnclear } = extractCourseDetails(rowText);
      if (name) {
        const warning = "Attendance value could not be read from this subject's attendance cell.";
        const subject = {
          code,
          name,
          category,
          attended: null,
          total: null,
          percentage: null,
          countsValid: false,
          valid: false,
          warning: codeUnclear
            ? `${warning} Course code was unclear in the screenshot.`
            : warning
        };
        (category === 'Flexi' ? flexi : regular).push(subject);
      }
      warnings.push('An attendance cell could not be read; its subject is marked for review.');
      return;
    }

    const normalizedRow = `${rowText} ${attendanceMatch[1]}/${attendanceMatch[2]}`;
    const parsed = parseAttendanceOcr([header, normalizedRow]);
    const categoryRows = category === 'Flexi' ? parsed.flexi : parsed.regular;
    const subject = categoryRows[0];
    if (!subject) {
      warnings.push('A subject row could not be identified from the screenshot.');
      return;
    }

    const attendanceBandHeight = attendanceYBottom - attendanceYTop;
    const rowWords = words.filter((word) => (
      Number.isFinite(word.bbox?.y1)
      && word.bbox.y1 >= attendanceYTop - attendanceBandHeight * 0.25
    ));
    const courseCodeIndex = rowWords.findIndex((word) => COURSE_CODE.test(
      String(word.text || '').replace(/[^A-Z0-9]/gi, '')
    ));
    const typeWord = rowWords.find((word, index) => (
      index > courseCodeIndex
      && /^(?:compulsory|elective|regular|flexi|fbl)$/i.test(String(word.text || '').replace(/[^a-z]/gi, ''))
    ));
    if (courseCodeIndex >= 0 && Number.isFinite(imageWidth)) {
      const codeWord = rowWords[courseCodeIndex];
      const nameWords = typeWord
        ? rowWords.filter((word) => (
          word.bbox.x0 >= codeWord.bbox.x1 - 4
          && word.bbox.x0 < typeWord.bbox.x0
        ))
        : category === 'Flexi'
          ? rowWords.filter((word) => (
            word.bbox.x0 >= imageWidth * 0.4
            && word.bbox.x0 < (typeWord?.bbox.x0 ?? imageWidth * 0.62)
          ))
          : rowWords.filter((word) => (
            word.bbox.x0 >= imageWidth * 0.11
            && word.bbox.x0 < (typeWord?.bbox.x0 ?? imageWidth * 0.405)
          ));
      const name = nameWords.map((word) => word.text).join(' ');
      if (name.trim()) subject.name = cleanSubjectName(name);
    } else if (Number.isFinite(imageWidth)) {
      const nameWords = category === 'Flexi'
        ? rowWords.filter((word) => (
          word.bbox.x0 >= imageWidth * 0.4
          && word.bbox.x0 < (typeWord?.bbox.x0 ?? imageWidth * 0.62)
        ))
        : rowWords.filter((word) => (
          word.bbox.x0 >= imageWidth * 0.11
          && word.bbox.x0 < (typeWord?.bbox.x0 ?? imageWidth * 0.405)
        ));
      const name = nameWords.map((word) => word.text).join(' ');
      if (name.trim()) subject.name = cleanSubjectName(name);
    }

    (category === 'Flexi' ? flexi : regular).push(subject);
    parsed.warnings.forEach((warning) => {
      if (!warnings.includes(warning)) warnings.push(warning);
    });
  });

  return {
    regular,
    flexi,
    warnings
  };
}
