import { ID, alvos, centroDaRegiao, centroDe, centroToken, cfgDe, ehTile, emitir, esc, estaTrancado, gazua, navegador, niveisDe, nomeObjeto, pausa, preencher, t, testeDe, volumeDe } from "./nucleo.js";
import { quemViaja } from "./mapa.js";
import { usarObjeto } from "./testes.js";

// Efeitos na tela de quem precisa ver/ouvir
export function efeito(ids, dados) {
  if (!ids.length) return;
  if (ids.includes(game.user.id)) aplicarEfeito(dados);
  const outros = ids.filter(id => id !== game.user.id);
  if (outros.length) emitir({ acao: "efeito", userIds: outros, efeito: dados });
}
export async function aplicarEfeito(e) {
  try {
    if (e.tipo === "som") await foundry.audio.AudioHelper.play({ src: e.src, volume: e.volume ?? 0.8, loop: false, channel: "environment" }, false);
    else if (e.tipo === "imagem") {
      const IP = foundry.applications.apps.ImagePopout;
      new IP({ src: e.src, window: { title: e.titulo || "" } }).render({ force: true });
    } else if (e.tipo === "diario") (await fromUuid(e.uuid))?.sheet?.render(true);
    else if (e.tipo === "camera" && canvas.scene?.id === e.cena) canvas.animatePan({ x: e.x, y: e.y, scale: e.zoom || undefined, duration: 900 });
    else if (e.tipo === "aviso") ui.notifications.info(e.texto);
    else if (e.tipo === "escada") await efeitoEscada(e);
    else if (e.tipo === "verCena") {
      const cena = game.scenes.get(e.cena);
      if (!cena) ui.notifications.warn(t("Mapa.SemAcesso"));
      else if (canvas.scene?.id !== cena.id) await cena.view();
    }
  } catch (err) { console.warn(`${ID} | efeito falhou`, err); }
}

// Escada: escurece a tela, troca o nível que a pessoa vê e leva a câmera até o token
export async function efeitoEscada(e) {
  let tela = document.getElementById("ov-escada");
  if (e.fase === "inicio") {
    if (!tela) { tela = document.createElement("div"); tela.id = "ov-escada"; document.body.append(tela); }
    tela.innerHTML = `<span>${esc(e.texto ?? "")}</span>`;
    requestAnimationFrame(() => tela.classList.add("ov-on"));
    clearTimeout(tela._ovFim);
    tela._ovFim = setTimeout(() => tela?.classList.remove("ov-on"), 8000); // se a "fase fim" não chegar, a tela clareia sozinha em 8 s
    return;
  }
  try {
    if (canvas.scene?.id === e.cena) {
      const visto = canvas.level?.id ?? canvas.scene?._view?.level;
      if (e.nivel && visto !== e.nivel && typeof canvas.scene.view === "function") await canvas.scene.view({ level: e.nivel });
      const tk = canvas.tokens?.get(e.token);
      if (tk?.isOwner && !game.user.isGM) tk.control({ releaseOthers: true });
      canvas.animatePan({ x: e.x, y: e.y, duration: e.tela ? 0 : 700 });
    }
  } finally {
    if (tela) setTimeout(() => tela.classList.remove("ov-on"), 250);
  }
}

