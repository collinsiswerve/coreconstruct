'use client';
import { useEffect, useRef, useState } from 'react';
import { LayoutDashboard, UsersRound, ClipboardList, CreditCard, Wallet, ReceiptText, BarChart3, Settings2, Plus, ChevronDown, ChevronRight, ArrowUpRight, ArrowDownLeft, Check, CheckCircle2, Clock3, MapPin, HardHat, Building2, X, Download, Printer, AlertCircle, CalendarDays, Menu, Search, FileText, ShieldCheck, LogOut, CircleHelp, ArrowRight, Sparkles, ExternalLink, LoaderCircle } from 'lucide-react';
import { addDays, buildWageEntries, dateKey, displayDate, emptyState, kes, monday, paidFor, totals, validDate, workerOnProject, type Command, type Expense, type State, type Wagebill } from '../lib/domain';
import { makeCsv } from '../lib/export';
import { brandForeground, compactKes, fullDate } from '../lib/display';
import { Badge, Empty, Status } from './ui';
import { AccountSignOut } from './account-sign-out';
import { useWorkspaceRuntime } from './workspace-runtime';
import { ProjectFinance, SampleProjectComparison } from './project-finance';
import { canViewProfit, canViewProjectFinance, reviewFigures } from '../lib/project-finance';
import { isFinanceSample, sampleProjectCount } from '../lib/sample-projects';
import { isSupplierInvoiceCost } from '../lib/procurement';
import { clientUpdatesSampleId } from '../lib/sample-client-updates';
import { WeeklyDownloads } from './weekly-downloads';
import { WeeklyClose } from './weekly-close';
import { PilotScorecard } from './pilot-scorecard';
import { SubscriptionBillingPanel } from './subscription-billing';
import { WorkspaceBackup } from './workspace-backup';
import { PortfolioPanel } from './portfolio-panel';
import { WorkspaceSetup } from './onboarding';
import { operationsSampleId } from '../lib/sample-operations';
import { OperationsTotals } from './operations-review';
import { Modal, type Dialog } from './workspace-modal';
import { SuitePanels, type SuiteView } from './suite-panels';
import { normalizeState, enabled, projectFinancials } from '../lib/suite';
import type { Actor, Module, SuiteState } from '../lib/suite-types';
import { enqueue, pending, removePending, isQueueable, saveReference, readReference, fieldHeaders, FieldRequestError, requireFieldResponse, uploadAttachments, syncPendingDrafts, type PendingCommand, type UploadAttachment } from '../lib/offline';
type WorkspaceResponse = { state: SuiteState; version: number; actor: Actor; organizations?: {id:string;name:string;role:string}[]; user?: { name: string; email: string }; error?: string;operationApplied?:boolean };
type View = 'billing' | 'onboarding' | 'portfolio' | 'finance' | 'overview' | 'attendance' | 'wagebills' | 'expenses' | 'reports' | 'people' | 'settings' | SuiteView;
const nav = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'finance', label: 'Project finance', icon: Wallet }, { id: 'site', label: 'Site & brief', icon: MapPin }, { id: 'design', label: 'Drawings & evidence', icon: FileText }, { id: 'boq', label: 'BOQ & allowances', icon: ClipboardList }, { id: 'attendance', label: 'Attendance', icon: UsersRound }, { id: 'wagebills', label: 'Wagebills', icon: Wallet }, { id: 'expenses', label: 'Expenses', icon: ReceiptText }, { id: 'materials', label: 'Materials & store', icon: Building2 }, { id: 'variations', label: 'Variations', icon: FileText }, { id: 'reports', label: 'Weekly report', icon: BarChart3 }, { id: 'client-portal', label: 'Client trust portal', icon: ShieldCheck }] as const;
function download(name: string, body: string, type: string) { const url = URL.createObjectURL(new Blob([body], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); }
const views: readonly View[] = ['overview', 'portfolio', 'finance', 'site', 'design', 'boq', 'attendance',
  'wagebills', 'expenses', 'materials', 'variations', 'reports', 'client-portal', 'pilot', 'onboarding',
  'team', 'people', 'billing', 'settings', 'configuration'];

function workspaceLocation() {
  const search = new URLSearchParams(window.location.search);
  const requested = search.get('view') as View | null;
  const day = search.get('week');
  let week: string | undefined;
  if (day) {
    try { week = monday(validDate(day)); } catch { /* Fall back to the default reporting week. */ }
  }
  return { view: requested && views.includes(requested) ? requested : null, project: search.get('project'), week };
}

function workspaceUrl(view: View, project: string, week: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  if (project) url.searchParams.set('project', project);
  else url.searchParams.delete('project');
  url.searchParams.set('week', week);
  return url.pathname + url.search;
}
export default function Workspace() {
  const { request: fetch, href, demo } = useWorkspaceRuntime();
  const homeView = demo?.billing ? 'billing' : demo?.onboarding ? 'onboarding' : demo?.scorecard ? 'pilot'
    : demo?.portfolio ? 'portfolio' : 'overview';
  const [state, setState] = useState<SuiteState>(() => normalizeState({...emptyState(), ...(demo && {firm: 'Archi-Hub Studio · Demo'})})), [loading, setLoading] = useState(true), [error, setError] = useState(''), [saving, setSaving] = useState(false), [toast, setToast] = useState('');
  const [view, setView] = useState<View>(() => homeView === 'billing' ? 'billing' : demo ? workspaceLocation().view ?? homeView : homeView), [projectId, setProjectId] = useState(''), [week, setWeek] = useState(monday()), [search, setSearch] = useState(''), [dialog, setDialog] = useState<Dialog>(null), [menu, setMenu] = useState(false), [clientCopy, setClientCopy] = useState(false), [user, setUser] = useState({ name: 'Workspace owner', email: '' });
  const [actor,setActor]=useState<Actor|null>(null),[organizations,setOrganizations]=useState<{id:string;name:string;role:string}[]>([]),[online,setOnline]=useState(true),[outbox,setOutbox]=useState<PendingCommand[]>([]),[syncing,setSyncing]=useState(false);
  const orgRef=useRef(''), pendingBody=useRef(''),pendingOperation=useRef<Command|null>(null),pendingAttachments=useRef<UploadAttachment[]>([]);
  const pendingScope = useRef<Actor | null>(null);
  const refreshSequence = useRef(0);
  const openedWorkspace = useRef('');
  const [setupReturn, setSetupReturn] = useState(false);
  const inflight = useRef(false), requestKey = useRef<string | null>(null);
  const project = state.projects.find(p => p.id === projectId) || state.projects[0], selected = project?.id || '', end = addDays(week, 6);
  const role=actor?.role==='admin'?'admin':actor?.projectRoles[selected]||actor?.role||'client', office=['admin','pm'].includes(role), canFinance=office&&online;
  const sampleCount = state.projects.filter(isFinanceSample).length;
  const portfolio = demo?.portfolio;
  const projectKey = demo?.onboarding ? 'cc-m7-setup-project' : demo?.scorecard ? 'cc-m7-scorecard-project' : portfolio ? 'cc-m6-selected-project' : demo ? 'cc-demo-selected-project' : 'cc-pilot-project';
  const canSetup = actor?.role === 'admin' && (!demo || demo.onboarding);
  const canBilling = actor?.role === 'admin' && (!demo || !!demo.billing);
  const operationsSample = state.projects.find(p => p.id === operationsSampleId);
  const updatesSample = state.projects.find(p => p.id === clientUpdatesSampleId);
  const updateWeek = state.reports.find(note => note.id === clientUpdatesSampleId + ':report')?.weekStart;
  const sampleWeek = operationsSample && addDays(monday(dateKey(new Date(operationsSample.createdAt))), -7);
  const viewModule:Partial<Record<View,Module>>={design:'design',boq:'boq',attendance:'wages',wagebills:'wages',people:'wages',materials:'materials',variations:'variations','client-portal':'portal',reports:'portal'};
  function visible(v:View){if(v==='billing')return canBilling;if(demo?.billing)return false;if(v==='onboarding'||v==='team')return !!canSetup;if(v==='settings'||v==='configuration')return actor?.role==='admin';if(v==='portfolio')return !!portfolio&&['admin','pm'].includes(role);if(v==='finance')return canViewProjectFinance(role);if(role==='finance'||role==='accounts')return v==='overview';const mod=viewModule[v];if(mod&&!(selected?enabled(state,selected,mod):state.suite.modules[mod]))return false;if(role==='client')return v==='overview';if(role==='architect')return ['overview','site','design','pilot'].includes(v);if(role==='foreman')return !['boq','variations','client-portal','settings','team'].includes(v);return true;}
  const financials=project?projectFinancials(state,selected):null;
  const summary = totals(state, selected), workers = state.workers.filter(w => project ? workerOnProject(w, project) : !w.demo), activeWorkers = workers.filter(w => w.active);
  const attendance = state.attendance.filter(a => a.projectId === selected && a.date >= week && a.date <= end);
  const bills = state.wagebills.filter(b => b.projectId === selected).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const expenses = state.expenses.filter(e => e.projectId === selected).sort((a, b) => b.date.localeCompare(a.date));
  const projectAdvances = state.advances.filter(advance => advance.projectId === selected);
  const approvedBills = bills.filter(bill => bill.status === 'approved');
  const wagePayments = approvedBills.reduce((sum, bill) => sum + paidFor(state, 'wagebill', bill.id), 0);
  const pendingBills = bills.filter(b => b.status === 'submitted'), pendingExpenses = expenses.filter(e => e.status === 'submitted'), weekRows = buildWageEntries(state, selected, week);
  const reportingNote = state.reports.find(r => r.projectId === selected && r.weekStart === week);
  const updatePublished = !!reportingNote && state.suite.publishedWeeks[selected + ':' + week] === reportingNote.updatedAt;
  const clientUpdateEndpoint = '/api/client-view?' + new URLSearchParams({ projectId: selected, org: actor?.organizationId || '' });
  const audit = state.audit.filter(a => !a.projectId || a.projectId === selected).slice().reverse();
  function clearSave() {
    requestKey.current = null;
    pendingBody.current = '';
    pendingOperation.current = null;
    pendingAttachments.current = [];
    pendingScope.current = null;
  }
  async function refresh() {
    const sequence = ++refreshSequence.current;
    const scope = pendingScope.current;
    const operationId = requestKey.current;
    setError('');
    try {
      const path = '/api/workspace' + (scope && operationId ? '?operationId=' + encodeURIComponent(operationId) : '');
      const headers: Record<string,string> = scope ? fieldHeaders(scope) : orgRef.current ? {'x-organization-id':orgRef.current} : {};
      let r = await fetch(path,{cache:'no-store',headers});
      if(r.status===403 && orgRef.current && !scope)r=await fetch('/api/workspace',{cache:'no-store'});
      const data=await r.json() as WorkspaceResponse;
      if (sequence !== refreshSequence.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          sessionStorage.removeItem('cc-field-session');
          setActor(null);setOutbox([]);setState(normalizeState(emptyState()));setDialog(null);
        }
        throw new Error(data.error||'Unable to open the workspace.');
      }
      if(operationId===requestKey.current&&data.operationApplied&&scope?.id===data.actor.id&&scope.organizationId===data.actor.organizationId){
        clearSave();setDialog(null);setToast('The previous save is confirmed on the server.');
      }
      const next=normalizeState(data.state);setState(next);setActor(data.actor);orgRef.current=data.actor.organizationId;if(!demo)localStorage.setItem('cc-organization',orgRef.current);if(data.organizations)setOrganizations(data.organizations);if(data.user)setUser(data.user);setOnline(true);
      if (demo) return;
      if (openedWorkspace.current !== data.actor.organizationId) {
        openedWorkspace.current = data.actor.organizationId;
        if (data.actor.role === 'admin' && !workspaceLocation().view && !next.projects.length) setView('onboarding');
      }
      const key=data.actor.id+':'+data.actor.organizationId;
      sessionStorage.removeItem('cc-field-session');
      const reference=normalizeState(emptyState());
      reference.firm=next.firm;
      reference.projects=next.projects.map(p=>({...p,budgetCents:0,contractCents:0,opening:undefined,openingCash:undefined,summary:undefined,nextSteps:undefined,risks:undefined}));
      // Keep the row version inputs used by attendance and the rate used at capture.
      reference.workers=next.workers;
      reference.attendance=next.attendance.filter(a=>a.date>=addDays(dateKey(),-14));
      reference.suite.boq=next.suite.boq.map(b=>({...b,clientRateCents:0,allowanceCents:0,labourAllowanceCents:0}));
      reference.suite.brand=next.suite.brand;reference.suite.modules=next.suite.modules;
      reference.suite.projectDetails=Object.fromEntries(Object.entries(next.suite.projectDetails).map(([id,d])=>[id,{...d,forecastRemainingCents:0,managementFeeBps:0,clientPhone:'',clientEmail:'',brief:''}]));
      reference.suite.orders=next.suite.orders.filter(o=>o.status==='approved').map(o=>({...o,totalCents:0,lines:o.lines.map(line=>({...line,rateCents:0}))}));
      reference.suite.materials=next.suite.materials;
      reference.suite.drawings=next.suite.drawings.filter(d=>d.status==='current');
      try {
        await saveReference(key,{state:reference,actor:data.actor,user:data.user});
        const drafts = await pending(data.actor.id,data.actor.organizationId);
        if (sequence === refreshSequence.current) {
          sessionStorage.setItem('cc-field-session',key);
          setOutbox(drafts);
        }
      } catch {
        if (sequence === refreshSequence.current) setError('This browser could not store offline reference data or load drafts.');
      }
    }catch(e){
      if(sequence!==refreshSequence.current)return;
      setError(e instanceof Error?e.message:'Unable to connect.');
      if (!demo && !navigator.onLine) {
        setOnline(false);
        const key=sessionStorage.getItem('cc-field-session');
        if (key) {
          const cached=await readReference<{state:SuiteState;actor:Actor;user:{name:string;email:string}}>(key).catch(()=>null);
          if(cached){
            const drafts = await pending(cached.actor.id,cached.actor.organizationId).catch(()=>[]);
            if(sequence!==refreshSequence.current)return;
            setState(cached.state);setActor(cached.actor);if(cached.user)setUser(cached.user);
            orgRef.current=cached.actor.organizationId;setOutbox(drafts);
            setError('Offline reference view. Financial totals are unavailable. Site drafts can be saved to the offline inbox.');
          }
        }
      }
    }finally{if(sequence===refreshSequence.current)setLoading(false);}
  }
  async function syncInbox() {
    if (!actor || inflight.current || requestKey.current || !navigator.onLine) return;
    inflight.current=true;setSyncing(true);setSaving(true);
    try {
      const result = await syncPendingDrafts(fetch, actor);
      await refresh();
      if (result.stopped) setError(result.stopped + ' Unconfirmed drafts are still in the offline inbox.');
      if (result.saved || result.needsReview) setToast(`${result.saved} synced · ${result.needsReview} need review`);
    } catch {
      setError('This browser could not read or update the offline inbox.');
    } finally {inflight.current=false;setSyncing(false);setSaving(false);}
  }

  useEffect(() => {
    orgRef.current = demo ? '' : localStorage.getItem('cc-organization') || '';
    setOnline(!!demo || navigator.onLine);
    function restoreLocation() {
      const route = workspaceLocation();
      setView(homeView === 'billing' ? 'billing' : route.view ?? homeView);
      setProjectId(route.project || localStorage.getItem(projectKey) || demo?.scorecard?.projectId || '');
      if (route.week) setWeek(route.week);
      setSearch('');
      setMenu(false);
    }
    restoreLocation();
    window.addEventListener('popstate', restoreLocation);
    void refresh();
    return () => window.removeEventListener('popstate', restoreLocation);
  }, []);
  useEffect(()=>{const up=()=>{setOnline(true);void refresh();},down=()=>setOnline(!!demo);window.addEventListener('online',up);window.addEventListener('offline',down);if(!demo && 'serviceWorker'in navigator)void navigator.serviceWorker.register('/sw.js').catch(()=>{});return()=>{window.removeEventListener('online',up);window.removeEventListener('offline',down);};},[]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.suite.brand.theme;
    document.documentElement.style.setProperty('--brand-primary', state.suite.brand.primary);
    document.documentElement.style.setProperty('--brand-foreground', brandForeground(state.suite.brand.primary));
  }, [state.suite.brand.primary, state.suite.brand.theme]);
  useEffect(() => { if (projectId) localStorage.setItem(projectKey, projectId); }, [projectId, projectKey]);
  useEffect(() => {
    if (!portfolio || !selected || workspaceLocation().week) return;
    const latest = state.reports.filter(report => report.projectId === selected).map(report => report.weekStart).sort().at(-1);
    if (latest) setWeek(latest);
  }, [portfolio, selected, state.reports.length]);
  useEffect(() => {
    if (loading || !actor) return;
    const permitted = visible(view) || view === 'billing';
    if (!permitted) {
      setView('overview');
      return;
    }
    const address = workspaceUrl(view, selected, week);
    if (address !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, '', address + window.location.hash);
    }
  }, [actor, loading, selected, week, view, state.suite.modules, state.suite.projectDetails]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!dialog) return; const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !inflight.current) setDialog(null); }; document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler); }, [dialog]);
  async function command(type:string,payload:Record<string,unknown>,message='Saved to your workspace.',attachments:UploadAttachment[]=[], destination?: 'pilot') {
    const scope = pendingScope.current || actor;
    if(inflight.current||!scope)return false;
    if(['wagebill.approve','expense.approve'].includes(type)&&actor?.role==='admin'&&!payload.overrideReason){const record=type==='wagebill.approve'?state.wagebills.find(b=>b.id===payload.billId):state.expenses.find(e=>e.id===payload.expenseId);if((record as unknown as {submittedById?:string})?.submittedById===actor.id){open('approval-override',{type,payload});return false;}}
    if(type==='attendance.save'&&payload.expectedToken===undefined){const a=state.attendance.find(a=>a.projectId===payload.projectId&&a.workerId===payload.workerId&&a.date===payload.date);payload.expectedToken=a?JSON.stringify([a.id,a.units,a.rateCents,a.task]):'';}
    if(type==='attendance.remove'&&payload.expectedToken===undefined){const a=state.attendance.find(a=>a.id===payload.attendanceId);payload.expectedToken=a?JSON.stringify([a.id,a.units,a.rateCents,a.task]):'';}
    const intended=JSON.stringify({type,payload});if(requestKey.current&&pendingBody.current&&pendingBody.current!==intended){setError('The previous save has an unresolved result. Retry its original values first, or refresh and check the record before starting another entry.');return false;}
    inflight.current=true;setSaving(true);setError('');const id=requestKey.current||crypto.randomUUID();requestKey.current=id;pendingBody.current=intended;
    const operation:Command=pendingOperation.current||{id,type,payload:{...payload}};if(pendingOperation.current)attachments=pendingAttachments.current;else{pendingOperation.current=operation;pendingAttachments.current=attachments;pendingScope.current=scope;}
    async function queue(draftScope: Actor){
      if(!isQueueable(type))throw new Error('This action requires an online connection.');
      const {id:userId,organizationId}=draftScope;
      const item:PendingCommand={key:userId+':'+organizationId+':'+id,userId,organizationId,command:operation,attachments,queuedAt:new Date().toISOString(),status:'pending'};
      await enqueue(item);setOutbox(await pending(userId,organizationId));clearSave();
      setToast('Draft saved to the offline inbox. It is not yet on the server.');setDialog(null);return true;
    }
    try{
      if(!demo && !navigator.onLine){
        setOnline(false);
        if(!isQueueable(type)){clearSave();throw new Error('This action requires an online connection.');}
        return await queue(scope);
      }
      await uploadAttachments(fetch,operation,attachments,scope);
      const r=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',...fieldHeaders(scope)},body:JSON.stringify(operation)});
      await requireFieldResponse(r,'The record could not be saved.');
      const data = await r.json() as WorkspaceResponse;
      if(data.actor?.id!==scope.id||data.actor.organizationId!==scope.organizationId)throw new Error('The save has not been confirmed.');
      refreshSequence.current++;
      setState(normalizeState(data.state));setActor(data.actor);clearSave();
      if (type === 'demo.portfolio.load') {
        const firstSample = data.state.projects.find(isFinanceSample);
        if (firstSample) setProjectId(firstSample.id);
        go('finance');
      } else if (type === 'demo.operations.load') {
        const date = data.state.attendance.find(row => row.projectId === operationsSampleId)?.date;
        if (date) setWeek(monday(date));
        setProjectId(operationsSampleId);
        go(destination || 'wagebills');
      } else if (type === 'demo.client-updates.load') {
        const note = data.state.reports.find(item => item.id === clientUpdatesSampleId + ':report');
        if (note) setWeek(note.weekStart);
        setProjectId(clientUpdatesSampleId);
        go('design');
      } else if (type === 'project.create' || type === 'demo.load') {
        const created = data.state.projects.at(-1);
        if (created) setProjectId(created.id);
      }
      setToast(message);setDialog(null);return true;
    }catch(e){
      if (e instanceof FieldRequestError && !e.retryable) {
        clearSave();
        await refresh();
      } else if(!demo && !navigator.onLine&&isQueueable(type)){
        try{return await queue(scope);}catch(q){setError(q instanceof Error?q.message:'The offline draft could not be stored. Keep the form open.');return false;}
      }
      setError(e instanceof Error?e.message:'The record could not be saved.');return false;
    }
    finally{inflight.current=false;setSaving(false);}
  }

  function go(v: View, targetProject = selected, targetWeek = week) {
    if (v === 'onboarding') setSetupReturn(false);
    if (view !== v) {
      window.history.pushState(window.history.state, '', workspaceUrl(v, targetProject, targetWeek));
      window.scrollTo(0, 0);
    }
    setView(v);
    setSearch('');
    setMenu(false);
  }
  function chooseProject(id: string) {
    const latest = portfolio && state.reports.filter(report => report.projectId === id).map(report => report.weekStart).sort().at(-1);
    if (latest) setWeek(latest);
    setProjectId(id);
    return latest || week;
  }
  function goFromSetup(v: View, reportWeek?: string) {
    if (reportWeek) setWeek(reportWeek);
    setSetupReturn(true);
    go(v, selected, reportWeek ?? week);
  }
  function openSetupProject() {
    if (!project) { open('project'); return; }
    open('project-edit', { ...project, budget: String(project.budgetCents / 100), contract: String(project.contractCents / 100) });
  }
  function loadSampleProjects() {
    return command('demo.portfolio.load', {}, 'Sample projects are ready to compare.');
  }
  function openOperationsSample(destination: 'wagebills' | 'pilot' = 'wagebills') {
    if (!operationsSample) {
      void command('demo.operations.load', {}, 'Sample wage and procurement records are ready.', [], destination === 'pilot' ? destination : undefined);
      return;
    }
    setProjectId(operationsSample.id);
    if (sampleWeek) setWeek(sampleWeek);
    go(destination);
  }
  function openClientUpdatesSample() {
    if (!updatesSample) {
      void command('demo.client-updates.load', {}, 'Sample drawings and client update are ready.');
      return;
    }
    setProjectId(updatesSample.id);
    if (updateWeek) setWeek(updateWeek);
    go('design');
  }
  function goToSampleUpdate() {
    if (updateWeek) setWeek(updateWeek);
    setClientCopy(true);
    go('reports');
  }
  function open(kind: string, data?: Record<string, unknown>) { if(requestKey.current){setError('A save has an unresolved result. Retry the original form or refresh to confirm it before opening another entry.');return;}setError('');setDialog({ kind, data }); }
  function backup() { download(`coreconstruct-backup-${dateKey()}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), workspace: state }, null, 2), 'application/json'); setToast('Records exported. Keep the file in a private folder.'); }
  function exportCsv(kind: string) {
    let rows: unknown[][] = [];
    if (kind === 'attendance') rows = [['Date', 'Worker', 'Days', 'Daily rate KES', 'Cost KES', 'Task'], ...attendance.map(a => [a.date, state.workers.find(w => w.id === a.workerId)?.name, a.units / 2, (a.rateCents / 100).toFixed(2), (Math.round(a.rateCents * a.units / 2) / 100).toFixed(2), a.task])];
    if (kind === 'expenses') rows = [['Date', 'Description', 'Category', 'Cost KES', 'Status', 'Paid KES', 'Receipt reference'], ...expenses.map(e => [e.date, e.description, e.category, (e.amountCents / 100).toFixed(2), e.status, (paidFor(state, 'expense', e.id) / 100).toFixed(2), e.receiptRef])];
    if (kind === 'wagebills') rows = [['Week starting', 'Revision', 'Status', 'Worker', 'Days', 'Gross KES', 'Advances KES', 'Net KES'], ...bills.flatMap(b => b.entries.map(e => [b.weekStart, b.revision, b.status, e.name, e.units / 2, (e.grossCents / 100).toFixed(2), (e.advanceCents / 100).toFixed(2), (e.payableCents / 100).toFixed(2)]))];
    download(`coreconstruct-${kind}-${dateKey()}.csv`, makeCsv(rows), 'text/csv;charset=utf-8');
  }
  const requireProject = <Empty title="Start with one project" text="Create a project to record attendance, review costs and prepare your weekly report." action={<button className="btn primary" onClick={() => open('project')}><Plus size={16} />Create project</button>} />;
  function payButton(type: 'wagebill' | 'expense', item: Wagebill | Expense) { const total = type === 'wagebill' ? (item as Wagebill).payableCents : (item as Expense).amountCents, balance = total - paidFor(state, type, item.id); return !canFinance||item.status !== 'approved' ? null : balance > 0 ? <button className="btn small" onClick={() => open('payment', { targetType: type, targetId: item.id, balance })}>Record payment</button> : <Badge tone="green"><Check size={12} />Settled</Badge>; }
  const title = { billing: 'Subscription billing', onboarding: 'Workspace setup', portfolio: 'Project portfolio', finance: 'Project finance', overview: 'Project overview', attendance: 'Daily attendance', wagebills: 'Weekly wagebills', expenses: 'Site expenses', reports: 'Weekly report', people: 'Your site team', settings: 'Workspace settings',site:'Site & client brief',design:'Drawings & site evidence',boq:'BOQ & allowances',materials:'Materials & site store',variations:'Variations & decisions','client-portal':'Client trust portal',team:'Team & project access',pilot:'Pilot results',configuration:'Firm configuration' }[view];
  const desc = { billing: 'Rehearse the firm’s CoreConstruct subscription, from first invoice to renewal.', onboarding: 'Set up your firm and take the first project through a weekly close.', portfolio: 'Ten fictional projects started from 2022 to 2026. Review project records and open each client page.', finance: 'Project costs, client billing and tracked cash.', overview: '', attendance: '', wagebills: '', expenses: '', reports: '', people: 'Keep agreed rates and trade details in one place.', settings: 'Manage your firm, project details and data.',site:'The plot, agreed brief and open project actions.',design:'Issue the right revision. Publish reviewed evidence.',boq:'Connect the BOQ to actual resource costs.',materials:'Order, receive, match and issue with a traceable history.',variations:'The exact scope, price and time effect for every decision.','client-portal':'A published view that respects your contract model.',team:'Give each person the access their project needs.',pilot:'Review weekly closes and compare pilot measurements with your existing process.',configuration:'Firm branding and modules.' }[view];
  const financeReview = role === 'admin' ? state.suite.finance.reviews[selected] : undefined;
  const forecast = financeReview ? reviewFigures(financeReview).forecastProfit : null;
  const firmLabel = demo ? state.firm.split(' · ')[0] : state.firm;
  const hasContext = !loading && view !== 'billing' && view !== 'portfolio' && view !== 'configuration' && (view !== 'onboarding' || !!project);
  const pendingReview = pendingBills.length + pendingExpenses.length;
  const saveStatus = error ? 'Needs review' : saving ? 'Saving…' : loading ? 'Opening workspace' : !online && outbox.length
    ? `${outbox.length} queued offline` : !online ? 'Offline' : demo ? 'Saved in this browser' : 'Private workspace';
  const siteViews: View[] = ['attendance', 'wagebills', 'expenses', 'materials'];
  const renderNav = (items: typeof nav[number][]) => items.filter(item => visible(item.id)).map(({ id, label, icon: Icon }) =>
    <button key={id} onClick={() => go(id)} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined}>
      <Icon size={18} aria-hidden="true" /><span>{label}</span>
      {id === 'wagebills' && pendingBills.length > 0 && <b>{pendingBills.length}</b>}
      {id === 'expenses' && pendingExpenses.length > 0 && <b>{pendingExpenses.length}</b>}
    </button>);
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-main">Skip to main content</a>
    <aside id="workspace-navigation" className={'sidebar ' + (menu ? 'is-open' : '')}>
      <a className="brand" href={demo?.billing ? href('/') : '#'} onClick={e => { if (demo?.billing) return; e.preventDefault(); go('overview'); }} aria-label="CoreConstruct overview">
        <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Core<span>Construct</span></span>
      </a>
      <div className="workspace-label" title={state.firm}>
        <span className="firm-avatar" aria-hidden="true">{state.firm.split(' ').map(n => n[0]).slice(0, 2).join('')}</span>
        <div><strong>{firmLabel}</strong><span>{demo ? 'Sample workspace' : 'Firm workspace'}</span></div>
      </div>
      <nav aria-label="Project navigation">
        <p className="nav-label">Project</p>
        {visible('portfolio') ? <button className={view === 'portfolio' ? 'active' : ''} aria-current={view === 'portfolio' ? 'page' : undefined} onClick={() => go('portfolio')}>
          <Building2 size={18} aria-hidden="true" /><span>Project portfolio</span>
        </button> : !portfolio && <a className="sidebar-portfolio-link" href={demo ? href('/?demo=portfolio&view=portfolio') : '/portfolio/?demo=portfolio&view=portfolio'}>
          <Building2 size={18} aria-hidden="true" /><span>Sample portfolio</span><ArrowUpRight size={14} aria-hidden="true" />
        </a>}
        {renderNav(nav.filter(item => !siteViews.includes(item.id)))}
      </nav>
      {siteViews.some(visible) && <nav aria-label="Site operations"><p className="nav-label">Site operations</p>{renderNav(nav.filter(item => siteViews.includes(item.id)))}</nav>}
      <div className="sidebar-lower">
        <nav aria-label="Workspace management">
          <p className="nav-label">Manage</p>
          {canBilling && <button className={view === 'billing' ? 'active' : ''} aria-current={view === 'billing' ? 'page' : undefined} onClick={() => go('billing')}><CreditCard size={18} aria-hidden="true" /><span>Subscription billing</span></button>}
          {demo?.billingHref && !demo.billing && actor?.role === 'admin' && <a className="portfolio-nav-link" href={demo.billingHref}><CreditCard size={18} aria-hidden="true" /><span>Try subscription billing</span><ArrowUpRight size={14} aria-hidden="true" /></a>}
          {demo?.portfolio && demo.onboardingHref && <a className="portfolio-nav-link" href={demo.onboardingHref}><ClipboardList size={18} aria-hidden="true" /><span>Try workspace setup</span><ArrowUpRight size={14} aria-hidden="true" /></a>}
          {canSetup && <button className={view === 'onboarding' ? 'active' : ''} aria-current={view === 'onboarding' ? 'page' : undefined} onClick={() => go('onboarding')}><ClipboardList size={18} aria-hidden="true" /><span>Workspace setup</span></button>}
          {canSetup && <button className={view === 'team' ? 'active' : ''} aria-current={view === 'team' ? 'page' : undefined} onClick={() => go('team')}><UsersRound size={18} aria-hidden="true" /><span>Team access</span></button>}
          {visible('pilot') && <button className={view === 'pilot' ? 'active' : ''} aria-current={view === 'pilot' ? 'page' : undefined} onClick={() => go('pilot')}><BarChart3 size={18} aria-hidden="true" /><span>Pilot results</span></button>}
          {visible('people') && <button className={view === 'people' ? 'active' : ''} aria-current={view === 'people' ? 'page' : undefined} onClick={() => go('people')}><HardHat size={18} aria-hidden="true" /><span>People & rates</span></button>}
          {actor?.role === 'admin' && !demo?.billing && <button className={view === 'settings' || view === 'configuration' ? 'active' : ''} aria-current={view === 'settings' || view === 'configuration' ? 'page' : undefined} onClick={() => go('settings')}><Settings2 size={18} aria-hidden="true" /><span>Settings</span></button>}
          {demo ? <a className="demo-pilot-link" href={href('/login/')}><ShieldCheck size={18} aria-hidden="true" /><span>Sign in to private pilot</span><ArrowUpRight size={14} aria-hidden="true" /></a>
            : <button onClick={() => open('guide')}><CircleHelp size={18} aria-hidden="true" /><span>Help</span></button>}
        </nav>
        {actor && <div className="profile"><span className="avatar" aria-hidden="true">{user.name.slice(0, 2).toUpperCase()}</span>
          <div><strong>{user.name === user.email ? (actor.role === 'admin' ? 'Workspace owner' : 'Workspace member') : user.name}</strong>
          <small>{role === 'admin' ? 'Firm principal' : role + ' access'}</small></div>
          {!demo && <AccountSignOut label="Sign out"><LogOut size={18} /></AccountSignOut>}
        </div>}
      </div>
    </aside>
    {menu && <button className="sidebar-shade" onClick={() => setMenu(false)} aria-label="Close navigation" />}
    <div className="main-shell">
      <header className="topbar">
        <div className="toolbar-start"><button className="icon-button mobile-menu" onClick={() => setMenu(!menu)} aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} aria-controls="workspace-navigation"><Menu size={21} aria-hidden="true" /></button>
          <span className="toolbar-firm">{firmLabel}</span></div>
        <div className="topbar-right">
          {demo && <><span className="pilot-pill">Fictional data</span><select className="finance-role-select" aria-label="Preview role" value={demo.role} onChange={event => demo.switchRole(event.target.value, selected, view)}>
            <option value="admin">Principal</option>
            <option value="finance" disabled={demo.canPreviewRole?.('finance', selected) === false}>Finance reviewer</option>
            <option value="accounts" disabled={demo.canPreviewRole?.('accounts', selected) === false}>Accounts</option>
            <option value="pm" disabled={demo.canPreviewRole?.('pm', selected) === false}>PM / QS</option>
            {demo.onboarding && <option value="architect" disabled={demo.canPreviewRole?.('architect', selected) === false}>Architect / engineer</option>}
            <option value="foreman" disabled={demo.canPreviewRole?.('foreman', selected) === false}>Site foreman</option>
            <option value="client" disabled={!selected || demo.canPreviewRole?.('client', selected) === false}>Client</option>
          </select></>}
          {organizations.length > 1 && <select aria-label="Firm workspace" className="firm-switch" disabled={!online || saving || !!requestKey.current}
            value={actor?.organizationId || ''} onChange={e => {
              orgRef.current = e.target.value;
              localStorage.setItem('cc-organization', e.target.value);
              sessionStorage.removeItem('cc-field-session');
              setActor(null); setState(normalizeState(emptyState())); setOutbox([]); setDialog(null);
              setLoading(true); setProjectId(''); setSetupReturn(false); go('overview', ''); void refresh();
            }}>{organizations.map(o => <option key={o.id} value={o.id}>{o.id === actor?.organizationId ? state.firm : o.name}</option>)}</select>}
          <span className="save-state" role="status" data-attention={!!error || !online}><i aria-hidden="true" />{saveStatus}</span>
          {!demo && <button className="icon-button toolbar-help" onClick={() => open('guide')} aria-label="Open quick guide"><CircleHelp size={19} /></button>}
        </div>
      </header>
      <main id="workspace-main" tabIndex={-1}>
        <header className="workspace-header">
          {hasContext && <div className="project-bar">
            <div className="project-selection">
              <span className="project-icon" aria-hidden="true"><Building2 size={20} /></span>
              <label><small>Active project</small><select aria-label="Active project" value={selected} onChange={e => chooseProject(e.target.value)}>
                {!state.projects.length && <option value="">No project yet</option>}
                {state.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              {role === 'admin' && <button className="icon-button" onClick={() => open('project')} aria-label="Add another project"><Plus size={17} /></button>}
              {project?.location && <span className="location"><MapPin size={15} aria-hidden="true" />{project.location}</span>}
            </div>
            {view !== 'finance' && <div className="week-picker" aria-label="Reporting week">
              <button className="icon-button" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week"><ChevronRight className="flip" size={18} /></button>
              <span title={fullDate(week) + ' – ' + fullDate(end)}><CalendarDays size={16} aria-hidden="true" />{displayDate(week)} – {displayDate(end)}</span>
              <button className="icon-button" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week"><ChevronRight size={18} /></button>
              <button className="text-button" onClick={() => setWeek(monday())}>This week</button>
            </div>}
          </div>}
          <div className="page-heading">
            <div><h1>{title}</h1>{desc && <p>{desc}</p>}</div>
            <div className="heading-actions">
              {canSetup && setupReturn && view !== 'onboarding' && <button className="btn" onClick={() => go('onboarding')}>Back to workspace setup</button>}
              {view === 'overview' && office && visible('reports') && <button className="btn" onClick={() => go('reports')}><FileText size={16} />View report</button>}
              {view === 'configuration' && <button className="btn" onClick={() => go('settings')}>Back to settings</button>}
              {!loading && !['billing', 'onboarding', 'portfolio', 'finance', 'settings', 'team', 'configuration'].includes(view) && (office || ['attendance', 'expenses', 'people'].includes(view))
                && <button className="btn primary" onClick={() => open(!project ? 'project' : view === 'attendance' ? 'attendance' : view === 'expenses' ? 'expense' : view === 'people' ? 'worker' : 'quick')}>
                  <Plus size={17} />{!project ? 'Create project' : view === 'attendance' ? 'Record attendance' : view === 'expenses' ? 'Add expense' : view === 'people' ? 'Add worker' : 'New entry'}
                </button>}
            </div>
          </div>
        </header>
  {error && <div className="notice error" role="alert"><AlertCircle size={18} /><span>{error}</span>{!demo && <a href="/login" target="_top" className="text-button">Sign in</a>}<button onClick={() => void refresh()}>Refresh</button>{requestKey.current&&<button onClick={()=>{const original=JSON.parse(pendingBody.current);void command(original.type,original.payload,'Previous save confirmed.',pendingAttachments.current);}}>Retry previous save</button>}</div>}
  {loading ? <div className="workspace-loading" role="status" aria-label="Opening your workspace">
    <div aria-hidden="true"><span /><span /><span /></div><p>Opening your workspace…</p>
  </div> : <>
    {outbox.length>0&&<section className="offline-inbox"><div><strong>{outbox.length} site draft{outbox.length===1?'':'s'} on this device</strong><p>Pending drafts are not server-approved records. Conflicts stay here for review.</p></div><button className="btn primary" disabled={!online||saving||!!requestKey.current} onClick={()=>void syncInbox()}>{syncing?'Syncing…':'Sync drafts'}</button><button className="btn" onClick={()=>download('coreconstruct-offline-drafts-'+dateKey()+'.json',JSON.stringify(outbox.map(i=>({...i,attachments:i.attachments.map(a=>({name:a.name,field:a.field,category:a.category,uploadedId:a.uploadedId}))})),null,2),'application/json')}>Export draft details</button>{outbox.filter(i=>i.status==='needs-review').map(i=><article key={i.key} className="offline-conflict"><p>{i.command.type}: {i.error}. Review the latest record before creating a corrected entry.</p><details><summary>Review queued values</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(i.command.payload,null,2)}</pre></details>{i.attachments.map((a,n)=><button key={n} className="btn small" onClick={()=>{const url=URL.createObjectURL(a.file),link=document.createElement('a');link.href=url;link.download=a.name;link.click();URL.revokeObjectURL(url);}}>Save attachment: {a.name}</button>)}<button className="btn small" onClick={async()=>{if(!confirm('Remove this local draft after reviewing it? Save any attachments first.'))return;await removePending(i.key);if(actor)setOutbox(await pending(actor.id,actor.organizationId));}}>Remove reviewed draft</button></article>)}</section>}
    {view === 'billing' && (canBilling && online
      ? <SubscriptionBillingPanel billing={state.suite.subscriptionBilling} saving={saving} command={command}
        reset={demo?.billing ? () => { if (window.confirm('Clear this browser’s test billing history?')) void demo.reset(); } : undefined} />
      : <Empty title={online ? 'Principal access required' : 'Connect to view billing'}
        text={online ? 'Only the firm principal can view or manage the workspace subscription.' : 'Reconnect to open the test subscription and invoice history.'} />)}
    {view === 'onboarding' && canSetup && actor && <WorkspaceSetup
      state={state} project={project} week={week} organizationId={actor.organizationId}
      editFirm={() => open('firm')} editProject={openSetupProject} navigate={goFromSetup}
    />}
    {view === 'portfolio' && portfolio && actor && <PortfolioPanel state={state} actor={actor} href={href} onOpen={(id, target) => go(target, id, chooseProject(id))}/>}
    {view === 'finance' && !portfolio && actor?.role === 'admin' && online && sampleCount < sampleProjectCount &&
      <div className="notice subtle finance-sample-notice"><Sparkles size={17} />
        <span>Compare four fictional projects with contract values up to KSh 200 million.</span>
        <button className="btn small" disabled={saving} onClick={() => void loadSampleProjects()}>Load sample projects</button>
      </div>}
    {!portfolio && actor?.role === 'admin' && online && state.suite.modules.wages && state.suite.modules.materials &&
      (view === 'wagebills' || view === 'materials' || view === 'overview' && !project) &&
      <section className="panel operations-walkthrough"><div className="panel-heading">
        <div><h2>Labour and procurement walkthrough</h2>
          <p>{selected !== operationsSampleId ? 'Practise with fictional attendance, an advance and a supplier invoice.'
            : view === 'wagebills' ? 'Prepare the sample week, check the advance deduction, then approve and record payment.'
              : 'Check the invoice, approve the delivery, then return to match the invoice.'}</p></div>
        {selected !== operationsSampleId ? <button className="btn" disabled={saving} onClick={() => openOperationsSample()}><Sparkles size={15} />Open sample walkthrough</button>
          : <div className="row-actions">
            {view === 'wagebills' && sampleWeek && week !== sampleWeek && <button className="btn" onClick={() => setWeek(sampleWeek)}>Select sample week</button>}
            <button className="btn" onClick={() => { if (view === 'wagebills') go('materials'); else openOperationsSample(); }}>
              {view === 'wagebills' ? 'Open materials & store' : 'Open wagebills'} <ArrowRight size={14} />
            </button>
          </div>}
      </div></section>}
    {!portfolio && actor?.role === 'admin' && online && state.suite.modules.design && state.suite.modules.portal && state.suite.modules.variations &&
      (['design', 'reports', 'variations'].includes(view) || view === 'overview' && !project) &&
      <section className="panel operations-walkthrough"><div className="panel-heading">
        <div><h2>Drawings and client updates walkthrough</h2>
          <p>{selected !== clientUpdatesSampleId ? 'Practise with a fictional drawing revision, weekly update and variation.'
            : view === 'design' ? 'Issue and acknowledge A-101 revision 2. Publish the drawing and review the canopy field note.'
              : view === 'reports' ? 'Review the sample week and publish the update before downloading it.'
                : 'Revise the sample variation, send it, and open the client view to check the decision.'}</p></div>
        <div className="row-actions">
          {selected !== clientUpdatesSampleId
            ? <button className="btn" disabled={saving} onClick={openClientUpdatesSample}><Sparkles size={15} />Open client updates walkthrough</button>
            : <>
              {view !== 'design' && <button className="btn" onClick={() => go('design')}>Drawing register</button>}
              {(view !== 'reports' || week !== updateWeek) && <button className="btn" onClick={goToSampleUpdate}>Open sample weekly update</button>}
              {view !== 'variations' && <button className="btn" onClick={() => go('variations')}>Open variations</button>}
              {demo && <a className="btn" href={href('/client/' + encodeURIComponent(selected))}>Open sample client view <ExternalLink size={14} /></a>}
            </>}
        </div>
      </div></section>}
    {view==='finance' && actor && online && canViewProjectFinance(role) && (project
      ? <>
        {!portfolio && canViewProfit(role) && <SampleProjectComparison state={state} actor={actor} projectId={project.id} selectProject={setProjectId} />}
        <ProjectFinance key={project.id+':'+role} state={state} project={project} role={role} organizationId={actor.organizationId}
          saving={saving} error={error} command={command} />
      </>
      : requireProject)}

    {view==='finance' && !online && <Empty title="Project finance needs a connection" text="Reconnect to load current finance records and permissions." />}
    {view==='overview' && (role==='finance'||role==='accounts') && <div className="notice subtle"><Wallet size={18} /><span>Open Project finance for your assigned project.</span><button className="btn small" onClick={()=>go('finance')}>Open Project finance</button></div>}
    {view === 'pilot' && online && actor?.role === 'admin' && project && <PilotScorecard
      key={selected} firm={state.firm} projectId={selected} projectName={project.name} week={week}
      measurements={state.suite.pilot.projects[selected]} renewal={state.suite.pilot.renewal}
      saving={saving} error={error} command={command} exportCsv={(name, rows) => download(name, makeCsv(rows), 'text/csv;charset=utf-8')}
    />}
    {view === 'pilot' && canFinance && <WeeklyClose state={state} projectId={selected} week={week} saving={saving}
      canOpenSample={!portfolio && actor?.role === 'admin' && state.suite.modules.wages && state.suite.modules.materials && (selected !== operationsSampleId || week !== sampleWeek)}
      openSample={() => openOperationsSample('pilot')} navigate={go} />}
    {actor&&['site','design','boq','materials','variations','client-portal','team','pilot','configuration'].includes(view)&&<SuitePanels view={view as SuiteView} state={state} actor={actor} project={project} week={week} saving={saving} command={command} refresh={refresh} error={error}/>}
    {view==='overview'&&role==='client'&&<section className="panel"><div className="panel-heading"><h2>Your assigned projects</h2></div>{state.projects.map(p=><div className="portal-file" key={p.id}><Building2 size={20}/><div><strong>{p.name}</strong><small>{p.location}</small></div><a className="btn primary" href={href('/client/'+p.id+'?org='+encodeURIComponent(actor?.organizationId||''))}>Open client view</a></div>)}</section>}
    {view==='overview'&&!canFinance&&role!=='client'&&role!=='finance'&&role!=='accounts'&&<section className="panel"><div className="panel-heading"><div><h2>Your project workspace</h2><p>{online?'Assigned records and actions for your role.':'Offline reference view; save supported site entries as drafts.'}</p></div></div><div className="role-dashboard">{['site','design','attendance','materials','reports'].filter(v=>visible(v as View)).map(v=><button className="btn" key={v} onClick={()=>go(v as View)}>{nav.find(n=>n.id===v)?.label||v}<ArrowRight size={14}/></button>)}</div></section>}
    {view === 'overview' && canFinance && <>
      {!project && <div className="welcome-banner"><div><Badge tone="green">LET’S GET YOUR FIRST SITE IN SYNC</Badge><h2>A clearer week starts here.</h2><p>Add one project, bring in your team and turn site records into a dependable weekly close.</p><div className="welcome-actions"><button className="btn primary" onClick={() => open('project')}>Set up first project <ArrowRight size={16} /></button><button className="text-button" disabled={saving} onClick={() => void loadSampleProjects()}>Explore sample projects <ArrowUpRight size={14} /></button></div></div><div className="welcome-visual" aria-hidden="true"><div className="building-line b1" /><div className="building-line b2" /><div className="building-line b3" /><span className="floating-check"><CheckCircle2 size={23} /></span><span className="visual-label">ONE PROJECT. ONE CLEAR PICTURE.</span></div></div>}
      {project && visible('finance') && <section className="project-forecast" data-loss={forecast !== null && forecast < 0}>
        <span className="forecast-icon">{forecast !== null && forecast < 0 ? <AlertCircle size={22} aria-hidden="true" /> : <BarChart3 size={22} aria-hidden="true" />}</span>
        <div>
          <h2>{forecast === null ? 'Project finance' : 'Forecast at completion'}</h2>
          {forecast === null
            ? <p>{role === 'admin' ? 'Record a finance review to calculate the forecast.' : 'Review the budget and approved costs.'}</p>
            : <p><strong title={kes(forecast)}>{compactKes(forecast)}</strong><span>{forecast < 0 ? 'Forecast loss' : forecast > 0 ? 'Forecast profit' : 'Break-even forecast'}</span></p>}
        </div>
        <button className="btn" onClick={() => go('finance')}>Open Project finance <ArrowRight size={16} /></button>
      </section>}
      <section className="metrics" aria-label="Project position"><Metric label="Approved costs" value={compactKes(summary.incurred)} exactValue={kes(summary.incurred)} icon={Wallet} note={financials?.allowance ? `${Math.round(summary.incurred / financials.allowance * 100)}% of internal allowance` : 'Your approved site costs'} color="teal" /><Metric label="Confirmed payments out" value={compactKes(summary.cashPaid)} exactValue={kes(summary.cashPaid)} icon={ArrowUpRight} note="Payments and worker advances" color="blue" /><Metric label="Balance to pay" value={compactKes(summary.outstanding)} exactValue={kes(summary.outstanding)} icon={Clock3} note="On approved costs only" color="amber" /><Metric label="Site progress" value={`${project?.progress || 0}%`} icon={HardHat} note={project?.stage || 'Ready when you are'} color="sage" /></section>
      <div className="dashboard-grid"><section className="panel"><div className="panel-heading"><div><h2>Cost overview</h2><p>Approved costs by work week</p></div><Badge>Last 6 weeks</Badge></div><CostChart state={state} projectId={selected} week={week} /><div className="chart-legend"><span><i />Approved costs</span><strong>Internal allowance <b>{kes(financials?.allowance || 0)}</b></strong></div></section><section className="panel review-panel"><div className="panel-heading"><div><h2>Needs your review</h2><p>Open submissions</p></div><span className="count-circle">{pendingReview}</span></div>{!pendingReview ? <div className="review-clear"><span><CheckCircle2 size={31} /></span><h3>You’re all caught up</h3><p>Submitted wagebills and expenses<br />will appear here for review.</p></div> : <div className="review-list">{pendingBills.slice(0, 2).map(b => <button key={b.id} onClick={() => open('bill-details', { billId: b.id })}><span className="item-icon teal"><ClipboardList size={17} /></span><span><strong>Weekly wagebill</strong><small>{displayDate(b.weekStart)} – {displayDate(b.weekEnd)}</small></span><b>{kes(b.payableCents)}</b><ChevronRight size={15} /></button>)}{pendingExpenses.slice(0, 3).map(e => <button key={e.id} onClick={() => open('expense-details', { expenseId: e.id })}><span className="item-icon amber"><ReceiptText size={17} /></span><span><strong>{e.description}</strong><small>{e.category}</small></span><b>{kes(e.amountCents)}</b><ChevronRight size={15} /></button>)}</div>}{pendingReview > 0 && <button className="panel-footer-button" onClick={() => go(pendingBills.length ? 'wagebills' : 'expenses')}>Review submissions <ArrowRight size={15} /></button>}</section></div>
      <div className="dashboard-grid lower-grid"><section className="panel"><div className="panel-heading"><div><h2>This week on site</h2><p>{displayDate(week)} – {displayDate(end)}</p></div><button className="text-button" onClick={() => go('attendance')}>View attendance <ArrowUpRight size={14} /></button></div><div className="site-stats"><div><strong>{new Set(attendance.map(a => a.workerId)).size}<span>workers</span></strong><small>Recorded this week</small></div><div><strong>{attendance.reduce((n, a) => n + a.units / 2, 0)}<span>days</span></strong><small>Total person-days</small></div><div><strong>{kes(weekRows.reduce((n, a) => n + a.grossCents, 0))}</strong><small>Value before advances</small></div></div><div className="weekday-bars">{Array.from({ length: 7 }, (_, d) => { const day = addDays(week, d), total = state.attendance.filter(a => a.projectId === selected && a.date === day).reduce((n, a) => n + a.units / 2, 0); return <div key={day}><div><i style={{ height: `${total ? Math.max(10, total / Math.max(activeWorkers.length, 1) * 100) : 3}%` }} /></div><span>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][d]}</span><small>{total || '—'}</small></div>; })}</div></section><section className="panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your workspace history</p></div><Clock3 size={18} className="muted" /></div>{audit.length ? <div className="activity-list">{audit.slice(0, 4).map(a => <div key={a.id}><span className="activity-dot" /><div><strong>{a.description}</strong><small>{a.actor} · {displayDate(a.at)}</small></div></div>)}</div> : <div className="activity-placeholder"><FileText size={25} /><p>Your first entry starts the story.<br />Changes and decisions will appear here.</p></div>}</section></div>
    </>}
    {portfolio && project && view === 'overview' && <section className="panel portfolio-project-links">
      <div><h2>Project records</h2></div>
      <div className="row-actions"><button className="btn" onClick={() => go('design')}>Drawings &amp; renders</button>
        {visible('boq') && <button className="btn" onClick={() => go('boq')}>BOQ &amp; allowances</button>}
        {office && <a className="btn" href={href('/client/' + encodeURIComponent(selected))}>Open client page <ArrowUpRight size={14} /></a>}
      </div>
    </section>}
    {view === 'attendance' && (!project ? requireProject : <><div className="inline-stats"><span><strong>{new Set(attendance.map(a => a.workerId)).size}</strong> workers recorded</span><span><strong>{attendance.reduce((n, a) => n + a.units / 2, 0)}</strong> person-days</span><span><strong>{kes(weekRows.reduce((n, a) => n + a.grossCents, 0))}</strong> gross wage value</span><button className="text-button" onClick={() => exportCsv('attendance')}><Download size={15} />Export CSV</button></div><section className="panel"><div className="table-toolbar"><div className="search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your site team" aria-label="Search attendance" /></div><button className="btn small" onClick={() => open('worker')}><Plus size={14} />Add worker</button></div>{workers.length ? <div className="table-scroll"><table className="attendance-table"><thead><tr><th>WORKER / TRADE</th>{Array.from({ length: 7 }, (_, d) => <th key={d}>{['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][d]}<small>{displayDate(addDays(week, d))}</small></th>)}<th>DAYS</th><th>GROSS</th></tr></thead><tbody>{workers.filter(w => (w.active || attendance.some(a => a.workerId === w.id)) && `${w.name} ${w.trade}`.toLowerCase().includes(search.toLowerCase())).map(w => { const mine = attendance.filter(a => a.workerId === w.id); return <tr key={w.id}><td><div className="person-cell"><span className="person-avatar">{w.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div><strong>{w.name}</strong><small>{w.trade} · {kes(w.rateCents)}/day</small></div></div></td>{Array.from({ length: 7 }, (_, d) => { const date = addDays(week, d), record = mine.find(a => a.date === date), locked = bills.some(b => b.status !== 'returned' && date >= b.weekStart && date <= b.weekEnd); return <td key={d}><button className={'day-cell ' + (record ? 'present' : '')} disabled={date > dateKey() || locked} title={record ? record.task : 'Record attendance'} aria-label={`${w.name}, ${date}: ${record ? record.units / 2 + ' day' : 'not recorded'}`} onClick={() => open('attendance', { workerId: w.id, date, units: String(record?.units || 2), task: record?.task || '', rate: record ? String(record.rateCents / 100) : '', attendanceId: record?.id,boqItemId:record?.boqItemId })}>{record ? record.units === 2 ? <Check size={15} /> : '½' : '—'}</button></td>; })}<td className="numeric strong">{mine.reduce((n, a) => n + a.units / 2, 0)}</td><td className="numeric strong">{kes(mine.reduce((n, a) => n + Math.round(a.rateCents * a.units / 2), 0))}</td></tr>; })}</tbody></table></div> : <Empty title="Bring your first worker on board" text="Add a name, trade and agreed daily rate. Identity references are optional unless your firm requires them; recorded values are encrypted." action={<button className="btn primary" onClick={() => open('worker')}>Add worker <Plus size={15} /></button>} />}</section><div className="bottom-callout"><span><ShieldCheck size={20} />Submitted attendance stays locked until its wagebill is returned.</span><button className="btn primary" onClick={() => open('submit-bill')} disabled={!weekRows.length}>Prepare wagebill <ArrowRight size={15} /></button></div></>)}
    {view === 'wagebills' && (!project ? requireProject : <>
      {canFinance && <OperationsTotals label="Project payroll totals" figures={[
        ['Approved gross wages', summary.labour],
        ['Confirmed advances', projectAdvances.filter(advance => !advance.reversedAt).reduce((sum, advance) => sum + advance.amountCents, 0)],
        ['Confirmed wage payments', wagePayments],
        ['Approved wages due', approvedBills.reduce((sum, bill) => sum + bill.payableCents, 0) - wagePayments],
      ]} />}
      <div className="section-actions"><p><Badge tone="amber">{pendingBills.length} awaiting review</Badge></p><div><button hidden={!canFinance} className="btn" onClick={()=>open('piecework')}>Approve piece work</button><button hidden={!canFinance} className="btn" onClick={() => open('advance')}><ArrowDownLeft size={15} />Record advance</button><button className="btn" onClick={() => exportCsv('wagebills')}><Download size={15} />Export</button><button className="btn primary" onClick={() => open('submit-bill')} disabled={!weekRows.length || bills.some(bill => bill.weekStart === week && bill.status !== 'returned')}><Plus size={16} />Prepare wagebill</button></div></div><section className="panel">{bills.length ? <div className="table-scroll"><table><thead><tr><th>WAGEBILL</th><th>TEAM</th><th>GROSS</th><th>ADVANCES</th><th>NET PAYABLE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{bills.map(b => <tr key={b.id}><td><button className="table-link" onClick={() => open('bill-details', { billId: b.id })}>{displayDate(b.weekStart)} – {displayDate(b.weekEnd)}<small>Revision {b.revision}</small></button></td><td>{b.entries.length} workers</td><td>{kes(b.grossCents)}</td><td className="muted">{kes(b.advanceCents)}</td><td className="strong">{kes(b.payableCents)}</td><td><Status status={b.status} paid={paidFor(state, 'wagebill', b.id)} amount={b.payableCents} /></td><td>{b.status === 'submitted' ? <button className="btn small primary" onClick={() => open('bill-details', { billId: b.id })}>Review</button> : b.status === 'returned' ? <button className="btn small" onClick={() => { setWeek(b.weekStart); go('attendance'); }}>Correct attendance</button> : payButton('wagebill', b)}</td></tr>)}</tbody></table></div> : <Empty title="Your first wagebill starts with attendance" text="Record the working week, then submit its wagebill for review. Confirmed advances are deducted automatically." action={<button className="btn primary" onClick={() => go('attendance')}>Open attendance <ArrowRight size={15} /></button>} />}</section><section className="panel advances-panel"><div className="panel-heading"><div><h2>Worker advances</h2><p>Confirmed cash paid before wages are settled</p></div><Badge>{kes(summary.unallocatedAdvances)} not on approved bills</Badge></div>{projectAdvances.length ? <div className="table-scroll"><table><thead><tr><th>WORKER</th><th>DATE</th><th>REFERENCE</th><th>AMOUNT</th><th>ALLOCATED</th><th>STATUS</th></tr></thead><tbody>{projectAdvances.map(a => <tr key={a.id}><td>{state.workers.find(w => w.id === a.workerId)?.name}</td><td>{displayDate(a.date)}</td><td>{a.reference}</td><td>{kes(a.amountCents)}</td><td>{kes(a.allocations.reduce((n, x) => n + x.amountCents, 0))}</td><td>{a.reversedAt ? <Badge>Reversed</Badge> : !a.allocations.length && canFinance ? <button className="text-button" onClick={() => open('reason', { type: 'advance.reverse', advanceId: a.id, title: 'Reverse advance record' })}>Reverse</button> : <Badge tone={a.allocations.length ? "green" : "neutral"}>{a.allocations.length ? "Allocated" : "Available"}</Badge>}</td></tr>)}</tbody></table></div> : <p className="panel-copy">No advances recorded. An advance is counted in cash paid, not as an extra labour cost.</p>}</section></>)}
    {view === 'expenses' && (!project ? requireProject : <><div className="inline-stats"><span><strong>{kes(summary.expenses)}</strong> approved expenses</span><span><strong>{pendingExpenses.length}</strong> waiting for review</span><button className="text-button" onClick={() => exportCsv('expenses')}><Download size={15} />Export CSV</button></div><section className="panel"><div className="table-toolbar"><div className="search"><Search size={16} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search expenses or categories" aria-label="Search expenses" /></div><Badge>PROJECT COSTS</Badge></div>{expenses.length ? <div className="table-scroll"><table><thead><tr><th>EXPENSE</th><th>DATE</th><th>CATEGORY</th><th>AMOUNT</th><th>EVIDENCE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{expenses.filter(e => `${e.description} ${e.category}`.toLowerCase().includes(search.toLowerCase())).map(e => <tr key={e.id}><td><button className="table-link" onClick={() => open('expense-details', { expenseId: e.id })}>{e.description}<small>{e.receiptRef || 'No reference recorded'}</small></button></td><td className="nowrap">{displayDate(e.date)}</td><td><Badge>{e.category}</Badge></td><td className="strong">{kes(e.amountCents)}</td><td>{e.receiptUrl ? <a className="text-button" href={e.receiptUrl} target="_blank" rel="noopener noreferrer">Receipt <ExternalLink size={12} /></a> : e.receiptRef ? <span className="evidence"><FileText size={13} />Reference</span> : <Badge tone="amber">Missing</Badge>}</td><td><Status status={e.status} paid={paidFor(state, 'expense', e.id)} amount={e.amountCents} /></td><td>{e.status === 'submitted' ? <button className="btn small primary" onClick={() => open('expense-details', { expenseId: e.id })}>Review</button> : e.status === 'returned' ? isSupplierInvoiceCost(state, e)
        ? <button className="btn small" onClick={() => go('materials')}>Open materials & store</button>
        : <button className="btn small" onClick={() => open('expense', { ...e, amount: String(e.amountCents / 100) })}>Revise</button> : payButton('expense', e)}</td></tr>)}</tbody></table></div> : <Empty title="Capture your first site expense" text="Add the cost, work date and receipt reference. It enters approved costs after review." action={<button className="btn primary" onClick={() => open('expense')}>Add expense <Plus size={15} /></button>} />}</section></>)}
    {view === 'reports' && (!project ? requireProject : <><div className="section-actions report-actions"><div className="segmented"><button className={!clientCopy ? 'selected' : ''} onClick={() => setClientCopy(false)}>Internal report</button><button className={clientCopy ? 'selected' : ''} onClick={() => setClientCopy(true)}>Client copy</button></div><div>{office && <button className="btn" onClick={() => open('report')}><FileText size={15} />Edit reporting note</button>}
      <button className="btn" onClick={() => window.print()}><Printer size={15} />Print / save PDF</button></div></div>
      {office && <section className="panel report-publish" aria-label="Publication and downloads">
        <div><Badge tone={updatePublished ? 'green' : 'amber'}>{updatePublished ? 'Published to client' : reportingNote ? 'Draft' : 'No weekly note'}</Badge>
          <p className="muted">{updatePublished ? 'Downloads use this published weekly note.' : 'Review the client copy before publishing the weekly note.'}</p></div>
        <div className="row-actions">
          {updatePublished && online && <WeeklyDownloads key={selected + ':' + week} endpoint={clientUpdateEndpoint} weekStart={week} />}
          {reportingNote && <button className="btn primary" disabled={!online || saving} onClick={() => void command('report.publish',
            { projectId: selected, weekStart: week, expectedUpdatedAt: reportingNote.updatedAt, published: !updatePublished },
            updatePublished ? 'Weekly update removed from the client view.' : 'Weekly update published.')}>
            {updatePublished ? 'Unpublish weekly update' : 'Publish weekly update'}
          </button>}
        </div>
      </section>}
      <article className="report-sheet"><div className="report-header"><div><span className="report-wordmark">CoreConstruct<span>.</span></span><p>{state.firm}</p></div><div><Badge tone={clientCopy ? 'green' : 'neutral'}>{clientCopy ? 'CLIENT COPY' : 'INTERNAL REPORT'}</Badge><p>{displayDate(week)} – {displayDate(end)} {week.slice(0, 4)}</p></div></div><div className="report-title"><p className="eyebrow">WEEKLY PROJECT UPDATE</p><h2>{project.name}</h2><p><MapPin size={14} />{project.location}{project.client && ` · ${project.client}`}</p>{project.demo && <Badge tone="amber">FICTIONAL SAMPLE RECORDS</Badge>}</div><div className="report-progress"><div><span>Reported physical progress</span><strong>{reportingNote?.progress ?? project.progress}%</strong></div><div className="progress-track"><i style={{ width: (reportingNote?.progress ?? project.progress) + '%' }} /></div><p>{reportingNote?.stage || project.stage} · Owner-reported progress; no independent inspection implied.</p></div><div className="report-section"><h3>Work this week</h3><p className="pre-wrap">{reportingNote?.summary || 'No reporting note saved yet. Add the work completed, decisions made and observations from site.'}</p></div>{!clientCopy || project.mode === 'open' ? <div className="report-section"><h3>{clientCopy ? 'Approved project cost position' : 'Internal financial position'}</h3><p className="muted">Cumulative position as of {displayDate(dateKey())}; submitted costs are excluded.</p><div className="report-financial"><div><span>Approved costs</span><strong>{kes(summary.incurred)}</strong></div><div><span>Confirmed payments</span><strong>{kes(summary.cashPaid)}</strong></div><div><span>Balance on approved costs</span><strong>{kes(summary.outstanding)}</strong></div></div>{!clientCopy && <p className="report-footnote">Internal allowance: {kes(project.budgetCents)}. Advances not allocated to approved wagebills: {kes(summary.unallocatedAdvances)}. This is an operational report, not a tax invoice or a full accounting statement.</p>}</div> : <div className="report-section"><h3>Contract information</h3><p>{project.contractCents ? `Recorded contract sum: ${kes(project.contractCents)}.` : 'Contract sum has not been entered.'} This copy contains the progress note and next actions.</p></div>}<div className="report-two-col"><div className="report-section"><h3>Next steps</h3><p className="pre-wrap">{reportingNote?.nextSteps || 'Add next week’s planned work and decisions needed.'}</p></div><div className="report-section"><h3>Decisions and open issues</h3><p className="pre-wrap">{reportingNote?.risks || 'No open issues have been recorded in this reporting note.'}</p></div></div><div className="report-footer"><span>Prepared by {state.firm}</span><span>{reportingNote?.updatedAt ? `Note updated ${displayDate(reportingNote.updatedAt)}` : 'Reporting note not yet saved'}</span></div></article></>)}
    {view === 'people' && <><div className="section-actions"><p className="muted">{workers.length} people · Daily rates are copied into attendance when recorded.</p><button className="btn primary" onClick={() => open('worker')}><Plus size={16} />Add worker</button></div><section className="panel">{workers.length ? <div className="table-scroll"><table><thead><tr><th>NAME</th><th>TRADE</th><th>AGREED DAILY RATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{workers.map(w => <tr key={w.id}><td><div className="person-cell"><span className="person-avatar">{w.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><strong>{w.name}</strong></div></td><td>{w.trade}</td><td className="strong">{kes(w.rateCents)}</td><td><Badge tone={w.active ? 'green' : 'neutral'}>{w.active ? 'Active' : 'Inactive'}</Badge></td><td><button hidden={!canFinance} className="btn small" onClick={() => open('worker', { ...w, rate: String(w.rateCents / 100) })}>Edit details</button></td></tr>)}</tbody></table></div> : <Empty title="Your team belongs here" text="Start with a name, trade and agreed daily rate. Use your existing process to verify attendance and identity." action={<button className="btn primary" onClick={() => open('worker')}>Add first worker <Plus size={15} /></button>} />}</section><div className="notice subtle"><ShieldCheck size={18} /><span>Worker records track attendance and rates. Login and approval permissions are managed separately in Team access.</span></div></>}
    {view === 'settings' && actor?.role==='admin' && <div className="settings-grid"><section className="panel"><div className="panel-heading"><div><h2>Firm details</h2><p>Used on your reports</p></div><Building2 size={19} /></div><div className="settings-body"><strong>{state.firm}</strong><p>Currency: Kenyan shillings (KES)<br />Reporting dates: Africa/Nairobi<br />Access: {demo ? 'browser demo' : 'signed-in private workspace'}</p><div className="row-actions"><button className="btn" onClick={() => open('firm')}>Edit firm name</button>
      <button className="btn" onClick={() => go('configuration')}>Appearance and modules</button></div></div></section><section className="panel"><div className="panel-heading"><div><h2>Project details</h2><p>Allowance, reporting mode and progress</p></div><Settings2 size={19} /></div><div className="settings-body">{project ? <><strong>{project.name}</strong><p>{project.location}<br />Internal allowance: {kes(project.budgetCents)}<br />Client mode: {project.mode === 'fixed' ? 'Fixed-price' : 'Open-book'}</p><button className="btn" onClick={() => open('project-edit', { ...project, budget: String(project.budgetCents / 100), contract: String(project.contractCents / 100) })}>Edit project</button></> : <><p>Set up your first project.</p><button className="btn" onClick={() => open('project')}>Create project</button></>}</div></section><WorkspaceBackup key={actor.organizationId} actor={actor} online={online} exportRecords={backup}/>{!portfolio && <section className="panel"><div className="panel-heading"><div><h2>Sample projects</h2><p>Fictional records for testing</p></div><Sparkles size={19} /></div><div className="settings-body"><p>Compare contract values, profit and cash across four projects.</p><button className="btn" disabled={saving || !online} onClick={() => sampleCount >= sampleProjectCount ? go('finance') : void loadSampleProjects()}>{sampleCount >= sampleProjectCount ? 'Compare sample projects' : 'Load sample projects'}</button></div></section>}<section className="panel audit-panel"><div className="panel-heading"><div><h2>Decision history</h2><p>Most recent 25 workspace events</p></div><ShieldCheck size={19} /></div><div className="activity-list">{state.audit.slice(-25).reverse().map(a => <div key={a.id}><span className="activity-dot" /><div><strong>{a.description}</strong><small>{a.actor} · {new Date(a.at).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' })}</small></div></div>)}{!state.audit.length && <p>No changes recorded yet.</p>}</div></section></div>}
    {view==='settings'&&actor?.role==='admin'&&<SuitePanels view="configuration" state={state} actor={actor} project={project} week={week} saving={saving} command={command} refresh={refresh} error={error}/>}
    <footer className="workspace-footer">
      <span>{demo ? 'Fictional records · Changes stay in this browser' : 'CoreConstruct · Private workspace'}</span>
      {project?.demo && view !== 'billing' && view !== 'onboarding' && (
        demo ? <button className="text-button" onClick={() => { if (window.confirm('Reset the sample data and clear browser changes?')) void demo.reset(); }}>Reset sample data</button>
          : <button className="text-button" onClick={() => open('project')}>Create your own project <ArrowRight size={14} /></button>
      )}
    </footer>
  </>}</main></div>{toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}{dialog && <Modal organizationId={actor?.organizationId} canApprove={canFinance} dialog={dialog} state={state} project={project} workers={activeWorkers} week={week} saving={saving} error={error} close={() => { if (!inflight.current) setDialog(null); }} command={command} open={open} />}</div>;
}
function Metric({ label, value, exactValue, icon: Icon, note, color }: { label: string; value: string; exactValue?: string; icon: typeof Wallet; note: string; color: string }) { return <div className="metric"><div><span>{label}</span><span className={'metric-icon ' + color}><Icon size={17} /></span></div><strong title={exactValue}>{value}</strong><p>{note}</p></div>; }
function CostChart({ state, projectId, week }: { state: State; projectId: string; week: string }) {
  const points = Array.from({ length: 6 }, (_, index) => {
    const start = addDays(week, (index - 5) * 7);
    const end = addDays(start, 6);
    const expenses = state.expenses.filter(item => item.projectId === projectId && item.status === 'approved'
      && !item.opening && item.date >= start && item.date <= end).reduce((sum, item) => sum + item.amountCents, 0);
    const wages = state.wagebills.filter(item => item.projectId === projectId && item.status === 'approved'
      && item.weekStart === start).reduce((sum, item) => sum + item.grossCents, 0);
    return { start, value: expenses + wages };
  });
  const roughStep = Math.max(100_000, ...points.map(point => point.value)) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const interval = ([1, 2, 2.5, 5, 10].find(step => step * magnitude >= roughStep) || 10) * magnitude;
  const top = interval * 4;
  const inMillions = top >= 100_000_000;
  const unit = inMillions ? 100_000_000 : 100_000;
  const x = (index: number) => 63 + index * 93;
  const y = (value: number) => 172 - value / top * 140;
  const coordinates = points.map((point, index) => x(index) + ',' + y(point.value)).join(' ');
  const axisLabels = new Intl.NumberFormat('en-KE', { maximumFractionDigits: 2 });

  return <figure className="cost-chart" aria-label="Approved costs by week">
    <figcaption>KSh {inMillions ? 'millions' : 'thousands'}</figcaption>
    <svg viewBox="0 0 560 209" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => {
        const value = top - index * interval;
        return <g key={index}>
          <line x1="63" x2="535" y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text x="52" y={y(value) + 4} textAnchor="end">{axisLabels.format(value / unit)}</text>
        </g>;
      })}
      <polygon points={`63,172 ${coordinates} 528,172`} fill="var(--green-bg)" />
      <polyline points={coordinates} fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((point, index) => <g key={point.start}>
        <circle cx={x(index)} cy={y(point.value)} r="4" fill="var(--teal)" stroke="var(--surface)" strokeWidth="2">
          <title>{displayDate(point.start)} · {kes(point.value)}</title>
        </circle>
        <text x={x(index)} y="201" textAnchor="middle">{displayDate(point.start)}</text>
      </g>)}
    </svg>
    <ul className="sr-only">{points.map(point => <li key={point.start}>{fullDate(point.start)} · {kes(point.value)}</li>)}</ul>
  </figure>;
}
