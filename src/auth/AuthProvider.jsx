import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ASSIGNABLE_ROLES } from './roles.js';
import { auth, db, firebaseConfigured } from './firebase.js';

const AuthContext = createContext(null);
const PROFILE_COLLECTION = 'userProfiles';

function requireFirebase() {
  if (!firebaseConfigured || !auth || !db) {
    throw new Error('Firebase is not configured. Add your Firebase web app settings to .env.local and restart Vite.');
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState(firebaseConfigured ? 'loading' : 'disabled');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    if (!firebaseConfigured || !auth || !db) {
      setStatus('disabled');
      return undefined;
    }

    let active = true;
    let generation = 0;
    let stopProfile = () => {};
    const stopAuth = onAuthStateChanged(auth, (nextUser) => {
      const currentGeneration = ++generation;
      stopProfile();
      stopProfile = () => {};
      setUser(nextUser);
      setProfile(null);
      setProfileError('');

      if (!nextUser) {
        setStatus('signed-out');
        return;
      }

      setStatus('loading-profile');
      const profileRef = doc(db, PROFILE_COLLECTION, nextUser.uid);
      stopProfile = onSnapshot(profileRef, (snapshot) => {
        if (!active || currentGeneration !== generation) return;
        if (!snapshot.exists()) {
          setProfile(null);
          setStatus('missing-profile');
          return;
        }
        setProfile({ id: snapshot.id, ...snapshot.data() });
        setStatus('ready');
      }, (error) => {
        if (!active || currentGeneration !== generation) return;
        setProfileError(error.message || 'Could not load your account role.');
        setStatus('error');
      });
    }, (error) => {
      if (!active) return;
      setProfileError(error.message || 'Could not connect to Firebase Authentication.');
      setStatus('error');
    });

    return () => {
      active = false;
      generation += 1;
      stopAuth();
      stopProfile();
    };
  }, []);

  const login = useCallback(async (email, password) => {
    requireFirebase();
    return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  }, []);

  const signup = useCallback(async ({ displayName, email, password }) => {
    requireFirebase();
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = displayName.trim();
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    if (cleanName) await updateProfile(credential.user, { displayName: cleanName });
    const profileRef = doc(db, PROFILE_COLLECTION, credential.user.uid);
    await setDoc(profileRef, {
      email: cleanEmail,
      displayName: cleanName || cleanEmail.split('@')[0],
      role: 'preview',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return credential;
  }, []);

  const ensurePreviewProfile = useCallback(async () => {
    requireFirebase();
    if (!user) throw new Error('Please sign in again to finish setting up your profile.');
    const email = user.email || '';
    const displayName = user.displayName || email.split('@')[0] || 'PDF editor user';
    await setDoc(doc(db, PROFILE_COLLECTION, user.uid), {
      email,
      displayName,
      role: 'preview',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const updateUserRole = useCallback(async (uid, role) => {
    requireFirebase();
    if (!ASSIGNABLE_ROLES.some((item) => item.value === role)) {
      throw new Error('Choose one of the available user roles.');
    }
    await updateDoc(doc(db, PROFILE_COLLECTION, uid), {
      role,
      updatedAt: serverTimestamp(),
    });
  }, []);

  const logout = useCallback(async () => {
    requireFirebase();
    await signOut(auth);
  }, []);

  const value = useMemo(() => ({
    user,
    profile,
    status,
    profileError,
    login,
    signup,
    ensurePreviewProfile,
    updateUserRole,
    logout,
  }), [user, profile, status, profileError, login, signup, ensurePreviewProfile, updateUserRole, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}

export function getUserProfilesCollection() {
  requireFirebase();
  return collection(db, PROFILE_COLLECTION);
}
