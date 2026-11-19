const API_PREFIX = '/api/manager';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_ITERATIONS = 100_000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const MAX_SETUP_ATTEMPTS = 5;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const encoder = new TextEncoder();
const DUMMY_SALT = 'ZHVtbXktcGFzc3dvcmQtc2FsdC0xNg';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      if (origin && !isAllowedOrigin(origin, env)) return new Response(null, { status: 403, headers: cors });
      return new Response(null, { status: 204, headers: cors });
    }

    if (origin && !isAllowedOrigin(origin, env)) {
      return jsonResponse({ error: 'This request is not allowed.' }, 403, cors);
    }

    if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) {
      return jsonResponse({ error: 'Not found.' }, 404, cors);
    }

    try {
      return await routeRequest(request, env, url, cors);
    } catch (error) {
      if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, cors);
      console.error('PDF Manager request failed:', error?.message || 'Unknown error');
      return jsonResponse({ error: 'The request could not be completed. Please try again.' }, 500, cors);
    }
  },
};

async function routeRequest(request, env, url, cors) {
  const path = url.pathname.slice(API_PREFIX.length) || '/';
  const method = request.method.toUpperCase();

  if (path === '/setup-status' && method === 'GET') {
    requireDatabase(env);
    const existing = await env.DB.prepare("SELECT id FROM manager_users WHERE role = 'superadmin' LIMIT 1").first();
    return jsonResponse({
      setupRequired: !existing,
      setupAvailable: Boolean(String(env.PDF_MANAGER_BOOTSTRAP_TOKEN || '').length >= 32 && String(env.PDF_MANAGER_SESSION_SECRET || '').length >= 32),
      superadminEmail: existing ? undefined : (env.SUPERADMIN_EMAIL || '').trim().toLowerCase(),
    }, 200, cors);
  }

  if (path === '/bootstrap' && method === 'POST') return bootstrapSuperadmin(request, env, cors);
  if (path === '/login' && method === 'POST') return login(request, env, cors);

  const user = await authenticateRequest(request, env);
  if (path === '/me' && method === 'GET') return jsonResponse({ user: publicUser(user) }, 200, cors);

  if (user.must_change_password && path !== '/change-password') {
    throw new HttpError(403, 'Change your temporary password before continuing.');
  }

  if (path === '/change-password' && method === 'POST') return changePassword(request, env, user, cors);
  if (path === '/folders' && method === 'GET') return listFolders(env, cors);
  if (path === '/folders' && method === 'POST') {
    requireSuperadmin(user);
    return createFolder(request, env, user, cors);
  }

  const folderMatch = path.match(/^\/folders\/([0-9a-f-]+)$/i);
  if (folderMatch && method === 'DELETE') {
    requireSuperadmin(user);
    return deleteFolder(folderMatch[1], env, user, cors);
  }

  if (path === '/files' && method === 'GET') return listFiles(url, env, cors);
  if (path === '/files' && method === 'POST') {
    requireSuperadmin(user);
    return uploadPdf(request, env, user, cors);
  }

  const fileContentMatch = path.match(/^\/files\/([0-9a-f-]+)\/content$/i);
  if (fileContentMatch && method === 'GET') return viewPdf(fileContentMatch[1], env, cors);

  const fileMatch = path.match(/^\/files\/([0-9a-f-]+)$/i);
  if (fileMatch && method === 'DELETE') {
    requireSuperadmin(user);
    return deletePdf(fileMatch[1], env, user, cors);
  }

  if (path === '/admins' && method === 'GET') {
    requireSuperadmin(user);
    return listAdmins(env, cors);
  }
  if (path === '/admins' && method === 'POST') {
    requireSuperadmin(user);
    return createAdmin(request, env, user, cors);
  }

  const adminPasswordMatch = path.match(/^\/admins\/([0-9a-f-]+)\/reset-password$/i);
  if (adminPasswordMatch && method === 'POST') {
    requireSuperadmin(user);
    return resetAdminPassword(adminPasswordMatch[1], env, user, cors);
  }

  const adminMatch = path.match(/^\/admins\/([0-9a-f-]+)$/i);
  if (adminMatch && method === 'DELETE') {
    requireSuperadmin(user);
    return removeAdmin(adminMatch[1], env, user, cors);
  }

  throw new HttpError(404, 'Not found.');
}

