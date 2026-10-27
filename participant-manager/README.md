# Participant Manager AI

Local-first participant directory for international meetings, conferences, training activities and multinational projects.
Import an existing participant list, review and correct it, and export it as Excel, CSV, PDF, phone contacts or a single offline HTML file.

**Everything runs in the browser.** There is no server, no account, no cloud database and no AI service. Documents and participant data never leave the device.

## Using it

- Built app: `participant-manager/app/` (served by GitHub Pages at `…/participant-manager/app/` once this branch is published on `gh-pages`).
- First visit: choose *Explore with demonstration data* (three fictional projects) or *Start with an empty workspace*.
- After the first load the app works offline and can be installed (Add to Home Screen / Install app).

## Features

| Area | What it does |
| --- | --- |
| Projects | Create, edit (location, dates, description, extra fields), duplicate, archive, delete with confirmation. Each project has its own directory. |
| Import | Excel (.xlsx/.xls), CSV, Word (.docx), PDF, text, or pasted rows. Header detection in English, Spanish and French; columns are also recognised by their content (emails, phones, countries). Country heading rows ("SPAIN") are applied to the rows below. Wrapped PDF table cells are re-joined. Scanned PDFs are detected and can be read with local OCR (Tesseract, English/Spanish/French), only when the user starts it. |
| Review | Editable grid before saving; missing or suspicious values highlighted; duplicates inside the file or against the project are unselected by default; optional splitting of full names only for unambiguous patterns ("SURNAME, Name", "SURNAME Name"). Nothing is invented. |
| Directory | Grouped by country (alphabetical in the interface language, flags bundled locally), then by name. Search across all fields, filters by country, organisation and missing contact data, sort direction, collapsible groups, column visibility, density, bulk delete / move / copy / save as contacts, duplicate detection and manual merge. Card layout on phones. |
| Contact | Email (mailto), call (tel), WhatsApp (wa.me with an E.164 number), copy email / phone / full details, **save to phone contacts** (vCard) and **QR code** to pass a contact from the computer to a phone. Nothing is sent automatically. |
| Export | Excel, CSV (UTF‑8, formula-safe), PDF directory, contacts (.vcf), standalone HTML (one file, offline, search + country filter, print stylesheet, optional password). |
| Backup | Full JSON backup (optional password, AES‑256‑GCM), validated restore with *merge* or *replace* (with warning). |
| Settings | English/Spanish, dark/light theme, storage usage and persistence request, privacy notes, demo data, delete all data. |

## Privacy and security

- Strict Content-Security-Policy in the built app: `connect-src 'self'`. The page technically cannot send data to another server.
- OCR engine and language data, PDF decoders and fonts are served by the app itself; nothing is loaded from a CDN.
- Imported strings are cleaned (control and bidi-override characters removed, length limits); files are checked against their extension and limited to 25 MB.
- React renders all text escaped. The standalone HTML embeds data as escaped JSON, builds the page with `textContent`, validates every link and runs under its own CSP (`default-src 'none'`, script allowed only by hash, no network).
- CSV cells that could be read as spreadsheet formulas are neutralised; Excel cells are written as text.
- Backups are validated field by field before anything is written.

**Limitations to be aware of**

- Browser storage (IndexedDB) is **not encrypted**. Anyone using the same device and browser profile can read it.
- Clearing browser data, private browsing or uninstalling the browser deletes the data. Download backups regularly. On iPhone, Safari deletes data of sites not used for 7 days unless the app is added to the Home Screen.
- PDF tables are reconstructed from text positions and OCR can misread characters: those imports are always flagged for review.
- Legacy Word `.doc` files are not supported; save them as `.docx`.
- WhatsApp links need a number in international format; a number without country code is only completed when the participant's country is known.
- The password of an encrypted backup or HTML file cannot be recovered.

## Development

```bash
cd participant-manager
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build into app/
npm test             # unit tests (import rules, countries, phones, duplicates, security)
```

Browser tests use Playwright's Chromium (preinstalled in the cloud environment; otherwise `npm i -D playwright`):

```bash
npm run build
NODE_PATH=$(npm root -g) node e2e/run.mjs        # the 13 acceptance criteria of the brief
npx vitest run && NODE_PATH=$(npm root -g) node e2e/security.mjs   # script-injection checks on exports
npx vite preview --port 4173 &
NODE_PATH=$(npm root -g) node e2e/offline.mjs    # works offline after first load
```

Sample files with fictional data are in `samples/` (`npm run sample` and `python3 scripts/make-docx-sample.py` regenerate them).

### Architecture

- React 18, TypeScript, Tailwind CSS 4, shadcn-style components on Radix UI, Lucide icons.
- `src/lib/db.ts` – IndexedDB through Dexie (projects, participants, meta). Lightweight preferences in `localStorage`.
- `src/lib/import/` – readers (SheetJS, mammoth, pdf.js, Tesseract), column mapping and free-text extraction.
- `src/lib/export/` – spreadsheet, PDF (jsPDF), standalone HTML, backup and encryption (Web Crypto).
- `vite-plugin-pwa` – service worker and manifest; OCR files are cached the first time OCR is used.

### Third-party components

SheetJS Community Edition 0.20.3 (Apache-2.0, via the `@e965/xlsx` npm mirror because the `xlsx` package on npm is outdated), pdf.js (Apache-2.0), Tesseract.js (Apache-2.0), mammoth (BSD-2), jsPDF (MIT), libphonenumber-js (MIT), Dexie (Apache-2.0), flag-icons (MIT), Liberation Sans (SIL OFL), Public Sans and IBM Plex Mono (SIL OFL).
