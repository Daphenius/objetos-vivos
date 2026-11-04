// Mapa interativo: botões em cima das cidades que levam os jogadores ao mapa delas, o botão
// "Voltar ao mapa", o cadeado à vista nos objetos trancados e a névoa que só abre em volta dos
// lugares liberados. Tudo aqui é desenhado uma vez e só é refeito quando um objeto muda.
import { efeito } from "./estados.js";
import { ASSETS, ID, cfgDe, emitir, esc, estaTrancado, icone, souMestreAtivo, t } from "./nucleo.js";

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
  if (camada && !camada.destroyed) {
    if (camada._ovNevoa && !camada._ovNevoa.destroyed) camada._ovNevoa.destroy({ texture: true, baseTexture: true });
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
    if (nevoa) { camada._ovNevoa = nevoa; camada.addChild(nevoa); }
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

// A névoa é desenhada uma vez numa imagem pequena (no máximo 2048 px) e esticada sobre o mapa:
// nenhum filtro, nenhum trabalho por quadro. Os lugares liberados são "apagados" com borda suave.
function desenharNevoa(liberados) {
  const apagar = PIXI.BLEND_MODES?.ERASE;
  if (apagar === undefined) return null;
  const dims = canvas.dimensions;
  const W = dims.width, H = dims.height, gs = dims.size;
  const k = Math.min(1, 2048 / Math.max(W, H));
  const rt = PIXI.RenderTexture.create({ width: Math.ceil(W * k), height: Math.ceil(H * k) });
  const fundo = new PIXI.Graphics();
  fundo.beginFill(0x0c0f17, 1).drawRect(0, 0, W, H).endFill();
  fundo.scale.set(k);
  canvas.app.renderer.render(fundo, { renderTexture: rt, clear: true });
  fundo.destroy();
  if (liberados.length) {
    const furos = new PIXI.Graphics();
    furos.blendMode = apagar;
    const ANEIS = 6;
    for (const o of liberados) {
      const d = o.document;
      const cx = d.x + d.width / 2, cy = d.y + d.height / 2;
      const r = raioRevelado(d, cfgDe(d), gs);
      // borda suave: anéis cada vez menores, cada um apaga um pouco mais; no meio, tudo limpo
      for (let i = ANEIS; i >= 1; i--) furos.beginFill(0xffffff, 0.3).drawCircle(cx, cy, r * (1 + 0.5 * i / ANEIS)).endFill();
      furos.beginFill(0xffffff, 1).drawCircle(cx, cy, r).endFill();
    }
    furos.scale.set(k);
    canvas.app.renderer.render(furos, { renderTexture: rt, clear: false });
    furos.destroy();
  }
  const sprite = new PIXI.Sprite(rt);
  sprite.scale.set(1 / k);
  sprite.alpha = game.user.isGM ? 0.4 : 0.94;
  sprite.eventMode = "none";
  return sprite;
}
