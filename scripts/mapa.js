// Mapa interativo: botões em cima das cidades que levam os jogadores ao mapa delas, o botão
// "Voltar ao mapa", o cadeado à vista nos objetos trancados e a névoa que só abre em volta dos
// lugares liberados. Tudo aqui é desenhado uma vez e só é refeito quando um objeto muda.
import { efeito } from "./estados.js";
import { ASSETS, ID, cfgDe, corHex, emitir, esc, escondido, estaTrancado, icone, nevoaCfg, qualidade, souMestreAtivo, t } from "./nucleo.js";
import { nevoasDoMapa, visaoDaNevoa } from "./regiao.js";

// ---------- Voltar ao mapa
// O mapa de destino guarda de onde CADA pessoa veio: flags.objetos-vivos.voltas = { [userId]: { cena, grupo } }.
// Duas viagens de mapas diferentes para o mesmo destino não se atropelam. O mestre, que normalmente
// não viaja, usa a última viagem registrada ("_ultima"). A flag antiga "volta" (uma só por mapa) ainda é lida.
export function voltaDe(cena, user = game.user) {
  const voltas = cena?.getFlag?.(ID, "voltas") ?? {};
  const v = voltas[user?.id] ?? (user?.isGM ? voltas._ultima : null) ?? cena?.getFlag?.(ID, "volta") ?? null;
  return v?.cena && game.scenes.get(v.cena) ? v : null;
}
// Grava a origem de uma viagem para os usuários levados (só muda o que é diferente do que já está)
export async function guardarVolta(destino, ids, volta) {
  const atual = destino.getFlag(ID, "voltas") ?? {};
  const mud = {};
  for (const id of [...ids, "_ultima"]) {
    const a = atual[id];
    if (a?.cena !== volta.cena || !!a?.grupo !== volta.grupo) mud[id] = volta;
  }
  if (Object.keys(mud).length) await destino.setFlag(ID, "voltas", { ...atual, ...mud });
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
  const v = voltaDe(cena, remetente);
  if (!v) return;
  if (!remetente.isGM && remetente.viewedScene !== cena.id) return;
  // em grupo: só volta junto quem está neste mapa E veio do mesmo lugar
  const ids = v.grupo
    ? game.users.filter(u => u.active && !u.isGM && u.viewedScene === cena.id && voltaDe(cena, u)?.cena === v.cena).map(u => u.id)
    : [];
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
    // sempre em cima da lista de jogadores (se ela não existir, canto inferior esquerdo)
    const jogadores = document.getElementById("players");
    if (jogadores) { el.classList.add("ov-na-lista"); jogadores.before(el); } else document.body.append(el);
  }
  const alvo = game.scenes.get(v.cena);
  el.innerHTML = `${icone("fa-map")} <span>${esc(t("Mapa.Voltar", { mapa: alvo.navName || alvo.name }))}</span>`;
  el.dataset.tooltip = t(game.user.isGM ? "Mapa.VoltarMestre" : v.grupo ? "Mapa.VoltarGrupo" : "Mapa.VoltarSo");
}

// ---------- Névoa e cadeados
// Raio (em pixels) que a névoa cobre em volta de um objeto trancado: o tamanho dele mais "raio" casas
export function raioRevelado(doc, c, gs) {
  return Math.max(doc.width, doc.height) / 2 + Math.max(0, Number(c?.raio) || 0) * gs;
}
// A névoa cobre este objeto? (opção ligada, trancado e não escondido). Camuflado também: no mapa
// interativo o botão da cidade pode ser invisível em cima do desenho do próprio mapa.
export function cobreNevoa(o, c = cfgDe(o.document)) {
  return !!c?.revela && !escondido(o.document, c) && estaTrancado(o.document, c);
}
// O cadeado aparece? (trancado; para os jogadores, só se o objeto não estiver escondido)
export function mostraCadeado(o, c = cfgDe(o.document)) {
  if (!c?.cadeado || !estaTrancado(o.document, c)) return false;
  return game.user.isGM || !escondido(o.document, c);
}

