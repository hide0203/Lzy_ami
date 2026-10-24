export const DEFAULT_TARGET = 75;

export function calculateAttendance(subject, target) {
  const attended = subject.attended;
  const total = subject.total;
  const validTarget = Number.isFinite(target) && target > 0 && target <= 100;
  const validCounts = Number.isInteger(attended)
    && Number.isInteger(total)
    && attended >= 0
    && total >= 0
    && attended <= total;

  if (!validTarget || !validCounts) {
    return {
      valid: false,
      percentage: null,
      status: 'invalid',
      recommendation: 'Check attendance data'
    };
  }

  if (total === 0) {
    return {
      valid: true,
      percentage: null,
      status: 'no-classes',
      recommendation: 'No classes conducted',
      classesToAttend: null,
      classesToSkip: null
    };
  }

  const percentage = (attended / total) * 100;
  const epsilon = 1e-10;

  if (percentage + epsilon < target) {
    const classesToAttend = target === 100
      ? (attended === total ? 0 : null)
      : Math.max(0, Math.ceil(((target / 100) * total - attended) / (1 - target / 100) - epsilon));

    return {
      valid: true,
      percentage,
      status: 'below-target',
      classesToAttend,
      classesToSkip: 0,
      recommendation: classesToAttend === null
        ? 'A 100% target cannot be reached by attending future classes'
        : `Attend the next ${classesToAttend} ${classesToAttend === 1 ? 'class' : 'classes'} to reach ${target}%`
    };
  }

  if (Math.abs(percentage - target) <= epsilon) {
    return {
      valid: true,
      percentage,
      status: 'at-target',
      classesToAttend: 0,
      classesToSkip: 0,
      recommendation: "At target — don't skip"
    };
  }

  const classesToSkip = target === 100
    ? 0
    : Math.max(0, Math.floor(attended / (target / 100) - total + epsilon));

  return {
    valid: true,
    percentage,
    status: classesToSkip > 0 ? 'on-track' : 'no-buffer',
    classesToAttend: 0,
    classesToSkip,
    recommendation: classesToSkip > 0
      ? `You can skip ${classesToSkip} ${classesToSkip === 1 ? 'class' : 'classes'}`
      : "Don't skip classes"
  };
}

function normalizeSubject(subject, category) {
  if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
    throw new Error('Each subject must be an object.');
  }

  const name = typeof subject.name === 'string' ? subject.name.trim() : '';
  const code = typeof subject.code === 'string' ? subject.code.trim() : '';
  if (!name && !code) throw new Error('Each subject must include a name or course code.');

  const normalized = {
    code,
    name: name || code,
    category,
    attended: subject.attended,
    total: subject.total,
    percentage: null,
    valid: subject.valid !== false,
    warning: typeof subject.warning === 'string' ? subject.warning : ''
  };
  const isZeroRecord = normalized.attended === 0 && normalized.total === 0;
  const hasValidCounts = Number.isInteger(normalized.attended)
    && Number.isInteger(normalized.total)
    && normalized.attended >= 0
    && normalized.total >= 0
    && normalized.attended <= normalized.total;

  if (!hasValidCounts) {
    normalized.valid = false;
    normalized.warning ||= 'Attendance counts are missing or invalid.';
    return normalized;
  }

  if (isZeroRecord) {
    normalized.percentage = null;
    normalized.status = 'No classes conducted';
    return normalized;
  }

  if (normalized.total === 0) {
    normalized.valid = false;
    normalized.warning ||= 'A zero-class record must be 0/0.';
    return normalized;
  }

  const calculatedPercentage = Number(((normalized.attended / normalized.total) * 100).toFixed(2));
  const suppliedPercentage = subject.percentage;
  if (suppliedPercentage !== null
    && suppliedPercentage !== undefined
    && (!Number.isFinite(suppliedPercentage) || Math.abs(suppliedPercentage - calculatedPercentage) > 0.05)) {
    normalized.valid = false;
    normalized.warning ||= 'Displayed percentage does not match the attendance counts.';
  }
  normalized.percentage = calculatedPercentage;
  return normalized;
}

export function validateAttendanceData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The JSON file must contain an attendance object.');
  }
  if (!Array.isArray(data.regular) || !Array.isArray(data.flexi)) {
    throw new Error('The JSON file must include regular and flexi subject arrays.');
  }

  return {
    semester: typeof data.semester === 'string' ? data.semester : '',
    syncedAt: typeof data.syncedAt === 'string'
      ? data.syncedAt
      : typeof data.lastSyncedAt === 'string'
        ? data.lastSyncedAt
        : '',
    regular: data.regular.map((subject) => normalizeSubject(subject, 'Regular')),
    flexi: data.flexi.map((subject) => normalizeSubject(subject, 'Flexi'))
  };
}
