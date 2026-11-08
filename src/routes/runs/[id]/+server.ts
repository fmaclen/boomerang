import { runs } from '../../../lib/server/runs';

export const GET = ({ params }: { params: { id: string } }) => runs()?.one(params.id) ?? new Response(null, { status: 404 });
