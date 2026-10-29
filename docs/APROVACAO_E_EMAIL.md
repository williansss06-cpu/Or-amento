# Aprovação de propostas e notificação — 29/10/2026

## Publicado no backend
Migration global_quote_approval_and_email_outbox aplicada ao Global Shop e Edge Function global-quote-approval implantada. Sem alteração das tabelas da loja.

O administrador salva/abre o orçamento e gera um link válido por sete dias. Reemitir revoga o anterior. O token tem 256 bits aleatórios e somente seu SHA-256 é persistido; no navegador fica no fragmento da URL, sem referrer ou analytics. A proposta pública é um snapshot preservado, com hash SHA-256, produtos, valores e condições da emissão.

O cliente preenche nome/e-mail e confirma o texto de aceite. O banco registra data, responsável, texto aceito e referência ao snapshot. O bloqueio transacional impede dois aceites diferentes; uma repetição retorna o mesmo aceite sem sobrescrever identidade. Aprovação e criação da fila de notificação são atômicas.

A notificação tem destino fixo globalacessoriosemgeral@gmail.com. O worker usa chave de idempotência por evento e lease para evitar envio concorrente. Resposta do provedor confirmada gera status sent (aceito pelo provedor, não prova de entrega na caixa de entrada). Falhas não removem a aprovação e podem ser reenviadas pelo administrador autorizado.

## Bloqueio atual do envio real
Não há credencial de e-mail configurada. A checagem health da função informa email_configured=false. O sistema não anuncia envio realizado e mantém a notificação em pending.

Cadastrar **nos secrets de Edge Functions do projeto Global Shop**:
- GLOBAL_RESEND_API_KEY: chave de API de envio do Resend.
- GLOBAL_EMAIL_FROM: remetente autorizado/verificado no Resend, por exemplo nome e endereço do domínio do usuário.

Nunca colocar chaves em HTML, GitHub, mensagens ou neste documento. Não usar a senha normal da conta Gmail. O Gmail informado é o destinatário, não um remetente automaticamente autorizado.

Painel de configuração: https://supabase.com/dashboard/project/ntvejbsszpdubcsqjiwo/functions/secrets
Documentação oficial: https://supabase.com/docs/guides/functions/examples/send-emails

Depois da configuração, validar health, enviar uma notificação autorizada e confirmar recebimento no Gmail. Aprovações anteriores podem ser notificadas pelo botão Reenviar notificação. Não há agendador de reenvios em segundo plano nesta versão.

## Verificação
- 20 testes isolados aprovados em Node/PGlite: permissões, cálculo, snapshot, revogação, expiração, aceite, idempotência, outbox, lease, envio simulado e falha do provedor.
- Banco real: teste transacional de criação de snapshot, aceite, repetição e fila passou; todas as fixtures foram revertidas por rollback, com número explícito 0, sem consumir a sequência GL.
- Endpoint real: health, rejeição de token inválido e bloqueio de reenvio sem login.
- A Edge Function pública usa verify_jwt=false porque o aceite é autorizado pelo token aleatório. O reenvio exige JWT válido e checagem de proprietário/admin ativo por RPC. As RPCs públicas são SECURITY INVOKER; tabelas e funções internas usam grants estreitos.
- Nenhum e-mail real enviado nesta etapa, pois faltam as credenciais.
