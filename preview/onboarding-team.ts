import { DomainError } from '../lib/domain';
import { readAssignedRoles, type TeamAccess } from '../lib/onboarding';
import type { Actor, Role, SuiteState } from '../lib/suite-types';

type Member = TeamAccess['members'][number] & {
  user_id: string; email: string; display_name: string; role: Role;
};
type Invite = TeamAccess['invites'][number] & { id: string; token: string; email: string; role: Role };
const assignable: readonly Role[] = ['pm', 'finance', 'accounts', 'architect', 'foreman', 'client'];

export function onboardingTeam(storageKey: string, root: URL, principal: Actor) {
  function read(): { members: Member[]; invites: Invite[] } {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : { members: [], invites: [] };
  }
  function projectRoles(value: unknown, state: SuiteState) {
    const entries = Object.entries((value ?? {}) as Record<string, Role>);
    if (!entries.length || entries.some(([id, role]) => !state.projects.some(project => project.id === id) || !assignable.includes(role))) {
      throw new DomainError('Assign a valid project and role.');
    }
    return entries;
  }
  return {
    actorFor(role: Role, projectId: string): Actor | undefined {
      const member = read().members.find(row => row.active === 1 && readAssignedRoles(row.project_roles)[projectId] === role);
      if (member) return {
        id: member.user_id, name: member.display_name, email: member.email, role: member.role,
        organizationId: principal.organizationId, projectRoles: readAssignedRoles(member.project_roles),
      };
    },
    list() {
      const team = read();
      const owner: Member = {
        user_id: principal.id, display_name: principal.name, email: principal.email, role: 'admin',
        project_roles: '{}', active: 1,
      };
      return { members: [owner, ...team.members], invites: team.invites.map(({ token: _token, ...invite }) => invite) };
    },
    update(input: Record<string, unknown>, state: SuiteState) {
      const team = read();
      if (input.action === 'invite') {
        const email = String(input.email ?? '').trim().toLowerCase();
        if (!/^[^\s@]+@example\.invalid$/.test(email) || email.length > 160) {
          throw new DomainError('Use a fictional email ending in @example.invalid for this rehearsal.');
        }
        if (team.members.some(member => member.email === email)) throw new DomainError('This rehearsal user already has a membership.');
        const entries = projectRoles(input.projectRoles, state);
        const invite: Invite = {
          id: crypto.randomUUID(), token: crypto.randomUUID(), email, role: entries[0][1],
          project_roles: JSON.stringify(Object.fromEntries(entries)),
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), revoked_at: null, claimed_at: null,
        };
        team.invites.push(invite);
        localStorage.setItem(storageKey, JSON.stringify(team));
        return {
          id: invite.id, expiresAt: invite.expires_at,
          inviteUrl: new URL('?' + new URLSearchParams({ demo: 'onboarding', invite: invite.token }), root).href,
        };
      }
      if (input.action === 'revoke-invite') {
        const invite = team.invites.find(row => row.id === input.inviteId && !row.claimed_at);
        if (invite) invite.revoked_at = new Date().toISOString();
      } else if (input.action === 'update-member') {
        const member = team.members.find(row => row.user_id === input.userId);
        if (!member) throw new DomainError('This rehearsal membership could not be found.', 404);
        const entries = projectRoles(input.projectRoles, state);
        member.project_roles = JSON.stringify(Object.fromEntries(entries));
        member.role = entries[0][1];
        member.active = input.active === false ? 0 : 1;
      } else {
        throw new DomainError('Choose a supported team action.');
      }
      localStorage.setItem(storageKey, JSON.stringify(team));
      return { ok: true };
    },
    claim(token: string) {
      const team = read();
      const invite = team.invites.find(row => row.token === token);
      const now = new Date().toISOString();
      if (!invite || invite.revoked_at || invite.claimed_at || invite.expires_at <= now) {
        throw new DomainError('This fictional invitation is invalid, expired, revoked or already used.', 410);
      }
      if (team.members.some(member => member.email === invite.email)) {
        throw new DomainError('This fictional account already has a membership.', 409);
      }
      invite.claimed_at = now;
      team.members.push({
        user_id: 'rehearsal-' + invite.id, email: invite.email, display_name: invite.email.split('@')[0],
        role: invite.role, project_roles: invite.project_roles, active: 1,
      });
      localStorage.setItem(storageKey, JSON.stringify(team));
      return { organizationId: principal.organizationId, role: invite.role };
    },
    reset() { localStorage.removeItem(storageKey); },
  };
}
