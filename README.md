# Asadkhon's Portfolio Studio

A personal portfolio with an owner workspace for keeping the story current. The public site and printable résumé use the same content; editing, previewing, and publishing happen in the browser.

Built with React, TypeScript, Vite, and Express. Portfolio data is saved to disk, so changes survive server restarts.

## Run locally

Requires Node.js **22.12 or newer** and npm.

```sh
npm install
npm run dev
```

Open [the portfolio](http://localhost:5173) or [the studio](http://localhost:5173/studio).

Development binds to this computer only. Without `ADMIN_PASSWORD`, the local studio opens without a password. To require a password locally, copy `.env.example` to `.env` and set a unique password of at least 12 characters. Keep `.env` private.

## Make it yours

1. Open **Your profile** to edit the introduction, biography, contact links, portrait URL, and optional location or availability.
2. Use **Content & sections** to add, edit, rename, remove, hide, or reorder sections and entries. Projects, experience, education, skills, and custom sections support future work, awards, writing, or anything else you want to add.
3. Choose an accent color, light or dark appearance, and typography in **Appearance**.
4. **Save draft** stores your changes privately. Saving is manual. **Preview** shows the current working draft, including unsaved edits, with hidden content omitted.
5. **Publish** saves any pending edits and updates the public portfolio. This publishes content on this running installation; it does not deploy the application to a hosting provider.

**Version history** keeps the 20 most recent published snapshots. Restoring a version replaces your draft; review it and publish again to update the public site. Concurrent edits from another session are rejected when the saved revision has changed, so reload before continuing.

Use **Save résumé** on the portfolio or preview to open the browser's print dialog. Choose **Save as PDF** for a résumé using the visible content. This is a print layout generated from your portfolio, not a download of the original source documents.

## Sources and backups

The **Source library** accepts PDF, DOCX, TXT, PNG, and JPG files up to 10 MB each. Files and their notes are private reference material, available to the signed-in owner. Uploads do **not** automatically parse documents, run AI extraction, or update portfolio text. Review a source and add the relevant details through the editor. Both supplied PDFs have been added to the private library in this workspace. A fresh installation starts with an empty library; repository documents are never served as public downloads.

**Export draft** creates a JSON copy of the entire current draft, including hidden sections and entries. Treat it as a private backup. **Import backup** validates that format and replaces the working draft after confirmation; save and publish separately when ready. JSON exports do not contain source attachments, publication history, or the separately published version. Download source files individually when moving to another installation.

For a complete installation backup, stop the server and securely copy the entire `DATA_DIR`. It contains `portfolio.json` and the `sources/` directory. Keep these together when restoring. The default is `./data`, which is ignored by Git.

## Review the starting content

The starting profile and portrait come from the supplied résumé and Obyektivka. The hidden **Private review notes** section records conflicting teaching and HackAZ dates, missing project detail, and information that needs updating. Unresolved dates, current location, availability, and final GPA are left out of the public defaults. Blog + Weather is hidden until its temporary link is replaced.

Confirm these details before sharing the site. Project links were transcribed from the résumé and have not been independently verified. Family details, birth date, exact addresses, and phone number are excluded. Hidden content is filtered out by the public API; making a hidden section visible and publishing it makes its visible entries public.

`shared/seed.json` initializes a new data directory once. Editing it does not overwrite an existing saved portfolio; use the studio for ongoing changes.

## Production

Deployment has not been performed. This application needs a Node server and persistent storage; uploading only `dist/` to static hosting will not provide the studio or API.

Copy `.env.example` to `.env` and configure:

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD` | A long, unique owner password, at least 12 characters. Required in production. |
| `APP_ORIGIN` | The exact public origin, such as `https://portfolio.example.com`, with no path, query, or fragment. Required in production. |
| `DATA_DIR` | A directory on a persistent disk, preferably an absolute path outside the public files. Defaults to `./data`. |
| `PORT` | The Node server port. Defaults to `5173`. |

```sh
npm install
npm run build
npm start
```

Run **one Node process** against each data directory. Use a persistent disk or volume, restrict access to its contents, and arrange regular backups. File storage and in-memory sessions are designed for this single-owner, single-process setup; serverless ephemeral disks and multiple replicas are unsupported.

Put an HTTPS reverse proxy in front of the Node server, preserve the public `Host` header, and keep the backend port private. Use the matching `https://` value for `APP_ORIGIN` so the authentication cookie is marked secure. Production refuses to start without its required configuration. Sessions expire after 12 hours and are cleared by a server restart. Authentication includes password attempt limiting; the limiter uses the direct connection address, which may be the proxy address.

## Checks

```sh
npm test
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

Browser tests use an isolated temporary data directory and exercise the full editing workflow, mobile navigation, accessibility checks, and unsaved-change protection.

The backend tests cover draft/public separation, hidden content, persistence, revision conflicts, restoration, validation, authentication, request origin restrictions, and private source uploads. `check` runs TypeScript; `build` checks types and creates the production frontend.
