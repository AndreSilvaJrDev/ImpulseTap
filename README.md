# ImpulseTap

Aplicação existente preservada: Next.js App Router, TypeScript, Tailwind, Framer Motion, Zod e Lucide. Esta atualização acrescenta o catálogo revisado, editor administrativo e integração do catálogo com Supabase.

## Estado atual

- Spotify oculto do cliente, estrutura e serviços preservados.
- YouTube ativo com visualizações, curtidas e Shorts; inscritos, comentários e horas de exibição inativos.
- Twitch ativa com seguidores (1.000 R$ 9,90; 5.000 R$ 39,90; 10.000 R$ 69,90) e views de vídeos (R$ 24,90 / R$ 109,90 / R$ 199,90).
- Pacote de 5.000 seguidores Twitch com destaque configurado “MAIS ESCOLHIDO”.
- Três serviços de live Twitch reservados como inativos, sem preços.
- `/admin`, `/admin/produtos` e `/admin/redes` preparados com autenticação e autorização verificadas no banco. Permitem editar ativação, preços, custo/1.000, ID do fornecedor, mínimo, máximo, prazo, reposição e destaques.
- Fornecedor 110 / R$ 1,42 e 934 / R$ 8,99 constam APENAS na fonte privada e no seed SQL. Não há envio automático.

**A conexão Supabase ainda não foi fornecida.** A revisão publicada continua identificada como demonstração. O admin mostra a conexão pendente e não simula salvamentos. As migrations e o seed estão prontos, mas NÃO foram aplicados em banco remoto.

## Preços e separação de dados

`getPublicCatalog()` chama a função Supabase `impulsetap_public_catalog`, que lê os preços de venda do banco. O resultado usa uma projeção explícita, sem custos ou IDs de fornecedor. Quando Supabase estiver configurado, erro de conexão não provoca fallback para preços locais.

Somente na demonstração explícita sem configuração existe um snapshot público (`src/lib/demo-catalog.json`), gerado com uma allowlist. Nunca usar o arquivo privado `data/catalog-seed.json` em componentes ou assets públicos. `scripts/export-seed.ts` gera o snapshot sanitizado e `supabase/seed.sql` para instalação pelo proprietário.

Venda não deriva do custo no frontend. O administrador define cada preço de pacote; custos são metadados privados. As operações SQL são transacionais, exigem a permissão de administrador e verificam versão para detectar edição concorrente.

## Instalar e validar

Node 22.11+ ou 24 LTS. `npm ci`. Copiar `.env.example` para `.env.local`.

- `npm run dev`
- `npm run seed:export` após alterar a fonte privada de bootstrap
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`

O build usa Webpack para compatibilidade com ambientes que restringem as portas internas do Turbopack. Como o PIX e o webhook precisam de runtime server-side, esta versão não usa exportação estática `out/`. O login e as operações administrativas passam pelo servidor Next.js, que acessa Supabase Auth e RPC por HTTPS; as permissões e operações atômicas são impostas no Postgres. Nenhuma service_role é usada no navegador.

Para ativar a persistência, seguir `supabase/README.md`. São necessários URL do projeto, chave publicável/anon, migrations/seed aplicados e conta autorizada em `impulsetap.admin_users`.

## Verificação da atualização

1. Abrir `/`: Spotify ausente, Twitch presente.
2. YouTube: somente Visualizações, Curtidas e Shorts, com preços especificados.
3. Twitch: conferir dois serviços, três pacotes por serviço e destaque em 5.000 seguidores.
4. Para vídeos Twitch, testar `https://www.twitch.tv/videos/123456`; para seguidores, link público do canal. Shorts exigem URL `/shorts/...`.
5. Seguir checkout demonstrativo sem cobrança/entrega. PIX está desabilitado até correção e homologação da integração, conforme o documento da Fase A.
6. Após conexão Supabase, entrar no admin, alterar um preço e recarregar a loja. Desativar rede/serviço deve ocultar sua oferta pública sem apagar registros.
7. Testar conta comum e visitante: sem acesso ao admin, aos custos e aos IDs privados.

Os testes de banco usam PostgreSQL local (PGlite) e não dependem de credenciais externas. Verificam permissões efetivas, preços persistidos, ativação/ocultação, rollback e conflitos. A conferência visual nos seis tamanhos solicitados continua dependente de navegador de preview disponível.

## Módulos principais

- `src/components/storefront.tsx`, `checkout.tsx`, `orders.tsx`: experiência comercial preservada.
- `src/components/catalog-loader.tsx`: carregamento/erro/estado vazio.
- `src/components/admin-catalog.tsx`: login e edição administrativa.
- `src/lib/catalog-repository.ts`, `supabase-api.ts`: leitura pública e transporte autenticado.
- `src/lib/admin-catalog.ts`: validação e operações privadas.
- `src/lib/catalog.ts`, `catalog-schema.ts`: tipos e projeção pública.
- `data/catalog-seed.json`: fonte PRIVADA inicial, nunca publicada como asset.
- `supabase/migrations/202610020001_catalog_admin.sql`: schema, funções e permissões.
- `supabase/seed.sql`: bootstrap idempotente sem sobrescrever edições.

## Painel operacional e PIX

A Fase A acrescenta login com cookie HttpOnly, dashboard do banco, lista/detalhe de pedidos, notas, histórico, auditoria e registros operacionais manuais. Consulte [docs/ADMIN_PHASE_A.md](docs/ADMIN_PHASE_A.md) para instalação, testes, limites e próximos passos.

O provider Efí foi preservado, mas **as três rotas PIX retornam 503** até corrigir e homologar autorização por pedido, confirmação transacional/idempotente e autenticação do webhook. Não existe cobrança PIX habilitada nesta entrega. Credenciais sozinhas não liberam os endpoints.

## Escopo ainda pendente

Consulta por e-mail verificado, módulos completos de clientes/financeiro, cupons, upsells, notificações de vendas reais e integração de entrega ainda precisam ser conectados ao novo checkout persistente. O provider não envia pedidos ao fornecedor antes da confirmação de pagamento.

WhatsApp depende de `NEXT_PUBLIC_WHATSAPP_NUMBER`. Documentos jurídicos continuam bases para revisão. Indexação permanece bloqueada durante a demonstração.
