import {createHash,randomBytes} from 'node:crypto';
import {cookies} from 'next/headers';
import {AdminError} from './admin-server';
import {serverSupabase} from './server-supabase';
export async function checkoutIdentity(create=false){const jar=await cookies();let token=jar.get('it_order_access')?.value;if(!token&&create){token=randomBytes(32).toString('hex');jar.set('it_order_access',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:60*60*24*30});}if(!token||!/^[a-f0-9]{64}$/.test(token))throw new AdminError(401,'Consulte pelo navegador em que o pedido foi criado.');return createHash('sha256').update(token).digest('hex');}
export const checkoutRpc=(name:string,body:unknown)=>serverSupabase(`/rest/v1/rpc/${name}`,{method:'POST',body});
