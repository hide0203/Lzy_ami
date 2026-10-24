(function (global) {
  const STORAGE_KEY = 'latestAttendance';

  function validateSubject(subject, category) {
    if (!subject || typeof subject !== 'object' || Array.isArray(subject)) {
      throw new Error('Attendance subject must be an object.');
    }

    const code = typeof subject.code === 'string' ? subject.code.trim() : '';
    const name = typeof subject.name === 'string' ? subject.name.trim() : '';
    if (!code && !name) throw new Error('Attendance subject must have a code or name.');

    if (typeof subject.valid !== 'boolean') {
      throw new Error(`Subject ${code || name} has no validation status.`);
    }
    const valid = subject.valid === true;
    const attended = subject.attended;
    const total = subject.total;
    const countsAreNull = attended === null && total === null;
    const countsAreIntegers = Number.isInteger(attended)
      && Number.isInteger(total)
      && attended >= 0
      && total >= 0
      && attended <= total;

    if (valid && !countsAreIntegers) {
      throw new Error(`Valid subject ${code || name} has invalid attendance counts.`);
    }
    if (!countsAreNull && !countsAreIntegers) {
      throw new Error(`Subject ${code || name} has malformed attendance counts.`);
    }

    const percentage = subject.percentage ?? null;
    if (valid && countsAreIntegers && total === 0) {
      if (attended !== 0 || percentage !== null) {
        throw new Error(`Zero-class subject ${code || name} must be 0/0 with no percentage.`);
      }
    } else if (valid && countsAreIntegers) {
      const calculated = (attended / total) * 100;
      if (!Number.isFinite(percentage) || Math.abs(percentage - calculated) > 0.05) {
        throw new Error(`Subject ${code || name} has a percentage inconsistent with its counts.`);
      }
    } else if (percentage !== null && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
      throw new Error(`Subject ${code || name} has an invalid percentage.`);
    }

    return {
      code,
      name: name || code,
      category,
      attended,
      total,
      percentage,
      valid,
      status: valid && total === 0 ? 'No classes conducted' : null,
      warning: typeof subject.warning === 'string' ? subject.warning : ''
    };
  }

  function validateAttendanceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('Attendance snapshot must be an object.');
    }
    if (snapshot.schemaVersion !== 1) throw new Error('Unsupported attendance data version.');
    if (typeof snapshot.semester !== 'string') throw new Error('Attendance semester must be text.');
    if (typeof snapshot.syncedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.syncedAt))) {
      throw new Error('Attendance sync timestamp is missing or invalid.');
    }
    if (!Array.isArray(snapshot.regular) || !Array.isArray(snapshot.flexi)) {
      throw new Error('Attendance snapshot must contain regular and flexi arrays.');
    }

    return {
      schemaVersion: 1,
      semester: snapshot.semester,
      syncedAt: snapshot.syncedAt,
      regular: snapshot.regular.map((subject) => validateSubject(subject, 'Regular')),
      flexi: snapshot.flexi.map((subject) => validateSubject(subject, 'Flexi'))
    };
  }

  const api = { STORAGE_KEY, validateAttendanceSnapshot };
  global.AmizoneAttendanceData = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