let camada = null, quadroMapa = 0;
export function atualizarMapa() {
  if (quadroMapa || !canvas.ready) return;
  quadroMapa = requestAnimationFrame(() => { quadroMapa = 0; try { desenharMapa(); } catch (err) { console.warn(`${ID} | mapa interativo`, err); } });
}
export function soltarMapa() {
  if (quadroMapa) cancelAnimationFrame(quadroMapa);
  quadroMapa = 0;
  pararNuvens();
  if (camada && !camada.destroyed) {
    // as imagens das névoas são soltas à mão; a textura das nuvens é compartilhada e fica
    for (const tex of camada._ovTexturas ?? []) if (!tex.baseTexture?.destroyed) tex.destroy(true);
    camada.destroy({ children: true });
  }
  camada = null;
}

function desenharMapa() {
  if (!globalThis.PIXI || !canvas.ready) return;
  const objetos = (canvas.tiles?.placeables ?? []).filter(o => !o.destroyed && cfgDe(o.document));
  const cobertos = objetos.filter(o => cobreNevoa(o));
  const cadeados = objetos.filter(o => mostraCadeado(o));
  const regioes = nevoasDoMapa().map(n => ({ ...n, visao: visaoDaNevoa(n.dados) })).filter(n => n.visao !== "sim");
  soltarMapa();
  if (!cobertos.length && !cadeados.length && !regioes.length) return;
  camada = new PIXI.Container();
  camada.eventMode = "none";
  camada.interactiveChildren = false;
  camada._ovTexturas = [];
  const nuvens = [];
  const dims = canvas.dimensions, W = dims.width, H = dims.height, gs = dims.size;
  const k = Math.min(1, 2048 / Math.max(W, H));
  // Cidades trancadas: um círculo de névoa em volta de cada uma, com o visual das configurações
  // Mestre: com "Mestre vê através" ligado, a névoa das cidades nem é desenhada para ele (só o cadeado);
  // com a janela de configurações aberta, ele vê como os jogadores, para ajustar o visual
  const n = nevoaCfg();
  const opMestre = nevoaCfg.previa ? n.opJog : n.mestreVe ? 0 : n.opMestre;
  if (cobertos.length && (!game.user.isGM || opMestre > 0)) {
    // se a cidade está dentro de uma Região com névoa densa, o círculo dela não passa da borda da Região
    // Se a Região que contém a cidade já está coberta para este usuário, o círculo dela não é desenhado
    // (senão as duas névoas se somam e a cidade fica mais densa que o resto da Região)
    const todas = nevoasDoMapa();
    const cobertas = new Set(regioes.map(r => r.id));
    const lugares = [];
    for (const o of cobertos) {
      const d = o.document, cx = d.x + d.width / 2, cy = d.y + d.height / 2;
      const dentro = todas.filter(({ regiao }) => regiao.testPoint?.({ x: cx, y: cy }) ?? false);
      if (dentro.some(r => cobertas.has(r.id))) continue;
      const limite = dentro.flatMap(({ regiao }) => formasDaRegiao(regiao).filter(f => !f.hole));
      lugares.push({ cx, cy, r: raioRevelado(d, cfgDe(d), gs), limite: limite.length ? limite : null });
    }
    if (lugares.length) {
      const tex = PIXI.Texture.from(imagemNevoa(n, W, H, k, lugares));
      camada._ovTexturas.push(tex);
      camada.addChild(montarNevoa(tex, n, (game.user.isGM ? opMestre : n.opJog) / 100, W, H, gs, nuvens));
    }
  }
  // Regiões com "Névoa densa": o mesmo visual das cidades (configurações do módulo) ou um visual próprio
  for (const { regiao, dados, visao } of regioes) {
    const formas = formasDaRegiao(regiao);
    if (!formas.length) continue;
    const proprio = !!dados.visualProprio;
    const look = proprio
      ? { cor: dados.cor, borda: dados.borda, brilho: dados.brilho, corBrilho: dados.corBrilho, animada: dados.viva, densidade: dados.densidade, velocidade: dados.velocidade }
      : n;
    let opacidade = (proprio ? dados.opacidade : n.opJog) / 100;
    if (visao === "mestre") opacidade = (proprio ? dados.opacidade * 0.45 : (nevoaCfg.previa ? n.opJog : n.opMestre)) / 100;
    if (opacidade <= 0) continue;
    const tex = PIXI.Texture.from(imagemNevoa(look, W, H, k, [{ formas }]));
    camada._ovTexturas.push(tex);
    camada.addChild(montarNevoa(tex, look, opacidade, W, H, gs, nuvens));
  }
  if (nuvens.length) ligarNuvens(nuvens);
  const tex = PIXI.Texture.from(`${ASSETS}/cadeado.svg`);
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
  (canvas.interface ?? canvas.controls)?.addChild(camada);
}

