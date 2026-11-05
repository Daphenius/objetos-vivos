// Mapa interativo: botões em cima das cidades que levam os jogadores ao mapa delas, o botão
// "Voltar ao mapa" e o cadeado à vista nos objetos trancados. Os cadeados são desenhados uma vez
// e só são refeitos quando um objeto muda.
import { efeito } from "./estados.js";
import { ASSETS, ID, cfgDe, emitir, esc, escondido, estaTrancado, icone, souMestreAtivo, t } from "./nucleo.js";

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

// ---------- Cadeados
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
  if (camada && !camada.destroyed) camada.destroy({ children: true });
  camada = null;
}

function desenharMapa() {
  if (!globalThis.PIXI || !canvas.ready) return;
  const cadeados = (canvas.tiles?.placeables ?? []).filter(o => !o.destroyed && cfgDe(o.document) && mostraCadeado(o));
  soltarMapa();
  if (!cadeados.length) return;
  camada = new PIXI.Container();
  camada.eventMode = "none";
  camada.interactiveChildren = false;
  const gs = canvas.dimensions.size;
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
