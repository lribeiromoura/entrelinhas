# Entrelinhas

Biblioteca pessoal local em Next.js + TypeScript, com Better Auth e SQLite. Especificação e critérios de aceitação: `SPEC.md`.

## Executar

Requer Node.js 22.18+ e npm. Abra um terminal na pasta do projeto:

```sh
npm ci --legacy-peer-deps
npm run dev
```

Abra **http://localhost:3000**. O servidor fica restrito a `localhost`. A inicialização prepara as tabelas de autenticação automaticamente. Crie sua própria conta na tela inicial; e-mails não precisam ser reais para a demonstração local. Senha com no mínimo oito caracteres.

Para executar a compilação de produção:

```sh
npm run build
npm start
```

Não execute desenvolvimento e produção na mesma porta ao mesmo tempo. Encerre com Ctrl+C.

## Experimentar o fluxo

1. Crie uma conta e use **Adicionar Livro** na estante. Busque título, autor ou ISBN, ou cadastre manualmente no modal.
2. Abra um livro. Em **Opções do livro**, use **Editar livro**, **Capa do livro**, **Exportar PDF** ou **Mover para lixeira**. A capa pode ser buscada na Open Library ou enviada como imagem privada.
3. Escreva ou dite um resumo e clique em **Salvar resumo**. Cada alteração salva cria uma versão. O editor mostra o texto atual; **Histórico** abre as versões guardadas, permite consultar o texto completo e usar uma delas como atual. A recuperação cria uma nova versão e preserva as outras. Rascunhos locais só entram no histórico ao serem salvos.
4. Em **Escolher foto**, selecione imagens ou use a câmera quando o dispositivo oferecer essa opção. São aceitos JPEG, PNG e WebP de até 8 MB por imagem.
5. No menu lateral ficam Biblioteca, Exportar PDF, Backup e Lixeira. Ideias, mapa, perguntas e revisões foram retirados da interface por solicitação do usuário. Registros antigos continuam preservados no banco e nos backups compatíveis.
6. A PWA pode ser adicionada à tela inicial se o navegador oferecer essa opção. O uso continua conectado e os dados privados não ficam em cache.

## Dados e configuração

Tudo fica em `data/`: `library.sqlite` armazena contas, livros, resumos, imagens, ideias, conexões e revisões. `secret` contém o segredo de sessão gerado automaticamente. **Preserve essa pasta**; apagar o banco apaga a biblioteca. Para backup simples, pare o servidor e copie toda a pasta `data/`. Imagens não são servidas por uma pasta pública: cada leitura exige uma sessão e confere o proprietário.

As opções de `.env.example` são opcionais. Para personalizar, crie `.env.local` e defina `BETTER_AUTH_URL` e/ou `BETTER_AUTH_SECRET`. O script de preparação também lê os arquivos de ambiente do Next.js. O banco de testes usa `DATA_DIR` temporário e é independente da biblioteca real.

A API de livros é a Open Library e não exige chave. Não há dependência de hospedagem paga para executar localmente. As buscas são enviadas à Open Library; os resumos e imagens permanecem no banco local. O aplicativo não foi publicado.

## Verificações

```sh
npm test
npm run build
npm run test:integration
```

Os testes de integração sobem uma instância local temporária em `localhost:3101`, criam duas contas descartáveis e verificam autenticação, persistência, upload, conexões, avaliações, CSRF e isolamento por proprietário. A pasta temporária é removida ao terminar. Não use a porta 3101 para outro serviço durante o teste.

## Limitações desta primeira versão

