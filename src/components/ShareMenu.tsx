import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Mail, Send, Share2, Users } from 'lucide-react';
import toast from '../utils/anchoredToast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import { isValidEmail } from '../lib/collaboration';
import { createInviteOnServer, searchShareRecipientsOnServer, type ShareRecipientMatch } from '../lib/shareApi';
import type { CollaborationPermission, ShareResourceType } from '../types';

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_.-]{1,22}[a-z0-9])?$/;

interface ShareMenuProps {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  disabled?: boolean;
  buttonClassName?: string;
  buttonTitle?: string;
  iconOnly?: boolean;
  extraActions?: ReactNode;
}

export default function ShareMenu({
  resourceType,
  resourceId,
  resourceName,
  disabled,
  buttonClassName,
  buttonTitle,
  iconOnly = false,
  extraActions,
}: ShareMenuProps) {
  const { user } = useAuth();
  const { bands } = useBands();
  const [open, setOpen] = useState(false);
  const [recipientQuery, setRecipientQuery] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<ShareRecipientMatch | null>(null);
  const [searchingRecipients, setSearchingRecipients] = useState(false);
  const [recipientResults, setRecipientResults] = useState<ShareRecipientMatch[]>([]);
  const [permission, setPermission] = useState<CollaborationPermission>('viewer');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [sharingBandId, setSharingBandId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (panelRef.current?.contains(target ?? null)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const normalizedRecipientQuery = useMemo(() => recipientQuery.trim(), [recipientQuery]);
  const shareableBands = useMemo(
    () => bands.filter((band) => band.memberIds.some((memberId) => memberId !== user?.id)),
    [bands, user?.id]
  );
  const bandPeopleByUserId = useMemo(() => {
    const entries = new Map<string, ShareRecipientMatch & { mutualBands: string[] }>();

    bands.forEach((band) => {
      band.memberIds.forEach((memberId) => {
        if (memberId === user?.id) return;
        const username = band.memberUsernames[memberId]?.trim() ?? '';
        if (!username) return;

        const existing = entries.get(memberId);
        if (existing) {
          if (!existing.mutualBands.includes(band.name)) {
            existing.mutualBands.push(band.name);
          }
          return;
        }

        entries.set(memberId, {
          userId: memberId,
          username,
          fullName: band.memberFullNames[memberId]?.trim() || undefined,
          email: band.memberEmails[memberId]?.trim() || undefined,
          avatar: band.memberAvatars[memberId]?.trim() || undefined,
          mutualBands: [band.name],
        });
      });
    });

    return entries;
  }, [bands, user?.id]);

  useEffect(() => {
    if (!open || !user?.id || !user.email) {
      setRecipientResults([]);
      setSearchingRecipients(false);
      return;
    }

    const query = normalizedRecipientQuery;
    if (query.length < 2) {
      setRecipientResults([]);
      setSearchingRecipients(false);
      return;
    }

    let active = true;
    const handle = window.setTimeout(() => {
      setSearchingRecipients(true);
      void searchShareRecipientsOnServer({
        userId: user.id,
        userEmail: user.email,
        query,
      })
        .then((response) => {
          if (!active) return;
          setRecipientResults(response.recipients);
        })
        .catch((error) => {
          if (!active) return;
          console.error('Failed to search recipients.', error);
          setRecipientResults([]);
        })
        .finally(() => {
          if (!active) return;
          setSearchingRecipients(false);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [normalizedRecipientQuery, open, user?.email, user?.id]);

  const visibleRecipientSuggestions = useMemo(() => {
    const query = normalizedRecipientQuery.toLowerCase();
    const merged = new Map<string, ShareRecipientMatch & { mutualBands: string[] }>();

    bandPeopleByUserId.forEach((entry, userId) => {
      const matches = !query
        || entry.username.toLowerCase().includes(query)
        || (entry.fullName?.toLowerCase().includes(query) ?? false)
        || (entry.email?.toLowerCase().includes(query) ?? false);
      if (matches) {
        merged.set(userId, { ...entry, mutualBands: [...entry.mutualBands] });
      }
    });

    recipientResults.forEach((entry) => {
      const existing = merged.get(entry.userId);
      if (existing) {
        merged.set(entry.userId, {
          ...existing,
          username: existing.username || entry.username,
          fullName: existing.fullName || entry.fullName,
          email: existing.email || entry.email,
          avatar: existing.avatar || entry.avatar,
        });
        return;
      }

      merged.set(entry.userId, {
        ...entry,
        mutualBands: bandPeopleByUserId.get(entry.userId)?.mutualBands ?? [],
      });
    });

    return [...merged.values()]
      .sort((a, b) => {
        const aLabel = a.fullName || a.username;
        const bLabel = b.fullName || b.username;
        return aLabel.localeCompare(bLabel);
      })
      .slice(0, 8);
  }, [bandPeopleByUserId, normalizedRecipientQuery, recipientResults]);

  const inviteTarget = useMemo(() => {
    if (selectedRecipient?.username) return selectedRecipient.username;
    if (selectedRecipient?.email) return selectedRecipient.email;
    return normalizedRecipientQuery;
  }, [normalizedRecipientQuery, selectedRecipient]);

  const validate = () => {
    if (!user?.id || !user.email) {
      toast.error('You must be signed in to share.');
      return false;
    }

    if (!inviteTarget) {
      toast.error('Please enter a name, email, or username.');
      return false;
    }

    if (inviteTarget.includes('@')) {
      if (!isValidEmail(inviteTarget)) {
        toast.error('Please enter a valid email.');
        return false;
      }
      return true;
    }

    if (!USERNAME_PATTERN.test(inviteTarget.toLowerCase())) {
      toast.error('Choose a recipient from search results, or enter a valid username.');
      return false;
    }

    return true;
  };

  const handleSendInvite = async () => {
    if (!validate() || !user?.id || !user.email) return;

    setSubmittingInvite(true);
    try {
      await createInviteOnServer({
        userId: user.id,
        userEmail: user.email,
        recipientQuery: inviteTarget,
        resourceType,
        resourceId,
        resourceName,
        permission,
      });

      toast.success('Invite sent.');
      setRecipientQuery('');
      setSelectedRecipient(null);
      setRecipientResults([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invite.';
      toast.error(message);
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleShareWithBand = async (bandId: string) => {
    if (!user?.id || !user.email) {
      toast.error('You must be signed in to share.');
      return;
    }

    const band = bands.find((entry) => entry.id === bandId);
    if (!band) {
      toast.error('Band not found.');
      return;
    }

    const recipients = band.memberIds
      .filter((memberId) => memberId !== user.id)
      .map((memberId) => band.memberEmails[memberId]?.trim())
      .filter((entry): entry is string => Boolean(entry && isValidEmail(entry)))
      .filter((entry, index, list) => list.findIndex((candidate) => candidate.toLowerCase() === entry.toLowerCase()) === index);

    if (recipients.length === 0) {
      toast.error('This band has no other members with a saved email.');
      return;
    }

    setSharingBandId(bandId);

    const results = await Promise.allSettled(
      recipients.map(async (recipientEmail) => {
        await createInviteOnServer({
          userId: user.id,
          userEmail: user.email,
          recipientQuery: recipientEmail,
          resourceType,
          resourceId,
          resourceName,
          permission,
        });
      })
    );

    setSharingBandId(null);

    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failureCount = results.length - successCount;

    if (successCount > 0) {
      toast.success(`Sent ${successCount} invite${successCount === 1 ? '' : 's'} to ${band.name}.`);
    }

    if (failureCount > 0) {
      toast.error(`Failed to send ${failureCount} band invite${failureCount === 1 ? '' : 's'}.`);
    }
  };

  return (
    <div className="share-menu" ref={panelRef}>
      <button
        type="button"
        className={buttonClassName ?? 'setlist-action-btn setlist-action-btn--secondary'}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={buttonTitle ?? 'Share'}
        aria-label={buttonTitle ?? 'Share'}
      >
        <Share2 size={14} />
        {!iconOnly ? ' Share' : null}
      </button>

      {open && (
        <div className="share-menu-panel" role="dialog" aria-label={`Share ${resourceName}`}>
          <p className="share-menu-title">Share {resourceName}</p>

          <label className="share-menu-field">
            <span>Search name, email, or username</span>
            <div className="share-menu-input-wrap">
              <Mail size={14} />
              <input
                type="text"
                placeholder="Start typing a name"
                value={recipientQuery}
                onChange={(event) => {
                  setRecipientQuery(event.target.value);
                  setSelectedRecipient(null);
                }}
              />
            </div>
            {searchingRecipients ? <p className="share-menu-search-status">Searching…</p> : null}
            {visibleRecipientSuggestions.length > 0 ? (
              <ul className="share-menu-recipient-results">
                {visibleRecipientSuggestions.map((recipient) => {
                  const label = recipient.fullName || recipient.username;
                  const details = [recipient.username];
                  if (recipient.email) details.push(recipient.email);
                  if (recipient.mutualBands.length > 0) {
                    details.push(`Shared bands: ${recipient.mutualBands.join(', ')}`);
                  }

                  return (
                    <li key={recipient.userId}>
                      <button
                        type="button"
                        className="share-menu-recipient-btn"
                        onClick={() => {
                          setSelectedRecipient(recipient);
                          setRecipientQuery(label);
                        }}
                      >
                        <strong>{label}</strong>
                        <span>{details.join(' • ')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {selectedRecipient ? (
              <p className="share-menu-search-status">
                Sharing with {selectedRecipient.fullName || selectedRecipient.username} ({selectedRecipient.username})
              </p>
            ) : null}
          </label>

          <label className="share-menu-field">
            <span>Permission</span>
            <select
              value={permission}
              onChange={(event) => setPermission(event.target.value as CollaborationPermission)}
            >
              <option value="viewer">Viewer</option>
              <option value="editor">Editor</option>
            </select>
          </label>

          <div className="share-menu-actions">
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              disabled={submittingInvite || Boolean(sharingBandId)}
              onClick={handleSendInvite}
            >
              <Send size={14} /> {submittingInvite ? 'Sending…' : 'Send invite'}
            </button>
          </div>

          {shareableBands.length > 0 ? (
            <div className="share-menu-extra share-menu-bands">
              <p className="share-menu-subtitle">Share with a band</p>
              <div className="share-menu-band-list">
                {shareableBands.map((band) => {
                  const memberCount = band.memberIds.filter((memberId) => memberId !== user?.id).length;
                  return (
                    <div key={band.id} className="share-menu-band-row">
                      <div className="share-menu-band-copy">
                        <strong>{band.name}</strong>
                        <span>{memberCount} member{memberCount === 1 ? '' : 's'}</span>
                      </div>
                      <button
                        type="button"
                        className="setlist-action-btn setlist-action-btn--secondary"
                        disabled={submittingInvite || Boolean(sharingBandId)}
                        onClick={() => void handleShareWithBand(band.id)}
                      >
                        <Users size={14} /> {sharingBandId === band.id ? 'Sharing…' : 'Share'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {extraActions ? <div className="share-menu-extra">{extraActions}</div> : null}
        </div>
      )}
    </div>
  );
}