// Uma névoa já desenhada numa imagem vira a camada no mapa: a imagem parada e, com "Névoa viva"
// ligada (e qualidade Completa), duas camadas de nuvens deslizando por cima, recortadas pela mesma
// imagem. Só muda a posição das nuvens a cada quadro, nada é redesenhado.
function montarNevoa(tex, look, opacidade, W, H, gs, nuvens) {
  const grupo = new PIXI.Container();
  grupo.eventMode = "none";
  const base = new PIXI.Sprite(tex);
  base.width = W; base.height = H;
  base.eventMode = "none";
  grupo.addChild(base);
  const viva = look.animada && qualidade() === "completa" && PIXI.TilingSprite;
  if (!viva) { base.alpha = opacidade; return grupo; }
  const densidade = (Number(look.densidade) || 0) / 100;
  // a base continua opaca (é o que esconde); as nuvens dão o movimento por cima dela
  base.alpha = opacidade;
  const cont = new PIXI.Container();
  const mascara = new PIXI.Sprite(tex);
  mascara.width = W; mascara.height = H;
  cont.mask = mascara;
  cont.addChild(mascara);
  const cor = corHex(look.cor);
  const vel = 0.15 + ((Number(look.velocidade) || 0) / 100) * 1.1;
  // uma camada clara e uma escura, em sentidos diferentes: parece bruma rolando
  for (const c of [
    { escala: 2.6 * gs / 100, alpha: 0.8 * densidade * opacidade, tint: clarear(cor, 0.55), dx: 0.18, dy: 0.07 },
    { escala: 1.4 * gs / 100, alpha: 0.55 * densidade * opacidade, tint: escurecer(cor, 0.35), dx: -0.12, dy: 0.14 },
    { escala: 0.9 * gs / 100, alpha: 0.35 * densidade * opacidade, tint: clarear(cor, 0.85), dx: 0.07, dy: -0.1 }
  ]) {
    const sp = new PIXI.TilingSprite(texturaNuvens(), W, H);
    sp.tileScale.set(c.escala);
    sp.tint = c.tint;
    sp.alpha = c.alpha;
    sp.eventMode = "none";
    sp._ovDeriva = { dx: c.dx * vel, dy: c.dy * vel };
    cont.addChild(sp);
    nuvens.push(sp);
  }
  grupo.addChild(cont);
  return grupo;
}

