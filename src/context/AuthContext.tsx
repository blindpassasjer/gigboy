/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, firebaseConfigError, firebaseEnabled } from '../lib/firebase';
import { db } from '../lib/firebase';
import { changeUsername, claimUsername, loadUserProfile, updateProfileFields } from '../lib/userProfiles';
import { isValidAvatar } from '../lib/avatars';
import { deleteAccountOnServer } from '../lib/bandsApi';
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
  const [loading, setLoading] = useState(firebaseEnabled);
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
    if (!auth) {
      setLoading(false);
      return;
    }
    const authInstance = auth;

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(authInstance, (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

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
          plan: 'free',
          planOverride: false,
          subscriptionStatus: null,
          currentPeriodEnd: null,
          storageQuotaBytes: 100 * 1024 * 1024,
          bandExtraMembers: 0,
          memberLimit: 1,
          stripeCustomerId: null,
        });
        setLoading(false);
        return;
      }
      const firestore = db;

      const syncProfile = async () => {
        try {
          const profile = await loadUserProfile(firestore, firebaseUser.uid);
          if (authInstance.currentUser?.uid !== firebaseUser.uid) return;

          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? '',
              username: profile?.username ?? null,
            avatar: profile?.avatar ?? null,
            fullName: profile?.fullName ?? null,
            plan: profile?.plan ?? 'free',
            planOverride: profile?.planOverride === true,
            subscriptionStatus: profile?.subscriptionStatus ?? null,
            currentPeriodEnd: profile?.currentPeriodEnd ?? null,
            storageQuotaBytes: profile?.storageQuotaBytes ?? 100 * 1024 * 1024,
            bandExtraMembers: profile?.bandExtraMembers ?? 0,
            memberLimit: profile?.memberLimit ?? 1,
            stripeCustomerId: profile?.stripeCustomerId ?? null,
          });
        } catch (error) {
          if (authInstance.currentUser?.uid !== firebaseUser.uid) return;

          console.error('Failed to load user profile.', error);
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email ?? '',
              username: null,
            avatar: null,
            fullName: null,
            plan: 'free',
            planOverride: false,
            subscriptionStatus: null,
            currentPeriodEnd: null,
            storageQuotaBytes: 100 * 1024 * 1024,
            bandExtraMembers: 0,
            memberLimit: 1,
            stripeCustomerId: null,
          });
        } finally {
          if (authInstance.currentUser?.uid === firebaseUser.uid) {
            setLoading(false);
          }
        }
      };

      setLoading(true);
      unsubscribeProfile = onSnapshot(
        doc(firestore, 'users', firebaseUser.uid),
        () => {
          void syncProfile();
        },
        (error) => {
          console.error('Failed to subscribe to user profile.', error);
          void syncProfile();
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (!auth) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    try {
      const result = await signInWithEmailAndPassword(auth, email, password);

      const pendingCredential = pendingCredentialRef.current;
      const pendingEmail = pendingLinkEmail;
      const normalizedPendingEmail = pendingEmail?.trim().toLowerCase();
      const normalizedEmail = email.trim().toLowerCase();
      if (pendingCredential && normalizedPendingEmail === normalizedEmail) {
        await linkWithCredential(result.user, pendingCredential);
        clearPendingLink();
      }

      return null;
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-login-credentials') {
        return 'Invalid email or password.';
      }
      return err instanceof Error ? err.message : 'Login failed';
    }
  }, [clearPendingLink, getAuthErrorCode, pendingLinkEmail]);

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
      // Optimistically set username so the race between onAuthStateChanged and the
      // Firestore write doesn't briefly show UsernameSetupPage after registration.
      setUser((current) => (current ? { ...current, username } : current));
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

    const hasPasswordProvider = auth.currentUser.providerData.some((provider) => provider.providerId === 'password');

    if (hasPasswordProvider && !currentPassword) {
      return 'Current password is required.';
    }

    if (newPassword.length < 8) {
      return 'Password must be at least 8 characters.';
    }

    try {
      if (hasPasswordProvider) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }
      await updatePassword(auth.currentUser, newPassword);
      return null;
    } catch (err: unknown) {
      const code = getAuthErrorCode(err);
      if (hasPasswordProvider && (code === 'auth/wrong-password' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials')) {
        return 'Current password is incorrect.';
      }
      if (code === 'auth/requires-recent-login') {
        return hasPasswordProvider
          ? 'Please sign in again, then retry changing your password.'
          : 'Please sign in with Google again, then retry setting a password.';
      }
      if (code === 'auth/weak-password') {
        return 'Password must be at least 8 characters.';
      }
      return err instanceof Error ? err.message : 'Failed to update password.';
    }
  }, [getAuthErrorCode]);

  const deleteAccountValue = useCallback(async (): Promise<string | null> => {
    if (!auth?.currentUser) {
      return firebaseConfigError ?? 'Firebase authentication is not configured.';
    }

    const currentUser = auth.currentUser;

    try {
      setIsDeletingAccount(true);
      await deleteAccountOnServer({
        userId: currentUser.uid,
        userEmail: currentUser.email ?? '',
      });
      await signOut(auth!);
      return null;
    } catch (err: unknown) {
      setIsDeletingAccount(false);
      return err instanceof Error ? err.message : 'Failed to delete account.';
    }
  }, [getAuthErrorCode]);

  const logout = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
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
