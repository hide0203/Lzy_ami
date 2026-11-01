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

## Run it on a laptop

Use desktop Google Chrome. The extension cannot be installed in Chrome on Android or iPhone; on a phone, use the dashboard's screenshot or JSON import instead.

### 1. Download the project

1. Open the project repository on GitHub: <https://github.com/hide0203/Lzy_ami>.
2. Select **Code** > **Download ZIP**.
3. Extract the ZIP somewhere you will keep it. The extracted project folder contains `extension` and `dashboard` subfolders. Do not select the ZIP itself in Chrome.

You can also use Git if it is installed:

```bash
git clone https://github.com/hide0203/Lzy_ami.git
cd Lzy_ami
```

### 2. Install the extension in Chrome

1. Open desktop Google Chrome and enter `chrome://extensions` in the address bar.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. In the project folder you extracted or cloned, select the **`extension`** folder (the folder containing `manifest.json`).
5. Confirm that **Amizone Attendance Tracker** appears on the extensions page. Copy its ID shown on the extension card; you will need it in the next section.

This is a local, unpacked extension install—not an item from the Chrome Web Store. Keep the project folder in place. If you move it or reinstall the extension and its ID changes, update the dashboard configuration below.

### 3. Connect and start the dashboard

The dashboard runs locally on your laptop. Node.js with npm is required.

1. Open a terminal in the project's `dashboard` folder (the folder containing `package.json`):

   ```bash
   cd path/to/Lzy_ami/dashboard
   ```

2. Install the dashboard dependencies once:

   ```bash
   npm install
   ```

3. Create a file named `.env.local` in the `dashboard` folder. You can copy `.env.example`, then edit the copy. Put your extension ID on this line:

   ```text
   VITE_EXTENSION_ID=paste_the_id_from_chrome_extensions_here
   ```

   Do not include quotes or angle brackets.

4. Start the dashboard:

   ```bash
   npm run dev
   ```

5. Open the local address printed by Vite, normally <http://127.0.0.1:5173>. Keep the terminal running while you use the dashboard.
6. The dashboard should say **Extension connected**. If you just created or changed `.env.local`, stop and restart Vite so it reads the new extension ID.

### 4. Sync attendance

1. In the same Chrome profile where you loaded the extension, sign in to Amizone yourself and complete any verification.
2. Open **My Courses** and select the semester you want.
3. Click the Amizone extension icon next to Chrome's address bar. If it is hidden, open the puzzle-piece **Extensions** menu and pin **Amizone Attendance Tracker**.
4. In the extension popup, click **Sync Attendance**.
5. Return to the local dashboard. It should show the saved attendance and last sync time. If the dashboard was closed during syncing, reopen or refresh it after starting Vite.

The extension does not automate sign-in or verification. Attendance is saved in browser storage and is not sent to a project server.

### Troubleshooting the connection

- **Extension not detected:** Make sure the extension is enabled in `chrome://extensions`, and that `VITE_EXTENSION_ID` exactly matches its ID. Restart Vite and refresh the dashboard.
- **Still not detected:** Confirm you loaded the `extension` folder containing `manifest.json`, and that both the extension and dashboard are running in the same Chrome profile. After changing extension files or the manifest, click **Reload** on its card in `chrome://extensions`.
- **Sync says the page is unsupported:** Open the Amizone **My Courses** page, select a semester, and try again.
- **Dashboard won't start:** Confirm Node.js/npm is installed, run `npm install` from `dashboard`, and check that port 5173 is not already in use.

The extension permits local dashboard messaging only from `http://localhost:5173` and `http://127.0.0.1:5173`, as well as the configured hosted dashboard origin. No local server is exposed to the internet.

## Extension notes and tests

- The extension expects you to be signed in and on the My Courses page with a semester selected; it does not automate login or Cloudflare checks.
- Run the extension tests from its folder:

  ```bash
  cd path/to/Lzy_ami/extension
  npm test
  ```

## Dashboard

The React/Vite dashboard reads the latest successful attendance sync directly from the extension over Chrome external messaging. Data stays in `chrome.storage.local` and browser `localStorage`; it is not sent to a server. JSON and screenshot import are available when the extension is not detected.

### Screenshot import

On a phone or desktop, choose **Screenshot**, select up to five Amizone attendance screenshots, then wait for the browser OCR to finish. OCR runs in a browser worker; screenshots are not uploaded. The OCR worker and English language data download from public CDNs on first use. Recognized rows are added immediately; rows with inconsistent counts or percentages are marked for attention, and unreadable rows are reported. Check flagged results before relying on their recommendations; a blurry or cropped screenshot may omit rows.

External messaging is limited to `http://localhost:5173`, `http://127.0.0.1:5173`, and the production dashboard origin `https://hide0203.github.io`. The manifest match includes the GitHub Pages path, while the service worker independently verifies the exact origin. The dashboard build uses the `VITE_EXTENSION_ID` GitHub Actions repository variable; it must match the extension ID shown on `chrome://extensions`.

After changing the dashboard or its build-time extension ID for GitHub Pages, push the change to `main` (or run the deployment workflow manually) and reload the hosted dashboard after deployment completes.

If the extension is unavailable, the dashboard shows **Extension not detected** and offers JSON import as a fallback. A sync older than 24 hours is marked as potentially out of date.

Run dashboard tests with `npm test` and create a production build with `npm run build`, both from the dashboard folder.