function corsHeaders(request, env) {
  const headers = new Headers({
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (origin && isAllowedOrigin(origin, env)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function isAllowedOrigin(origin, env) {
  const normalizedOrigin = origin.replace(/\/$/, '');
  return String(env.CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .includes(normalizedOrigin);
}

function jsonResponse(payload, status, cors, extraHeaders = {}) {
  const headers = new Headers(cors);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(JSON.stringify(payload), { status, headers });
}

function requireDatabase(env) {
  if (!env.DB) throw new HttpError(503, 'The document workspace is not ready yet.');
}

function requireStorage(env) {
  requireDatabase(env);
  if (!env.PDF_BUCKET) throw new HttpError(503, 'The document workspace is not ready yet.');
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 32_000) throw new HttpError(413, 'The request is too large.');
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Enter valid information and try again.');
  }
}

async function bootstrapSuperadmin(request, env, cors) {
  requireDatabase(env);
  if (String(env.PDF_MANAGER_BOOTSTRAP_TOKEN || '').length < 32 || String(env.PDF_MANAGER_SESSION_SECRET || '').length < 32 || !env.SUPERADMIN_EMAIL) {
    throw new HttpError(503, 'Secure setup is not available yet. Contact the site owner.');
  }

  const body = await readJson(request);
  const email = normalizeEmail(body.email || env.SUPERADMIN_EMAIL);
  const configuredEmail = normalizeEmail(env.SUPERADMIN_EMAIL);
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const limited = await rateLimited(env, `bootstrap:${clientIp}`, MAX_SETUP_ATTEMPTS);
  if (limited) throw new HttpError(429, 'Too many setup attempts. Wait a while and try again.');

  if (!constantTimeEqual(String(body.bootstrapToken || ''), env.PDF_MANAGER_BOOTSTRAP_TOKEN)) {
    throw new HttpError(401, 'The setup code is incorrect.');
  }
  if (email !== configuredEmail) throw new HttpError(400, 'Use the Superadmin email configured for this workspace.');
  validatePassword(body.password);

  const existing = await env.DB.prepare("SELECT id FROM manager_users WHERE role = 'superadmin' LIMIT 1").first();
  if (existing) throw new HttpError(409, 'The Manager has already been set up. Sign in instead.');

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const password = await derivePassword(body.password);
  let inserted;
  try {
    inserted = await env.DB.prepare(`
      INSERT INTO manager_users
        (id, email, password_hash, password_salt, role, active, must_change_password, session_version, created_at, updated_at, created_by)
      SELECT ?, ?, ?, ?, 'superadmin', 1, 0, 1, ?, ?, NULL
      WHERE NOT EXISTS (SELECT 1 FROM manager_users WHERE role = 'superadmin')
    `).bind(id, configuredEmail, password.hash, password.salt, now, now).run();
  } catch {
    throw new HttpError(409, 'The Manager has already been set up. Sign in instead.');
  }
  if (!Number(inserted?.meta?.changes || 0)) throw new HttpError(409, 'The Manager has already been set up. Sign in instead.');

  const user = { id, email: configuredEmail, role: 'superadmin', must_change_password: 0, session_version: 1 };
  const token = await issueSession(user, env);
  await clearRateLimit(env, `bootstrap:${clientIp}`);
  await writeAudit(env, id, 'superadmin_bootstrap', id, null);
  return jsonResponse({ token, user: publicUser(user) }, 201, cors);
}

async function login(request, env, cors) {
  requireDatabase(env);
  requireSessionSecret(env);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!isValidEmail(email) || !password || password.length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, 'Enter your email and password.');
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `login:${clientIp}`;
  if (await rateLimited(env, key, MAX_LOGIN_ATTEMPTS)) {
    throw new HttpError(429, 'Too many sign-in attempts. Wait a while and try again.');
  }

  const user = await env.DB.prepare(`
    SELECT id, email, password_hash, password_salt, role, active, must_change_password, session_version
    FROM manager_users WHERE email = ? COLLATE NOCASE LIMIT 1
  `).bind(email).first();
  const candidate = await derivePassword(password, user?.password_salt || DUMMY_SALT);
  const passwordMatches = user ? constantTimeEqual(candidate.hash, user.password_hash) : false;
  if (!user || !Number(user.active) || !passwordMatches) {
    throw new HttpError(401, 'The email or password is incorrect.');
  }

  await clearRateLimit(env, key);
  const token = await issueSession(user, env);
  return jsonResponse({ token, user: publicUser(user) }, 200, cors);
}

async function authenticateRequest(request, env) {
  requireDatabase(env);
  requireSessionSecret(env);
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Sign in to continue.');
  const claims = await verifySession(header.slice(7), env);
  if (!claims) throw new HttpError(401, 'Your session has expired. Sign in again.');

  const user = await env.DB.prepare(`
    SELECT id, email, password_hash, password_salt, role, active, must_change_password, session_version
    FROM manager_users WHERE id = ? LIMIT 1
  `).bind(claims.sub).first();
  if (!user || !Number(user.active) || Number(user.session_version) !== Number(claims.sv)) {
    throw new HttpError(401, 'Your session is no longer active. Sign in again.');
  }
  user.must_change_password = Number(user.must_change_password);
  return user;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    mustChangePassword: Boolean(Number(user.must_change_password)),
  };
}

function requireSuperadmin(user) {
  if (user.role !== 'superadmin') throw new HttpError(403, 'You do not have permission to make this change.');
}

async function listFolders(env, cors) {
  requireDatabase(env);
  const result = await env.DB.prepare(`
    SELECT f.id, f.name, f.parent_id, f.created_at,
      (SELECT COUNT(*) FROM manager_folders child WHERE child.parent_id = f.id) AS child_count,
      (SELECT COUNT(*) FROM manager_files file WHERE file.folder_id = f.id) AS file_count
    FROM manager_folders f
    ORDER BY f.name COLLATE NOCASE
  `).all();
  return jsonResponse({ folders: result.results || [] }, 200, cors);
}

async function createFolder(request, env, user, cors) {
  requireDatabase(env);
  const body = await readJson(request);
  const name = validateName(body.name, 'folder');
  const parentId = body.parentId ? String(body.parentId) : null;
  if (parentId) {
    if (!isUuid(parentId)) throw new HttpError(400, 'Choose a valid parent folder.');
    const parent = await env.DB.prepare('SELECT id FROM manager_folders WHERE id = ?').bind(parentId).first();
    if (!parent) throw new HttpError(404, 'The parent folder could not be found.');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`
      INSERT INTO manager_folders (id, name, parent_id, created_at, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, name, parentId, now, user.id).run();
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw new HttpError(409, 'A folder with that name already exists here.');
    }
    throw error;
  }
  await writeAudit(env, user.id, 'folder_created', id, JSON.stringify({ name, parentId }));
  return jsonResponse({ folder: { id, name, parent_id: parentId, created_at: now, child_count: 0, file_count: 0 } }, 201, cors);
}

async function deleteFolder(id, env, user, cors) {
  requireDatabase(env);
  if (!isUuid(id)) throw new HttpError(400, 'Choose a valid folder.');
  const folder = await env.DB.prepare('SELECT id, name FROM manager_folders WHERE id = ?').bind(id).first();
  if (!folder) throw new HttpError(404, 'The folder could not be found.');
  const counts = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM manager_folders WHERE parent_id = ?) AS child_count,
      (SELECT COUNT(*) FROM manager_files WHERE folder_id = ?) AS file_count
  `).bind(id, id).first();
  if (Number(counts?.child_count || 0) || Number(counts?.file_count || 0)) {
    throw new HttpError(409, 'This folder is not empty. Remove its files and subfolders first.');
  }
  await env.DB.prepare('DELETE FROM manager_folders WHERE id = ?').bind(id).run();
  await writeAudit(env, user.id, 'folder_deleted', id, JSON.stringify({ name: folder.name }));
  return jsonResponse({ success: true }, 200, cors);
}

async function listFiles(url, env, cors) {
  requireDatabase(env);
  const folderId = url.searchParams.get('folderId');
  let result;
  if (!folderId || folderId === 'root') {
    result = await env.DB.prepare(`
      SELECT id, name, folder_id, size_bytes, created_at
      FROM manager_files WHERE folder_id IS NULL
      ORDER BY name COLLATE NOCASE
    `).all();
  } else {
    if (!isUuid(folderId)) throw new HttpError(400, 'Choose a valid folder.');
    const folder = await env.DB.prepare('SELECT id FROM manager_folders WHERE id = ?').bind(folderId).first();
    if (!folder) throw new HttpError(404, 'The folder could not be found.');
    result = await env.DB.prepare(`
      SELECT id, name, folder_id, size_bytes, created_at
      FROM manager_files WHERE folder_id = ?
      ORDER BY name COLLATE NOCASE
    `).bind(folderId).all();
  }
  return jsonResponse({ files: result.results || [] }, 200, cors);
}

async function uploadPdf(request, env, user, cors) {
  requireStorage(env);
  const requestSize = Number(request.headers.get('Content-Length') || 0);
  if (requestSize && requestSize > MAX_PDF_BYTES + 1_000_000) {
    throw new HttpError(413, 'PDFs must be 25 MB or smaller.');
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(400, 'Choose a PDF file and try again.');
  }
  const file = form.get('file');
  if (!file || typeof file.stream !== 'function' || typeof file.name !== 'string') {
    throw new HttpError(400, 'Choose a PDF file and try again.');
  }
  if (file.size < 1 || file.size > MAX_PDF_BYTES) throw new HttpError(413, 'PDFs must be between 1 byte and 25 MB.');
  const name = validatePdfName(file.name);
  const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (new TextDecoder().decode(signature) !== '%PDF-') throw new HttpError(415, 'That file does not appear to be a valid PDF.');

  const folderValue = String(form.get('folderId') || '');
  const folderId = folderValue && folderValue !== 'root' ? folderValue : null;
  if (folderId) {
    if (!isUuid(folderId)) throw new HttpError(400, 'Choose a valid folder.');
    const folder = await env.DB.prepare('SELECT id FROM manager_folders WHERE id = ?').bind(folderId).first();
    if (!folder) throw new HttpError(404, 'The destination folder could not be found.');
  }

  const duplicate = folderId
    ? await env.DB.prepare('SELECT id FROM manager_files WHERE folder_id = ? AND name = ? COLLATE NOCASE LIMIT 1').bind(folderId, name).first()
    : await env.DB.prepare('SELECT id FROM manager_files WHERE folder_id IS NULL AND name = ? COLLATE NOCASE LIMIT 1').bind(name).first();
  if (duplicate) throw new HttpError(409, 'A PDF with that name already exists in this folder.');

  const id = crypto.randomUUID();
  const objectKey = `pdf-manager/${id}.pdf`;
  const now = new Date().toISOString();
  try {
    await env.PDF_BUCKET.put(objectKey, file.stream(), {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { fileId: id, uploadedBy: user.id },
    });
    await env.DB.prepare(`
      INSERT INTO manager_files (id, name, folder_id, object_key, size_bytes, created_at, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, name, folderId, objectKey, file.size, now, user.id).run();
  } catch (error) {
    await env.PDF_BUCKET.delete(objectKey).catch(() => {});
    if (String(error?.message || '').toLowerCase().includes('unique')) {
      throw new HttpError(409, 'A PDF with that name already exists in this folder.');
    }
    throw error;
  }

  await writeAudit(env, user.id, 'pdf_uploaded', id, JSON.stringify({ name, folderId, sizeBytes: file.size }));
  return jsonResponse({ file: { id, name, folder_id: folderId, size_bytes: file.size, created_at: now } }, 201, cors);
}

async function viewPdf(id, env, cors) {
  requireStorage(env);
  if (!isUuid(id)) throw new HttpError(400, 'Choose a valid PDF.');
  const record = await env.DB.prepare('SELECT id, name, object_key, size_bytes FROM manager_files WHERE id = ?').bind(id).first();
  if (!record) throw new HttpError(404, 'The PDF could not be found.');
  const object = await env.PDF_BUCKET.get(record.object_key);
  if (!object) throw new HttpError(404, 'The PDF file is no longer available.');

  const headers = new Headers(cors);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeRfc5987(record.name)}`);
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Length', String(record.size_bytes));
  return new Response(object.body, { status: 200, headers });
}

async function deletePdf(id, env, user, cors) {
  requireStorage(env);
  if (!isUuid(id)) throw new HttpError(400, 'Choose a valid PDF.');
  const record = await env.DB.prepare('SELECT id, name, object_key FROM manager_files WHERE id = ?').bind(id).first();
  if (!record) throw new HttpError(404, 'The PDF could not be found.');
  await env.PDF_BUCKET.delete(record.object_key);
  await env.DB.prepare('DELETE FROM manager_files WHERE id = ?').bind(id).run();
  await writeAudit(env, user.id, 'pdf_deleted', id, JSON.stringify({ name: record.name }));
  return jsonResponse({ success: true }, 200, cors);
}

async function listAdmins(env, cors) {
  requireDatabase(env);
  const result = await env.DB.prepare(`
    SELECT id, email, created_at
    FROM manager_users WHERE role = 'admin' AND active = 1
    ORDER BY email COLLATE NOCASE
  `).all();
  return jsonResponse({ admins: result.results || [] }, 200, cors);
}

async function createAdmin(request, env, actor, cors) {
  requireDatabase(env);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (email === normalizeEmail(env.SUPERADMIN_EMAIL)) throw new HttpError(409, 'That address is reserved for the Superadmin.');

  const temporaryPassword = generateTemporaryPassword();
  const password = await derivePassword(temporaryPassword);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare('SELECT id, role, active FROM manager_users WHERE email = ? COLLATE NOCASE LIMIT 1').bind(email).first();
  let id = existing?.id || crypto.randomUUID();

  if (existing && existing.role !== 'admin') throw new HttpError(409, 'That account already has a different Manager role.');
  if (existing && Number(existing.active)) throw new HttpError(409, 'That Admin account already exists.');

  if (existing) {
    await env.DB.prepare(`
      UPDATE manager_users SET password_hash = ?, password_salt = ?, active = 1,
        must_change_password = 1, session_version = session_version + 1, updated_at = ?, created_by = ?
      WHERE id = ? AND role = 'admin'
    `).bind(password.hash, password.salt, now, actor.id, id).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO manager_users
        (id, email, password_hash, password_salt, role, active, must_change_password, session_version, created_at, updated_at, created_by)
      VALUES (?, ?, ?, ?, 'admin', 1, 1, 1, ?, ?, ?)
    `).bind(id, email, password.hash, password.salt, now, now, actor.id).run();
  }

  await writeAudit(env, actor.id, 'admin_created', id, JSON.stringify({ email }));
  return jsonResponse({ admin: { id, email, created_at: now }, temporaryPassword }, 201, cors);
}

async function resetAdminPassword(id, env, actor, cors) {
  requireDatabase(env);
  if (!isUuid(id)) throw new HttpError(400, 'Choose a valid Admin account.');
  const existing = await env.DB.prepare("SELECT id, email FROM manager_users WHERE id = ? AND role = 'admin' AND active = 1").bind(id).first();
  if (!existing) throw new HttpError(404, 'The Admin account could not be found.');
  const temporaryPassword = generateTemporaryPassword();
  const password = await derivePassword(temporaryPassword);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE manager_users SET password_hash = ?, password_salt = ?, must_change_password = 1,
      session_version = session_version + 1, updated_at = ?
    WHERE id = ? AND role = 'admin' AND active = 1
  `).bind(password.hash, password.salt, now, id).run();
  await writeAudit(env, actor.id, 'admin_password_reset', id, JSON.stringify({ email: existing.email }));
  return jsonResponse({ email: existing.email, temporaryPassword }, 200, cors);
}

async function removeAdmin(id, env, actor, cors) {
  requireDatabase(env);
  if (!isUuid(id)) throw new HttpError(400, 'Choose a valid Admin account.');
  const existing = await env.DB.prepare("SELECT id, email FROM manager_users WHERE id = ? AND role = 'admin' AND active = 1").bind(id).first();
  if (!existing) throw new HttpError(404, 'The Admin account could not be found.');
  await env.DB.prepare(`
    UPDATE manager_users SET active = 0, session_version = session_version + 1, updated_at = ?
    WHERE id = ? AND role = 'admin'
  `).bind(new Date().toISOString(), id).run();
  await writeAudit(env, actor.id, 'admin_removed', id, JSON.stringify({ email: existing.email }));
  return jsonResponse({ success: true }, 200, cors);
}

async function changePassword(request, env, user, cors) {
  requireDatabase(env);
  const body = await readJson(request);
  const currentPassword = String(body.currentPassword || '');
  const newPassword = String(body.newPassword || '');
  validatePassword(newPassword);
  const current = await derivePassword(currentPassword, user.password_salt);
  if (!constantTimeEqual(current.hash, user.password_hash)) throw new HttpError(401, 'The current password is incorrect.');
  if (constantTimeEqual(current.hash, await derivePassword(newPassword, user.password_salt).then((result) => result.hash))) {
    throw new HttpError(400, 'Choose a new password that is different from the current one.');
  }

  const next = await derivePassword(newPassword);
  await env.DB.prepare(`
    UPDATE manager_users SET password_hash = ?, password_salt = ?, must_change_password = 0,
      session_version = session_version + 1, updated_at = ?
    WHERE id = ? AND active = 1
  `).bind(next.hash, next.salt, new Date().toISOString(), user.id).run();
  const updatedUser = await env.DB.prepare(`
    SELECT id, email, role, must_change_password, session_version
    FROM manager_users WHERE id = ? LIMIT 1
  `).bind(user.id).first();
  await writeAudit(env, user.id, 'password_changed', user.id, null);
  const token = await issueSession(updatedUser, env);
  return jsonResponse({ token, user: publicUser(updatedUser) }, 200, cors);
}

async function issueSession(user, env) {
  requireSessionSecret(env);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    sv: Number(user.session_version || 1),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
  };
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(env.PDF_MANAGER_SESSION_SECRET, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifySession(token, env) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || parts.some((part) => !part)) return null;
    const key = await hmacKey(env.PDF_MANAGER_SESSION_SECRET, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlDecode(parts[1]), encoder.encode(parts[0]));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.exp || payload.exp <= now || payload.exp > now + SESSION_TTL_SECONDS + 60) return null;
    return payload;
  } catch {
    return null;
  }
}

