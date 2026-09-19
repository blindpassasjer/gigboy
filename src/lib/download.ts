/**
 * True on phones/tablets, where a "download" is only reachable through the OS share
 * sheet (Save to Files, AirDrop, etc). On desktop this is false even when the browser
 * technically supports `navigator.share({ files })` — Chrome/Edge on Windows do, and
 * routing the plain Download button through the native share flyout there is
 * surprising and easy to dismiss without ever saving the file (the bug this guards
 * against: desktop users clicking Download and having nothing visibly happen).
 */
function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData) return Boolean(uaData.mobile);
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * Save a generated Blob to the user's device.
 *
 * iOS Safari has only partial support for the `<a download>` attribute on blob URLs —
 * depending on the iOS version it may open the file in a viewer or a new tab instead of
 * saving it. Where the Web Share API can take files (iOS, Android Chrome), we hand the
 * file to the share sheet so the user can save to Files, AirDrop, etc. Everywhere else
 * we use a DOM-attached anchor and defer revocation so the download has actually started
 * before the blob URL is invalidated (revoking synchronously can truncate it).
 */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const file = typeof File !== 'undefined'
    ? new File([blob], filename, { type: blob.type || 'application/octet-stream' })
    : null;

  if (file && isMobileDevice() && typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // User dismissed the sheet — respect that and don't also trigger a download.
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      // Any other failure: fall through to the anchor method.
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
