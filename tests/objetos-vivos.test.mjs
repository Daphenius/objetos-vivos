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

// ---------- Regressões da revisão da 3.0.0
const { mesclarEdicao, EditorObjeto } = await import("../scripts/editor.js");
const { EXECUTAR } = await import("../scripts/estados.js");
const { volumeDe } = await import("../scripts/nucleo.js");
const { resolucaoVisao } = await import("../scripts/visual.js");
const resolverAneis = estado => estado.giros.flatMap((g, i) => Array.from({ length: (360 - g) / 45 }, () => [i, 1]));

async function desarmarComMinijogo(id, usos) {
  comoMestre();
  const d = F.tile(id, objeto({ usos, interacao: "pisar", teste: { modo: "desarmar", como: "minijogo", minijogo: "aneis", cd: 15, tempo: 45 } }));
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid, tokenUuid: tkAna.uuid, desarmar: true }, "ana");
  await F.espera(30);
  assert.equal(cfg(d).usados, 0, "abrir o desafio não gasta o uso");
  const { id: desafio, estado } = F.emitidos.find(e => e.desafio).desafio;
  await F.socket({ acao: "minijogo", desafio, jogadas: resolverAneis(estado) }, "ana");
  await F.espera(30);
  return d;
}
test("desarmar com 1 uso: abrir o desafio não gasta; acertar desarma e gasta uma vez", async () => {
  const d = await desarmarComMinijogo("arm1", 1);
  assert.equal(cfg(d).desarmado, true);
  assert.equal(cfg(d).usados, 1);
});
test("desarmar com 3 usos: a tentativa gasta um uso só", async () => {
  const d = await desarmarComMinijogo("arm3", 3);
  assert.equal(cfg(d).desarmado, true);
  assert.equal(cfg(d).usados, 1);
});
test("desarmar e falhar não gasta uso", async () => {
  comoMestre();
  const d = F.tile("armf", objeto({ usos: 2, teste: { modo: "desarmar", como: "rolagem", qual: "formula", formula: "1d20", cd: 15, quemRola: "mestre", falhaDispara: false } }));
  F.rolagens.total = 5;
  await usarObjeto(d, { userId: "gm", tokenUuid: tkAna.uuid, desarmar: true });
  F.rolagens.total = 12;
  assert.equal(cfg(d).usados, 0);
  assert.equal(cfg(d).desarmado, undefined);
});

test("editor: salvar só o nome não desfaz o que aconteceu no jogo com a janela aberta", async () => {
  const atual = { nome: "", estado: 1, usados: 1, desarmado: true, teste: { modo: "desarmar", feitas: 2, cd: 15 }, prof: { sombra: 40 } };
  const base = { nome: "", estado: 0, usados: 0, desarmado: false, teste: { modo: "desarmar", feitas: 0, cd: 15 }, prof: { sombra: 40 } };
  const editado = { ...structuredClone(base), nome: "Alavanca", teste: { modo: "desarmar", feitas: 0, cd: 18 } };
  const final = mesclarEdicao(atual, base, editado);
  assert.equal(final.nome, "Alavanca");
  assert.deepEqual([final.estado, final.usados, final.desarmado, final.teste.feitas], [1, 1, true, 2], "estado de jogo preservado");
  assert.equal(final.teste.cd, 18, "a CD mudada na janela entra");
  const zerado = mesclarEdicao(atual, { ...base, usados: 1 }, { ...structuredClone(base), usados: 0 });
  assert.equal(zerado.usados, 0, "'Zerar usos' na janela continua valendo");
});
test("editor: integração — abrir, o jogo muda o objeto, salvar o nome", async () => {
  comoMestre();
  const d = F.tile("ed", objeto({ usos: 3 }));
  const ed = new EditorObjeto(d);
  await usarObjeto(d, { userId: "gm" });               // estado 1, 1 uso gasto
  ed.dados.nome = "Portão";
  await ed._salvar();
  assert.equal(cfg(d).nome, "Portão");
  assert.equal(cfg(d).estado, 1);
  assert.equal(cfg(d).usados, 1);
});

