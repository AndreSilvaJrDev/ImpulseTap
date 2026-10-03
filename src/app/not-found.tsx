import Link from 'next/link';
export default function NotFound(){return <section className="container empty-page"><h1>Não encontramos esta página.</h1><p>Volte ao catálogo para continuar.</p><Link href="/" className="button primary">Ver serviços</Link></section>}
