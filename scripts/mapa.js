// Mapa interativo: botões em cima das cidades que levam os jogadores ao mapa delas, o botão
// "Voltar ao mapa", o cadeado à vista nos objetos trancados, a névoa que cobre só os lugares
// trancados e as regiões de névoa densa. Tudo aqui é desenhado uma vez e só é refeito quando algo muda.
import { efeito } from "./estados.js";
import { regioesDensas, veNaNevoa, poligonosDe, dentroDe } from "./nevoa-densa.js";
import { ASSETS, ID, cfgDe, corHex, emitir, esc, estaTrancado, icone, nevoaCfg, souMestreAtivo, t } from "./nucleo.js";

// ---------- Voltar ao mapa
// O mapa de destino guarda de onde a pessoa veio: flags.objetos-vivos.volta = { cena, grupo }
export function voltaDe(cena) {
  const v = cena?.getFlag?.(ID, "volta");
  return v?.cena && game.scenes.get(v.cena) ? v : null;
}

// Quem vai junto numa viagem (ids de usuários). O mestre só vai se foi ele quem usou.
export function quemViaja(quem, ctx) {
  const ids = new Set();
  const ativos = game.users.filter(u => u.active);
  if (quem === "quemUsou") {
    const ator = ctx.token?.actor;
    if (ator) for (const u of ativos) if (!u.isGM && ator.testUserPermission?.(u, "OWNER")) ids.add(u.id);
  } else {
    for (const u of ativos) if (!u.isGM && (quem === "todosJogadores" || u.viewedScene === ctx.cena?.id)) ids.add(u.id);
  }
  if (ctx.userId && game.users.get(ctx.userId)?.active) ids.add(ctx.userId);
  return [...ids];
}

// O jogador clicou em "Voltar ao mapa": o mestre confere e leva (ele, ou o grupo todo se foram juntos)
export function receberVolta(data, remetente) {
  const cena = game.scenes.get(data?.cena);
  const v = voltaDe(cena);
  if (!v) return;
  if (!remetente.isGM && remetente.viewedScene !== cena.id) return;
  const ids = v.grupo ? game.users.filter(u => u.active && !u.isGM && u.viewedScene === cena.id).map(u => u.id) : [];
  if (!ids.includes(remetente.id)) ids.push(remetente.id);
  efeito(ids, { tipo: "verCena", cena: v.cena });
}

export async function voltarAoMapa() {
  const v = voltaDe(canvas.scene);
  if (!v) return;
  // O mestre volta sozinho (para levar o grupo, use a ação ou o "Puxar para a cena" do Foundry)
  if (game.user.isGM || !game.users.activeGM) return game.scenes.get(v.cena)?.view();
  if (souMestreAtivo()) return receberVolta({ cena: canvas.scene.id }, game.user);
  emitir({ acao: "voltar", cena: canvas.scene.id });
}

export function botaoVolta() {
  let el = document.getElementById("ov-voltar");
  const v = canvas.ready ? voltaDe(canvas.scene) : null;
  if (!v) { el?.remove(); return; }
  if (!el) {
    el = document.createElement("button");
    el.id = "ov-voltar";
    el.type = "button";
    el.addEventListener("click", ev => { ev.preventDefault(); voltarAoMapa(); });
    document.body.append(el);
  }
  const alvo = game.scenes.get(v.cena);
  el.innerHTML = `${icone("fa-map")} <span>${esc(t("Mapa.Voltar", { mapa: alvo.navName || alvo.name }))}</span>`;
  el.dataset.tooltip = t(game.user.isGM ? "Mapa.VoltarMestre" : v.grupo ? "Mapa.VoltarGrupo" : "Mapa.VoltarSo");
}

// ---------- Névoa e cadeados
// O mapa fica à vista. A névoa cobre só os lugares marcados com "Cobrir com névoa" enquanto estiverem
// trancados (ou escondidos): uma mancha em cima do objeto, do tamanho dele mais "raio" casas em volta.
// Liberou o lugar, a mancha some.