test("volta automática antiga não roda depois de outra mudança", async () => {
  comoMestre();
  const d = F.tile("velha", objeto({ voltar: 0.05, acoes: {
    "estado:e1": [{ id: "w", tipo: "esperar", segundos: 0.1, atraso: 0 }],
    "estado:e0": [{ id: "c", tipo: "chat", texto: "inicial", atraso: 0 }] } }));
  F.chat.length = 0;
  const uso = usarObjeto(d, { userId: "gm" });         // vai para o estado 1 e espera 0,1 s
  await F.espera(20);
  await mudarEstado(d, 0, { cena: F.cena, token: null, userId: "gm", fonte: d, profundidade: 0 }); // volta manual
  await uso;
  await F.espera(200);
  assert.equal(F.chat.filter(m => /inicial/.test(m.content)).length, 1, "as ações do estado inicial rodam uma vez só");
  assert.equal(cfg(d).estado, 0);
});

test("volume zero continua zero", async () => {
  assert.equal(volumeDe(0), 0);
  assert.equal(volumeDe("0"), 0);
  assert.equal(volumeDe(""), 0.8);
  assert.equal(volumeDe(undefined), 0.8);
  assert.equal(volumeDe("abc"), 0.8);
  assert.equal(volumeDe(1.7), 1);
  const tocados = [];
  const antigo = foundry.audio.AudioHelper.play;
  foundry.audio.AudioHelper.play = async o => { tocados.push(o.volume); };
  F.mestre.viewedScene = "c1";
  await EXECUTAR.som({ arquivo: "x.ogg", volume: 0, para: "mapa" }, { cena: F.cena, token: null, userId: "gm" });
  await F.espera(10);
  foundry.audio.AudioHelper.play = antigo;
  assert.deepEqual(tocados, [0]);
});

test("visão 3D: nunca passa de 2048 px no maior lado", () => {
  for (const lado of [10, 500, 1024, 2048, 5000, 12000, 40000]) assert.ok(lado * resolucaoVisao(lado, 100) <= 2048 + 1e-6, `lado ${lado}`);
  assert.equal(resolucaoVisao(100, 100), 2, "objeto pequeno continua nítido");
});

// ---------- Botões de comando do editor valem mesmo quando o valor bate com o da abertura
const botao = a => ({ dataset: { a }, closest: () => null });
test("editor: 'Zerar usos' depois de um uso com a janela aberta zera de verdade", async () => {
  comoMestre();
  const d = F.tile("zerar", objeto({ usos: 3 }));
  const ed = new EditorObjeto(d);                       // abriu com 0 usos gastos
  await usarObjeto(d, { userId: "gm" });               // gastou 1 com a janela aberta
  assert.equal(cfg(d).usados, 1);
  await ed._aoClicar(botao("zerar"));
  await ed._salvar();
  assert.equal(cfg(d).usados, 0);
  assert.equal(cfg(d).estado, 1, "o resto do jogo continua");
});
test("editor: 'Armar de novo' e 'Zerar tentativas' valem mesmo batendo com a abertura", async () => {
  comoMestre();
  const d = F.tile("rearmar", objeto({ teste: { modo: "desarmar", como: "rolagem", qual: "formula", cd: 10, quemRola: "mestre", tentativas: 1, feitas: 0 } }));
  const ed = new EditorObjeto(d);                       // abriu armada, sem tentativas
  await d.update({ "flags.objetos-vivos.objeto.desarmado": true, "flags.objetos-vivos.objeto.teste.feitas": 1, "flags.objetos-vivos.objeto.trancado": true });
  await ed._aoClicar(botao("rearmar"));
  await ed._salvar();
  assert.deepEqual([cfg(d).desarmado, cfg(d).teste.feitas, cfg(d).trancado], [false, 0, false]);
  const e = F.tile("tentativas", objeto({ teste: { modo: "usar", como: "rolagem", qual: "formula", cd: 10, tentativas: 2, feitas: 0 } }));
  const ed2 = new EditorObjeto(e);
  await e.update({ "flags.objetos-vivos.objeto.teste.feitas": 2 });
  await ed2._aoClicar(botao("zerar-tentativas"));
  await ed2._salvar();
  assert.equal(cfg(e).teste.feitas, 0);
});
test("editor: 'Esconder de novo' vale mesmo se abriu escondido", async () => {
  comoMestre();
  const d = F.tile("reesconder", objeto({ camaleao: true, revelado: false }));
  const ed = new EditorObjeto(d);
  await d.update({ "flags.objetos-vivos.objeto.revelado": true });  // revelado no jogo
  await ed._aoClicar(botao("reesconder"));
  await ed._salvar();
  assert.equal(cfg(d).revelado, false);
});
test("editor: sem clicar em comando, o jogo continua valendo", async () => {
  comoMestre();
  const d = F.tile("semcomando", objeto({ usos: 3 }));
  const ed = new EditorObjeto(d);
  await usarObjeto(d, { userId: "gm" });
  await ed._salvar();
  assert.equal(cfg(d).usados, 1);
});

