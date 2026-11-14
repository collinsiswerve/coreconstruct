import { assertDrawingAccess } from '../lib/drawings';
import { sampleEvidenceAsset } from '../lib/sample-client-updates';
import { DomainError, type Command } from '../lib/domain';
import { authorize, clientView, filterState, roleFor } from '../lib/security';
import { enabled, executeSuite, get, normalizeState } from '../lib/suite';
import { addSampleComparisonProjects, isFinanceSample, sampleProjectCount } from '../lib/sample-projects';
import type { Actor, SuiteState } from '../lib/suite-types';
import { openDemoFiles } from './files';
import { addSampleFinance, principal, sampleWorkspace } from './sample';

const storageKey = 'coreconstruct-pages-demo-v1';
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']);

export async function createDemoRuntime() {
  const root = new URL('./', window.location.href);
  const files = await openDemoFiles();
  const params = new URLSearchParams(window.location.search);
  const requestedRole = params.get('as');
  const previewRole = requestedRole === 'pm' || requestedRole === 'accounts' || requestedRole === 'finance' || requestedRole === 'foreman' ? requestedRole : 'admin';
  let current = sampleWorkspace();

  function save(state: SuiteState) {
    current = state;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function read() {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const state = JSON.parse(raw) as SuiteState;
      if (state.schemaVersion === 1 && state.suite?.version === 2) {
        const previousCount = state.projects.length;
        current = normalizeState(state);
        if (!state.suite.finance) addSampleFinance(current);
        const sampleProjects = current.projects.filter(isFinanceSample);
        const residence = sampleProjects[0];
        if (residence && sampleProjects.length < sampleProjectCount) {
          addSampleComparisonProjects(current, residence.id, principal.id, new Date().toISOString());
        }
        if (!state.suite.finance || previousCount !== current.projects.length) save(current);
      }
    } else {
      save(current);
    }
    return current;
  }

  function href(path: string) {
    const url = new URL(path, root);
    const [, kind, type, id] = url.pathname.split('/');
    if (kind === 'api' && type === 'files' && id) {
      const fileId = decodeURIComponent(id);
      const drawing = read().suite.drawings.find(item => item.fileId === fileId);
      if (drawing) return new URL('?drawing=' + encodeURIComponent(fileId) + (params.get('client') ? '&forClient=' + encodeURIComponent(params.get('client')!) : '')
        + (params.get('as') ? '&as=' + encodeURIComponent(params.get('as')!) + '&project=' + encodeURIComponent(params.get('project') || '') : ''), root).href;
      const sample = sampleEvidenceAsset(fileId);
      return sample ? new URL(sample.slice(1), root).href : files.href(fileId) || '#';
    }
    if ((kind === 'api' && type === 'receipts' && id) || (kind === 'receipts' && type)) {
      const query = new URLSearchParams(params);
      query.delete('view');
      query.delete('receipt');
      query.delete('receiptPdf');
      query.set(kind === 'api' ? 'receiptPdf' : 'receipt', kind === 'api' ? id : type);
      return new URL('?' + query, root).href;
    }
    if (kind === 'client' && type) return new URL('?client=' + encodeURIComponent(type), root).href;
    return new URL(path.replace(/^\//, ''), root).href;
  }

  function actorFor(state: SuiteState): Actor {
    const client = params.get('client') || params.get('forClient');
    const role = client ? 'client' : previewRole;
    if (role === 'admin') return principal;
    const project = state.projects.find(item => item.id === (client || params.get('project')))
      || state.projects.find(isFinanceSample);
    const names = { client: 'Sample client', pm: 'Demo PM / QS', accounts: 'Demo Accounts', finance: 'Demo Finance', foreman: 'Demo foreman' };
    return {
      id: 'demo-' + role,
      name: names[role],
      email: role + '@example.invalid',
      role,
      organizationId: principal.organizationId,
      projectRoles: project ? { [project.id]: role } : {},
    };
  }

  const request: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, root);
    const method = init?.method || 'GET';
    try {
      let state = read();
      const actor = actorFor(state);
      const response = () => Response.json({
        state: filterState(state, actor),
        actor,
        version: state.commandIds.length,
        user: { name: actor.name, email: actor.email },
        operationApplied: state.commandIds.includes(url.searchParams.get('operationId') || ''),
      });

      if (url.pathname === '/api/workspace' && method === 'GET') return response();

      if (url.pathname === '/api/workspace' && method === 'POST') {
        const command = JSON.parse(String(init?.body)) as Command;
        delete command.payload.nationalId;
        delete command.payload.mpesaPhone;
        delete command.payload.protected;
        authorize(state, command, actor);
        state = executeSuite(state, command, actor);
        save(state);
        return response();
      }

      if (url.pathname === '/api/files' && method === 'POST') {
        const file = init?.body instanceof FormData ? init.body.get('file') : null;
        if (!(file instanceof File) || !allowedTypes.has(file.type) || file.size > 8 * 1024 * 1024) {
          throw new DomainError('Choose a PDF, JPG, PNG, WebP or MP4 file up to 8 MB.');
        }
        const id = crypto.randomUUID();
        await files.add(id, file);
        return Response.json({ file: { id } });
      }

      if (url.pathname.startsWith('/api/files/')) {
        const fileId = decodeURIComponent(url.pathname.split('/').at(-1) || '');
        const drawing = state.suite.drawings.find(item => item.fileId === fileId);
        if (!drawing) throw new DomainError('Drawing file is unavailable.', 404);
        const role = roleFor(actor, drawing.projectId);
        if (!enabled(state, drawing.projectId, 'design') || role === 'client' && !enabled(state, drawing.projectId, 'portal')) {
          throw new DomainError('Drawing access is disabled.', 403);
        }
        assertDrawingAccess(drawing, role);
        const { sampleDrawingBytes } = await import('../lib/sample-drawing-files');
        const sample = sampleDrawingBytes(fileId);
        const uploadedUrl = files.href(fileId);
        const uploaded = !sample && uploadedUrl ? await fetch(uploadedUrl) : undefined;
        const raw = sample ?? (uploaded?.ok ? await uploaded.arrayBuffer() : undefined);
        if (!raw) throw new DomainError('Drawing file is unavailable.', 404);
        const { watermarkDrawing } = await import('../lib/documents');
        const bytes = await watermarkDrawing(raw, drawing);
        return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf' } });
      }

      if (url.pathname === '/api/portal') return Response.json({ links: [] });
      if (url.pathname === '/api/client-view') {
        const projectId = url.searchParams.get('projectId') || '';
        if (!['admin','pm','client'].includes(roleFor(actor, projectId))) throw new DomainError('Client view is unavailable for this role.', 403);
        const portal = clientView(state, projectId);
        if (url.searchParams.has('export')) {
          const { exportWeeklyUpdate } = await import('../lib/weekly-download');
          return await exportWeeklyUpdate(portal, url.searchParams.get('week') || '', url.searchParams.get('export') || '');
        }
        return Response.json({ portal, organizationId: actor.organizationId, actor });
      }

      if (url.pathname.startsWith('/api/receipts/')) {
        const receiptId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
        const receipt = get(state.suite.receipts, receiptId, 'Sample receipt');
        const role = roleFor(actor, receipt.projectId);
        if (!['admin','pm','finance','accounts','client'].includes(role) || (role === 'client' && !enabled(state, receipt.projectId, 'portal'))) {
          throw new DomainError('Receipt access is unavailable for this role.', 403);
        }
        if (url.searchParams.get('format') === 'json') return Response.json({
          ...receipt, firm: state.firm,
          project: state.projects.find((project) => project.id === receipt.projectId)?.name,
          status: receipt.voidedAt ? 'void' : 'active',
        });
        const { receiptPdf } = await import('../lib/documents');
        const pdf = await receiptPdf(state, receipt, href('/receipts/' + receipt.id));
        return new Response(pdf.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf' } });
      }

      throw new DomainError('This operation requires the hosted pilot.', 404);
    } catch (error) {
      const status = error instanceof DomainError ? error.status : 400;
      return Response.json({ error: error instanceof Error ? error.message : 'The demo could not save this change.' }, { status });
    }
  };

  return {
    request,
    href,
    demo: {
      role: previewRole,
      switchRole(role: string, projectId: string, currentView?: string) {
        if (role === 'client' && projectId) {
          location.assign(href('/client/' + projectId));
          return;
        }
        const view = role === 'foreman' || (role === 'admin' || role === 'pm') && currentView === 'design' ? 'design' : 'finance';
        const query = new URLSearchParams({ view, as: role, project: projectId });
        location.assign(new URL('?' + query, root));
      },
      async reset() {
        await files.clear();
        localStorage.removeItem(storageKey);
        location.replace(root.href);
      },
    },
  };
}