async function hmacKey(secret, usages) {
  if (!secret || String(secret).length < 32) throw new HttpError(503, 'Secure sign-in is not configured yet.');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

function requireSessionSecret(env) {
  if (!env.PDF_MANAGER_SESSION_SECRET || String(env.PDF_MANAGER_SESSION_SECRET).length < 32) {
    throw new HttpError(503, 'Secure sign-in is not configured yet.');
  }
}

async function derivePassword(password, saltEncoded = null) {
  const salt = saltEncoded ? base64UrlDecode(saltEncoded) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: PASSWORD_ITERATIONS,
  }, key, 256);
  return { hash: base64UrlEncode(new Uint8Array(bits)), salt: base64UrlEncode(salt) };
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new HttpError(400, `Use a password between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`);
  }
  return password;
}

function generateTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return `${base64UrlEncode(bytes).slice(0, 24)}-A7!`;
}

async function rateLimited(env, rawKey, maxAttempts) {
  requireDatabase(env);
  const rateKey = await sha256Hex(rawKey);
  const windowStart = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
  await env.DB.prepare(`
    INSERT INTO manager_rate_limits (rate_key, window_start, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(rate_key) DO UPDATE SET
      attempts = CASE WHEN manager_rate_limits.window_start = excluded.window_start
        THEN manager_rate_limits.attempts + 1 ELSE 1 END,
      window_start = excluded.window_start
  `).bind(rateKey, windowStart).run();
  const row = await env.DB.prepare('SELECT attempts FROM manager_rate_limits WHERE rate_key = ?').bind(rateKey).first();
  if (Math.random() < 0.05) {
    const staleBefore = Date.now() - 24 * 60 * 60 * 1000;
    await env.DB.prepare('DELETE FROM manager_rate_limits WHERE window_start < ?').bind(staleBefore).run().catch(() => {});
  }
  return Number(row?.attempts || 0) > maxAttempts;
}

