# Objetos Vivos (Em testes)

## Sobre como este módulo foi feito

Sei que parte da comunidade não gosta de módulos produzidos com IA, então prefiro ser transparente: este foi desenvolvido com ajuda de IA. Não sou programador.

Tudo começou quando um amigo me disse: “cara, ficou muito mais simples, é só fazer uma macro do que você quer”. Fiz a macro para a minha mesa, fui adaptando conforme a necessidade dos jogos e, no fim, ela virou um módulo. Uso nas minhas próprias sessões e resolvi compartilhar caso seja útil para mais alguém.

Se encontrar bugs ou tiver sugestões, abra uma issue. Todo retorno é bem-vindo.

> [!WARNING]
> **Módulo em testes.** Ainda não está completo e pode ter muitos erros e vícios de IA. Use com cuidado, faça backup do mundo antes de instalar e, se algo der errado, abra uma issue.

---

Transforme tiles e assets do **Foundry VTT** em **objetos vivos**: alavancas que descem, botões que voltam sozinhos, baús que abrem, placas de pressão, runas que acendem. Cada objeto tem **estados** (com uma imagem para cada um), uma **animação** ao mudar e uma lista de **ações** para cada momento. Portas e paredes do Foundry também podem ter ações.

> **Testado no Foundry VTT v14 com o sistema D&D 5e**, nas minhas próprias sessões.
> Textos em português (Brasil) e inglês.

## Instalação

No Foundry, vá em **Configuração → Módulos → Instalar Módulo** e cole este link no campo *URL do Manifesto*:

```
https://github.com/Daphenius/objetos-vivos/releases/latest/download/module.json
```

Depois, ative o módulo no mundo em **Gerenciar Módulos**.

## Como criar um objeto

1. Coloque no mapa o tile ou asset que vai virar objeto (a alavanca, o baú...).
2. Abra a configuração dele (clique duplo na camada de Tiles) ou clique com o botão direito e use o botão de varinha no HUD.
3. Clique em **Transformar em objeto vivo**. O editor abre.

O editor tem quatro etapas:

| Etapa | O que você escolhe |
|---|---|
| **Aparência** | Um modelo (alavanca, botão, baú, placa de pressão, runa ou personalizado), a animação (girar, deslizar, virar, pulsar, piscar) e o som ao mudar |
| **Como o jogador usa** | Clicar no objeto, pisar em cima, chegar perto ou só o mestre aciona; a distância; a mãozinha e o brilho quando alguém está perto |
| **O que acontece** | As ações para cada estado ("Ao ficar: Ligada", "Ao ficar: Desligada") e para "Sempre que mudar" |
| **Regras** | Quem pode usar, limite de usos, voltar sozinho ao estado inicial, confirmação do mestre e trancado |

À esquerda ficam os **estados**: dê um nome e uma imagem para cada um (por exemplo `alavanca-cima.webp` e `alavanca-baixo.webp`). O botão **Testar** mostra a troca com a animação.

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

- O mestre usa qualquer objeto com **Alt+clique** no mapa (um clique normal continua editando o mapa), ou pelo botão de setas no HUD do tile.
- Um tile **escondido** não pode ser usado pelos jogadores. Esconda e mostre objetos com a ação "Mostrar / esconder" para revelar alavancas secretas.
- Para um objeto "invisível" que reage quando alguém pisa, use um tile com imagem transparente e "Pisar em cima".

## API para macros

```js
const api = game.modules.get("objetos-vivos").api;
api.editar(uuid);                 // abre o editor do objeto (tile ou parede)
api.usar(uuid, tokenUuid);        // usa o objeto, como se o jogador tivesse clicado
api.mudarEstado(uuid, indice);    // vai direto para um estado (0 = inicial)
api.trancar(uuid, true | false);  // tranca ou destranca
```

Ganchos (`Hooks`) para outros módulos: `objetosVivos.usado` (objeto usado) e `objetosVivos.trancado` (alguém tentou usar um objeto trancado).

## English

**Living Objects** *(in testing — not complete yet and may contain many bugs and AI quirks)* turns Foundry VTT tiles and assets into interactive objects (levers, buttons, chests, pressure plates, runes) with states, an image per state, an animation and a list of actions for each moment. Doors and walls can also run actions when they open, close, lock, unlock, are tried while locked, or are walked through. The interface is translated into English. Tested on Foundry VTT v14 with the D&D 5e system.

## Licença

[MIT](LICENSE) © Daphenius
