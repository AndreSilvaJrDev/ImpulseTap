// Fail closed until ownership, mTLS ingress and atomic gateway reconciliation are homologated.
export async function POST(){return Response.json({error:'Pagamento PIX ainda em homologação. Nenhuma cobrança foi realizada.'},{status:503})}
