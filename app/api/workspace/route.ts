import { env } from 'cloudflare:workers';
import { DomainError, type Command } from '../../../lib/domain';
import { executeSuite } from '../../../lib/suite';
import { authorize, filterState, projectForCommand, roleFor, clientView } from '../../../lib/security';
import { catchResponse, commitState, context, database, json, readJson } from '../../../lib/server';
import { protectIdentity } from '../../../lib/protected-data';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const ctx=await context(request),{state,actor}=ctx;const onlyClient=actor.role==='client'&&Object.values(actor.projectRoles).every(r=>r==='client');return json({state:filterState(state,actor),version:ctx.version,user:{name:ctx.user.displayName,email:ctx.user.email},actor,organizations:ctx.organizations,identityConfigured:!!env.DATA_ENCRYPTION_KEY,operationApplied:state.commandIds.includes(new URL(request.url).searchParams.get('operationId')||''),clientViews:onlyClient?state.projects.filter(p=>actor.projectRoles[p.id]==='client').map(p=>clientView(state,p.id)):[]});}catch(e){return catchResponse(e);}}
export async function POST(request:Request){try{
 const raw=await readJson(request),ctx=await context(request),{actor,state}=ctx;
 if(typeof raw.id!=='string'||typeof raw.type!=='string'||!raw.payload||typeof raw.payload!=='object'||Array.isArray(raw.payload))throw new DomainError('Invalid operation.');
 const command=raw as unknown as Command;authorize(state,command,actor);
 // Protected values are always generated on the server. Supplied ciphertext is never trusted.
 if(command.type==='worker.register'||command.type==='worker.identity.set'){
   const p=command.payload;delete p.protected;
   if(p.nationalId){p.protected=await protectIdentity(String(p.nationalId),String(p.mpesaPhone||''),actor.organizationId,env.DATA_ENCRYPTION_KEY||'');}
   delete p.nationalId;delete p.mpesaPhone;
 }

 const replay=state.commandIds.includes(command.id);
 if(!replay&&(command.type==='attendance.save'||command.type==='attendance.remove')){
  const p=command.payload;const row=command.type==='attendance.remove'?state.attendance.find(a=>a.id===p.attendanceId):state.attendance.find(a=>a.projectId===p.projectId&&a.workerId===p.workerId&&a.date===p.date);
  const expected=row?JSON.stringify([row.id,row.units,row.rateCents,row.task]):'';if(typeof p.expectedToken!=='string'||p.expectedToken!==expected)throw new DomainError('Attendance changed on another device. Refresh and review the current entry before retrying.',409);
 }
 const pid=projectForCommand(state,command);
 const fileKeys=['fileId','offloadFileId','noteFileId','evidenceFileId','logoFileId','receiptFileId'];
 for(const key of fileKeys){const value=command.payload[key];if(!value)continue;const file=await database().prepare('SELECT project_id,category,content_type FROM files WHERE id=? AND organization_id=?').bind(value,actor.organizationId).first<{project_id:string;category:string;content_type:string}>();if(!file||((key!=='logoFileId')&&pid&&file.project_id!==pid))throw new DomainError('Evidence file is not available in this firm and project.',403);if(key==='logoFileId'&&file.category!=='branding')throw new DomainError('Choose a firm branding image.');const expected:Record<string,string>={offloadFileId:'offload',noteFileId:'delivery-note',evidenceFileId:command.type.startsWith('variation.')?'decision':'invoice',logoFileId:'branding',receiptFileId:'receipt',fileId:command.type==='drawing.add'?'drawing':'media'};if(file.category!==expected[key])throw new DomainError('Evidence category does not match this operation.');if(key==='fileId'&&command.type==='media.capture')command.payload.contentType=file.content_type;}
 if(command.type==='stock.move'&&command.payload.targetProjectId)roleFor(actor,String(command.payload.targetProjectId));
 const next=executeSuite(state,command,actor);
 if(!replay)await commitState(actor.organizationId,next,ctx.version);
 return json({state:filterState(next,actor),version:ctx.version+(replay?0:1),actor});
 }catch(e){return catchResponse(e);}}
