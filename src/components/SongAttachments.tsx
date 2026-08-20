import { useRef, useState } from 'react';
import { FileText, Trash2, Pencil, Check, X, Upload, ExternalLink } from 'lucide-react';
import { useSongAttachments } from '../hooks/useSongAttachments';
import { useBands } from '../context/BandsContext';
import { useStorageUsage } from '../hooks/useStorageUsage';
import type { Song } from '../types';
import type { User } from '../context/AuthContext';
import type { SongAttachment } from '../lib/songAttachments';
import { ATTACHMENT_ACCEPTED_MIME_TYPE, ATTACHMENT_MAX_SIZE_BYTES } from '../lib/songAttachments';
import { showConfirmToast } from '../utils/toastDialogs';

interface Props {
  song: Song;
  user: User;
  /** All songs are band-owned — attachments are stored under this band */
  bandId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentRowProps {
  attachment: SongAttachment;
  currentUserId: string;
  onDelete: (a: SongAttachment) => void;
  onRename: (a: SongAttachment, newName: string) => void;
}


function AttachmentRow({ attachment, currentUserId, onDelete, onRename }: AttachmentRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  function openRename() {
    setRenameValue(attachment.name);
    setRenaming(true);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }

  function confirmRename() {
    const nextName = renameValue.trim() || attachment.name;
    onRename(attachment, nextName);
    setRenaming(false);
  }

  function cancelRename() {
    setRenameValue(attachment.name);
    setRenaming(false);
  }

  async function confirmDelete() {
    const confirmed = await showConfirmToast(`Move "${attachment.name}" to trash?`, {
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;
    onDelete(attachment);
  }

  const canManage = attachment.uploader?.userId === currentUserId;

  return (
    <li className="attachment-row">
      <a
        className="attachment-row-link"
        href={attachment.downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={`Open ${attachment.name}`}
      >
        <FileText size={18} className="attachment-row-icon" />
      </a>

      <div className="attachment-rename-row">
        <div className="player-info">
          {renaming ? (
            <input
              ref={renameInputRef}
              className="player-name-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename();
                if (e.key === 'Escape') cancelRename();
              }}
              aria-label="Rename attachment"
            />
          ) : (
            <a
              className="player-name attachment-row-name"
              href={attachment.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={attachment.name}
            >
              {attachment.name}
            </a>
          )}
          <span className="player-date">
            {new Date(attachment.createdAt).toLocaleString()} · {formatFileSize(attachment.sizeBytes)}
          </span>
        </div>

        <a
          className="icon-btn icon-btn--open"
          href={attachment.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${attachment.name}`}
          title="Open"
        >
          <ExternalLink size={14} />
        </a>

        {canManage && (
          renaming ? (
            <>
              <button className="icon-btn icon-btn--confirm" onClick={confirmRename} aria-label="Confirm rename" title="Confirm">
                <Check size={14} />
              </button>
              <button className="icon-btn icon-btn--cancel" onClick={cancelRename} aria-label="Cancel rename" title="Cancel">
                <X size={14} />
              </button>
            </>
          ) : (
            <button
              className="icon-btn icon-btn--rename"
              onClick={openRename}
              aria-label={`Rename ${attachment.name}`}
              title="Rename"
            >
              <Pencil size={14} />
            </button>
          )
        )}

        {canManage && (
          <button
            className="icon-btn icon-btn--delete"
            onClick={() => { void confirmDelete(); }}
            aria-label={`Delete ${attachment.name}`}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

export default function SongAttachments({ song, user, bandId }: Props) {
  const { attachments, loading, uploading, uploadError, uploadAttachment, deleteAttachment, renameAttachment } = useSongAttachments({
    bandId,
    songId: song.id,
  });
  const { refreshBandTrash } = useBands();
  const storageQuotaBytes = user.storageQuotaBytes;
  const { usedBytes } = useStorageUsage(user.id);

  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChosen(file: File | undefined) {
    if (!file) return;
    setError(null);

    if (file.type !== ATTACHMENT_ACCEPTED_MIME_TYPE) {
      setError('Only PDF files can be attached');
      return;
    }
    if (usedBytes + file.size > storageQuotaBytes) {
      setError(`Storage quota exceeded. You've used ${Math.round(usedBytes / (1024 * 1024))} MB of your ${Math.round(storageQuotaBytes / (1024 * 1024))} MB limit.`);
      return;
    }

    try {
      await uploadAttachment(file);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save attachment';
      setError(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="song-attachments">
      <div className="attachments-controls">
        <button
          className="rec-btn rec-btn--start"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload size={14} /> {uploading ? 'Uploading…' : 'Add PDF'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="attachments-file-input"
          onChange={(e) => { void handleFileChosen(e.target.files?.[0]); }}
        />

        {(error || uploadError) && <p className="recorder-error">{error ?? uploadError}</p>}
        <p className="attachments-hint">PDF only, up to {Math.round(ATTACHMENT_MAX_SIZE_BYTES / (1024 * 1024))} MB</p>
      </div>

      <div className="recordings-section attachments-section">
        <div className="recordings-header">
          <h2><span>Attachments</span></h2>
        </div>
        {loading ? (
          <p className="no-recordings">Loading…</p>
        ) : attachments.length === 0 ? (
          <p className="no-recordings">No attachments yet</p>
        ) : (
          <ul className="recordings-list attachments-list">
            {attachments.map((attachment) => (
              <AttachmentRow
                key={attachment.id}
                attachment={attachment}
                currentUserId={user.id}
                onDelete={(a) => {
                  void deleteAttachment(a).then(() => {
                    void refreshBandTrash(bandId);
                  });
                }}
                onRename={renameAttachment}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
