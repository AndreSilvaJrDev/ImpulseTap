// Server-only integration contracts. Implementations are intentionally absent in phase 1.
export type PaymentStatus='pending'|'paid'|'expired'|'refunded'|'failed';
export interface Payment {id:string;orderId:string;amount:number;status:PaymentStatus;provider?:string;providerPaymentId?:string;txid?:string;pixCopyPaste?:string;qrCodeUrl?:string;qrCodeData?:string;expiresAt?:string;paidAt?:string}
export interface PaymentProvider {
 createPayment(input:{orderId:string;amount:number;idempotencyKey:string}):Promise<Payment>;
 getPayment(id:string):Promise<Payment>;
 processWebhook(rawBody:string,signature?:string):Promise<{eventId:string;payment:Payment}|null>;
 expirePayment?(id:string):Promise<Payment>;
 refundPayment?(id:string,amount:number,idempotencyKey:string):Promise<Payment>;
}
export interface SupplierProvider {
 createOrder(input:{serviceId:string;target:string;quantity:number;idempotencyKey:string}):Promise<{externalId:string}>;
 getOrderStatus(externalId:string):Promise<{status:string;remaining:number}>;
 cancelOrder?(externalId:string):Promise<void>;
 refillOrder?(externalId:string):Promise<void>;
}