- O uso atual está concentrado em livros, resumos com histórico e fotos. Recursos antigos de ideias, mapa e revisão foram retirados da interface.
- Sem recuperação de senha, confirmação de e-mail ou provedor social. Guarde sua senha.
- Não há OCR, geração por IA, colaboração, push nem edição offline completa.
- Texto não salvo fica guardado neste navegador por conta e livro. Limpar os dados do navegador ou sair explicitamente da conta remove os rascunhos; eles não são sincronizados entre dispositivos.
- Fotos novas são otimizadas para JPEG, com até 2400 pixels no maior lado, e têm os metadados EXIF removidos. A entrada aceita até 8 MB e o envio ao servidor até 3 MB; imagens antigas locais permanecem intactas.
- Instalação da PWA e acesso à câmera variam entre dispositivos. Não foi testado em um telefone físico. Uma instalação local no computador não sincroniza automaticamente com um telefone.
- A configuração padrão atende uma instância local. A integração opcional com Supabase e a preparação para Vercel estão incluídas; conexão e publicação exigem configurar as variáveis privadas descritas abaixo. Backup automatizado ainda não está incluído.

## Referências

- Better Auth: https://better-auth.com/docs/installation
- Open Library: https://openlibrary.org/dev/docs/api/search

## Ditado do resumo

Na página de um livro, clique em **Ditar resumo** e autorize o microfone no navegador. Fale em português do Brasil: trechos confirmados são acrescentados ao texto existente, e o trecho ainda em reconhecimento aparece separado. Clique em **Parar ditado**, confira e corrija o texto e depois clique em **Salvar resumo**. O último trecho provisório disponível é mantido para sua revisão ao encerrar.

O aplicativo não grava nem armazena um arquivo de áudio. O serviço de reconhecimento do navegador pode receber o áudio para transcrição. Não há chave de API nem cobrança de transcrição pelo aplicativo; disponibilidade, processamento e conexão dependem do navegador. Esta versão não garante reconhecimento local nem offline. Se o navegador não oferecer suporte, digitação continua disponível e uma explicação aparece na tela.

O ditado para ao sair da página do livro. O texto é guardado automaticamente como rascunho neste navegador; use Salvar resumo para persistir na biblioteca. O botão de salvar fica bloqueado durante o ditado para evitar salvar uma transcrição incompleta. Falhas do microfone ou da rede não apagam o texto já recebido.

Verificação: eventos de fala, trechos provisórios/finais, duplicatas, preservação do texto, interrupção, permissão negada, falha de rede e encerramento ao trocar de livro são testados com um reconhecimento simulado. O microfone real não é acionado por esses testes.

## Supabase e Vercel

O aplicativo possui dois modos: SQLite local (sem segredos externos) e Supabase (PostgreSQL e Storage privado). O login continua com Better Auth e cookies de sessão. O navegador não recebe a chave administrativa nem a conexão do banco.

Configure as seguintes variáveis **privadas no servidor** do projeto Vercel:

| Variável                                             | Valor                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `DATABASE_URL` ou `POSTGRES_URL`                     | URI do Transaction pooler do Supabase, com a senha do banco              |
| `SUPABASE_URL`                                       | URL do projeto Supabase                                                  |
| `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEY` | Chave privada do projeto; nunca use prefixo `NEXT_PUBLIC_`               |
| `BETTER_AUTH_SECRET`                                 | Segredo aleatório de pelo menos 32 caracteres, estável entre publicações |
| `BETTER_AUTH_URL`                                    | Origem HTTPS exata da publicação, sem caminho                            |

`DATABASE_MIGRATION_URL` é opcional: permite indicar a URI do Session pooler para preparação das tabelas. Sem ela, o script usa a mesma conexão e troca a porta 6543 pela 5432 quando o host é o pooler oficial do Supabase. Isso mantém os bloqueios de migração em uma sessão, sem usar bloqueio de sessão através do Transaction pooler. `DATABASE_CA_CERT` permite fornecer a CA oficial do projeto caso necessária. A validação do certificado TLS permanece ativa.

O `vercel.json` prepara o banco e executa o build antes da publicação. O script cria as tabelas do Better Auth, aplica `supabase/app-schema.sql`, ativa RLS, revoga acesso às tabelas de login e biblioteca para os papéis públicos do Supabase e prepara o bucket privado `entrelinhas-private`. A conta da conexão precisa ter permissão para essas etapas. O acesso aos dados ocorre pelos endpoints autenticados do aplicativo; não crie políticas públicas de leitura nas tabelas nem no bucket. Um bucket existente que seja público causa falha de preparação em vez de uma publicação insegura.

