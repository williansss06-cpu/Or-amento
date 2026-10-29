# Integração Global — propostas comerciais

## Ambientes
- Repositório: williansss06-cpu/Or-amento
- Branch de trabalho: feature/global-propostas-supabase
- Supabase existente: Global Shop (`ntvejbsszpdubcsqjiwo`)
- Produção: publicação autorizada pelo usuário em 29/10/2026; migration aplicada ao Global Shop.

## Estado observado (somente leitura)
- Supabase tem tabelas `proposals`, `leads`, `products`, `orders` e `audit_logs` com RLS habilitado.
- `proposals` existente: id, lead_id, simulation_public_id, company_name, contact_name, total_value_cents, annual_savings_cents, payback_months, generated_at.
- Arquivo index.html no repositório precisa ser inspecionado/validado antes de alteração; não sobrescrever sem backup e revisão.

## Implementação planejada
1. Revisar UI existente e mapear campos da proposta comercial HTML v11.
2. Desenhar schema compatível sem modificar as tabelas atuais da loja: numeração transacional GL0001, cabeçalho, itens, versões, eventos de envio e aceite.
3. Implementar RLS por usuário autorizado, sem expor chaves privilegiadas no frontend.
4. Compartilhamento por URL com token aleatório de alta entropia, armazenado somente como hash, com expiração e revogação.
5. Aprovação do cliente vinculada à versão imutável da proposta, registrando identificação, data e consentimento; não permitir alterações silenciosas após aceite.
6. PDF nomeado com número e cliente; links por WhatsApp e e-mail; notificações via Edge Function e provedor de e-mail.
7. Testes em ambiente isolado antes de qualquer migration ou deploy em produção.

## Pendências
- Verificar conteúdo do index.html e formato da aplicação.
- Confirmar estratégia de homologação do banco e provedor de e-mail.
- Não executar migrations ou deploy até revisão técnica e autorização.

## Atualização 29/10/2026
Persistência autenticada, numeração, histórico e validações implementados como candidato; consulte STATUS_DESENVOLVIMENTO.md para testes e pendências atuais. A política adotada é isolamento por autor entre administradores. O antigo rascunho de schema foi substituído pela migration versionada. Aprovação e e-mail automático ainda pendentes.

## Autorização de produção
Em 29/10/2026 o usuário solicitou colocar em produção. Migration aplicada ao Global Shop, cliente ativado e publicação encaminhada à hospedagem GitHub Pages existente. A aprovação por link/e-mail permanece pendente. As restrições anteriores de não publicação foram substituídas por essa autorização.
