# Operação e segurança

## Primeiro lançamento

- Configure o Supabase Auth e o banco, rode a migração e autorize o administrador.
- Crie disputas em rascunho. Valide o total de cadeiras e sua fonte para a legislatura.
- Confira identidades, titulares, suplentes e mandatos em continuidade. A importação não concede elegibilidade.
- Cadastre candidatos com fonte e revise as primeiras declarações.
- Configure canal de correções e política de autoaprovação. Para equipe com mais de uma pessoa, desative a autoaprovação.
- Teste login, publicação, retirada e revisão com contas separadas na homologação.
- Confirme que nenhum dado demonstrativo existe no banco real. Sem `DATABASE_URL`, a interface permanece explicitamente demonstrativa.
- Valide backup, cron e limites do provedor antes da estreia.

## Backup e recuperação

Use o backup gerenciado do provedor e uma rotina independente conforme a política de retenção. Exemplo com cliente PostgreSQL instalado e conexão fornecida por variável de ambiente segura:

```bash
pg_dump "$DATABASE_URL" --format=custom --schema=radar --file=radar-backup.dump
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner radar-backup.dump
```

Restaure primeiro em banco vazio de homologação, nunca sobre produção sem um plano revisado. O backup do schema `radar` não inclui o Supabase Auth: planeje a recuperação das contas e a preservação dos UUIDs com o provedor. Confirme contagens, vínculos, usuários, auditoria e resultados após a restauração. Mantenha arquivos de backup fora do GitHub, criptografados e com acesso restrito.

Metas propostas no PRD: RPO de 24 horas e RTO de 8 horas. Essas metas dependem do plano e de um ensaio real; não são garantias desta implementação.

## Sincronização

- Cron diário às 06h UTC; operação manual no painel e via `npm run sync`.
- O job registra início, fim, quantidade e erro. Todas as páginas precisam terminar antes do upsert.
- Identidade usa origem e ID, nunca apenas nome. Exceções manuais permanecem protegidas.
- Um job interrompido é marcado como falha após 10 minutos na próxima tentativa.
- Nenhum registro ausente no lote é excluído automaticamente; composição exige revisão humana.
- O job da Câmara e o do Senado são sequenciais. Se o primeiro falhar, o segundo não roda nessa chamada; execute manualmente a Casa pendente.
- Alterações de cadastro são auditadas. Rate limits antigos são removidos na sincronização; eventos editoriais não são apagados.

## Correção de publicação

Use Nova revisão para propor uma correção. O registro anterior fica publicado até a substituição. Para erro material que não pode continuar na contagem, use Contestar ou Retirar imediatamente. Não edite uma publicação diretamente no banco. Restaurar uma posição antiga significa publicar uma nova declaração com fonte, data e justificativa corretas; não apagar o histórico.

## Limites de segurança

- Autorização no servidor por Supabase `getUser(token)` e papel ativo em `radar.app_users`.
- RLS em todas as tabelas e schema não exposto a clientes. As operações usam a conexão PostgreSQL exclusivamente no servidor.
- Rate limit de escrita por usuário no PostgreSQL. Proteção de login depende dos limites do Supabase Auth. Para tráfego público elevado, configure proteção de borda no provedor.
- Requisições de escrita exigem Bearer token e JSON; não utilizam cookies de sessão como autorização e não liberam CORS.
- URLs de fontes são validadas mas não buscadas no servidor. Somente endpoints fixos oficiais são coletados, sem seguir redirecionamentos arbitrários.
- Os trechos são renderizados como texto, sem HTML arbitrário. Fotos são carregadas pelo navegador com `referrerPolicy=no-referrer`.
- Em produção, ofereça HTTPS e proteja o projeto Supabase com MFA da conta de administração. A aplicação não exige AAL2 de todos os usuários por padrão; configure essa política antes de um uso que a exija.
- O header CSP usa `unsafe-inline` para compatibilidade com a hidratação Next.js. Não introduza HTML de terceiros sem sanitização e revisão.

## Mudanças de schema

A migração inicial é aplicada uma única vez. Para evoluções, adicione novas migrações numeradas e estenda o runner; não altere silenciosamente um banco já migrado. Antes do primeiro deploy, a migração inicial pode ser revisada em conjunto com o código.

## Dados e monitoramento

Não registre tokens, senhas ou conteúdo de login. Configure alertas no provedor para erro de funções, job sem sucesso há 48 horas e consumo de banco. O dashboard expõe o histórico de jobs e de publicações; integração com ferramentas externas de alertas ainda depende da infraestrutura escolhida.
