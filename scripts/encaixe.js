import { zerarEstado } from "./biblioteca.js";
import { abrirEditor } from "./editor.js";
import { pontoDoMouse } from "./gatilhos.js";
import { ID, clone, decodificar, esc, padrao, t } from "./nucleo.js";
import { VISAO_MAX, desenharVisao, temVisao } from "./visual.js";

// Criar um objeto no mapa: de um modelo pronto, de uma imagem do mestre ou de "Meus objetos"
export async function tamanhoDaImagem(src, gs, pxPorCasa = null) {
  try {
    const carregar = foundry.canvas.loadTexture;
    const tex = await carregar(src);
    const w = tex?.width || gs, h = tex?.height || gs;
    const escala = pxPorCasa ? gs / pxPorCasa : (gs * 1.5) / Math.max(w, h);
    return { w: Math.round(w * escala), h: Math.round(h * escala) };
  } catch { return { w: gs, h: gs }; }
}

// Monta a configuração, a imagem e o tamanho de um objeto novo
export async function prepararObjeto({ preset = null, img = null, salvo = null, pxPorCasa = null } = {}) {
  const gs = canvas.dimensions.size;
  let cfg, w = gs, h = gs;
  if (salvo) {
    cfg = clone(salvo.cfg);
    zerarEstado(cfg);
    w = Math.round((salvo.w || 1) * gs); h = Math.round((salvo.h || 1) * gs);
  } else if (img) {
    cfg = padrao(null, "livre", img);
    cfg.nome = nomeDoArquivo(img);
    ({ w, h } = await tamanhoDaImagem(img, gs, pxPorCasa));
  } else cfg = padrao(null, preset ?? "alavanca");
  const src = cfg.estados?.[0]?.img;
  return src ? { cfg, src, w, h, rotacao: salvo?.rotacao ?? 0 } : null;
}
export const nomeDoArquivo = caminho => decodificar(String(caminho).split("/").pop().replace(/\.[a-z0-9]+$/i, "")).replace(/[-_]+/g, " ").trim();

// Onde o centro do objeto cai: objetos de casas inteiras ocupam casas; os outros encaixam a cada meia casa
export function centroEncaixado(x, y, w, h, livre = false) {
  if (livre) return { x, y };
  const gs = canvas.dimensions.size;
  if (w % gs === 0 && h % gs === 0) {
    return { x: Math.floor((x - w / 2 + gs / 2) / gs) * gs + w / 2, y: Math.floor((y - h / 2 + gs / 2) / gs) * gs + h / 2 };
  }
  const meia = gs / 2;
  return { x: Math.round(x / meia) * meia, y: Math.round(y / meia) * meia };
}

export async function criarObjeto({ preset = null, img = null, salvo = null, pxPorCasa = null, x = null, y = null, rotacao = null, escala = 1, livre = false, pronto = null, visao = null } = {}) {
  if (!game.user.isGM) return;
  const cena = canvas.scene;
  if (!cena) return ui.notifications.warn(t("Bib.SemMapa"));
  const p = pronto ?? await prepararObjeto({ preset, img, salvo, pxPorCasa });
  if (!p) return;
  if (visao) p.cfg.visao = temVisao(visao) ? { x: Math.round(visao.x || 0), y: Math.round(visao.y || 0), espelho: !!visao.espelho } : null;
  const w = Math.max(10, Math.round(p.w * escala)), h = Math.max(10, Math.round(p.h * escala));
  const c = centroEncaixado(x ?? canvas.stage.pivot.x, y ?? canvas.stage.pivot.y, w, h, livre);
  const [doc] = await cena.createEmbeddedDocuments("Tile", [{
    texture: { src: p.src }, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), width: w, height: h,
    rotation: ((rotacao ?? p.rotacao ?? 0) % 360 + 360) % 360,
    flags: { [ID]: { objeto: p.cfg } }
  }]);
  if (doc) abrirEditor(doc);
  return doc;
}

// Encaixar na cena: o objeto segue o mouse; roda gira, Ctrl+roda muda o tamanho,
// Shift solta do quadriculado, clique coloca, botão direito ou Esc cancela
export let encaixe = null;
export function cancelarEncaixe() {
  if (!encaixe) return;
  const e = encaixe;
  encaixe = null;
  for (const [nome, fn] of e.ouvintes) window.removeEventListener(nome, fn, { capture: true });
  e.spr?.destroy?.();
  e.rt?.destroy?.(true);
  e.aviso?.remove?.();
  document.body.classList.remove("ov-encaixando");
}

