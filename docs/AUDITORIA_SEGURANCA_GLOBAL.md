# Auditoria de integração e segurança — Global Shop
Data: 29/10/2026
Projeto: ntvejbsszpdubcsqjiwo
Escopo: somente leitura; nenhuma alteração na produção.

## Resultado do Supabase Security Advisor
O linter informou 7 funções SECURITY DEFINER executáveis por anon e authenticated:
- public.attach_order_payment_link
- public.create_order_with_items
- public.is_staff
- public.mark_order_payment_configuration_required
- public.process_asaas_payment_event
- public.record_proposal_by_legacy_id
- public.track_order

**Atenção:** o alerta não prova vulnerabilidade explorável; exige inspecionar a implementação e os mecanismos de validação antes de qualquer revogação. Mudanças precipitadas podem interromper o checkout e a loja.

Referência: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## Decisão de arquitetura
1. Não modificar tabelas, RPCs ou políticas existentes do Global Shop.
2. Preservar `global_quotes` como schema privado; sem acesso anon/authenticated direto.
3. Criar backend autenticado para salvar propostas, com validação server-side de itens, preços e totais.
4. Emitir GL0001 a partir de sequência no banco, nunca no navegador. A sequência garante unicidade, mas pode pular números em transações revertidas.
5. Usar versão imutável da proposta e token de aceite de uso único, armazenado como hash, com expiração.
6. Enviar notificação de aprovação para globalacessoriosemgeral@gmail.com somente pelo servidor e após confirmação do banco.
7. Não expor chaves secretas ou service_role no HTML.

## Situação
- Interface inicial em index.html: criada na branch de desenvolvimento.
- Schema SQL: rascunho não aplicado.
- Backend de persistência: pendente.
- E-mail transacional: provedor e credenciais pendentes.
- Produção: não alterada.

## Critérios de homologação
- Sem acesso anônimo a dados de clientes ou propostas.
- Não é possível aprovar duas vezes o mesmo token.
- Não é possível alterar versão já aprovada.
- Duas solicitações simultâneas não recebem o mesmo número GL.
- A falha do provedor de e-mail é registrada para reenvio, sem perder o aceite.
- PDF corresponde à versão aprovada.

## Atualização desta etapa
Backend candidato implementado com wrappers SECURITY INVOKER no public e funções privadas SECURITY DEFINER, search_path vazio, grants explícitos e checagem de auth.uid()/perfil ativo/autor. Sem grants diretos às tabelas. Validado em PGlite; ainda não aplicado no Supabase. Consulte STATUS_DESENVOLVIMENTO.md.
