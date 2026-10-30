import JoinClient from '../../join-client';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;return <JoinClient token={token}/>;}
