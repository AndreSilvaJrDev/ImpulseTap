// Do not acknowledge payment events which were not securely processed.
export async function POST(){return Response.json({error:'Webhook não habilitado: homologação pendente.'},{status:503})}
