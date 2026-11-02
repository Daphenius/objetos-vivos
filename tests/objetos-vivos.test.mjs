// Testes do Objetos Vivos (rodam no Node, com um Foundry falso): npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "./fake-foundry.mjs";

F.instalar();
const { mudarEstado, podeAgir } = await import("../scripts/estados.js");
const { usarObjeto, pedirUso, desafios } = await import("../scripts/testes.js");
const { gerarDesafio, conferirJogadas } = await import("../scripts/minijogos.js");
const { salvarNaBiblioteca, zerarEstado } = await import("../scripts/biblioteca.js");
const { lerPacoteDD } = await import("../scripts/gdpc.js");
const { aoMovimentoToken } = await import("../scripts/gatilhos.js");
const { preencher } = await import("../scripts/nucleo.js");
await import("../scripts/objetos-vivos.js");
F.prontos();

const estados = () => [{ id: "e0", nome: "a", img: "a.png" }, { id: "e1", nome: "b", img: "b.png" }];
const objeto = extra => ({ estados: estados(), estado: 0, interacao: "clicar", quem: "todos", usos: 0, usados: 0, voltar: 0, acoes: {}, ...extra });
const cfg = d => d.flags["objetos-vivos"].objeto;
const tkAna = F.token("tkAna", "ana");
const tkBeto = F.token("tkBeto", "beto");
const tkNpc = F.token("tkNpc", null);
F.ana.character = tkAna.actor;
const comoMestre = () => { game.user = F.mestre; };

test("volta automática: volta ao estado inicial sem rodar 'Sempre que for usado'", async () => {
  const d = F.tile("volta", objeto({ voltar: 0.05, acoes: { sempre: [{ id: "a", tipo: "chat", texto: "sempre!", atraso: 0 }] } }));
  F.chat.length = 0;
  await usarObjeto(d, { userId: "gm" });
  assert.equal(cfg(d).estado, 1);
  assert.equal(F.chat.length, 1, "o uso roda 'sempre' uma vez");
  await F.espera(150);
  assert.equal(cfg(d).estado, 0, "voltou sozinho");
  assert.equal(F.chat.length, 1, "a volta não roda 'sempre'");
});

test("volta automática não roda se o tile foi apagado", async () => {
  const d = F.tile("apagado", objeto({ voltar: 0.05 }));
  await usarObjeto(d, { userId: "gm" });
  F.cena.tiles.delete("apagado");
  await F.espera(120);
  assert.equal(cfg(d).estado, 1);
});

test("mudarEstado troca a imagem e roda as ações do estado", async () => {
  const d = F.tile("muda", objeto({ acoes: { "estado:e1": [{ id: "x", tipo: "chat", texto: "ligou {token}", atraso: 0 }] } }));
  F.chat.length = 0;
  await mudarEstado(d, 1, { cena: F.cena, token: tkAna, userId: "gm", fonte: d, profundidade: 0 });
  assert.equal(d.texture.src, "b.png");
  assert.match(F.chat[0].content, /ligou tkAna/);
});

test("podeAgir: quem pode usar", async () => {
  const d = F.tile("quem", objeto({ quem: "jogadores" }));
  assert.equal(await podeAgir(d, cfg(d), tkNpc, null, "q1"), false, "NPC não usa objeto só de jogadores");
  assert.equal(await podeAgir(d, cfg(d), tkAna, "ana", "q2"), true);
  const n = F.tile("npcs", objeto({ quem: "npcs" }));
  assert.equal(await podeAgir(n, cfg(n), tkAna, "ana", "q3"), false);
});

test("podeAgir: usos, confirmação e anti-repique", async () => {
  const d = F.tile("usos", objeto({ usos: 1 }));
  assert.equal(await podeAgir(d, cfg(d), tkAna, "ana", "u"), true);
  assert.equal(cfg(d).usados, 1, "gastou o uso");
  await F.espera(850);
  assert.equal(await podeAgir(d, cfg(d), tkAna, "ana", "u"), false, "sem usos");
  const r = F.tile("repique", objeto());
  assert.equal(await podeAgir(r, cfg(r), tkAna, "ana", "r"), true);
  assert.equal(await podeAgir(r, cfg(r), tkAna, "ana", "r"), false, "dois cliques seguidos contam uma vez");
  const c = F.tile("confirma", objeto({ confirmar: true }));
  F.confirmacoes.resposta = false;
  assert.equal(await podeAgir(c, cfg(c), tkAna, "ana", "c"), false, "mestre recusou");
  F.confirmacoes.resposta = true;
  await F.espera(850);
  assert.equal(await podeAgir(c, cfg(c), tkAna, "ana", "c", { confirmar: false }), true, "pedido do próprio mestre não pergunta de novo");
});

