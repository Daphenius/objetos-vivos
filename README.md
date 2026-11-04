# Objetos Vivos (Em testes)

## Sobre como este módulo foi feito

Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma issue. Todo retorno é bem-vindo.

> [!WARNING]
> **Módulo em testes.** Ainda não está completo e pode ter muitos erros e vícios de IA. Use com cuidado, faça backup do mundo antes de instalar e, se algo der errado, abra uma issue.

---

Coloque no mapa do **Foundry VTT** objetos que os jogadores podem usar: alavancas que descem, botões que voltam sozinhos, baús que abrem, placas de pressão, runas que acendem, ou **qualquer imagem sua**. Cada objeto ganha **profundidade** (sombra, altura e inclinação, como se saltasse do mapa), **aparências** que trocam quando ele é usado e uma lista do **que acontece** em cada momento. Portas e paredes do Foundry também podem ter ações.

> **Testado no Foundry VTT v14 com o sistema D&D 5e**, nas minhas próprias sessões.
> Textos em português (Brasil) e inglês.

## Instalação

No Foundry, vá em **Configuração → Módulos → Instalar Módulo** e cole este link no campo *URL do Manifesto*:

```
https://github.com/Daphenius/objetos-vivos/releases/latest/download/module.json
```

Depois, ative o módulo no mundo em **Gerenciar Módulos**.

## Como colocar um objeto no mapa

1. Na barra de ferramentas da esquerda, clique no botão **Objetos Vivos** (ícone de cubo). A **biblioteca** abre.
2. Escolha um objeto:
   - **Prontos**: alavanca, botão, baú, placa de pressão e runa, já com as imagens de cada aparência;
   - **Usar uma imagem minha**: escolha qualquer imagem do seu Foundry e ela vira um objeto com profundidade;
   - **Assets**: escolha a pasta onde você guarda seus assets (itens, móveis, objetos de cena, inclusive os baixados do Forgotten Adventures). Navegue pelas subpastas e busque pelo nome;
   - **Pacotes do Dungeondraft**: na aba Assets, abra um `.dungeondraft_pack` do seu computador (ou um que esteja na pasta de assets) e use os objetos dele sem extrair nada. Eles aparecem por categoria, com busca no pacote todo, e entram no tamanho certo da grade (256 px do Dungeondraft = 1 casa). Só a imagem que você usa é enviada para o Foundry, numa pasta `objetos-vivos/dungeondraft/<pacote>`;
   - **Meus objetos**: os que você montou e salvou para usar em qualquer mapa.
   A biblioteca tem uma barra lateral com essas seções. Nos pacotes do Dungeondraft aparecem as categorias e subcategorias, com a quantidade de assets, e você escolhe o tamanho das miniaturas. Os pacotes continuam abertos mesmo se você fechar a janela, e **Guardar no Foundry** faz o pacote aparecer sozinho nas próximas sessões.
3. **Clique** no objeto para **encaixá-lo na cena**: ele segue o mouse e você ajusta antes de colocar. Também dá para **arrastar** direto para o mapa.

| Ao encaixar | O que faz |
|---|---|
| Clique | Coloca o objeto ali |
| Roda do mouse | Gira de 15 em 15 graus (com Shift, de 1 em 1) |
| Ctrl + roda | Aumenta ou diminui o tamanho |
| Segurar Shift | Solta do quadriculado, para colocar em qualquer lugar |
| Botão direito ou Esc | Cancela |
| W / S | Inclina para frente ou para trás (visão 3D) |
| A / D | Vira para os lados (visão 3D) |
| Q / E | Gira, como a roda |
| F | Espelha |
| R | Volta à vista de cima |

O editor abre sozinho. Ele tem três passos:

| Passo | O que você escolhe |
|---|---|
| **Aparência** | Profundidade (Plano, Leve, Médio, Alto, ou ajuste sombra, altura e inclinação), se o objeto mexe de leve quando a câmera anda, o movimento ao trocar de aparência e o som |
| **Como usar** | Clicando, pisando em cima, chegando perto ou só o mestre; a distância; quem pode usar; se volta sozinho; a mãozinha e o brilho |
| **O que acontece** | As ações para cada aparência ("Quando ficar: Ligada") e para "Sempre que for usado". Cada ação pode **esperar alguns segundos antes** de acontecer. Em **Mais opções**: limite de usos, confirmação do mestre e trancado |

À esquerda do editor ficam as **aparências** (por exemplo Desligada e Ligada), cada uma com nome e imagem. O botão **Testar** mostra a troca. Tudo o que você muda na profundidade aparece no mapa na hora.

