import { validateAttendanceData } from './attendance.js';

const DATA_KEY = 'amizone-attendance-data';
const TARGET_KEY = 'amizone-attendance-target';

export function loadAttendance() {
  const raw = window.localStorage.getItem(DATA_KEY);
  return raw ? validateAttendanceData(JSON.parse(raw)) : null;
}

export function saveAttendance(data) {
  window.localStorage.setItem(DATA_KEY, JSON.stringify(validateAttendanceData(data)));
}

export function loadTarget() {
  const value = Number(window.localStorage.getItem(TARGET_KEY));
  return Number.isFinite(value) && value > 0 && value <= 100 ? value : 75;
}

export function saveTarget(target) {
  window.localStorage.setItem(TARGET_KEY, String(target));
}
