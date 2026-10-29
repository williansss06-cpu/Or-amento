# Restauração do HTML original — 29/10/2026

O arquivo enviado pelo usuário, Proposta_Comercial_Global_v11_Numeracao_Automatica(1).html, é a referência visual. A publicação anterior havia substituído esse documento por uma interface simplificada. Esta correção restaura a referência.

## Preservado
- Layout com editor à esquerda e documento comercial à direita.
- Logo, foto da cinta, cores, textos, dados cadastrais da Global e campos de cliente/CNPJ/endereço.
- Produtos com nome, tamanho, especificação, quantidade e preço.
- Benefícios, cuidados de uso, simulações de economia, vida útil, produtividade e visão executiva.
- Quatro gráficos SVG originais e estilos de impressão A4.
- Exportação/importação JSON e restauração dos exemplos.

As duas imagens são exatamente as embutidas no arquivo enviado, conferidas contra o blob histórico do repositório. Para não duplicar 1,25 MB em cada página, o mesmo blob histórico está em assets/proposta-original.txt; o adaptador apenas extrai os atributos src das imagens via DOMParser, sem executar o código desse arquivo. index.html e aprovar.html preservam o modelo completo.

## Integração acrescentada
Acesso administrativo fica em painel recolhível acima do editor. Numeração oficial permanece no Supabase; rascunhos não recebem números locais. Gravação inclui todos os campos e premissas em presentation, e o histórico reconstitui o documento. Os valores e produtos do banco prevalecem sobre os metadados de apresentação. Propostas antigas sem presentation recebem premissas de simulação zeradas em vez de estimativas inventadas.

A página pública usa o mesmo layout e imagens, oculta o editor, carrega o snapshot pelo token e registra nome, e-mail, cargo e referência do aceite. O link também pode ser incluído no PDF gerado depois da emissão do link.

O envio real de e-mail continua dependente dos secrets GLOBAL_RESEND_API_KEY e GLOBAL_EMAIL_FROM. Não foi ativado nem anunciado como configurado.

## Validação
- 21 testes isolados aprovados, incluindo roundtrip de produtos, endereço, premissas e snapshot, e persistência de cargo/referência.
- Navegador: imagens carregadas (457 px e 1089 px), quatro gráficos, atualização da economia para R$ 1.800/mês com preço de stretch R$ 30/kg nas premissas originais.
- Sem criação de orçamentos comerciais de teste nem consumo da numeração GL em produção.
