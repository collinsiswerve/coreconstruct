import { env } from 'cloudflare:workers';
import { DomainError } from '../../../../lib/domain';
import { catchResponse,context,database,json } from '../../../../lib/server';
import { get,enabled } from '../../../../lib/suite';
import { roleFor } from '../../../../lib/security';
import { receiptPdf } from '../../../../lib/documents';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const ctx=await context(request),{id}=await params,r=get(ctx.state.suite.receipts,id,'Receipt'),role=roleFor(ctx.actor,r.projectId);if(!['admin','pm','client'].includes(role)||!enabled(ctx.state,r.projectId,'portal'))throw new DomainError('Receipt access is not permitted.',403);
 if(new URL(request.url).searchParams.get('format')==='json')return json({number:r.number,firm:ctx.state.firm,project:ctx.state.projects.find(p=>p.id===r.projectId)?.name,date:r.date,amountCents:r.amountCents,status:r.voidedAt?'void':'active'});
 const verify=new URL('/receipts/'+r.id,request.url);verify.searchParams.set('org',ctx.actor.organizationId);let logo:{bytes:ArrayBuffer;type:string}|undefined;const logoId=ctx.state.suite.brand.logoFileId;if(logoId&&env.BUCKET){const meta=await database().prepare('SELECT content_type FROM files WHERE id=? AND organization_id=? AND category=?').bind(logoId,ctx.actor.organizationId,'branding').first<{content_type:string}>();if(meta&&['image/jpeg','image/png'].includes(meta.content_type)){const obj=await env.BUCKET.get(ctx.actor.organizationId+'/'+logoId);if(obj)logo={bytes:await obj.arrayBuffer(),type:meta.content_type};}}
 const bytes=await receiptPdf(ctx.state,r,verify.href,logo);return new Response(bytes.slice().buffer as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${r.number}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return catchResponse(e);}}
