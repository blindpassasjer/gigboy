interface ThumbnailOptions {
  maxEdge?: number;
  quality?: number;
}

async function loadImageBitmap(source: Blob): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    return await createImageBitmap(source);
  } catch {
    return null;
  }
}

async function loadImageElement(source: Blob): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined' || typeof URL === 'undefined') return null;

  const objectUrl = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Failed to decode image.'));
      next.src = objectUrl;
    });
    return image;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function createWebpThumbnail(
  source: Blob,
  options: ThumbnailOptions = {},
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  const maxEdge = options.maxEdge ?? 320;
  const quality = options.quality ?? 0.78;

  const imageBitmap = await loadImageBitmap(source);
  const elementImage = imageBitmap ? null : await loadImageElement(source);

  const width = imageBitmap?.width ?? elementImage?.naturalWidth ?? 0;
  const height = imageBitmap?.height ?? elementImage?.naturalHeight ?? 0;
  if (width <= 0 || height <= 0) {
    imageBitmap?.close();
    return null;
  }

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    imageBitmap?.close();
    return null;
  }

  if (imageBitmap) {
    context.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
    imageBitmap.close();
  } else if (elementImage) {
    context.drawImage(elementImage, 0, 0, targetWidth, targetHeight);
  }

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/webp', quality);
  });
}
