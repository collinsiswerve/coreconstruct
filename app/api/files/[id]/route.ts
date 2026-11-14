import { env } from 'cloudflare:workers';
import { DomainError } from '../../../../lib/domain';
import { catchResponse,context,database } from '../../../../lib/server';
import { roleFor } from '../../../../lib/security';
import { sampleDrawingBytes } from '../../../../lib/sample-drawing-files';
import { assertDrawingAccess } from '../../../../lib/drawings';
import { enabled } from '../../../../lib/suite';
import { watermarkDrawing } from '../../../../lib/documents';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params,ctx=await context(request),row=await database().prepare('SELECT * FROM files WHERE id=? AND organization_id=?').bind(id,ctx.actor.organizationId).first<{project_id:string;category:string;name:string;content_type:string}>();const drawing=ctx.state.suite.drawings.find(d=>d.fileId===id);
 const sample = !row && drawing && ctx.state.projects.find(p=>p.id===drawing.projectId)?.sampleWalkthrough === 'drawings-client-updates'
   ? sampleDrawingBytes(id) : undefined;
 if(sample && drawing){
   const role=roleFor(ctx.actor,drawing.projectId);
   if(!enabled(ctx.state,drawing.projectId,'design') || role==='client'&&!enabled(ctx.state,drawing.projectId,'portal')) throw new DomainError('Drawing access is disabled.',403);
   assertDrawingAccess(drawing,role);
   const bytes=await watermarkDrawing(sample,drawing);
   return new Response(bytes.slice().buffer as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }
 if(!row||!env.BUCKET)throw new DomainError('File not found.',404);const role=roleFor(ctx.actor,row.project_id||undefined);
 if((role==='accounts'||(role==='finance'&&!['receipt','invoice'].includes(row.category)))&&row.category!=='branding')throw new DomainError('File not found.',404);
 if(role==='client'&&row.project_id&&!enabled(ctx.state,row.project_id,'portal'))throw new DomainError('Client access is disabled.',403);
 if(row.category==='branding'){if(ctx.state.suite.brand.logoFileId!==id&&role!=='admin')throw new DomainError('File not found.',404);}else if(drawing){if(!enabled(ctx.state,row.project_id,'design'))throw new DomainError('Design access is disabled.',403);assertDrawingAccess(drawing,role);}else if(role==='client'){if(!ctx.state.suite.media.some(m=>m.fileId===id&&m.projectId===row.project_id&&m.published&&enabled(ctx.state,m.projectId,'portal')))throw new DomainError('File not found.',404);}else if(role==='architect'&&!['drawing','media','branding'].includes(row.category))throw new DomainError('File not found.',404);else if(row.category==='drawing'&&!drawing&&!['admin','pm','architect'].includes(role))throw new DomainError('Draft is not issued for construction.',403);else if(['invoice','decision'].includes(row.category)&&!['admin','pm','finance'].includes(role))throw new DomainError('File not found.',404);
 const object=await env.BUCKET.get(ctx.actor.organizationId+'/'+id);if(!object)throw new DomainError('File bytes are unavailable.',404);const headers={'Content-Type':row.content_type,'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"};
 if(drawing){const bytes=await watermarkDrawing(await object.arrayBuffer(),drawing);return new Response(bytes.slice().buffer as ArrayBuffer,{headers});}return new Response(object.body,{headers});}catch(e){return catchResponse(e);}}
