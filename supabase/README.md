# Ativação do catálogo persistente

A publicação de revisão mantém a demonstração porque nenhum projeto Supabase foi conectado. Nenhum segredo do banco foi recebido ou incluído no código.

## Ordem de instalação

1. Em um projeto Supabase do proprietário, executar `migrations/202610020001_catalog_admin.sql` pelo fluxo de migrations ou SQL Editor.
2. Executar `seed.sql`. O bootstrap usa `ON CONFLICT DO NOTHING`, preservando futuras edições administrativas. Não usá-lo como mecanismo recorrente de sobrescrita de preços.
3. Criar/convidar o usuário administrador em Supabase Auth, definir a senha e obter o UUID de `auth.users`. Inserir somente a conta autorizada:

```sql
insert into impulsetap.admin_users(user_id)
values ('UUID-REAL-DO-USUARIO-EM-AUTH')
on conflict do nothing;
```

4. Configurar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave publicável/anon; NUNCA service_role) no ambiente de build e recompilar a aplicação.
5. Entrar em `/admin` com a conta autorizada. Recarregar `/` para conferir os preços recebidos da função `impulsetap_public_catalog()`.
6. Manter `NEXT_PUBLIC_DEMO_MODE=true` para não liberar cobranças nesta fase. A presença da conexão tem prioridade sobre a demonstração para o catálogo: os preços passam a vir do banco mesmo com checkout demonstrativo.

## Pedidos, painel e PIX

Aplique também `migrations/202610020002_payments.sql` e `migrations/202610020003_admin_operations.sql`, nesta ordem. Consulte [../docs/ADMIN_PHASE_A.md](../docs/ADMIN_PHASE_A.md).

O provider Efí existe, mas os endpoints de criação/consulta PIX e webhook estão bloqueados com 503 até integração e homologação. Não cadastre o endpoint bloqueado como webhook operacional. Credenciais não habilitam pagamentos nesta versão.

Não exponha o schema `impulsetap` no PostgREST. As funções públicas da migration verificam autorização; criação/consulta individual de pedidos são restritas à service role no servidor.

## Permissões

- Schema `impulsetap`: tabelas privadas, sem privilégios para `anon` ou `authenticated`; RLS habilitada sem políticas de acesso direto.
- `impulsetap_public_catalog`: projeção explícita de redes/serviços ativos e preços de venda. Não inclui `supplier_service_id` ou `supplier_cost_per_1000`.
- `impulsetap_admin_catalog`, `impulsetap_update_network`, `impulsetap_update_service`: exigem usuário autenticado listado em `impulsetap.admin_users`, dentro do banco.
- Funções usam `search_path=''`; todos os objetos são qualificados pelo schema. Funções privadas sem EXECUTE para os papéis de cliente.
- Custos em reais por 1.000, `numeric(14,2)`. Venda em centavos inteiros, definida separadamente por pacote.
- Atualização do serviço/pacotes/fornecedor é transacional e verifica a versão do registro para evitar sobrescrita de uma edição concorrente.
- O token administrativo permanece em cookie HttpOnly por até uma hora; as APIs verificam a autorização no servidor e no banco. Não há cadastro público de admins.

## Dados desta atualização

Spotify fica com rede inativa e serviços preservados. YouTube mantém Visualizações, Curtidas e Visualizações de Shorts. Os serviços antigos ficam inativos, preservando IDs. Twitch tem seguidores e visualizações de vídeo ativos; serviços de live ficam inativos e sem pacotes/preços inventados.

Seguidores Twitch: fornecedor `110`, custo `1.42`, reposição `30 dias`, máximo `30000`. Vídeos Twitch: fornecedor `934`, custo `8.99`. Os mínimos iniciais correspondem ao menor pacote comercial (1.000); devem ser ajustados se o fornecedor confirmar regra diferente. Nenhum código envia pedidos ao fornecedor.

## Verificação

`npm test` roda PostgreSQL local via PGlite, aplica migration e seed e verifica permissões, catálogo público, edição persistida de preço, ocultação de redes/serviços, conflitos de versão e rollback. Isso valida a lógica SQL local; não comprova aplicação em um projeto Supabase remoto.

Após conectar o projeto real, repetir login como admin e como usuário não autorizado; confirmar que o segundo não recebe dados privados. Conferir que os preços alterados aparecem ao recarregar a loja. Não há fallback silencioso para preços locais se o banco configurado falhar.
