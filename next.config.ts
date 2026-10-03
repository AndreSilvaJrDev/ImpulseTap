import type { NextConfig } from 'next';
// PIX/webhook routes require a server runtime. Do not use static export here:
// a static bundle cannot authenticate to Efí or receive callbacks.
const config: NextConfig = {
 trailingSlash: true,
 images: { unoptimized: true },
 // Use the installed TypeScript compiler API; CLI subprocess output is unreliable
 // in the managed build container. Type checking remains enabled.
 experimental: { useTypeScriptCli: false },
};
export default config;