// O que cada ação faz (no mestre ativo)
export const EXECUTAR = {
  async som(a, ctx) { if (a.arquivo) efeito(alvos(a.para, ctx), { tipo: "som", src: a.arquivo, volume: volumeDe(a.volume) }); },
  async portas(a, ctx) {
    const S = CONST.WALL_DOOR_STATES;
    const mud = (a.portas ?? []).map(id => ctx.cena.walls.get(id)).filter(Boolean).map(w => ({
      _id: w.id, ds: { abrir: S.OPEN, fechar: S.CLOSED, trancar: S.LOCKED, destrancar: S.CLOSED }[a.estado] ?? (w.ds === S.OPEN ? S.CLOSED : S.OPEN)
    }));
    // ovInterno: mudança feita por uma ação não dispara as ações da própria porta (evita loop)
    if (mud.length) await ctx.cena.updateEmbeddedDocuments("Wall", mud, { ovInterno: true });
  },
  async visibilidade(a) {
    for (const uuid of a.alvos ?? []) {
      const doc = await fromUuid(uuid);
      if (!doc || !("hidden" in doc)) continue;
      const hidden = a.estado === "mostrar" ? false : a.estado === "esconder" ? true : !doc.hidden;
      if (doc.hidden !== hidden) await doc.update({ hidden });
    }
  },
  async objeto(a, ctx) {
    for (const uuid of a.alvos ?? []) {
      const doc = await fromUuid(uuid);
      const c = cfgDe(doc);
      if (!c || !ehTile(doc) || doc.uuid === ctx.fonte.uuid && a.estado === "proximo") continue;
      const sub = { ...ctx, fonte: doc, profundidade: ctx.profundidade + 1 };
      if (sub.profundidade > 5) continue;
      if (a.estado === "trancar" || a.estado === "destrancar") await definirTrancado(doc, a.estado === "trancar", sub);
      else await mudarEstado(doc, a.estado === "inicial" ? 0 : (c.estado + 1) % c.estados.length, sub);
    }
  },
  async chat(a, ctx) {
    if (!a.texto?.trim()) return;
    const whisper = a.como === "sussurro" ? alvos("disparou", ctx) : a.como === "soMestre" ? game.users.filter(u => u.isGM).map(u => u.id) : [];
    await CONFIG.ChatMessage.documentClass.create({ content: `<div class="ov-narracao">${preencher(a.texto, ctx)}</div>`, speaker: { alias: t("Narrador") }, whisper });
  },
  async imagem(a, ctx) { if (a.arquivo) efeito(alvos(a.para, ctx), { tipo: "imagem", src: a.arquivo, titulo: a.titulo }); },
  async diario(a, ctx) {
    const doc = a.diario ? await fromUuid(a.diario) : null;
    if (!doc) return;
    const ids = alvos(a.para, ctx);
    const entrada = doc.parent ?? doc;
    const NIVEL = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    const dar = {};
    for (const id of ids) { const u = game.users.get(id); if (u && !u.isGM && !entrada.testUserPermission(u, NIVEL)) dar[id] = NIVEL; }
    if (Object.keys(dar).length) await entrada.update({ ownership: dar });
    efeito(ids, { tipo: "diario", uuid: doc.uuid });
  },
  async camera(a, ctx) {
    const c = a.regiao ? await centroDaRegiao(a.regiao) : centroDe(ctx.fonte);
    if (c) efeito(alvos(a.para, ctx), { tipo: "camera", cena: ctx.cena.id, x: c.x, y: c.y, zoom: Number(a.zoom) || 0 });
  },
  async escuridao(a, ctx) {
    const valor = Math.min(1, Math.max(0, Number(a.valor) || 0));
    await ctx.cena.update({ "environment.darknessLevel": valor }, { animateDarkness: Math.max(0, Number(a.duracao) || 0) * 1000 });
  },
  async musica(a) {
    if (a.modo === "pararTodas") { for (const p of game.playlists.playing ?? []) await p.stopAll(); return; }
    const pl = game.playlists.get(a.playlist);
    if (!pl) return;
    if (a.modo === "parar") await pl.stopAll();
    else if (!pl.playing) await pl.playAll();
  },
  async mover(a, ctx) {
    const nav = navegador();
    if (!nav?.portal) return ui.notifications.warn(t("Aviso.SemNavegador"));
    if (!game.scenes.has(a.destino)) return;
    const tokens = a.quem === "jogadores" ? ctx.cena.tokens.filter(tk => tk.actor?.hasPlayerOwner) : [ctx.token].filter(Boolean);
    for (const tk of tokens) await nav.portal(tk, a.destino, a.regiao || null);
  },
  // Mapa interativo: leva quem usou (ou o grupo) para outro mapa e deixa lá o botão "Voltar ao mapa"
  async viajar(a, ctx) {
    const destino = game.scenes.get(a.destino);
    if (!destino) return;
    const origem = ctx.cena;
    if (a.volta !== "semVolta" && origem && destino.id !== origem.id) {
      const volta = { cena: origem.id, grupo: a.quem !== "quemUsou" };
      const atual = destino.getFlag(ID, "volta");
      if (atual?.cena !== volta.cena || !!atual?.grupo !== volta.grupo) await destino.setFlag(ID, "volta", volta);
    }
    const ids = quemViaja(a.quem, ctx);
    if (!ids.length) return;
    efeito(ids, { tipo: "verCena", cena: destino.id });
    // O mestre fica sabendo quem foi (quando não foi ele mesmo)
    if (!ids.includes(game.user.id)) {
      const nomes = ids.map(id => game.users.get(id)?.name).filter(Boolean).join(", ");
      ui.notifications.info(t("Mapa.Foi", { quem: nomes, mapa: destino.navName || destino.name }));
    }
  },
  async escada(a, ctx) {
    const cena = ctx.cena;
    const nivel = a.nivel ? niveisDe(cena).find(l => l.id === a.nivel) : null;
    if (a.nivel && !nivel) return ui.notifications.warn(t("Aviso.SemNivel"));
    const tokens = a.quem === "jogadores" ? cena.tokens.filter(tk => tk.actor?.hasPlayerOwner) : [ctx.token].filter(tk => tk?.parent?.id === cena.id);
    if (!tokens.length) return;
    const chegada = a.chegada ? await centroDaRegiao(a.chegada) : null;
    if (!chegada && !nivel) return;
    // quem vê a tela escura: os donos dos tokens (e quem usou)
    const ativos = game.users.filter(u => u.active && !u.isGM);
    const donos = tk => ativos.filter(u => tk.actor?.testUserPermission(u, "OWNER")).map(u => u.id);
    const ids = [...new Set([...tokens.flatMap(donos), ...(ctx.userId && !game.users.get(ctx.userId)?.isGM ? [ctx.userId] : [])])];
    if (a.tela !== "semTela") {
      efeito(ids, { tipo: "escada", fase: "inicio", texto: t(`Escada.${a.tela}`) });
      await pausa(0.6);
    }
    // chegada: todos juntos em volta do ponto, um por casa
    const gs = cena.grid?.size ?? cena.dimensions?.size ?? 100;
    const volta = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
    const upd = tokens.map((tk, i) => {
      const d = { _id: tk.id };
      if (chegada) {
        const [dx, dy] = volta[i % volta.length];
        d.x = Math.round(chegada.x - (tk.width * gs) / 2 + dx * gs);
        d.y = Math.round(chegada.y - (tk.height * gs) / 2 + dy * gs);
      }
      if (nivel) {
        d.elevation = Number(nivel.elevation?.bottom) || 0;
        if ("level" in (tk._source ?? {})) d.level = nivel.id;
      }
      return d;
    });
    // teleporte não dispara placas, "chegar perto" nem fios de parede no caminho
    for (const tk of tokens) teleportados.add(tk.uuid);
    try { await cena.updateEmbeddedDocuments("Token", upd, { animate: false, ovInterno: true }); }
    finally { for (const tk of tokens) teleportados.delete(tk.uuid); }
    for (const tk of tokens) {
      const c = centroToken(tk);
      efeito([...new Set([...donos(tk), ...ids])], { tipo: "escada", fase: "fim", cena: cena.id, nivel: nivel?.id ?? null, x: c.x, y: c.y, token: tk.id, tela: a.tela !== "semTela" });
    }
  },
  async esperar(a) { await new Promise(r => setTimeout(r, Math.max(0, Number(a.segundos) || 0) * 1000)); }
};

