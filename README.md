# Garage Guide

Garage Guide is a private, local-first vehicle hub for maintenance history, insurance, registration, inspections, emissions records, receipts, and important dates.

## Current foundation

- Mobile-first dashboard designed around the iPhone 17 Pro Max
- Multiple vehicle profiles and a vehicle switcher
- Local IndexedDB storage with no account
- Add vehicles, documents, photos, and maintenance records
- On-device image resizing and metadata stripping before storage
- Deadline dashboard and one-tap insurance-card access
- Structured insurance limits for liability, uninsured/underinsured motorist, medical/PIP, collision, comprehensive, rental, and roadside coverage
- Searchable records and masked sensitive policy details
- JSON records export
- Guarded JSON restore with backup validation, record-count preview, and explicit replacement confirmation
- Letter-size glove-box summary with one privacy-conscious page per vehicle
- User-selected desktop folder mirroring for records and document images, including folders inside Dropbox or iCloud Drive
- Saved helpful websites with automatic public title and description lookup plus manual review
- Installable PWA manifest and app-shell service worker
- Synthetic sample garage for safe exploration

## Run locally

Requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

For a production check:

```bash
npm run lint
npm run build
npm start -- --port 3000
```

## Privacy model

Vehicle information and document images stay in the browser on the current device. On browsers that support directory access, the user can also choose a folder that receives an updated JSON record file and copies of document images after each save. That folder may be inside a desktop Dropbox or iCloud Drive location.

iPhone browsers do not provide continuous arbitrary-folder access. On iPhone, Garage Guide explains that limitation and prompts the user to export backups into Files, iCloud Drive, or Dropbox. Website preview lookup sends only the submitted public URL to the app’s preview endpoint.

## Next development slices

1. Separate image ZIP export/import for restoring document photos
2. Maintenance schedule templates with user-confirmed intervals
3. Receipt OCR with a mandatory review-before-save step
4. VIN lookup with manual entry as the fallback
5. Renewal reminder improvements and overdue-state testing
6. A static GitHub Pages build and deployment workflow

AI receipt reading should be added only after the local workflow is solid. If a hosted AI service is introduced, the app must clearly disclose that selected images leave the device, require an explicit user action, and never place an API key in browser code.
