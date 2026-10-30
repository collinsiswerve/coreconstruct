import { DomainError } from '../../../lib/domain';
import { catchResponse,context,json } from '../../../lib/server';
import { clientView,roleFor } from '../../../lib/security';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const ctx=await context(request),pid=new URL(request.url).searchParams.get('projectId')||'',role=roleFor(ctx.actor,pid);if(!['admin','pm','client'].includes(role))throw new DomainError('Client project access is not assigned to this account.',403);return json({portal:clientView(ctx.state,pid),actor:{role,email:ctx.actor.email},organizationId:ctx.actor.organizationId});}catch(e){return catchResponse(e);}}
