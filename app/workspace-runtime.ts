import type { Role } from '../lib/suite-types';
import { createContext, useContext } from 'react';

type WorkspaceRuntime = {
  request: typeof fetch;
  href: (path: string) => string;
  demo?: {
    reset: () => Promise<void>;
    role: string;
    switchRole: (role: string, projectId: string, view?: string) => void;
    onboarding?: boolean;
    onboardingHref?: string;
    scorecard?: { projectId: string };
    scorecardHref?: string;
    billing?: boolean;
    billingHref?: string;
    canPreviewRole?: (role: Role, projectId: string) => boolean;
    portfolio?: { href: string; asOf: string };
  };
};

export const WorkspaceRuntimeContext = createContext<WorkspaceRuntime>({
  request: (...args) => fetch(...args),
  href: (path) => path,
});

export function useWorkspaceRuntime() {
  return useContext(WorkspaceRuntimeContext);
}
