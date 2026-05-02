/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import {
  EmailAuthProvider,
  type AuthProvider,
  type OAuthCredential,
  GithubAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  linkWithCredential,
  onAuthStateChanged,
  reauthenticateWithCredential,
  updateEmail,
  updatePassword,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { auth, firebaseConfigError, firebaseEnabled } from '../lib/firebase';
import { db } from '../lib/firebase';
import { changeUsername, claimUsername, loadUserProfile, updateProfileFields } from '../lib/userProfiles';
import { isValidAvatar } from '../lib/avatars';

export interface User {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  fullName: string | null;
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
  pendingLinkEmail: string | null;
  linkWithPassword: (password: string) => Promise<string | null>;
  cancelPendingLink: () => void;
  completeUsername: (username: string) => Promise<string | null>;
  updateEmailAddress: (email: string) => Promise<string | null>;
  updateUsername: (username: string) => Promise<string | null>;
  updateAvatar: (avatar: string) => Promise<string | null>;
  updateFullName: (fullName: string) => Promise<string | null>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled);
  const [pendingLinkEmail, setPendingLinkEmail] = useState<string | null>(null);
  const pendingCredentialRef = useRef<OAuthCredential | null>(null);

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
          fullName: null,
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
            fullName: profile?.fullName ?? null,
          });
        })
        .catch((error) => {
          console.error('Failed to load user profile.', error);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            username: null,
            avatar: null,
            fullName: null,
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

  const formatAuthError = useCallback((err: unknown, providerLabel?: string): string => {
    const fallback = providerLabel ? `${providerLabel} sign-in failed` : 'Authentication failed';

    if (!(err instanceof Error)) {
      return fallback;
    }

    const code = (err as FirebaseError).code;
    if (!code) {
      return err.message || fallback;
    }

    if (code === 'auth/unauthorized-domain') {
      return 'This domain is not authorized for Firebase Authentication. Add it under Firebase Console -> Authentication -> Settings -> Authorized domains.';
    }

    if (code === 'auth/operation-not-allowed') {
      return providerLabel
        ? `${providerLabel} sign-in is not enabled in Firebase Console.`
        : 'This sign-in method is not enabled in Firebase Console.';
    }

    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in popup was closed before completing authentication.';
    }

    if (code === 'auth/account-exists-with-different-credential') {
      return 'An account already exists with this email. Please sign in with your password to link your accounts.';
    }

    return err.message || fallback;
  }, []);

  const loginWithProvider = useCallback(async (provider: AuthProvider, providerLabel: string): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      await signInWithPopup(auth, provider);
      return null;
    } catch (err: unknown) {
      const code = err instanceof Error ? (err as FirebaseError).code : undefined;
      const shouldFallbackToRedirect = code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request';

      if (shouldFallbackToRedirect) {
        try {
          await signInWithRedirect(auth, provider);
          return null;
        } catch (redirectError: unknown) {
          return formatAuthError(redirectError, providerLabel);
        }
      }

      if (code === 'auth/account-exists-with-different-credential') {
        const firebaseErr = err as FirebaseError;
        const email = firebaseErr.customData?.email as string | undefined;
        const credential =
          provider instanceof GoogleAuthProvider
            ? GoogleAuthProvider.credentialFromError(firebaseErr)
            : provider instanceof GithubAuthProvider
              ? GithubAuthProvider.credentialFromError(firebaseErr)
              : null;
        if (email && credential) {
          pendingCredentialRef.current = credential;
          setPendingLinkEmail(email);
          return null;
        }
      }

      return formatAuthError(err, providerLabel);
    }
  }, [formatAuthError]);

  const loginWithGoogle = useCallback(async (): Promise<string | null> => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return loginWithProvider(provider, 'Google');
  }, [loginWithProvider]);

  const loginWithGithub = useCallback(async (): Promise<string | null> => {
    return loginWithProvider(new GithubAuthProvider(), 'GitHub');
  }, [loginWithProvider]);

  const cancelPendingLink = useCallback(() => {
    pendingCredentialRef.current = null;
    setPendingLinkEmail(null);
  }, []);

  const linkWithPassword = useCallback(async (password: string): Promise<string | null> => {
    const email = pendingLinkEmail;
    const credential = pendingCredentialRef.current;
    if (!auth || !email || !credential) {
      return 'No pending account link.';
    }
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await linkWithCredential(result.user, credential);
      pendingCredentialRef.current = null;
      setPendingLinkEmail(null);
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to link accounts.';
    }
  }, [pendingLinkEmail]);

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

  const updateFullNameValue = useCallback(async (fullName: string) => {
    if (!auth?.currentUser || !db) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    const trimmed = fullName.trim();
    if (!trimmed) {
      return 'Full name is required.';
    }

    if (trimmed.length > 80) {
      return 'Full name must be 80 characters or fewer.';
    }

    try {
      await updateProfileFields(db, {
        userId: auth.currentUser.uid,
        fullName: trimmed,
      });
      setUser((current) => (current ? { ...current, fullName: trimmed } : current));
      return null;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : 'Failed to update full name.';
    }
  }, []);

  const updatePasswordValue = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!auth?.currentUser) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    if (!auth.currentUser.email) {
      return 'Password changes are only available for email/password accounts.';
    }

    if (!currentPassword) {
      return 'Current password is required.';
    }

    if (newPassword.length < 8) {
      return 'Password must be at least 8 characters.';
    }

    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('auth/wrong-password')) {
        return 'Current password is incorrect.';
      }
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
        pendingLinkEmail,
        linkWithPassword,
        cancelPendingLink,
        completeUsername,
        updateEmailAddress,
        updateUsername: updateUsernameValue,
        updateAvatar: updateAvatarValue,
        updateFullName: updateFullNameValue,
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
