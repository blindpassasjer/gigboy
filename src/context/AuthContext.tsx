import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfigError, firebaseEnabled } from '../lib/firebase';

export interface User { id: string; email: string }

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  authEnabled: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string) => Promise<string | null>;
  loginWithGoogle: () => Promise<string | null>;
  loginWithGithub: () => Promise<string | null>;
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
      setUser(firebaseUser ? { id: firebaseUser.uid, email: firebaseUser.email ?? '' } : null);
      setLoading(false);
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

  const register = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      await createUserWithEmailAndPassword(auth, email, password);
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
