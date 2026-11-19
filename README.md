# Lal Construction MEP PDF Editor

A PDF editing workspace for Lal Construction, built with React, Vite, PDF.js, pdf-lib, and Firebase Authentication. PDFs opened in the editor are edited locally in the browser. A separate, private PDF Manager stores uploaded documents in Cloudflare R2 and folder/access metadata in Cloudflare D1 behind a role-checked Worker API.

## Run locally

```bash
npm install
cp .env.example .env.local
# Fill in the Firebase Web app values in .env.local
npm run dev
```

Vite prints the preview URL when it is ready. Restart Vite after changing environment variables.

## Firebase project setup

The app does not contain a Firebase project ID, admin email, or password. Create or choose a Firebase project and configure it before allowing users to sign in:

1. In Firebase Console, register a **Web app** and copy its SDK configuration.
2. In **Authentication → Sign-in method**, enable **Email/Password**.
3. Create a **Cloud Firestore** database.
4. Copy `.env.example` to `.env.local`, then fill in `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID` from the Web app config. These browser SDK values are public identifiers; do not put a service-account key or admin password in this file.
5. Deploy the included Firestore rules from this repository root. For example, with the Firebase CLI installed:

   ```bash
   firebase login
   firebase use --add
   firebase deploy --only firestore:rules
   ```

   `firebase use --add` associates the local Firebase CLI with your project (it may create a local `.firebaserc`). The rules are in `firestore.rules` and configured by `firebase.json`.
6. Add the app's development and production hostnames to **Authentication → Settings → Authorized domains**. For a hosted build, also add the `VITE_FIREBASE_*` values as deployment environment variables and redeploy.

Authentication uses email/password. The requested name `lal-construction` is a **display name**, not a Firebase username; sign in with the administrator account's email address.

## Bootstrap the first administrator

The first admin must be assigned manually in Firestore. This prevents public signup or client-side code from granting admin access.

1. Open the app and create the account that should administer the workspace using its email address and password. Enter `lal-construction` (or another preferred label) as the display name if desired. Do not put the account password in source code or Firebase config.
2. In Firebase Console → **Authentication → Users**, copy that account's UID.
3. In Firestore, create the document `userProfiles/{UID}` (use the exact UID as the document ID) with these fields:
   - `email` — the account's email address
   - `displayName` — for example, `lal-construction`
   - `role` — `admin`
   - `createdAt` — a Firestore timestamp
   - `updatedAt` — a Firestore timestamp
4. Refresh the app or sign in again. That account will have the **Manage users** option.

New signups receive a `Preview` profile automatically. An administrator can search registered profiles by name/email and assign one of the available roles in the single-screen **Users & access** panel.

## Editor roles and downloads

| Role | Viewing | Editing | Download |
| --- | --- | --- | --- |
| `Preview` | Read-only | No | Original PDF only |
| `Edit` | Yes | Yes | Edited copy |
| `Edit & Preview` | Yes | Yes | Original PDF and edited copy |
| `admin` | Yes | Yes | Original PDF and edited copy, plus user management |

These are editor/Firebase roles. The PDF Manager's separate `admin` and `superadmin` accounts are managed in D1 and do not grant access to the editor's user-management panel.

Changing a role updates the profile listener for signed-in users. The editor hides or disables editing controls for Preview accounts and restores the originally opened PDF if an editable session is changed to Preview.

**Important:** the editor's existing Preview/Edit role checks remain client-side and apply only to PDFs opened in the editor; those PDFs are processed locally. The separate PDF Manager uses server-side authentication and role checks on every Worker request before exposing folder records or streaming a PDF from the private R2 bucket. Whiteout annotations in the editor visually cover content but do not securely erase underlying PDF data.

## Private PDF Manager (Vercel + Cloudflare)

The Manager lives at the unlisted path `/pdf-manager` and is not linked from the normal website. The path is not the security boundary: every Manager API call is authenticated by the Cloudflare Worker and checked against the role stored in D1. The R2 bucket must remain private; PDFs are served through the authenticated Worker only.

The Manager has a separate email/password account system; it does not reuse Firebase sign-in or the editor's roles. Public signup is disabled. Configure the first Superadmin as `lal-construction@gmail.com` in `cloudflare/wrangler.toml`. The first account can be initialized once with the bootstrap secret. Superadmins can add or remove Admin accounts in the Manager; each newly created Admin receives a one-time temporary password and must change it at first sign-in. Share temporary passwords outside the app using a private channel.

