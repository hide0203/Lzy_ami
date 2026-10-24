import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateAttendance, DEFAULT_TARGET, validateAttendanceData } from './attendance.js';
import { createExtensionClient, validateExtensionSnapshot } from './extensionClient.js';
import { loadAttendance, loadTarget, saveAttendance, saveTarget } from './storage.js';

const EMPTY_DATA = { semester: '', syncedAt: '', regular: [], flexi: [] };
const EXTENSION_ID = import.meta.env?.VITE_EXTENSION_ID || '';

function getInitialData() {
  try {
    return { data: loadAttendance() || EMPTY_DATA, error: '' };
  } catch (error) {
    return { data: EMPTY_DATA, error: `Saved data could not be loaded: ${error.message}` };
  }
}

function formatPercentage(value) {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function subjectKey(subject, index) {
  return `${subject.category}-${subject.code || subject.name}-${index}`;
}

function SubjectRow({ subject, target }) {
  const result = subject.valid === false
    ? { status: 'invalid', recommendation: subject.warning || 'Check attendance data', percentage: null }
    : calculateAttendance(subject, target);

  const percentage = result.valid
    ? formatPercentage(result.percentage)
    : 'Unavailable';
  const attendanceCounts = Number.isInteger(subject.attended) && Number.isInteger(subject.total)
    ? `${subject.attended} / ${subject.total} classes`
    : 'Attendance counts unavailable';

  return (
    <li className={`subject subject-${result.status}`}>
      <div className="subject-copy">
        <div className="subject-heading">
          <h2>{subject.name || subject.code || 'Unnamed subject'}</h2>
          {subject.category === 'Flexi' && <span className="flexi-label">Flexi</span>}
        </div>
        <p className="subject-meta">
          {subject.code && <span className="course-code">{subject.code}</span>}
          <span>{attendanceCounts}</span>
          <span>{percentage}</span>
        </p>
      </div>
      <p className="recommendation" aria-label={`Recommendation: ${result.recommendation}`}>
        {result.recommendation}
      </p>
    </li>
  );
}

export default function App() {
  const [initial] = useState(getInitialData);
  const [data, setData] = useState(initial.data);
  const [target, setTarget] = useState(() => {
    try {
      return loadTarget();
    } catch {
      return DEFAULT_TARGET;
    }
  });
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState(initial.error);
  const [extensionStatus, setExtensionStatus] = useState('connecting');
  const [connectionMessage, setConnectionMessage] = useState('');
  const fileInput = useRef(null);
  const lastLoadedSyncRef = useRef(data.syncedAt || '');

  useEffect(() => {
    let cancelled = false;
    let client = null;
    let refreshTimer;
    let refreshInProgress = false;

    if (!EXTENSION_ID) {
      setExtensionStatus('missing');
      setConnectionMessage('Extension not detected. Set VITE_EXTENSION_ID to connect, or import JSON.');
      return undefined;
    }

    let extensionResponded = false;

    async function refreshAttendance() {
      if (cancelled || refreshInProgress) return;
      refreshInProgress = true;
      try {
        if (!client) {
          client = createExtensionClient(EXTENSION_ID, {
            onUpdate: () => refreshAttendance()
          });
        }
        const status = await client.request('get_status');
        if (!status || status.type !== 'status' || typeof status.available !== 'boolean') {
          throw new Error('The extension returned an invalid status response.');
        }
        if (cancelled) return;

        extensionResponded = true;
        setExtensionStatus('connected');
        setConnectionMessage('');
        if (!status.available) return;
        if (typeof status.syncedAt !== 'string' || !Number.isFinite(Date.parse(status.syncedAt))) {
          throw new Error('The extension returned an invalid sync timestamp.');
        }
        if (status.syncedAt === lastLoadedSyncRef.current) return;

        const response = await client.request('get_attendance');
        if (!response || response.type !== 'attendance' || !response.data) {
          throw new Error('The extension has no saved attendance data yet.');
        }

        const latestData = validateExtensionSnapshot(response.data);
        if (cancelled) return;
        saveAttendance(latestData);
        lastLoadedSyncRef.current = latestData.syncedAt;
        setData(latestData);
        setNotice('');
      } catch (error) {
        if (cancelled) return;
        if (client) client.disconnect();
        client = null;
        setExtensionStatus(extensionResponded ? 'error' : 'missing');
        setConnectionMessage(`${error.message} You can import JSON instead.`);
      } finally {
        refreshInProgress = false;
      }
    }

    refreshAttendance();
    refreshTimer = window.setInterval(() => refreshAttendance(), 5000);
    window.addEventListener('focus', refreshAttendance);
    document.addEventListener('visibilitychange', refreshAttendance);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener('focus', refreshAttendance);
      document.removeEventListener('visibilitychange', refreshAttendance);
      if (client) client.disconnect();
    };
  }, []);

  useEffect(() => {
    try {
      saveAttendance(data);
    } catch (error) {
      setNotice(`Could not save attendance locally: ${error.message}`);
    }
  }, [data]);

  const subjects = useMemo(
    () => [...data.regular, ...data.flexi].map((subject, index) => ({
      ...subject,
      category: subject.category || (index < data.regular.length ? 'Regular' : 'Flexi'),
      key: subjectKey(subject, index)
    })),
    [data]
  );

  const evaluated = useMemo(() => subjects.map((subject) => ({
    subject,
    result: subject.valid === false
      ? { valid: false, status: 'invalid' }
      : calculateAttendance(subject, target)
  })), [subjects, target]);

  const attentionCount = evaluated.filter(({ result }) =>
    result.status === 'below-target' || result.status === 'invalid'
  ).length;
  const visibleSubjects = filter === 'attention'
    ? evaluated.filter(({ result }) => result.status === 'below-target' || result.status === 'invalid')
    : evaluated;

  function updateTarget(event) {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value < 1 || value > 100) return;
    setTarget(value);
    try {
      saveTarget(value);
    } catch (error) {
      setNotice(`Could not save the target: ${error.message}`);
    }
  }

  async function importFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const imported = validateAttendanceData(parsed);
      setData(imported);
      setFilter('all');
      setNotice(`Imported ${imported.regular.length + imported.flexi.length} subjects.`);
    } catch (error) {
      setNotice(`Import failed: ${error.message}`);
    }
  }

  function exportFile() {
    const contents = JSON.stringify({
      schemaVersion: 1,
      semester: data.semester,
      syncedAt: data.syncedAt,
      regular: data.regular,
      flexi: data.flexi
    }, null, 2);
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'amizone-attendance.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  const lastSynced = data.syncedAt
    ? `Last synced ${new Date(data.syncedAt).toLocaleString()}`
    : '';
  const isStale = data.syncedAt
    && Number.isFinite(Date.parse(data.syncedAt))
    && Date.now() - Date.parse(data.syncedAt) > 24 * 60 * 60 * 1000;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>Amizone Attendance</h1>
          <p>Target: {target}%{data.semester ? ` · ${data.semester}` : ''}</p>
        </div>
        <div className="header-actions">
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={importFile}
            aria-label="Import attendance JSON"
          />
          {extensionStatus !== 'connected' && (
            <button className="button button-primary" onClick={() => fileInput.current?.click()}>
              Import JSON
            </button>
          )}
          <details className="settings">
            <summary aria-label="Settings">Settings</summary>
            <div className="settings-panel">
              <label htmlFor="target">Attendance target</label>
              <div className="target-control">
                <input
                  id="target"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={target}
                  onChange={updateTarget}
                />
                <span>%</span>
              </div>
              <button className="button button-quiet" onClick={exportFile} disabled={!subjects.length}>
                Export JSON
              </button>
            </div>
          </details>
        </div>
      </header>

      <p className={`connection-status connection-${extensionStatus}`} role="status">
        <span className="connection-dot" aria-hidden="true" />
        {extensionStatus === 'connected'
          ? 'Extension connected'
          : extensionStatus === 'connecting'
            ? 'Connecting to extension…'
            : extensionStatus === 'error'
              ? `Extension data unavailable. ${connectionMessage}`
              : connectionMessage || 'Extension not detected. Import JSON instead.'}
      </p>
      {notice && <p className="notice" role="status">{notice}</p>}
      {lastSynced && (
        <p className={`sync-time${isStale ? ' sync-stale' : ''}`}>
          {lastSynced}{isStale ? ' · Data may be out of date' : ''}
        </p>
      )}

      <section className="subject-section" aria-label="Attendance subjects">
        <div className="list-toolbar">
          <p className="summary" aria-live="polite">
            {subjects.length === 0
              ? 'No attendance data yet'
              : attentionCount > 0
              ? `${attentionCount} ${attentionCount === 1 ? 'subject needs' : 'subjects need'} attention`
              : 'All subjects are on track'}
          </p>
          <div className="filters" role="group" aria-label="Filter subjects">
            <button
              className={filter === 'all' ? 'filter active' : 'filter'}
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              className={filter === 'attention' ? 'filter active' : 'filter'}
              aria-pressed={filter === 'attention'}
              onClick={() => setFilter('attention')}
            >
              Need attention
            </button>
          </div>
        </div>

        {visibleSubjects.length > 0 ? (
          <ul className="subject-list">
            {visibleSubjects.map(({ subject }) => (
              <SubjectRow key={subject.key} subject={subject} target={target} />
            ))}
          </ul>
        ) : subjects.length > 0 ? (
          <p className="empty-filter">No subjects need attention.</p>
        ) : (
          <section className="empty-state">
            <h2>Your attendance will appear here</h2>
            <p>Import the JSON file exported from the Amizone extension to get started.</p>
          </section>
        )}
      </section>
    </main>
  );
}