// Formas de uma Região (retângulos, elipses e polígonos, com os buracos)
export function formasDaRegiao(regiao) {
  const lista = [];
  for (const f of regiao?.shapes ?? []) {
    const tipo = f.type;
    if (tipo === "rectangle") lista.push({ tipo, hole: !!f.hole, x: f.x, y: f.y, w: f.width, h: f.height, rot: f.rotation || 0 });
    else if (tipo === "ellipse") lista.push({ tipo, hole: !!f.hole, x: f.x, y: f.y, rx: f.radiusX, ry: f.radiusY, rot: f.rotation || 0 });
    else if (tipo === "polygon" && f.points?.length >= 6) lista.push({ tipo, hole: !!f.hole, pontos: [...f.points] });
  }
  return lista;
}
// Limita o desenho às formas dadas (a borda de uma Região)
function recortar(ctx, formas) {
  const caminho = new Path2D();
  for (const f of formas) {
    if (f.tipo === "polygon") { caminho.moveTo(f.pontos[0], f.pontos[1]); for (let i = 2; i < f.pontos.length; i += 2) caminho.lineTo(f.pontos[i], f.pontos[i + 1]); caminho.closePath(); continue; }
    const cx = f.tipo === "rectangle" ? f.x + f.w / 2 : f.x, cy = f.tipo === "rectangle" ? f.y + f.h / 2 : f.y;
    const m = new DOMMatrix().translate(cx, cy).rotate(f.rot || 0);
    const p = new Path2D();
    if (f.tipo === "rectangle") p.rect(-f.w / 2, -f.h / 2, f.w, f.h); else p.ellipse(0, 0, f.rx, f.ry, 0, 0, Math.PI * 2);
    caminho.addPath(p, m);
  }
  ctx.clip(caminho);
}
function tracarForma(ctx, f) {
  ctx.beginPath();
  if (f.tipo === "polygon") { ctx.moveTo(f.pontos[0], f.pontos[1]); for (let i = 2; i < f.pontos.length; i += 2) ctx.lineTo(f.pontos[i], f.pontos[i + 1]); ctx.closePath(); return; }
  const cx = f.tipo === "rectangle" ? f.x + f.w / 2 : f.x, cy = f.tipo === "rectangle" ? f.y + f.h / 2 : f.y;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate((f.rot * Math.PI) / 180);
  if (f.tipo === "rectangle") ctx.rect(-f.w / 2, -f.h / 2, f.w, f.h); else ctx.ellipse(0, 0, f.rx, f.ry, 0, 0, Math.PI * 2);
  ctx.restore();
}

