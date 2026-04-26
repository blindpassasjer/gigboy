import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, Wand2 } from 'lucide-react';
import type { Song } from '../types';
import ChordDisplay from './ChordDisplay';
import ChordProToolbar from './ChordProToolbar';
import { LANGUAGE_NAMES } from '../utils/languages';
import { parsePastedSong } from '../utils/chordFormatParser';

interface Props {
  onSave: (song: Song) => Promise<string | null>;
  initialSong?: Song;
  mode?: 'add' | 'edit';
  songListOptions?: Array<{ id: string; label: string }>;
  initialSongListId?: string;
  onSongListChange?: (songListId: string, songId: string) => void;
}

const PLACEHOLDER = `{title: My Song}
{artist: Artist Name}

{start_of_verse}
[G]Amazing [C]grace, how [G]sweet the [D]sound
[G]That saved a [C]wretch like [G]me
{end_of_verse}

{start_of_chorus}
[D]I once was [G]lost but [C]now am [G]found
Was [Em]blind but [D]now I [G]see
{end_of_chorus}`;

export default function AddSongForm({
  onSave,
  initialSong,
  mode = 'add',
  songListOptions,
  initialSongListId,
  onSongListChange,
}: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initialSong?.title ?? '');
  const [artist, setArtist] = useState(initialSong?.artist ?? '');
  const [language, setLanguage] = useState(initialSong?.language ?? 'en');
  const [tags, setTags] = useState((initialSong?.tags ?? []).join(', '));
  const [key, setKey] = useState(initialSong?.key ?? '');
  const [capo, setCapo] = useState(initialSong?.capo !== undefined ? String(initialSong.capo) : '');
  const [tempo, setTempo] = useState(initialSong?.tempo !== undefined ? String(initialSong.tempo) : '');
  const [timeSignature, setTimeSignature] = useState(initialSong?.timeSignature ?? '');
  const [chordpro, setChordpro] = useState(initialSong?.chordpro ?? '');
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [songListId, setSongListId] = useState(initialSongListId ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function validate() {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Title is required.');
    if (!chordpro.trim()) errs.push('Song content (ChordPro) is required.');
    return errs;
  }

  function handleParsePasted() {
    if (!chordpro.trim()) {
      setErrors(['Add some content before parsing.']);
      return;
    }

    const parsed = parsePastedSong(chordpro);
    if (parsed.title) setTitle(parsed.title);
    if (parsed.artist) setArtist(parsed.artist);
    if (parsed.key) setKey(parsed.key);
    if (typeof parsed.capo === 'number') setCapo(String(parsed.capo));
    if (typeof parsed.tempo === 'number') setTempo(String(parsed.tempo));
    setChordpro(parsed.chordpro);
    setParseWarnings(parsed.warnings);
    setErrors([]);
    setPreview(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }

    const song: Song = {
      id: initialSong?.id ?? crypto.randomUUID(),
      title: title.trim(),
      artist: artist.trim() || undefined,
      language,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      key: key.trim() || undefined,
      capo: capo ? parseInt(capo) : undefined,
      tempo: tempo ? parseInt(tempo) : undefined,
      timeSignature: timeSignature.trim() || undefined,
      chordpro: chordpro.trim(),
      createdAt: initialSong?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saveError = await onSave(song);
    if (saveError) {
      setErrors([`Could not save song: ${saveError}`]);
      return;
    }

    if (songListId) {
      onSongListChange?.(songListId, song.id);
    }

    navigate(`/songs/${song.id}`);
  }

  return (
    <div className="add-song-page">
      <h1>{mode === 'edit' ? 'Edit Song' : 'Add Song'}</h1>
      <form onSubmit={handleSubmit} className="add-song-form">
        {errors.length > 0 && (
          <ul className="form-errors">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        <div className="form-row">
          <div className="form-field">
            <label>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
          </div>
          <div className="form-field">
            <label>Artist</label>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist / band" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-field">
            <label>Language</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {Object.entries(LANGUAGE_NAMES).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-field">
            <label>Key</label>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. G" maxLength={4} />
          </div>
          <div className="form-field">
            <label>Capo</label>
            <input type="number" value={capo} onChange={(e) => setCapo(e.target.value)} min={0} max={12} placeholder="0" />
          </div>
          <div className="form-field">
            <label>BPM</label>
            <input type="number" value={tempo} onChange={(e) => setTempo(e.target.value)} min={20} max={300} placeholder="120" />
          </div>
          <div className="form-field">
            <label>Time Signature</label>
            <input value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)} placeholder="4/4" maxLength={7} />
          </div>
        </div>

        <div className="form-field">
          <label>Tags (comma separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="worship, hymn, folk…" />
        </div>

        <div className="form-field">
          <label>Save to song list</label>
          <select value={songListId} onChange={(e) => setSongListId(e.target.value)}>
            <option value="">Do not add to a list</option>
            {songListOptions?.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="form-field form-field--full">
          <div className="chordpro-label-row">
            <label>ChordPro Lyrics *</label>
            <button type="button" className="preview-toggle" onClick={handleParsePasted}>
              <Wand2 size={14} /> Parse
            </button>
            <button type="button" className="preview-toggle" onClick={() => setPreview((v) => !v)}>
              {preview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {!preview && (
            <ChordProToolbar
              textareaRef={textareaRef}
              value={chordpro}
              onChange={setChordpro}
            />
          )}
          {preview ? (
            <div className="chordpro-preview">
              <ChordDisplay chordpro={chordpro || PLACEHOLDER} showChords />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={chordpro}
              onChange={(e) => setChordpro(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={16}
              spellCheck={false}
            />
          )}
          {parseWarnings.length > 0 && (
            <div className="paste-import-warnings" role="status">
              {parseWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}
          <p className="form-hint">
            Paste plain lyrics with chords and click <strong>Parse</strong> to convert, or write ChordPro directly:{' '}
            <code>[G]Amazing [C]grace</code>, <code>&#123;start_of_chorus&#125;</code>.
          </p>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary">
            <Save size={16} /> {mode === 'edit' ? 'Update Song' : 'Save Song'}
          </button>
        </div>
      </form>
    </div>
  );
}
