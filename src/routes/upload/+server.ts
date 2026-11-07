// The upload: read to the last byte, then answered. Answering before the
// body has arrived would let a proxy in front cut the rest of it off.
export const POST = async ({ request }: { request: Request }) => {
  const reader = request.body?.getReader();
  if (reader) while (!(await reader.read()).done);
  return new Response(null, { status: 200, headers: { 'Cache-Control': 'no-store' } });
};
