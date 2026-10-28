# Correspondência com o PRD

## Entregue

| Área         | Implementação                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Homepage     | Casa, candidato, barra percentual, lista, busca, partido, UF, paginação, URL e metodologia                                         |
| Dashboard    | Visão geral, candidatos, parlamentares, disputas, composição, declarações, revisão, fontes, integrações, histórico e configurações |
| Autenticação | Supabase Auth e autorização por usuário ativo no banco; bootstrap do primeiro admin                                                |
| Cadastros    | APIs oficiais, paginação, proteção contra lote parcial, exceção manual, importação assistida TSE e aliases                         |
| Apoios       | Fonte, data, trecho, tipos distintos, revisão, substituição, contestação e retirada                                                |
| Consistência | Transações, constraints, idempotência, versão de edição, snapshot de leitura repetível                                             |
| Equipe       | Administrador, revisor, editor e autoaprovação configurável                                                                        |
| Resultados   | Totais por turno, verificação aritmética e congelamento dos apoios                                                                 |
| Operação     | Cron autenticado, logs de importação, auditoria, CSV e instruções de backup                                                        |

## Simplificações explícitas da primeira versão

- A homepage consulta um snapshot JSON completo com atualização a cada 30 segundos. Para o universo de uma Casa, isso permite filtros locais e evita inconsistência entre cards e lista. Não há cache distribuído nem fila de invalidação nesta versão.
- O dashboard carrega até 3.000 declarações recentes e 200 eventos de auditoria. Cadastros e composição mostram até 100 resultados por busca. Para acervo histórico maior, implementar paginação no servidor antes de ampliar a cobertura.
- Cada declaração possui uma fonte principal. Evidências complementares podem ser descritas nas observações; a relação normalizada de múltiplas fontes por declaração fica para evolução.
- Datas da declaração são obrigatórias para publicação. Fontes sem data devem permanecer fora da contagem até confirmação editorial.
- Revisão é feita pelos detalhes da evidência e pelo resumo de impacto antes da confirmação. Não há uma URL pública de prévia de rascunho.
- Conciliação de identidades só é permitida quando as duas não estão na mesma composição. Casos já duplicados exigem correção assistida de dados antes da unificação.
- O endpoint administrativo agrupa comandos em `POST /api/admin` em vez de expor uma rota REST por entidade. Validação e autorização permanecem específicas por operação.
- O canal de correção é um link configurável. Não há inbox de atendimento, envio de e-mail ou comentários públicos.
- Disponibilidade da fonte é revisada manualmente. Não há crawler de links nem armazenamento automático de notícias completas.

## Antes de produção

Credenciais, banco, contas Auth, políticas de backup, domínio e hospedagem precisam ser configurados no ambiente do proprietário. Nenhuma senha real acompanha o código. Homologar login real, publicação entre contas, MFA conforme a política da equipe, restauração, desempenho de carga e acessibilidade assistiva.

## Evolução posterior

Fila de importação para grandes lotes, conciliação temporal completa de mandatos, histórico público por pessoa, múltiplas fontes, notificações operacionais externas, métricas de audiência agregadas e sugestões de declarações por IA com revisão obrigatória. Essas funções não são apresentadas como já implementadas.
