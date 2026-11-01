import { validateAttendanceData } from './attendance.js';

export function combineScreenshotOcrPasses(results) {
  if (!results.length) return { regular: [], flexi: [], warnings: [] };

  const score = (result) => {
    const subjects = [...result.regular, ...result.flexi];
    return [
      subjects.filter((subject) => subject.countsValid).length,
      subjects.filter((subject) => subject.valid).length,
      subjects.length,
      -result.warnings.length
    ];
  };
  const compareScore = (first, second) => {
    const firstScore = score(first);
    const secondScore = score(second);
    for (let index = 0; index < firstScore.length; index += 1) {
      if (firstScore[index] !== secondScore[index]) return firstScore[index] - secondScore[index];
    }
    return 0;
  };
  const ordered = [...results].sort(compareScore).reverse();
  const best = ordered[0];
  const combined = {
    ...best,
    regular: [...best.regular],
    flexi: [...best.flexi],
    warnings: [...best.warnings]
  };

  ordered.slice(1).forEach((result) => {
    ['regular', 'flexi'].forEach((category) => {
      result[category].forEach((subject) => {
        if (!subject.countsValid) return;
        const normalizedName = subject.name.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
        const existing = combined[category].some((candidate) => {
          if (candidate.code && subject.code) {
            return candidate.code.toLocaleLowerCase() === subject.code.toLocaleLowerCase();
          }
          return candidate.name.toLocaleLowerCase().replace(/[^a-z0-9]/g, '') === normalizedName;
        });
        if (!existing) combined[category].push(subject);
      });
    });
    result.warnings.forEach((warning) => {
      if (!combined.warnings.includes(warning)) combined.warnings.push(warning);
    });
  });

  return combined;
}

export function mergeScreenshotParseResults(results) {
  const merged = { regular: [], flexi: [], warnings: [] };
  const subjectsByCategory = {
    regular: new Map(),
    flexi: new Map()
  };

  results.forEach((result) => {
    ['regular', 'flexi'].forEach((category) => {
      result[category].forEach((subject) => {
        const subjects = subjectsByCategory[category];
        const normalizedName = subject.name.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
        const existingEntry = [...subjects.entries()].find(([, existing]) => {
          if (existing.code && subject.code) {
            return existing.code.toLocaleLowerCase() === subject.code.toLocaleLowerCase();
          }
          return existing.name.toLocaleLowerCase().replace(/[^a-z0-9]/g, '') === normalizedName;
        });

        if (!existingEntry) {
          subjects.set(`${subject.code || normalizedName}:${subjects.size}`, subject);
          return;
        }

        const [key, existing] = existingEntry;
        if (existing.attended !== subject.attended || existing.total !== subject.total) {
          subjects.set(key, {
            ...existing,
            code: existing.code || subject.code,
            screenshotConflict: true,
            valid: false,
            warning: 'Screenshots showed different attendance counts for this subject. Check the latest Amizone record.'
          });
        } else if (!existing.screenshotConflict && !existing.valid && subject.valid) {
          subjects.set(key, { ...subject, code: existing.code || subject.code });
        } else if (!existing.code && subject.code) {
          subjects.set(key, { ...existing, code: subject.code });
        }
      });
    });
    result.warnings.forEach((warning) => {
      if (!merged.warnings.includes(warning)) merged.warnings.push(warning);
    });
  });

  merged.regular = [...subjectsByCategory.regular.values()];
  merged.flexi = [...subjectsByCategory.flexi.values()];
  return merged;
}

export function buildScreenshotAttendance(parsed, syncedAt = new Date().toISOString()) {
  if (!parsed || !Array.isArray(parsed.regular) || !Array.isArray(parsed.flexi)) {
    throw new Error('No readable attendance rows were found in the screenshot.');
  }

  const subjects = [...parsed.regular, ...parsed.flexi];
  if (subjects.length === 0) {
    throw new Error('No attendance rows were found. Try a clear screenshot showing the table headings.');
  }

  const toAttendanceRecord = ({ code, name, attended, total, valid, warning }) => ({
    code,
    name,
    attended,
    total,
    percentage: null,
    valid,
    warning
  });

  return validateAttendanceData({
    semester: '',
    syncedAt,
    regular: parsed.regular.map(toAttendanceRecord),
    flexi: parsed.flexi.map(toAttendanceRecord)
  });
}
