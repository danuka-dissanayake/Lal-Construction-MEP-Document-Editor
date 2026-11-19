import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  KeyRound,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { managerRequest, PDF_MANAGER_API_CONFIGURED, PDF_MANAGER_SESSION_KEY } from './api.js';
import './pdf-manager.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const COMPANY_LOGO = '/assets/lal-construction-logo.jpeg';
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export function PdfManagerApp() {
  const [screen, setScreen] = useState('checking');
  const [setupStatus, setSetupStatus] = useState(null);
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [pageError, setPageError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [folders, setFolders] = useState([]);
  const [folderSearch, setFolderSearch] = useState('');
  const [files, setFiles] = useState([]);
  const [selectedFileIds, setSelectedFileIds] = useState(() => new Set());
  const [bulkDeleteBusy, setBulkDeleteBusy] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState(() => new Set());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [adminsError, setAdminsError] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [issuedPassword, setIssuedPassword] = useState(null);
  const [copyNotice, setCopyNotice] = useState('');
  const uploadInputRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    const previousTitle = document.title;
    let robotsMeta = document.querySelector('meta[name="robots"]');
    const createdRobotsMeta = !robotsMeta;
    if (!robotsMeta) {
      robotsMeta = document.createElement('meta');
      robotsMeta.setAttribute('name', 'robots');
      document.head.appendChild(robotsMeta);
    }
    const previousRobots = robotsMeta.getAttribute('content');
    robotsMeta.setAttribute('content', 'noindex, nofollow, noarchive');
    document.title = 'Private PDF Manager | Lal Construction';
    return () => {
      document.title = previousTitle;
      if (createdRobotsMeta) robotsMeta.remove();
      else if (previousRobots === null) robotsMeta.removeAttribute('content');
      else robotsMeta.setAttribute('content', previousRobots);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      if (!PDF_MANAGER_API_CONFIGURED) {
        setScreen('unavailable');
        return;
      }
      try {
        const status = await managerRequest('/setup-status');
        if (!active) return;
        setSetupStatus(status);
        if (status.setupRequired) {
          setScreen(status.setupAvailable ? 'setup' : 'setup-disabled');
          return;
        }
        const savedToken = window.sessionStorage.getItem(PDF_MANAGER_SESSION_KEY) || '';
        if (!savedToken) {
          setScreen('login');
          return;
        }
        const response = await managerRequest('/me', { token: savedToken });
        if (!active) return;
        setToken(savedToken);
        setUser(response.user);
        setScreen(response.user.mustChangePassword ? 'change-password' : 'workspace');
      } catch (error) {
        if (!active) return;
        window.sessionStorage.removeItem(PDF_MANAGER_SESSION_KEY);
        setPageError(error.message || 'The document workspace is unavailable right now.');
        setScreen('unavailable');
      }
    };
    void initialize();
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const signOut = useCallback((message = '') => {
    window.sessionStorage.removeItem(PDF_MANAGER_SESSION_KEY);
    setToken('');
    setUser(null);
    setFolders([]);
    setFiles([]);
    setSelectedFileIds(new Set());
    setSelectedFolderId(null);
    setPageError(message);
    setScreen('login');
  }, []);

  const protectedRequest = useCallback(async (path, options = {}) => {
    try {
      return await managerRequest(path, { ...options, token });
    } catch (error) {
      // Older deployed Workers report an incorrect temporary password as 401.
      // Keep the Admin on this form so they can correct it; only sign out when
      // the session itself has expired or been revoked.
      const incorrectCurrentPassword = path === '/change-password'
        && error.message === 'The current password is incorrect.';
      if (error.status === 401 && token && !incorrectCurrentPassword) {
        signOut('Your session expired. Sign in again.');
      }
      throw error;
    }
  }, [signOut, token]);

  const acceptSession = useCallback((response) => {
    window.sessionStorage.setItem(PDF_MANAGER_SESSION_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    setPageError('');
    setScreen(response.user.mustChangePassword ? 'change-password' : 'workspace');
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPageError('');
    try {
      const response = await managerRequest('/login', {
        method: 'POST',
        body: { email: form.get('email'), password: form.get('password') },
      });
      acceptSession(response);
    } catch (error) {
      setPageError(error.message || 'Sign-in failed. Check your details and try again.');
    }
  };

  const handleBootstrap = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPageError('');
    try {
      const response = await managerRequest('/bootstrap', {
        method: 'POST',
        body: {
          email: setupStatus?.superadminEmail,
          bootstrapToken: form.get('bootstrapToken'),
          password: form.get('password'),
        },
      });
      acceptSession(response);
    } catch (error) {
      setPageError(error.message || 'Secure setup could not be completed. Try again.');
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPageError('');
    try {
      const response = await protectedRequest('/change-password', {
        method: 'POST',
        body: {
          currentPassword: form.get('currentPassword'),
          newPassword: form.get('newPassword'),
        },
      });
      acceptSession(response);
      showToast('Password updated.');
    } catch (error) {
      setPageError(error.message || 'The password could not be changed. Try again.');
    }
  };

  const loadWorkspace = useCallback(async () => {
    if (screen !== 'workspace' || !token) return;
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const folderQuery = selectedFolderId ? `?folderId=${encodeURIComponent(selectedFolderId)}` : '?folderId=root';
      const [folderResponse, fileResponse] = await Promise.all([
        protectedRequest('/folders'),
        protectedRequest(`/files${folderQuery}`),
      ]);
      setFolders(folderResponse.folders || []);
      setFiles(fileResponse.files || []);
    } catch (error) {
      if (error.status !== 401) setWorkspaceError(error.message || 'Could not load the document library.');
    } finally {
      setWorkspaceLoading(false);
    }
  }, [protectedRequest, screen, selectedFolderId, token]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [selectedFolderId]);

  const folderTree = useMemo(() => buildFolderTree(folders), [folders]);
  const visibleFolderTree = useMemo(() => filterFolderTree(folderTree, folderSearch), [folderTree, folderSearch]);
  const folderSearchActive = Boolean(folderSearch.trim());
  const foldersById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const selectedFolder = selectedFolderId ? foldersById.get(selectedFolderId) : null;
  const breadcrumbs = useMemo(() => getFolderBreadcrumbs(selectedFolderId, foldersById), [selectedFolderId, foldersById]);
  const isSuperadmin = user?.role === 'superadmin';

  const handleCreateFolder = async (event) => {
    event.preventDefault();
    setFolderBusy(true);
    setWorkspaceError('');
    try {
      await protectedRequest('/folders', {
        method: 'POST',
        body: { name: folderName, parentId: selectedFolderId },
      });
      setFolderName('');
      setFolderDialogOpen(false);
      await loadWorkspace();
      showToast('Folder created.');
    } catch (error) {
      setWorkspaceError(error.message || 'The folder could not be created.');
    } finally {
      setFolderBusy(false);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`Delete the empty folder “${folder.name}”?`)) return;
    setWorkspaceError('');
    try {
      await protectedRequest(`/folders/${folder.id}`, { method: 'DELETE' });
      if (selectedFolderId === folder.id) {
        setSelectedFolderId(folder.parent_id || null);
        setFolders((current) => current.filter((item) => item.id !== folder.id));
      } else {
        await loadWorkspace();
      }
      showToast('Folder deleted.');
    } catch (error) {
      setWorkspaceError(error.message || 'The folder could not be deleted.');
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') || file.type && file.type !== 'application/pdf') {
      setWorkspaceError('Choose a PDF file to upload.');
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setWorkspaceError('PDFs must be 25 MB or smaller.');
      return;
    }

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('folderId', selectedFolderId || 'root');
    setUploadBusy(true);
    setWorkspaceError('');
    try {
      await protectedRequest('/files', { method: 'POST', body: form });
      await loadWorkspace();
      showToast('PDF uploaded.');
    } catch (error) {
      setWorkspaceError(error.message || 'The PDF could not be uploaded.');
    } finally {
      setUploadBusy(false);
    }
  };

  const handleToggleFileSelection = (fileId) => {
    setSelectedFileIds((current) => toggleSet(current, fileId));
  };

  const handleToggleAllFileSelection = () => {
    const allSelected = files.length > 0 && files.every((file) => selectedFileIds.has(file.id));
    setSelectedFileIds(allSelected ? new Set() : new Set(files.map((file) => file.id)));
  };

  const handleDeleteFile = async (file) => {
    if (!window.confirm(`Delete “${file.name}” permanently?`)) return;
    setWorkspaceError('');
    try {
      await protectedRequest(`/files/${file.id}`, { method: 'DELETE' });
      setSelectedFileIds((current) => {
        const next = new Set(current);
        next.delete(file.id);
        return next;
      });
      await loadWorkspace();
      showToast('PDF deleted.');
    } catch (error) {
      setWorkspaceError(error.message || 'The PDF could not be deleted.');
    }
  };

  const handleDeleteSelectedFiles = async () => {
    const selectedFiles = files.filter((file) => selectedFileIds.has(file.id));
    if (!selectedFiles.length || bulkDeleteBusy) return;
    const noun = selectedFiles.length === 1 ? 'PDF' : 'PDFs';
    if (!window.confirm(`Permanently delete ${selectedFiles.length} selected ${noun}? This cannot be undone.`)) return;

    setBulkDeleteBusy(true);
    setWorkspaceError('');
    const failedIds = [];
    try {
      for (let offset = 0; offset < selectedFiles.length; offset += 8) {
        const batch = selectedFiles.slice(offset, offset + 8);
        const results = await Promise.allSettled(batch.map((file) => protectedRequest(`/files/${file.id}`, { method: 'DELETE' })));
        results.forEach((result, index) => {
          if (result.status === 'rejected') failedIds.push(batch[index].id);
        });
      }

      setSelectedFileIds(new Set(failedIds));
      await loadWorkspace();
      const deletedCount = selectedFiles.length - failedIds.length;
      if (failedIds.length) {
        setWorkspaceError(`${deletedCount} ${deletedCount === 1 ? 'PDF was' : 'PDFs were'} deleted. ${failedIds.length} could not be deleted; they remain selected so you can try again.`);
      } else {
        showToast(`${deletedCount} ${deletedCount === 1 ? 'PDF' : 'PDFs'} deleted.`);
      }
    } catch (error) {
      setWorkspaceError(error.message || 'The selected PDFs could not be deleted.');
    } finally {
      setBulkDeleteBusy(false);
    }
  };

  const loadAdmins = useCallback(async () => {
    setAdminsLoading(true);
    setAdminsError('');
    try {
      const response = await protectedRequest('/admins');
      setAdmins(response.admins || []);
    } catch (error) {
      if (error.status !== 401) setAdminsError(error.message || 'Could not load Admin accounts.');
    } finally {
      setAdminsLoading(false);
    }
  }, [protectedRequest]);

  useEffect(() => {
    if (adminPanelOpen) void loadAdmins();
  }, [adminPanelOpen, loadAdmins]);

  const handleCreateAdmin = async (event) => {
    event.preventDefault();
    setAdminBusy(true);
    setAdminsError('');
    setIssuedPassword(null);
    try {
      const response = await protectedRequest('/admins', {
        method: 'POST',
        body: { email: newAdminEmail },
      });
      setIssuedPassword({ email: response.admin.email, password: response.temporaryPassword });
      setNewAdminEmail('');
      await loadAdmins();
    } catch (error) {
      setAdminsError(error.message || 'The Admin account could not be created.');
    } finally {
      setAdminBusy(false);
    }
  };

  const handleResetAdminPassword = async (admin) => {
    if (!window.confirm(`Create a new temporary password for ${admin.email}? Their current session will end.`)) return;
    setAdminsError('');
    setIssuedPassword(null);
    try {
      const response = await protectedRequest(`/admins/${admin.id}/reset-password`, { method: 'POST' });
      setIssuedPassword({ email: response.email, password: response.temporaryPassword });
      showToast('Temporary password created.');
    } catch (error) {
      setAdminsError(error.message || 'The password could not be reset.');
    }
  };

  const handleRemoveAdmin = async (admin) => {
    if (!window.confirm(`Remove Manager access for ${admin.email}?`)) return;
    setAdminsError('');
    setIssuedPassword(null);
    try {
      await protectedRequest(`/admins/${admin.id}`, { method: 'DELETE' });
      await loadAdmins();
      showToast('Admin access removed.');
    } catch (error) {
      setAdminsError(error.message || 'The Admin account could not be removed.');
    }
  };

  const folderNameMap = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);

  if (screen === 'checking') return <AuthStateCard message="Checking access…" />;
  if (screen === 'unavailable') return <AuthStateCard message={pageError || 'The document workspace is not available yet. Contact your site owner.'} />;
  if (screen === 'setup-disabled') return <AuthStateCard message="Secure setup is not ready yet. Contact your site owner." />;

  if (screen === 'setup') {
    return (
      <ManagerAuthLayout>
        <form className="manager-auth-card" onSubmit={handleBootstrap}>
          <span className="manager-auth-icon"><KeyRound size={21} /></span>
          <span className="manager-auth-eyebrow">PRIVATE DOCUMENT LIBRARY</span>
          <h1>Set up Superadmin access</h1>
          <p>Create the first private Manager account. This setup can only be completed once.</p>
          <label className="manager-field"><span>SUPERADMIN EMAIL</span><input type="email" value={setupStatus?.superadminEmail || ''} readOnly /></label>
          <label className="manager-field"><span>ONE-TIME SETUP CODE</span><input name="bootstrapToken" type="password" autoComplete="one-time-code" required /></label>
          <label className="manager-field"><span>CREATE PASSWORD</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          {pageError && <ErrorNotice>{pageError}</ErrorNotice>}
          <button className="manager-primary-button" type="submit">Create Superadmin account</button>
          <p className="manager-form-footnote">Use a unique password of at least 12 characters. No public account creation is available.</p>
        </form>
      </ManagerAuthLayout>
    );
  }

  if (screen === 'login') {
    return (
      <ManagerAuthLayout>
        <form className="manager-auth-card" onSubmit={handleLogin}>
          <span className="manager-auth-icon"><ShieldCheck size={21} /></span>
          <span className="manager-auth-eyebrow">PRIVATE DOCUMENT LIBRARY</span>
          <h1>Sign in to your library</h1>
          <p>Use your Manager account to continue.</p>
          <label className="manager-field"><span>EMAIL ADDRESS</span><input name="email" type="email" autoComplete="username" required /></label>
          <label className="manager-field"><span>PASSWORD</span><input name="password" type="password" autoComplete="current-password" required /></label>
          {pageError && <ErrorNotice>{pageError}</ErrorNotice>}
          <button className="manager-primary-button" type="submit">Sign in</button>
          <p className="manager-form-footnote">Manager access is invitation-only. Contact the Superadmin if you need an account.</p>
        </form>
      </ManagerAuthLayout>
    );
  }

  if (screen === 'change-password') {
    return (
      <ManagerAuthLayout>
        <form className="manager-auth-card" onSubmit={handleChangePassword}>
          <span className="manager-auth-icon"><KeyRound size={21} /></span>
          <span className="manager-auth-eyebrow">ACCOUNT SECURITY</span>
          <h1>Choose a new password</h1>
          <p>Your temporary password must be replaced before you can continue.</p>
          <label className="manager-field"><span>TEMPORARY PASSWORD</span><input name="currentPassword" type="password" autoComplete="current-password" required /></label>
          <label className="manager-field"><span>NEW PASSWORD</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>
          {pageError && <ErrorNotice>{pageError}</ErrorNotice>}
          <button className="manager-primary-button" type="submit">Update password</button>
          <button className="manager-text-button" type="button" onClick={() => signOut()}>Sign out</button>
        </form>
      </ManagerAuthLayout>
    );
  }

  const selectedFolderName = selectedFolder?.name || 'All documents';
  const selectedFileCount = files.reduce((count, file) => count + (selectedFileIds.has(file.id) ? 1 : 0), 0);
  const allFilesSelected = files.length > 0 && selectedFileCount === files.length;

  return (
    <div className={`pdf-manager-shell${mobileSidebarOpen ? ' mobile-sidebar-open' : ''}`}>
      <header className="pdf-manager-topbar">
        <button type="button" className="manager-mobile-menu" onClick={() => setMobileSidebarOpen((open) => !open)} aria-label="Toggle folders"><Menu size={20} /></button>
        <img className="pdf-manager-logo" src={COMPANY_LOGO} alt="Lal Construction &amp; Engineering (Pvt) Ltd" />
        <div className="pdf-manager-brand-divider" />
        <div className="pdf-manager-title"><strong>PDF Document Manager</strong><span>PRIVATE LIBRARY</span></div>
        <div className="pdf-manager-topbar-spacer" />
        <div className="pdf-manager-account"><span className="manager-role-pill"><ShieldCheck size={14} />{user?.role === 'superadmin' ? 'Superadmin' : 'Admin'}</span><span className="pdf-manager-account-email">{user?.email}</span></div>
        {isSuperadmin && <button type="button" className="manager-header-button" onClick={() => setAdminPanelOpen(true)}><Users size={16} /><span>Manage Admins</span></button>}
        <button type="button" className="manager-header-icon" onClick={() => signOut()} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
      </header>

      <div className="pdf-manager-layout">
        {mobileSidebarOpen && <button className="manager-sidebar-backdrop" type="button" aria-label="Close folder navigation" onClick={() => setMobileSidebarOpen(false)} />}
        <aside className="pdf-manager-sidebar">
          <div className="manager-sidebar-heading">
            <div><span>Folders</span><small>{folders.length} {folders.length === 1 ? 'folder' : 'folders'} in your library</small></div>
            <span className="manager-sidebar-count" aria-label={`${folders.length} folders`}>{folders.length}</span>
          </div>
          <label className="manager-folder-search">
            <Search size={20} aria-hidden="true" />
            <input type="search" value={folderSearch} onChange={(event) => setFolderSearch(event.target.value)} placeholder="Search folders" aria-label="Search folders" autoComplete="off" />
            {folderSearch && <button type="button" onClick={() => setFolderSearch('')} aria-label="Clear folder search" title="Clear search"><X size={18} /></button>}
          </label>
          <button type="button" className={`manager-root-folder${selectedFolderId ? '' : ' is-selected'}`} onClick={() => { setSelectedFolderId(null); setMobileSidebarOpen(false); }} aria-current={selectedFolderId ? undefined : 'page'}>
            <FolderOpen size={21} /><span>All documents</span>
          </button>
          <nav className="manager-folder-tree" aria-label="Folder structure">
            {visibleFolderTree.length ? visibleFolderTree.map((folder) => (
              <FolderBranch
                key={folder.id}
                folder={folder}
                selectedFolderId={selectedFolderId}
                collapsedFolders={collapsedFolders}
                expandForSearch={folderSearchActive}
                isSuperadmin={isSuperadmin}
                onSelect={(id) => { setSelectedFolderId(id); setMobileSidebarOpen(false); }}
                onToggle={(id) => setCollapsedFolders((current) => toggleSet(current, id))}
                onDelete={handleDeleteFolder}
              />
            )) : !workspaceLoading && <p className="manager-folder-empty">{folderSearchActive ? 'No folders match your search.' : 'Your folders will appear here.'}</p>}
          </nav>
          <div className="manager-sidebar-footer"><ShieldCheck size={17} /><span>Private workspace</span></div>
        </aside>

        <main className="pdf-manager-main">
          <div className="manager-mobile-overlay" />
          <div className="manager-content-heading">
            <div>
              <div className="manager-breadcrumbs">
                <button type="button" onClick={() => setSelectedFolderId(null)}>All documents</button>
                {breadcrumbs.map((folder) => <React.Fragment key={folder.id}><ChevronRight size={13} /><span>{folder.name}</span></React.Fragment>)}
              </div>
              <h1>{selectedFolderName}</h1>
              <p>{files.length} {files.length === 1 ? 'PDF' : 'PDFs'} in this folder</p>
            </div>
            {isSuperadmin && <div className="manager-content-actions">
              <button type="button" className="manager-secondary-button" onClick={() => { setFolderName(''); setFolderDialogOpen(true); }}><FolderPlus size={16} /><span>New folder</span></button>
              <button type="button" className="manager-primary-button manager-upload-button" onClick={() => uploadInputRef.current?.click()} disabled={uploadBusy}>
                {uploadBusy ? <LoaderCircle className="manager-spin" size={16} /> : <Upload size={16} />}<span>{uploadBusy ? 'Uploading…' : 'Upload PDF'}</span>
              </button>
            </div>}
            <input ref={uploadInputRef} className="manager-visually-hidden" type="file" accept="application/pdf,.pdf" onChange={handleUpload} />
          </div>

          {workspaceError && <ErrorNotice>{workspaceError}</ErrorNotice>}

          <section className="manager-files-card">
            <div className="manager-files-header">
              <div><h2>Documents</h2><p>PDFs saved in {selectedFolderName.toLowerCase()}.</p></div>
              <div className="manager-files-header-actions">
                {isSuperadmin && files.length > 0 && <>
                  {selectedFileCount > 0 && <span className="manager-selected-count">{selectedFileCount} selected</span>}
                  <button type="button" className="manager-select-all-button" onClick={handleToggleAllFileSelection} aria-pressed={allFilesSelected} disabled={bulkDeleteBusy}>
                    {allFilesSelected ? 'Clear selection' : 'Select all'}
                  </button>
                  {selectedFileCount > 0 && <button type="button" className="manager-delete-selected" onClick={handleDeleteSelectedFiles} disabled={bulkDeleteBusy}>
                    {bulkDeleteBusy ? <LoaderCircle className="manager-spin" size={17} /> : <Trash2 size={17} />}
                    <span>{bulkDeleteBusy ? 'Deleting…' : `Delete selected (${selectedFileCount})`}</span>
                  </button>}
                </>}
                <span className="manager-file-count">{files.length} {files.length === 1 ? 'file' : 'files'}</span>
              </div>
            </div>
            <div className="manager-file-list">
              {workspaceLoading ? <div className="manager-empty-state"><LoaderCircle className="manager-spin" size={21} /><span>Loading documents…</span></div> : files.length ? files.map((file) => (
                <div className={`manager-file-row${selectedFileIds.has(file.id) ? ' is-selected' : ''}`} key={file.id}>
                  {isSuperadmin && <label className="manager-file-checkbox" title={`Select ${file.name}`}>
                    <input type="checkbox" checked={selectedFileIds.has(file.id)} onChange={() => handleToggleFileSelection(file.id)} disabled={bulkDeleteBusy} aria-label={`Select ${file.name}`} />
                    <span aria-hidden="true" />
                  </label>}
                  <span className="manager-file-icon"><FileText size={19} /></span>
                  <div className="manager-file-details"><strong title={file.name}>{file.name}</strong><span>{formatBytes(file.size_bytes)}<i>·</i>{formatDate(file.created_at)}</span></div>
                  <button type="button" className="manager-open-file" onClick={() => setViewingFile(file)}><Eye size={15} /><span>View</span></button>
                  {isSuperadmin && <button type="button" className="manager-row-icon danger" onClick={() => handleDeleteFile(file)} disabled={bulkDeleteBusy} title="Delete PDF" aria-label={`Delete ${file.name}`}><Trash2 size={16} /></button>}
                </div>
              )) : <div className="manager-empty-state"><span className="manager-empty-icon"><FolderOpen size={22} /></span><strong>No PDFs here yet</strong><span>{isSuperadmin ? 'Upload a PDF to add it to this folder.' : 'PDFs added to this folder will appear here.'}</span></div>}
            </div>
          </section>
          <p className="manager-main-footnote">PDFs are available to authorized Manager accounts only.</p>
        </main>
      </div>

      {folderDialogOpen && <div className="manager-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderDialogOpen(false); }}>
        <form className="manager-dialog" onSubmit={handleCreateFolder}>
          <div className="manager-dialog-header"><span className="manager-dialog-icon"><FolderPlus size={19} /></span><button type="button" className="manager-modal-close" onClick={() => setFolderDialogOpen(false)} aria-label="Close"><X size={18} /></button></div>
          <h2>Create a folder</h2>
          <p>{selectedFolder ? `This folder will be created inside “${selectedFolder.name}”.` : 'This folder will be created at the top level.'}</p>
          <label className="manager-field"><span>FOLDER NAME</span><input autoFocus value={folderName} onChange={(event) => setFolderName(event.target.value)} maxLength={80} placeholder="New folder" required /></label>
          <div className="manager-dialog-actions"><button type="button" className="manager-secondary-button" onClick={() => setFolderDialogOpen(false)}>Cancel</button><button type="submit" className="manager-primary-button" disabled={folderBusy}>{folderBusy ? <LoaderCircle className="manager-spin" size={16} /> : <Plus size={16} />} Create folder</button></div>
        </form>
      </div>}

      {viewingFile && <PdfViewer file={viewingFile} token={token} onClose={() => setViewingFile(null)} />}
      {adminPanelOpen && <AdminManagementPanel
        admins={admins}
        loading={adminsLoading}
        error={adminsError}
        email={newAdminEmail}
        busy={adminBusy}
        issuedPassword={issuedPassword}
        copyNotice={copyNotice}
        onEmailChange={setNewAdminEmail}
        onClose={() => { setAdminPanelOpen(false); setIssuedPassword(null); setAdminsError(''); }}
        onCreate={handleCreateAdmin}
        onReset={handleResetAdminPassword}
        onRemove={handleRemoveAdmin}
        onCopy={async () => {
          try {
            await navigator.clipboard.writeText(issuedPassword?.password || '');
            setCopyNotice('Copied');
            window.setTimeout(() => setCopyNotice(''), 1800);
          } catch {
            setCopyNotice('Select and copy the password');
          }
        }}
      />}
      {toast && <div className="manager-toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function ManagerAuthLayout({ children }) {
  return (
    <main className="manager-auth-page">
      <header className="manager-auth-brand"><img src={COMPANY_LOGO} alt="Lal Construction &amp; Engineering (Pvt) Ltd" /></header>
      {children}
    </main>
  );
}

function AuthStateCard({ message }) {
  return (
    <main className="manager-auth-page">
      <header className="manager-auth-brand"><img src={COMPANY_LOGO} alt="Lal Construction &amp; Engineering (Pvt) Ltd" /></header>
      <section className="manager-auth-card manager-status-card"><span className="manager-auth-icon"><AlertCircle size={21} /></span><p>{message}</p></section>
    </main>
  );
}

function ErrorNotice({ children }) {
  return <div className="manager-error-notice" role="alert"><AlertCircle size={16} /><span>{children}</span></div>;
}

function FolderBranch({ folder, selectedFolderId, collapsedFolders, expandForSearch, isSuperadmin, onSelect, onToggle, onDelete }) {
  const isCollapsed = collapsedFolders.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const expanded = hasChildren && (!isCollapsed || expandForSearch);
  const selected = selectedFolderId === folder.id;
  const empty = Number(folder.child_count) === 0 && Number(folder.file_count) === 0;
  return (
    <div className="manager-folder-branch">
      <div className={`manager-folder-row${selected ? ' is-selected' : ''}`}>
        {hasChildren ? (
          <button type="button" className="manager-folder-expander" onClick={() => onToggle(folder.id)} aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`} aria-expanded={expanded}>
            {expanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </button>
        ) : <span className="manager-folder-expander-spacer" />}
        <button type="button" className="manager-folder-select" onClick={() => onSelect(folder.id)} title={folder.name} aria-current={selected ? 'page' : undefined}>
          {expanded ? <FolderOpen size={20} /> : <Folder size={20} />}<span>{folder.name}</span>
        </button>
        {isSuperadmin && <button type="button" className="manager-folder-delete" disabled={!empty} title={empty ? `Delete ${folder.name}` : 'Delete files and subfolders first'} aria-label={`Delete ${folder.name}`} onClick={() => onDelete(folder)}><Trash2 size={16} /></button>}
      </div>
      {expanded && <div className="manager-folder-children">{folder.children.map((child) => <FolderBranch key={child.id} folder={child} selectedFolderId={selectedFolderId} collapsedFolders={collapsedFolders} expandForSearch={expandForSearch} isSuperadmin={isSuperadmin} onSelect={onSelect} onToggle={onToggle} onDelete={onDelete} />)}</div>}
    </div>
  );
}

function AdminManagementPanel({ admins, loading, error, email, busy, issuedPassword, copyNotice, onEmailChange, onClose, onCreate, onReset, onRemove, onCopy }) {
  return (
    <div className="manager-modal-backdrop manager-admin-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="manager-admin-panel" role="dialog" aria-modal="true" aria-labelledby="manager-admin-title">
        <header className="manager-admin-panel-header"><div><span className="manager-dialog-icon"><Users size={19} /></span><div><h2 id="manager-admin-title">Manage Admin access</h2><p>Admins can browse folders and view PDFs.</p></div></div><button type="button" className="manager-modal-close" onClick={onClose} aria-label="Close"><X size={19} /></button></header>
        {error && <ErrorNotice>{error}</ErrorNotice>}
        {issuedPassword && <div className="manager-issued-password"><div><strong>Temporary password for {issuedPassword.email}</strong><p>Share it privately. The Admin must choose a new password at first sign-in.</p><code>{issuedPassword.password}</code></div><button type="button" className="manager-secondary-button" onClick={onCopy}><Copy size={15} />{copyNotice || 'Copy'}</button></div>}
        <form className="manager-admin-create" onSubmit={onCreate}><label className="manager-field"><span>ADD AN ADMIN BY EMAIL</span><input type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="name@example.com" required /></label><button type="submit" className="manager-primary-button" disabled={busy}>{busy ? <LoaderCircle className="manager-spin" size={16} /> : <Plus size={16} />} Add Admin</button></form>
        <div className="manager-admin-list-heading"><strong>Current Admins</strong><span>{admins.length}</span></div>
        <div className="manager-admin-list">
          {loading ? <div className="manager-empty-state"><LoaderCircle className="manager-spin" size={20} /><span>Loading accounts…</span></div> : admins.length ? admins.map((admin) => <div className="manager-admin-row" key={admin.id}><div className="manager-admin-avatar">{admin.email.slice(0, 1).toUpperCase()}</div><div className="manager-admin-email"><strong>{admin.email}</strong><span>Admin</span></div><button type="button" className="manager-row-icon" title="Reset temporary password" aria-label={`Reset password for ${admin.email}`} onClick={() => onReset(admin)}><KeyRound size={15} /></button><button type="button" className="manager-row-icon danger" title="Remove access" aria-label={`Remove ${admin.email}`} onClick={() => onRemove(admin)}><Trash2 size={15} /></button></div>) : <div className="manager-empty-state compact"><span>No Admin accounts yet.</span></div>}
        </div>
        <footer className="manager-admin-panel-footer"><ShieldCheck size={15} />Only the Superadmin can add or remove Admin access.</footer>
      </section>
    </div>
  );
}

function PdfViewer({ file, token, onClose }) {
  const canvasRef = useRef(null);
  const [document, setDocument] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');
  const [sizeVersion, setSizeVersion] = useState(0);

  useEffect(() => {
    let active = true;
    let loadingTask;
    let loadedDocument;
    const openPdf = async () => {
      setLoading(true);
      setError('');
      try {
        const blob = await managerRequest(`/files/${file.id}/content`, { token, responseType: 'blob' });
        if (!active) return;
        const blobUrl = URL.createObjectURL(blob);
        loadingTask = pdfjsLib.getDocument({ url: blobUrl });
        loadedDocument = await loadingTask.promise;
        if (!active) {
          await loadedDocument.destroy();
          URL.revokeObjectURL(blobUrl);
          return;
        }
        setDocument({ pdf: loadedDocument, blobUrl });
        setPageCount(loadedDocument.numPages);
        setPageNumber(1);
      } catch (openError) {
        if (active) setError(openError.message || 'This PDF could not be opened.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void openPdf();
    return () => {
      active = false;
      if (loadedDocument) void loadedDocument.destroy();
      else if (loadingTask) void loadingTask.destroy();
    };
  }, [file.id, token]);

  useEffect(() => {
    const node = canvasRef.current?.parentElement;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setSizeVersion((value) => value + 1));
    observer.observe(node);
    return () => observer.disconnect();
  }, [document]);

  useEffect(() => {
    if (!document?.pdf || !canvasRef.current) return undefined;
    let active = true;
    let renderTask;
    const renderPage = async () => {
      setRendering(true);
      try {
        const page = await document.pdf.getPage(pageNumber);
        if (!active) return;
        const canvas = canvasRef.current;
        const wrap = canvas?.parentElement;
        if (!canvas || !wrap) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(260, wrap.clientWidth - 48);
        const scale = Math.max(0.25, Math.min(1.5, availableWidth / baseViewport.width));
        const deviceScale = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * deviceScale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / deviceScale)}px`;
        canvas.style.height = `${Math.floor(viewport.height / deviceScale)}px`;
        const context = canvas.getContext('2d');
        renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
      } catch (renderError) {
        if (active && renderError?.name !== 'RenderingCancelledException') setError('This page could not be displayed.');
      } finally {
        if (active) setRendering(false);
      }
    };
    void renderPage();
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, sizeVersion]);

  useEffect(() => () => {
    if (document?.blobUrl) URL.revokeObjectURL(document.blobUrl);
  }, [document]);

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="manager-modal-backdrop manager-viewer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="manager-viewer" role="dialog" aria-modal="true" aria-label={`PDF viewer: ${file.name}`}>
        <header className="manager-viewer-header"><div className="manager-viewer-file"><span className="manager-file-icon"><FileText size={18} /></span><div><strong title={file.name}>{file.name}</strong><small>PDF document</small></div></div><div className="manager-viewer-controls"><button type="button" className="manager-secondary-button manager-page-control" onClick={() => setPageNumber((page) => Math.max(1, page - 1))} disabled={pageNumber <= 1 || loading}>Previous</button><span>Page {pageNumber} of {pageCount || '—'}</span><button type="button" className="manager-secondary-button manager-page-control" onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))} disabled={pageNumber >= pageCount || loading}>Next</button></div><button type="button" className="manager-modal-close" onClick={onClose} aria-label="Close PDF viewer"><X size={19} /></button></header>
        <div className="manager-viewer-body">
          {loading ? <div className="manager-empty-state"><LoaderCircle className="manager-spin" size={22} /><span>Opening PDF…</span></div> : error ? <div className="manager-empty-state"><AlertCircle size={22} /><span>{error}</span></div> : <div className="manager-viewer-canvas-wrap"><canvas ref={canvasRef} />{rendering && <span className="manager-rendering-indicator"><LoaderCircle className="manager-spin" size={14} />Rendering…</span>}</div>}
        </div>
      </section>
    </div>
  );
}

function buildFolderTree(folders) {
  const nodes = new Map(folders.map((folder) => [folder.id, { ...folder, children: [] }]));
  const roots = [];
  for (const folder of nodes.values()) {
    const parent = folder.parent_id ? nodes.get(folder.parent_id) : null;
    if (parent) parent.children.push(folder);
    else roots.push(folder);
  }
  const sortTree = (branch) => {
    branch.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    branch.forEach((folder) => sortTree(folder.children));
  };
  sortTree(roots);
  return roots;
}

function filterFolderTree(folders, query) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase();
  if (!normalizedQuery) return folders;
  return folders.reduce((matches, folder) => {
    const children = filterFolderTree(folder.children, normalizedQuery);
    if (folder.name.toLocaleLowerCase().includes(normalizedQuery) || children.length) {
      matches.push({ ...folder, children });
    }
    return matches;
  }, []);
}

function getFolderBreadcrumbs(folderId, foldersById) {
  const result = [];
  let current = folderId ? foldersById.get(folderId) : null;
  while (current) {
    result.unshift({ id: current.id, name: current.name });
    current = current.parent_id ? foldersById.get(current.parent_id) : null;
  }
  return result;
}

function toggleSet(current, value) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
