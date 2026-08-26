# CRM Family

CRM multiempresa para **Sedux**, **Schemmer Cell** e **House Pet**, com uma base compartilhada, dados isolados por empresa, painel **SuperAdmin** e uma **Frente de Caixa/PDV separada do CRM administrativo**.

Cada loja possui identidade visual e recursos próprios, mas continua usando a mesma aplicação, autenticação, banco e infraestrutura.

## O que esta versão cobre

### Recursos comuns às três empresas
- Login com Supabase Auth.
- Isolamento por empresa no banco com Row Level Security (RLS).
- Produtos e estoque, estoque mínimo e histórico de movimentação.
- Clientes.
- Vendas com múltiplos itens.
- Financeiro: entradas, saídas, pendências e baixas.
- Fornecedores.
- Clientes devedores / contas a receber.
- Compras com múltiplos produtos e reposição de estoque.
- Central de alertas operacionais.
- Lucro bruto estimado com custo histórico por item vendido.
- Painel de desempenho dos últimos 30 dias.
- Auditoria das operações.
- Edição e arquivamento de produtos, clientes e fornecedores.

### Frente de Caixa / PDV
O PDV usa o mesmo backend e o mesmo banco do CRM, mas possui interface e autorização próprias em `/caixa`.

- Perfil `cashier` entra diretamente no caixa e não acessa `/dashboard`.
- Abertura e fechamento de caixa por operador.
- Fundo inicial, valor esperado, valor contado e diferença de fechamento.
- Sangria e suprimento com motivo e auditoria.
- Busca rápida por nome, SKU, código de barras e IMEI.
- Carrinho com quantidade, desconto e remoção.
- Cliente opcional na venda à vista e obrigatório quando existir saldo pendente.
- Pix, dinheiro, débito, crédito, transferência e outros.
- Pagamento misto.
- Cálculo de troco.
- Venda parcial ou a prazo integrada a clientes devedores.
- Baixa automática de estoque.
- Lançamento automático no financeiro.
- Custo histórico e lucro preservados nos itens vendidos.
- Comprovante interno não fiscal otimizado para impressão de 80 mm.
- Histórico de vendas do PDV.
- Cancelamento/estorno auditado, com restauração de estoque e reversão financeira.
- Estorno em dinheiro de venda pertencente a caixa anterior é registrado como saída no caixa atual.

### Integração operacional da agenda com o caixa
O operador de caixa não precisa entrar no CRM para consultar atendimentos gerados pela equipe administrativa.

**House Pet**
- A tela `/caixa/agenda` lê a mesma `pet_appointments` usada pelo CRM.
- Exibe a agenda do dia, pet, tutor, horário, serviço, status e valor.
- Quando o atendimento está `ready`, aparece **Receber no caixa**.
- O serviço é carregado no carrinho e o tutor é selecionado automaticamente.
- Ao receber, o atendimento é vinculado à venda e marcado como entregue.
- Em cancelamento/estorno, o atendimento retorna para `ready`.

**Schemmer Cell**
- A agenda operacional do caixa exibe ordens de serviço `ready` aguardando retirada.
- **Receber no caixa** carrega a OS no PDV com cliente, aparelho e orçamento.
- Ao receber, a OS é marcada como entregue e vinculada à venda.
- Em cancelamento/estorno, a OS volta para `ready`.

**Sedux**
- O PDV vende produtos, variações e kits.
- A tela de agenda informa que não há agenda operacional configurada para esse negócio.

### Schemmer Cell
- Tema visual azul/preto/branco.
- Assistência técnica e ordens de serviço.
- IMEI, série, estado físico, defeito, acessórios, técnico, orçamento, peças, mão de obra e previsão.
- Fluxo de status da assistência.
- Garantia por ordem de serviço.
- Controle individual de aparelhos por IMEI/número de série.
- Venda de aparelho individual pelo PDV com status de unidade `sold`.

> Por segurança, senha de desbloqueio de aparelho não é armazenada em texto aberto pelo CRM.

### House Pet
- Tema visual vermelho/vinho/branco.
- Pets vinculados ao tutor.
- Dados clínico-operacionais básicos, foto e observações.
- Agenda de banho, tosa e demais serviços.
- Responsável, valor e observações.
- Fluxo de status do atendimento.
- Agenda do dia também disponível ao caixa sem liberar o CRM administrativo.

