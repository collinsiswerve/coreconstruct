import { redirect } from 'next/navigation';
import { loginPagePath } from '../../../lib/auth-navigation';
import { getChatGPTUser } from '../../chatgpt-auth';
import { PortalClient } from '../../portal-client';

export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
  const { org = '' } = await searchParams;
  if (!await getChatGPTUser()) redirect(loginPagePath('/client/' + encodeURIComponent(id) + (org ? '?' + new URLSearchParams({ org }) : '')));
  return <PortalClient projectId={id} organizationId={org} />;
}
