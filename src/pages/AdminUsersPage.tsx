import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from '../utils/anchoredToast';
import { dataClient } from '../lib/dataClient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { AdminUserListing } from '../lib/dataClient/types';

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024)).toLocaleString()} MB`;
}

/**
 * Admin-only page listing all users with their storage usage and letting an admin assign a
 * per-user storage quota override. Mirrors `server/routes/adminUsers.ts`'s `adminUsersRouter`,
 * which rejects non-admins with 403. Quota is enforced server-side (see
 * server/lib/storageQuota.ts) against the total usage of bands the user owns.
 */
export default function AdminUsersPage() {
  useDocumentTitle('Users (admin)');

  const [users, setUsers] = useState<AdminUserListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshUsers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await dataClient.adminUsers.list();
      setUsers(list);
      setDrafts(Object.fromEntries(list.map((u) => [u.id, String(Math.round(u.storageQuotaBytes / (1024 * 1024)))])));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load users.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const handleSaveQuota = async (user: AdminUserListing) => {
    const draft = drafts[user.id] ?? '';
    const mb = Number(draft);
    if (!Number.isFinite(mb) || mb <= 0) {
      toast.error('Enter a quota in MB greater than 0.');
      return;
    }
    setBusyId(user.id);
    try {
      const bytes = Math.round(mb * 1024 * 1024);
      await dataClient.adminUsers.setQuota(user.id, bytes);
      toast.success(`Quota updated for ${user.email}.`);
      await refreshUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update quota.';
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  const handleResetQuota = async (user: AdminUserListing) => {
    setBusyId(user.id);
    try {
      await dataClient.adminUsers.setQuota(user.id, null);
      toast.success(`Quota reset to default for ${user.email}.`);
      await refreshUsers();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reset quota.';
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="profile-invites-page">
      <header className="profile-invites-header">
        <h1>Users</h1>
        <p>All accounts on this instance, with storage used across bands they own and their assigned quota.</p>
      </header>

      <nav className="admin-tabs">
        <Link to="/admin/invites">Invites</Link>
        <Link to="/admin/users" className="active" aria-current="page">Users</Link>
      </nav>

      <section className="profile-invites-section">
        <h2>All users</h2>
        {loading ? (
          <p className="profile-invites-status">Loading users…</p>
        ) : users.length === 0 ? (
          <p className="profile-invites-status">No users found.</p>
        ) : (
          <ul className="profile-invites-list">
            {users.map((user) => {
              const busy = busyId === user.id;
              return (
                <li key={user.id} className="profile-invite-card">
                  <div className="profile-invite-main">
                    <strong>{user.fullName || user.username || user.email}</strong>
                    <span>
                      {user.email} · {user.role === 'admin' ? 'Admin' : 'Member'} · owns {user.ownedBandCount}{' '}
                      {user.ownedBandCount === 1 ? 'band' : 'bands'} · using {formatMb(user.usedBytes)} of{' '}
                      {formatMb(user.storageQuotaBytes)}
                      {user.hasCustomQuota ? '' : ' (default)'}
                    </span>
                  </div>
                  <div className="profile-invite-actions">
                    <div className="admin-user-quota">
                      <input
                        type="number"
                        min={1}
                        value={drafts[user.id] ?? ''}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [user.id]: e.target.value }))}
                        disabled={busy}
                        aria-label={`Storage quota in MB for ${user.email}`}
                      />
                      <span>MB</span>
                    </div>
                    <button
                      type="button"
                      className="setlist-action-btn setlist-action-btn--secondary"
                      disabled={busy}
                      onClick={() => void handleSaveQuota(user)}
                    >
                      {busy ? 'Working…' : 'Save'}
                    </button>
                    {user.hasCustomQuota ? (
                      <button
                        type="button"
                        className="setlist-action-btn setlist-action-btn--secondary"
                        disabled={busy}
                        onClick={() => void handleResetQuota(user)}
                      >
                        Reset to default
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