### Sedux
- Tema visual preto/pink/magenta.
- Variações por cor, tamanho, modelo, sabor e volume.
- Estoque mínimo por variação.
- Lotes e validade.
- Kits compostos por vários produtos.
- Venda de produtos, variações e kits no PDV.
- Kit baixa automaticamente os componentes do estoque.

### Compras e reposição
- Pedido de compra por fornecedor.
- Vários produtos, quantidade e custo unitário.
- Documento/nota, data e pagamento.
- Estoque muda somente no recebimento da mercadoria.
- Recebimento atualiza estoque, custo, movimentações e financeiro em uma transação.

### SuperAdmin
- Visão consolidada das empresas.
- Relatórios e métricas.
- Criação de acesso `store_admin`, `store_user` e `cashier`.
- Geração segura de nova senha.
- O perfil `cashier` é apresentado como **Operador de caixa — somente PDV**.

## Stack

- Next.js 16.3 App Router
- React 19.2
- TypeScript (stack existente deste repositório)
- CSS Modules nos novos componentes do PDV
- Supabase Auth + PostgreSQL + Row Level Security
- Vercel
- Manifest PWA

## Atualizando um banco que já existe

Execute no **SQL Editor** do Supabase, nesta ordem:

```text
supabase/upgrade-2026-08-21.sql
supabase/pdv-2026-08-22.sql
```

O segundo script:
- adiciona o perfil `cashier`;
- cria sessões e movimentos de caixa;
- cria pagamentos por venda;
- adiciona suporte a pagamento misto;
- vincula vendas ao caixa;
- cria componentes de estoque usados para reversão segura;
- integra pet appointments, ordens de serviço e aparelhos ao PDV;
- adiciona RPCs atômicas para abrir/fechar caixa, vender e cancelar/estornar;
- restringe o perfil de caixa a dados operacionais, sem liberar financeiro completo, compras, fornecedores e auditoria administrativa.

Depois rode:

```bash
npm install
npm run typecheck
npm run build
```

## Projeto novo

Em um projeto Supabase novo:

1. `supabase/schema.sql`
2. `supabase/upgrade-2026-08-21.sql`
3. `supabase/pdv-2026-08-22.sql`
4. Configure `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPERADMIN_EMAIL=...
SUPERADMIN_PASSWORD=...
SUPERADMIN_NAME=...
```

**Nunca** coloque `SUPABASE_SECRET_KEY` em variável `NEXT_PUBLIC_`.

Crie o primeiro SuperAdmin:

```bash
node --env-file=.env.local scripts/bootstrap-superadmin.mjs
```

## Arquitetura do PDV

A camada HTTP é fina e delega para o domínio `modules/pos`:

```text
app/api/pos/
  sessions/route.ts
  movements/route.ts
  sales/route.ts
  sales/[id]/cancel/route.ts

modules/pos/
  pos.types.ts
  pos.validation.ts
  pos.repository.ts
  pos.service.ts

components/POS/
  POSLayout/
  SessionControls/
  Checkout/
  Agenda/
  History/
  Receipt/
```

Fluxo da venda:

```text
route -> validation -> service -> repository -> RPC PostgreSQL -> banco
```

A RPC `create_pos_sale` valida todos os itens antes de realizar qualquer baixa. A criação da venda, itens, estoque, pagamentos, financeiro, dívida e vínculos especializados ocorre na mesma transação do PostgreSQL.

## Regra de acesso

Cada usuário recebe `role` e `company_id` em `app_metadata` pelo backend administrativo.

- `store_admin`: CRM administrativo e PDV da própria empresa.
- `store_user`: CRM operacional e PDV da própria empresa.
- `cashier`: somente Frente de Caixa/PDV da própria empresa; acesso ao dashboard é redirecionado para `/caixa`.
- `super_admin`: gestão consolidada e criação dos acessos.

A separação não depende apenas do menu. O RLS e as RPCs validam empresa e perfil no servidor/banco.

## Segurança importante

- A chave secreta do Supabase fica somente no servidor.
- O caixa não recebe acesso de leitura ao financeiro completo, contas a receber, fornecedores, compras, movimentos de estoque ou audit logs.
- O caixa lê apenas os dados operacionais necessários ao balcão.
- Toda venda, abertura, fechamento, sangria, suprimento e cancelamento/estorno relevante gera auditoria.
- O comprovante do PDV é **interno e não fiscal**.
