/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  type AuthProvider,
  type OAuthCredential,
  GithubAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import type { FirebaseError } from 'firebase/app';
import { auth, firebaseConfigError, firebaseEnabled } from '../lib/firebase';

const isSelfHost = import.meta.env.VITE_BACKEND === 'selfhost';
import { db } from '../lib/firebase';
import { claimUsername } from '../lib/userProfiles';
import { dataClient } from '../lib/dataClient';
import type { PlanTier, SubscriptionStatus } from '../types';

export interface User {
  id: string;
  email: string;
  username: string | null;
  avatar: string | null;
  fullName: string | null;
  plan: PlanTier;
  planOverride: boolean;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd: number | null;
  storageQuotaBytes: number;
  bandExtraMembers: number;
  memberLimit: number;
  stripeCustomerId: string | null;
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
  deleteAccount: () => Promise<string | null>;
  isDeletingAccount: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled || isSelfHost);
  const [pendingLinkEmail, setPendingLinkEmail] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const pendingCredentialRef = useRef<OAuthCredential | null>(null);

  const clearPendingLink = useCallback(() => {
    pendingCredentialRef.current = null;
    setPendingLinkEmail(null);
  }, []);

  const getAuthErrorCode = useCallback((err: unknown): string | null => {
    if (!(err instanceof Error)) {
      return null;
    }

    const typedCode = (err as FirebaseError).code;
    if (typeof typedCode === 'string' && typedCode.length > 0) {
      return typedCode;
    }

    const messageMatch = err.message.match(/\(auth\/[a-z0-9-]+\)/i);
    if (messageMatch) {
      return messageMatch[0].slice(1, -1).toLowerCase();
    }

    return null;
  }, []);

  useEffect(() => {
    const unsubscribe = dataClient.auth.onAuthStateChanged((nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const { user: loggedInUser, error } = await dataClient.auth.login(email, password);
    if (error) return error;

    const pendingCredential = pendingCredentialRef.current;
    const pendingEmail = pendingLinkEmail;
    const normalizedPendingEmail = pendingEmail?.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    if (pendingCredential && normalizedPendingEmail === normalizedEmail && auth?.currentUser) {
      try {
        await linkWithCredential(auth.currentUser, pendingCredential);
        clearPendingLink();
      } catch (err: unknown) {
        return err instanceof Error ? err.message : 'Failed to link accounts.';
      }
    }

    if (loggedInUser) {
      setUser(loggedInUser);
    }
    return null;
  }, [clearPendingLink, pendingLinkEmail]);

  const register = useCallback(async (email: string, password: string, username: string): Promise<string | null> => {
    const { user: registeredUser, error } = await dataClient.auth.register(email, password, username);
    if (error) return error;

    // Optimistically set username so the race between onAuthStateChanged and the
    // backend write doesn't briefly show UsernameSetupPage after registration.
    setUser((current) => (current ? { ...current, username } : registeredUser));
    return null;
  }, []);

  const formatAuthError = useCallback((err: unknown, providerLabel?: string): string => {
    const fallback = providerLabel ? `${providerLabel} sign-in failed` : 'Authentication failed';

    if (!(err instanceof Error)) {
      return fallback;
    }

    const code = getAuthErrorCode(err);
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

    if (code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') {
      return 'The sign-in credential is invalid or expired. Please try again.';
    }

    return err.message || fallback;
  }, [getAuthErrorCode]);

  const loginWithProvider = useCallback(async (provider: AuthProvider, providerLabel: string): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      await signInWithPopup(auth, provider);
      return null;
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
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
  }, [formatAuthError, getAuthErrorCode]);

  const loginWithGoogle = useCallback(async (): Promise<string | null> => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    return loginWithProvider(provider, 'Google');
  }, [loginWithProvider]);

  const loginWithGithub = useCallback(async (): Promise<string | null> => {
    return loginWithProvider(new GithubAuthProvider(), 'GitHub');
  }, [loginWithProvider]);

  const cancelPendingLink = useCallback(() => {
    clearPendingLink();
  }, [clearPendingLink]);

  const linkWithPassword = useCallback(async (password: string): Promise<string | null> => {
    const email = pendingLinkEmail;
    if (!auth || !email) {
      return 'No pending account link.';
    }

    let resultUser;
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      resultUser = result.user;
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
        return 'Incorrect password. Please try again.';
      }
      return err instanceof Error ? err.message : 'Failed to sign in.';
    }

    const pendingCredential = pendingCredentialRef.current;
    if (!pendingCredential) {
      return 'Link session expired. Click Cancel, then continue with Google or GitHub again.';
    }

    try {
      await linkWithCredential(resultUser, pendingCredential);
      clearPendingLink();
      return null;
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      if (code === 'auth/provider-already-linked') {
        clearPendingLink();
        return null;
      }
      if (code === 'auth/credential-already-in-use') {
        clearPendingLink();
        return 'This sign-in method is already connected to another account. Please sign in with Google and use the same account email.';
      }
      if (code === 'auth/invalid-credential') {
        clearPendingLink();
        return 'Link session expired. Please continue with Google or GitHub again, then link your password.';
      }
      return err instanceof Error ? err.message : 'Failed to link accounts.';
    }
  }, [clearPendingLink, getAuthErrorCode, pendingLinkEmail]);

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
    const { user: updatedUser, error } = await dataClient.auth.updateEmail(email);
    if (updatedUser) setUser(updatedUser);
    return error;
  }, []);

  const updateUsernameValue = useCallback(async (username: string) => {
    const { user: updatedUser, error } = await dataClient.auth.updateUsername(username);
    if (updatedUser) setUser(updatedUser);
    return error;
  }, []);

  const updateAvatarValue = useCallback(async (avatar: string) => {
    const { user: updatedUser, error } = await dataClient.auth.updateAvatar(avatar);
    if (updatedUser) setUser(updatedUser);
    return error;
  }, []);

  const updateFullNameValue = useCallback(async (fullName: string) => {
    const { user: updatedUser, error } = await dataClient.auth.updateFullName(fullName);
    if (updatedUser) setUser(updatedUser);
    return error;
  }, []);

  const updatePasswordValue = useCallback(async (currentPassword: string, newPassword: string) => {
    const { error } = await dataClient.auth.updatePassword(currentPassword, newPassword);
    return error;
  }, []);

  const deleteAccountValue = useCallback(async (): Promise<string | null> => {
    try {
      setIsDeletingAccount(true);
      const { error } = await dataClient.auth.deleteAccount();
      if (error) {
        setIsDeletingAccount(false);
        return error;
      }
      setUser(null);
      return null;
    } catch (err: unknown) {
      setIsDeletingAccount(false);
      return err instanceof Error ? err.message : 'Failed to delete account.';
    }
  }, []);

  const logout = useCallback(async () => {
    await dataClient.auth.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authEnabled: firebaseEnabled || isSelfHost,
      authError: isSelfHost ? null : firebaseConfigError,
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
      deleteAccount: deleteAccountValue,
      isDeletingAccount,
      logout,
    }),
    [
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      loginWithGithub,
      pendingLinkEmail,
      linkWithPassword,
      cancelPendingLink,
      completeUsername,
      updateEmailAddress,
      updateUsernameValue,
      updateAvatarValue,
      updateFullNameValue,
      updatePasswordValue,
      deleteAccountValue,
      isDeletingAccount,
      logout,
    ]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
