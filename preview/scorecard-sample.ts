import { addDays } from '../lib/domain';
import { savePilotBaseline, savePilotCycle, savePilotRenewal } from '../lib/pilot-scorecard';
import type { SuiteState } from '../lib/suite-types';

export const scorecardSampleProject = 'm6-09';
const baselineWeek = '2026-09-21';
const at = '2026-11-15T08:00:00.000Z';
const reviewer = 'portfolio-admin';

export function addScorecardSample(state: SuiteState) {
  const baseline = savePilotBaseline({
    revision: 0, weekStart: baselineWeek, wagebillMinutes: 60, reportMinutes: 90,
    evidence: 'Fictional existing-process timing sheet',
  }, undefined, at, reviewer);
  const examples = [
    [52, 73, 20, 17, 42],
    [48, 64, 22, 18, 35],
    [45, 59, 25, 21, 26],
    [42, 57, 24, 22, 22],
    [38, 53, 25, 22, 17],
    [35, 49, 29, 27, 14],
  ];
  const cycles = Object.fromEntries(examples.map(([wagebillMinutes, reportMinutes, scheduled, onTime, supportMinutes], index) => {
    const weekStart = addDays(baselineWeek, (index + 1) * 7);
    return [weekStart, savePilotCycle({
      revision: 0, weekStart, closedOn: addDays(weekStart, 4), wagebillMinutes, reportMinutes, scheduled, onTime, supportMinutes,
      wageDifference: 0, costDifference: 0, clientDifference: index === 4 ? 750 : 0,
      evidence: 'JUNIPER-PILOT-' + String(index + 1).padStart(2, '0'),
      notes: index === 4 ? 'Check the client receipt timing against the closing statement.' : '',
    }, undefined, at, reviewer)];
  }));
  state.suite.pilot.projects[scorecardSampleProject] = { baseline, cycles };
  state.suite.pilot.renewal = savePilotRenewal({
    revision: 0, response: 'considering', checkedOn: '2026-11-06', evidence: 'Fictional principal review notes',
  }, undefined, at, reviewer);
}