test("regras antes do teste: sem usos não rola; falhou não gasta uso", async () => {
  const teste = { modo: "usar", como: "rolagem", qual: "formula", formula: "1d20", cd: 15, quemRola: "mestre" };
  const semUsos = F.tile("semusos", objeto({ usos: 1, usados: 1, teste }));
  const antes = F.rolagens.n;
  await usarObjeto(semUsos, { userId: "gm", tokenUuid: tkAna.uuid });
  assert.equal(F.rolagens.n, antes, "nem rolou");
  const d = F.tile("falha", objeto({ usos: 3, teste }));
  F.rolagens.total = 12;
  await usarObjeto(d, { userId: "gm", tokenUuid: tkAna.uuid });
  assert.equal(cfg(d).usados, 0);
  assert.equal(cfg(d).estado, 0);
});

test("biblioteca: salvar zera todo o estado de jogo", async () => {
  const d = F.tile("salvar", objeto({ nome: "Baú", estado: 1, usados: 2, trancado: true, revelado: true, desarmado: true, teste: { modo: "desarmar", feitas: 3 },
    acoes: { sempre: [{ id: "p", tipo: "portas", portas: ["w1"], atraso: 0 }] } }));
  await salvarNaBiblioteca(d, cfg(d));
  const salvo = F.config.biblioteca[0].cfg;
  assert.deepEqual([salvo.estado, salvo.usados, salvo.trancado, salvo.revelado, salvo.desarmado, salvo.teste.feitas], [0, 0, false, false, false, 0]);
  assert.deepEqual(salvo.acoes.sempre[0].portas, [], "portas deste mapa não vão junto");
  assert.equal(cfg(d).estado, 1, "o objeto no mapa não muda");
  assert.equal(zerarEstado({ estado: 1 }).estado, 0);
});

test("pacote do Dungeondraft com % e acentos no nome", async () => {
  const enc = new TextEncoder();
  const arquivos = [
    ["res://packs/abc/pack.json", enc.encode(JSON.stringify({ name: "Pacote 100% Teste", author: "Fulano" }))],
    ["res://textures/objects/móveis/caixa 50%.png", new Uint8Array([137, 80, 78, 71])],
    ["res://textures/objects/vazio.png", new Uint8Array(0)]
  ];
  const cab = [];
  const u32 = v => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v, true); cab.push(b); };
  const u64 = v => { u32(v % 4294967296); u32(Math.floor(v / 4294967296)); };
  const nomes = arquivos.map(([c]) => enc.encode(c));
  let tamIndice = 5 * 4 + 16 * 4 + 4;
  for (const n of nomes) tamIndice += 4 + n.length + 8 + 8 + 16;
  u32(0x43504447); u32(1); u32(3); u32(5); u32(0);
  for (let i = 0; i < 16; i++) u32(0);
  u32(arquivos.length);
  let ofs = tamIndice;
  arquivos.forEach(([, dados], i) => { u32(nomes[i].length); cab.push(nomes[i]); u64(ofs); u64(dados.length); cab.push(new Uint8Array(16)); ofs += dados.length; });
  const blob = new Blob([...cab, ...arquivos.map(([, d]) => d)]);
  const pac = await lerPacoteDD(blob, "meu%pacote.dungeondraft_pack");
  assert.equal(pac.nome, "Pacote 100% Teste");
  assert.equal(pac.autor, "Fulano");
  assert.equal(pac.slug, "pacote-100-teste");
  assert.deepEqual(pac.imagens.map(a => a.rel), ["objects/móveis/caixa 50%.png"], "imagem vazia fica de fora");
  assert.equal(pac.contagem.get("objects/móveis"), 1);
  assert.equal((await pac.cortar(pac.imagens[0]).arrayBuffer()).byteLength, 4);
});

