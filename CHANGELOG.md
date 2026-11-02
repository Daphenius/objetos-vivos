# Changelog

## v3.0.1

Correções de uma revisão da 3.0.0.

### Correções
- **Desarmar não gasta mais o uso antes da hora.** Abrir o minijogo (ou a rolagem) de desarmar gastava o uso na hora; numa armadilha com 1 uso, acertar o minijogo não desarmava nada, e com mais usos a mesma tentativa podia cobrar duas vezes. Agora o uso é conferido antes e gasto uma vez só, quando desarma.
- **Salvar o editor não desfaz mais o que aconteceu no jogo.** Se o objeto mudasse com o editor aberto (alguém usou, gastou um uso, desarmou), salvar voltava tudo para como estava quando a janela abriu. Agora só o que você mudou na janela é gravado; o resto fica como o objeto está no momento. Botões como "Zerar usos" e "Armar de novo" continuam valendo.
- **Volta automática fora de hora.** Com "Esperar" nas ações, se o objeto mudasse de novo durante a espera, a execução antiga ainda agendava uma volta, e as ações do estado inicial podiam rodar duas vezes. Agora uma execução antiga não agenda nem faz volta.
- **Volume zero é zero.** Um som com volume 0 tocava a 80%. Só volume vazio ou inválido usa o padrão de 80% (também na prévia do editor).
- **Visão 3D**: o limite de 2048 px no maior lado agora vale para qualquer tamanho de tile (antes, tiles enormes passavam disso).
- Comentários no código com garantias absolutas foram reescritos (não substituir funções do Foundry evita o aviso do libWrapper, mas não garante sozinho que nenhum módulo vá conflitar).
- 8 testes novos, um para cada caso acima (25 no total).


## v3.0.0

Versão grande: as correções de segurança que tinham ficado de fora da 2.6.0 e da 2.7.0, o minijogo conferido pelo mestre, placas no meio do caminho, vídeo na visão 3D, tema claro e o módulo reorganizado por dentro.

### Segurança: o mestre confere tudo
- **Quem pediu é quem pediu.** O módulo usa o remetente real de cada pedido (informado pelo Foundry), não um nome escrito dentro do pedido. Ninguém consegue usar um objeto "no nome" de outro jogador.
- **A rolagem é lida no chat.** O jogador continua rolando na própria tela, mas não manda mais o número: o mestre lê o resultado na mensagem da rolagem e confere que foi aquele jogador que rolou (e que a mesma rolagem não é usada duas vezes).
- **O minijogo é conferido pelo mestre.** Quem monta o desafio (o giro de cada anel, os pontos e a ordem da runa) é o mestre, e ele guarda isso só com ele. O jogador joga na própria tela e manda o que fez; o mestre refaz as jogadas, confere o tempo e decide. O desafio vale uma vez, só para aquele jogador.
- **O token tem que ser do jogador.** Se o pedido vier com um token que não é dele (ou de outro mapa), o token é ignorado.
- **Efeitos na tela** (imagem, diário, câmera, aviso, som, escada) e pedidos de minijogo só são aceitos quando vêm do mestre.
- Das portas, os jogadores só conseguem avisar "tentei abrir trancada".

### Novidades
- **Movimento com vários pontos**: ao arrastar o token com a régua passando por vários pontos, a placa de pressão (ou o "chegar perto", ou o fio de parede) que fica **no meio do caminho** agora dispara. Antes só contavam o começo e o fim.
- **Visão 3D com vídeo**: tiles de vídeo (.webm/.mp4) com visão 3D continuam se mexendo (antes congelavam). Em tiles muito grandes, a imagem da visão 3D fica limitada a 2048 px, para não pesar na placa de vídeo.
- **Tema claro**: o editor, a biblioteca e o minijogo acompanham o tema claro do Foundry.

