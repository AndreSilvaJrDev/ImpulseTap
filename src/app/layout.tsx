import type {Metadata} from 'next';
import {SiteFrame} from '@/components/site-frame';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://impulsetap.andresilvaoliveirajr.chatgpt.site'),title:{default:'ImpulseTap | Serviços para Redes Sociais',template:'%s | ImpulseTap'},description:'Escolha serviços para Instagram, TikTok, YouTube e outras plataformas. Confira os pacotes e acompanhe seu pedido.',icons:{icon:'/favicon.svg'},robots:{index:false,follow:false},openGraph:{title:'ImpulseTap | Serviços para Redes Sociais',description:'Sua presença. Seu próximo passo.',locale:'pt_BR',type:'website'},twitter:{card:'summary'},alternates:{canonical:'/'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body><a className="skip-link" href="#main">Pular para conteúdo</a><SiteFrame>{children}</SiteFrame></body></html>}
