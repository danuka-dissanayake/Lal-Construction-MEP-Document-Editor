import React, { useState } from 'react';
import { AdminPanel, AuthLoading, AuthProblemScreen, AuthScreen, ProfileSetupScreen } from './AuthScreens.jsx';
import { AuthProvider, useAuth } from './AuthProvider.jsx';
import { firebaseConfigured } from './firebase.js';

function AuthenticatedShell({ children }) {
  const { user, profile, status, logout } = useAuth();
  const [screen, setScreen] = useState('workspace');

  if (!firebaseConfigured) return <AuthScreen configMissing />;
  if (status === 'loading' || status === 'loading-profile') return <AuthLoading />;
  if (!user) return <AuthScreen />;
  if (status === 'error') return <AuthProblemScreen />;
  if (status === 'missing-profile' || !profile) return <ProfileSetupScreen />;

  const workspace = children({
    user,
    profile,
    onSignOut: logout,
    onOpenAdminPanel: profile.role === 'admin' ? () => setScreen('admin') : null,
  });

  if (profile.role !== 'admin') return workspace;

  return (
    <>
      <div className={screen === 'admin' ? 'auth-workspace-hidden' : 'auth-workspace-container'}>
        {workspace}
      </div>
      {screen === 'admin' && (
        <AdminPanel profile={profile} onOpenEditor={() => setScreen('workspace')} onSignOut={logout} />
      )}
    </>
  );
}

export function AuthShell({ children }) {
  return (
    <AuthProvider>
      <AuthenticatedShell>{children}</AuthenticatedShell>
    </AuthProvider>
  );
}
