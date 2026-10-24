(function (global) {
  const ALLOWED_ORIGINS = Object.freeze([
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ]);
  const PORT_NAME = 'amizone-dashboard';
  const REQUEST_TYPES = Object.freeze(['get_status', 'get_attendance']);

  function getSenderOrigin(sender) {
    try {
      return sender && sender.url ? new URL(sender.url).origin : '';
    } catch {
      return '';
    }
  }

  function isAllowedDashboard(sender) {
    return ALLOWED_ORIGINS.includes(getSenderOrigin(sender));
  }

  function isValidRequest(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return false;
    const keys = Object.keys(message);
    return keys.length === 2
      && keys.includes('type')
      && keys.includes('requestId')
      && typeof message.requestId === 'string'
      && message.requestId.length > 0
      && REQUEST_TYPES.includes(message.type);
  }

  const api = { ALLOWED_ORIGINS, PORT_NAME, REQUEST_TYPES, getSenderOrigin, isAllowedDashboard, isValidRequest };
  global.AmizoneAttendanceExternalApi = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof self !== 'undefined' ? self : globalThis);
