import {notFound} from 'next/navigation';
import {z} from 'zod';
import {adminPage,adminRpc,AdminError} from '@/lib/admin-server';
import {OrderWorkbench} from '@/components/order-workbench';
export default async function Page({params}:{params:Promise<{id:string}>}){
 const admin=await adminPage();const {id}=await params;
 if(!z.uuid().safeParse(id).success)notFound();
 let order;
 try{order=await adminRpc('impulsetap_admin_order',{p_id:id},admin.token)}
 catch(e){if(e instanceof AdminError&&e.status===404)notFound();throw e}
 return <OrderWorkbench initial={order}/>;
}
