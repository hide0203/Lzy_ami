import { validateAttendanceData } from './attendance.js';

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
