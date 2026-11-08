import { randomBytes } from 'node:crypto';

// The download: 100 MiB of noise, so nothing on the way can compress it, made
// from one random MiB sent a hundred times. The stream is pulled, so each
// MiB goes out only as the connection takes it, and a client that leaves
// mid-file stops it.
const CHUNK = new Uint8Array(randomBytes(1024 * 1024));
const CHUNKS = 100;

export const GET = () => {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.enqueue(CHUNK);
        if (++sent === CHUNKS) controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(CHUNK.byteLength * CHUNKS),
      'Cache-Control': 'no-store',
    },
  });
};