// ---------- 3.1.0: mapa interativo e efeitos mais leves
const nucleo = await import("../scripts/nucleo.js");
const { padrao, nevoaCfg, PADRAO_NEVOA, corHex } = nucleo;
const { quemViaja, voltaDe, raioRevelado, cobreNevoa, mostraCadeado } = await import("../scripts/mapa.js");
const { visaoDaNevoa } = await import("../scripts/regiao.js");
const { profDe } = await import("../scripts/visual.js");

class Cenas extends Map { [Symbol.iterator]() { return this.values(); } get contents() { return [...this.values()]; } }
const novaCena = (id, nome) => ({ id, name: nome, flags: {}, tiles: new Map(), tokens: [], walls: [],
  getFlag(m, k) { return this.flags[m]?.[k]; }, async setFlag(m, k, v) { (this.flags[m] ??= {})[k] = v; } });
const cidade = novaCena("c2", "Cidade");
F.cena.getFlag ??= function (m, k) { return this.flags?.[m]?.[k]; };
game.scenes = new Cenas([["c1", F.cena], ["c2", cidade]]);
const viagem = (quem, volta = "comVolta") => ({ acoes: { sempre: [{ id: "v", tipo: "viajar", atraso: 0, destino: "c2", quem, volta }] }, distancia: 0 });
const efeitosVerCena = () => F.emitidos.filter(e => e.acao === "efeito" && e.efeito.tipo === "verCena");

test("modelo Cidade: clica de qualquer distância, com cadeado, névoa e a ação Ir para o mapa", () => {
  const c = padrao(null, "destino");
  assert.equal(c.distancia, 0);
  assert.equal(c.cadeado, true);
  assert.equal(c.revela, true);
  assert.equal(c.estados.length, 1);
  assert.equal(c.acoes.sempre[0].tipo, "viajar");
});

test("Ir para o mapa: só quem clicou vai, e o mapa de destino ganha o botão de volta", async () => {
  comoMestre();
  F.ana.viewedScene = "c1"; F.beto.viewedScene = "c1";
  delete cidade.flags["objetos-vivos"];
  const d = F.tile("cid1", objeto(viagem("quemUsou")));
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid }, "ana");
  await F.espera(20);
  const ef = efeitosVerCena();
  assert.equal(ef.length, 1);
  assert.deepEqual(ef[0].userIds, ["ana"]);
  assert.equal(ef[0].efeito.cena, "c2");
  assert.deepEqual(voltaDe(cidade), { cena: "c1", grupo: false });
});

test("Ir para o mapa em grupo: todos os jogadores do mapa vão, e voltam juntos", async () => {
  comoMestre();
  F.ana.viewedScene = "c1"; F.beto.viewedScene = "c1";
  const d = F.tile("cid2", objeto(viagem("osDoMapa")));
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid }, "ana");
  await F.espera(20);
  assert.deepEqual(efeitosVerCena()[0].userIds.sort(), ["ana", "beto"]);
  assert.equal(voltaDe(cidade).grupo, true);
  // na cidade, Ana clica em "Voltar ao mapa": o grupo volta
  F.ana.viewedScene = "c2"; F.beto.viewedScene = "c2";
  F.emitidos.length = 0;
  await F.socket({ acao: "voltar", cena: "c2" }, "ana");
  const volta = efeitosVerCena();
  assert.equal(volta[0].efeito.cena, "c1");
  assert.deepEqual(volta[0].userIds.sort(), ["ana", "beto"]);
});

