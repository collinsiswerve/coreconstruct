import { DomainError } from '../../../lib/domain';
import { catchResponse,context,json } from '../../../lib/server';
import { clientView,roleFor } from '../../../lib/security';
import { exportWeeklyUpdate } from '../../../lib/weekly-download';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const ctx=await context(request),params=new URL(request.url).searchParams,pid=params.get('projectId')||'',role=roleFor(ctx.actor,pid);if(!['admin','pm','client'].includes(role))throw new DomainError('Client project access is not assigned to this account.',403);const portal=clientView(ctx.state,pid);if(params.has('export'))return await exportWeeklyUpdate(portal,params.get('week')||'',params.get('export')||'');return json({portal,actor:{role,email:ctx.actor.email},organizationId:ctx.actor.organizationId});}catch(e){return catchResponse(e);}}
