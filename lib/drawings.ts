import { DomainError } from './domain';
import type { Drawing, Role } from './suite-types';

export function assertDrawingAccess(drawing: Drawing, role: Role) {
  if (role === 'foreman' && drawing.status !== 'current') {
    throw new DomainError('This revision is not current for construction.', 410);
  }
  if ((role === 'client' && (drawing.status !== 'current' || !drawing.published)) || role === 'accounts' || role === 'finance') {
    throw new DomainError('File not found.', 404);
  }
}
