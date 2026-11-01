# Changelog

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
