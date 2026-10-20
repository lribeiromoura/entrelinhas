# Implementações por etapa

Executar uma etapa por vez. Ao concluir, apresentar resultados e pedir autorização para a seguinte. Não fazer commits individuais; consolidar no final, conforme solicitado.

## 1. Validação online — concluída

Endereço: https://entrelinhas-five-iota.vercel.app

- Cadastro e login no domínio oficial passaram, sem INVALID_ORIGIN. Nenhuma proteção de origem foi desativada e nenhuma credencial de produção foi alterada.
- Verificação HTTP real em produção com duas contas fictícias independentes: livros, resumo, ideias, conexões, perguntas, revisão, upload de foto e capa, edição, lixeira e restauração.
- Fotos ocultas e fotos de outra conta retornaram 404; acesso sem sessão retornou 401. Escritas de outra conta e requisições com origem diferente foram recusadas.
- Restauração manteve a agenda e não restaurou automaticamente itens removidos separadamente; conexão não pôde ser restaurada enquanto dependências estavam na lixeira.
- Interface publicada: login, rascunho recuperado ao sair e voltar ao livro, salvamento confirmado, sessão e resumo mantidos após recarregar, foto privada carregada.
- Usados somente dados fictícios em contas de verificação; a biblioteca do usuário não foi modificada. As contas e seus registros de teste permanecem isolados na produção.
- Script reutilizável: `node scripts/integration.mjs --production`. Esse modo é explícito e restrito ao endereço oficial. Cria duas novas contas de teste por execução; o comando padrão continua usando banco temporário local.
- Evidência visual: outputs/verificacao-online.png. Resultado sem credenciais: work/production-verification-result.json.
- Câmera, microfone e instalação em aparelho real são tratados na etapa 5.

## 2. Backup e restauração com fotos — implementada e validada localmente

- Aba Backup com download de arquivo JSON, prévia e restauração aditiva.
- Inclui fotos, capas enviadas, capas externas por referência, itens da lixeira, relações e agenda. Não inclui credenciais nem rascunhos.
- Reenvio do mesmo arquivo retoma a operação e não duplica os registros. Conclusão atômica; dados existentes são preservados.
- Valida integridade, conteúdo real de imagens, vínculos, limites e isolamento entre contas. Tabelas temporárias privadas e limpas após expiração ao iniciar outra restauração da conta.
- 31 testes unitários passaram, incluindo roundtrip em SQLite e PostgreSQL/PGlite, rollback de falha simulada, retomada, duplicidade, limites, corrupção e isolamento. Compilação e testes HTTP também passaram.
- Interface testada com conta fictícia e banco temporário: download incluiu imagem, arquivo foi conferido, restauração preservou o livro anterior e 3 itens na lixeira, repetir não duplicou. Evidência: outputs/backup-restauracao.png.
- Ainda não publicado; sem commit/deploy, conforme solicitado. Nova verificação de produção será necessária após a publicação consolidada.

## 6. Mapa interativo — implementado e validado localmente

- Zoom, enquadramento, deslocamento, busca de ideias, destaque de conexões e abertura do livro de origem.
- Ideias podem ser arrastadas ou movidas por teclado; posições ficam salvas por conta no SQLite/PostgreSQL e no backup restaurável.
- Escrita de layout é atômica e rejeita ideias ocultas ou de outra conta. Teclas e controles foram conferidos na prévia local; teste físico em celular ainda é a etapa 5.
- Evidência visual: outputs/mapa-interativo.png.

## Exportação seletiva em PDF — implementada e validada localmente

- Aba Exportar PDF: escolher livros, tudo ou somente resumos, e marcar resumos, ideias, fotos, capas enviadas, perguntas/respostas e conexões. Cada página de livro também oferece exportação direta daquele livro, com as mesmas opções de seção.
- PDF A4 gerado no navegador, com fotos privadas buscadas individualmente, sem itens da lixeira nem rascunhos. Capas externas da Open Library não são incorporadas.
- Arquivo de exemplo com foto e capa: outputs/entrelinhas-exemplo.pdf. As duas páginas foram renderizadas e verificadas visualmente.
- Testes e build locais passaram. Ainda não publicado; sem commit/deploy, conforme solicitado.

## Etapas restantes — aguardam autorização individual
3. Recuperação de senha por e-mail (o usuário dispensou a integração com serviço de envio por ora).
4. Seleção e envio de várias fotos.
5. Validação em celulares reais.
7. Histórico e próximas revisões — retirado do escopo com a remoção de Revisões.

## Ajustes de UX solicitados — implementados localmente
- Estante compacta com Adicionar Livro em modal, cabeçalho centralizado com logotipo e nome minúsculo, menu à esquerda e aviso Salvo flutuante.
- Segurar um livro abre Apagar livro; também há botão ··· e acesso por menu de contexto.
- Lixeira permite exclusão definitiva com confirmação, cascata e retenção de 30 dias. Cron diário preparado; falta cadastrar CRON_SECRET na publicação consolidada para ativar o agendamento. Limpeza no acesso funciona independentemente do cron.
- 38 testes unitários passaram, incluindo PostgreSQL/SQLite, cascata, proprietário, prazo e falha/retomada de remoção de imagens. Testes HTTP validaram exclusão, recusa de restauração posterior e cron protegido.

## Caderno simplificado e versionamento — implementados localmente
- Decisão posterior do usuário: retirar ideias, mapa, perguntas e revisões da interface. Não apagar dados antigos; mantê-los compatíveis com backups.
- Menu Opções do livro reúne exportação PDF, edição em modal, capa em modal e lixeira. Fotos usam um único seletor sem formulário separado de câmera.
- Histórico de resumo mantém versões salvas, permite consulta e recuperação como atual; recuperação preserva todas as versões e atualiza o editor. Backup/restauração inclui o histórico; arquivos antigos continuam aceitos.
- 40 testes unitários passaram em SQLite/PostgreSQL, com legados, idempotência, recuperação, isolamento, paginação e rollback. Compilação e testes HTTP passaram. Navegador confirmou duas versões, recuperação da primeira, persistência após recarregar e manutenção da segunda.
- Provas: outputs/livro-simplificado.png e outputs/historico-resumo.png. Prévia isolada em localhost:3107. Sem commit/deploy.