async function clearRateLimit(env, rawKey) {
  const rateKey = await sha256Hex(rawKey);
  await env.DB.prepare('DELETE FROM manager_rate_limits WHERE rate_key = ?').bind(rateKey).run();
}

async function sha256Hex(value) {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] || 0) ^ (b[index] || 0);
  return difference === 0;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateName(value, kind) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || /[\\/:*?"<>|\u0000-\u001f]/.test(name) || name === '.' || name === '..') {
    throw new HttpError(400, `Enter a valid ${kind} name (up to 80 characters).`);
  }
  return name;
}

function validatePdfName(value) {
  const name = String(value || '').trim().replace(/[\\/]/g, '_');
  if (!name || name.length > 180 || !name.toLowerCase().endsWith('.pdf') || /[\u0000-\u001f]/.test(name)) {
    throw new HttpError(400, 'PDF filenames must end in .pdf and be no longer than 180 characters.');
  }
  return name;
}

function encodeRfc5987(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
}

async function writeAudit(env, actorId, action, targetId, details) {
  try {
    await env.DB.prepare(`
      INSERT INTO manager_audit_log (id, actor_id, action, target_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(crypto.randomUUID(), actorId, action, targetId, details, new Date().toISOString()).run();
  } catch {
    // Audit failures should not undo an already completed file or account action.
  }
}