// Tranca ou destranca um objeto (tile). Com fechadura da Gazua da Mesa, as duas andam juntas.
export async function definirTrancado(doc, trancar, ctx = null) {
  const g = gazua();
  const comFechadura = !!g?.lerFechadura(doc);
  const antes = estaTrancado(doc);
  if (comFechadura && g.estaTrancada(doc) !== trancar) {
    // a Gazua avisa no chat, roda o que foi configurado nela e chama o gancho (que roda "Ao ser destrancado")
    await (trancar ? g.trancar(doc) : g.destrancar(doc));
  }
  if (!!cfgDe(doc)?.trancado !== trancar) await doc.setFlag(ID, "objeto.trancado", trancar);
  if (antes && !trancar && !comFechadura) await aoDestrancar(doc, ctx ?? { cena: doc.parent, token: null, userId: game.user.id, fonte: doc, profundidade: 0 });
}

// O objeto acabou de ser destrancado: ações "Ao ser destrancado" e, se marcado, usa o objeto na hora
export const destrancando = new Set();
export async function aoDestrancar(doc, ctx) {
  const c = cfgDe(doc);
  if (!c || !ehTile(doc) || destrancando.has(doc.uuid) || (ctx.profundidade ?? 0) > 5) return;
  destrancando.add(doc.uuid);
  try {
    await rodarLista(doc, c.acoes?.destrancado, { ...ctx, fonte: doc });
    if (c.usarAoDestrancar) await usarObjeto(doc, { tokenUuid: ctx.token?.uuid ?? null, userId: ctx.userId, forcar: true });
  } finally { destrancando.delete(doc.uuid); }
}
export async function rodarAcao(a, ctx) {
  if (Number(a.atraso) > 0) await pausa(a.atraso);
  return EXECUTAR[a.tipo]?.(a, ctx);
}

