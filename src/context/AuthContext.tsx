/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  updateEmail,
  updatePassword,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth, firebaseConfigError, firebaseEnabled } from '../lib/firebase';
import { db } from '../lib/firebase';
import { changeUsername, claimUsername, loadUserProfile, updateProfileFields } from '../lib/userProfiles';
import { isValidAvatar } from '../lib/avatars';

export interface User {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
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
  updateEmailAddress: (email: string) => Promise<string | null>;
  updateUsername: (username: string) => Promise<string | null>;
  updateAvatar: (avatar: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
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
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email ?? '',
          username: null,
          avatar: null,
        });
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
            avatar: profile?.avatar ?? null,
          });
        })
        .catch((error) => {
          console.error('Failed to load user profile.', error);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            username: null,
            avatar: null,
          });
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

  const updateEmailAddress = useCallback(async (email: string) => {
    if (!auth?.currentUser || !db) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    const trimmed = email.trim();
    if (!trimmed) {
      return 'Email is required.';
    }

    try {
      await updateEmail(auth.currentUser, trimmed);
      await updateProfileFields(db, {
        userId: auth.currentUser.uid,
        email: trimmed,
      });
      setUser((current) => (current ? { ...current, email: trimmed } : current));
      return null;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('auth/requires-recent-login')) {
        return 'Please sign in again, then retry changing your email.';
      }
      return err instanceof Error ? err.message : 'Failed to update email.';
    }
  }, []);

  const updateUsernameValue = useCallback(async (username: string) => {
    if (!auth?.currentUser || !db) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      const claimed = await changeUsername(db, {
        userId: auth.currentUser.uid,
        email: auth.currentUser.email ?? undefined,
        username,
      });
      setUser((current) => (current ? { ...current, username: claimed } : current));
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to update username.';
    }
  }, []);

  const updateAvatarValue = useCallback(async (avatar: string) => {
    if (!auth?.currentUser || !db) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    if (!isValidAvatar(avatar)) {
      return 'Invalid avatar selection.';
    }

    try {
      await updateProfileFields(db, {
        userId: auth.currentUser.uid,
        avatar,
      });
      setUser((current) => (current ? { ...current, avatar } : current));
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to update avatar.';
    }
  }, []);

  const updatePasswordValue = useCallback(async (password: string) => {
    if (!auth?.currentUser) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }

    try {
      await updatePassword(auth.currentUser, password);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('auth/requires-recent-login')) {
        return 'Please sign in again, then retry changing your password.';
      }
      return err instanceof Error ? err.message : 'Failed to update password.';
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
        updateEmailAddress,
        updateUsername: updateUsernameValue,
        updateAvatar: updateAvatarValue,
        updatePassword: updatePasswordValue,
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
