import ReceiptStatus from '../../receipt-status';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{org?:string}>}){const {id}=await params,{org=''}=await searchParams;return <ReceiptStatus id={id} org={org}/>;}
