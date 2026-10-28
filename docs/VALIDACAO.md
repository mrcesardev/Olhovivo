# Validação — 28/10/2026

- `npm run build`: aprovado, compilação de produção e verificação TypeScript.
- `npm run test`: 21 testes aprovados, incluindo execução da migração SQL real em PostgreSQL embarcado (PGlite).
- `npm run test:e2e`: 6 testes aprovados em Chromium, nas resoluções 1440×1000 e 390×844. Seleção de Casa e candidato, busca, paginação, dashboard, formulário de demonstração, bloqueio de escrita e endpoints privados.
- Inspeção visual das capturas da homepage mobile e dashboard desktop: sem cortes ou rolagem horizontal indevida.
- `npm audit --omit=dev`: nenhuma vulnerabilidade reportada na execução. Essa verificação representa o estado do registro consultado, não uma garantia permanente.
- Consulta real dos importadores oficiais: 513 registros da Câmara e 81 do Senado validados, sem escrita em banco nem geração de declarações.

## Cobertura e limites

Os testes de domínio cobrem autorização, revisão, fonte obrigatória, idempotência, troca de apoio, controle de versão, contestação, elegibilidade, retirada de candidato, fechamento de resultado, conciliação, fonte indisponível, importações e proteção do schema. Os E2E foram executados no modo demonstração com servidor de desenvolvimento; a configuração CSP de produção foi compilada, mas o login real não foi testado em navegador.

Ainda dependem de ambiente do responsável: autenticação com projeto Supabase real, aplicação da migração no banco hospedado, teste de envio editorial de ponta a ponta autenticado, deploy, execução do cron hospedado, restauração de backup, carga e auditoria completa de acessibilidade. Não foram usadas credenciais reais nem publicados dados políticos reais.

O workflow de CI está incluído. Sua execução no GitHub depende do envio ao repositório.
