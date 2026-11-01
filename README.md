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
   - **Meus objetos**: os que você montou e salvou para usar em qualquer mapa.
3. **Clique** no objeto para **encaixá-lo na cena**: ele segue o mouse e você ajusta antes de colocar. Também dá para **arrastar** direto para o mapa.

| Ao encaixar | O que faz |
|---|---|
| Clique | Coloca o objeto ali |
| Roda do mouse | Gira de 15 em 15 graus (com Shift, de 1 em 1) |
| Ctrl + roda | Aumenta ou diminui o tamanho |
| Segurar Shift | Solta do quadriculado, para colocar em qualquer lugar |
| Botão direito ou Esc | Cancela |

O editor abre sozinho. Ele tem três passos:

| Passo | O que você escolhe |
|---|---|
| **Aparência** | Profundidade (Plano, Leve, Médio, Alto, ou ajuste sombra, altura e inclinação), se o objeto mexe de leve quando a câmera anda, o movimento ao trocar de aparência e o som |
| **Como usar** | Clicando, pisando em cima, chegando perto ou só o mestre; a distância; quem pode usar; se volta sozinho; a mãozinha e o brilho |
| **O que acontece** | As ações para cada aparência ("Quando ficar: Ligada") e para "Sempre que for usado". Cada ação pode **esperar alguns segundos antes** de acontecer. Em **Mais opções**: limite de usos, confirmação do mestre e trancado |

À esquerda do editor ficam as **aparências** (por exemplo Desligada e Ligada), cada uma com nome e imagem. O botão **Testar** mostra a troca. Tudo o que você muda na profundidade aparece no mapa na hora.

O botão **Salvar na biblioteca** guarda o objeto em **Meus objetos**. Portas e objetos escolhidos nas ações ficam de fora, porque pertencem ao mapa onde foram escolhidos.

## Como usar no jogo

- **Jogadores**: clicam no objeto (a mãozinha aparece, e ele brilha quando o token está perto o bastante), pisam em cima ou chegam perto, conforme você configurou.
- **Mestre**: na camada de **tokens**, um clique simples usa o objeto, como os jogadores. Para **editar**, abra a ferramenta Objetos Vivos e clique no objeto.
- **Um tile que já está no mapa** também vira objeto: com a ferramenta Objetos Vivos aberta, clique nele. Serve para assets colocados por outros meios, como o FA Nexus. A configuração do tile e o HUD (clique direito) também têm **Transformar em objeto vivo**.

## Portas e paredes

Na configuração de uma parede aparece a mesma seção. A porta continua abrindo e fechando do jeito normal do Foundry; o Objetos Vivos só acrescenta o que acontece em cada momento:
- ao abrir, fechar, trancar ou destrancar;
- ao tentar abrir trancada (quando um jogador clica numa porta trancada);
- ao alguém atravessar (vale para qualquer parede: uma parede que não bloqueia movimento vira um fio de armadilha invisível).

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
| Levar a outro mapa | Leva o token (e o jogador dono dele) para outro mapa. Precisa do módulo [Navegador de Mundos](https://github.com/Daphenius/navegador-mapas) ativo |
| Esperar | Pausa entre uma ação e outra |

As ações são executadas pelo mestre conectado. Sem mestre online, os objetos não respondem.

## Dicas

- O botão de setas no HUD do tile troca a aparência na hora, sem conferir distância nem regras (bom para testar).
- Um tile **escondido** não pode ser usado pelos jogadores. Esconda e mostre objetos com a ação "Mostrar / esconder" para revelar alavancas secretas.
- Para um objeto "invisível" que reage quando alguém pisa, use um tile com imagem transparente e "Pisar em cima".

## API para macros

```js
const api = game.modules.get("objetos-vivos").api;
api.biblioteca();                 // abre a biblioteca
api.criar({ preset: "bau", x, y }); // coloca um objeto pronto (ou { img: "caminho" }) no mapa
api.editar(uuid);                 // abre o editor do objeto (tile ou parede)
api.usar(uuid, tokenUuid);        // usa o objeto, como se o jogador tivesse clicado
api.mudarEstado(uuid, indice);    // vai direto para uma aparência (0 = a primeira)
api.trancar(uuid, true | false);  // tranca ou destranca
```

Ganchos (`Hooks`) para outros módulos: `objetosVivos.usado` (objeto usado) e `objetosVivos.trancado` (alguém tentou usar um objeto trancado).

## English

**Living Objects** *(in testing — not complete yet and may contain many bugs and AI quirks)* places interactive objects on Foundry VTT maps (levers, buttons, chests, pressure plates, runes or your own images) from a library opened by its own button on the left bar. Objects get depth (shadow, height and tilt), looks that change when used, and a list of actions for each moment. Doors and walls can also run actions when they open, close, lock, unlock, are tried while locked, or are walked through. The interface is translated into English. Tested on Foundry VTT v14 with the D&D 5e system.

## Licença

[MIT](LICENSE) © Daphenius