### Correções
- **Armadilha camuflada** não responde mais ao clique dos jogadores (antes, clicar no lugar abria a pergunta "Usar ou desarmar?" com o nome dela). Ela continua disparando ao pisar ou chegar perto. Um botão secreto camuflado continua clicável, e clicar longe dele não avisa mais "longe demais".
- **Regras antes do teste**: "quem pode usar", usos e confirmação são conferidos antes de pedir a rolagem ou o minijogo, e o jogador não rola à toa. Um uso só é gasto se o teste passar.
- **Ao usar depois de consertado**: momento novo em O que acontece (aparece no modo Consertar, quando o objeto continua funcionando depois de consertado). Antes, essas ações não tinham onde ser configuradas.
- **Volta automática** (voltar sozinho depois de X segundos) não roda mais as ações de "Sempre que for usado", e não dá erro se o objeto foi apagado nesse meio-tempo.
- **Jogador rola, mas pisou/chegou perto**: a rolagem abre na tela do jogador dono do token; se ele não estiver online, o mestre rola às cegas.
- **Meus objetos**: salvar (ou colocar) um objeto da biblioteca não leva mais junto o estado do jogo (trancado, revelado, desarmado, tentativas feitas).
- **Guardar no Foundry** (pacotes do Dungeondraft): se o Foundry não aceitar enviar o arquivo, aparece um aviso explicando o que fazer, em vez de um erro genérico.
- Nomes de token, jogador, objeto e mapa nas mensagens do chat agora são escritos como texto (um nome com `<` ou `>` não vira HTML).
- O brilho dos objetos não acumula mais um "pulso" a cada troca de mapa.
- Erros nas ações de "Ao falhar no teste", "Ao ser desarmada", "Ao ser destrancado" e "Ao alguém atravessar" agora avisam o mestre na tela, não só no console.
- Fechar o minijogo enquanto a imagem carrega não dá mais erro.
- Regras de estilo repetidas foram unificadas. A entrada da 2.5.0 dizia que havia "um teste para não voltar"; o correto é que a regra de estilo foi reforçada.


### Por dentro (não muda o uso)
- O código, que era um arquivo só de mais de 3.000 linhas, foi dividido em partes menores (núcleo, estados, gatilhos, testes, minijogos, socket, visual, editor, biblioteca, encaixe, pacotes do Dungeondraft, interface).
- Os estilos saíram do código para `styles/objetos-vivos.css`, com as cores em variáveis.
- O editor e a biblioteca passaram a usar modelos (templates Handlebars) em `templates/`, como os módulos do próprio Foundry.
- Removidos restos de compatibilidade com o Foundry 12 e com o D&D 5e antigo (o mínimo continua sendo o Foundry 14).
- Testes automáticos em `tests/` (rodam com `npm test`, sem Foundry): volta automática, regras de uso, biblioteca, pacotes do Dungeondraft com `%` no nome, socket, rolagem, minijogo e movimento com vários pontos.

## v2.7.0

### Novidades
- **Ação nova: Escada / nível.** Leva o token (ou todos os tokens de jogadores) para cima ou para baixo **no mesmo mapa**:
  - **Mapa com Níveis** (do Foundry v14): escolha o nível de destino; o token muda de nível e de elevação, e a tela do jogador passa a mostrar aquele andar.
  - **Andares desenhados lado a lado** no mesmo mapa: escolha só a **região de chegada**.
  - Tela escura com "Subindo..." ou "Descendo..." (ou sem tela), câmera centralizada no token na chegada.
  - Vários tokens chegam juntos, um por casa, em volta do ponto de chegada.
  - Quem sobe ou desce não dispara placas de pressão, "chegar perto" nem fios de parede pelo caminho (assim a escada de cima não manda o token de volta para baixo).

### Correções
- Em mapas com níveis, objetos de outro andar não são mais disparados por quem pisa ou chega perto deles, e o clique só pega objetos visíveis.

## v2.6.0

