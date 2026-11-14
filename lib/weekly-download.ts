import { weeklyUpdatePdf } from './weekly-pdf';
import { weeklyWorkbook } from './weekly-workbook';
import { DomainError } from './domain';
import { publishedWeeklyUpdate, weeklyDownload, weeklyUpdateRows, type ClientProject } from './weekly-update';

export async function exportWeeklyUpdate(project: ClientProject, weekStart: string, format: string) {
  if (format !== 'pdf' && format !== 'xlsx') throw new DomainError('Choose PDF or Excel.');
  const note = publishedWeeklyUpdate(project, weekStart);
  if (format === 'pdf') {
    return weeklyDownload(weekStart, format, await weeklyUpdatePdf(project, note));
  }
  return weeklyDownload(weekStart, format, weeklyWorkbook(weeklyUpdateRows(project, note)));
}
