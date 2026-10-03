import {notFound} from 'next/navigation';
import {checkoutIdentity,checkoutRpc} from '@/lib/checkout-server';
import {cash,dateTime,paymentLabels,deliveryLabels} from '@/lib/operations';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{codigo:string}>}){
 const {codigo}=await params;if(!/^IT-[A-F0-9]{12}$/.test(codigo))notFound();
 let order;
 try{order=await checkoutRpc('impulsetap_customer_order',{p_code:codigo,p_access_hash:await checkoutIdentity()})}catch{return <section className="container orders-page"><h1>Acesso ao pedido indisponível</h1><p>Abra no navegador em que você criou o pedido. Se o problema persistir, fale com o suporte.</p></section>}
 if(!order)notFound();
 return <section className="container orders-page"><h1>Pedido {order.public_id}</h1><p>{dateTime(order.created_at)}</p><article className="order-card"><h2>{deliveryLabels[order.status]??'Processando'}</h2><p>Pagamento: {paymentLabels[order.payment_status]}</p><p>Total: {cash(order.total)}</p>{order.items.map((item:{name:string;quantity:number;unit:string},i:number)=><p key={i}>{item.name} · {item.quantity.toLocaleString('pt-BR')} {item.unit}</p>)}</article><p>Atualize esta página para consultar o andamento. Nenhum custo interno ou dado do fornecedor é exibido aqui.</p></section>
}
