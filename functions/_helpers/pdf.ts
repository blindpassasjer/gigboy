import { PDFDocument, StandardFonts } from 'pdf-lib';

interface PdfSong {
  title: string;
  artist?: string;
  chordpro?: string;
}

export async function buildSongsPdfBase64(resourceName: string, songs: PdfSong[]) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  let page = doc.addPage([595.28, 841.89]);
  let y = 800;

  const writeLine = (text: string, size = 11, spacing = 16) => {
    if (y < 60) {
      page = doc.addPage([595.28, 841.89]);
      y = 800;
    }

    page.drawText(text, {
      x: 48,
      y,
      size,
      font,
    });

    y -= spacing;
  };

  writeLine(resourceName, 16, 26);
  writeLine(`Generated ${new Date().toISOString()}`, 9, 20);

  songs.forEach((song, index) => {
    writeLine(`${index + 1}. ${song.title}`, 12, 18);

    if (song.artist) {
      writeLine(`Artist: ${song.artist}`, 10, 15);
    }

    const lines = (song.chordpro ?? '')
      .split('\n')
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .slice(0, 22);

    if (lines.length > 0) {
      lines.forEach((line) => writeLine(line.slice(0, 96), 10, 13));
    }

    y -= 12;
  });

  const bytes = await doc.save();
  const chunks = Array.from(bytes, (byte) => String.fromCharCode(byte));
  return btoa(chunks.join(''));
}