### Create Cloudflare resources and deploy the Worker

1. Install dependencies and authenticate Wrangler with your Cloudflare account:

   ```bash
   npm install
   npx wrangler login
   ```

2. Create the R2 bucket and D1 database using the names configured in `cloudflare/wrangler.toml`:

   ```bash
   npx wrangler r2 bucket create lal-construction-pdf-manager
   npx wrangler d1 create lal-construction-pdf-manager
   ```

   Copy the D1 database ID returned by Wrangler into `database_id` in `cloudflare/wrangler.toml` (replace the placeholder). Keep the R2 bucket private; do not enable public access.

3. Apply the D1 schema and configure two Worker secrets. Use separate random values of at least 32 characters for the session secret and one-time bootstrap token. Wrangler will prompt for each secret; do not commit them or put them in the Vite environment file.

   ```bash
   npm run manager:migrate:remote
   npx wrangler secret put PDF_MANAGER_SESSION_SECRET --config cloudflare/wrangler.toml
   npx wrangler secret put PDF_MANAGER_BOOTSTRAP_TOKEN --config cloudflare/wrangler.toml
   npm run manager:deploy
   ```

4. In Vercel, set `VITE_PDF_MANAGER_API_URL` to the deployed Worker URL, for example `https://lal-construction-pdf-manager.<your-workers-subdomain>.workers.dev`, then redeploy the website. The Worker CORS allowlist is set to `https://lal-construction-mep.vercel.app` in `cloudflare/wrangler.toml`; update `CORS_ORIGINS` there if the production site uses another origin.

5. Open `https://lal-construction-mep.vercel.app/pdf-manager`. Use the configured Superadmin email, the one-time bootstrap token, and a new unique password of at least 12 characters to initialize the account. After setup succeeds, remove the bootstrap secret:

   ```bash
   npx wrangler secret delete PDF_MANAGER_BOOTSTRAP_TOKEN --config cloudflare/wrangler.toml
   ```

### Manager permissions and local development

- `admin` accounts can browse folders and view PDFs. They cannot upload, create folders, or delete content.
- `superadmin` can create nested folders, upload PDFs, delete PDFs, delete empty folders, and manage Admin accounts. Delete a folder's contents and subfolders before deleting the folder itself.
- Manager PDFs are limited to 25 MB each. The viewer does not provide a download action, but a website cannot prevent an authorized viewer from copying content they can see.
- The page is not linked from the website and is marked `noindex`; neither measure replaces the server-side checks.

For local testing, copy `cloudflare/.dev.vars.example` to `cloudflare/.dev.vars` and use random local-only values. Vite proxies same-origin `/api/manager` requests to the local Worker, so do not set a localhost API URL in browser configuration. Run the local D1 migration, Worker, and Vite app in separate terminals:

```bash
npm run manager:migrate:local
npm run manager:dev
npm run dev
```

## Build and deploy

```bash
npm run build
npm run preview
```

This is a static Vite app and can be hosted on Vercel or another static host. Configure the Firebase Web app environment variables in the deployment settings and include the deployment hostname in Firebase Authentication's authorized domains. `vercel.json` contains the Vite build/output settings; all PDF parsing, rendering, editing, and page operations remain client-side.

## Editor features

- Sign up and sign in with Firebase email/password authentication.
- Assign Preview, Edit, and Edit & Preview roles from the admin panel.
- Open a PDF from disk or drag and drop it into the editor.
- Scroll through multipage documents with lazy page and thumbnail rendering, page navigation, zoom controls, and fit-to-page.
- Add text boxes and typed signatures; highlight or cover content; create sticky notes; and select, move, resize, or erase annotations.
- Draw with separate Pencil and Pen tools, each with adjustable thickness and color.
- Add rectangles, squares, circles, ovals, lines, arrows, triangles, diamonds, pentagons, hexagons, and stars with adjustable stroke weight and color.
- Format added text with font family, bold, italic, alignment, size, width, and color controls. Adjust highlight opacity and annotation colors.
- Add, duplicate, and remove pages.
- Undo and redo annotation changes; download the original or an edited copy according to the signed-in role.
- Use the mobile tool dock, vertically scrollable properties rail, page details, and swipe-to-pan gestures on the page canvas.