test("socket: argumento a mais é descartado e quem pediu é o remetente real", async () => {
  comoMestre();
  const d = F.tile("sock", objeto());
  let quem = null;
  Hooks.on("objetosVivos.usado", (doc, info) => { if (doc === d) quem = info.userId; });
  await F.socket({ acao: "usar", uuid: d.uuid }, "gm", "ana");
  await F.espera(20);
  assert.equal(cfg(d).estado, 0, "descartado");
  await F.socket({ acao: "usar", uuid: d.uuid, userId: "beto" }, "ana");
  await F.espera(20);
  assert.equal(quem, "ana");
});

test("socket: token de outro jogador é ignorado; efeitos só do mestre", async () => {
  comoMestre();
  const d = F.tile("sock2", objeto());
  let tk = "x";
  Hooks.on("objetosVivos.usado", (doc, info) => { if (doc === d) tk = info.token; });
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkBeto.uuid }, "ana");
  await F.espera(20);
  assert.notEqual(tk, tkBeto);
  game.user = F.ana; F.avisos.length = 0;
  await F.socket({ acao: "efeito", userIds: ["ana"], efeito: { tipo: "aviso", texto: "falso" } }, "beto");
  await F.socket({ acao: "efeito", userIds: ["ana"], efeito: { tipo: "aviso", texto: "verdadeiro" } }, "gm");
  await F.espera(10);
  assert.deepEqual(F.avisos, ["verdadeiro"]);
  comoMestre();
});

test("rolagem: o mestre lê a mensagem do chat (do próprio jogador, uma vez só)", async () => {
  comoMestre();
  const d = F.tile("rola", objeto({ teste: { modo: "usar", como: "rolagem", qual: "formula", formula: "1d20", cd: 15, quemRola: "jogador" } }));
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid, rolagem: { total: 30 } }, "ana");
  await F.espera(30);
  assert.equal(cfg(d).estado, 0, "número mandado direto não vale");
  assert.ok(F.emitidos.some(e => e.acao === "jogar" && e.userIds[0] === "ana"), "o mestre pede a rolagem na tela da Ana");
  F.mensagem("m-beto", F.beto, 20);
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid, rolagem: { mensagem: "m-beto" } }, "ana");
  await F.espera(1700);
  assert.equal(cfg(d).estado, 0, "rolagem de outra pessoa não vale");
  F.mensagem("m-ana", F.ana, 20);
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid, rolagem: { mensagem: "m-ana" } }, "ana");
  await F.espera(30);
  assert.equal(cfg(d).estado, 1);
  await d.update({ "flags.objetos-vivos.objeto.estado": 0 });
  await F.espera(850);
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid, rolagem: { mensagem: "m-ana" } }, "ana");
  await F.espera(1700);
  assert.equal(cfg(d).estado, 0, "a mesma rolagem não vale duas vezes");
});

test("rolagem: lado do jogador manda só o id da mensagem", async () => {
  const d = F.tile("rola2", objeto({ teste: { modo: "usar", como: "rolagem", qual: "formula", formula: "1d20", cd: 10, quemRola: "jogador" } }));
  game.user = F.ana; F.emitidos.length = 0;
  await pedirUso(d, tkAna.uuid);
  const pedido = F.emitidos.find(e => e.acao === "usar");
  assert.equal(typeof pedido.rolagem.mensagem, "string");
  assert.equal(pedido.rolagem.total, undefined);
  assert.equal("userId" in pedido, false);
  comoMestre();
  await F.socket(pedido, "ana");
  await F.espera(30);
  assert.equal(cfg(d).estado, 1);
});

test("dono offline e 'jogador rola': o mestre rola às cegas", async () => {
  comoMestre();
  F.ana.active = false;
  const d = F.tile("offline", objeto({ interacao: "pisar", teste: { modo: "usar", como: "rolagem", qual: "formula", formula: "1d20", cd: 10, quemRola: "jogador" } }));
  F.emitidos.length = 0;
  await usarObjeto(d, { tokenUuid: tkAna.uuid });
  F.ana.active = true;
  assert.equal(F.emitidos.some(e => e.acao === "jogar"), false);
  assert.equal(cfg(d).estado, 1);
});

