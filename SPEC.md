# Entrelinhas — especificação da versão 0.1

## Objetivo e limites

Aplicação local em Next.js e TypeScript para uma biblioteca pessoal privada por conta. Interface em português, adaptada ao celular, uso inicialmente conectado. Sem OCR, IA, colaboração, notificações push ou edição offline completa. Transcrições externas podem ser coladas no resumo.

## Defaults reversíveis

- Better Auth com e-mail e senha e sessões por cookie. Nenhum Bearer token.
- SQLite em `data/library.sqlite`, incluindo imagens em BLOB, evita arquivos públicos e permite backup conjunto. Sem custo ou serviços de infraestrutura presumidos.
- Segredo aleatório persistido em `data/secret` no primeiro uso, substituível por `BETTER_AUTH_SECRET`. Origem padrão `http://localhost:3000`, substituível por `BETTER_AUTH_URL`.
- Open Library via servidor, sem chave, busca por título, autor ou ISBN; cadastro manual sempre disponível.
- Fotos JPEG/PNG/WebP até 8 MB por arquivo; galeria e câmera com comportamento dependente do navegador.

## Contratos e critérios de aceitação

1. Cadastro cria conta e sessão; entrar e sair funciona. Visitantes não leem nem escrevem dados privados.
2. Cada consulta e mutação usa a identidade da sessão. IDs de outros proprietários não permitem ler imagens, alterar resumos, criar ideias/perguntas nem conectar ideias.
3. Adicionar livros pela busca ou manualmente persiste título e autor. A biblioteca é exclusiva da conta.
4. Cada livro aceita resumo editável, várias fotos, várias ideias e várias perguntas. Textos são escapados pelo React. Falhas de requisição não apagam os campos. Um resultado só informa sucesso após confirmação do servidor.
5. Ideias têm título e descrição. Conexões não direcionais manuais aceitam ideias de livros distintos. Uma conexão com si mesma ou repetida é recusada. O mapa visual mostra nós e linhas e tem uma lista textual das conexões.
6. Perguntas têm enunciado e resposta. A resposta fica oculta até o usuário digitar uma tentativa. Não há correção automática da tentativa.
7. Perguntas novas vencem em 1 dia. Estágios: 1, 3, 7, 14, 30 dias. Boa recordação avança um estágio (máximo 30); dificuldade mantém; esquecimento volta a 1. Próximo vencimento é calculado a partir da avaliação. Atrasadas continuam disponíveis. Prática antecipada explícita permite demonstrar sem aguardar um dia e também reagenda.
8. PWA com manifesto, ícones e service worker. Não há cache de conteúdo privado. Falta de conexão mostra aviso ou página de recuperação. Instalação requer suporte do navegador e localhost ou HTTPS.
9. Fluxos principais acessíveis em tela estreita, campos rotulados e erros anunciados por `role=alert`.

## Validação planejada

- Compilação de produção e checagem TypeScript.
- Testes dos intervalos e limites de repetição.
- Teste HTTP de cadastro, login, logout, persistência, acesso sem sessão e isolamento entre duas contas, incluindo fotos e conexões.
- Verificação de busca (quando a Open Library estiver acessível), manifesto e comportamento offline.

## Limitações assumidas

- Primeiro protótipo sem exclusão/edição de livros, ideias, conexões ou perguntas, exceto resumo.
- Sem recuperação de senha por e-mail, verificação de e-mail, compressão ou remoção de EXIF das imagens.
- Sem sincronização entre dispositivos/instalações locais. Banco e segredo devem ser preservados juntos.
- Uma instância local; não há configuração de hospedagem, HTTPS ou operação multi-instância. Não publicado.

## Incremento: capas reais

- Resultados da Open Library incluem o identificador de capa; novos livros preservam esse identificador.
- A estante exibe a imagem inteira sem cortar, com alternativa ilustrativa em caso de falha.
- Livros existentes podem buscar uma capa por título e autor. O resultado pode variar de edição.
- O proprietário também pode enviar uma imagem de capa, com as mesmas regras de privacidade e validação das fotos.
- Migração aditiva mantém os livros e anotações existentes.

## Incremento: ditado no resumo

- Botões explícitos para iniciar e parar o reconhecimento de voz do navegador, configurado em português do Brasil.
- Microfone ativado somente por ação do usuário; aviso informa que o navegador pode processar áudio em serviço externo.
- Texto confirmado é acrescentado ao resumo sem substituir o conteúdo anterior, inclusive alterações digitadas durante o ditado.
- Trechos provisórios aparecem separados até confirmação; ao encerrar, o último trecho disponível é preservado para revisão.
- Salvar resumo fica indisponível enquanto o ditado estiver ativo; nenhuma transcrição é salva automaticamente.
- Permissão negada, microfone indisponível, erro de rede e navegador sem suporte têm mensagens em português. Digitação e salvamento continuam disponíveis.
- Sair da página do livro ou da conta encerra o reconhecimento. Eventos de uma sessão encerrada não alteram outro livro.
- Testes simulam eventos de reconhecimento e falhas. O teste real de microfone exige ação do usuário; não será iniciada captura durante a chamada de voz.

## Incremento: publicação com Supabase

- Após a primeira entrega local, o usuário autorizou envio ao GitHub e publicação na Vercel com Supabase. O modo local permanece executável.
- PostgreSQL armazena contas e registros; Storage privado armazena novas fotos e capas. Login permanece Better Auth por cookie, sem autenticação de usuário por Bearer token.
- Consultas são parametrizadas em ambos os bancos, com proprietário derivado da sessão. Tipos de identificadores de capa e datas permanecem consistentes.
- Credenciais de banco e Storage existem somente no servidor, fora do repositório e dos arquivos servidos ao navegador.
- Migrações são aditivas e idempotentes, com conexão de sessão para o bloqueio de preparação. RLS e revogação das permissões públicas protegem tabelas da biblioteca e autenticação. Não há políticas públicas de fotos.
- Vercel sem configuração completa não pode cair em armazenamento local efêmero. A publicação só é considerada concluída após login, salvamento e leitura verificados no endereço público.
- Fotos novas são decodificadas e otimizadas para JPEG, com orientação aplicada, no máximo 2400 pixels e sem EXIF. Entrada até 8 MB; envio até 3 MB para caber nos limites da hospedagem. Arquivos antigos locais não são reescritos.
- Testes HTTP usam banco isolado e desativam explicitamente credenciais cloud herdadas. A estrutura PostgreSQL é testada com um motor local; isso não substitui o teste final na instância real.
