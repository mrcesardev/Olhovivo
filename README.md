# Radar do Congresso

Observatório de **apoios declarados** às presidências da Câmara dos Deputados e do Senado. Homepage pública e dashboard editorial, em português, com integração cadastral oficial, revisão humana e histórico.

> Apoio declarado não comprova voto. As eleições das Mesas são secretas. O sistema não atribui votos individuais nem transforma apoio partidário em apoio pessoal.

## Executar a demonstração

Requisitos: Node.js 22 ou superior e npm.

```bash
npm ci
npm run dev
```

Abra `http://localhost:3000` e `/admin`. **Sem `DATABASE_URL`, os dois ambientes são uma demonstração fictícia somente para leitura**, identificada na interface. Nenhum candidato, partido ou apoio demonstrativo é inserido no banco de produção. Os formulários podem ser inspecionados, mas não salvos nesse modo.

## Ativar o sistema real

1. Crie um projeto Supabase com PostgreSQL e Auth. Desative cadastro público de usuários se a equipe for convidada manualmente.
2. Copie `.env.example` para `.env.local` e configure a conexão PostgreSQL com TLS e os valores públicos do Supabase. Não versione senhas ou tokens.
3. Execute `npm run db:migrate`. A migração é transacional e idempotente. Usa o schema privado `radar`, não exposto ao Data API. Não adicione esse schema à lista de schemas públicos do Supabase.
4. Crie o primeiro usuário no Supabase **Authentication → Users**. A senha pertence ao Auth, não ao cadastro editorial.
5. Autorize esse usuário como administrador:

```bash
npm run admin:bootstrap -- UUID_DO_USUARIO email@exemplo.com "Nome do administrador"
```

6. Execute `npm run dev`, abra `/admin` e entre com o usuário criado. Sem autorização em `radar.app_users`, uma conta Supabase válida não acessa o painel.
7. Em **Integrações**, sincronize Câmara e Senado. Crie a disputa como **rascunho**, registre o total de cadeiras com sua fonte, revise a composição e cadastre os candidatos. Só então abra o acompanhamento.
8. Cadastre declarações com fonte, data e trecho; revise e publique. A homepage consulta uma versão consistente a cada 30 segundos.

Não use a lista de parlamentares atuais como se fosse a composição futura de 2027. Antes da posse, combine eleitos confirmados com mandatos em continuidade, revisando cada identidade e sua elegibilidade.

## Funcionalidades

- Seletor de Casa, cartões de candidatos, barras percentuais, busca, filtros por partido e UF, paginação e links compartilháveis.
- Fotos oficiais com fallback para iniciais, layout responsivo e metodologia pública.
- Dashboard com cadastros, candidaturas, composição, fontes, declarações, revisão, resultado oficial, equipe e auditoria.
- Papéis `editor`, `reviewer` e `admin`, verificados no servidor. Autoaprovação é permitida apenas ao administrador quando habilitada e fica auditada.
- Uma única posição individual vigente por pessoa e disputa. Publicação, substituição, contestação e retirada usam transações e preservam o histórico.
- Idempotência de requisições e controle de versão para impedir duplicidades e sobrescrita silenciosa.
- Sincronização paginada da Câmara e importação do Senado; lote parcial não substitui o cadastro anterior. Exceções manuais são preservadas.
- Importação assistida de CSV do TSE e conciliação explícita de identidades, sem correspondência automática por nome.
- Exportação administrativa CSV com proteção contra fórmulas de planilha.
- Resultado oficial agregado por turno separado do retrato congelado de apoios.
- Rate limit de 60 escritas por minuto por usuário, compartilhado no PostgreSQL; validação de entrada e schemas com RLS sem políticas para clientes públicos.

## Fluxo editorial

1. **Parlamentares:** obtenha o cadastro oficial. Se a mesma pessoa foi importada de outra origem, use **Conciliar** depois de confirmar sua identidade nas fontes. A origem antiga vira um alias e não reaparece como pessoa nova na sincronização.
2. **Disputas e composição:** revise vaga, pessoa, elegibilidade e fonte. Para substituir titular por suplente, desative o ocupante anterior antes de habilitar o novo. Apoio não é transferido.
3. **Candidatos:** selecione uma pessoa elegível e cadastre a fonte da candidatura.
4. **Declarações:** salve um rascunho ou envie à revisão. `support` é apoio individual; `party` e `self_report` não entram na barra; `neutral` não possui candidato.
5. **Revisão:** abra a evidência, confira a atribuição e publique. Uma publicação mais recente substitui a posição anterior. Use **Nova revisão** para corrigir uma publicação.
6. **Fontes:** marque indisponibilidade com justificativa. Isso não presume retirada do apoio. Para suspender a contagem, conteste ou retire a publicação explicitamente.
7. **Resultado:** registre os totais oficiais e a fonte. O acompanhamento é fechado e o retrato dos apoios fica congelado. Um segundo turno pode ser incluído. Resultados podem ser corrigidos com auditoria.

