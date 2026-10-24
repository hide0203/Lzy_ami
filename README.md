# Amizone Attendance Tracker

This workspace contains the Amizone attendance Chrome extension and a separate local React/Vite dashboard.

## Included files

- `extension/manifest.json`
- `extension/parser.js`
- `extension/data.js`
- `extension/background.js`
- `extension/external-api.js`
- `extension/content.js`
- `extension/popup.html`
- `extension/popup.css`
- `extension/popup.js`
- `extension/tests/parser.test.js`
- `extension/tests/data.test.js`
- `extension/tests/external-api.test.js`

## How to load the extension in Chrome

1. Open Google Chrome.
2. Visit `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder: `Lazy_ami/extension`.
6. Open your Amizone session and navigate to `My Courses`.
7. Click the extension button and choose `Sync Attendance`.

## Notes

- The extension is intentionally strict: it does not try to automate login or Cloudflare checks.
- It expects the user to be already logged in and on the My Courses page with a selected semester.
- If your actual DOM differs from the assumptions in the parser, share a sanitized HTML snippet from the relevant table so the extraction logic can be adjusted.

## Test command

```bash
cd Lazy_ami/extension
npm test
```

## Dashboard

The separate React/Vite dashboard reads the latest successful attendance sync directly from the extension over Chrome external messaging. Data stays in `chrome.storage.local` and browser `localStorage`; it is not sent to a server. JSON import remains available if the extension is not detected.

### Local Chrome setup

1. Open `chrome://extensions`, enable **Developer mode**, and load the `Lazy_ami/extension` folder, or reload it if already installed.
2. Copy the extension ID shown on the extension card.
3. In `Lazy_ami/dashboard`, copy `.env.example` to `.env.local` and replace the value with the copied ID:
   `VITE_EXTENSION_ID=your_32_character_extension_id`
4. If Vite is already running, stop it and start it again after creating or changing `.env.local`. Vite embeds `VITE_*` values when it starts.
5. From the dashboard folder run `npm install` once, then `npm run dev`.
6. Open `http://127.0.0.1:5173` or `http://localhost:5173`.
7. The dashboard should show **Extension connected**. Log in to Amizone, complete Cloudflare verification yourself, open My Courses, and click **Sync Attendance** in the extension.
8. The extension stores each complete sync and notifies an open dashboard. If a notification is missed or the service worker restarts, the dashboard reconnects and checks for a newer sync every five seconds. If the dashboard is closed, it loads the latest stored sync next time it opens.

If it still reports that the extension is not detected, verify the ID in `.env.local` matches the ID on `chrome://extensions`, reload the unpacked extension after manifest changes, restart Vite, then reload the dashboard tab.

The extension allows external messaging only from `http://localhost:5173` and `http://127.0.0.1:5173`. No GitHub Pages origin is configured yet. After deployment, add the exact HTTPS origin to both `extension/manifest.json` and `extension/external-api.js`, then reload the unpacked extension; do not use a wildcard.

If the extension is unavailable, the dashboard shows **Extension not detected** and offers JSON import as a fallback. A sync older than 24 hours is marked as potentially out of date.

Build the dashboard locally with `npm run build` from the dashboard folder. No deployment is configured.