// Uma ação deu erro: registra no console e avisa o mestre (com o nome do objeto e da ação)
export function avisarErroAcao(doc, a, err) {
  console.error(`${ID} | ação "${a?.tipo}" de "${nomeObjeto(doc)}" falhou`, err);
  if (game.user.isGM) ui.notifications.error(t("Aviso.ErroAcao", { objeto: nomeObjeto(doc), acao: t(`Acao.${a?.tipo}`) }));
}
export async function rodarLista(doc, lista, ctx) {
  for (const a of lista ?? []) {
    try { await rodarAcao(a, ctx); } catch (err) { avisarErroAcao(doc, a, err); }
  }
}

export async function executarAcoes(doc, momento, ctx) {
  const c = cfgDe(doc);
  // A volta automática (por tempo) não é "uso": não roda "Sempre que for usado"
  for (const id of ctx?.automatico ? [momento] : [momento, "sempre"]) {
    await rodarLista(doc, c?.acoes?.[id], ctx);
  }
}

export function passaFiltro(c, token, userId) {
  if (c.quem === "todos") return true;
  const doJogador = token ? !!token.actor?.hasPlayerOwner : !game.users.get(userId)?.isGM;
  if (c.quem === "jogadores") return doJogador;
  if (c.quem === "npcs") return !!token && !doJogador;
  if (c.quem === "ator") return !!token && !!c.ator && (token.actor?.uuid === c.ator || `Actor.${token.actorId}` === c.ator);
  return true;
}

// Checagens comuns antes de agir (filtro, repetição, usos, confirmação)
export const recentes = new Map();
export async function podeAgir(doc, c, token, userId, chaveEvento, { gastar = true, confirmar = true } = {}) {
  if (!passaFiltro(c, token, userId)) return false;
  const chave = `${doc.uuid}|${chaveEvento}|${token?.uuid}`;
  const agora = Date.now();
  // confirmar = false: é a continuação de um uso que o mestre já aceitou (resposta de rolagem/minijogo)
  if (confirmar && agora - (recentes.get(chave) ?? 0) < 800) return false;
  if (recentes.size > 200) for (const [k, v] of recentes) if (agora - v > 5000) recentes.delete(k);
  recentes.set(chave, agora);
  if (c.usos > 0 && (c.usados ?? 0) >= c.usos) return false;
  if (c.confirmar && confirmar) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Titulo") },
      content: `<p>${t("Aviso.Confirmar", { quem: esc(token?.name ?? game.users.get(userId)?.name ?? "—"), objeto: esc(nomeObjeto(doc)) })}</p>`,
      rejectClose: false
    });
    if (!ok) return false;
  }
  if (gastar) await gastarUso(doc);
  return true;
}
export async function gastarUso(doc) {
  const c = cfgDe(doc);
  if (c?.usos > 0) await doc.setFlag(ID, "objeto.usados", (c.usados ?? 0) + 1);
}

// Muda o estado de um objeto (tile): imagem, animação, som, ações e volta automática
export const voltas = new Map();
// Cada mudança de estado de um objeto ganha um número. Se, enquanto as ações rodam (com "esperar"),
// o objeto mudar de novo, a execução antiga não agenda nem faz a volta automática.
const transicoes = new Map();
export async function mudarEstado(doc, idx, ctx) {
  const c = cfgDe(doc);
  const e = c?.estados?.[idx];
  if (!e) return;
  const vez = (transicoes.get(doc.uuid) ?? 0) + 1;
  transicoes.set(doc.uuid, vez);
  clearTimeout(voltas.get(doc.uuid));
  voltas.delete(doc.uuid);
  const upd = { [`flags.${ID}.objeto.estado`]: idx };
  if (e.img && e.img !== doc.texture?.src) upd["texture.src"] = e.img;
  await doc.update(upd);
  if (c.som) efeito(alvos("mapa", ctx), { tipo: "som", src: c.som, volume: 0.8 });
  await executarAcoes(doc, `estado:${e.id}`, ctx);
  if (transicoes.get(doc.uuid) !== vez) return; // o objeto já mudou de novo: esta volta não vale mais
  if (c.voltar > 0 && idx !== 0 && testeDe(c).modo !== "consertar") voltas.set(doc.uuid, setTimeout(() => {
    voltas.delete(doc.uuid);
    if (transicoes.get(doc.uuid) !== vez) return;
    if (!doc.parent?.tiles?.has(doc.id)) return; // o objeto foi apagado nesse meio-tempo
    mudarEstado(doc, 0, { ...ctx, token: null, automatico: true }).catch(err => console.warn(`${ID} | volta automática falhou`, err));
  }, c.voltar * 1000));
}

// Tokens levados por uma ação (escada): não disparam placas, "chegar perto" nem fios de parede no caminho
export const teleportados = new Set();
