import { DomainError, type Command } from './domain';
import { detailDefaults, enabled, get, normalizeState, projectFinancials } from './suite';
import type { Actor, Module, Role, SuiteState } from './suite-types';

export function projectForCommand(s:SuiteState,c:Command):string|undefined {
 const p=c.payload;
 // Resolve only the identifier used by this operation. Unrelated extra fields cannot choose the authorization project.
 if(c.type==='payment.record')return p.targetType==='wagebill'?get(s.wagebills,p.targetId,'Wagebill').projectId:get(s.expenses,p.targetId,'Expense').projectId;
 const rules:Record<string,[string,{id:string;projectId:string}[]]>={
 'wagebill.approve':['billId',s.wagebills],'wagebill.return':['billId',s.wagebills],
 'expense.approve':['expenseId',s.expenses],'expense.return':['expenseId',s.expenses],'expense.revise':['expenseId',s.expenses],
 'attendance.remove':['attendanceId',s.attendance],'advance.reverse':['advanceId',s.advances],'payment.reverse':['paymentId',s.payments],
 'boq.progress':['boqId',s.suite.boq],'stock.return':['movementId',s.suite.stock],
 };
 const collections:Record<string,[string,{id:string;projectId:string}[]]>={order:['orderId',s.suite.orders],delivery:['deliveryId',s.suite.deliveries],invoice:['invoiceId',s.suite.invoices],drawing:['drawingId',s.suite.drawings],design:['drawingId',s.suite.drawings],media:['mediaId',s.suite.media],variation:['variationId',s.suite.variations],receipt:['receiptId',s.suite.receipts],action:['actionId',s.suite.actions],milestone:['milestoneId',s.suite.milestones]};
 const [prefix,operation]=c.type.split('.');let rule=rules[c.type];
 if(!rule&&collections[prefix]&&!['create','add','capture','issue','submit'].includes(operation))rule=collections[prefix];
 // Drawing issue uses an existing record, whereas receipt issue creates a new one.
 if(c.type==='drawing.issue')rule=collections.drawing;
 if(c.type==='delivery.submit'||c.type==='invoice.submit')rule=collections.order;
 if(rule)return get(rule[1],p[rule[0]],rule[0]).projectId;
 return typeof p.projectId==='string'?get(s.projects,p.projectId,'Project').id:undefined;
}
export function roleFor(actor:Actor,projectId?:string):Role { if(actor.role==='admin')return 'admin';if(!projectId)return actor.role;const role=actor.projectRoles[projectId];if(!role)throw new DomainError('You are not assigned to this project.',403);return role; }
const moduleFor:Record<string,Module>={design:'design',drawing:'design',boq:'boq',worker:'wages',attendance:'wages',wagebill:'wages',advance:'wages',piecework:'wages',material:'materials',order:'materials',delivery:'materials',stock:'materials',invoice:'materials',variation:'variations',receipt:'portal',media:'portal',report:'portal',milestone:'portal'};
const grants:Record<Role,Set<string>>={
 admin:new Set(['*']),
 pm:new Set(['project.update','project.configure','worker.create','worker.register','worker.update','worker.identity.set','attendance.save','attendance.remove','wagebill.submit','wagebill.approve','wagebill.return','advance.create','advance.reverse','piecework.approve','expense.create','expense.revise','expense.approve','expense.return','payment.record','payment.reverse','report.save','report.publish','boq.import','boq.progress','material.create','order.create','order.revise','order.approve','order.return','delivery.submit','delivery.approve','delivery.return','stock.move','stock.return','invoice.submit','invoice.approve','invoice.return','invoice.revise','invoice.reverse','drawing.add','drawing.issue','drawing.publish','drawing.acknowledge','media.capture','media.publish','variation.create','variation.revise','variation.send','variation.withdraw','variation.recordClientDecision','receipt.issue','action.create','action.close','milestone.create','milestone.certify']),
 architect:new Set(['drawing.add','drawing.issue','drawing.acknowledge','media.capture','action.create','action.close','project.brief.update']),
 foreman:new Set(['worker.create','worker.register','attendance.save','attendance.remove','wagebill.submit','expense.create','expense.revise','delivery.submit','stock.move','stock.return','drawing.acknowledge','media.capture','action.create','action.close']),
 client:new Set(['variation.decide','design.accept']),
};
export function authorize(s:SuiteState,c:Command,actor:Actor):void {
 const pid=projectForCommand(s,c),role=roleFor(actor,pid);
 if(role!=='admin'&&!grants[role].has(c.type))throw new DomainError('Your role does not permit this action.',403);
 const mod=moduleFor[c.type.split('.')[0]];if(mod&&!(pid?enabled(s,pid,mod):s.suite.modules[mod]))throw new DomainError('This module is disabled for the firm or project.',403);
 if(c.type==='stock.move'&&role==='foreman'&&!['issue','wastage'].includes(String(c.payload.kind)))throw new DomainError('Stock adjustments and transfers require PM approval.',403);
 if(c.type==='stock.move'&&c.payload.kind==='transfer'&&c.payload.targetProjectId&&!['admin','pm'].includes(roleFor(actor,String(c.payload.targetProjectId))))throw new DomainError('A stock transfer requires office access to both projects.',403);
 if(c.type==='action.close'&&role==='foreman'){const a=get(s.suite.actions,c.payload.actionId,'Action');if(a.owner.toLowerCase()!==actor.email.toLowerCase()&&a.owner!==actor.name)throw new DomainError('Only the responsible person or PM may close this action.',403);}
}
export function filterState(original:SuiteState,actor:Actor):SuiteState {
 const s=structuredClone(original),assigned=new Set(s.projects.filter(p=>actor.role==='admin'||!!actor.projectRoles[p.id]).map(p=>p.id));
 s.projects=s.projects.filter(p=>assigned.has(p.id));
 const financial=(pid:string)=>['admin','pm'].includes(roleFor(actor,pid)),field=(pid:string)=>['admin','pm','foreman'].includes(roleFor(actor,pid)),design=(pid:string)=>['admin','pm','architect','foreman'].includes(roleFor(actor,pid));
 for(const p of s.projects){const role=roleFor(actor,p.id);if(!financial(p.id)){p.budgetCents=0;if(role!=='client')p.contractCents=0;}const d=s.suite.projectDetails[p.id];if(d&&!financial(p.id)){d.forecastRemainingCents=0;d.managementFeeBps=0;if(role==='foreman'){d.clientEmail='';d.clientPhone='';}}}
 const ids=<T extends {projectId:string}>(items:T[],allowed:(pid:string)=>boolean=()=>true)=>items.filter(x=>assigned.has(x.projectId)&&allowed(x.projectId));
 s.attendance=ids(s.attendance,field);s.wagebills=ids(s.wagebills,field);s.expenses=ids(s.expenses,field);s.advances=ids(s.advances,financial);s.payments=ids(s.payments,financial);
 const staffAllowed=s.projects.some(p=>field(p.id))||actor.role==='admin';if(!staffAllowed)s.workers=[];
 s.reports=ids(s.reports,pid=>roleFor(actor,pid)!=='client').concat(ids(original.reports,pid=>roleFor(actor,pid)==='client').filter(r=>s.suite.publishedWeeks[r.projectId+':'+r.weekStart]===r.updatedAt));s.suite.boq=ids(s.suite.boq,field).map(b=>financial(b.projectId)?b:{...b,clientRateCents:0,allowanceCents:0,labourAllowanceCents:0});s.suite.orders=ids(s.suite.orders,field);s.suite.deliveries=ids(s.suite.deliveries,field);s.suite.stock=ids(s.suite.stock,field);s.suite.invoices=ids(s.suite.invoices,financial);
 s.suite.drawings=ids(s.suite.drawings,design);s.suite.media=ids(s.suite.media,design);s.suite.variations=ids(s.suite.variations,pid=>roleFor(actor,pid)!=='client').map(v=>financial(v.projectId)?v:{...v,internalDeltaCents:0,externalEvidence:undefined,decisionNote:undefined});s.suite.receipts=ids(s.suite.receipts,financial);s.suite.milestones=ids(s.suite.milestones,financial);s.suite.actions=ids(s.suite.actions,pid=>roleFor(actor,pid)!=='client');
 s.suite.projectDetails=Object.fromEntries(Object.entries(s.suite.projectDetails).filter(([pid])=>assigned.has(pid)).map(([pid,d])=>[pid,roleFor(actor,pid)==='client'?{...detailDefaults(),latitude:d.latitude,longitude:d.longitude,currency:d.currency,fxKesPerUnit:d.fxKesPerUnit,fxAsOf:d.fxAsOf}:d]));s.suite.identities={};s.suite.commandFingerprints={};s.commandIds=[];if(!staffAllowed)s.suite.materials=[];
 s.suite.piecework=ids(s.suite.piecework,field);s.suite.appliedPiecework={};s.suite.publishedWeeks=Object.fromEntries(Object.entries(s.suite.publishedWeeks).filter(([key])=>assigned.has(key.split(':')[0])));s.suite.designAcceptances=s.suite.designAcceptances.filter(a=>s.suite.drawings.some(d=>d.id===a.drawingId));s.suite.acknowledgements=s.suite.acknowledgements.filter(a=>s.suite.drawings.some(d=>d.id===a.drawingId));
 // Previous snapshots may contain confidential historical values; only administrators get the full audit trail.
 s.audit=actor.role==='admin'?s.audit:s.audit.filter(a=>a.projectId&&assigned.has(a.projectId)&&roleFor(actor,a.projectId)!=='client').map(a=>({...a,before:undefined,description:financial(a.projectId!)?a.description:a.action.replaceAll('.',' ')}));
 return s;
}
export function clientView(original:SuiteState,projectId:string){
 const s=normalizeState(original),p=get(s.projects,projectId,'Project'),d=s.suite.projectDetails[p.id]||detailDefaults();if(!enabled(s,p.id,'portal'))throw new DomainError('Client access is disabled for this project.',403);
 const f=projectFinancials(s,p.id),reports=s.reports.filter(r=>r.projectId===p.id&&s.suite.publishedWeeks[p.id+':'+r.weekStart]===r.updatedAt);
 const latest=reports.slice().sort((a,b)=>b.weekStart.localeCompare(a.weekStart))[0];
 const figures=p.mode==='fixed'?{contractCents:f.contract,receivedCents:f.clientReceived,balanceCents:f.contractBalance}: {approvedCostsCents:f.incurred,managementFeeCents:f.fee,totalCents:f.openBookClientTotal,receivedCents:f.clientReceived,balanceCents:f.openBookClientTotal-f.clientReceived};
 return {firm:s.firm,brand:{primary:s.suite.brand.primary,accent:s.suite.brand.accent,logoFileId:s.suite.brand.logoFileId,address:s.suite.brand.address,phone:s.suite.brand.phone,email:s.suite.brand.email},project:{id:p.id,name:p.name,location:p.location,client:p.client,stage:latest?.stage||'Awaiting published update',progress:latest?.progress||0,mode:p.mode,estimatedCompletion:f.estimatedCompletion,latitude:d.latitude,longitude:d.longitude,currency:d.currency,fxKesPerUnit:d.fxKesPerUnit,fxAsOf:d.fxAsOf,clientTimezone:d.clientTimezone},figures,reports,drawings:enabled(s,p.id,'design')?s.suite.drawings.filter(x=>x.projectId===p.id&&x.status==='current'&&x.published).map(x=>({id:x.id,title:x.title,sheetCode:x.sheetCode,revision:x.revision,fileId:x.fileId,issuedAt:x.issuedAt,designAccepted:s.suite.designAcceptances.some(a=>a.drawingId===x.id)})):[],media:s.suite.media.filter(x=>x.projectId===p.id&&x.published).map(x=>({id:x.id,fileId:x.fileId,contentType:x.contentType,caption:x.caption,stage:x.stage,createdAt:x.createdAt,locationStatus:x.location.status})),receipts:s.suite.receipts.filter(x=>x.projectId===p.id).map(r=>({id:r.id,number:r.number,title:r.title,amountCents:r.amountCents,date:r.date,voided:!!r.voidedAt})),variations:enabled(s,p.id,'variations')?s.suite.variations.filter(x=>x.projectId===p.id&&x.status!=='draft').map(v=>({id:v.id,number:v.number,title:v.title,description:v.description,revision:v.revision,amountCents:v.clientDeltaCents,days:v.days,affectsCompletion:v.affectsCompletion,programmeReason:v.programmeReason,status:v.status,decisionAt:v.decisionAt})):[],milestones:s.suite.milestones.filter(x=>x.projectId===p.id&&x.status==='certified').map(x=>({id:x.id,title:x.title,amountCents:x.amountCents,dueDate:x.dueDate})),modules:{design:enabled(s,p.id,'design'),variations:enabled(s,p.id,'variations')}};
}
export function moduleForCommand(type:string):Module|undefined{return moduleFor[type.split('.')[0]];}
