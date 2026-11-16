import { redirect } from 'next/navigation';
import { mayOpenWorkspace } from '../lib/server';
import { loginPagePath } from '../lib/auth-navigation';
import { getChatGPTUser } from './chatgpt-auth';
import Workspace from './workspace';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await getChatGPTUser();
  if (!user || !await mayOpenWorkspace(user)) {
    const { view } = await searchParams;
    redirect(loginPagePath(view ? '/?' + new URLSearchParams({ view }) : '/'));
  }
  return <Workspace />;
}
