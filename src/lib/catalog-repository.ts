import {catalogSchema} from './catalog-schema';
import {hasSupabase,rpc} from './supabase-api';
import {settings} from './settings';
import type {Catalog} from './catalog';
export async function getPublicCatalog():Promise<Catalog>{
 if(hasSupabase){const data=await rpc('impulsetap_public_catalog');return catalogSchema.parse({...data,source:'database'});}
 if(settings.demoMode){const {default:data}=await import('./demo-catalog.json');return catalogSchema.parse(data);}
 throw new Error('O catálogo está temporariamente indisponível. Tente novamente mais tarde.');
}
