export const ASSIGNABLE_ROLES = [
  { value: 'edit', label: 'Edit', description: 'Edit PDFs and download edited copies.' },
  { value: 'preview', label: 'Preview', description: 'View PDFs and download the original only.' },
  { value: 'edit-preview', label: 'Edit & Preview', description: 'Edit PDFs and download original or edited copies.' },
];

export const ROLE_LABELS = Object.fromEntries(
  ASSIGNABLE_ROLES.map(({ value, label }) => [value, label]),
);

export function canEdit(role) {
  return role === 'admin' || role === 'edit' || role === 'edit-preview';
}

export function canDownloadOriginal(role) {
  return role === 'admin' || role === 'preview' || role === 'edit-preview';
}

export function canDownloadEdited(role) {
  return canEdit(role);
}
