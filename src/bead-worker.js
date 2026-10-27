import { convertToBeads } from './bead-core.js';

self.onmessage = ({ data: request }) => {
  try {
    const result = convertToBeads(request.data, request.width, request.height, request.options);
    self.postMessage({ id: request.id, result }, [result.pixels.buffer]);
  } catch (error) {
    self.postMessage({ id: request.id, error: error.message });
  }
};
