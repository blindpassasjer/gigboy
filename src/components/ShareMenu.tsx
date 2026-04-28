import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Mail, Send, Share2, FileDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { createInvite, isValidEmail } from '../lib/collaboration';
import { sendInviteEmail, sendPdfEmail } from '../lib/shareApi';
import type { CollaborationPermission, ShareResourceType, Song } from '../types';

interface ShareMenuProps {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  songsForPdf: Song[];
  disabled?: boolean;
  buttonClassName?: string;
  buttonTitle?: string;
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
  extraActions,
}: ShareMenuProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<CollaborationPermission>('viewer');
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [sendingPdf, setSendingPdf] = useState(false);
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

  const validate = () => {
    if (!user?.id || !user.email) {
      toast.error('You must be signed in to share.');
      return false;
    }

    if (!db) {
      toast.error('Sharing requires Firebase.');
      return false;
    }

    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      toast.error('Please enter a valid email.');
      return false;
    }

    return true;
  };

  const handleSendInvite = async () => {
    if (!validate() || !db || !user?.id || !user.email) return;

    setSubmittingInvite(true);
    try {
      const invite = await createInvite({
        db,
        ownerId: user.id,
        ownerEmail: user.email,
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
        inviteId: invite.id,
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

  return (
    <div className="share-menu" ref={panelRef}>
      <button
        type="button"
        className={buttonClassName ?? 'setlist-action-btn setlist-action-btn--secondary'}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        title={buttonTitle ?? 'Share'}
      >
        <Share2 size={14} /> Share
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
              disabled={submittingInvite || sendingPdf}
              onClick={handleSendInvite}
            >
              <Send size={14} /> {submittingInvite ? 'Sending…' : 'Send invite'}
            </button>
            <button
              type="button"
              className="setlist-action-btn setlist-action-btn--secondary"
              disabled={submittingInvite || sendingPdf}
              onClick={handleSendPdf}
            >
              <FileDown size={14} /> {sendingPdf ? 'Sending…' : 'Email PDF'}
            </button>
          </div>

          {extraActions ? <div className="share-menu-extra">{extraActions}</div> : null}
        </div>
      )}
    </div>
  );
}
