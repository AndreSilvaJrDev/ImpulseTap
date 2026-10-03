'use client';
import {usePathname} from 'next/navigation';
import {Header,Footer,Support} from './chrome';
export function SiteFrame({children}:{children:React.ReactNode}){const admin=usePathname().startsWith('/admin');return <>{!admin&&<Header/>}<main id="main">{children}</main>{!admin&&<><Footer/><Support/></>}</>}