O botão **Salvar na biblioteca** guarda o objeto em **Meus objetos**. Portas e objetos escolhidos nas ações ficam de fora, porque pertencem ao mapa onde foram escolhidos.

## Mapa interativo

Transforme um mapa-múndi (ou de região) num menu de viagem: cada cidade vira um botão que leva os jogadores ao mapa dela.

1. No mapa-múndi, abra a biblioteca e coloque o modelo **Cidade / destino** em cima de cada cidade (ou transforme um tile seu). Dica: ligue o **Camaleão** para o botão ficar invisível em cima do desenho do próprio mapa.
2. No editor, aba **Ações**, abra a ação **Ir para o mapa** e escolha o mapa da cidade e **quem vai**: só quem clicou, todos os jogadores deste mapa ou todos os conectados.
3. Na aba **Como usar**, seção **Mapa interativo**:
   - **Mostrar cadeado quando trancado**: um cadeado aparece em cima da cidade enquanto ela estiver trancada. Clicar numa cidade trancada só avisa o jogador.
   - **Abrir a névoa em volta**: o mapa fica coberto por uma névoa e ela só abre em volta das cidades liberadas (não trancadas e à vista), com o tamanho que você escolher.
4. Deixe só a cidade inicial liberada e tranque as outras. Para liberar uma cidade durante o jogo: botão de **cadeado no HUD** do tile (clique direito) ou a ação **Outro objeto → Destrancar** em outro objeto (por exemplo, chegar à cidade A destrava a estrada para a cidade B).
5. No mapa da cidade aparece, para todos, o botão **Voltar para (mapa)**. Se o grupo foi junto, volta junto; se foi só um jogador, volta só ele. O mestre, ao clicar, volta sozinho.

A névoa do mapa interativo é desenhada uma vez numa imagem e só é refeita quando uma cidade muda: não pesa durante o jogo. Ela não depende de token nem da visão do Foundry. O mestre vê a névoa clara, para conseguir trabalhar no mapa.

**Configurar a névoa**: em **Configurar Definições → Objetos Vivos → Abrir configurações** (ou `api.configurar()`), com estilos prontos (Noite, Pergaminho, Arcano, Bruma), cor da névoa, quanto ela esconde para os jogadores e para o mestre, suavidade da borda e um brilho mágico em volta dos lugares liberados. Mexeu, vê no mapa na hora; só grava ao clicar em Salvar.

## Desempenho

- As partes pesadas (editor, biblioteca, minijogos, pacotes do Dungeondraft) só são carregadas quando alguém usa. Os jogadores quase nunca baixam nada disso.
- Na mesma janela de configurações (ou em **Objetos Vivos: qualidade dos efeitos**), cada pessoa escolhe para o próprio computador: **Completa**, **Leve** (sem sombra e sem parallax) ou **Mínima** (só a imagem dos objetos). Não muda nada para os outros jogadores.

## Teste, Consertar e Desarmar

O passo **Teste** do editor faz o objeto pedir um teste:

| Modo | Como funciona |
|---|---|
| **Teste para usar** | Toda vez que alguém usa, precisa passar (ex.: alavanca emperrada) |
| **Consertar** | Começa *Quebrado*; quem passar no teste conserta, e ele vira *Consertado* (ex.: círculo mágico quebrado). Depois funciona normalmente ou fica parado |
| **Desarmar (armadilha)** | Dispara do jeito normal; clicar nela oferece "Usar" ou "Tentar desarmar". Desarmada, para de disparar. Falhar pode dispará-la |

**Como passar**: **rolagem** (perícia, ferramenta, atributo ou salvaguarda do D&D 5e, ou fórmula livre, com CD; o jogador rola na própria tela ou o mestre rola às cegas), **minijogo** ou **os dois**.

**Minijogos** (a dificuldade acompanha a CD, com tempo limite):
- **Girar os anéis**: a imagem do próprio objeto vem cortada em anéis tortos; clique para girar até o desenho ficar inteiro.
- **Redesenhar a runa**: a runa é traçada entre pontos e some; refaça o traço na mesma ordem (3 erros é falha).

Quem clica joga na própria tela. Se o objeto é acionado ao pisar ou chegar perto, a rolagem e o minijogo abrem na tela do jogador dono do token (se ele não estiver online, o mestre rola às cegas). Use **Testar o minijogo** no editor para experimentar. Na falha, além da mensagem, rodam as ações de **Ao falhar no teste**; ao desarmar, as de **Ao ser desarmada**.

