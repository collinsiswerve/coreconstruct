import { assertDrawingAccess } from '../lib/drawings';
import { sampleEvidenceAsset } from '../lib/sample-client-updates';
import { DomainError, emptyState, type Command } from '../lib/domain';
import { authorize, clientView, filterState, roleFor } from '../lib/security';
import { enabled, executeSuite, get, normalizeState } from '../lib/suite';
import { addSampleComparisonProjects, isFinanceSample, sampleProjectCount } from '../lib/sample-projects';
import type { Actor, Role, SuiteState } from '../lib/suite-types';
import { openDemoFiles } from './files';
import { addSampleFinance, principal, sampleWorkspace } from './sample';
import { isPortfolioProject, portfolioActor, portfolioAsOf, portfolioFileAsset, portfolioWorkspace } from './portfolio-state';

import { defaultFirmName } from '../lib/onboarding';
import { onboardingTeam } from './onboarding-team';
import { addScorecardSample, scorecardSampleProject } from './scorecard-sample';

const storageKey = 'coreconstruct-pages-demo-v1';
const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4']);

export async function createDemoRuntime() {
  const root = new URL('./', window.location.href);
  const params = new URLSearchParams(window.location.search);
  const receiptProject = (params.get('receipt') || params.get('receiptPdf') || '').split(':')[0];
  const drawingProject = (params.get('drawing') || '').split(':')[0];
  const isOnboarding = params.get('demo') === 'onboarding';
  const isScorecard = params.get('demo') === 'scorecard';
  const isBilling = params.get('demo') === 'billing';
  const isPortfolio = !isOnboarding && !isBilling && (isScorecard || root.pathname.endsWith('/portfolio/') || params.get('demo') === 'portfolio' || params.get('view') === 'portfolio' || [params.get('client'), params.get('project'), receiptProject, drawingProject]
    .some(id => id && isPortfolioProject(id)));
  const storage = isBilling ? 'coreconstruct-m8-billing-v1' : isOnboarding ? 'coreconstruct-m7-onboarding-v1' : isScorecard ? 'coreconstruct-m7-scorecard-v1' : isPortfolio ? 'coreconstruct-m6-portfolio-v1' : storageKey;
  const files = await openDemoFiles(isBilling ? '-m8-billing' : isOnboarding ? '-m7-onboarding' : isScorecard ? '-m7-scorecard' : isPortfolio ? '-m6' : '');
  const onboardingPrincipal: Actor = {
    ...principal, id: 'rehearsal-principal', name: 'Rehearsal principal',
    email: 'principal@example.invalid', organizationId: 'ridgeway-onboarding',
  };
  const billingPrincipal: Actor = { ...onboardingPrincipal, organizationId: 'ridgeway-billing' };
  const team = isOnboarding ? onboardingTeam(storage + '-team', root, onboardingPrincipal) : undefined;
  function withDemo(query: URLSearchParams) {
    if (params.get('theme') === 'site-ultra') query.set('theme', 'site-ultra');
    if (isOnboarding) query.set('demo', 'onboarding');
    else if (isBilling) query.set('demo', 'billing');
    else if (isScorecard) query.set('demo', 'scorecard');
    else if (isPortfolio) query.set('demo', 'portfolio');
    return query;
  }
  const appearance: Record<string, string> = params.get('theme') === 'site-ultra' ? { theme: 'site-ultra' } : {};
  const setupUrl = new URL('?' + new URLSearchParams({ demo: 'onboarding', ...appearance }), root).href;
  const scorecardUrl = new URL('?' + new URLSearchParams({ demo: 'scorecard', view: 'pilot', project: scorecardSampleProject, ...appearance }), root).href;
  const billingUrl = new URL('?' + new URLSearchParams({ demo: 'billing', view: 'billing', ...appearance }), root).href;
  const requestedRole = params.get('as');
  const previewRole = requestedRole === 'pm' || requestedRole === 'accounts' || requestedRole === 'finance' || requestedRole === 'foreman' || requestedRole === 'architect' ? requestedRole : 'admin';
  let current = isOnboarding || isBilling ? normalizeState({ ...emptyState(), firm: isBilling ? 'Ridgeway Works' : defaultFirmName })
    : isPortfolio ? portfolioWorkspace() : sampleWorkspace();
  if (isScorecard) addScorecardSample(current);

  function save(state: SuiteState) {
    current = state;
    localStorage.setItem(storage, JSON.stringify(state));
  }

  function read() {
    const raw = localStorage.getItem(storage);
    if (raw) {
      const state = JSON.parse(raw) as SuiteState;
      if (state.schemaVersion === 1 && state.suite?.version === 2) {
        const previousCount = state.projects.length;
        current = normalizeState(state);
        if (params.get('theme') === 'site-ultra') current.suite.brand.theme = 'site-ultra';
        if (isPortfolio || isOnboarding || isBilling) return current;
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
      if (drawing) {
        const query = new URLSearchParams({ drawing: fileId });
        const client = params.get('client') || params.get('forClient');
        if (client) query.set('forClient', client);
        if (params.get('as')) {
          query.set('as', params.get('as')!);
          query.set('project', params.get('project') || '');
        }
        return new URL('?' + withDemo(query), root).href;
      }
      const portfolio = isPortfolio && portfolioFileAsset(fileId);
      if (portfolio) {
        const state = read();
        const projectId = fileId.split(':')[0];
        const role = roleFor(actorFor(state), projectId);
        const published = state.suite.media.some(item => item.fileId === fileId && item.published);
        if (role === 'client' && !published) return '#';
        return new URL(portfolio, root).href;
      }
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
    if (kind === 'client' && type) {
      const query = new URLSearchParams({ client: decodeURIComponent(type) });
      return new URL('?' + withDemo(query), root).href;
    }
    return new URL(path.replace(/^\//, ''), root).href;
  }

  function actorFor(state: SuiteState): Actor {
    const client = params.get('client') || params.get('forClient');
    const role = client ? 'client' : previewRole;
    if (role === 'admin') return isBilling ? billingPrincipal : isOnboarding ? onboardingPrincipal : isPortfolio ? portfolioActor('admin') : principal;
    if (team) {
      const projectId = client || params.get('project') || state.projects[0]?.id || '';
      return team.actorFor(role, projectId) ?? {
        ...onboardingPrincipal, id: 'rehearsal-unassigned', name: 'Unassigned rehearsal user',
        email: 'unassigned@example.invalid', role: 'client', projectRoles: {},
      };
    }
    if (isPortfolio) return portfolioActor(role, client || params.get('project') || state.projects[0]?.id);
    const project = client ? state.projects.find(item => item.id === client)
      : state.projects.find(item => item.id === params.get('project')) || state.projects.find(isFinanceSample);
    const names = { client: 'Sample client', pm: 'Demo PM / QS', accounts: 'Demo Accounts', finance: 'Demo Finance', architect: 'Demo Architect', foreman: 'Demo foreman' };
    return {
      id: 'demo-' + role,
      name: names[role],
      email: role + '@example.invalid',
      role,
      organizationId: isBilling ? billingPrincipal.organizationId : principal.organizationId,
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

      if (team && url.pathname === '/api/team') {
        if (actor.role !== 'admin') throw new DomainError('Only the principal can manage team access.', 403);
        return Response.json(method === 'POST' ? team.update(JSON.parse(String(init?.body)), state) : team.list());
      }
      if (team && url.pathname === '/api/invitations' && method === 'POST') {
        return Response.json(team.claim(String(JSON.parse(String(init?.body)).token || '')));
      }
      if (url.pathname === '/api/workspace' && method === 'GET') return response();

      if (url.pathname === '/api/workspace' && method === 'POST') {
        const command = JSON.parse(String(init?.body)) as Command;
        if (command.type.startsWith('subscription.') && !isBilling) throw new DomainError('Open the billing demo to test a subscription.', 404);
        if (isBilling && !command.type.startsWith('subscription.')) throw new DomainError('Use the project demo to record project activity.', 404);
        if ((isPortfolio || isOnboarding) && command.type.startsWith('demo.') && command.type.endsWith('.load')) {
          throw new DomainError(isOnboarding ? 'Use the workspace setup steps to add your fictional records.'
            : 'The portfolio already has fictional project records.');
        }
        delete command.payload.nationalId;
        delete command.payload.mpesaPhone;
        delete command.payload.protected;
        authorize(state, command, actor);
        const syntheticDate = isPortfolio && command.type === 'variation.decide' ? portfolioAsOf + 'T08:00:00.000Z' : undefined;
        state = executeSuite(state, command, actor, syntheticDate);
        if (command.type === 'brand.update') params.delete('theme');
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
        const portfolio = isPortfolio && portfolioFileAsset(fileId);
        const source = portfolio ? new URL(portfolio, root).href : uploadedUrl;
        const uploaded = !sample && source ? await fetch(source) : undefined;
        const raw = sample ?? (uploaded?.ok ? await uploaded.arrayBuffer() : undefined);
        if (!raw) throw new DomainError('Drawing file is unavailable.', 404);
        const { watermarkDrawing } = await import('../lib/documents');
        const bytes = await watermarkDrawing(raw, drawing);
        return new Response(bytes.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': 'application/pdf' } });
      }

      if (url.pathname === '/api/portal') return Response.json({ links: [] });
      if (url.pathname === '/api/client-view') {
        const projectId = url.searchParams.get('projectId') || '';
        if (!projectId || !['admin','pm','client'].includes(roleFor(actor, projectId))) throw new DomainError('Client view is unavailable for this role.', 403);
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
      onboarding: isOnboarding,
      onboardingHref: setupUrl,
      scorecardHref: scorecardUrl,
      billing: isBilling,
      billingHref: billingUrl,
      ...(isScorecard && { scorecard: { projectId: scorecardSampleProject } }),
      ...(team && { canPreviewRole: (role: Role, projectId: string) => role === 'admin' || !!team.actorFor(role, projectId) }),
      ...(isPortfolio && { portfolio: { href: new URL('?' + withDemo(new URLSearchParams({ view: 'portfolio' })), root).href, asOf: portfolioAsOf } }),
      switchRole(role: string, projectId: string, currentView?: string) {
        if (role === 'client' && projectId) {
          location.assign(href('/client/' + projectId));
          return;
        }
        const view = isBilling ? 'billing' : isOnboarding && ['admin', 'pm', 'foreman', 'architect'].includes(role)
          ? ({ admin: 'onboarding', pm: 'wagebills', foreman: 'attendance', architect: 'design' } as Record<string, string>)[role]
          : isScorecard && (role === 'admin' || role === 'pm') && currentView === 'pilot' ? 'pilot'
          : ['admin','pm'].includes(role) && currentView === 'portfolio' ? 'portfolio'
          : role === 'foreman' || (role === 'admin' || role === 'pm') && currentView === 'design' ? 'design' : 'finance';
        const query = new URLSearchParams({ view, as: role, project: projectId });
        location.assign(new URL('?' + withDemo(query), root));
      },
      async reset() {
        await files.clear();
        localStorage.removeItem(storage);
        team?.reset();
        if (isOnboarding) localStorage.removeItem('cc-m7-setup-project');
        if (isScorecard) localStorage.removeItem('cc-m7-scorecard-project');
        location.replace(isBilling ? billingUrl : isOnboarding ? setupUrl : isScorecard ? scorecardUrl : isPortfolio ? new URL('?demo=portfolio&view=portfolio', root).href : root.href);
      },
    },
  };
}
