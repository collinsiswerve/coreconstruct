import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loginPagePath } from '../../../lib/auth-navigation';
import { getChatGPTUser } from '../../chatgpt-auth';
import { PortalClient } from '../../portal-client';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client project view | CoreConstruct', referrer: 'no-referrer' };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!await getChatGPTUser()) redirect(loginPagePath('/portal/' + token));
  return <PortalClient token={token} />;
}
