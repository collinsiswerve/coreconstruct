import { PortalClient } from '../../portal-client';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{org?:string}>}){const {id}=await params,{org=''}=await searchParams;return <PortalClient projectId={id} organizationId={org}/>;}
