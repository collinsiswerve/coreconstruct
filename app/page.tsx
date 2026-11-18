import { redirect } from 'next/navigation';
import { mayOpenWorkspace } from '../lib/server';
import { loginPagePath } from '../lib/auth-navigation';
import { getChatGPTUser } from './chatgpt-auth';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; project?: string; week?: string }> }) {
  const user = await getChatGPTUser();
  if (!user || !await mayOpenWorkspace(user)) {
    const params = await searchParams;
    const query = new URLSearchParams();
    for (const key of ['view', 'project', 'week'] as const) {
      if (typeof params[key] === 'string') query.set(key, params[key]);
    }
    redirect(loginPagePath(query.size ? '/?' + query : '/'));
  }
  return <Workspace />;
}
