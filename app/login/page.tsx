import type { Metadata } from 'next';
import { getChatGPTUser } from '../chatgpt-auth';
import { chatGPTSignInPath, workspaceReturnPath } from '../../lib/auth-navigation';
import { mayOpenWorkspace } from '../../lib/server';
import { SignInScreen } from '../sign-in-screen';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sign in | CoreConstruct', referrer: 'no-referrer' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const requested = workspaceReturnPath(next);
  const returnTo = requested === '/login' ? '/' : requested;
  const invitation = returnTo.startsWith('/join/');
  const user = await getChatGPTUser();
  const state = !user ? 'sign-in' : invitation || await mayOpenWorkspace(user) ? 'welcome' : 'invitation-required';
  return <SignInScreen state={state} image="/portfolio/samples/portfolio/m6-09/concept.jpg" invitation={invitation}
    signInHref={chatGPTSignInPath(returnTo)} continueHref={returnTo} />;
}
