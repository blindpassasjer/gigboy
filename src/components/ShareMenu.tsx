import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Mail, Send, Share2, FileDown, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useBands } from '../context/BandsContext';
import { isValidEmail } from '../lib/collaboration';
import { createInviteOnServer, sendInviteEmail, sendPdfEmail } from '../lib/shareApi';
import type { CollaborationPermission, ShareResourceType, Song } from '../types';

interface ShareMenuProps {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  songsForPdf: Song[];
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
  songsForPdf,
  disabled,
  buttonClassName,
  buttonTitle,
  iconOnly = false,
  extraActions,
}: ShareMenuProps) {
  const { user } = useAuth();
  const { bands } = useBands();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<CollaborationPermission>('viewer');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [sendingPdf, setSendingPdf] = useState(false);
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

  const normalizedEmail = useMemo(() => email.trim(), [email]);
  const shareableBands = useMemo(
    () => bands.filter((band) => band.memberIds.some((memberId) => memberId !== user?.id)),
    [bands, user?.id]
  );

  const validate = () => {
    if (!user?.id || !user.email) {
      toast.error('You must be signed in to share.');
      return false;
    }

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      toast.error('Please enter a valid email.');
      return false;
    }

    return true;
  };

  const handleSendInvite = async () => {
    if (!validate() || !user?.id || !user.email) return;

    setSubmittingInvite(true);
    try {
      const { inviteId } = await createInviteOnServer({
        userId: user.id,
        userEmail: user.email,
        recipientEmail: normalizedEmail,
        resourceType,
        resourceId,
        resourceName,
        permission,
      });

      await sendInviteEmail({
        userId: user.id,
        userEmail: user.email,
        recipientEmail: normalizedEmail,
        resourceType,
        resourceName,
        permission,
        inviteId,
      });

      toast.success('Invite sent.');
      setEmail('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invite.';
      toast.error(message);
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleSendPdf = async () => {
    if (!validate() || !user?.id || !user.email) return;

    if (songsForPdf.length === 0) {
      toast.error('No songs available to include in PDF.');
      return;
    }

    setSendingPdf(true);
    try {
      await sendPdfEmail({
        userId: user.id,
        userEmail: user.email,
        recipientEmail: normalizedEmail,
        resourceType,
        resourceName,
        songs: songsForPdf,
      });
      toast.success('PDF email sent.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send PDF email.';
      toast.error(message);
    } finally {
      setSendingPdf(false);
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
        const { inviteId } = await createInviteOnServer({
          userId: user.id,
          userEmail: user.email,
          recipientEmail,
          resourceType,
          resourceId,
          resourceName,
          permission,
        });

        await sendInviteEmail({
          userId: user.id,
          userEmail: user.email,
          recipientEmail,
          resourceType,
          resourceName,
          permission,
          inviteId,
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
            <span>Email</span>
            <div className="share-menu-input-wrap">
              <Mail size={14} />
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
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
              disabled={submittingInvite || sendingPdf || Boolean(sharingBandId)}
              onClick={handleSendInvite}
            >
              <Send size={14} /> {submittingInvite ? 'Sending…' : 'Send invite'}
            </button>
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              disabled={submittingInvite || sendingPdf || Boolean(sharingBandId)}
              onClick={handleSendPdf}
            >
              <FileDown size={14} /> {sendingPdf ? 'Sending…' : 'Email PDF'}
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
                        disabled={submittingInvite || sendingPdf || Boolean(sharingBandId)}
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
