/**
 * Efí Bank Pix implementation. This module must only be imported by server
 * code. No credential or certificate is ever returned to the browser.
 *
 * API references checked against Efí's official documentation:
 * - OAuth: /oauth/token
 * - Immediate charge: PUT /v2/cob/:txid
 * - QR payload: GET /v2/loc/:id/qrcode
 * - Charge detail: GET /v2/cob/:txid
 */
import https from 'node:https';
import {randomUUID} from 'node:crypto';
import type {Payment,PaymentProvider,PaymentStatus} from './providers';

type EfiConfig={clientId:string;clientSecret:string;pixKey:string;environment:'sandbox'|'production';certificateBase64:string;certificatePassphrase?:string};
type EfiResponse={access_token?:string;txid?:string;loc?:{id?:number};qrcode?:string;imagemQrcode?:string;status?:string;valor?:{original?:string};calendario?:{criacao?:string;expiracao?:number|string};message?:string};

const config=():EfiConfig=>{
 const environment=process.env.EFI_ENVIRONMENT==='production'?'production':'sandbox';
 const clientId=process.env.EFI_CLIENT_ID;
 const clientSecret=process.env.EFI_CLIENT_SECRET;
 const pixKey=process.env.EFI_PIX_KEY;
 const certificateBase64=process.env.EFI_CERTIFICATE_BASE64;
 if(!clientId||!clientSecret||!pixKey||!certificateBase64)throw new Error('Efí PIX não está configurado no servidor.');
 return {clientId,clientSecret,pixKey,environment,certificateBase64,certificatePassphrase:process.env.EFI_CERTIFICATE_PASSPHRASE};
};

const baseUrl=(environment:EfiConfig['environment'])=>environment==='production'?'https://pix.api.efipay.com.br':'https://pix-h.api.efipay.com.br';

function request(url:string,options:{method:string;headers?:Record<string,string>;body?:string},cfg:EfiConfig):Promise<{status:number;data:EfiResponse}>{
 return new Promise((resolve,reject)=>{
  const target=new URL(url);
  const req=https.request(target,{method:options.method,headers:options.headers,agent:new https.Agent({pfx:Buffer.from(cfg.certificateBase64,'base64'),passphrase:cfg.certificatePassphrase})},res=>{
   const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(Buffer.from(chunk)));res.on('end',()=>{const raw=Buffer.concat(chunks).toString('utf8');let data:EfiResponse={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}resolve({status:res.statusCode??500,data});});
  });
  req.on('error',reject);if(options.body)req.write(options.body);req.end();
 });
}

async function token(cfg:EfiConfig){
 const auth=Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
 const response=await request(`${baseUrl(cfg.environment)}/oauth/token`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'},cfg);
 if(response.status<200||response.status>=300||typeof response.data.access_token!=='string')throw new Error('Não foi possível autenticar na Efí.');
 return response.data.access_token as string;
}

const amount=(value:number)=>value.toFixed(2);
const statusMap=(status:string|undefined):PaymentStatus=>{
 if(status==='CONCLUIDA')return 'paid';
 if(status==='REMOVIDA_PELO_USUARIO_RECEBEDOR'||status==='REMOVIDA_PELO_PSP')return 'expired';
 return 'pending';
};

export class EfiPixPaymentProvider implements PaymentProvider {
 async createPayment(input:{orderId:string;amount:number;idempotencyKey:string}):Promise<Payment>{
  if(!Number.isInteger(input.amount)||input.amount<=0)throw new Error('Valor do PIX inválido.');
  const cfg=config();const accessToken=await token(cfg);const txid=input.idempotencyKey.replace(/[^a-zA-Z0-9]/g,'').slice(0,26).padEnd(26,'0');
  const expiresAt=new Date(Date.now()+30*60*1000);
  const charge=await request(`${baseUrl(cfg.environment)}/v2/cob/${txid}`,{method:'PUT',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({calendario:{expiracao:1800},valor:{original:amount(input.amount/100)},chave:cfg.pixKey,solicitacaoPagador:`Pedido ${input.orderId}`})},cfg);
  if(charge.status<200||charge.status>=300)throw new Error('A Efí não conseguiu criar a cobrança PIX.');
  const locId=charge.data?.loc?.id;
  if(!locId)throw new Error('A Efí não retornou o identificador do QR Code.');
  const qr=await request(`${baseUrl(cfg.environment)}/v2/loc/${locId}/qrcode`,{method:'GET',headers:{Authorization:`Bearer ${accessToken}`}},cfg);
  if(qr.status<200||qr.status>=300||typeof qr.data.qrcode!=='string')throw new Error('A Efí não retornou o PIX copia e cola.');
  return {id:randomUUID(),orderId:input.orderId,amount:input.amount,status:'pending',provider:'efi',providerPaymentId:txid,txid, pixCopyPaste:qr.data.qrcode,qrCodeData:qr.data.imagemQrcode,expiresAt:expiresAt.toISOString()};
 }

 async getPayment(id:string):Promise<Payment>{
  const cfg=config();const accessToken=await token(cfg);const response=await request(`${baseUrl(cfg.environment)}/v2/cob/${encodeURIComponent(id)}`,{method:'GET',headers:{Authorization:`Bearer ${accessToken}`}},cfg);
  if(response.status<200||response.status>=300)throw new Error('Não foi possível consultar o PIX.');
  const txid=response.data.txid;if(!txid)throw new Error('A Efí não retornou o txid do PIX.');
  return {id:txid,orderId:'',amount:Math.round(Number(response.data.valor?.original||0)*100),status:statusMap(response.data.status),provider:'efi',providerPaymentId:txid,txid,expiresAt:response.data.calendario?.criacao&&response.data.calendario?.expiracao?new Date(new Date(response.data.calendario.criacao).getTime()+Number(response.data.calendario.expiracao)*1000).toISOString():undefined};
 }

 async expirePayment(id:string){
  const cfg=config();const accessToken=await token(cfg);const response=await request(`${baseUrl(cfg.environment)}/v2/cob/${encodeURIComponent(id)}`,{method:'PATCH',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({status:'REMOVIDA_PELO_USUARIO_RECEBEDOR'})},cfg);
  if(response.status<200||response.status>=300)throw new Error('Não foi possível expirar o PIX.');
  return this.getPayment(id);
 }

 async processWebhook(rawBody:string):Promise<{eventId:string;payment:Payment}|null>{
  const payload=JSON.parse(rawBody) as {pix?:Array<{txid?:string;valor?:string;horario?:string;endToEndId?:string}>};const item=payload.pix?.[0];if(!item?.txid)return null;
  const payment=await this.getPayment(item.txid);if(item.valor&&Math.round(Number(item.valor)*100)!==payment.amount)throw new Error('Valor do webhook PIX não corresponde ao pagamento.');
  return {eventId:item.endToEndId??`${item.txid}:${item.horario??''}`,payment};
 }
}

export const efiPixProvider=()=>new EfiPixPaymentProvider();
