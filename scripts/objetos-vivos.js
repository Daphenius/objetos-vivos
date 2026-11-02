import { abrirBiblioteca, meusObjetos, usarDoPacote } from "./biblioteca.js";
import { abrirEditor } from "./editor.js";
import { criarObjeto, encaixar } from "./encaixe.js";
import { aoDestrancar, definirTrancado, mudarEstado, posicoes } from "./estados.js";
import { aoMoverToken, aoMovimentoToken, estadosPorta, lembrarPortas, lembrarPosicoes, ligarMapa, ouvirPorta, ouvirTentativas } from "./gatilhos.js";
import { botaoNaBarra, botoesHud, injetarSecao } from "./interface.js";
import { MinijogoConserto } from "./minijogos.js";
import { ID, centroToken, cfgDe, ehObjeto, ehTile, estaTrancado, souMestreAtivo } from "./nucleo.js";
import { registrarSocket } from "./socket.js";
import { eventoParede, pedirUso } from "./testes.js";
import { animar, aplicarCamaleao, aplicarProfundidade, aplicarVisao, atualizarBrilho, atualizarProfundidades, camoMestre, camuflado, liberarVisao, profDe, visaoDe } from "./visual.js";

// Registro
Hooks.once("init", () => {
  game.settings.register(ID, "biblioteca", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "pastaAssets", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(ID, "pacotesGuardados", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "tamMiniatura", { scope: "client", config: false, type: String, default: "m" });
});

Hooks.on("getSceneControlButtons", botaoNaBarra);
Hooks.on("renderTileConfig", injetarSecao);
Hooks.on("renderWallConfig", injetarSecao);
Hooks.on("renderTileHUD", botoesHud);

// Arrastar da biblioteca para o mapa
Hooks.on("dropCanvasData", (_canvas, dados) => {
  if (dados?.type !== "ObjetoVivo" || !game.user.isGM) return;
  if (dados.dd) { usarDoPacote(dados.pac, dados.dd, { x: dados.x, y: dados.y }); return false; }
  const salvo = dados.salvo ? meusObjetos().find(o => o.id === dados.salvo) : null;
  criarObjeto({ preset: dados.img ? null : dados.preset, img: dados.img ?? null, salvo, x: dados.x, y: dados.y });
  return false;
});

// Profundidade: reaplica sempre que o Foundry redesenha o tile ou a câmera anda
Hooks.on("refreshTile", tile => {
  if (tile._ovCamo || camuflado(tile) || camoMestre(tile)) aplicarCamaleao(tile);
  if (tile._ov3d || visaoDe(tile)) aplicarVisao(tile);
  if (tile._ovSombra || profDe(tile)) aplicarProfundidade(tile);
});
Hooks.on("canvasPan", () => atualizarProfundidades());

Hooks.on("drawWall", w => ouvirPorta(w.doorControl));
Hooks.on("refreshWall", w => ouvirPorta(w.doorControl));
Hooks.on("canvasReady", () => { ouvirTentativas(); ligarMapa(); lembrarPosicoes(canvas.scene); atualizarBrilho(); atualizarProfundidades(); for (const o of canvas.tiles?.placeables ?? []) if (camuflado(o) || camoMestre(o)) aplicarCamaleao(o); });
Hooks.on("createToken", tk => posicoes.set(tk.uuid, centroToken(tk)));
Hooks.on("deleteToken", tk => posicoes.delete(tk.uuid));
Hooks.on("updateToken", aoMoverToken);
Hooks.on("moveToken", aoMovimentoToken);
// Tile saiu do mapa (apagado, troca de cena): solta a imagem da visão 3D
Hooks.on("destroyTile", tile => liberarVisao(tile));
Hooks.on("controlToken", () => atualizarBrilho());
Hooks.on("updateTile", (doc, mud) => {
  if (doc.parent?.id !== canvas.scene?.id) return;
  if (foundry.utils.hasProperty(mud, `flags.${ID}`)) { aplicarCamaleao(doc.object); aplicarVisao(doc.object); aplicarProfundidade(doc.object); }
  if (foundry.utils.hasProperty(mud, `flags.${ID}.objeto.estado`)) animar(doc.object, cfgDe(doc)?.anim);
  if (foundry.utils.hasProperty(mud, "flags.gazua-mesa")) foundry.applications.instances?.get?.(`${ID}-editor-Tile-${doc.id}`)?.render();
  atualizarBrilho();
});

// Portas: o que aconteceu com elas
Hooks.on("updateWall", (parede, mud, op, userId) => {
  const S = CONST.WALL_DOOR_STATES;
  const antes = estadosPorta.get(parede.uuid);
  if ("ds" in mud) estadosPorta.set(parede.uuid, mud.ds);
  if (!("ds" in mud) || op?.ovInterno || !ehObjeto(parede)) return;
  let momento = { [S.OPEN]: "abrir", [S.LOCKED]: "trancar" }[mud.ds];
  if (mud.ds === S.CLOSED) momento = antes === S.LOCKED ? "destrancar" : "fechar";
  if (momento) eventoParede(parede, momento, { userId });
});
Hooks.on("createWall", w => { if (w.door > 0) estadosPorta.set(w.uuid, w.ds); });

// Gazua da Mesa: a fechadura do objeto foi aberta (chave, gazua, teste, minijogo ou pelo mestre) ou trancada de novo
Hooks.on("gazua-mesa.destrancou", async (doc, { actor = null, userId = null } = {}) => {
  if (!souMestreAtivo() || !ehTile(doc) || !ehObjeto(doc)) return;
  if (cfgDe(doc)?.trancado) await doc.setFlag(ID, "objeto.trancado", false);
  const token = actor?.getActiveTokens?.(false, true)?.find(tk => tk.parent?.id === doc.parent?.id) ?? null;
  await aoDestrancar(doc, { cena: doc.parent, token, userId: userId ?? game.user.id, fonte: doc, profundidade: 0 });
});
Hooks.on("gazua-mesa.trancou", async doc => {
  if (!souMestreAtivo() || !ehTile(doc) || !ehObjeto(doc)) return;
  if (!cfgDe(doc)?.trancado) await doc.setFlag(ID, "objeto.trancado", true);
});

Hooks.once("ready", () => {
  if (game.user.isGM) for (const cena of game.scenes) { lembrarPosicoes(cena); lembrarPortas(cena); }

  registrarSocket();

  // API para macros e outros módulos
  game.modules.get(ID).api = {
    biblioteca: () => abrirBiblioteca(),
    criar: (opcoes = {}) => criarObjeto(opcoes),
    encaixar: (opcoes = {}) => encaixar(opcoes),
    // Abre um minijogo de conserto e devolve true (conseguiu), false (falhou) ou null (fechou)
    minijogo: ({ jogo = "aneis", img = "", nome = "", cd = 15, tempo = 45 } = {}) => {
      const app = new MinijogoConserto({ jogo, img, nome, cd, tempo });
      app.render({ force: true });
      return app.resultado;
    },
    editar: async uuid => abrirEditor(await fromUuid(uuid)),
    usar: async (uuid, tokenUuid = null) => { const d = await fromUuid(uuid); if (d && ehObjeto(d)) pedirUso(d, tokenUuid); },
    mudarEstado: async (uuid, indice) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) mudarEstado(d, indice, { cena: d.parent, token: null, userId: game.user.id, fonte: d, profundidade: 0 }); },
    trancar: async (uuid, trancado = true) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) await definirTrancado(d, !!trancado); },
    estaTrancado: async uuid => { const d = await fromUuid(uuid); return d ? estaTrancado(d) : false; }
  };
});
