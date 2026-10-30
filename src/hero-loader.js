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
    const blobs = await Promise.all(images.map(async (image, index) => {
      const response = await request(image.dataset.src, { signal: controller.signal, priority: 'low' });
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
            received[index] += value.byteLength;
            progress();
          }
        } finally { reader.releaseLock(); }
      } else {
        const bytes = await response.arrayBuffer();
        chunks.push(bytes);received[index] = bytes.byteLength;progress();
      }
      controller.signal.throwIfAborted();
      if (!received[index]) throw new Error('Empty image response');
      return new Blob(chunks, { type: response.headers.get('Content-Type') || 'image/webp' });
    }));
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