// Raio (em pixels) da mancha de névoa de um objeto: o tamanho dele mais "raio" casas em volta
export function raioRevelado(doc, c, gs) {
  return Math.max(doc.width, doc.height) / 2 + Math.max(0, Number(c?.raio) || 0) * gs;
}
// O lugar está liberado? (marcado para névoa, destrancado e à vista): fica sem névoa e ganha o brilho
export function abreNevoa(o, c = cfgDe(o.document)) {
  return !!c?.revela && !o.document.hidden && !estaTrancado(o.document, c);
}
// A névoa cobre este objeto? (marcado para névoa e ainda trancado ou escondido)
export function cobreNevoa(o, c = cfgDe(o.document)) {
  return !!c?.revela && !abreNevoa(o, c);
}
// As manchas a desenhar: centro, raio de fora (onde a névoa termina) e miolo (onde ela é inteira).
// A borda esfumaçada fica dentro das casas pedidas, mas o miolo nunca é menor que o próprio objeto.
export function manchasDaNevoa(objetos, gs, borda = 50) {
  const suave = Math.min(100, Math.max(0, Number(borda) || 0)) / 100;
  return objetos.map(o => {
    const d = o.document;
    const r = raioRevelado(d, cfgDe(d), gs), metade = Math.max(d.width, d.height) / 2;
    return { cx: d.x + d.width / 2, cy: d.y + d.height / 2, r, miolo: Math.min(r, Math.max(metade, r * (1 - 0.6 * suave))) };
  });
}
// O cadeado aparece? (trancado; para os jogadores, só se o objeto não estiver escondido)
export function mostraCadeado(o, c = cfgDe(o.document)) {
  if (!c?.cadeado || !estaTrancado(o.document, c)) return false;
  return game.user.isGM || !o.document.hidden;
}

let camada = null, quadroMapa = 0, densaNaCena = false;
// Há região de névoa densa no mapa aberto? (para os ganchos de ficha e token só redesenharem quando precisa)
export const temNevoaDensa = () => densaNaCena;
export function atualizarMapa() {
  if (quadroMapa || !canvas.ready) return;
  quadroMapa = requestAnimationFrame(() => { quadroMapa = 0; try { desenharMapa(); } catch (err) { console.warn(`${ID} | mapa interativo`, err); } });
}
export function soltarMapa() {
  if (quadroMapa) cancelAnimationFrame(quadroMapa);
  quadroMapa = 0;
  if (camada && !camada.destroyed) {
    if (camada._ovNevoa && !camada._ovNevoa.destroyed) camada._ovNevoa.destroy({ texture: true, baseTexture: true });
    camada.destroy({ children: true });
  }
  camada = null;
}

function desenharMapa() {
  if (!globalThis.PIXI || !canvas.ready) return;
  const objetos = (canvas.tiles?.placeables ?? []).filter(o => !o.destroyed && cfgDe(o.document));
  const cobertos = objetos.filter(o => cobreNevoa(o));
  const liberados = objetos.filter(o => abreNevoa(o));
  const cadeados = objetos.filter(o => mostraCadeado(o));
  const densas = regioesDensas(canvas.scene);
  densaNaCena = densas.length > 0;
  soltarMapa();
  if (!cobertos.length && !liberados.length && !cadeados.length && !densas.length) return;
  camada = new PIXI.Container();
  camada.eventMode = "none";
  camada.interactiveChildren = false;
  for (const d of densas) { const g = desenharDensa(d); if (g) camada.addChild(g); }
  const nevoa = desenharNevoa(cobertos, liberados);
  if (nevoa) { camada._ovNevoa = nevoa; camada.addChild(nevoa); }
  const tex = PIXI.Texture.from(`${ASSETS}/cadeado.svg`);
  const gs = canvas.dimensions.size;
  for (const o of cadeados) {
    const d = o.document;
    const lado = Math.min(gs * 1.2, Math.max(28, Math.min(d.width, d.height) * 0.55));
    const s = new PIXI.Sprite(tex);
    s.anchor.set(0.5);
    s.width = s.height = lado;
    s.position.set(d.x + d.width / 2, d.y + d.height / 2);
    s.alpha = game.user.isGM && d.hidden ? 0.5 : 0.95;
    camada.addChild(s);
  }
  if (!camada.children.length) return soltarMapa();
  (canvas.interface ?? canvas.controls)?.addChild(camada);
}

