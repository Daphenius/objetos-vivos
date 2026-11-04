import { teleportados } from "./estados.js";
import { ID, abrirEditor, cfgDe, cruza, distanciaAoTile, ehObjeto, emitir, fechaduraTrancada, gazua, mesmoNivel, noTile, objetosDe, souMestreAtivo, t, testeDe } from "./nucleo.js";
import { escolherArmadilha, eventoParede, pedirUso, usarObjeto } from "./testes.js";
import { atualizarBrilho, camuflado } from "./visual.js";

// No mapa: clique, mãozinha e brilho
export const CONTROLE = "objetos-vivos";
// A ferramenta "Objetos Vivos" está aberta na barra da esquerda? (aí o clique edita em vez de usar)
export const naFerramenta = () => (ui.controls?.control?.name ?? ui.controls?.activeControl) === CONTROLE;
// O mestre usa os objetos com um clique simples quando está na camada de tokens (como os jogadores)
export const mestrePodeUsar = () => !!canvas.tokens?.active;
export function ehUsavel(o) {
  const c = cfgDe(o.document);
  if (!c) return false;
  if (game.user.isGM) return true;
  if (o.document.hidden) return false;
  const armadilha = testeDe(c).modo === "desarmar" && !c.desarmado;
  // Camuflado: armadilha não responde ao clique (não entrega que está ali); botão secreto de clicar, sim
  if (camuflado(o)) return !armadilha && c.interacao === "clicar";
  if (armadilha) return true;
  if (fechaduraTrancada(o.document)) return true;
  return c.interacao === "clicar";
}
// A lista de objetos usáveis do mapa fica guardada e só é refeita quando um tile muda (antes era
// refeita a cada movimento do mouse, percorrendo todos os tiles do mapa)
let cacheUsaveis = null;
export const esquecerUsaveis = () => { cacheUsaveis = null; };
export const usaveis = () => (cacheUsaveis ??= (canvas.tiles?.placeables ?? []).filter(ehUsavel));
const noTopo = lista => lista.length > 1 ? lista.sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0] : lista[0] ?? null;
export const tileNoPonto = p => noTopo((canvas.tiles?.placeables ?? []).filter(o => o.visible !== false && noTile(o.document, p)));
export const objetoNoPonto = p => noTopo(usaveis().filter(o => !o.destroyed && o.visible !== false && noTile(o.document, p)));
export const pontoDoMouse = (x, y) => canvas.canvasCoordinatesFromClient?.({ x, y }) ?? canvas.stage.worldTransform.applyInverse({ x, y });
export function meusTokens() {
  return (canvas.tokens?.placeables ?? []).filter(tk => tk.isOwner && (game.user.isGM ? tk.controlled : true));
}
export function maisPerto(doc) {
  const gs = canvas.dimensions.size;
  let perto = null, dist = Infinity;
  for (const tk of meusTokens()) { const d = distanciaAoTile(doc, tk.center, gs); if (d < dist) { dist = d; perto = tk; } }
  return { perto, dist };
}

export function ligarMapa() {
  const view = canvas.app?.view;
  if (!view || view._ovLigado) return;
  view._ovLigado = true;
  let ini = null;
  view.addEventListener("pointerdown", ev => { ini = ev.button === 0 ? { x: ev.clientX, y: ev.clientY, t: Date.now() } : null; });
  view.addEventListener("pointerup", async ev => {
    const i = ini;
    ini = null;
    if (!i || ev.button !== 0 || Math.hypot(ev.clientX - i.x, ev.clientY - i.y) > 6 || Date.now() - i.t > 500) return;
    const p = pontoDoMouse(ev.clientX, ev.clientY);
    // Mestre: na ferramenta Objetos Vivos o clique abre o editor; na camada de tokens, usa o objeto
    if (game.user.isGM) {
      if (naFerramenta()) { const o = objetoNoPonto(p) ?? tileNoPonto(p); if (o) abrirEditor(o.document); return; }
      if (!mestrePodeUsar() || ev.altKey || ev.shiftKey || ev.ctrlKey) return;
    }
    // Clique em cima de um token é para o token, não para o objeto embaixo dele
    if ((canvas.tokens?.placeables ?? []).some(tk => tk.visible && tk.bounds?.contains?.(p.x, p.y))) return;
    const o = objetoNoPonto(p);
    if (!o) return;
    const doc = o.document, c = cfgDe(doc);
    const { perto, dist } = maisPerto(doc);
    if (!game.user.isGM && c.distancia > 0 && dist > c.distancia) return camuflado(o) ? null : ui.notifications.info(t("Aviso.Longe"));
    const tokenUuid = perto?.document.uuid ?? null;
    // Fechadura da Gazua da Mesa: o jogador abre a janela da fechadura (chave, gazua, teste ou minijogo)
    if (!game.user.isGM && fechaduraTrancada(doc) && !(testeDe(c).modo === "desarmar" && !c.desarmado)) {
      if (!perto) return ui.notifications.warn(t("Aviso.SemToken"));
      return gazua().abrir(doc, perto);
    }
    // Armadilha: o clique oferece "Usar" ou "Tentar desarmar" (numa placa de pisar, o clique é só desarmar)
    if (testeDe(c).modo === "desarmar" && !c.desarmado) {
      const escolha = await escolherArmadilha(doc, c);
      if (escolha) pedirUso(doc, tokenUuid, { desarmar: escolha === "desarmar" });
      return;
    }
    pedirUso(doc, tokenUuid);
  });
  let quadro = 0;
  view.addEventListener("pointermove", ev => {
    if (quadro) return;
    quadro = requestAnimationFrame(() => {
      quadro = 0;
      const p = pontoDoMouse(ev.clientX, ev.clientY);
      const o = (!game.user.isGM || naFerramenta() || mestrePodeUsar()) ? objetoNoPonto(p) : null;
      const sobre = !!o && (game.user.isGM || (cfgDe(o.document).mao !== false && !camuflado(o)));
      document.body.classList.toggle("ov-mao", sobre);
    });
  });
}
// updateToken: só atualiza o brilho (no máximo uma vez por quadro). Quem dispara pisar/perto/atravessar é o moveToken.
export function aoMoverToken(tk, mud) {
  if (game.user.isGM || !("x" in mud || "y" in mud || "level" in mud)) return;
  if (tk.parent?.id === canvas.scene?.id) atualizarBrilho();
}

