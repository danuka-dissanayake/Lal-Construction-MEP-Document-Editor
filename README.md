# Lal Construction MEP PDF Editor

A browser-based PDF editor for Lal Construction, built with React, Vite, PDF.js, pdf-lib, and Firebase Authentication. PDFs are opened and edited locally in the browser; no document upload service or backend is used. Firebase stores account/profile and role metadata only.

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

## Roles and downloads

| Role | Viewing | Editing | Download |
| --- | --- | --- | --- |
| `Preview` | Read-only | No | Original PDF only |
| `Edit` | Yes | Yes | Edited copy |
| `Edit & Preview` | Yes | Yes | Original PDF and edited copy |
| `admin` | Yes | Yes | Original PDF and edited copy, plus user management |

Changing a role updates the profile listener for signed-in users. The editor hides or disables editing controls for Preview accounts and restores the originally opened PDF if an editable session is changed to Preview.

**Important:** role checks in this app are client-side interface gating for the current local-PDF workflow. The documents never leave the user's device, so the role system is not a server-side document security boundary. Do not use it as access control for PDFs stored in a server or shared location. Whiteout annotations visually cover content but do not securely erase underlying PDF data.

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
