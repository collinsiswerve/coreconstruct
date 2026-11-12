import { createContext, useContext } from 'react';

type WorkspaceRuntime = {
  request: typeof fetch;
  href: (path: string) => string;
  demo?: { reset: () => Promise<void> };
};

export const WorkspaceRuntimeContext = createContext<WorkspaceRuntime>({
  request: (...args) => fetch(...args),
  href: (path) => path,
});

export function useWorkspaceRuntime() {
  return useContext(WorkspaceRuntimeContext);
}