test("Voltar ao mapa: quem não está naquele mapa não arrasta ninguém", async () => {
  comoMestre();
  F.ana.viewedScene = "c1";
  F.emitidos.length = 0;
  await F.socket({ acao: "voltar", cena: "c2" }, "ana");
  assert.equal(efeitosVerCena().length, 0);
});

test("cidade trancada: não leva, avisa, mostra cadeado e não abre a névoa", async () => {
  comoMestre();
  const d = F.tile("cid3", objeto({ ...viagem("quemUsou"), trancado: true, cadeado: true, revela: true }));
  F.emitidos.length = 0;
  await F.socket({ acao: "usar", uuid: d.uuid }, "ana");
  await F.espera(20);
  assert.equal(efeitosVerCena().length, 0);
  assert.ok(F.emitidos.some(e => e.efeito?.tipo === "aviso"), "o jogador é avisado");
  const o = { document: d };
  assert.equal(mostraCadeado(o), true);
  assert.equal(cobreNevoa(o), true, "trancada: coberta pela névoa");
  cfg(d).trancado = false;
  assert.equal(mostraCadeado(o), false);
  assert.equal(cobreNevoa(o), false, "liberada: sem névoa");
  cfg(d).trancado = true; d.hidden = true;
  assert.equal(cobreNevoa(o), true, "cidade escondida ainda é coberta (o botão só perde a imagem)");
  assert.equal(mostraCadeado(o), true);
});

test("névoa: raio = metade do objeto + casas em volta", () => {
  assert.equal(raioRevelado({ width: 100, height: 60 }, { raio: 3 }, 100), 350);
  assert.equal(raioRevelado({ width: 100, height: 100 }, {}, 100), 50);
});

test("quem viaja: 'todos os jogadores' não leva o mestre (só se foi ele quem usou)", () => {
  F.ana.viewedScene = "c1"; F.beto.viewedScene = "c9";
  assert.deepEqual(quemViaja("todosJogadores", { cena: F.cena, userId: "ana" }).sort(), ["ana", "beto"]);
  assert.deepEqual(quemViaja("osDoMapa", { cena: F.cena, userId: "gm" }).sort(), ["ana", "gm"]);
});

test("qualidade dos efeitos: leve tira sombra e parallax, mínima tira tudo", () => {
  const prof = { sombra: 60, altura: 12, incl: 16, parallax: true };
  const tile = { document: { getFlag: () => ({ prof }) } };
  F.config.qualidade = "completa";
  assert.deepEqual(profDe(tile), prof);
  F.config.qualidade = "leve";
  assert.deepEqual([profDe(tile).sombra, profDe(tile).parallax, profDe(tile).altura], [0, false, 12]);
  F.config.qualidade = "minima";
  assert.equal(profDe(tile), null);
  tile._ovPrevia = prof;
  assert.deepEqual(profDe(tile), prof, "a prévia do editor sempre aparece");
  F.config.qualidade = "completa";
});

test("névoa configurável: padrão, valor salvo e prévia da janela", () => {
  F.config.nevoa = { cor: "#3b2f1e", opJog: 80 };
  assert.deepEqual(nevoaCfg(), { ...PADRAO_NEVOA, cor: "#3b2f1e", opJog: 80 });
  nevoaCfg.previa = { cor: "#1a1030" };
  assert.equal(nevoaCfg().cor, "#1a1030");
  nevoaCfg.previa = null;
  assert.equal(corHex("#f0a03c"), 0xf0a03c);
  assert.equal(corHex("lixo"), 0);
  delete F.config.nevoa;
});

test("névoa densa da Região: quem enxerga através", () => {
  const ator = (id, itens = [], efeitos = []) => ({ id, items: itens.map(name => ({ name })), appliedEffects: efeitos.map(name => ({ name, disabled: false })) });
  const d = { atores: new Set(["heroi"]), itens: "Lanterna Élfica, visão verdadeira", objeto: "", mestre: true };
  const jogador = { isGM: false }, mestre = { isGM: true };
  assert.equal(visaoDaNevoa(d, jogador, [ator("heroi")]), "sim", "personagem escolhido");
  assert.equal(visaoDaNevoa(d, jogador, [ator("outro")]), "nao");
  assert.equal(visaoDaNevoa(d, jogador, [ator("outro", ["lanterna élfica"])]), "sim", "item com o nome (sem diferenciar maiúsculas)");
  assert.equal(visaoDaNevoa(d, jogador, [ator("outro", [], ["Visão Verdadeira"])]), "sim", "efeito com o nome");
  assert.equal(visaoDaNevoa(d, jogador, []), "nao", "sem personagem: coberto");
  assert.equal(visaoDaNevoa(d, mestre, []), "sim", "mestre vê através: nada desenhado");
  assert.equal(visaoDaNevoa({ ...d, mestre: false }, mestre, []), "mestre", "senão, névoa clara");
});