### Novidades
- **Ligação com a Gazua da Mesa.** Um objeto pode ter fechadura com chave, gazua, teste e minijogos:
  - Botão **Colocar / Configurar fechadura** no editor (O que acontece → Mais opções), com o estado da fechadura.
  - O jogador clica no objeto trancado e abre a janela da fechadura, mesmo que o objeto seja de pisar ou chegar perto.
  - **Trancado** e a fechadura ficam sempre iguais, venha a mudança do editor, de outro objeto, da API ou da própria Gazua.
  - Momento novo **Ao ser destrancado** e opção **Usar o objeto ao destrancar** (o baú abre sozinho quando a fechadura abre).
- API: `api.trancar` também tranca/destranca a fechadura; novo `api.estaTrancado(uuid)`.

### Observação
- Continua sem libWrapper e sem substituir funções do Foundry, então o aviso de conflito com a Gazua da Mesa e o Arm's Reach não volta.
- O erro "tagDocument is undefined" do Arm's Reach ao abrir a configuração de um tile é do próprio Arm's Reach (não deste módulo).

## v2.5.0

### Novidades
- **Passo novo no editor: Teste.** Qualquer objeto pode pedir um teste:
  - **Teste para usar**: toda vez, precisa passar (ex.: alavanca emperrada, Atletismo CD 15).
  - **Consertar**: o objeto começa *Quebrado* e, ao passar, vira *Consertado* (ex.: círculo mágico, Arcanismo). Depois de consertado, ele funciona normalmente ou fica parado, você escolhe.
  - **Desarmar (armadilha)**: a armadilha dispara do jeito normal; quem clica nela escolhe "Usar" ou "Tentar desarmar" (numa placa de pressão, o clique já é a tentativa). Passou: desarmada, para de disparar e aparece se estava camuflada. Falhou: pode disparar a armadilha. Botão "Armar de novo" no editor.
- **Como passar**: rolagem, minijogo, ou os dois.
  - **Rolagem**: perícias, ferramentas, atributos e salvaguardas do D&D 5e (ou fórmula livre), CD, mostrar ou não a CD, e quem rola: o jogador na própria tela (com a janela de vantagem) ou o mestre, às cegas.
  - **Minijogos**: **Girar os anéis** (a imagem do próprio objeto vem em anéis tortos; gire até encaixar) e **Redesenhar a runa** (a runa brilha e some; refaça o traço na ordem). A dificuldade acompanha a CD, com tempo limite. Quem clica joga na própria tela; se o objeto é acionado ao pisar ou chegar perto, o minijogo abre para o jogador dono do token. Botão "Testar o minijogo" no editor.
  - **Tentativas**: limite de tentativas, mensagem de falha e os momentos novos "Ao falhar no teste" e "Ao ser desarmada" em O que acontece.
- API para macros: `api.minijogo({ jogo, img, cd, tempo })`. Ganchos novos: `objetosVivos.teste`, `objetosVivos.falhou` e `objetosVivos.desarmado`.

### Correções
- O campo **Nome** do editor voltava a esticar e ocupar a coluna inteira quando sobrava espaço (a correção da v2.1.0 não pegava). Agora a regra de estilo foi reforçada para não voltar.

## v2.4.1
- **Camaleão perfeito**: o objeto camuflado agora fica invisível de verdade para os jogadores. Antes, o módulo redesenhava o chão por cima do objeto, e essa cópia saía um pouco mais borrada e com outra luz, deixando um quadrado aparente. Agora nada é desenhado no lugar: o mapa fica exatamente igual, e o objeto continua funcionando (pisar, clicar, chegar perto). O mestre continua vendo o objeto meio transparente.

## v2.4.0

