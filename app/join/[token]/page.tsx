import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loginPagePath } from '../../../lib/auth-navigation';
import { getChatGPTUser } from '../../chatgpt-auth';
import JoinClient from '../../join-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Join your project team | CoreConstruct', referrer: 'no-referrer' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!await getChatGPTUser()) redirect(loginPagePath('/join/' + token));
  return <JoinClient token={token} />;
}
