(function () {
  const parser = window.AmizoneAttendanceParser;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== 'syncAttendance') {
      return;
    }

    try {
      const result = parser && typeof parser.extractAttendanceFromPage === 'function'
        ? parser.extractAttendanceFromPage(document)
        : { supported: false, warnings: ['Parser unavailable.'], message: 'Parser unavailable.' };

      sendResponse(result);
    } catch (error) {
      sendResponse({
        supported: false,
        regular: [],
        flexi: [],
        warnings: [error && error.message ? error.message : 'Unknown extraction error.'],
        message: 'An error occurred while reading the page.'
      });
    }

    return true;
  });
})();
