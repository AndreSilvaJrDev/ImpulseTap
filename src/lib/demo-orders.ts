export interface DemoOrder {id:string;createdAt:string;serviceId:string;serviceName:string;network:string;quantity:number;total:number;target:string;additional?:{name:string;target:string;price:number};status:'pending'|'confirmed';demo:true}
const KEY='impulsetap.demo.orders.v1';
export function readOrders():DemoOrder[]{try{return JSON.parse(sessionStorage.getItem(KEY)||'[]') as DemoOrder[];}catch{return [];}}
export function saveOrder(order:DemoOrder){const orders=readOrders();sessionStorage.setItem(KEY,JSON.stringify([order,...orders.filter(o=>o.id!==order.id)].slice(0,30)));}
export const createDemoId=()=>`IT-DEMO-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
