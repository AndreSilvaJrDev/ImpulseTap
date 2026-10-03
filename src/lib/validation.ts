import {z} from 'zod';
import {getNetwork,type Service} from './catalog';
export const customerSchema=z.object({name:z.string().trim().min(2,'Informe seu nome.').max(100,'Use até 100 caracteres.'),email:z.email('Confira seu e-mail.').max(254),phone:z.string().refine(v=>!v||/^\+?[\d\s()\-]{10,20}$/.test(v),'Informe um telefone válido com DDD.'),terms:z.literal(true,{error:'Aceite os termos para continuar.'})});
export interface TargetLink {url:string;quantity:number}
export function validateTarget(value:string,service:Service):string|null{
 const v=value.trim();if(!v)return 'Informe o perfil ou link para continuar.';
 if(v.length>2048)return 'O link informado é muito longo.';
 const handles=['instagram','tiktok','twitter'];
 if(service.targetType==='profile'&&handles.includes(service.network)&&/^@?[a-zA-Z0-9_][a-zA-Z0-9._]{0,29}$/.test(v))return null;
 try{const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password)throw new Error();
 const match=getNetwork(service.network).hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h));
 if(!match||u.pathname==='/')throw new Error();
 if(service.network==='twitch'){
  if(service.targetType==='profile'&&!/^\/[a-zA-Z0-9_]{3,25}\/?$/.test(u.pathname))throw new Error();
  if(service.targetType==='video'&&!/^\/videos\/\d+\/?$/.test(u.pathname))throw new Error();
 }
 if(service.category==='Shorts'&&!/^\/shorts\/[a-zA-Z0-9_-]+\/?$/.test(u.pathname))throw new Error();
 return null;
 }catch{return `Use um link HTTPS válido do ${getNetwork(service.network).name}${service.targetType==='profile'&&handles.includes(service.network)?' ou um @usuário':''}.`;}
}
export function validateLinks(links:TargetLink[],service:Service,total:number,multi:boolean):string|null{
 if(!service.active)return 'Este serviço não está disponível.';
 if((service.min!==null&&total<service.min)||(service.max!==null&&total>service.max))return 'A quantidade está fora dos limites deste serviço.';
 if(multi&&(!service.multiLink||links.length<2||links.length>10))return 'Use entre 2 e 10 links para este serviço.';
 if(links.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<=0))return 'Cada publicação deve receber uma quantidade inteira maior que zero.';
 for(const link of links){const error=validateTarget(link.url,service);if(error)return error;}
 if(multi&&new Set(links.map(l=>l.url.trim().replace(/\/$/,''))).size!==links.length)return 'Cada publicação deve ter um link diferente.';
 if(links.reduce((sum,l)=>sum+l.quantity,0)!==total)return 'A soma das quantidades precisa ser igual ao pacote contratado.';
 return null;
}
