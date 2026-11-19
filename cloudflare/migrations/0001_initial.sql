PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS manager_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'superadmin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT REFERENCES manager_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS manager_users_single_superadmin
  ON manager_users(role)
  WHERE role = 'superadmin';

CREATE TABLE IF NOT EXISTS manager_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES manager_folders(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES manager_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS manager_folders_root_name
  ON manager_folders(name COLLATE NOCASE)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS manager_folders_child_name
  ON manager_folders(parent_id, name COLLATE NOCASE)
  WHERE parent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS manager_files (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder_id TEXT REFERENCES manager_folders(id) ON DELETE RESTRICT,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES manager_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS manager_files_root_name
  ON manager_files(name COLLATE NOCASE)
  WHERE folder_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS manager_files_folder_name
  ON manager_files(folder_id, name COLLATE NOCASE)
  WHERE folder_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS manager_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS manager_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES manager_users(id),
  action TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS manager_audit_log_created_at
  ON manager_audit_log(created_at DESC);
