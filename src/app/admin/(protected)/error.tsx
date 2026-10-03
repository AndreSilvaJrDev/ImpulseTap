'use client';
export default function Error({reset}:{reset:()=>void}){return <div className="ops-panel"><h1>Não foi possível carregar o painel</h1><p>Confira a conexão e as migrations do Supabase. Nenhuma métrica foi inventada.</p><button className="button secondary" onClick={reset}>Tentar novamente</button></div>}
