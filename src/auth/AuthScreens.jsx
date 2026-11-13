import React, { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Info,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  LogOut,
  Mail,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth, getUserProfilesCollection } from './AuthProvider.jsx';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from './roles.js';
import './auth.css';

function humanizeAuthError(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-not-found': 'No account exists for that email.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/email-already-in-use': 'An account already uses this email. Try signing in.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'Could not connect right now. Check your internet connection and try again.',
    'auth/invalid-api-key': 'Sign-in is temporarily unavailable. Contact your workspace administrator.',
    'auth/operation-not-allowed': 'Sign-in is temporarily unavailable. Contact your workspace administrator.',
    'permission-denied': 'You do not have permission to make this change. Contact an administrator.',
  };
  return messages[code] || 'Something went wrong. Please try again.';
}

export function AuthLoading({ message = 'Checking your account…' }) {
  return (
    <main className="auth-page">
      <div className="auth-loading-card"><img className="auth-loading-logo" src="/assets/lal-construction-logo.jpeg" alt="Lal Construction &amp; Engineering (Pvt) Ltd" /><LoaderCircle className="auth-spinner" size={22} /><strong>{message}</strong></div>
    </main>
  );
}

export function AuthScreen({ configMissing = false }) {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isSignup = mode === 'signup';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (configMissing) {
      setError('Sign-in is not available yet. Please contact your workspace administrator.');
      return;
    }
    if (isSignup && password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    if (isSignup && password.length < 6) {
      setError('Choose a password with at least 6 characters.');
      return;
    }
    setBusy(true);
    try {
      if (isSignup) await signup({ displayName, email, password });
      else await login(email, password);
    } catch (authError) {
      setError(humanizeAuthError(authError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-backdrop-orb auth-orb-one" />
      <div className="auth-backdrop-orb auth-orb-two" />
      <header className="auth-brand">
        <img className="auth-brand-logo" src="/assets/lal-construction-logo.jpeg" alt="Lal Construction &amp; Engineering (Pvt) Ltd" />
      </header>

      <section className="auth-card">
        <div className="auth-card-heading">
          <span className="auth-heading-icon">{isSignup ? <UserPlus size={20} /> : <ShieldCheck size={20} />}</span>
          <span className="auth-eyebrow">MEP DOCUMENT WORKSPACE</span>
          <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p>{isSignup ? 'Create an account to open your PDF workspace.' : 'Sign in to continue to your PDF workspace.'}</p>
        </div>

        {configMissing && (
          <div className="auth-notice" role="status">
            <Info size={17} />
            <span><strong>Workspace sign-in unavailable</strong><small>Sign-in is not available yet. Please contact your workspace administrator.</small></span>
          </div>
        )}

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignup && (
            <label className="auth-field">
              <span>NAME</span>
              <input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" required />
            </label>
          )}
          <label className="auth-field">
            <span>EMAIL ADDRESS</span>
            <div className="auth-input-wrap"><Mail size={16} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></div>
          </label>
          <label className="auth-field">
            <span>PASSWORD</span>
            <div className="auth-input-wrap"><LockKeyhole size={16} /><input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" required /></div>
          </label>
          {isSignup && (
            <label className="auth-field">
              <span>CONFIRM PASSWORD</span>
              <div className="auth-input-wrap"><LockKeyhole size={16} /><input type="password" autoComplete="new-password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter your password again" required /></div>
            </label>
          )}
          <button className="auth-submit" type="submit" disabled={busy || configMissing}>
            {busy ? <LoaderCircle className="auth-spinner" size={17} /> : isSignup ? <UserPlus size={17} /> : <LogIn size={17} />}
            {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-mode-switch">
          <span>{isSignup ? 'Already have an account?' : 'New to the workspace?'}</span>
          <button type="button" onClick={() => { setMode(isSignup ? 'login' : 'signup'); setError(''); }}>
            {isSignup ? 'Sign in' : 'Create account'}
          </button>
        </div>
        {isSignup && <div className="auth-default-role"><BadgeCheck size={15} /><span>New accounts start in <strong>Preview</strong>. An admin can assign a different role later.</span></div>}
      </section>
    </main>
  );
}

export function ProfileSetupScreen() {
  const { user, profileError, ensurePreviewProfile, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const createPreviewProfile = async () => {
    setBusy(true);
    setError('');
    try {
      await ensurePreviewProfile();
    } catch (setupError) {
      setError(humanizeAuthError(setupError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <header className="auth-brand"><img className="auth-brand-logo" src="/assets/lal-construction-logo.jpeg" alt="Lal Construction &amp; Engineering (Pvt) Ltd" /></header>
      <section className="auth-card auth-status-card">
        <span className="auth-heading-icon"><Users size={20} /></span>
        <span className="auth-eyebrow">ACCOUNT ACCESS</span>
        <h1>Finish setting up your role</h1>
        <p>{user?.email || 'Your account'} is signed in, but does not have a workspace profile yet.</p>
        <div className="auth-notice" role="status"><Info size={17} /><span><strong>Default access is Preview</strong><small>You can start in read-only mode. An admin can change your role from the Users panel.</small></span></div>
        {(error || profileError) && <div className="auth-error" role="alert">{error || profileError}</div>}
        <button className="auth-submit" type="button" onClick={createPreviewProfile} disabled={busy}>
          {busy ? <LoaderCircle className="auth-spinner" size={17} /> : <ShieldCheck size={17} />}
          {busy ? 'Setting up…' : 'Continue as Preview'}
        </button>
        <button className="auth-secondary-action" type="button" onClick={logout}><LogOut size={15} /> Sign out</button>
      </section>
    </main>
  );
}

export function AuthProblemScreen() {
  const { profileError, logout } = useAuth();
  return (
    <main className="auth-page">
      <header className="auth-brand"><img className="auth-brand-logo" src="/assets/lal-construction-logo.jpeg" alt="Lal Construction &amp; Engineering (Pvt) Ltd" /></header>
      <section className="auth-card auth-status-card">
        <span className="auth-heading-icon auth-error-icon"><Info size={20} /></span>
        <span className="auth-eyebrow">ACCOUNT CONNECTION</span>
        <h1>We couldn't load your role</h1>
        <p>{profileError || 'We could not load your account access. Please try again or contact an administrator.'}</p>
        <button className="auth-submit" type="button" onClick={logout}><LogOut size={16} /> Sign out</button>
      </section>
    </main>
  );
}

export function AdminPanel({ profile, onOpenEditor, onSignOut }) {
  const { updateUserRole } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [savingUid, setSavingUid] = useState('');

  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    try {
      unsubscribe = onSnapshot(getUserProfilesCollection(), (snapshot) => {
        if (!alive) return;
        const records = snapshot.docs
          .map((record) => ({ id: record.id, ...record.data() }))
          .sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
        setProfiles(records);
        setLoading(false);
        setError('');
      }, (snapshotError) => {
        if (!alive) return;
        setError('Could not load user accounts. Please try again or contact an administrator.');
        setLoading(false);
      });
    } catch (snapshotError) {
      setError('Could not load user accounts. Please try again or contact an administrator.');
      setLoading(false);
    }
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const visibleProfiles = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((item) => `${item.email || ''} ${item.displayName || ''}`.toLowerCase().includes(needle));
  }, [profiles, search]);

  const handleRoleChange = async (uid, role) => {
    setSavingUid(uid);
    setError('');
    try {
      await updateUserRole(uid, role);
    } catch (roleError) {
      setError(humanizeAuthError(roleError));
    } finally {
      setSavingUid('');
    }
  };

  const roleCounts = profiles.reduce((counts, item) => {
    counts[item.role] = (counts[item.role] || 0) + 1;
    return counts;
  }, {});

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <div className="admin-brand"><img className="admin-brand-logo" src="/assets/lal-construction-logo.jpeg" alt="Lal Construction &amp; Engineering (Pvt) Ltd" /></div>
        <div className="admin-topbar-actions">
          <span className="admin-user-chip"><ShieldCheck size={15} /> {profile.displayName || profile.email}</span>
          <button type="button" className="admin-secondary-button" onClick={onOpenEditor}><ArrowLeft size={15} /> PDF workspace</button>
          <button type="button" className="admin-signout-button" onClick={onSignOut}><LogOut size={15} /><span>Sign out</span></button>
        </div>
      </header>

      <section className="admin-content">
        <div className="admin-page-heading">
          <span className="auth-eyebrow">ADMIN PANEL</span>
          <h1>Users &amp; access</h1>
          <p>Assign a role to each registered email address. New signups begin in Preview.</p>
        </div>

        <div className="admin-stat-row">
          <div className="admin-stat-card"><span className="admin-stat-icon"><Users size={18} /></span><span><small>REGISTERED USERS</small><strong>{profiles.length}</strong></span></div>
          <div className="admin-stat-card"><span className="admin-stat-icon preview-stat"><BadgeCheck size={18} /></span><span><small>PREVIEW ACCESS</small><strong>{roleCounts.preview || 0}</strong></span></div>
          <div className="admin-stat-card"><span className="admin-stat-icon edit-stat"><ShieldCheck size={18} /></span><span><small>EDIT ACCESS</small><strong>{(roleCounts.edit || 0) + (roleCounts['edit-preview'] || 0)}</strong></span></div>
        </div>

        <section className="admin-users-card">
          <div className="admin-users-header">
            <div><h2>User roles</h2><p>Role changes take effect immediately for signed-in users.</p></div>
            <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by email or name" aria-label="Search users" /></label>
          </div>
          {error && <div className="auth-error admin-error" role="alert">{error}</div>}
          <div className="admin-user-table-wrap">
            <table className="admin-user-table">
              <thead><tr><th>USER</th><th>EMAIL</th><th>ROLE</th><th>ACCESS</th></tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="4" className="admin-table-state"><LoaderCircle className="auth-spinner" size={18} /> Loading user accounts…</td></tr>
                ) : visibleProfiles.length ? visibleProfiles.map((item) => (
                  <tr key={item.id}>
                    <td><span className="admin-user-name"><span className="admin-avatar">{(item.displayName || item.email || '?').slice(0, 1).toUpperCase()}</span><strong>{item.displayName || 'PDF user'}</strong></span></td>
                    <td className="admin-user-email">{item.email || 'Email unavailable'}</td>
                    <td>
                      {item.role === 'admin' ? <span className="admin-role-label"><ShieldCheck size={14} /> Administrator</span> : (
                        <select className="admin-role-select" value={ROLE_LABELS[item.role] ? item.role : 'preview'} onChange={(event) => handleRoleChange(item.id, event.target.value)} disabled={savingUid === item.id} aria-label={`Role for ${item.email || item.displayName}`}>
                          {ASSIGNABLE_ROLES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      )}
                    </td>
                    <td>{savingUid === item.id ? <span className="admin-saving"><LoaderCircle className="auth-spinner" size={14} /> Saving</span> : <span className={`admin-role-pill role-${item.role || 'preview'}`}>{item.role === 'admin' ? 'Admin' : ROLE_LABELS[item.role] || 'Preview'}</span>}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="4" className="admin-table-state">No users match that search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="admin-users-note"><Info size={15} /><span>Preview users can view and download the original PDF. Edit users can edit and download edited copies. Edit &amp; Preview users can download either version.</span></div>
        </section>
      </section>
    </main>
  );
}
