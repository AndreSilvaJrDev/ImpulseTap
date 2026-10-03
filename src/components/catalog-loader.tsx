'use client';
import {useEffect,useState} from 'react';
import {getPublicCatalog} from '@/lib/catalog-repository';
import type {Catalog} from '@/lib/catalog';
import Storefront from './storefront-v2';
export default function CatalogLoader(){const[catalog,setCatalog]=useState<Catalog|null>(null);const[error,setError]=useState('');const[attempt,setAttempt]=useState(0);useEffect(()=>{let live=true;getPublicCatalog().then(c=>{if(live){setCatalog(c);setError('')}}).catch(()=>{if(live)setError('Não foi possível carregar o catálogo. Tente novamente.');});return()=>{live=false}},[attempt]);if(error)return <section className="container empty-page"><h1>Catálogo indisponível</h1><p role="alert">{error}</p><button className="button primary" onClick={()=>{setError('');setAttempt(x=>x+1)}}>Tentar novamente</button></section>;if(!catalog)return <section className="container skeleton-page" aria-busy="true"><div/><div/><p role="status">Carregando serviços e preços…</p></section>;if(!catalog.services.length)return <section className="container empty-page"><h1>Novos serviços em breve.</h1><p>Nenhum serviço está disponível no momento.</p></section>;return <Storefront catalog={catalog}/>}
