import { runs } from '../../lib/server/runs';

// With runs kept in browsers, a list says so, and nothing else is answered.
const browser = () => Response.json({ history: 'browser' }, { headers: { 'Cache-Control': 'no-store' } });
const away = () => new Response(null, { status: 404 });

export const GET = ({ url }: { url: URL }) => runs()?.list(Number(url.searchParams.get('from'))) ?? browser();
export const POST = ({ request }: { request: Request }) => runs()?.save(request) ?? away();
export const DELETE = () => runs()?.clear() ?? away();
