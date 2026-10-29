# Sistema de Orçamentos Global — 29/10/2026

## Entregue nesta etapa
- Frontend modular com autenticação por senha no Supabase Auth existente; tokens apenas em memória, sem persistir senha ou sessão no navegador.
- Cliente HTTP usa apenas a chave publicável do Global Shop.
- RPCs candidatas de gravação, listagem paginada (50) e abertura de proposta.
- Numeração por sequência no banco; unicidade, com possíveis lacunas após rollback.
- Idempotência por UUID: repetição de requisição idêntica retorna a proposta existente; UUID com conteúdo diferente é recusado. Lock transacional serializa chamadas do mesmo UUID.
- Totais recalculados em centavos no servidor, quantidade inteira e limites de valores/itens.
- Acesso restrito a owner/admin ativo e somente às propostas do próprio autor. Nenhum acesso direto às tabelas privadas.
- Propostas salvas não são editadas pelo cliente: ao alterar, uma nova proposta é criada. Etapa de aprovação e versões formais ainda pendente.
- Cálculos do navegador em centavos e normalização de WhatsApp sem duplicar o DDI 55.
- PDF continua por impressão do navegador; e-mail e WhatsApp abrem mensagem para envio manual.

## Validação
`npm ci` e `npm test`: 11 testes aprovados. SQL executado em PostgreSQL embarcado PGlite, com roles anon/authenticated e fixtures de auth.users/profiles. Testados: gravação, retry idempotente, manipulação de total, validação/rollback, isolamento por autor, negação de anon/inativo/cliente/sem JWT e bloqueio de acesso direto às tabelas.

Interface conferida em navegador: carregamento, criação de item e total R$ 0,49 para 3 × R$ 0,10 + R$ 0,20 − R$ 0,01. Corrigida incompatibilidade de crypto.randomUUID em preview HTTP, mantendo UUID aleatório criptográfico via getRandomValues.

Limites: ainda sem teste de concorrência em conexões PostgreSQL independentes; PGlite não substitui Supabase completo, JWT real, PostgREST, políticas reais de profiles ou teste de login. Banco compartilhado da loja permanece intacto.

## Ativação pendente
1. Homologar a migration em Supabase isolado com cópia da estrutura de profiles/Auth; conferir advisors e chamadas REST com JWT real, inclusive cliente/inativo/anon.
2. Aplicar migration versionada após homologação e revisar cache PostgREST. Não executar o arquivo de drafts.
3. Só então alterar `databaseReady` em `js/config.mjs` para true e publicar a interface pela hospedagem escolhida.
4. Implementar link público de aprovação, snapshot imutável, token com hash/validade/uso único e outbox de e-mail com reenvio.
5. Configurar provedor de e-mail transacional e remetente autorizado. Destino de notificação: globalacessoriosemgeral@gmail.com. Nenhum e-mail foi enviado nesta etapa.

## Estado real
Código em branch de desenvolvimento; migration candidata não aplicada, `databaseReady=false`, sem merge nem publicação. A interface mostra explicitamente que a gravação ainda não está ativa. Não apresentar esta etapa como sistema em produção.
