import { aoDestrancar, definirTrancado, mudarEstado } from "./estados.js";
import { aoMoverToken, aoMovimentoToken, esquecerUsaveis, estadosPorta, lembrarPortas, ligarMapa, ouvirPorta, ouvirTentativas } from "./gatilhos.js";
import { botaoNaBarra, botoesHud, injetarSecao } from "./interface.js";
import { atualizarMapa, botaoVolta, soltarMapa, voltarAoMapa } from "./mapa.js";
import { ID, abrirBiblioteca, abrirEditor, carregar, cfgDe, ehObjeto, ehTile, estaTrancado, souMestreAtivo } from "./nucleo.js";
import { registrarSocket } from "./socket.js";
import { eventoParede, pedirUso } from "./testes.js";
import { animar, aplicarCamaleao, aplicarProfundidade, aplicarVisao, atualizarBrilho, atualizarProfundidades, camoMestre, camuflado, liberarVisao, profDe, soltarBrilho, visaoDe } from "./visual.js";

// Registro
Hooks.once("init", () => {
  game.settings.register(ID, "biblioteca", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "pastaAssets", { scope: "client", config: false, type: Object, default: {} });
  game.settings.register(ID, "pacotesGuardados", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "tamMiniatura", { scope: "client", config: false, type: String, default: "m" });
  // Cada pessoa escolhe no próprio computador (computador fraco: "leve" ou "mínima")
  game.settings.register(ID, "qualidade", {
    name: "OV.Config.Qualidade", hint: "OV.Config.QualidadeDica", scope: "client", config: true, type: String, default: "completa",
    choices: { completa: "OV.Config.Completa", leve: "OV.Config.Leve", minima: "OV.Config.Minima" },
    onChange: () => { if (canvas.ready) atualizarProfundidades({ tudo: true }); }
  });
});

Hooks.on("getSceneControlButtons", botaoNaBarra);
Hooks.on("renderTileConfig", injetarSecao);
Hooks.on("renderWallConfig", injetarSecao);
Hooks.on("renderTileHUD", botoesHud);

// Arrastar da biblioteca para o mapa
Hooks.on("dropCanvasData", (_canvas, dados) => {
  if (dados?.type !== "ObjetoVivo" || !game.user.isGM) return;
  (async () => {
    const bib = await carregar.biblioteca();
    if (dados.dd) return bib.usarDoPacote(dados.pac, dados.dd, { x: dados.x, y: dados.y });
    const salvo = dados.salvo ? bib.meusObjetos().find(o => o.id === dados.salvo) : null;
    (await carregar.encaixe()).criarObjeto({ preset: dados.img ? null : dados.preset, img: dados.img ?? null, salvo, x: dados.x, y: dados.y });
  })();
  return false;
});

// Profundidade: reaplica sempre que o Foundry redesenha o tile ou a câmera anda.
// Tile comum (que não é objeto e nunca foi) sai na primeira linha, sem nenhum cálculo.
Hooks.on("refreshTile", tile => {
  if (!tile._ovCamo && !tile._ov3d && !tile._ovSombra && !tile._ovMarca && !tile._ovPrevia && !cfgDe(tile.document)) return;
  if (tile._ovCamo || camuflado(tile) || camoMestre(tile)) aplicarCamaleao(tile);
  if (tile._ov3d || visaoDe(tile)) aplicarVisao(tile);
  if (tile._ovSombra || tile._ovMarca || profDe(tile)) aplicarProfundidade(tile);
});
Hooks.on("canvasPan", () => atualizarProfundidades());

