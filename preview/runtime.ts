import { DomainError, type Command } from '../lib/domain';
import { authorize, clientView, filterState } from '../lib/security';
import { executeSuite, get } from '../lib/suite';
import type { Actor, SuiteState } from '../lib/suite-types';
import { openDemoFiles } from './files';
import { principal, sampleWorkspace } from './sample';

const storageKey = 'coreconstruct-pages-demo-v1';
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']);

export async function createDemoRuntime() {
  const root = new URL('./', window.location.href);
  const files = await openDemoFiles();
  let current = sampleWorkspace();

  function save(state: SuiteState) {
    current = state;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function read() {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const state = JSON.parse(raw) as SuiteState;
      if (state.schemaVersion === 1 && state.suite?.version === 2) current = state;
    } else {
      save(current);
    }
    return current;
  }

  function href(path: string) {
    const url = new URL(path, root);
    const [, kind, type, id] = url.pathname.split('/');
    if (kind === 'api' && type === 'files' && id) {
      const sample = { 'floor-plan-r1': 'floor-plan-r1.pdf', 'floor-plan-r2': 'floor-plan-r2.pdf' }[id];
      return sample ? new URL('samples/' + sample, root).href : files.href(id) || '#';
    }
    if (kind === 'api' && type === 'receipts' && id) return new URL('?receiptPdf=' + encodeURIComponent(id), root).href;
    if (kind === 'client' && type) return new URL('?client=' + encodeURIComponent(type), root).href;
    if (kind === 'receipts' && type) return new URL('?receipt=' + encodeURIComponent(type), root).href;
    return new URL(path.replace(/^\//, ''), root).href;
  }

  function actorFor(state: SuiteState): Actor {
    const projectId = new URLSearchParams(window.location.search).get('client');
    if (!projectId || !state.projects.some((p) => p.id === projectId)) return principal;
    return {
      id: 'demo-client',
      name: 'Sample client',
      email: 'client@example.invalid',
      role: 'client',
      organizationId: principal.organizationId,
      projectRoles: { [projectId]: 'client' },
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

      if (url.pathname === '/api/portal') return Response.json({ links: [] });
      if (url.pathname === '/api/client-view') {
        const projectId = url.searchParams.get('projectId') || '';
        return Response.json({ portal: clientView(state, projectId), organizationId: actor.organizationId, actor });
      }

      if (url.pathname.startsWith('/api/receipts/')) {
        const receipt = get(state.suite.receipts, url.pathname.split('/').at(-1), 'Sample receipt');
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
      async reset() {
        await files.clear();
        localStorage.removeItem(storageKey);
        location.replace(root.href);
      },
    },
  };
}