export async function encaixar(opcoes = {}) {
  if (!game.user.isGM) return;
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn(t("Bib.SemMapa"));
  cancelarEncaixe();
  const p = await prepararObjeto(opcoes);
  if (!p) return;
  const carregar = foundry.canvas.loadTexture;
  let tex = null;
  try { tex = await carregar(p.src); } catch {}
  const view = canvas.app?.view;
  if (!tex || !view || !globalThis.PIXI?.Sprite) return criarObjeto({ pronto: p });

  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(0.5);
  spr.alpha = 0.75;
  spr.eventMode = "none";
  (canvas.controls ?? canvas.interface).addChild(spr);
  const v0 = p.cfg.visao ?? {};
  const e = { p, spr, tex, rot: p.rotacao ?? 0, escala: 1, x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, livre: false, ouvintes: [],
    vx: Number(v0.x) || 0, vy: Number(v0.y) || 0, esp: !!v0.espelho, rt: null, chave: "" };
  encaixe = e;
  e.aviso = document.createElement("div");
  e.aviso.className = "ov-encaixe-aviso";
  e.aviso.setAttribute("role", "status");
  document.body.append(e.aviso);
  document.body.classList.add("ov-encaixando");

  const desenhar = () => {
    const w = p.w * e.escala, h = p.h * e.escala;
    const c = centroEncaixado(e.x, e.y, w, h, e.livre);
    // Prévia da visão 3D: só redesenha quando os ângulos mudam
    const v = { x: e.vx, y: e.vy, espelho: e.esp };
    const chave = `${e.vx}|${e.vy}|${e.esp}`;
    if (chave !== e.chave) {
      e.chave = chave;
      e.rt?.destroy?.(true); e.rt = null;
      if (temVisao(v) && globalThis.PIXI?.SimplePlane) { try { e.rt = desenharVisao(e.tex, p.w, p.h, v); } catch (err) { console.warn(`${ID} |`, err); } }
      spr.texture = e.rt ?? e.tex;
    }
    spr.width = w; spr.height = h;
    spr.position.set(c.x, c.y);
    spr.rotation = e.rot * Math.PI / 180;
    e.aviso.innerHTML = `<b>${esc(p.cfg.nome || t(`Preset.${p.cfg.preset}.Nome`))}</b> · ${t("Encaixe.Dica")}
      <span class="ov-encaixe-teclas">${t("Encaixe.Teclas")}</span>
      <span class="ov-encaixe-valores">${Math.round(e.rot)}° · ${Math.round(e.escala * 100)}% · ${t(e.livre ? "Encaixe.Livre" : "Encaixe.Grade")}
        · ${t("Encaixe.Inclinar", { n: e.vx })} · ${t("Encaixe.Lado", { n: e.vy })}${e.esp ? ` · ${t("Encaixe.Espelhado")}` : ""}</span>`;
  };
  const noMapa = ev => ev.target === view;
  const ouvir = (nome, fn) => { e.ouvintes.push([nome, fn]); window.addEventListener(nome, fn, { capture: true, passive: false }); };

  ouvir("pointermove", ev => {
    if (!noMapa(ev)) return;
    const q = pontoDoMouse(ev.clientX, ev.clientY);
    e.x = q.x; e.y = q.y; e.livre = ev.shiftKey;
    desenhar();
  });
  ouvir("wheel", ev => {
    if (!noMapa(ev)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const dir = Math.sign(ev.deltaY || ev.deltaX);
    if (ev.ctrlKey || ev.metaKey) e.escala = Math.min(8, Math.max(0.1, e.escala * (dir > 0 ? 0.9 : 1.1)));
    else e.rot = (e.rot + dir * (ev.shiftKey ? 1 : 15) + 360) % 360;
    desenhar();
  });
  ouvir("pointerdown", ev => {
    if (!noMapa(ev)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (ev.button === 2) return cancelarEncaixe();
    if (ev.button !== 0) return;
    const q = pontoDoMouse(ev.clientX, ev.clientY);
    const dados = { pronto: p, x: q.x, y: q.y, rotacao: e.rot, escala: e.escala, livre: ev.shiftKey, visao: { x: e.vx, y: e.vy, espelho: e.esp } };
    cancelarEncaixe();
    criarObjeto(dados);
  });
  // O Foundry também escuta soltar e o menu do botão direito: enquanto encaixa, eles ficam com a gente
  for (const nome of ["pointerup", "contextmenu"]) ouvir(nome, ev => { if (noMapa(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } });
  // Teclas: W/S inclinam, A/D viram de lado, Q/E giram, F espelha, R volta à vista de cima, Esc cancela.
  // Elas ficam com o encaixe (senão o Foundry moveria a câmera com WASD).
  const limite = n => Math.max(-VISAO_MAX, Math.min(VISAO_MAX, n));
  ouvir("keydown", ev => {
    if (ev.target?.closest?.("input, textarea, select, [contenteditable]")) return;
    const passo = ev.shiftKey ? 5 : 15;
    const acoes = {
      Escape: () => cancelarEncaixe(),
      KeyW: () => { e.vx = limite(e.vx + passo); }, KeyS: () => { e.vx = limite(e.vx - passo); },
      KeyA: () => { e.vy = limite(e.vy - passo); }, KeyD: () => { e.vy = limite(e.vy + passo); },
      KeyQ: () => { e.rot = (e.rot - passo + 360) % 360; }, KeyE: () => { e.rot = (e.rot + passo) % 360; },
      KeyF: () => { e.esp = !e.esp; }, KeyR: () => { e.vx = 0; e.vy = 0; e.esp = false; }
    };
    const fn = acoes[ev.code] ?? (ev.key === "Escape" ? acoes.Escape : null);
    if (!fn) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    fn();
    if (encaixe === e) desenhar();
  });
  ouvir("keyup", ev => {
    if (["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyF", "KeyR"].includes(ev.code) && !ev.target?.closest?.("input, textarea, select, [contenteditable]")) {
      ev.preventDefault(); ev.stopImmediatePropagation();
    }
  });
  desenhar();
}

export function escolherImagem() {
  const FP = foundry.applications.apps.FilePicker.implementation;
  new FP({ type: "imagevideo", callback: caminho => encaixar({ img: caminho }) }).render(true);
}
