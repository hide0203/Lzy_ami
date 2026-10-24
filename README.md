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

The separate React/Vite dashboard reads the latest successful attendance sync directly from the extension over Chrome external messaging. Data stays in `chrome.storage.local` and browser `localStorage`; it is not sent to a server. JSON and screenshot import are available when the extension is not detected.

### Screenshot import

On a phone or desktop, choose **Screenshot**, select up to five Amizone attendance screenshots, then wait for the browser OCR to finish. OCR runs in a browser worker; screenshots are not uploaded. The OCR worker and English language data download from public CDNs on first use. Recognized rows are added immediately; rows with inconsistent counts or percentages are marked for attention, and unreadable rows are reported. Check flagged results before relying on their recommendations; a blurry or cropped screenshot may omit rows.

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

External messaging is limited to `http://localhost:5173`, `http://127.0.0.1:5173`, and the production dashboard origin `https://hide0203.github.io`. The manifest match includes the GitHub Pages path, while the service worker independently verifies the exact origin. The dashboard build uses the `VITE_EXTENSION_ID` GitHub Actions repository variable; it must match the extension ID shown on `chrome://extensions`.

After changing extension messaging configuration, reload the unpacked extension from `chrome://extensions`. After changing the dashboard or its build-time extension ID, push the change to `main` (or run the deployment workflow manually) and reload the GitHub Pages tab after the deployment completes.

If the extension is unavailable, the dashboard shows **Extension not detected** and offers JSON import as a fallback. A sync older than 24 hours is marked as potentially out of date.

Build the dashboard locally with `npm run build` from the dashboard folder.
