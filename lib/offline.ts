import type { Command } from './domain';
import type { Actor } from './suite-types';
export type UploadAttachment={field:string;file:Blob;name:string;category:string;location?:Record<string,unknown>;uploadedId?:string};
export type PendingCommand={key:string;organizationId:string;userId:string;command:Command;attachments:UploadAttachment[];queuedAt:string;status:'pending'|'needs-review';error?:string};
const permitted=new Set(['attendance.save','expense.create','delivery.submit','media.capture']);
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const req=indexedDB.open('coreconstruct-field-v1',1);req.onupgradeneeded=()=>{req.result.createObjectStore('commands',{keyPath:'key'});req.result.createObjectStore('reference',{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function transaction<T>(store:string,mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),req=fn(tx.objectStore(store));let value:T;req.onsuccess=()=>{value=req.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};tx.onabort=()=>{db.close();reject(tx.error);};});}
export async function enqueue(item:PendingCommand){if(!permitted.has(item.command.type))throw new Error('Approvals, payments and client decisions require an online connection.');if(JSON.stringify(item.command).includes('nationalId')||JSON.stringify(item.command).includes('mpesaPhone'))throw new Error('Protected identity data cannot be stored in the offline queue.');await transaction('commands','readwrite',s=>s.put(item));}
export async function pending(userId:string,organizationId:string):Promise<PendingCommand[]>{const all=await transaction('commands','readonly',s=>s.getAll()) as PendingCommand[];return all.filter(i=>i.userId===userId&&i.organizationId===organizationId).sort((a,b)=>a.queuedAt.localeCompare(b.queuedAt));}
export async function removePending(key:string){await transaction('commands','readwrite',s=>s.delete(key));}
export async function updatePending(item:PendingCommand){await transaction('commands','readwrite',s=>s.put(item));}
export async function saveReference(key:string,value:unknown){await transaction('reference','readwrite',s=>s.put({key,value,at:Date.now()}));}
export async function readReference<T>(key:string):Promise<T|null>{const row=await transaction('reference','readonly',s=>s.get(key)) as {value:T;at:number}|undefined;return row&&Date.now()-row.at<24*3600000?row.value:null;}
export const isQueueable=(type:string)=>permitted.has(type);

type FieldScope = Pick<Actor, 'id' | 'organizationId'>;

export const fieldHeaders = (scope: FieldScope) => ({
  'x-organization-id': scope.organizationId,
  'x-coreconstruct-user': scope.id,
});

export class FieldRequestError extends Error {
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.retryable = status >= 500 || [401, 408, 425, 429].includes(status) || code === 'workspace_version_conflict';
  }
  readonly retryable: boolean;
}

export async function requireFieldResponse(response: Response, fallback: string) {
  if (response.ok) return;
  const error = await response.json().catch(() => null) as { error?: string; code?: string } | null;
  throw new FieldRequestError(error?.error || fallback, response.status, error?.code);
}

export async function uploadAttachments(
  request: typeof fetch,
  operation: Command,
  attachments: UploadAttachment[],
  scope: FieldScope,
  checkpoint?: () => Promise<void>,
) {
  for (const attachment of attachments) {
    if (!attachment.uploadedId) {
      const form = new FormData();
      form.set('file', attachment.file, attachment.name);
      form.set('projectId', attachment.category === 'branding' ? '' : String(operation.payload.projectId || ''));
      form.set('category', attachment.category);
      form.set('location', JSON.stringify(attachment.location || {}));
      form.set('uploadKey', operation.id + '.' + attachment.field);
      const response = await request('/api/files', { method: 'POST', headers: fieldHeaders(scope), body: form });
      await requireFieldResponse(response, 'Evidence upload failed.');
      const value = await response.json() as { file?: { id?: string } };
      if (!value.file?.id) throw new Error('The upload has not been confirmed.');
      attachment.uploadedId = value.file.id;
      operation.payload[attachment.field] = attachment.uploadedId;
      await checkpoint?.();
    } else {
      operation.payload[attachment.field] = attachment.uploadedId;
    }
  }
}

export async function syncPendingDrafts(request: typeof fetch, scope: FieldScope) {
  let saved = 0;
  let needsReview = 0;
  let stopped = '';
  for (const item of await pending(scope.id, scope.organizationId)) {
    if (item.status === 'needs-review') continue;
    try {
      await uploadAttachments(request, item.command, item.attachments, scope, () => updatePending(item));
      const response = await request('/api/workspace', {
        method: 'POST',
        headers: { ...fieldHeaders(scope), 'Content-Type': 'application/json' },
        body: JSON.stringify(item.command),
      });
      await requireFieldResponse(response, 'Review this draft.');
      const value = await response.json() as { actor?: FieldScope; version?: number };
      if (value.actor?.id !== scope.id || value.actor.organizationId !== scope.organizationId || typeof value.version !== 'number') {
        throw new Error('The save has not been confirmed.');
      }
      await removePending(item.key);
      saved++;
    } catch (error) {
      if (error instanceof FieldRequestError && !error.retryable) {
        await updatePending({ ...item, status: 'needs-review', error: error.message });
        needsReview++;
        continue;
      }
      stopped = error instanceof FieldRequestError ? error.message : 'The connection stopped before the save could be confirmed.';
      break;
    }
  }
  return { saved, needsReview, stopped };
}