**Quem confere o resultado é o mestre.** O jogador não manda "passei":
- **Rolagem**: o Foundry do mestre lê o resultado direto na mensagem da rolagem no chat (e confere que foi aquele jogador que rolou, uma vez só).
- **Minijogo**: quem monta o desafio (o giro dos anéis, os pontos e a ordem da runa) é o mestre, que guarda isso só com ele. O jogador joga e manda as jogadas; o mestre refaz tudo, confere o tempo e decide.
- O mestre também confere que o token é mesmo do jogador e que ele pode usar o objeto. As regras (quem pode usar, usos, confirmação) são conferidas **antes** do teste, e um uso só é gasto se o teste passar.
- Por isso o mestre precisa estar conectado para os jogadores usarem objetos com teste.

## Visão (3D)

No passo **Aparência**, a seção **Visão (3D)** gira o objeto como uma carta no espaço, com perspectiva, para encaixar na vista do mapa: **Vista de cima**, **De frente**, **Pelo lado esquerdo**, **Pelo lado direito**, barras para inclinar e virar, e **Espelhar**. O mapa mostra a mudança na hora. A imagem continua plana: dá para inclinar e virar, mas não aparece o outro lado do desenho. Funciona também com tiles de vídeo (o vídeo continua rodando).

## Camaleão

No passo **Aparência**, ligue **Camuflar no mapa**: para os jogadores, o objeto fica invisível. O mapa fica exatamente igual, sem nenhuma diferença, mas o objeto continua funcionando (pisar, clicar, chegar perto). É ideal para placas de pressão, botões e alavancas secretas.

- Você, mestre, continua vendo o objeto meio transparente. O botão **Ver como o jogador vê** mostra a camuflagem na sua tela.
- **Aparece depois de usado**: quando alguém usa (ou pisa), o objeto se revela para todos. **Esconder de novo** volta a camuflar.
- Enquanto está camuflado, a profundidade, a mãozinha e o brilho ficam desligados para não entregar onde ele está.

## Como usar no jogo

- **Jogadores**: clicam no objeto (a mãozinha aparece, e ele brilha quando o token está perto o bastante), pisam em cima ou chegam perto, conforme você configurou.
- **Mestre**: na camada de **tokens**, um clique simples usa o objeto, como os jogadores. Para **editar**, abra a ferramenta Objetos Vivos e clique no objeto.
- **Um tile que já está no mapa** também vira objeto: com a ferramenta Objetos Vivos aberta, clique nele. Serve para assets colocados por outros meios, como o FA Nexus. A configuração do tile e o HUD (clique direito) também têm **Transformar em objeto vivo**.

## Portas e paredes

Na configuração de uma parede aparece a mesma seção. A porta continua abrindo e fechando do jeito normal do Foundry; o Objetos Vivos só acrescenta o que acontece em cada momento:
- ao abrir, fechar, trancar ou destrancar;
- ao tentar abrir trancada (quando um jogador clica numa porta trancada);
- ao alguém atravessar (vale para qualquer parede: uma parede que não bloqueia movimento vira um fio de armadilha invisível).

## Fechadura (Gazua da Mesa)

