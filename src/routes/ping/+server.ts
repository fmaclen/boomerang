// A round trip and nothing else: the latency probe.
export const GET = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
