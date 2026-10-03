import {AdminLogin} from '@/components/admin-login';
export default function Page(){return <AdminLogin configured={!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}/>}
