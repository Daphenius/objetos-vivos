// Mapa interativo: botões em cima das cidades que levam os jogadores ao mapa delas, o botão
// "Voltar ao mapa", o cadeado à vista nos objetos trancados e a névoa que só abre em volta dos
// lugares liberados. Tudo aqui é desenhado uma vez e só é refeito quando um objeto muda.
import { efeito } from "./estados.js";
import { ASSETS, ID, cfgDe, corHex, emitir, esc, estaTrancado, icone, nevoaCfg, qualidade, souMestreAtivo, t } from "./nucleo.js";

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
// Raio (em pixels) que um objeto abre na névoa: o tamanho dele mais "raio" casas em volta
export function raioRevelado(doc, c, gs) {
  return Math.max(doc.width, doc.height) / 2 + Math.max(0, Number(c?.raio) || 0) * gs;
}
// O objeto abre a névoa? (liberado e não escondido). Camuflado também abre: no mapa interativo o
// botão da cidade pode ser invisível em cima do desenho do próprio mapa.
export function abreNevoa(o, c = cfgDe(o.document)) {
  return !!c?.revela && !o.document.hidden && !estaTrancado(o.document, c);
}
// O cadeado aparece? (trancado; para os jogadores, só se o objeto não estiver escondido)
export function mostraCadeado(o, c = cfgDe(o.document)) {
  if (!c?.cadeado || !estaTrancado(o.document, c)) return false;
  return game.user.isGM || !o.document.hidden;
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
    // a imagem da névoa é solta à mão; a textura das nuvens é compartilhada e fica
    if (camada._ovRt && !camada._ovRt.baseTexture?.destroyed) camada._ovRt.destroy(true);
    camada.destroy({ children: true });
  }
  camada = null;
}

function desenharMapa() {
  if (!globalThis.PIXI || !canvas.ready) return;
  const objetos = (canvas.tiles?.placeables ?? []).filter(o => !o.destroyed && cfgDe(o.document));
  const temNevoa = objetos.some(o => cfgDe(o.document).revela);
  const cadeados = objetos.filter(o => mostraCadeado(o));
  soltarMapa();
  if (!temNevoa && !cadeados.length) return;
  camada = new PIXI.Container();
  camada.eventMode = "none";
  camada.interactiveChildren = false;
  if (temNevoa) {
    const nevoa = desenharNevoa(objetos.filter(o => abreNevoa(o)));
    if (nevoa) { camada._ovRt = nevoa._ovRt; camada.addChild(nevoa); }
  }
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
  (canvas.interface ?? canvas.controls)?.addChild(camada);
}

