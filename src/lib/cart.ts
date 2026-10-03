import type {NetworkId} from './catalog';
export interface CartItem {id:string;network:NetworkId;serviceId:string;serviceName:string;unit:string;quantity:number;target:string;price:number;tierId:string;unitSize:number;unitPrice:number}
const KEY='impulsetap-cart-v1';
export function readCart():CartItem[]{if(typeof window==='undefined')return [];try{const parsed=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(parsed)?parsed:[]}catch{return []}}
export function writeCart(items:CartItem[]){localStorage.setItem(KEY,JSON.stringify(items));window.dispatchEvent(new Event('impulsetap-cart'))}
export function addCart(item:CartItem){const current=readCart();writeCart([...current,item]);}
export function removeCart(id:string){writeCart(readCart().filter(item=>item.id!==id))}
export function updateCart(id:string,patch:Partial<CartItem>){writeCart(readCart().map(item=>item.id===id?{...item,...patch}:item))}
