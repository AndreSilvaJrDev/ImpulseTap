import {z} from 'zod';
import {redirect} from 'next/navigation';
import {serviceSchema,networkSchema,packageSchema} from './catalog-schema';
import {ApiError} from './supabase-api';
export const adminServiceSchema=serviceSchema.extend({supplier_service_id:z.string().nullable(),supplier_cost_per_1000:z.number().nonnegative().nullable()});
const adminCatalogSchema=z.object({networks:z.array(networkSchema),services:z.array(adminServiceSchema)});
export type AdminService=z.infer<typeof adminServiceSchema>;
export type AdminCatalog=z.infer<typeof adminCatalogSchema>;
export const serviceEditSchema=z.object({active:z.boolean(),min:z.number().int().positive().nullable(),max:z.number().int().positive().nullable(),delivery:z.string().max(500),refill:z.string().max(500),supplier_service_id:z.string().max(100).nullable(),supplier_cost_per_1000:z.number().min(0).max(999999999999.99).multipleOf(.01).nullable(),packages:z.array(packageSchema)}).refine(v=>v.min===null||v.max===null||v.max>=v.min,{message:'O máximo não pode ser menor que o mínimo.'}).refine(v=>!v.active||v.packages.some(p=>(v.min===null||p.quantity>=v.min)&&(v.max===null||p.quantity<=v.max)),{message:'Cadastre um pacote dentro dos limites antes de ativar este serviço.'});
async function catalogRequest(body?:unknown){const res=await fetch('/api/admin/catalog',{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const data=await res.json();if(!res.ok)throw new ApiError(data.error||'Não foi possível acessar o catálogo.',res.status);return data;}
export async function adminSignIn():Promise<never>{redirect('/admin/login');}
export const getAdminCatalog=async(_token:string)=>{void _token;return adminCatalogSchema.parse(await catalogRequest())};
export const updateNetwork=(_token:string,id:string,active:boolean,version:number)=>catalogRequest({kind:'network',id,version,data:active});
export const updateService=(_token:string,service:AdminService)=>catalogRequest({kind:'service',id:service.id,version:service.version,data:serviceEditSchema.parse(service)});
export const adminSignOut=async(_token:string)=>{void _token;await fetch('/api/admin/session',{method:'DELETE'});redirect('/admin/login')};