test("névoa densa da Região: some para todos quando o objeto ligado é destrancado", () => {
  const d = F.tile("cid9", objeto({ trancado: true }));
  globalThis.fromUuidSync = uuid => uuid === d.uuid ? d : null;
  const n = { atores: new Set(), itens: "", objeto: d.uuid, mestre: true };
  assert.equal(visaoDaNevoa(n, { isGM: false }, []), "nao");
  cfg(d).trancado = false;
  assert.equal(visaoDaNevoa(n, { isGM: false }, []), "sim");
  delete globalThis.fromUuidSync;
});

test("cidade escondida continua usável para viagem (mas um objeto comum escondido, não)", () => {
  const { ehDestino, escondido } = nucleo;
  const cidade = { hidden: true };
  const c = { acoes: { sempre: [{ tipo: "viajar", destino: "c2" }] } };
  assert.equal(ehDestino(c), true);
  assert.equal(escondido(cidade, c), false, "escondida, mas é destino: usável, com cadeado e névoa");
  assert.equal(escondido(cidade, { acoes: { sempre: [{ tipo: "som" }] } }), true);
  assert.equal(escondido({ hidden: false }, {}), false);
});

// ---------- Auditoria 3.10.0: viagens simultâneas e escadas com vários jogadores
test("viagens simultâneas: cada um volta para o SEU mapa de origem, e o grupo só leva quem veio do mesmo lugar", async () => {
  comoMestre();
  const c3 = novaCena("c3", "Durholme");
  game.scenes.set("c3", c3);
  delete cidade.flags["objetos-vivos"];
  F.ana.viewedScene = "c1"; F.beto.viewedScene = "c3";
  // Ana sai de c1 (grupo), Beto sai de c3 (sozinho); os dois chegam em c2
  await EXECUTAR.viajar({ destino: "c2", quem: "osDoMapa", volta: "comVolta" }, { cena: F.cena, token: null, userId: "ana" });
  await EXECUTAR.viajar({ destino: "c2", quem: "quemUsou", volta: "comVolta" }, { cena: c3, token: F.token("tb", "beto"), userId: "beto" });
  assert.equal(voltaDe(cidade, F.ana).cena, "c1", "a viagem do Beto não sobrescreveu a origem da Ana");
  assert.equal(voltaDe(cidade, F.beto).cena, "c3");
  assert.equal(voltaDe(cidade, game.user).cena, "c3", "o mestre segue a última viagem");
  // os dois estão em c2; Ana (grupo) pede para voltar: só vai quem veio de c1
  F.ana.viewedScene = "c2"; F.beto.viewedScene = "c2";
  F.emitidos.length = 0;
  await F.socket({ acao: "voltar", cena: "c2" }, "ana");
  const ef = F.emitidos.filter(e => e.acao === "efeito" && e.efeito.tipo === "verCena");
  assert.equal(ef.length, 1);
  assert.deepEqual(ef[0].userIds, ["ana"]);
  assert.equal(ef[0].efeito.cena, "c1");
  // Beto volta para Durholme
  F.emitidos.length = 0;
  await F.socket({ acao: "voltar", cena: "c2" }, "beto");
  const eb = F.emitidos.filter(e => e.acao === "efeito" && e.efeito.tipo === "verCena");
  assert.deepEqual([eb[0].userIds, eb[0].efeito.cena], [["beto"], "c3"]);
  game.scenes.delete("c3");
});

test("flag antiga 'volta' (uma por mapa) ainda é lida", () => {
  const velha = novaCena("c4", "Antiga");
  velha.flags["objetos-vivos"] = { volta: { cena: "c1", grupo: true } };
  game.scenes.set("c4", velha);
  assert.deepEqual(voltaDe(velha, F.ana), { cena: "c1", grupo: true });
  game.scenes.delete("c4");
});

