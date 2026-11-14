import { addDays, dateKey, DomainError, monday } from './domain';
import type { SuiteState } from './suite-types';

export const clientUpdatesSampleId = 'sample-drawings-and-client-updates';

export function sampleEvidenceAsset(fileId: string) {
  return fileId === clientUpdatesSampleId + ':field-note' ? '/samples/canopy-field-note.png' : undefined;
}

export function addSampleClientUpdates(state: SuiteState, at: string) {
  const projectId = clientUpdatesSampleId;
  if (state.projects.some(project => project.id === projectId)) throw new DomainError('The sample walkthrough is already available.');
  const weekStart = addDays(monday(dateKey(new Date(at))), -7);
  const issueTime = weekStart + 'T08:00:00Z';
  state.projects.push({
    id: projectId, name: 'Sample residence · client updates', location: 'Kiambu · fictional site', client: 'Sample client',
    budgetCents: 180_000_000, contractCents: 225_000_000, mode: 'fixed', stage: 'Superstructure', progress: 32,
    demo: true, sampleWalkthrough: 'drawings-client-updates', createdAt: at,
  });
  for (const revision of [1, 2]) {
    const current = revision === 1;
    state.suite.drawings.push({
      id: projectId + ':drawing:' + revision, projectId, sheetCode: 'A-101',
      title: current ? 'Ground-floor plan' : 'Ground-floor plan · revised entrance canopy',
      category: 'Design drawings', discipline: 'Architectural', revision, status: current ? 'current' : 'draft',
      fileId: projectId + ':pdf:' + revision, published: current, uploadedBy: 'sample-design-team',
      uploadedAt: current ? issueTime : at, ...(current ? { issuedBy: 'sample-design-team', issuedAt: issueTime } : {}),
    });
  }
  state.reports.push({
    id: projectId + ':report', projectId, weekStart, progress: 32, stage: 'Superstructure', updatedAt: at,
    summary: 'Ground-floor walling progressed and the team checked the entry setting-out against A-101.',
    nextSteps: 'Complete the column formwork and coordinate the revised canopy detail with the site team.',
    risks: 'The entrance canopy variation is awaiting a client decision.',
  });
  state.suite.media.push({
    id: projectId + ':media', projectId, fileId: projectId + ':field-note', contentType: 'image/png',
    caption: 'Entrance canopy field note · fictional inspection sketch', stage: 'Superstructure',
    location: { status: 'missing', exceptionReason: 'Fictional field note' },
    submittedBy: 'sample-site-team', createdAt: addDays(weekStart, 3) + 'T08:15:00Z', published: false,
  });
  state.suite.variations.push({
    id: projectId + ':variation', projectId, number: 'VO-DEMO-M4-001',
    title: 'Entrance canopy extension', description: 'Extend the sample entrance canopy by 600 mm for rain cover.',
    revision: 1, clientDeltaCents: 4_800_000, internalDeltaCents: 3_500_000, days: 2,
    affectsCompletion: false, programmeReason: 'Canopy fabrication can run alongside walling.',
    status: 'sent', submittedBy: 'sample-design-team', createdAt: at, sentAt: at,
  });
}
