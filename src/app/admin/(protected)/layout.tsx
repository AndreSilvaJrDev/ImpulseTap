import {adminPage} from '@/lib/admin-server';
import {AdminShell} from '@/components/admin-shell';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const user=await adminPage();return <AdminShell email={user.email}>{children}</AdminShell>}
