const API_URL = String(import.meta.env.VITE_PDF_MANAGER_API_URL || '').replace(/\/+$/, '');
const API_BASE = API_URL || '';

export const PDF_MANAGER_API_CONFIGURED = Boolean(API_URL || import.meta.env.DEV);
export const PDF_MANAGER_SESSION_KEY = 'lal-pdf-manager-session';

export async function managerRequest(path, { method = 'GET', token = '', body, responseType = 'json' } = {}) {
  if (!PDF_MANAGER_API_CONFIGURED) {
    const error = new Error('The document workspace is not available yet. Contact your site owner.');
    error.status = 503;
    throw error;
  }

  const headers = new Headers({ Accept: 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let requestBody = body;
  if (body !== undefined && !(body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}/api/manager${path}`, {
    method,
    headers,
    body: requestBody,
    cache: 'no-store',
    credentials: 'omit',
  });

  if (responseType === 'blob' && response.ok) return response.blob();
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'The request could not be completed. Try again.');
    error.status = response.status;
    throw error;
  }
  return payload;
}