### Novidades
- **Visão (3D)**: gire o objeto como uma carta no espaço, com perspectiva, para encaixar na vista do mapa. Inclinar para frente/trás, virar para os lados e espelhar, além do giro normal.
  - **Ao encaixar**: W/S inclina, A/D vira de lado, Q/E gira, F espelha e R volta à vista de cima (com Shift, de 5 em 5 graus). A prévia no mouse já mostra o resultado.
  - **No editor** (passo Aparência): atalhos Vista de cima, De frente, Pelo lado esquerdo e Pelo lado direito, barras de ajuste e Espelhar, com prévia ao vivo no mapa.
  - A imagem continua plana: dá para inclinar e virar, mas não aparece o outro lado do desenho. Camuflado (Camaleão), o objeto não aparece girado, para não entregar onde está.

### Correções
- Corrigido o erro "Algo deu errado ao mostrar a biblioteca" (`URIError: malformed URI sequence`) ao abrir pacotes do Dungeondraft com assets que têm `%` ou outros caracteres especiais no nome. Agora esses nomes aparecem normalmente, na biblioteca, na busca e na pasta de assets.

## v2.3.0

### Biblioteca nova
- **Janela maior** (e redimensionável), com uma **barra lateral**: Prontos, Meus objetos, sua pasta de assets e os pacotes do Dungeondraft.
- **Pacotes separados por categoria**: na barra lateral aparecem as categorias e subcategorias de cada pacote, com a quantidade de assets. Na área principal, os assets vêm agrupados por subcategoria, com "Ver todos".
- **Tamanho das miniaturas**: pequeno, médio ou grande (fica guardado).
- **Vários pacotes abertos ao mesmo tempo**.
- **Guardar no Foundry**: copia o pacote para o Foundry; nas próximas sessões ele aparece na lista e abre com um clique.

### Correções
- **Fechar a biblioteca não fecha mais o pacote** do Dungeondraft: ao reabrir, ele continua lá, do jeito que estava.
- Se algo der errado ao mostrar a biblioteca, ela mostra um aviso com o botão "Recomeçar" em vez de travar, e o botão Objetos Vivos sempre consegue abrir uma janela nova.

## v2.2.0

### Novidades
- **Pacotes do Dungeondraft**: a aba Assets abre arquivos `.dungeondraft_pack` direto, do computador ou da pasta de assets, sem extrair nada. Os objetos aparecem por categoria, com miniaturas e busca no pacote todo. Ao usar um asset, só aquela imagem é enviada para o Foundry, e ele entra no tamanho certo da grade (256 px do Dungeondraft = 1 casa).
- **Camaleão**: o objeto (uma placa de pressão, um botão) fica com a mesma textura do chão ou dos tiles atrás dele para os jogadores. O mestre vê o objeto meio transparente e pode usar "Ver como o jogador vê". Com "Aparece depois de usado", ele se revela quando alguém usa, e "Esconder de novo" volta a camuflar.

## v2.1.0

### Novidades
- **Encaixar na cena**: ao escolher um objeto na biblioteca, ele segue o mouse. A roda gira, Ctrl+roda muda o tamanho, Shift solta do quadriculado, o clique coloca e Esc ou o botão direito cancela.
- **Aba Assets** na biblioteca: escolha a pasta onde você guarda seus assets, navegue pelas subpastas, busque pelo nome e clique (ou arraste) para transformar qualquer asset em objeto vivo.
- **Tempo nas ações**: cada ação pode esperar alguns segundos antes de acontecer ("Esperar antes"). O resumo mostra "depois de X s".
- Com a ferramenta Objetos Vivos aberta, **clicar em um tile comum** já abre o editor para transformá-lo em objeto vivo.

### Correções
- **Fim do aviso do libWrapper de vez.** O Objetos Vivos não substitui mais nenhuma função do Foundry: cada porta ganha um ouvinte próprio para perceber a tentativa de abrir trancada. Assim ele não entra em conflito com a Gazua da Mesa, o Arm's Reach ou outros módulos, com ou sem o libWrapper, que deixou de ser recomendado.
- O campo **Nome** do editor esticava e ocupava a coluna inteira (aparecia em portas, paredes e tiles transformados).
- As imagens das aparências viraram miniaturas com o botão **Trocar imagem**, no lugar do caminho do arquivo.
- O editor avisa quando todas as aparências têm a mesma imagem (comum ao transformar um tile que já estava no mapa).
- "Usar uma imagem minha" também aceita vídeos (webm/mp4), como os assets animados.

