# Painel administrativo — Fase A

## Implementado

- Login Supabase Auth com autorização por `impulsetap.admin_users`, conferida nas páginas, APIs e funções SQL. Cookie HttpOnly, SameSite Strict e Secure em produção; sessão de até uma hora.
- Dashboard com indicadores de hoje e ontem, série de 7/30 dias, receita por rede, alertas operacionais, pedidos recentes e notificações provenientes do banco. Sem fixtures no painel.
- Pedidos: busca por cliente/código/contato, filtros de pagamento, entrega, rede, serviço, fornecedor e período; paginação; detalhes, destinos, pagamentos, notas internas e histórico.
- Operação manual: registro de pagamento externo, envio previamente feito no fornecedor, taxa de gateway e reembolso externo. Essas ações não movimentam dinheiro nem chamam fornecedor. Confirmação adicional nas ações sensíveis.
- Transições validadas, bloqueio de edição concorrente e trilha de auditoria transacional.
- Catálogo existente preservado: Spotify oculto, YouTube revisado, Twitch ativa e serviços de live inativos. Editor de preços, custos, limites e mapeamento do fornecedor.
- Criação atômica de pedidos com preços do banco, snapshots, chave idempotente e limite de 10 pedidos por e-mail/hora. Consulta individual exige cookie aleatório do navegador da compra, além do código.
- Lucro calculado sem descontar desconto duas vezes. Custos/taxas desconhecidos aparecem como não apurados.

## Instalação

1. Execute `npm ci` e configure as variáveis do arquivo de exemplo.
2. Aplique, nesta ordem, migrations `202610020001_catalog_admin.sql`, `202610020002_payments.sql`, `202610020003_admin_operations.sql`. Em banco existente aplique somente as ainda não executadas.
3. Execute `supabase/seed.sql` no primeiro bootstrap. Ele não sobrescreve edições existentes.
4. Crie o usuário no Supabase Auth e autorize seu UUID:

```sql
insert into impulsetap.admin_users(user_id)
values ('UUID-REAL-DO-USUARIO') on conflict do nothing;
```

5. Configure URL do Supabase e chave publicável/anon; `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor para criação/consulta de pedidos. `APP_ORIGIN` deve corresponder exatamente à origem acessada, sem barra final.
6. Execute `npm run build` e `npm start` em runtime Node compatível. A aplicação atual exige servidor; não publique a pasta antiga `out/` como se contivesse este painel.
7. Acesse `/admin/login`. A demonstração pública não concede acesso administrativo.

## Como testar

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.

Os testes PostgreSQL locais aplicam as três migrations e o seed. Verificam permissões, projeção pública sem custos, alterações no catálogo, idempotência, snapshots, conflitos, transições, pagamento manual, lucro e reembolso. Não comprovam configuração do Supabase remoto.

Com banco de homologação conectado, use `NEXT_PUBLIC_DEMO_MODE=false` e `CHECKOUT_ENABLED=true` para criar um pedido real de teste sem cobrança. Abra seu detalhe em `/admin/pedidos`, confira preço/custo, registre a operação externa e acompanhe o histórico. Teste também uma conta sem autorização e uma janela sem cookie: nenhuma deve receber dados privados. Não registre pagamento de cliente sem recebimento conferido.

## Bloqueios e próximos passos

Não foram fornecidas credenciais Supabase; migrations não foram aplicadas em banco remoto. PIX permanece explicitamente indisponível (HTTP 503). O provider Efí foi preservado, mas os endpoints anteriores não garantiam autorização por pedido e confirmação transacional segura. A ativação requer integração corrigida, validação mTLS do webhook, idempotência transacional e homologação com a Efí. Nenhuma variável libera essas rotas nesta etapa.

São necessários: URL/chave publicável do Supabase, chave de servidor configurada no ambiente, usuário autorizado e runtime de publicação compatível com Next.js server-side. Segredos devem ser cadastrados no ambiente, não enviados no chat.

Permanecem para próximas etapas: recuperação de pedidos por e-mail verificado, módulos completos de clientes/financeiro/configurações, integração automática de fornecedor e pagamento, proteção de borda contra abuso, revisão visual em navegador nos seis tamanhos solicitados e homologação remota. O limite por e-mail não substitui rate limiting distribuído por origem. Supabase Auth deve manter suas proteções de login ativadas.

## Atualização de quantidade, VSL e carrinho

A migration `202610020004_custom_quantity_cart.sql` adiciona `quantity_step`, `service_price_tiers` e snapshots de faixa no item do pedido. O catálogo público expõe as faixas; o servidor calcula o total. O vídeo atual fica em `public/media/impulsetap-vsl.mp4` e pode ser trocado por `NEXT_PUBLIC_HOME_VSL_URL`. O tutorial é reutilizável e preserva o estado do funil. O carrinho persiste itens no navegador e a página é `/carrinho`.

No ambiente demonstrativo, o carrinho e o checkout são simulados. Para habilitar criação persistente, aplique a migration 004, configure `SUPABASE_SERVICE_ROLE_KEY` no servidor e defina `CHECKOUT_ENABLED=true`. O PIX continua bloqueado até homologação.

O gráfico financeiro agrupa vendas pela data de criação do pedido; não representa conciliação bancária por data de liquidação. Receita por rede exclui pedidos com reembolsos, ainda sem rateio de devoluções entre itens.
