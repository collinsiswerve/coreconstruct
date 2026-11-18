import { addDays, dateKey, DomainError, type ReportNote } from './domain';
import type { clientView } from './security';

export type ClientProject = ReturnType<typeof clientView>;

export function publishedWeeklyUpdate(project: ClientProject, weekStart: string) {
  const note = project.reports.find(report => report.weekStart === weekStart);
  if (!note) throw new DomainError('This weekly update is not currently published.', 404);
  return note;
}

export function weeklyUpdateContent(project: ClientProject, note: ReportNote) {
  const end = addDays(note.weekStart, 6);
  const media = project.media
    .filter(item => {
      const day = dateKey(new Date(item.createdAt));
      return day >= note.weekStart && day <= end;
    })
    .map(item => item.caption);
  const sections: [string, string][] = [
    ['Work this week', note.summary],
    ['Next steps', note.nextSteps],
    ['Decisions and open issues', note.risks],
  ];
  if (media.length) sections.push(['Published evidence', media.join('\n')]);
  return {
    firm: project.firm,
    name: project.project.name,
    location: project.project.location,
    period: note.weekStart + ' to ' + end,
    progress: note.progress,
    stage: note.stage,
    copy: project.project.demo ? 'Published client update · fictional sample' : 'Published client update',
    sections,
  };
}

export function weeklyUpdateRows(project: ClientProject, note: ReportNote): (string | number)[][] {
  const update = weeklyUpdateContent(project, note);
  return [
    ['Weekly project update', update.copy],
    ['Project', update.name],
    ['Firm', update.firm],
    ['Location', update.location],
    ['Week starting', note.weekStart],
    ['Week ending', addDays(note.weekStart, 6)],
    ['Reported progress (%)', update.progress],
    ['Stage', update.stage],
    ...update.sections.map(([title, value]) => [title, value]),
  ];
}

export function weeklyDownload(weekStart: string, format: string, bytes: Uint8Array) {
  return new Response(bytes.slice().buffer as ArrayBuffer, {
    headers: {
      'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="coreconstruct-weekly-update-${weekStart}.${format}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