// A imagem da névoa: transparente, com a cor só nos lugares cobertos (círculos em volta de objetos
// ou formas de uma Região), borda esfumaçada e o halo. Canvas 2D porque o resultado é o mesmo em
// qualquer placa de vídeo (sem depender de modos de mistura do PIXI). Feita uma vez, nunca por quadro.
export function imagemNevoa(n, W, H, k, lugares) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(W * k)); cv.height = Math.max(1, Math.ceil(H * k));
  const ctx = cv.getContext("2d");
  ctx.scale(k, k);
  const largura = 0.1 + ((Number(n.borda) || 0) / 100) * 0.9; // 0 = corte seco, 100 = bem esfumaçada
  const cor = corCss(n.cor);
  const comFormas = lugares.filter(l => l.formas), comCirculo = lugares.filter(l => !l.formas);
  for (const { cx, cy, r, limite } of comCirculo) {
    const fim = r * (1 + largura);
    ctx.save();
    if (limite) { recortar(ctx, limite); }
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fim);
    // sólido até o raio pedido (não dá para ver nada), depois esfuma até a borda
    g.addColorStop(0, cor); g.addColorStop(Math.min(0.999, r / fim), cor); g.addColorStop(Math.min(0.9995, (r + (fim - r) * 0.5) / fim), rgba(n.cor, 0.6)); g.addColorStop(1, rgba(n.cor, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - fim, cy - fim, fim * 2, fim * 2);
    ctx.restore();
  }
  // Regiões: o formato desenhado no mapa, com a borda esfumaçada por desfoque
  const desfoque = Math.round(largura * 40 / k);
  const temFiltro = "filter" in ctx;
  for (const { formas } of comFormas) {
    ctx.save();
    if (temFiltro && desfoque > 0) ctx.filter = `blur(${desfoque}px)`;
    ctx.fillStyle = cor;
    for (const f of formas.filter(f => !f.hole)) { tracarForma(ctx, f); ctx.fill(); }
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (const f of formas.filter(f => f.hole)) { tracarForma(ctx, f); ctx.fillStyle = "#000"; ctx.fill(); }
    ctx.restore();
  }
  // brilho mágico: um halo da cor escolhida na borda de cada lugar coberto
  const forca = (Number(n.brilho) || 0) / 100;
  if (forca > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "source-atop";
    for (const { cx, cy, r, limite } of comCirculo) {
      if (limite) { ctx.save(); recortar(ctx, limite); }
      const g = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r * (1 + largura * 0.6));
      g.addColorStop(0, rgba(n.corBrilho, 0)); g.addColorStop(0.5, rgba(n.corBrilho, forca)); g.addColorStop(1, rgba(n.corBrilho, 0));
      ctx.fillStyle = g;
      const fim = r * (1 + largura);
      ctx.fillRect(cx - fim, cy - fim, fim * 2, fim * 2);
      if (limite) ctx.restore();
    }
    if (temFiltro) ctx.filter = `blur(${Math.max(2, Math.round(desfoque * 0.6))}px)`;
    ctx.strokeStyle = rgba(n.corBrilho, forca); ctx.lineWidth = Math.max(6, desfoque * 1.2);
    for (const { formas } of comFormas) for (const f of formas.filter(f => !f.hole)) { tracarForma(ctx, f); ctx.stroke(); }
    ctx.restore();
  }
  return cv;
}
const corCss = c => `#${corHex(c).toString(16).padStart(6, "0")}`;
const rgba = (hex, a) => { const c = corHex(hex); return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`; };

// Deslizar das nuvens: o único trabalho por quadro é somar dois números por camada
let tickNuvens = null;
function ligarNuvens(camadas) {
  pararNuvens();
  tickNuvens = dt => { for (const sp of camadas) { if (sp.destroyed) continue; sp.tilePosition.x += sp._ovDeriva.dx * dt; sp.tilePosition.y += sp._ovDeriva.dy * dt; } };
  canvas.app.ticker.add(tickNuvens);
}
function pararNuvens() { if (tickNuvens) { canvas.app?.ticker?.remove(tickNuvens); tickNuvens = null; } }

// Textura de nuvens, feita uma vez (manchas suaves num quadrado que emenda nas bordas)
let texNuvens = null;
function texturaNuvens() {
  if (texNuvens && !texNuvens.baseTexture?.destroyed) return texNuvens;
  const L = 512, cv = document.createElement("canvas");
  cv.width = cv.height = L;
  const ctx = cv.getContext("2d");
  let semente = 7;
  const rnd = () => { semente = (semente * 16807) % 2147483647; return semente / 2147483647; };
  for (let i = 0; i < 110; i++) {
    const x = rnd() * L, y = rnd() * L, r = 25 + rnd() * 150, a = 0.1 + rnd() * 0.35;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    for (const ox of [-L, 0, L]) for (const oy of [-L, 0, L]) { ctx.save(); ctx.translate(x + ox, y + oy); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); }
  }
  texNuvens = PIXI.Texture.from(cv);
  texNuvens.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  return texNuvens;
}
const escurecer = (cor, f) => { const r = (cor >> 16) & 255, g = (cor >> 8) & 255, b = cor & 255; const m = v => Math.round(v * (1 - f)); return (m(r) << 16) | (m(g) << 8) | m(b); };
const clarear = (cor, f) => { const r = (cor >> 16) & 255, g = (cor >> 8) & 255, b = cor & 255; const m = v => Math.round(v + (255 - v) * f); return (m(r) << 16) | (m(g) << 8) | m(b); };
