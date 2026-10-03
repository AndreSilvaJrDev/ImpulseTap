export type NetworkId = 'instagram'|'tiktok'|'youtube'|'facebook'|'kwai'|'twitter'|'telegram'|'spotify'|'whatsapp'|'google'|'twitch';
export type TargetType = 'profile'|'post'|'video'|'channel'|'track'|'business';
export interface Network {id:NetworkId;name:string;description:string;color:string;hosts:string[];active:boolean;version:number}
export interface Package {id:string;quantity:number;price:number;badge?:string}
export interface PriceTier {id:string;minQuantity:number;maxQuantity:number|null;unitSize:number;pricePerUnit:number;discountPercent:number|null;active:boolean;displayOrder:number}
export interface Service {id:string;network:NetworkId;name:string;category:string;targetType:TargetType;multiLink:boolean;unit:string;recurring:boolean;packages:Package[];tiers?:PriceTier[];quantityStep:number;description:string;active:boolean;min:number|null;max:number|null;delivery:string;refill:string;version:number}
export interface OrderBumpConfig {id:string;mainServiceIds:string[];serviceId:string;packageId:string;price:number}
export interface Catalog {networks:Network[];services:Service[];orderBumps:OrderBumpConfig[];source:'database'|'demo'}
export const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const number=(n:number)=>new Intl.NumberFormat('pt-BR').format(n);
const tierOverrides:Record<string,Array<[number,number|null,number]>>={
 'svc-001':[[100,999,275],[1000,4999,249],[5000,9999,245],[10000,null,239]],
 'svc-002':[[100,999,518],[1000,4999,419],[5000,9999,400],[10000,null,380]],
 'svc-003':[[100,999,59],[1000,4999,45],[5000,9999,44],[10000,null,40]],
 'svc-004':[[100,999,119],[1000,4999,99],[5000,9999,94],[10000,null,90]],
 'svc-005':[[100,999,29],[1000,4999,19],[5000,9999,16],[10000,null,15]],
 'svc-006':[[100,999,29],[1000,4999,19],[5000,9999,16],[10000,null,15]],
 'svc-007':[[100,999,39],[1000,4999,29],[5000,9999,26],[10000,null,25]],
 'svc-008':[[100,999,39],[1000,4999,29],[5000,9999,26],[10000,null,25]],
 'svc-019':[[100,999,169],[1000,4999,149],[5000,9999,130],[10000,null,120]],
 'svc-020':[[100,999,290],[1000,4999,249],[5000,9999,230],[10000,null,220]],
 'svc-053':[[100,999,129],[1000,4999,99],[5000,9999,79],[10000,null,69]],
};
export function serviceTiers(service:Service):PriceTier[]{
 if(service.tiers?.length)return service.tiers;
 const explicit=tierOverrides[service.id];
 if(explicit)return explicit.map(([min,max,unit],i)=>({id:`${service.id}-tier-${i+1}`,minQuantity:min,maxQuantity:max,unitSize:100,pricePerUnit:unit,discountPercent:null,active:true,displayOrder:i}));
 return service.packages.map((p,i)=>({id:`${service.id}-package-${p.id}`,minQuantity:p.quantity,maxQuantity:service.packages[i+1]?.quantity?service.packages[i+1].quantity-1:null,unitSize:1000,pricePerUnit:Math.round(p.price/(p.quantity/1000)),discountPercent:null,active:true,displayOrder:i}));
}
export function priceForQuantity(service:Service,quantity:number){const tier=serviceTiers(service).find(t=>t.active&&quantity>=t.minQuantity&&(t.maxQuantity===null||quantity<=t.maxQuantity));if(!tier)return null;const units=Math.ceil(quantity/tier.unitSize);return {tier,total:units*tier.pricePerUnit};}
// Platform identity contains no service prices, supplier IDs or costs.
const networkIdentity = [{"id": "instagram", "name": "Instagram", "description": "Perfis, posts e Reels", "color": "#f447b7", "hosts": ["instagram.com"]}, {"id": "tiktok", "name": "TikTok", "description": "Dê espaço aos seus vídeos", "color": "#22e7e1", "hosts": ["tiktok.com"]}, {"id": "youtube", "name": "YouTube", "description": "Seu canal em movimento", "color": "#ff4848", "hosts": ["youtube.com", "youtu.be"]}, {"id": "facebook", "name": "Facebook", "description": "Páginas e publicações", "color": "#308aff", "hosts": ["facebook.com", "fb.watch"]}, {"id": "kwai", "name": "Kwai", "description": "Vídeos que conectam", "color": "#ff9a32", "hosts": ["kwai.com", "kw.ai", "kuaishou.com"]}, {"id": "twitter", "name": "X / Twitter", "description": "Participe da conversa", "color": "#e0e7ff", "hosts": ["x.com", "twitter.com"]}, {"id": "telegram", "name": "Telegram", "description": "Canais e comunidades", "color": "#36baff", "hosts": ["t.me", "telegram.me"]}, {"id": "twitch", "name": "Twitch", "description": "Seu canal em movimento", "color": "#9146FF", "hosts": ["twitch.tv", "clips.twitch.tv"]}, {"id": "spotify", "name": "Spotify", "description": "Música em destaque", "color": "#2ddb85", "hosts": ["open.spotify.com", "spotify.com"]}, {"id": "whatsapp", "name": "WhatsApp", "description": "Canais e atualizações", "color": "#38dd93", "hosts": ["whatsapp.com", "whatsapp.net"]}, {"id": "google", "name": "Google", "description": "Reputação de verdade", "color": "#4285f4", "hosts": ["google.com", "google.com.br", "g.page", "maps.app.goo.gl"]}] as const;
export const getNetwork=(id:NetworkId)=>networkIdentity.find(n=>n.id===id)!;
export const faqs=[
['Preciso informar minha senha?','Não. A ImpulseTap solicita apenas o perfil ou link público necessário para o serviço escolhido. Nunca compartilhe sua senha.'],
['Quando meu pedido começa e quanto tempo leva?','O início depende da confirmação do pagamento e da disponibilidade do serviço. Prazos específicos serão informados após a configuração do fornecedor. Nesta demonstração, não há entrega real.'],
['Meu perfil precisa estar público?','Para os serviços de redes sociais, o perfil e o conteúdo devem estar acessíveis publicamente. As condições específicas podem variar por serviço.'],
['Consigo acompanhar meu pedido?','Sim. Nesta versão, os pedidos de demonstração ficam disponíveis em Meus pedidos durante a sessão deste navegador. A consulta segura por e-mail será conectada na próxima fase.'],
['Posso dividir entre várias publicações?','Nos serviços compatíveis, você pode distribuir o pacote entre 2 e 10 links. A soma precisa ser exatamente igual à quantidade escolhida.'],
['O que acontece se meu pedido não for concluído?','A situação será analisada conforme as condições do serviço e a política de reembolso publicada antes do lançamento. A versão de demonstração não realiza cobranças.'],
['Vocês oferecem suporte?','O atendimento será feito pelo WhatsApp oficial da ImpulseTap. O contato ainda será configurado antes da abertura das vendas.'],
['Há reposição?','A reposição depende do produto e das condições do fornecedor. Não existe garantia universal de reposição; confira as condições do serviço antes de comprar.'],
['Esses serviços garantem vendas ou monetização?','Não. Quantidade de seguidores ou interações não garante alcance orgânico, clientes, vendas ou monetização.']
];
