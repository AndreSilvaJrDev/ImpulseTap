import AdminCatalogPage from '@/components/admin-catalog';
import {adminPage,adminRpc} from '@/lib/admin-server';
export default async function Page(){const admin=await adminPage();return <AdminCatalogPage initialTab="services" initialData={await adminRpc('impulsetap_admin_catalog',{},admin.token)}/>}