test("minijogo: o mestre confere as jogadas (anéis e runa)", () => {
  const aneis = gerarDesafio("aneis", 15);
  assert.ok(aneis.giros.length === 3 && aneis.giros.every(g => g > 0 && g < 360 && g % 45 === 0));
  const resolver = aneis.giros.flatMap((g, i) => Array.from({ length: (360 - g) / 45 }, () => [i, 1]));
  assert.equal(conferirJogadas("aneis", 15, aneis, resolver), true);
  assert.equal(conferirJogadas("aneis", 15, aneis, resolver.slice(0, -1)), false);
  assert.equal(conferirJogadas("aneis", 15, aneis, [[0, 7], [99, 1], "x"]), false, "jogada inválida não conta");
  const runa = gerarDesafio("runa", 15);
  assert.equal(conferirJogadas("runa", 15, runa, runa.ordem), true);
  const errado = runa.ordem.find(i => i !== runa.ordem[0]);
  assert.equal(conferirJogadas("runa", 15, runa, [errado, ...runa.ordem]), true, "um erro e depois certo");
  assert.equal(conferirJogadas("runa", 15, runa, [errado, errado, errado, ...runa.ordem]), false, "três erros");
});

test("minijogo de jogador: o mestre monta o desafio e decide pelo que o jogador fez", async () => {
  comoMestre();
  const d = F.tile("mini", objeto({ teste: { modo: "consertar", como: "minijogo", minijogo: "aneis", cd: 15, tempo: 45 } }));
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid, rolagem: { minijogo: true } }, "ana");
  await F.espera(30);
  assert.equal(cfg(d).estado, 0, "'consegui' mandado pelo jogador não vale");
  const pedido = F.emitidos.find(e => e.acao === "jogar" && e.desafio);
  assert.ok(pedido, "o mestre mandou um desafio para a Ana");
  const { id, estado } = pedido.desafio;
  assert.equal(desafios.get(id).userId, "ana");
  const errado = [[0, 1]];
  await F.socket({ acao: "minijogo", desafio: id, jogadas: errado }, "beto");
  await F.espera(20);
  assert.ok(desafios.has(id), "o desafio da Ana não aceita jogadas do Beto");
  await F.socket({ acao: "minijogo", desafio: id, jogadas: errado }, "ana");
  await F.espera(30);
  assert.equal(cfg(d).estado, 0);
  assert.equal(cfg(d).teste.feitas, 1, "falhou: conta a tentativa");
  assert.equal(desafios.has(id), false, "o desafio vale uma vez");
  await F.espera(850);
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid }, "ana");
  await F.espera(30);
  const novo = F.emitidos.find(e => e.acao === "jogar" && e.desafio).desafio;
  const certo = novo.estado.giros.flatMap((g, i) => Array.from({ length: (360 - g) / 45 }, () => [i, 1]));
  await F.socket({ acao: "minijogo", desafio: novo.id, jogadas: certo }, "ana");
  await F.espera(30);
  assert.equal(cfg(d).estado, 1, "consertado");
});

test("movimento com vários pontos: placa no meio do caminho dispara", async () => {
  comoMestre();
  const placa = F.tile("placa", objeto({ interacao: "pisar" }));
  Object.assign(placa, { x: 200, y: 200 });
  const runa = F.tile("runa", objeto({ interacao: "perto", distancia: 1 }));
  Object.assign(runa, { x: 600, y: 600 });
  const tk = F.token("andarilho", "ana");
  // origem (0,200) → passa por (400,200) → termina em (400,0): a placa (200..300, 200..300) fica no meio
  aoMovimentoToken(tk, { origin: { x: 0, y: 200 }, passed: { waypoints: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 0 }] }, destination: { x: 400, y: 0 } }, {});
  await F.espera(30);
  assert.equal(cfg(placa).estado, 1, "pisou no meio do caminho");
  assert.equal(cfg(runa).estado, 0, "não chegou perto da runa");
  aoMovimentoToken(tk, { origin: { x: 400, y: 0 }, passed: { waypoints: [{ x: 400, y: 0 }] } }, { ovInterno: true });
  await F.espera(10);
});

test("chat: nomes entram escapados", () => {
  const d = F.tile("chat", objeto());
  assert.equal(preencher("{token} / {jogador}", { token: { name: "<b>x</b>" }, userId: "ana", fonte: d, cena: F.cena }), "&lt;b&gt;x&lt;/b&gt; / ana");
});