Hooks.on("drawWall", w => ouvirPorta(w.doorControl));
Hooks.on("refreshWall", w => ouvirPorta(w.doorControl));
Hooks.on("canvasReady", () => {
  esquecerUsaveis();
  ouvirTentativas(); ligarMapa();
  atualizarBrilho(); atualizarProfundidades({ tudo: true }); atualizarMapa(); botaoVolta();
  for (const o of canvas.tiles?.placeables ?? []) if (camuflado(o) || camoMestre(o)) aplicarCamaleao(o);
});
// Troca de mapa: solta o que foi desenhado no mapa anterior
Hooks.on("canvasTearDown", () => { esquecerUsaveis(); soltarBrilho(); soltarMapa(); });
Hooks.on("updateToken", aoMoverToken);
Hooks.on("moveToken", aoMovimentoToken);
// Tile saiu do mapa (apagado, troca de cena): solta a imagem da visão 3D
Hooks.on("destroyTile", tile => liberarVisao(tile));
Hooks.on("controlToken", () => atualizarBrilho());
Hooks.on("updateTile", (doc, mud) => {
  if (doc.parent?.id !== canvas.scene?.id) return;
  esquecerUsaveis();
  const meu = foundry.utils.hasProperty(mud, `flags.${ID}`);
  if (meu) { aplicarCamaleao(doc.object); aplicarVisao(doc.object); aplicarProfundidade(doc.object); }
  if (foundry.utils.hasProperty(mud, `flags.${ID}.objeto.estado`)) animar(doc.object, cfgDe(doc)?.anim);
  if (foundry.utils.hasProperty(mud, "flags.gazua-mesa")) foundry.applications.instances?.get?.(`${ID}-editor-Tile-${doc.id}`)?.render();
  if (!ehObjeto(doc) && !meu) return; // tile comum: nada mais a fazer
  atualizarBrilho();
  atualizarMapa();
});
Hooks.on("createTile", doc => { if (doc.parent?.id === canvas.scene?.id) { esquecerUsaveis(); if (ehObjeto(doc)) { atualizarBrilho(); atualizarMapa(); } } });
Hooks.on("deleteTile", doc => { if (doc.parent?.id === canvas.scene?.id) { esquecerUsaveis(); if (ehObjeto(doc)) { atualizarBrilho(); atualizarMapa(); } } });
// Voltar ao mapa: o botão aparece/some quando o mapa atual ganha ou perde de onde voltar
Hooks.on("updateScene", (cena, mud) => { if (cena.id === canvas.scene?.id && foundry.utils.hasProperty(mud, `flags.${ID}`)) botaoVolta(); });
Hooks.on("deleteScene", () => botaoVolta());

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
  if (game.user.isGM) for (const cena of game.scenes) lembrarPortas(cena);

  registrarSocket();

  // API para macros e outros módulos
  game.modules.get(ID).api = {
    biblioteca: () => abrirBiblioteca(),
    criar: async (opcoes = {}) => (await carregar.encaixe()).criarObjeto(opcoes),
    encaixar: async (opcoes = {}) => (await carregar.encaixe()).encaixar(opcoes),
    // Abre um minijogo de conserto e devolve true (conseguiu), false (falhou) ou null (fechou)
    minijogo: async ({ jogo = "aneis", img = "", nome = "", cd = 15, tempo = 45 } = {}) => {
      const { MinijogoConserto } = await carregar.minijogos();
      const app = new MinijogoConserto({ jogo, img, nome, cd, tempo });
      app.render({ force: true });
      return app.resultado;
    },
    // Mapa interativo
    voltarAoMapa: () => voltarAoMapa(),
    editar: async uuid => abrirEditor(await fromUuid(uuid)),
    usar: async (uuid, tokenUuid = null) => { const d = await fromUuid(uuid); if (d && ehObjeto(d)) pedirUso(d, tokenUuid); },
    mudarEstado: async (uuid, indice) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) mudarEstado(d, indice, { cena: d.parent, token: null, userId: game.user.id, fonte: d, profundidade: 0 }); },
    trancar: async (uuid, trancado = true) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) await definirTrancado(d, !!trancado); },
    estaTrancado: async uuid => { const d = await fromUuid(uuid); return d ? estaTrancado(d) : false; }
  };
});