A integração oficial Supabase–Vercel pode fornecer as variáveis `POSTGRES_URL`, `SUPABASE_URL` e `SUPABASE_SECRET_KEY`. O aplicativo aceita esses nomes. Ainda é preciso definir as duas variáveis do Better Auth. Mantenha a conexão restrita ao projeto Entrelinhas e não vincule ambientes de teste ao banco de produção sem intenção explícita.

A configuração incompleta na Vercel falha de forma explícita; o aplicativo não usa um SQLite temporário silenciosamente. Os dados e as contas da instalação local **não são transferidos automaticamente** para o Supabase. A cópia local continua preservada; uma migração de dados é uma operação separada.

As imagens são baixadas pelo servidor somente após conferir a sessão e o proprietário. Não há URL pública de fotos nem cache compartilhado de conteúdo privado. Uploads que falham na vinculação ao banco tentam limpar o objeto enviado.

Referências: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [integração Vercel](https://supabase.com/docs/guides/integrations/vercel-marketplace), [limite de requisições Vercel](https://vercel.com/docs/functions/limitations).

### Rascunhos e lixeira
O resumo guarda rascunho automaticamente no armazenamento persistente deste navegador, separado por conta e livro. Volte ao livro, inclusive após fechar a aba, para recuperar; clique em **Salvar resumo** para persistir no servidor. O navegador avisa antes de sair, mas esse aviso pode não aparecer quando o sistema encerra o aplicativo. Sair da conta limpa os rascunhos após confirmação.

Use **Editar** para corrigir livros, ideias e perguntas. **Mover para lixeira** oculta registros sem excluí-los definitivamente. A aba **Lixeira** permite restaurar. Restaure primeiro livros e ideias necessários; a agenda das revisões é mantida. Itens removidos separadamente precisam ser restaurados separadamente. Fotos de itens ocultos deixam de ser acessíveis. O deploy executa migrações aditivas compatíveis com os dados existentes.

### Backup com fotos e restauração
Na aba **Backup**, use **Baixar backup com fotos**. O arquivo JSON versionado contém os registros salvos, fotos, capas enviadas, referências às capas da Open Library, vínculos, datas/estágios de revisão e itens da lixeira. Rascunhos não salvos e credenciais não são exportados. O arquivo é privado e não é criptografado; guarde-o como suas próprias anotações.

Selecione o arquivo, confira a prévia e clique em **Restaurar na minha biblioteca**. A restauração acrescenta cópias com novos identificadores à conta atual, sem substituir registros existentes. Mantém a lixeira e a agenda. O mesmo backup não é importado duas vezes na mesma conta. Se uma transferência falhar, tente novamente com o mesmo arquivo; fotos já recebidas são aproveitadas. Arquivos inválidos ou incompletos não produzem uma biblioteca parcial.

Limites explícitos desta versão: 100 MB por arquivo JSON, 2 MB de metadados/texto, 5.000 registros de cada tipo e 3 MB por imagem. As imagens são conferidas pelo conteúdo e hash e passam pela otimização/remoção de metadados ao restaurar. Capas externas continuam dependendo da Open Library. O navegador monta o download com imagens recebidas individualmente; a restauração envia os metadados e cada imagem separadamente, respeitando o [limite de payload das funções Vercel](https://vercel.com/docs/functions/limitations).

Migrações aditivas criam `backup_imports` e `backup_import_photos`, ambas privadas com RLS e acesso público revogado no PostgreSQL. Arquivos em preparação ficam invisíveis até a conclusão em uma transação. Envios pendentes expiram em 24 horas; iniciar outra restauração da mesma conta limpa os registros temporários expirados e tenta remover suas imagens temporárias. Não há processo agendado de limpeza nem serviço pago adicional. As operações de backup exigem sessão e as de escrita verificam a origem.

A implementação foi verificada localmente e com PostgreSQL via PGlite. A publicação desta etapa aguarda o commit/deploy consolidado solicitado. Depois do deploy, a verificação opcional é `node scripts/integration.mjs --production --backup`; ela cria contas e dados fictícios no endereço oficial.

### Exportar PDF
Na aba **Exportar PDF**, escolha os livros; na página de cada livro, use **Exportar PDF deste livro** para baixar somente aquele volume. Em ambos os casos, marque as seções: resumos atuais, fotos das anotações e capas enviadas. Use **Tudo** ou **Somente resumos** para começar rapidamente. O download é um PDF A4 criado no navegador; as fotos privadas são lidas individualmente após autenticação. Apenas registros ativos salvos entram no arquivo. Capas externas da Open Library, rascunhos e lixeira ficam de fora. O PDF contém suas anotações; guarde-o em local privado.

### Estante, cadastro e lixeira
A estante abre diretamente em **Sua estante** e **Adicionar Livro**. O cadastro por busca ou manual fica em um modal. Segurar um cartão por 600 ms, clicar com o botão direito ou usar **···** abre a opção **Apagar livro**, que move o livro e oculta seu conteúdo na lixeira. A exclusão definitiva só está disponível na lixeira e exige confirmação; excluir um livro remove também fotos, perguntas, ideias e conexões relacionadas.

A retenção é de 30 dias a partir da remoção. A biblioteca e os metadados de backup verificam os vencidos antes de carregar; operações da biblioteca também fazem essa verificação. O deploy tem um cron diário às 06:00 UTC em `/api/cron/trash`. Para ativá-lo de forma segura, configure **CRON_SECRET** com 32 ou mais caracteres na Vercel antes de publicar. Sem esse segredo, o endpoint agendado retorna 503; a limpeza ao acessar continua funcionando. A Vercel envia o segredo no cabeçalho de autorização conforme a [documentação oficial](https://vercel.com/docs/cron-jobs/manage-cron-jobs). A remoção de arquivos privados usa uma fila persistente para retentar falhas sem restaurar registros excluídos. A limpeza é feita em lotes; volumes grandes podem exigir mais de uma execução. Backups já baixados permanecem no dispositivo de quem os guardou.

### Histórico dos resumos
Migração aditiva cria `summary_versions`, privada por conta e com RLS no PostgreSQL. Salvamento e recuperação são transacionais: o resumo anterior e o novo são preservados; salvar texto idêntico não duplica versões. Um resumo anterior à implantação do histórico é preservado na primeira alteração. A consulta lista 20 entradas por página e carrega o texto completo de uma versão sob demanda; livros na lixeira e versões de outra conta são recusados. Excluir definitivamente um livro elimina também seu histórico.

O JSON de backup inclui `summaryVersions`, com identificação e livro remapeados ao restaurar. Backups antigos sem esse campo continuam aceitos. O limite de 2 MB de texto do backup inclui o histórico. O PDF usa apenas o resumo atual, conforme as seções selecionadas.

### Status de leitura e rascunhos duráveis
Livros têm status Quero ler, Lendo, Concluído ou Pausado, alterável no caderno e filtrável na estante. Livros existentes e backups antigos começam em Quero ler. O backup preserva o status.
Rascunhos agora usam armazenamento persistente deste navegador por conta e livro, recuperáveis após fechar a aba. Rascunhos antigos da sessão são migrados ao abrir o editor. Não sincronizam entre dispositivos e podem ser apagados ao limpar os dados do navegador. Sair explicitamente da conta continua pedindo confirmação e removendo seus rascunhos. Salvar ou descartar limpa o rascunho correspondente.

### Cache das capas
As dez primeiras posições da estante carregam suas capas prioritariamente. As capas públicas da Open Library nessas posições são pré-carregadas com duas requisições simultâneas e guardadas no navegador por até sete dias, com limite de dez imagens. A seleção acompanha o filtro da estante. Somente respostas de imagem válidas são persistidas; falhas não impedem o carregamento normal. Capas privadas enviadas, fotos, páginas autenticadas e APIs não entram neste cache. Isso não torna a biblioteca disponível offline.