## v2.0.2
- **Aviso do libWrapper resolvido de vez**: o Objetos Vivos não mexe mais em nenhuma função do Foundry, nem pelo libWrapper. Ele só "ouve" o clique no ícone da porta para a ação "ao tentar abrir trancada", então nunca mais entra no aviso de conflito com o Arm's Reach ou a Gazua da Mesa. O libWrapper deixou de ser recomendado.

## v2.0.1
- Corrigido o aviso do libWrapper ("Objetos Vivos e Gazua da Mesa, Arms Reach modificam a mesma funcionalidade"). O clique em portas voltou a ser registrado pelo libWrapper, agora como ouvinte: o Objetos Vivos só percebe a tentativa de abrir a porta trancada e não bloqueia nenhum outro módulo. Sem o libWrapper, funciona como antes.
- libWrapper entrou como módulo recomendado.

## v2.0.0

O módulo ficou mais simples de achar e de usar.

### Novidades
- **Botão próprio na barra da esquerda** (Objetos Vivos), que abre a **biblioteca**.
- **Biblioteca** com objetos prontos (alavanca, botão, baú, placa de pressão e runa), já com imagens para cada aparência. Clique para pôr no centro da tela ou arraste para o mapa: não precisa mais criar um tile antes.
- **Usar uma imagem minha**: qualquer imagem vira um objeto no mapa.
- **Meus objetos**: salve um objeto montado com "Salvar na biblioteca" e use de novo em qualquer mapa.
- **Profundidade (efeito 3D)**: sombra, altura e inclinação, com os atalhos Plano, Leve, Médio e Alto, e um leve movimento quando a câmera anda. As mudanças aparecem no mapa enquanto você edita.

### Mudanças
- **Editor em 3 passos**: Aparência, Como usar e O que acontece. As regras foram distribuídas entre eles, e as menos usadas ficam em "Mais opções".
- "Estados" agora se chamam **aparências**.
- **O mestre usa os objetos com um clique simples** na camada de tokens. O Alt+clique saiu. Para editar, use a ferramenta Objetos Vivos e clique no objeto.
- A escolha de modelo saiu do editor e foi para a biblioteca.

## v1.0.1
- Corrigido o aviso do libWrapper ("Objetos Vivos e Arms Reach modificam a mesma funcionalidade"). Com o libWrapper ativo, o clique em portas passa a ser registrado por ele, e os dois módulos convivem. Sem o libWrapper, funciona como antes.
- libWrapper entrou como módulo recomendado.

## v1.0.0

Primeira versão. Os gatilhos que existiam no Navegador de Mundos viraram este módulo separado, com uma interface nova.

### Novidades
- **Objetos vivos em tiles/assets**: estados com nome e imagem própria, animação ao mudar (girar, deslizar, virar, pulsar, piscar) e som ao mudar.
- **Modelos prontos**: alavanca, botão, baú, placa de pressão, runa/cristal e personalizado.
- **Como o jogador usa**: clicar no objeto (com distância), pisar em cima, chegar perto ou só o mestre aciona. Mãozinha ao passar o mouse e brilho quando alguém está perto.
- **Ações por estado** e "sempre que mudar": efeito sonoro, portas, mostrar/esconder, outro objeto, chat, imagem, diário, câmera, escuridão, música, levar a outro mapa (com o Navegador de Mundos) e esperar.
- **Regras**: quem pode usar, limite de usos, voltar sozinho ao estado inicial, confirmação do mestre e trancado.
- **Portas e paredes**: ações ao abrir, fechar, trancar, destrancar, tentar abrir trancada e ao alguém atravessar.
- Seção "Objeto Vivo" na configuração de tiles e paredes, e botões no HUD do tile.
- Textos em português e inglês.
