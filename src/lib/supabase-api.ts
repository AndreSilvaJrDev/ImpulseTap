// Only the Supabase publishable/anon key belongs in browser code. Authorization lives in Postgres.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,'');
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const hasSupabase=Boolean(url&&key);
export class ApiError extends Error {constructor(message:string,public status:number){super(message)}}
export async function supabaseRequest(path:string,body:unknown,token?:string){
 if(!url||!key)throw new ApiError('A conexão com o banco ainda não foi configurada.',503);
 const response=await fetch(`${url}${path}`,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const data=await response.json().catch(()=>null);
 if(!response.ok){const code=data?.code;const message=code==='IT409'?'Este registro mudou em outra sessão. Recarregue antes de salvar.':code==='IT422'?'Confira os valores, limites e pacotes antes de salvar.':response.status===401?'Sua sessão expirou. Entre novamente.':response.status===403||code==='42501'?'Esta conta não está autorizada a administrar o catálogo.':path.includes('/token')?'Não foi possível entrar. Confira seu e-mail e senha.':'Não foi possível acessar o catálogo. Tente novamente.';throw new ApiError(message,response.status);}
 return data;
}
export const rpc=(name:string,body:unknown={},token?:string)=>supabaseRequest(`/rest/v1/rpc/${name}`,body,token);