// A névoa é desenhada uma vez, numa imagem comum (canvas 2D, no máximo 2048 px) esticada sobre o
// mapa: nenhum filtro, nenhum trabalho por quadro. Os lugares liberados são furados com borda suave.
// Com "Névoa viva" ligada (e qualidade Completa), duas camadas de nuvens deslizam por cima,
// recortadas pela mesma imagem: só muda a posição das nuvens a cada quadro, nada é redesenhado.
function desenharNevoa(liberados) {
  const n = nevoaCfg();
  const dims = canvas.dimensions;
  const W = dims.width, H = dims.height, gs = dims.size;
  const k = Math.min(1, 2048 / Math.max(W, H));
  const lugares = liberados.map(o => { const d = o.document; return { cx: d.x + d.width / 2, cy: d.y + d.height / 2, r: raioRevelado(d, cfgDe(d), gs) }; });
  const cv = imagemNevoa(n, W, H, k, lugares);
  const tex = PIXI.Texture.from(cv);
  const opacidade = (game.user.isGM ? n.opMestre : n.opJog) / 100;
  const grupo = new PIXI.Container();
  grupo._ovRt = tex;
  grupo.eventMode = "none";
  const base = new PIXI.Sprite(tex);
  base.width = W; base.height = H;
  base.eventMode = "none";
  grupo.addChild(base);
  const viva = n.animada && qualidade() === "completa" && PIXI.TilingSprite;
  if (!viva) { base.alpha = opacidade; return grupo; }
  // Névoa viva: a base fica um pouco mais clara e as nuvens completam a densidade
  const densidade = n.densidade / 100;
  base.alpha = opacidade * (1 - 0.45 * densidade);
  const nuvens = new PIXI.Container();
  const mascara = new PIXI.Sprite(tex);
  mascara.width = W; mascara.height = H;
  nuvens.mask = mascara;
  nuvens.addChild(mascara);
  const tom = clarear(corHex(n.cor), 0.35);
  const vel = 0.15 + (n.velocidade / 100) * 1.1;
  const camadas = [
    { escala: 2.2 * gs / 100, alpha: 0.55 * densidade * opacidade, dx: 0.18, dy: 0.07 },
    { escala: 1.3 * gs / 100, alpha: 0.4 * densidade * opacidade, dx: -0.11, dy: 0.13 }
  ].map(c => {
    const sp = new PIXI.TilingSprite(texturaNuvens(), W, H);
    sp.tileScale.set(c.escala);
    sp.tint = tom;
    sp.alpha = c.alpha;
    sp.eventMode = "none";
    sp._ovDeriva = { dx: c.dx * vel, dy: c.dy * vel };
    nuvens.addChild(sp);
    return sp;
  });
  grupo.addChild(nuvens);
  ligarNuvens(camadas);
  return grupo;
}

// A imagem da névoa: cor por cima de tudo, furos com borda suave nos lugares liberados e o halo.
// Canvas 2D porque o resultado é o mesmo em qualquer placa de vídeo (sem depender de modos de mistura do PIXI).
export function imagemNevoa(n, W, H, k, lugares) {
  const cv = document.createElement("canvas");
  cv.width = Math.max(1, Math.ceil(W * k)); cv.height = Math.max(1, Math.ceil(H * k));
  const ctx = cv.getContext("2d");
  ctx.fillStyle = n.cor;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.scale(k, k);
  // borda: 0 = corte seco, 100 = bem esfumaçada
  const largura = 0.1 + (n.borda / 100) * 0.9;
  ctx.globalCompositeOperation = "destination-out";
  for (const { cx, cy, r } of lugares) {
    const fim = r * (1 + largura);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fim);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(Math.min(0.999, r / fim), "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(cx - fim, cy - fim, fim * 2, fim * 2);
  }
  // brilho mágico: um halo da cor escolhida na borda de cada lugar liberado
  if (n.brilho > 0) {
    ctx.globalCompositeOperation = "source-atop";
    const forca = n.brilho / 100;
    for (const { cx, cy, r } of lugares) {
      const fim = r * (1 + largura * 0.6);
      const g = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, fim);
      g.addColorStop(0, rgba(n.corBrilho, forca));
      g.addColorStop(1, rgba(n.corBrilho, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - fim, cy - fim, fim * 2, fim * 2);
    }
  }
  return cv;
}
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
  for (let i = 0; i < 70; i++) {
    const x = rnd() * L, y = rnd() * L, r = 40 + rnd() * 110, a = 0.12 + rnd() * 0.22;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    // 9 cópias para a textura emendar nas bordas
    for (const ox of [-L, 0, L]) for (const oy of [-L, 0, L]) { ctx.save(); ctx.translate(x + ox, y + oy); ctx.fillRect(-r, -r, r * 2, r * 2); ctx.restore(); }
  }
  texNuvens = PIXI.Texture.from(cv);
  texNuvens.baseTexture.wrapMode = PIXI.WRAP_MODES.REPEAT;
  return texNuvens;
}
const clarear = (cor, f) => { const r = (cor >> 16) & 255, g = (cor >> 8) & 255, b = cor & 255; const m = v => Math.round(v + (255 - v) * f); return (m(r) << 16) | (m(g) << 8) | m(b); };
