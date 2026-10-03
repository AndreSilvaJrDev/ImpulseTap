import {z} from 'zod';
import {requireAdmin,adminRpc,sameOrigin,jsonBody,apiFailure} from '@/lib/admin-server';
const action=z.discriminatedUnion('action',[
 z.object({action:z.literal('note'),data:z.object({note:z.string().trim().min(1).max(2000)}).strict()}),
 z.object({action:z.literal('finance'),data:z.object({gateway_fee:z.number().int().nonnegative().max(100000000)}).strict()}),
 z.object({action:z.literal('manual_paid'),data:z.object({confirmation:z.string().max(50),reason:z.string().trim().min(10).max(1000)}).strict()}),
 z.object({action:z.literal('refund'),data:z.object({confirmation:z.string().max(50),reason:z.string().trim().min(10).max(1000),amount:z.number().int().positive()}).strict()}),
 z.object({action:z.literal('submit'),data:z.object({item_id:z.uuid(),supplier_order_id:z.string().trim().min(1).max(100),supplier_name:z.string().trim().min(1).max(100)}).strict()}),
 z.object({action:z.literal('status'),data:z.object({status:z.enum(['processing','in_progress','partial','completed','supplier_error','cancelled']),confirmation:z.string().max(50).optional()}).strict()})]);
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const admin=await requireAdmin();const id=z.uuid().parse((await params).id);const body=await jsonBody(request);const {version}=z.object({version:z.number().int().positive()}).parse(body);const parsed=action.parse(body);return Response.json(await adminRpc('impulsetap_admin_order_action',{p_id:id,p_version:version,p_action:parsed.action,p_data:parsed.data},admin.token),{headers:{'Cache-Control':'no-store'}});}catch(e){return apiFailure(e)}}
