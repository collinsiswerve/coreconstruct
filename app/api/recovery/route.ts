import { env } from 'cloudflare:workers';
import { dateKey, DomainError } from '../../../lib/domain';
import { createRecoveryArchive, RecoveryError } from '../../../lib/recovery.mjs';
import { catchResponse, context, database, json } from '../../../lib/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { state, actor, version } = await context(request);
    if (actor.role !== 'admin') throw new DomainError('Only the firm principal can download a recovery archive.', 403);
    if (!env.BUCKET) throw new DomainError('Private file storage is unavailable.', 503);
    const archive = await createRecoveryArchive(database(), env.BUCKET, { state, version, organizationId: actor.organizationId });
    return new Response(archive, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="coreconstruct-recovery-${dateKey()}.zip"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof RecoveryError) return json({ error: error.message }, error.status);
    return catchResponse(error);
  }
}
