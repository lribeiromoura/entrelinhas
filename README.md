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

1. Crie uma conta e busque um título, autor ou ISBN. Adicione um resultado ou use “Prefiro cadastrar manualmente”.
2. As capas disponíveis vêm junto com os novos livros da busca. Para livros existentes, abra “Capa do livro” e clique em “Buscar capa na Open Library” ou envie sua própria imagem (JPEG/PNG/WebP até 8 MB). A capa é exibida inteira na estante. A imagem encontrada pode ser de outra edição. Capas enviadas permanecem privadas; as da Open Library são carregadas do serviço público e exigem conexão.
3. Abra o livro e salve um resumo. Você também pode colar uma transcrição obtida fora do aplicativo.
4. Envie fotos pela galeria ou câmera. São aceitos JPEG, PNG e WebP até 8 MB cada. A câmera depende do dispositivo e navegador; no computador pode aparecer um seletor de arquivos.
5. Crie ideias com título e descrição em um ou vários livros. Abra “Mapa de ideias”, selecione duas ideias e conecte. O desenho permite rolagem horizontal em telas pequenas; há também a lista textual das conexões.
6. Crie perguntas e respostas na página do livro. A primeira revisão vence em um dia. Para demonstrar imediatamente, em “Revisões”, marque “Incluir perguntas futuras para praticar”. Essa prática também reagenda a pergunta.
7. Digite uma tentativa antes de revelar a resposta e faça sua autoavaliação. Boa recordação avança de 1 para 3, 7, 14 e 30 dias; dificuldade mantém o intervalo; não lembrar retorna a um dia. Atrasadas permanecem disponíveis.
8. Use a opção de instalar/adicionar à tela inicial do navegador, se oferecida. Manifesto, ícones PNG e service worker estão incluídos. O uso continua conectado; ao perder a conexão, há aviso e página de recuperação. Não há cache de dados privados.

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

- Não há exclusão nem edição de livros, ideias, conexões ou perguntas; apenas o resumo é editável.
- O mapa usa posicionamento automático simples; não permite arrastar nós ou zoom.
- Sem recuperação de senha, confirmação de e-mail ou provedor social. Guarde sua senha.
- Não há OCR, geração por IA, colaboração, push nem edição offline completa.
- Texto não salvo fica apenas na tela atual. Em uma falha de salvamento, os campos permanecem preenchidos; fechar ou recarregar a página pode perder o rascunho.
- Fotos não são comprimidas e seus metadados EXIF não são removidos. Envie apenas o necessário; o limite é de 8 MB por foto.
- Instalação da PWA e acesso à câmera variam entre dispositivos. Não foi testado em um telefone físico. Uma instalação local no computador não sincroniza automaticamente com um telefone.
- A configuração padrão atende uma instância local. Acesso remoto, HTTPS, backup automatizado e operação em produção exigem configuração adicional; não há deploy incluído.

## Referências

- Better Auth: https://better-auth.com/docs/installation
- Open Library: https://openlibrary.org/dev/docs/api/search

## Ditado do resumo

Na página de um livro, clique em **Ditar resumo** e autorize o microfone no navegador. Fale em português do Brasil: trechos confirmados são acrescentados ao texto existente, e o trecho ainda em reconhecimento aparece separado. Clique em **Parar ditado**, confira e corrija o texto e depois clique em **Salvar resumo**. O último trecho provisório disponível é mantido para sua revisão ao encerrar.

O aplicativo não grava nem armazena um arquivo de áudio. O serviço de reconhecimento do navegador pode receber o áudio para transcrição. Não há chave de API nem cobrança de transcrição pelo aplicativo; disponibilidade, processamento e conexão dependem do navegador. Esta versão não garante reconhecimento local nem offline. Se o navegador não oferecer suporte, digitação continua disponível e uma explicação aparece na tela.

O ditado para ao sair da página do livro. Nenhum texto é salvo automaticamente; recarregar ou sair antes de salvar pode perder o rascunho. O botão de salvar fica bloqueado durante o ditado para evitar salvar uma transcrição incompleta. Falhas do microfone ou da rede não apagam o texto já recebido.

Verificação: eventos de fala, trechos provisórios/finais, duplicatas, preservação do texto, interrupção, permissão negada, falha de rede e encerramento ao trocar de livro são testados com um reconhecimento simulado. O microfone real não é acionado por esses testes.