## Percentuais e composição

`percentual = 100 × apoios individuais vigentes e elegíveis ÷ total de cadeiras validado`.

O denominador é configurável por edição. O número de cadeiras da imagem demonstrativa não determina a composição real de uma legislatura. Filtros na lista não alteram o total do cartão.

Sem declaração localizada é calculado sobre a composição revisada, não simplesmente sobre cadeiras menos apoios. Neutralidade, contestação e apoio a candidato retirado são contabilizados separadamente.

## Integrações

| Origem | Endpoint ou entrada                                                 | Uso                                     |
| ------ | ------------------------------------------------------------------- | --------------------------------------- |
| Câmara | `https://dadosabertos.camara.leg.br/api/v2/deputados`               | Cadastro, todas as páginas de 100 itens |
| Senado | `https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json` | Cadastro de parlamentares em exercício  |
| TSE    | CSV oficial com situação da totalização                             | Eleitos de 2026, importação assistida   |

O CSV deve estar em UTF-8, delimitado por `;`, com `SQ_CANDIDATO`, `NM_URNA_CANDIDATO` (ou `NM_CANDIDATO`), `SG_PARTIDO`, `SG_UF`, `DS_CARGO` e `DS_SIT_TOT_TURNO`. Importe um recorte com até 2.000 linhas e 1 MB. Apenas `ELEITO`, `ELEITO POR QP` e `ELEITO POR MÉDIA` para `DEPUTADO FEDERAL` e `SENADOR` são aceitos. O sistema não faz upload automático do conjunto inteiro do TSE.

Execute `npm run sync` manualmente ou use o cron autenticado. `vercel.json` agenda a sincronização diária às 06h UTC, equivalente a 03h de Brasília no fuso atual. Configure `CRON_SECRET` com valor aleatório de pelo menos 32 bytes. A função exige `Authorization: Bearer <CRON_SECRET>`.

## Deploy na Vercel

1. Importe o repositório como projeto Next.js.
2. Configure as quatro variáveis de `.env.example` necessárias para produção: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `CRON_SECRET`. `APP_URL` é uma referência operacional.
3. Execute a migração no banco **antes** de habilitar usuários e publicação. Migrações não rodam implicitamente no build.
4. Faça o bootstrap do primeiro administrador pelo terminal seguro. Configure as URLs do projeto no Supabase Auth e habilite MFA na política de acesso se a operação exigir.
5. Build: `npm run build`. Não use exportação estática: o sistema precisa de funções de servidor e PostgreSQL persistente.
6. Verifique os limites de execução do plano para as rotas de sincronização (`maxDuration=300`) e a configuração de cron. Se o plano não suportar essa duração, execute `npm run sync` em um agendador externo confiável.

As variáveis `NEXT_PUBLIC_*` são incorporadas ao bundle no build. Após alterá-las, gere um novo deploy. A chave pública Supabase não concede acesso às tabelas privadas. A senha PostgreSQL nunca vai ao navegador.

## Qualidade

```bash
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Os testes de serviço executam a migração real em PostgreSQL via PGlite, com transações, constraints e RLS. O teste de interface verifica o modo de demonstração em desktop e celular. A autenticação real com seu projeto Supabase deve ser homologada após configurar as credenciais; não há bypass de autenticação para produção.

Veja [validação](docs/VALIDACAO.md), [operação](docs/OPERACAO.md) e [escopo implementado](docs/ESCOPO.md). A integração contínua está em `.github/workflows/ci.yml`.

## Organização

```text
src/app/             páginas e endpoints Next.js
src/components/      homepage e dashboard
src/lib/service.ts   regras editoriais e projeção pública
src/lib/importers.ts adaptadores oficiais e CSV
src/lib/auth.ts      autenticação e autorização inicial
db/                  migração PostgreSQL
scripts/             migração, bootstrap e sincronização
tests/               testes de regras, banco e HTTP
e2e/                 testes de interface
docs/                operação, validação e escopo
```

O PRD orienta a evolução. Este repositório entrega o núcleo funcional; metas de SLA, teste com usuários, restauração em produção e ensaio de carga precisam ser validados no ambiente contratado antes de uma cobertura pública de grande escala.
