/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfigError, firebaseEnabled } from '../lib/firebase';
import { db } from '../lib/firebase';
import { claimUsername, loadUserProfile } from '../lib/userProfiles';

export interface User {
  id: string;
  email: string;
  username: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authEnabled: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string, username: string) => Promise<string | null>;
  loginWithGoogle: () => Promise<string | null>;
  loginWithGithub: () => Promise<string | null>;
  completeUsername: (username: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      if (!db) {
        setUser({ id: firebaseUser.uid, email: firebaseUser.email ?? '', username: null });
        setLoading(false);
        return;
      }

      setLoading(true);
      void loadUserProfile(db, firebaseUser.uid)
        .then((profile) => {
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            username: profile?.username ?? null,
          });
        })
        .catch((error) => {
          console.error('Failed to load user profile.', error);
          setUser({ id: firebaseUser.uid, email: firebaseUser.email ?? '', username: null });
        })
        .finally(() => {
          setLoading(false);
        });
    });
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Login failed';
    }
  }, []);

  const register = useCallback(async (email: string, password: string, username: string): Promise<string | null> => {
    if (!auth || !db) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await claimUsername(db, {
          userId: credential.user.uid,
          email: credential.user.email ?? email,
          username,
        });
      } catch (profileError) {
        await deleteUser(credential.user).catch(() => undefined);
        throw profileError;
      }
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Registration failed';
    }
  }, []);

  const loginWithGoogle = useCallback(async (): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Google sign-in failed';
    }
  }, []);

  const loginWithGithub = useCallback(async (): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      await signInWithPopup(auth, new GithubAuthProvider());
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'GitHub sign-in failed';
    }
  }, []);

  const completeUsername = useCallback(async (username: string) => {
    if (!db || !auth?.currentUser) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      const claimed = await claimUsername(db, {
        userId: auth.currentUser.uid,
        email: auth.currentUser.email ?? '',
        username,
      });
      setUser((current) => (current ? { ...current, username: claimed } : current));
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to save username.';
    }
  }, []);

  const logout = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authEnabled: firebaseEnabled,
        authError: firebaseConfigError,
        login,
        register,
        loginWithGoogle,
        loginWithGithub,
        completeUsername,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
