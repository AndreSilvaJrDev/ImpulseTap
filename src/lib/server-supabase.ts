const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
export const hasServerSupabase=Boolean(url&&key);
export class ServerDbError extends Error {constructor(message:string,public status=500){super(message)}}

export async function serverSupabase(path:string,options:{method?:string;body?:unknown;headers?:Record<string,string>}={}){
 if(!url||!key)throw new ServerDbError('O banco do servidor ainda não foi configurado.',503);
 const response=await fetch(`${url}${path}`,{method:options.method??'GET',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body),cache:'no-store',signal:AbortSignal.timeout(15000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok)throw new ServerDbError(typeof data?.message==='string'?data.message:'Não foi possível acessar o banco.',response.status);
 return data;
}

export const serverSelect=(table:string,query:string)=>serverSupabase(`/rest/v1/${table}?${query}`);
export const serverInsert=(table:string,body:unknown)=>serverSupabase(`/rest/v1/${table}`,{method:'POST',body});
export const serverUpdate=(table:string,query:string,body:unknown)=>serverSupabase(`/rest/v1/${table}?${query}`,{method:'PATCH',body});
