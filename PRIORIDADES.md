# Prioridades após a revisão da primeira versão

## 1. Proteção do trabalho — implementado
Rascunho de resumo por usuário e livro, guardado somente na sessão da aba. Recuperação após recarregar e ao voltar ao livro, aviso antes de fechar com alterações e limpeza após salvamento confirmado ou saída da conta. Esta proteção não equivale a sincronização nem edição offline completa; fechar a aba encerra o armazenamento de sessão.

## 2. Correção e organização — implementado
Editar título/autor dos livros, título/descrição das ideias e pergunta/resposta de revisão. Remover livros, ideias, perguntas, fotos e conexões com lixeira e restauração. A remoção do livro deve ocultar seu conteúdo associado e suas imagens; restaurar o livro deve recuperar seu conteúdo sem afetar a agenda. Não haverá descarte definitivo nesta etapa. Uma conexão pode ser alterada removendo a antiga e criando outra.

## 3. Proteção da biblioteca
Exportação e restauração de backup; recuperação de acesso compatível com a instalação local. Definir uma opção verificável sem presumir contratação de e-mail ou hospedagem.

## 4. Celular e fotos
Compressão e remoção de metadados das imagens, seleção de várias fotos, testes em aparelhos reais de câmera, ditado e instalação da PWA. Microfone e câmera reais dependem da autorização e participação do usuário no dispositivo.

## 5. Mapa e revisões
Zoom, navegação e posição dos nós; histórico das avaliações e visualização das próximas revisões. Manter a regra atual de intervalos.

## 6. OCR de manuscritos
Avaliar transcrição com amostras reais em português. Comparar soluções locais antes de optar por serviço externo; a transcrição deve ser revisável e separada de uma eventual síntese por IA.

## Fora desta etapa
Edição offline completa com sincronização, colaboração, notificações push e geração por IA. Publicação/hospedagem foi autorizada posteriormente; falta validar a nova versão em produção. Não criar novas dependências de serviços pagos implicitamente.

## Verificação desta etapa
26 testes unitários, compilação e testes HTTP com banco temporário isolado passaram. Testados edição e remoção/restauração de todos os tipos, isolamento entre contas, imagens ocultas inacessíveis e preservação da agenda. No navegador, confirmado rascunho recuperado ao sair e voltar ao livro. A atualização de produção depende do deploy e da migração aditiva; não foi validada remotamente nesta etapa.
