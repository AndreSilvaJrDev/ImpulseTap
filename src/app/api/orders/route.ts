import {z} from 'zod';
import {sameOrigin,jsonBody,apiFailure,AdminError} from '@/lib/admin-server';
import {checkoutIdentity,checkoutRpc} from '@/lib/checkout-server';
import {customerSchema,validateLinks} from '@/lib/validation';
import {catalogSchema} from '@/lib/catalog-schema';
import {serverSupabase} from '@/lib/server-supabase';
const links=z.array(z.object({url:z.string().max(2048),quantity:z.number().int().positive()}).strict()).min(1).max(10);
const item=z.union([z.object({package_id:z.string().min(1).max(100),links,bump_id:z.string().max(100).optional()}).strict(),z.object({service_id:z.string().min(1).max(100),quantity:z.number().int().positive(),links}).strict()]);
export async function POST(request:Request){try{
 sameOrigin(request);
 if(process.env.CHECKOUT_ENABLED!=='true')throw new AdminError(503,'As vendas ainda não estão abertas. Nenhuma cobrança foi realizada.');
 const input=z.object({request_key:z.uuid(),customer:customerSchema,items:z.array(item).min(1).max(20)}).strict().parse(await jsonBody(request));
 const hash=await checkoutIdentity(true);
 const catalog=catalogSchema.parse(await serverSupabase('/rest/v1/rpc/impulsetap_public_catalog',{method:'POST',body:{}}));
 const custom=input.items.some(choice=>'service_id' in choice);
 for(const choice of input.items){const service='service_id' in choice?catalog.services.find(s=>s.id===choice.service_id):catalog.services.find(s=>s.packages.some(p=>p.id===choice.package_id));const qty='quantity' in choice?choice.quantity:service?.packages.find(p=>p.id===choice.package_id)?.quantity;if(!service||qty===undefined)throw new AdminError(422,'Produto indisponível.');const error=validateLinks(choice.links,service,qty,choice.links.length>1);if(error)throw new AdminError(422,error);}
 if(custom&&!input.items.every(choice=>'service_id' in choice))throw new AdminError(422,'Misture somente itens do mesmo formato de checkout.');
 return Response.json(await checkoutRpc(custom?'impulsetap_create_custom_order':'impulsetap_create_order',{p_request:input.request_key,p_access_hash:hash,p_customer:input.customer,p_items:input.items}),{status:201,headers:{'Cache-Control':'no-store'}});
}catch(e){return apiFailure(e)}}
