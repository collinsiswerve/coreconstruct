import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../app/chatgpt-auth';
import { DomainError, emptyState } from './domain';
import { normalizeState } from './suite';
import type { Actor, Role, SuiteState } from './suite-types';
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
export function catchResponse(error: unknown): Response { if(error instanceof DomainError)return json({error:error.message},error.status);if(error instanceof SyntaxError)return json({error:'Invalid request body.'},400);console.error('coreconstruct-request-failed',error instanceof Error?error.name:'unknown');return json({error:'The request could not be completed. No unconfirmed operation should be treated as saved.'},500); }
export function database():D1Database {if(!env.DB)throw new DomainError('Workspace storage is unavailable.',503);return env.DB;}
export function requireOrigin(request:Request):void { const origin=request.headers.get('origin');if(!origin||origin!==new URL(request.url).origin)throw new DomainError('This request must come from the workspace.',403); }
export async function readJson(request:Request):Promise<Record<string,unknown>> {requireOrigin(request);if(!request.headers.get('content-type')?.startsWith('application/json'))throw new DomainError('JSON is required.',415);const body=await request.text();if(new TextEncoder().encode(body).byteLength>200000)throw new DomainError('Request exceeds the permitted size.',413);const data=JSON.parse(body);if(!data||typeof data!=='object'||Array.isArray(data))throw new DomainError('Invalid request body.');return data;}
export async function signedIn(){const user=await getChatGPTUser();if(!user)throw new DomainError('Sign in to open your workspace.',401);return user;}
type MemberRow={organization_id:string;user_id:string;email:string;display_name:string;role:Role;project_roles:string;active:number};
export async function membershipsFor(userId:string){return (await database().prepare('SELECT m.*, o.name AS organization_name FROM memberships m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? AND m.active=1').bind(userId).all<MemberRow&{organization_name:string}>()).results;}
export async function context(request:Request,explicitOrganizationId?:string){
 const user=await signedIn(),db=database();let list=await membershipsFor(user.userId);
 if(!list.length){const at=new Date().toISOString();await db.batch([db.prepare('INSERT INTO organizations (id,owner_id,name,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(user.userId,user.userId,'My construction firm',at),db.prepare('INSERT INTO memberships (id,organization_id,user_id,email,display_name,role,project_roles,active) VALUES (?,?,?,?,?,?,?,1) ON CONFLICT(id) DO NOTHING').bind(user.userId+':'+user.userId,user.userId,user.userId,user.email.toLowerCase(),user.displayName,'admin','{}')]);list=await membershipsFor(user.userId);}
 const org=explicitOrganizationId||request.headers.get('x-organization-id')||new URL(request.url).searchParams.get('org')||list[0]?.organization_id;
 const member=list.find(m=>m.organization_id===org);if(!member)throw new DomainError('You do not have access to this firm.',403);
 const actor:Actor={id:user.userId,name:user.displayName,email:user.email.toLowerCase(),role:member.role,projectRoles:JSON.parse(member.project_roles),organizationId:org};
 const row=await db.prepare('SELECT data,version FROM workspaces WHERE owner_id=?').bind(org).first<{data:string;version:number}>();
 const state=normalizeState(row?JSON.parse(row.data):emptyState());if(!row)state.firm=member.organization_name;
 return {user,actor,state,version:row?.version||0,organizations:list.map(m=>({id:m.organization_id,name:m.organization_name,role:m.role}))};
}
export async function commitState(organizationId:string,state:SuiteState,version:number){const db=database(),at=new Date().toISOString();const result=version?await db.prepare('UPDATE workspaces SET data=?,version=version+1,updated_at=? WHERE owner_id=? AND version=?').bind(JSON.stringify(state),at,organizationId,version).run():await db.prepare('INSERT INTO workspaces (owner_id,data,version,updated_at) VALUES (?,?,1,?) ON CONFLICT(owner_id) DO NOTHING').bind(organizationId,JSON.stringify(state),at).run();if(result.meta.changes!==1)throw new DomainError('Another device saved changes. Refresh and review the latest records before retrying.',409);}
export async function digest(value:string|ArrayBuffer):Promise<string>{const bytes=typeof value==='string'?new TextEncoder().encode(value):value;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export function randomToken():string{return Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');}