// O caminho que o token percorreu nesta movimentação: origem + todos os pontos por onde passou
// (com régua e vários pontos de parada, a placa no meio do caminho também conta)
export function caminhoDoMovimento(tk, movimento) {
  const gs = tk.parent?.dimensions?.size ?? 100;
  const centro = w => ({ x: Number(w.x) + (Number(w.width ?? tk.width) || 1) * gs / 2, y: Number(w.y) + (Number(w.height ?? tk.height) || 1) * gs / 2 });
  const pontos = [];
  if (movimento?.origin && Number.isFinite(Number(movimento.origin.x))) pontos.push(centro(movimento.origin));
  for (const w of movimento?.passed?.waypoints ?? []) if (Number.isFinite(Number(w?.x))) pontos.push(centro(w));
  if (pontos.length < 2 && movimento?.destination) pontos.push(centro(movimento.destination));
  return pontos;
}

// Pontos ao longo do caminho, a cada quarto de casa (para não pular um objeto pequeno no meio de um trecho reto)
export function amostrar(pontos, gs) {
  const out = pontos.length ? [pontos[0]] : [];
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1], b = pontos[i];
    const passos = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (gs / 4)));
    for (let k = 1; k <= passos; k++) out.push({ x: a.x + (b.x - a.x) * k / passos, y: a.y + (b.y - a.y) * k / passos });
  }
  return out;
}

// Em algum momento do caminho a condição passou de "não" para "sim"?
const entrouEm = (pontos, dentro) => {
  let antes = dentro(pontos[0]);
  for (let i = 1; i < pontos.length; i++) { const agora = dentro(pontos[i]); if (agora && !antes) return true; antes = agora; }
  return false;
};

// moveToken: roda em todos os clientes, depois que a movimentação foi gravada; quem age é o mestre ativo
export function aoMovimentoToken(tk, movimento, operacao) {
  if (!souMestreAtivo() || teleportados.has(tk.uuid) || operacao?.ovInterno || movimento?.updateOptions?.ovInterno) return;
  const caminho = caminhoDoMovimento(tk, movimento);
  if (caminho.length < 2) return;
  const gs = tk.parent.dimensions.size;
  const pontos = amostrar(caminho, gs);
  for (const doc of objetosDe(tk.parent)) {
    const c = cfgDe(doc);
    if (doc.documentName === "Wall") {
      if (c.acoes?.atravessar?.length && caminho.some((p, i) => i > 0 && cruza(caminho[i - 1], p, doc.c))) eventoParede(doc, "atravessar", { tokenUuid: tk.uuid });
      continue;
    }
    if (doc.hidden || !mesmoNivel(doc, tk)) continue;
    if (c.interacao === "pisar" && entrouEm(pontos, p => noTile(doc, p))) usarObjeto(doc, { tokenUuid: tk.uuid });
    if (c.interacao === "perto") {
      const alcance = c.distancia > 0 ? c.distancia : 1;
      if (entrouEm(pontos, p => distanciaAoTile(doc, p, gs) <= alcance)) usarObjeto(doc, { tokenUuid: tk.uuid });
    }
  }
}

// Portas: estado anterior (fechar depois de trancada = destrancar)
export const estadosPorta = new Map();
export function lembrarPortas(cena) { for (const w of cena?.walls ?? []) if (w.door > 0) estadosPorta.set(w.uuid, w.ds); }

// "Ao tentar abrir trancada": cada controle de porta ganha um ouvinte próprio.
// O módulo não substitui funções do Foundry (nada de prototype nem libWrapper). Isso evita o aviso
// de conflito do libWrapper que aparecia com a Gazua da Mesa e o Arm's Reach; não garante, sozinho,
// que nenhum outro módulo vá se estranhar com ele.
export function aoClicarPorta(ev) {
  try {
    if ((ev?.button ?? 0) !== 0 || game.user.isGM) return;
    const w = this.wall?.document;
    if (!w || !ehObjeto(w) || w.ds !== CONST.WALL_DOOR_STATES.LOCKED) return;
    if (souMestreAtivo()) eventoParede(w, "tentativa", { userId: game.user.id });
    else emitir({ acao: "parede", uuid: w.uuid, momento: "tentativa" });
  } catch (err) { console.warn(`${ID} |`, err); }
}
export function ouvirPorta(dc) {
  if (!dc || dc.destroyed || dc._ovOuvindo || typeof dc.on !== "function") return;
  dc._ovOuvindo = true;
  dc.on("pointerdown", aoClicarPorta);
}
export function ouvirTentativas() {
  for (const dc of canvas.controls?.doors?.children ?? []) ouvirPorta(dc);
  for (const w of canvas.walls?.placeables ?? []) ouvirPorta(w.doorControl);
}