// A névoa é desenhada uma vez numa imagem pequena (no máximo 2048 px) e esticada sobre o mapa:
// nenhum filtro, nenhum trabalho por quadro. A imagem começa transparente (o mapa aparece) e só
// recebe as manchas dos lugares trancados, com borda suave.
function desenharNevoa(cobertos, liberados) {
  const n = nevoaCfg();
  const comBrilho = n.brilho > 0 && liberados.length > 0;
  if (!cobertos.length && !comBrilho) return null;
  const dims = canvas.dimensions;
  const W = dims.width, H = dims.height, gs = dims.size;
  const k = Math.min(1, 2048 / Math.max(W, H));
  const rt = PIXI.RenderTexture.create({ width: Math.ceil(W * k), height: Math.ceil(H * k) });
  const manchas = new PIXI.Graphics();
  // borda: 0 = corte seco, 100 = bem esfumaçada (anéis de fora para dentro, cada um cobre um pouco mais)
  const ANEIS = 8, cor = corHex(n.cor);
  for (const { cx, cy, r, miolo } of manchasDaNevoa(cobertos, gs, n.borda)) {
    if (r > miolo) for (let i = ANEIS; i >= 1; i--) manchas.beginFill(cor, 0.22).drawCircle(cx, cy, miolo + (r - miolo) * i / ANEIS).endFill();
    manchas.beginFill(cor, 1).drawCircle(cx, cy, miolo).endFill();
  }
  manchas.scale.set(k);
  canvas.app.renderer.render(manchas, { renderTexture: rt, clear: true });
  manchas.destroy();
  // brilho mágico: um halo da cor escolhida em volta de cada lugar liberado
  if (comBrilho) {
    const halo = new PIXI.Graphics();
    const forca = n.brilho / 100, corB = corHex(n.corBrilho), largura = 0.1 + (n.borda / 100) * 0.9;
    for (const { cx, cy, r } of manchasDaNevoa(liberados, gs, n.borda)) {
      for (let i = 1; i <= 5; i++) halo.lineStyle(r * 0.08 * (1 + largura), corB, forca * 0.18 * (1 - i / 6)).drawCircle(cx, cy, r * (1 + largura * 0.35 * i / 5));
    }
    halo.scale.set(k);
    canvas.app.renderer.render(halo, { renderTexture: rt, clear: false });
    halo.destroy();
  }
  const sprite = new PIXI.Sprite(rt);
  sprite.scale.set(1 / k);
  sprite.alpha = (game.user.isGM ? n.opMestre : n.opJog) / 100;
  sprite.eventMode = "none";
  return sprite;
}

// Região de névoa densa: a forma da Região pintada por cima de tudo. Quem tem permissão não vê a névoa;
// o mestre vê bem clara, para saber onde ela está. Só é redesenhada quando a região, a ficha ou os tokens mudam.
function desenharDensa({ regiao, sys }) {
  const mestre = game.user.isGM;
  if (!mestre && veNaNevoa(sys, game.user, canvas.scene)) return null;
  const pols = poligonosDe(regiao);
  const cheios = pols.filter(p => !p.buraco), buracos = pols.filter(p => p.buraco);
  if (!cheios.length) return null;
  const g = new PIXI.Graphics();
  const cor = corHex(sys.cor || "#aeb6c2");
  for (const p of cheios) {
    g.beginFill(cor, 1).drawPolygon(p.pontos);
    for (const b of buracos) if (dentroDe(b.pontos[0], b.pontos[1], p.pontos)) { g.beginHole(); g.drawPolygon(b.pontos); g.endHole(); }
    g.endFill();
  }
  const op = Math.min(100, Math.max(0, Number(sys.opacidade ?? 100))) / 100;
  g.alpha = mestre ? Math.min(0.35, op) : op;
  g.eventMode = "none";
  return g;
}
