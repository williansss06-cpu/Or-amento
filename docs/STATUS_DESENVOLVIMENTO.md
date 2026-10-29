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

Limites: ainda sem teste de concorrência em conexões PostgreSQL independentes; PGlite não substitui Supabase completo, JWT real, PostgREST, políticas reais de profiles ou teste de login. As tabelas existentes da loja permanecem intactas; os novos objetos ficam no schema global_quotes.

## Publicação autorizada em 29/10/2026
O usuário solicitou expressamente colocar em produção. Esta autorização substitui os bloqueios de publicação anotados acima nas etapas anteriores.

- Migration `global_quotes_authenticated_persistence` aplicada com sucesso no Global Shop.
- `databaseReady=true`; release usa a hospedagem GitHub Pages existente.
- Verificação no banco real com role authenticated e identidade SQL do owner: listagem retornou histórico vazio. Essa verificação não equivale a login com JWT real.
- RLS ativo nas duas tabelas; anon sem SELECT; authenticated sem INSERT direto. As três RPCs públicas são SECURITY INVOKER e anon não tem EXECUTE.
- Advisors: avisos anteriores da loja preservados; os dois avisos RLS sem policy são esperados no schema privado, onde não há acesso direto. Acesso somente pelas funções privadas autorizadas.
- Não foram criados orçamentos fictícios em produção nem consumido GL0001.
- Testes isolados: 11 aprovados; interface conferida no navegador na etapa anterior.
- Aprovação por link e e-mail automático continuam pendentes e não são anunciados como ativos.

### Rollback
Para reverter a interface, restaurar a main para o conteúdo do commit anterior à publicação `0ea179d6de2c3f0c74271d548c5966d595e6b603` por novo commit. O backend novo pode permanecer isolado e sem uso; não apagar o schema nem orçamentos reais. Não alterar tabelas da loja.

## Pendências funcionais
- Aprovação por link, snapshot formal e token de uso único.
- Provedor de e-mail transacional e notificação automática para globalacessoriosemgeral@gmail.com.
- Teste completo de login/salvamento com credenciais do administrador no navegador; não foram solicitadas nem manipuladas senhas do usuário.
- Teste de concorrência em conexões PostgreSQL independentes.

## Advisors
Os avisos preexistentes de funções da loja não foram alterados. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
