import { raceImageSources, decodeImage } from './image-sources.js';

export async function loadHeroImages(images, onProgress, { signal, request = fetch, urls = URL } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const totals = images.map(image => Number(image.dataset.bytes) || 1);
  const received = images.map(() => 0);
  const objectURLs = [];
  let previous = 0;
  function progress() {
    const value = Math.max(previous, Math.min(99, received.reduce((a, b) => a + b, 0) / totals.reduce((a, b) => a + b, 0) * 100));
    if (!controller.signal.aborted) { previous = value;onProgress(value); }
  }
  try {
    onProgress(0);
    const blobs = await Promise.all(images.map((image, index) => raceImageSources(image.dataset.src, async (source, attemptSignal) => {
      let bytesReceived = 0;
      const response = await request(source, { signal: attemptSignal, priority: 'low', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
      const length = Number(response.headers.get('Content-Length'));
      if (length > 0 && !response.headers.get('Content-Encoding')) totals[index] = length;
      const chunks = [];
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            bytesReceived += value.byteLength;received[index] = bytesReceived;
            progress();
          }
        } finally { reader.releaseLock(); }
      } else {
        const bytes = await response.arrayBuffer();
        chunks.push(bytes);bytesReceived = bytes.byteLength;received[index] = bytesReceived;progress();
      }
      attemptSignal.throwIfAborted();
      if (!bytesReceived) throw new Error('Empty image response');
      const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || 'image/webp' });
      if (typeof Image !== 'undefined') {
        const validationURL = urls.createObjectURL(blob);
        try { await decodeImage(validationURL, attemptSignal); }
        finally { urls.revokeObjectURL(validationURL); }
      }
      return blob;
    }, { signal: controller.signal })));
    controller.signal.throwIfAborted();
    for (const [index, image] of images.entries()) {
      const url = urls.createObjectURL(blobs[index]);
      objectURLs.push(url);image.src = url;
    }
    const decoded = await Promise.allSettled(images.map(image => image.decode()));
    controller.signal.throwIfAborted();
    const failed = decoded.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    onProgress(100);
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    for (const url of objectURLs) urls.revokeObjectURL(url);
    signal?.removeEventListener('abort', abort);
  }
}