test("escada com vários jogadores: cada um recebe UM 'fim', com a câmera no próprio token", async () => {
  comoMestre();
  const ta = F.token("ta", "ana", { x: 0, y: 0 }), tb = F.token("tb2", "beto", { x: 500, y: 500 });
  ta.actor.hasPlayerOwner = tb.actor.hasPlayerOwner = true;
  const cenaEscada = { ...F.cena, id: "c1", tokens: [ta, tb], grid: { size: 100 }, regions: new Map(),
    async updateEmbeddedDocuments(_t, upd) { for (const u of upd) { const tk = [ta, tb].find(x => x.id === u._id); Object.assign(tk, u); } } };
  ta.parent = tb.parent = cenaEscada;
  const regiao = { uuid: "Scene.c1.Region.r1", shapes: [{ type: "rectangle", x: 1000, y: 1000, width: 200, height: 200, hole: false }] };
  F.registro.set(regiao.uuid, regiao);
  F.emitidos.length = 0;
  await EXECUTAR.escada({ chegada: regiao.uuid, quem: "jogadores", tela: "semTela" }, { cena: cenaEscada, token: ta, userId: "ana" });
  const fins = F.emitidos.filter(e => e.acao === "efeito" && e.efeito.tipo === "escada" && e.efeito.fase === "fim");
  const porUsuario = {};
  for (const e of fins) for (const id of e.userIds) (porUsuario[id] ??= []).push(e.efeito);
  assert.deepEqual(Object.keys(porUsuario).sort(), ["ana", "beto"]);
  assert.equal(porUsuario.ana.length, 1, "Ana recebe um só 'fim'");
  assert.equal(porUsuario.beto.length, 1, "Beto recebe um só 'fim'");
  assert.equal(porUsuario.ana[0].token, "ta", "a câmera da Ana vai para o token dela");
  assert.equal(porUsuario.beto[0].token, "tb2", "a do Beto, para o dele");
  assert.notDeepEqual([porUsuario.ana[0].x, porUsuario.ana[0].y], [porUsuario.beto[0].x, porUsuario.beto[0].y], "chegam em casas diferentes");
});

test("diário 'só mostrar': manda o texto, sem mexer na permissão do documento", async () => {
  comoMestre();
  let permissaoMudou = false;
  const entrada = { documentName: "JournalEntry", uuid: "JournalEntry.j1", name: "Carta", pages: [{ name: "Única", type: "text", text: { content: "<p>Olá</p>" } }],
    testUserPermission: () => false, async update() { permissaoMudou = true; } };
  F.registro.set(entrada.uuid, entrada);
  F.ana.viewedScene = "c1";
  F.emitidos.length = 0;
  await EXECUTAR.diario({ diario: entrada.uuid, para: "mapa", acesso: "temporario" }, { cena: F.cena, token: null, userId: "gm" });
  const ef = F.emitidos.find(e => e.acao === "efeito" && e.efeito.tipo === "diarioTexto");
  assert.ok(ef, "efeito de texto enviado");
  assert.match(ef.efeito.html, /Olá/);
  assert.equal(permissaoMudou, false);
  // modo padrão continua dando permissão
  await EXECUTAR.diario({ diario: entrada.uuid, para: "mapa", acesso: "permanente" }, { cena: F.cena, token: null, userId: "gm" });
  assert.equal(permissaoMudou, true);
});

test("socket: erro dentro de um pedido não derruba o canal (fica no console)", async () => {
  comoMestre();
  const d = F.tile("quebrado", objeto({}));
  const avisos = [];
  const original = console.error; console.error = (...a) => avisos.push(a);
  // um objeto cuja configuração explode ao ser lida
  Object.defineProperty(d, "getFlag", { value: () => { throw new Error("boom"); }, configurable: true });
  await assert.doesNotReject(F.socket({ acao: "usar", uuid: d.uuid }, "ana"));
  console.error = original;
  assert.ok(avisos.some(a => String(a[0]).includes("falha ao tratar")), "a falha foi registrada com a ação e quem pediu");
});