Com o módulo [Gazua da Mesa](https://github.com/Daphenius/gazua-mesa) ativo, qualquer objeto pode ter uma fechadura de verdade, com chave, gazua, teste de Ferramentas de Ladrão e minijogos.

- No editor, em **O que acontece → Mais opções**, clique em **Colocar fechadura** (ou **Configurar fechadura**). A janela é a da própria Gazua.
- **Jogadores**: clicam no objeto trancado com o token por perto e abre a janela da fechadura (usar a chave, a gazua, o teste ou o minijogo).
- O interruptor **Trancado** do objeto e a fechadura andam juntos: trancar ou destrancar por um, pelo outro, por outro objeto ("Outro objeto → trancar/destrancar") ou pela API faz o mesmo nos dois.
- Momento novo **Ao ser destrancado**: as ações dele rodam quando a fechadura abre (ex.: tocar um som de baú rangendo, mandar uma narração).
- **Usar o objeto ao destrancar**: ligado, o objeto já troca de aparência e roda as ações assim que a fechadura abre (o baú abre sozinho).

## Ações

| Ação | O que faz |
|---|---|
| Efeito sonoro | Som curto (porta, botão, alavanca) para quem usou, para o mapa ou para todos |
| Portas | Abrir, fechar, trancar, destrancar ou alternar portas do mapa |
| Mostrar / esconder | Tiles, tokens, luzes, sons, notas e desenhos |
| Outro objeto | Muda o estado de outro objeto, ou tranca/destranca (ex.: a alavanca destranca o baú) |
| Mensagem no chat | Narração, sussurro ou só para o mestre. Aceita `{token}`, `{jogador}`, `{objeto}` e `{mapa}` |
| Mostrar imagem | Abre uma imagem na tela de quem precisa ver |
| Abrir diário | Diário ou página na tela de quem precisa ver |
| Mover a câmera | Leva a câmera até o objeto ou até uma região |
| Escuridão | Muda a escuridão do mapa, com animação |
| Música | Toca ou para uma playlist nativa |
| Levar a outro mapa | Leva o token (e o jogador dono dele) para outro mapa. Precisa do módulo [Navegador de Mundos (navegador-mapas)](https://github.com/Daphenius/navegador-mapas) ativo |
| Ir para o mapa | Mapa interativo: troca a cena que quem clicou (ou o grupo) está vendo e deixa lá o botão "Voltar ao mapa". Não precisa de token nem de outro módulo |
| Escada / nível | Sobe ou desce o token no mesmo mapa: para outro nível do mapa (Níveis do Foundry v14) e/ou para uma região de chegada, com tela escura "Subindo..." / "Descendo..." |
| Esperar | Pausa entre uma ação e outra |

As ações são executadas pelo mestre conectado. Sem mestre online, os objetos não respondem.

## Dicas

- O botão de setas no HUD do tile troca a aparência na hora, sem conferir distância nem regras (bom para testar). O botão de cadeado, ao lado, tranca ou destranca o objeto na hora.
- Uma **armadilha camuflada** (Camaleão, ainda não revelada) não responde ao clique dos jogadores, para não entregar onde está; ela continua disparando ao pisar ou chegar perto. Um botão secreto camuflado de clicar continua clicável (sem mãozinha nem brilho).
- **Guardar no Foundry** (pacotes do Dungeondraft): o Foundry só aceita enviar alguns tipos de arquivo. Se ele não aceitar o `.dungeondraft_pack`, o módulo avisa; nesse caso, copie o pacote para a sua pasta de assets e ele aparece na barra lateral.
- Um tile **escondido** não pode ser usado pelos jogadores. Esconda e mostre objetos com a ação "Mostrar / esconder" para revelar alavancas secretas.
- **Caminho com vários pontos**: arrastando o token com a régua, tudo o que fica no meio do caminho conta (placas de pressão, "chegar perto" e fios de parede).
- **Tema claro**: as janelas do módulo seguem o tema claro ou escuro do Foundry.
- **Editor aberto durante o jogo**: ao salvar, só o que você mudou na janela é gravado. O que aconteceu no jogo enquanto ela estava aberta (estado, usos gastos, tentativas, desarmada) é mantido.
- Para um objeto "invisível" que reage quando alguém pisa, use um tile com imagem transparente e "Pisar em cima".

## API para macros

```js
const api = game.modules.get("objetos-vivos").api;
api.biblioteca();                 // abre a biblioteca
api.criar({ preset: "bau", x, y }); // coloca um objeto pronto (ou { img: "caminho" }) no mapa
api.editar(uuid);                 // abre o editor do objeto (tile ou parede)
api.usar(uuid, tokenUuid);        // usa o objeto, como se o jogador tivesse clicado
api.mudarEstado(uuid, indice);    // vai direto para uma aparência (0 = a primeira)
api.trancar(uuid, true | false);  // tranca ou destranca (a fechadura da Gazua junto)
await api.estaTrancado(uuid);     // true se o objeto ou a fechadura dele está trancado
api.minijogo({ jogo: "aneis" | "runa", img, cd, tempo }); // abre um minijogo; devolve true, false ou null
api.voltarAoMapa();               // o mesmo que clicar em "Voltar ao mapa"
api.configurar();                 // abre a janela de névoa e efeitos
```

Ganchos (`Hooks`) para outros módulos: `objetosVivos.usado` (objeto usado), `objetosVivos.trancado` (alguém tentou usar um objeto trancado), `objetosVivos.teste` (resultado de um teste), `objetosVivos.falhou` (falhou no teste) e `objetosVivos.desarmado` (armadilha desarmada).

## English

**Living Objects** *(in testing — not complete yet and may contain many bugs and AI quirks)* places interactive objects on Foundry VTT maps (levers, buttons, chests, pressure plates, runes or your own images) from a library opened by its own button on the left bar. Objects get depth (shadow, height and tilt), looks that change when used, and a list of actions for each moment. Doors and walls can also run actions when they open, close, lock, unlock, are tried while locked, or are walked through. **Interactive map**: city buttons that take players to the city scene, a "Back to map" button there, a padlock on locked cities and a fog that only clears around released cities. A per-computer **effects quality** setting (Full, Light, Minimal) helps on weaker machines. The interface is translated into English. Tested on Foundry VTT v14 with the D&D 5e system.

## Licença

[MIT](LICENSE) © Daphenius
