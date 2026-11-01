// Objetos Vivos — Foundry VTT v14
// Transforma tiles/assets em objetos interativos (alavancas, botões, baús, placas de
// pressão...) com estados, imagem por estado e animação; e dá às portas/paredes do
// Foundry uma lista de ações para cada coisa que acontece com elas.
// Quem executa as ações é sempre o mestre ativo; o que precisa aparecer na tela de
// alguém (som, imagem, diário, câmera, aviso) vai por socket.

const ID = "objetos-vivos";
const SOCKET = `module.${ID}`;

const t = (chave, dados) => dados ? game.i18n.format(`OV.${chave}`, dados) : game.i18n.localize(`OV.${chave}`);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const emitir = data => game.socket.emit(SOCKET, data);
const souMestreAtivo = () => game.user === game.users.activeGM;
const comparar = (a, b) => String(a).localeCompare(String(b), game.i18n.lang);
const novoId = () => foundry.utils.randomID(8);
const clone = x => foundry.utils.deepClone(x);
const navegador = () => { const m = game.modules.get("navegador-mapas"); return m?.active ? m.api : null; };

// Modelos prontos (a biblioteca usa estes, com as imagens da pasta assets/)
const ASSETS = `modules/${ID}/assets`;
const PRESETS = {
  alavanca: { estados: ["Est.Desligada", "Est.Ligada"], imgs: ["alavanca-desligada", "alavanca-ligada"], anim: "girar", interacao: "clicar", voltar: 0, prof: "medio" },
  botao:    { estados: ["Est.Solto", "Est.Apertado"], imgs: ["botao-solto", "botao-apertado"], anim: "pulsar", interacao: "clicar", voltar: 1, prof: "leve" },
  bau:      { estados: ["Est.Fechado", "Est.Aberto"], imgs: ["bau-fechado", "bau-aberto"], anim: "pulsar", interacao: "clicar", voltar: 0, prof: "medio" },
  placa:    { estados: ["Est.Solta", "Est.Pressionada"], imgs: ["placa-solta", "placa-pressionada"], anim: "nenhuma", interacao: "pisar", voltar: 3, prof: "plano" },
  runa:     { estados: ["Est.Apagada", "Est.Acesa"], imgs: ["runa-apagada", "runa-acesa"], anim: "pulsar", interacao: "perto", voltar: 0, prof: "leve" },
  livre:    { estados: ["Est.Estado1", "Est.Estado2"], imgs: null, anim: "deslizar", interacao: "clicar", voltar: 0, prof: "medio" }
};
const PRONTOS = ["alavanca", "botao", "bau", "placa", "runa"];
const imgPreset = (p, i) => PRESETS[p]?.imgs ? `${ASSETS}/${PRESETS[p].imgs[i]}.svg` : "";

// Profundidade (efeito 3D): sombra, altura (o quanto "salta" do mapa) e inclinação
const PROFS = { plano: { sombra: 0, altura: 0, incl: 0 }, leve: { sombra: 40, altura: 5, incl: 8 }, medio: { sombra: 60, altura: 12, incl: 16 }, alto: { sombra: 85, altura: 22, incl: 28 } };
const profPadrao = nome => ({ preset: nome, ...PROFS[nome], parallax: nome !== "plano" });
const ANIMS = ["nenhuma", "girar", "deslizar", "virar", "pulsar", "sumir"];
const INTERACOES = ["clicar", "pisar", "perto", "mestre"];
const QUEM = ["todos", "jogadores", "npcs", "ator"];
const PARA = ["disparou", "mapa", "todos", "mestre"];
const MOMENTOS_PAREDE = ["abrir", "fechar", "trancar", "destrancar", "tentativa", "atravessar"];

// Ações: campos (tipo do campo, valor inicial, escolhas)
const ACOES = {
  som:          { campos: { arquivo: ["audio", ""], volume: ["faixa", 0.8], para: ["para", "mapa"] } },
  portas:       { campos: { portas: ["portas", []], estado: ["opcao", "abrir", ["abrir", "fechar", "trancar", "destrancar", "alternar"]] } },
  visibilidade: { campos: { alvos: ["selecao", []], estado: ["opcao", "mostrar", ["mostrar", "esconder", "alternar"]] } },
  objeto:       { campos: { alvos: ["objetos", []], estado: ["opcao", "proximo", ["proximo", "inicial", "trancar", "destrancar"]] } },
  chat:         { campos: { texto: ["textoLongo", ""], como: ["opcao", "narrador", ["narrador", "sussurro", "soMestre"]] } },
  imagem:       { campos: { arquivo: ["imagem", ""], titulo: ["texto", ""], para: ["para", "disparou"] } },
  diario:       { campos: { diario: ["diario", ""], para: ["para", "disparou"] } },
  camera:       { campos: { regiao: ["regiaoAqui", ""], zoom: ["numero", 0], para: ["para", "disparou"] } },
  escuridao:    { campos: { valor: ["faixa", 1], duracao: ["numero", 2] } },
  musica:       { campos: { playlist: ["playlist", ""], modo: ["opcao", "tocar", ["tocar", "parar", "pararTodas"]] } },
  mover:        { campos: { destino: ["cena", ""], regiao: ["regiaoDestino", ""], quem: ["opcao", "token", ["token", "jogadores"]] } },
  esperar:      { campos: { segundos: ["numero", 1] } }
};
const novaAcao = tipo => ({ id: novoId(), tipo, atraso: 0, ...Object.fromEntries(Object.entries(ACOES[tipo].campos).map(([k, [, v]]) => [k, clone(v)])) });

// Configuração guardada no objeto (flags)
const cfgDe = doc => doc?.getFlag?.(ID, "objeto") ?? null;
const ehObjeto = doc => !!cfgDe(doc);
const ehTile = doc => doc?.documentName === "Tile";

// Configuração inicial de um objeto. Sem doc (objeto ainda não criado) é sempre um tile.
function padrao(doc, preset = null, img = null) {
  const base = { quem: "todos", ator: "", usos: 0, usados: 0, confirmar: false, acoes: {} };
  if (doc && !ehTile(doc)) return base;
  const nome = preset ?? "livre";
  const p = PRESETS[nome];
  const imagem = img ?? doc?.texture?.src ?? "";
  return {
    ...base, preset: nome, estados: p.estados.map((n, i) => ({ id: novoId(), nome: t(n), img: imgPreset(nome, i) || imagem })), estado: 0,
    anim: p.anim, som: "", interacao: p.interacao, distancia: 1, mao: true, brilho: true, voltar: p.voltar, trancado: false,
    prof: profPadrao(p.prof)
  };
}

function objetosDe(cena) {
  const lista = [];
  for (const d of cena?.tiles ?? []) if (ehObjeto(d)) lista.push(d);
  for (const d of cena?.walls ?? []) if (ehObjeto(d)) lista.push(d);
  return lista;
}

function nomeObjeto(doc) {
  if (ehTile(doc)) {
    const c = cfgDe(doc);
    if (c?.nome) return c.nome;
    if (c?.preset && c.preset !== "livre") return t(`Preset.${c.preset}.Nome`);
    const arq = String(c?.estados?.[0]?.img || doc.texture?.src || "").split("/").pop().replace(/\.[a-z0-9]+$/i, "");
    return arq || t("Tipo.Tile");
  }
  return cfgDe(doc)?.nome || t(doc.door > 0 ? "Tipo.Porta" : "Tipo.Parede");
}

// Momentos em que as ações acontecem
function momentosDe(doc, c = cfgDe(doc)) {
  const lista = ehTile(doc)
    ? (c?.estados ?? []).map(e => ({ id: `estado:${e.id}`, nome: t("Mom.AoFicar", { estado: e.nome || "?" }) }))
    : MOMENTOS_PAREDE.filter(m => doc.door > 0 || m === "atravessar").map(m => ({ id: m, nome: t(`Mom.${m}`) }));
  if (ehTile(doc) || doc.door > 0) lista.push({ id: "sempre", nome: t(ehTile(doc) ? "Mom.sempreTile" : "Mom.sempreParede") });
  return lista;
}

// Geometria
function girar(p, cx, cy, graus) {
  const r = -(graus ?? 0) * Math.PI / 180;
  if (!r) return p;
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}
function noTile(doc, p) {
  const q = girar(p, doc.x + doc.width / 2, doc.y + doc.height / 2, doc.rotation);
  return q.x >= doc.x && q.x <= doc.x + doc.width && q.y >= doc.y && q.y <= doc.y + doc.height;
}
// Distância (em casas) de um ponto até a borda do tile
function distanciaAoTile(doc, p, gs) {
  const q = girar(p, doc.x + doc.width / 2, doc.y + doc.height / 2, doc.rotation);
  const dx = Math.max(doc.x - q.x, 0, q.x - (doc.x + doc.width));
  const dy = Math.max(doc.y - q.y, 0, q.y - (doc.y + doc.height));
  return Math.hypot(dx, dy) / gs;
}
const centroToken = (tk, x = tk.x, y = tk.y) => {
  const gs = tk.parent.dimensions.size;
  return { x: x + (tk.width ?? 1) * gs / 2, y: y + (tk.height ?? 1) * gs / 2 };
};
function centroDe(doc) {
  if (ehTile(doc)) return { x: doc.x + doc.width / 2, y: doc.y + doc.height / 2 };
  if (doc?.documentName === "Wall") return { x: (doc.c[0] + doc.c[2]) / 2, y: (doc.c[1] + doc.c[3]) / 2 };
  return null;
}
async function centroDaRegiao(uuid) {
  const r = uuid ? await fromUuid(uuid) : null;
  if (!r) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const inclui = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const s of r.shapes ?? []) {
    if (s.hole) continue;
    if (s.type === "rectangle") { inclui(s.x, s.y); inclui(s.x + s.width, s.y + s.height); }
    else if (s.type === "ellipse") { inclui(s.x - s.radiusX, s.y - s.radiusY); inclui(s.x + s.radiusX, s.y + s.radiusY); }
    else if (s.type === "circle") { inclui(s.x - s.radius, s.y - s.radius); inclui(s.x + s.radius, s.y + s.radius); }
    else if (s.type === "polygon") for (let i = 0; i < (s.points?.length ?? 0); i += 2) inclui(s.points[i], s.points[i + 1]);
  }
  return Number.isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
}
function cruza(a, b, c) {
  if (!c) return false;
  const [x1, y1, x2, y2] = c;
  const lado = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return lado(a.x, a.y, b.x, b.y, x1, y1) !== lado(a.x, a.y, b.x, b.y, x2, y2)
    && lado(x1, y1, x2, y2, a.x, a.y) !== lado(x1, y1, x2, y2, b.x, b.y);
}

// Quem recebe um efeito na tela
function alvos(para, ctx) {
  const ativos = game.users.filter(u => u.active);
  if (para === "todos") return ativos.map(u => u.id);
  if (para === "mestre") return ativos.filter(u => u.isGM).map(u => u.id);
  if (para === "mapa") return ativos.filter(u => u.viewedScene === ctx.cena.id).map(u => u.id);
  const ids = new Set();
  const ator = ctx.token?.actor;
  if (ator) for (const u of ativos) if (!u.isGM && ator.testUserPermission(u, "OWNER")) ids.add(u.id);
  if (!ids.size && ctx.userId && game.users.get(ctx.userId)?.active) ids.add(ctx.userId);
  return [...ids];
}
function tokenDoUsuario(userId, cena) {
  const u = game.users.get(userId);
  if (!u || u.isGM || !u.character || !cena) return null;
  return cena.tokens.find(tk => tk.actorId === u.character.id) ?? null;
}

// Efeitos na tela de quem precisa ver/ouvir
function efeito(ids, dados) {
  if (!ids.length) return;
  if (ids.includes(game.user.id)) aplicarEfeito(dados);
  const outros = ids.filter(id => id !== game.user.id);
  if (outros.length) emitir({ acao: "efeito", userIds: outros, efeito: dados });
}
async function aplicarEfeito(e) {
  try {
    if (e.tipo === "som") await foundry.audio.AudioHelper.play({ src: e.src, volume: e.volume ?? 0.8, loop: false, channel: "environment" }, false);
    else if (e.tipo === "imagem") {
      const IP = foundry.applications.apps?.ImagePopout ?? globalThis.ImagePopout;
      new IP({ src: e.src, window: { title: e.titulo || "" } }).render({ force: true });
    } else if (e.tipo === "diario") (await fromUuid(e.uuid))?.sheet?.render(true);
    else if (e.tipo === "camera" && canvas.scene?.id === e.cena) canvas.animatePan({ x: e.x, y: e.y, scale: e.zoom || undefined, duration: 900 });
    else if (e.tipo === "aviso") ui.notifications.info(e.texto);
  } catch (err) { console.warn(`${ID} | efeito falhou`, err); }
}

const preencher = (texto, ctx) => String(texto ?? "")
  .replaceAll("{token}", ctx.token?.name ?? "")
  .replaceAll("{jogador}", game.users.get(ctx.userId)?.name ?? "")
  .replaceAll("{objeto}", nomeObjeto(ctx.fonte))
  .replaceAll("{mapa}", ctx.cena.navName || ctx.cena.name);

// O que cada ação faz (no mestre ativo)
const EXECUTAR = {
  async som(a, ctx) { if (a.arquivo) efeito(alvos(a.para, ctx), { tipo: "som", src: a.arquivo, volume: Number(a.volume) || 0.8 }); },
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
      if (a.estado === "trancar" || a.estado === "destrancar") await doc.setFlag(ID, "objeto.trancado", a.estado === "trancar");
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
  async esperar(a) { await new Promise(r => setTimeout(r, Math.max(0, Number(a.segundos) || 0) * 1000)); }
};

// Uma ação, com o tempo de espera antes dela (as ações acontecem uma depois da outra)
const pausa = segundos => new Promise(r => setTimeout(r, Math.max(0, Number(segundos) || 0) * 1000));
async function rodarAcao(a, ctx) {
  if (Number(a.atraso) > 0) await pausa(a.atraso);
  return EXECUTAR[a.tipo]?.(a, ctx);
}

async function executarAcoes(doc, momento, ctx) {
  const c = cfgDe(doc);
  for (const id of [momento, "sempre"]) {
    for (const a of c?.acoes?.[id] ?? []) {
      try { await rodarAcao(a, ctx); }
      catch (err) { console.error(`${ID} | ação "${a.tipo}" de "${nomeObjeto(doc)}" falhou`, err); ui.notifications.error(t("Aviso.ErroAcao", { objeto: nomeObjeto(doc), acao: t(`Acao.${a.tipo}`) })); }
    }
  }
}

function passaFiltro(c, token, userId) {
  if (c.quem === "todos") return true;
  const doJogador = token ? !!token.actor?.hasPlayerOwner : !game.users.get(userId)?.isGM;
  if (c.quem === "jogadores") return doJogador;
  if (c.quem === "npcs") return !!token && !doJogador;
  if (c.quem === "ator") return !!token && !!c.ator && (token.actor?.uuid === c.ator || `Actor.${token.actorId}` === c.ator);
  return true;
}

// Checagens comuns antes de agir (filtro, repetição, usos, confirmação)
const recentes = new Map();
async function podeAgir(doc, c, token, userId, chaveEvento) {
  if (!passaFiltro(c, token, userId)) return false;
  const chave = `${doc.uuid}|${chaveEvento}|${token?.uuid}`;
  if (Date.now() - (recentes.get(chave) ?? 0) < 800) return false;
  recentes.set(chave, Date.now());
  if (c.usos > 0 && (c.usados ?? 0) >= c.usos) return false;
  if (c.confirmar) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Titulo") },
      content: `<p>${t("Aviso.Confirmar", { quem: esc(token?.name ?? game.users.get(userId)?.name ?? "—"), objeto: esc(nomeObjeto(doc)) })}</p>`,
      rejectClose: false
    });
    if (!ok) return false;
  }
  if (c.usos > 0) await doc.setFlag(ID, "objeto.usados", (c.usados ?? 0) + 1);
  return true;
}

// Muda o estado de um objeto (tile): imagem, animação, som, ações e volta automática
const voltas = new Map();
async function mudarEstado(doc, idx, ctx) {
  const c = cfgDe(doc);
  const e = c?.estados?.[idx];
  if (!e) return;
  const upd = { [`flags.${ID}.objeto.estado`]: idx };
  if (e.img && e.img !== doc.texture?.src) upd["texture.src"] = e.img;
  await doc.update(upd);
  if (c.som) efeito(alvos("mapa", ctx), { tipo: "som", src: c.som, volume: 0.8 });
  clearTimeout(voltas.get(doc.uuid));
  await executarAcoes(doc, `estado:${e.id}`, ctx);
  if (c.voltar > 0 && idx !== 0) voltas.set(doc.uuid, setTimeout(() => mudarEstado(doc, 0, { ...ctx, token: null }), c.voltar * 1000));
}

// Alguém usou um objeto (tile)
async function usarObjeto(doc, { tokenUuid = null, userId = null, forcar = false }) {
  if (!game.user.isGM) return;
  const c = cfgDe(doc);
  if (!c || !ehTile(doc)) return;
  const cena = doc.parent;
  const token = (tokenUuid ? await fromUuid(tokenUuid) : null) ?? tokenDoUsuario(userId, cena);
  if (!forcar) {
    if (c.trancado) {
      if (userId) efeito([userId], { tipo: "aviso", texto: t("Aviso.Trancado", { objeto: nomeObjeto(doc) }) });
      Hooks.callAll("objetosVivos.trancado", doc, { token, userId });
      return;
    }
    if (!await podeAgir(doc, c, token, userId, "usar")) return;
  }
  const ctx = { cena, token, userId, fonte: doc, profundidade: 0 };
  await mudarEstado(doc, (c.estado + 1) % c.estados.length, ctx);
  if (c.camaleao && c.revelarAoUsar && !c.revelado) await doc.setFlag(ID, "objeto.revelado", true);
  Hooks.callAll("objetosVivos.usado", doc, { token, userId });
}

// Algo aconteceu com uma porta/parede que é objeto
async function eventoParede(doc, momento, { tokenUuid = null, userId = null }) {
  if (!souMestreAtivo()) return;
  const c = cfgDe(doc);
  if (!c) return;
  const tem = (c.acoes?.[momento]?.length ?? 0) + (momento !== "atravessar" ? (c.acoes?.sempre?.length ?? 0) : 0);
  if (!tem) return;
  const cena = doc.parent;
  const token = (tokenUuid ? await fromUuid(tokenUuid) : null) ?? tokenDoUsuario(userId, cena);
  if (!await podeAgir(doc, c, token, userId, momento)) return;
  const ctx = { cena, token, userId, fonte: doc, profundidade: 0 };
  if (momento === "atravessar") {
    for (const a of c.acoes?.atravessar ?? []) {
      try { await rodarAcao(a, ctx); } catch (err) { console.error(err); }
    }
  } else await executarAcoes(doc, momento, ctx);
}

// Leva o pedido até o mestre ativo
function pedirUso(doc, tokenUuid) {
  if (souMestreAtivo()) return usarObjeto(doc, { tokenUuid, userId: game.user.id });
  if (!game.users.activeGM) return ui.notifications.warn(t("Aviso.SemMestre"));
  emitir({ acao: "usar", uuid: doc.uuid, tokenUuid, userId: game.user.id });
}

// Animação do objeto ao mudar de estado (em todos os navegadores)
function animar(tile, tipo) {
  if (!tile || tipo === "nenhuma" || !tipo) return;
  const dur = tipo === "virar" ? 520 : 450;
  const inicio = performance.now();
  const bases = new WeakMap();
  const passo = agora => {
    const mesh = tile.mesh;
    if (!mesh || mesh.destroyed) return;
    if (!bases.has(mesh)) bases.set(mesh, { rot: mesh.rotation, sx: mesh.scale.x, sy: mesh.scale.y, y: mesh.position.y, a: mesh.alpha });
    const b = bases.get(mesh);
    const p = Math.min(1, (agora - inicio) / dur);
    const k = Math.sin(p * Math.PI);
    if (tipo === "girar") mesh.rotation = b.rot + k * 0.35;
    else if (tipo === "deslizar") mesh.position.y = b.y + k * Math.max(8, tile.document.height * 0.12);
    else if (tipo === "virar") mesh.scale.x = b.sx * Math.abs(Math.cos(p * Math.PI));
    else if (tipo === "pulsar") { mesh.scale.x = b.sx * (1 + 0.12 * k); mesh.scale.y = b.sy * (1 + 0.12 * k); }
    else if (tipo === "sumir") mesh.alpha = b.a * (1 - 0.8 * k);
    if (p < 1) return requestAnimationFrame(passo);
    Object.assign(mesh, { rotation: b.rot, alpha: b.a });
    mesh.scale.set(b.sx, b.sy);
    mesh.position.y = b.y;
    tile.renderFlags?.set?.({ refreshTransform: true, refreshMesh: true });
  };
  requestAnimationFrame(passo);
}

// Profundidade: sombra desenhada por um filtro na imagem do tile, mais altura, inclinação
// e um leve movimento (parallax) quando a câmera anda. Só mexe no desenho, nunca no documento.
const SOMBRA_FRAG = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform vec2 uDesloc;
uniform float uForca;
uniform float uBorrao;
void main(void) {
  vec4 cor = texture2D(uSampler, vTextureCoord);
  vec2 px = inputSize.zw;
  float a = 0.0;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      a += texture2D(uSampler, vTextureCoord - uDesloc * px + vec2(float(x), float(y)) * uBorrao * px).a;
    }
  }
  a = a / 25.0 * uForca;
  gl_FragColor = cor + vec4(0.0, 0.0, 0.0, a) * (1.0 - cor.a);
}`;
let ClasseSombra = null;
function novaSombra() {
  if (!globalThis.PIXI?.Filter) return null;
  ClasseSombra ??= class extends PIXI.Filter {
    constructor() { super(undefined, SOMBRA_FRAG, { uDesloc: new Float32Array([0, 0]), uForca: 0.5, uBorrao: 1 }); }
  };
  return new ClasseSombra();
}

// Camaleão: para os jogadores o objeto mostra o que está atrás dele (o fundo do mapa e os
// tiles de baixo). O mestre vê o objeto meio transparente. Só muda o desenho, nunca o documento.
function camuflado(tile) {
  const c = tile?._ovPreviaCamo ?? cfgDe(tile?.document);
  if (!c?.camaleao || c.revelado) return false;
  return !game.user.isGM || !!tile._ovVerCamo;
}
const camoMestre = tile => { const c = tile?._ovPreviaCamo ?? cfgDe(tile?.document); return game.user.isGM && !!c?.camaleao && !c.revelado && !tile._ovVerCamo; };

// Copia o desenho de um objeto do mapa para dentro da imagem do camaleão
function copiaDoDesenho(mesh, cx, cy) {
  if (!mesh?.texture || mesh.destroyed || mesh.visible === false) return null;
  const spr = new PIXI.Sprite(mesh.texture);
  spr.anchor.set(mesh.anchor?.x ?? 0.5, mesh.anchor?.y ?? 0.5);
  spr.position.set(mesh.position.x - cx, mesh.position.y - cy);
  spr.scale.set(mesh.scale.x, mesh.scale.y);
  spr.rotation = mesh.rotation ?? 0;
  spr.alpha = mesh.alpha ?? 1;
  return spr;
}

function montarCamuflagem(tile) {
  const doc = tile.document;
  const w = Math.max(1, Math.round(doc.width)), h = Math.max(1, Math.round(doc.height));
  const cx = doc.x + doc.width / 2, cy = doc.y + doc.height / 2;
  const grupo = new PIXI.Container();
  const miolo = new PIXI.Container();
  miolo.position.set(w / 2, h / 2);
  miolo.rotation = -((doc.rotation ?? 0) * Math.PI / 180);
  grupo.addChild(miolo);
  // Cor de fundo do mapa, depois a imagem de fundo, depois os tiles que ficam embaixo deste
  const fundo = new PIXI.Graphics();
  const cor = Number(foundry.utils.Color?.from?.(canvas.scene?.backgroundColor ?? "#000000") ?? 0);
  fundo.beginFill(cor).drawRect(-w, -h, w * 2, h * 2).endFill();
  miolo.addChild(fundo);
  const bg = copiaDoDesenho(canvas.primary?.background, cx, cy);
  if (bg) miolo.addChild(bg);
  const abaixo = (canvas.tiles?.placeables ?? []).filter(o => {
    if (o === tile || o.document.hidden || !o.mesh?.texture) return false;
    const d = o.document;
    const el = d.elevation ?? 0, minha = doc.elevation ?? 0;
    const embaixo = el < minha || (el === minha && (d.sort ?? 0) < (doc.sort ?? 0));
    const toca = d.x < doc.x + doc.width && d.x + d.width > doc.x && d.y < doc.y + doc.height && d.y + d.height > doc.y;
    return embaixo && toca && !camuflado(o);
  }).sort((a, b) => ((a.document.elevation ?? 0) - (b.document.elevation ?? 0)) || ((a.document.sort ?? 0) - (b.document.sort ?? 0)));
  for (const o of abaixo) { const spr = copiaDoDesenho(o.mesh, cx, cy); if (spr) miolo.addChild(spr); }
  const rt = PIXI.RenderTexture.create({ width: w, height: h });
  canvas.app.renderer.render(grupo, { renderTexture: rt, clear: true });
  grupo.destroy({ children: true, texture: false, baseTexture: false });
  return rt;
}

function aplicarCamaleao(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed || !globalThis.PIXI?.RenderTexture) return;
  const ativo = camuflado(tile);
  const atual = tile._ovCamo;
  if (!ativo) {
    if (atual) {
      tile._ovCamo = null;
      if (mesh.texture === atual.rt && tile.texture) mesh.texture = tile.texture;
      atual.rt?.destroy?.(true);
      tile.renderFlags?.set?.({ refreshMesh: true, refreshSize: true });
    }
    if (camoMestre(tile)) { mesh.alpha = Math.min(mesh.alpha ?? 1, 0.5); tile._ovMeio = true; }
    else if (tile._ovMeio) { tile._ovMeio = false; tile.renderFlags?.set?.({ refreshState: true }); }
    return;
  }
  if (!atual || atual.sujo) {
    try {
      const rt = montarCamuflagem(tile);
      atual?.rt?.destroy?.(true);
      tile._ovCamo = { rt, sujo: false };
    } catch (err) { console.warn(`${ID} | camaleão falhou`, err); return; }
  }
  mesh.texture = tile._ovCamo.rt;
  mesh.width = tile.document.width;
  mesh.height = tile.document.height;
}

// O que está atrás pode mudar (outro tile mexido, fundo trocado): refaz as camuflagens
let tCamo = 0;
function refazerCamuflagens() {
  clearTimeout(tCamo);
  tCamo = setTimeout(() => {
    for (const o of canvas.tiles?.placeables ?? []) if (o._ovCamo || camuflado(o)) { if (o._ovCamo) o._ovCamo.sujo = true; aplicarCamaleao(o); }
  }, 150);
}

// O que vale para este tile agora (a prévia do editor aberto tem prioridade)
function profDe(tile) {
  if (camuflado(tile)) return null;
  const p = tile?._ovPrevia ?? cfgDe(tile?.document)?.prof;
  return p && (p.sombra > 0 || p.altura > 0 || p.incl > 0) ? p : null;
}

function aplicarProfundidade(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed) return;
  // Camuflado: sem sombra, sem altura e sem mexer no tamanho (que o camaleão acabou de acertar)
  if (camuflado(tile)) {
    const m0 = tile._ovMarca, b0 = tile._ovBase;
    if (m0 && b0 && mesh.position.x === m0.x && mesh.position.y === m0.y) mesh.position.set(b0.x, b0.y);
    const resto = (mesh.filters ?? []).filter(f => f !== tile._ovSombra);
    mesh.filters = resto.length ? resto : null;
    tile._ovBase = null; tile._ovMarca = null;
    return;
  }
  const p = profDe(tile);
  const m = tile._ovMarca;
  // Descobre a posição "de verdade" do Foundry: se ele redesenhou, o valor mudou desde a nossa última marca
  const base = tile._ovBase ?? { y: mesh.position.y, x: mesh.position.x, sy: mesh.scale.y };
  if (!m || mesh.position.y !== m.y) base.y = mesh.position.y;
  if (!m || mesh.position.x !== m.x) base.x = mesh.position.x;
  if (!m || mesh.scale.y !== m.sy) base.sy = mesh.scale.y;
  tile._ovBase = base;

  const filtros = (mesh.filters ?? []).filter(f => f !== tile._ovSombra);
  if (!p) {
    mesh.position.set(base.x, base.y);
    mesh.scale.y = base.sy;
    mesh.filters = filtros.length ? filtros : null;
    tile._ovMarca = { x: base.x, y: base.y, sy: base.sy };
    return;
  }
  const gs = canvas.dimensions?.size ?? 100;
  const k = gs / 100;
  const zoom = canvas.stage?.scale?.x ?? 1;
  const res = canvas.app?.renderer?.resolution ?? 1;
  const alt = (Number(p.altura) || 0) * k;
  // Parallax: quanto mais alto, mais o objeto "acompanha" a câmera
  let px = 0, py = 0;
  if (p.parallax && alt > 0 && canvas.stage?.pivot) {
    const doc = tile.document;
    px = (doc.x + doc.width / 2 - canvas.stage.pivot.x) * alt * 0.0012;
    py = (doc.y + doc.height / 2 - canvas.stage.pivot.y) * alt * 0.0012;
  }
  const incl = Math.min(45, Math.max(0, Number(p.incl) || 0));
  const fatorY = Math.cos(incl * Math.PI / 180);
  const x = base.x + px, y = base.y - alt + py + (1 - fatorY) * (tile.document.height / 2);
  mesh.position.set(x, y);
  mesh.scale.y = base.sy * fatorY;

  const sombra = Math.min(100, Math.max(0, Number(p.sombra) || 0));
  if (sombra > 0) {
    tile._ovSombra ??= novaSombra();
    const f = tile._ovSombra;
    if (f) {
      const dx = (alt * 0.5 + 3 * k) * zoom * res, dy = (alt + 5 * k) * zoom * res;
      f.uniforms.uDesloc[0] = dx;
      f.uniforms.uDesloc[1] = dy;
      f.uniforms.uForca = sombra / 100 * 0.85;
      f.uniforms.uBorrao = (1 + sombra / 40) * zoom * res;
      f.padding = Math.ceil((Math.abs(dx) + Math.abs(dy)) / res + f.uniforms.uBorrao * 3);
      filtros.push(f);
    }
  }
  mesh.filters = filtros.length ? filtros : null;
  tile._ovMarca = { x, y, sy: mesh.scale.y };
}
function atualizarProfundidades() {
  for (const tile of canvas.tiles?.placeables ?? []) if (tile._ovSombra || profDe(tile)) aplicarProfundidade(tile);
}

// No mapa: clique, mãozinha e brilho
const CONTROLE = "objetos-vivos";
// A ferramenta "Objetos Vivos" está aberta na barra da esquerda? (aí o clique edita em vez de usar)
const naFerramenta = () => (ui.controls?.control?.name ?? ui.controls?.activeControl) === CONTROLE;
// O mestre usa os objetos com um clique simples quando está na camada de tokens (como os jogadores)
const mestrePodeUsar = () => !!canvas.tokens?.active;
const usaveis = () => (canvas.tiles?.placeables ?? []).filter(o => {
  const c = cfgDe(o.document);
  if (!c) return false;
  if (game.user.isGM) return true;
  return !o.document.hidden && c.interacao === "clicar";
});
const tileNoPonto = p => (canvas.tiles?.placeables ?? []).filter(o => o.visible !== false && noTile(o.document, p))
  .sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0] ?? null;
const objetoNoPonto = p => {
  const lista = usaveis().filter(o => noTile(o.document, p));
  return lista.sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0] ?? null;
};
const pontoDoMouse = (x, y) => canvas.canvasCoordinatesFromClient?.({ x, y }) ?? canvas.stage.worldTransform.applyInverse({ x, y });
function meusTokens() {
  return (canvas.tokens?.placeables ?? []).filter(tk => tk.isOwner && (game.user.isGM ? tk.controlled : true));
}
function maisPerto(doc) {
  const gs = canvas.dimensions.size;
  let perto = null, dist = Infinity;
  for (const tk of meusTokens()) { const d = distanciaAoTile(doc, tk.center, gs); if (d < dist) { dist = d; perto = tk; } }
  return { perto, dist };
}

function ligarMapa() {
  const view = canvas.app?.view ?? canvas.app?.canvas;
  if (!view || view._ovLigado) return;
  view._ovLigado = true;
  let ini = null;
  view.addEventListener("pointerdown", ev => { ini = ev.button === 0 ? { x: ev.clientX, y: ev.clientY, t: Date.now() } : null; });
  view.addEventListener("pointerup", ev => {
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
    if (!game.user.isGM && c.distancia > 0 && dist > c.distancia) return ui.notifications.info(t("Aviso.Longe"));
    pedirUso(doc, perto?.document.uuid ?? null);
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

let brilhos = null;
function atualizarBrilho() {
  if (!canvas.ready) return;
  if (!brilhos || brilhos.destroyed) {
    if (!globalThis.PIXI) return;
    brilhos = new PIXI.Graphics();
    brilhos.eventMode = "none";
    (canvas.controls ?? canvas.interface)?.addChild(brilhos);
    canvas.app.ticker.add(() => { if (brilhos && !brilhos.destroyed) brilhos.alpha = 0.55 + 0.35 * Math.sin(performance.now() / 260); });
  }
  brilhos.clear();
  if (game.user.isGM) return;
  for (const o of usaveis()) {
    const doc = o.document, c = cfgDe(doc);
    if (c.brilho === false || c.trancado || camuflado(o)) continue;
    const alcance = c.distancia > 0 ? c.distancia : 1;
    if (maisPerto(doc).dist > alcance) continue;
    brilhos.lineStyle(4, 0xffc27a, 1).drawRoundedRect(doc.x - 4, doc.y - 4, doc.width + 8, doc.height + 8, 10);
  }
}

// Tokens andando: pisar em cima, chegar perto e atravessar paredes
const posicoes = new Map();
function lembrarPosicoes(cena) { for (const tk of cena?.tokens ?? []) posicoes.set(tk.uuid, centroToken(tk)); }

function aoMoverToken(tk, mud) {
  if (!("x" in mud || "y" in mud)) return;
  const antes = posicoes.get(tk.uuid);
  const agora = centroToken(tk);
  posicoes.set(tk.uuid, agora);
  if (tk.parent?.id === canvas.scene?.id) atualizarBrilho();
  if (!antes || !souMestreAtivo()) return;
  const gs = tk.parent.dimensions.size;
  for (const doc of objetosDe(tk.parent)) {
    const c = cfgDe(doc);
    if (doc.documentName === "Wall") {
      if (c.acoes?.atravessar?.length && cruza(antes, agora, doc.c)) eventoParede(doc, "atravessar", { tokenUuid: tk.uuid });
      continue;
    }
    if (doc.hidden) continue;
    if (c.interacao === "pisar" && !noTile(doc, antes) && noTile(doc, agora)) usarObjeto(doc, { tokenUuid: tk.uuid });
    if (c.interacao === "perto") {
      const alcance = c.distancia > 0 ? c.distancia : 1;
      if (distanciaAoTile(doc, antes, gs) > alcance && distanciaAoTile(doc, agora, gs) <= alcance) usarObjeto(doc, { tokenUuid: tk.uuid });
    }
  }
}

// Portas: estado anterior (fechar depois de trancada = destrancar)
const estadosPorta = new Map();
function lembrarPortas(cena) { for (const w of cena?.walls ?? []) if (w.door > 0) estadosPorta.set(w.uuid, w.ds); }

// "Ao tentar abrir trancada": cada controle de porta ganha um ouvinte próprio.
// O módulo NÃO substitui nenhuma função do Foundry (nada de prototype nem libWrapper),
// então não entra em conflito com Gazua da Mesa, Arm's Reach ou qualquer outro módulo.
function aoClicarPorta(ev) {
  try {
    if ((ev?.button ?? 0) !== 0 || game.user.isGM) return;
    const w = this.wall?.document;
    if (!w || !ehObjeto(w) || w.ds !== CONST.WALL_DOOR_STATES.LOCKED) return;
    if (souMestreAtivo()) eventoParede(w, "tentativa", { userId: game.user.id });
    else emitir({ acao: "parede", uuid: w.uuid, momento: "tentativa", userId: game.user.id });
  } catch (err) { console.warn(`${ID} |`, err); }
}
function ouvirPorta(dc) {
  if (!dc || dc.destroyed || dc._ovOuvindo || typeof dc.on !== "function") return;
  dc._ovOuvindo = true;
  dc.on("pointerdown", aoClicarPorta);
}
function ouvirTentativas() {
  for (const dc of canvas.controls?.doors?.children ?? []) ouvirPorta(dc);
  for (const w of canvas.walls?.placeables ?? []) ouvirPorta(w.doorControl);
}

// Editor do objeto
const CSS = `
.ov-editor .window-content { padding: 0; background: #17151c; color: #ece8f1; }
.ov-raiz { display: flex; height: 100%; font-family: Signika, system-ui, sans-serif; }
.ov-raiz button { font-family: inherit; }
.ov-lado > * { flex: none; }
.ov-lado > input[type=text] { flex: none; height: 36px; }
.ov-mini { width: 40px; height: 40px; flex: none; border-radius: 6px; border: none; background: #2e2a37; object-fit: contain; display: flex; align-items: center; justify-content: center; color: #a8a1b4; }
.ov-arquivo { flex: 1; min-width: 0; font-size: 12px; color: #cfc8da; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-aviso-img { margin: 0; padding: 8px 10px; border-radius: 8px; background: rgba(240,160,60,.10); border: 1px solid #f0a03c66; font-size: 12px; color: #ffd09a; }
.ov-lado { width: 300px; flex: none; padding: 16px; box-sizing: border-box; border-right: 1px solid #343041; background: #1a1720; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
.ov-palco { position: relative; height: 200px; border-radius: 12px; border: 1px solid #343041; background-color: #221f29;
  background-image: radial-gradient(#2e2a37 1px, transparent 1px); background-size: 14px 14px; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.ov-palco img { max-width: 70%; max-height: 80%; border: none; object-fit: contain; }
.ov-palco .ov-chip { position: absolute; top: 10px; left: 10px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px;
  background: rgba(240,160,60,.14); color: #ffd09a; border: 1px solid #f0a03c; }
.ov-palco .ov-porta { font-size: 64px; color: #cfc8da; }
.ov-btn { height: 40px; border-radius: 10px; border: 1px solid #343041; background: #26222d; color: #ece8f1; font-size: 13px; padding: 0 14px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; flex: none; width: auto; line-height: 1; }
.ov-btn:hover { border-color: #6b6378; }
.ov-btn.ov-forte { border-color: #f0a03c; background: rgba(240,160,60,.12); color: #ffd09a; font-weight: 600; }
.ov-btn.ov-primario { border: none; background: #f0a03c; color: #1a1408; font-weight: 700; }
.ov-btn.ov-icone { width: 36px; padding: 0; }
.ov-btn.ov-perigo { color: #ff9a8a; }
.ov-rotulo { font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #a8a1b4; }
.ov-estado { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 10px; border: 1px solid #343041; background: #221f29; }
.ov-estado.ov-atual { border-color: #f0a03c; background: rgba(240,160,60,.08); }
.ov-estado .ov-linha { display: flex; gap: 6px; align-items: center; }
.ov-num { width: 26px; height: 26px; flex: none; border-radius: 7px; background: #2e2a37; color: #f0a03c; font-weight: 700; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.ov-raiz input[type=text], .ov-raiz input[type=number], .ov-raiz select, .ov-raiz textarea {
  height: 36px; box-sizing: border-box; border-radius: 8px; border: 1px solid #343041; background: #1e1b24; color: #ece8f1; padding: 0 10px; font-family: inherit; font-size: 13px; flex: 1; min-width: 0; }
.ov-raiz textarea { height: auto; min-height: 64px; padding: 8px 10px; resize: vertical; }
.ov-principal { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.ov-abas { display: flex; gap: 4px; padding: 10px 18px 0; border-bottom: 1px solid #343041; flex: none; }
.ov-aba { height: 42px; padding: 0 14px; display: flex; align-items: center; gap: 8px; background: transparent; border: none; border-bottom: 3px solid transparent;
  color: #a8a1b4; font-size: 14px; font-weight: 600; margin-bottom: -1px; cursor: pointer; width: auto; }
.ov-aba .ov-n { width: 22px; height: 22px; border-radius: 50%; background: #2e2a37; color: #a8a1b4; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; }
.ov-aba.ov-on { color: #ece8f1; border-bottom-color: #f0a03c; }
.ov-aba.ov-on .ov-n { background: #f0a03c; color: #1a1408; }
.ov-corpo { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 18px; }
.ov-corpo h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; border: none; color: #ece8f1; }
.ov-corpo .ov-dica { margin: 0; font-size: 12px; color: #a8a1b4; }
.ov-grade { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.ov-grade.ov-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ov-grade.ov-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ov-cartao { min-height: 64px; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px;
  text-align: left; color: #ece8f1; border: 1px solid #343041; background: #221f29; cursor: pointer; width: auto; line-height: 1.25; }
.ov-cartao b { font-size: 14px; } .ov-cartao span { font-size: 11px; color: #a8a1b4; }
.ov-cartao.ov-on { border-color: #f0a03c; background: rgba(240,160,60,.10); box-shadow: inset 0 0 0 1px #f0a03c; }
.ov-cartao:disabled { opacity: .45; cursor: not-allowed; }
.ov-pilulas { display: flex; flex-wrap: wrap; gap: 6px; }
.ov-pilula { height: 36px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; border: 1px solid #343041; background: #221f29; color: #ece8f1; cursor: pointer; width: auto; }
.ov-pilula.ov-on { border-color: #f0a03c; background: rgba(240,160,60,.16); color: #ffd09a; }
.ov-faixa { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; background: #1e1b24; border: 1px solid #343041; }
.ov-faixa .ov-txt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ov-faixa .ov-txt b { font-size: 14px; } .ov-faixa .ov-txt span { font-size: 12px; color: #a8a1b4; }
.ov-valor { min-width: 84px; text-align: center; font-weight: 600; }
.ov-chave { flex: none; width: 48px; height: 28px; border-radius: 999px; border: none; padding: 3px; display: flex; background: #3a3544; cursor: pointer; }
.ov-chave span { width: 22px; height: 22px; border-radius: 50%; background: #fff; }
.ov-chave.ov-on { background: #4fb3a9; justify-content: flex-end; }
.ov-momentos { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: #1e1b24; border: 1px solid #343041; border-radius: 12px; align-self: flex-start; }
.ov-momento { height: 34px; padding: 0 12px; border-radius: 9px; border: none; font-size: 13px; font-weight: 600; background: transparent; color: #a8a1b4; cursor: pointer; width: auto; }
.ov-momento.ov-on { background: #f0a03c; color: #1a1408; }
.ov-momento .ov-cont { margin-left: 6px; font-size: 11px; opacity: .8; }
.ov-acao { border-radius: 12px; background: #1e1b24; border: 1px solid #343041; }
.ov-acao-cab { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
.ov-acao-cab .ov-txt { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.ov-acao-cab .ov-txt b { font-size: 14px; } .ov-acao-cab .ov-txt span { font-size: 12px; color: #a8a1b4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-acao-corpo { padding: 4px 14px 12px 48px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #2c2834; }
.ov-campo { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ov-campo > label { flex: 0 0 120px; font-size: 12px; font-weight: 600; color: #cfc8da; }
.ov-lista-alvos label { display: flex; gap: 6px; align-items: center; font-size: 12px; }
.ov-vazio { margin: 0; padding: 14px; border-radius: 12px; border: 1px dashed #4a4454; color: #a8a1b4; font-size: 13px; text-align: center; }
.ov-rodape { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-top: 1px solid #343041; background: #1d1a23; flex: none; }
.ov-rodape .ov-resumo { flex: 1; font-size: 12px; color: #a8a1b4; }
.ov-testar-girar { animation: ov-girar .45s ease; } .ov-testar-deslizar { animation: ov-deslizar .45s ease; }
.ov-testar-virar { animation: ov-virar .52s ease; } .ov-testar-pulsar { animation: ov-pulsar .45s ease; } .ov-testar-sumir { animation: ov-sumir .45s ease; }
@keyframes ov-girar { 50% { transform: rotate(20deg); } } @keyframes ov-deslizar { 50% { transform: translateY(12%); } }
@keyframes ov-virar { 50% { transform: scaleX(0); } } @keyframes ov-pulsar { 50% { transform: scale(1.12); } } @keyframes ov-sumir { 50% { opacity: .2; } }
body.ov-mao #board { cursor: pointer !important; }
fieldset.ov-secao { border: 1px solid #f0a03c88; border-radius: 8px; margin: 8px 0; padding: 6px 10px 10px; }
fieldset.ov-secao legend { padding: 0 6px; font-weight: bold; }
fieldset.ov-secao p { font-size: 12px; margin: 0 0 8px; opacity: .85; }
fieldset.ov-secao .ov-botoes { display: flex; gap: 6px; } fieldset.ov-secao .ov-botoes button { flex: 1; }
.ov-narracao { font-style: italic; }
.ov-faixa.ov-faixa-linha { display: grid; grid-template-columns: 110px minmax(0, 1fr) 52px; padding: 8px 14px; }
.ov-faixa-linha b { font-size: 13px; } .ov-faixa-linha input[type=range] { width: 100%; accent-color: #f0a03c; }
.ov-btn.ov-mais { align-self: flex-start; }
.ov-previa { transition: transform .25s, filter .25s; }
.ov-biblioteca .window-content { padding: 0; background: #17151c; color: #ece8f1; }
.ov-bib { display: flex; flex-direction: column; height: 100%; font-family: Signika, system-ui, sans-serif; }
.ov-bib button { font-family: inherit; }
.ov-bib-topo { padding: 14px; display: flex; flex-direction: column; gap: 10px; border-bottom: 1px solid #343041; flex: none; }
.ov-minha { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 2px dashed #f0a03c; background: rgba(240,160,60,.08);
  color: #ece8f1; text-align: left; cursor: pointer; width: 100%; height: auto; line-height: 1.25; }
.ov-minha i { font-size: 24px; color: #f0a03c; } .ov-minha b { display: block; font-size: 14px; } .ov-minha span { font-size: 12px; color: #d9c4a6; }
.ov-bib-abas { display: flex; gap: 6px; }
.ov-bib-aba { flex: 1; height: 34px; border-radius: 8px; border: 1px solid #343041; background: transparent; color: #a8a1b4; font-size: 13px; font-weight: 600; cursor: pointer; }
.ov-bib-aba.ov-on { background: #f0a03c; border-color: #f0a03c; color: #1a1408; }
.ov-bib-corpo { flex: 1; min-height: 0; overflow-y: auto; padding: 14px; }
.ov-bib-grade { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ov-bib-item { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px 10px; border-radius: 12px; border: 1px solid #343041;
  background: #221f29; color: #ece8f1; cursor: grab; width: 100%; height: auto; line-height: 1.25; }
.ov-bib-item:hover { border-color: #f0a03c; }
.ov-bib-item img { width: 64px; height: 64px; object-fit: contain; border: none; filter: drop-shadow(4px 8px 5px rgba(0,0,0,.6)); pointer-events: none; }
.ov-bib-item b { font-size: 13px; } .ov-bib-item span { font-size: 11px; color: #a8a1b4; }
.ov-bib-linha { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 12px; border: 1px solid #343041; background: #221f29; margin-bottom: 8px; cursor: grab; }
.ov-bib-linha:hover { border-color: #f0a03c; }
.ov-bib-linha img { width: 48px; height: 48px; object-fit: contain; border: none; pointer-events: none; }
.ov-bib-linha .ov-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .ov-bib-linha .ov-txt b { font-size: 13px; } .ov-bib-linha .ov-txt span { font-size: 11px; color: #a8a1b4; }
.ov-bib-aba { padding: 0 6px; }
.ov-bib-vazio { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; font-size: 13px; color: #cfc8da; }
.ov-bib-vazio p { margin: 0; line-height: 1.45; }
.ov-assets-topo { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.ov-assets-busca { width: 100%; height: 34px; box-sizing: border-box; border-radius: 8px; border: 1px solid #343041; background: #1e1b24; color: #ece8f1; padding: 0 10px; margin-bottom: 8px; }
.ov-assets-dir { display: flex; align-items: center; gap: 8px; width: 100%; height: 34px; padding: 0 10px; margin-bottom: 4px; border-radius: 8px; border: 1px solid #343041;
  background: #221f29; color: #ece8f1; font-size: 13px; cursor: pointer; text-align: left; }
.ov-assets-dir:hover { border-color: #f0a03c; } .ov-assets-dir i { color: #f0a03c; }
.ov-assets-grade { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 6px; }
.ov-asset { aspect-ratio: 1; padding: 4px; border-radius: 8px; border: 1px solid #343041; background: #221f29 repeating-conic-gradient(#2a2632 0 25%, #221f29 0 50%) 0 0 / 16px 16px;
  cursor: grab; height: auto; width: 100%; display: flex; align-items: center; justify-content: center; }
.ov-asset:hover { border-color: #f0a03c; }
.ov-asset img, .ov-asset video { max-width: 100%; max-height: 100%; object-fit: contain; border: none; pointer-events: none; }
.ov-asset[hidden], .ov-assets-dir[hidden] { display: none; }
.ov-dd-abrir { width: 100%; }
.ov-dd-cab { display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 10px; border-radius: 10px; background: rgba(240,160,60,.08); border: 1px solid #f0a03c66; }
.ov-dd-cab > i { font-size: 20px; color: #f0a03c; }
.ov-dd-cab .ov-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; } .ov-dd-cab .ov-txt b { font-size: 14px; } .ov-dd-cab .ov-txt span { font-size: 11px; color: #a8a1b4; }
.ov-dd-tag { margin-left: auto; font-size: 10px; padding: 2px 6px; border-radius: 999px; background: #3a2a14; color: #ffc27a; }
.ov-encaixe-aviso { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 10000; padding: 10px 16px; border-radius: 10px;
  background: #17151cf0; border: 1px solid #f0a03c; color: #ece8f1; font-family: Signika, system-ui, sans-serif; font-size: 13px; pointer-events: none;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); max-width: 90vw; text-align: center; }
.ov-encaixe-valores { display: block; margin-top: 4px; color: #ffd09a; font-weight: 600; }
body.ov-encaixando #board { cursor: crosshair !important; }
.ov-bib-dica { margin: 0; padding: 10px 14px; border-top: 1px solid #343041; font-size: 12px; color: #a8a1b4; flex: none; }
`;
function injetarEstilo() {
  if (document.getElementById("ov-estilo")) return;
  const st = document.createElement("style");
  st.id = "ov-estilo";
  st.textContent = CSS;
  document.head.appendChild(st);
}

const icone = nome => `<i class="fa-solid ${nome}" aria-hidden="true"></i>`;
const ICONES = { som: "fa-volume-high", portas: "fa-door-open", visibilidade: "fa-eye-low-vision", objeto: "fa-arrows-rotate", chat: "fa-comment",
  imagem: "fa-image", diario: "fa-book-open", camera: "fa-video", escuridao: "fa-moon", musica: "fa-music", mover: "fa-map-location-dot", esperar: "fa-hourglass-half" };

function nomeDoc(uuid) {
  try { const d = fromUuidSync(uuid); return d?.name || (d?.documentName === "Tile" ? nomeObjeto(d) : d?.documentName) || uuid; } catch { return uuid; }
}

// Resumo de uma ação em uma linha
function resumoAcao(a) {
  const base = resumoBase(a);
  return Number(a.atraso) > 0 ? `${t("Resumo.Depois", { n: a.atraso })} · ${base}` : base;
}
function resumoBase(a) {
  const n = x => x?.length ?? 0;
  switch (a.tipo) {
    case "som": return a.arquivo ? `${a.arquivo.split("/").pop()} · ${t(`Para.${a.para}`)}` : t("Resumo.Configurar");
    case "portas": return n(a.portas) ? `${t(`Opc.${a.estado}`)} · ${t("Resumo.PortasN", { n: n(a.portas) })}` : t("Resumo.Configurar");
    case "visibilidade": return n(a.alvos) ? `${t(`Opc.${a.estado}`)} · ${t("Resumo.ObjetosN", { n: n(a.alvos) })}` : t("Resumo.Configurar");
    case "objeto": return n(a.alvos) ? `${t(`Opc.${a.estado}`)} · ${a.alvos.map(nomeDoc).join(", ")}` : t("Resumo.Configurar");
    case "chat": return a.texto ? `"${a.texto.slice(0, 60)}"` : t("Resumo.Configurar");
    case "imagem": return a.arquivo ? a.arquivo.split("/").pop() : t("Resumo.Configurar");
    case "diario": return a.diario ? nomeDoc(a.diario) : t("Resumo.Configurar");
    case "camera": return a.regiao ? nomeDoc(a.regiao) : t("Resumo.EsteObjeto");
    case "escuridao": return `${Math.round((Number(a.valor) || 0) * 100)}% · ${a.duracao}s`;
    case "musica": return a.modo === "pararTodas" ? t("Opc.pararTodas") : a.playlist ? `${t(`Opc.${a.modo}`)} · ${game.playlists.get(a.playlist)?.name ?? "?"}` : t("Resumo.Configurar");
    case "mover": return a.destino ? `${game.scenes.get(a.destino)?.name ?? "?"} · ${t(`Opc.${a.quem}`)}` : t("Resumo.Configurar");
    case "esperar": return t("Resumo.Segundos", { n: a.segundos });
    default: return "";
  }
}

class EditorObjeto extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["ov-editor"],
    position: { width: 940, height: 700 },
    window: { icon: "fa-solid fa-wand-sparkles", resizable: true }
  };

  constructor(doc, opcoes = {}) {
    super({ ...opcoes, id: `${ID}-editor-${doc.documentName}-${doc.id}` });
    this.doc = doc;
    this.dados = { ...padrao(doc), ...clone(cfgDe(doc) ?? {}) };
    this.tile = ehTile(doc);
    this.aba = this.tile ? "aparencia" : "acoes";
    this.momento = momentosDe(doc, this.dados)[0].id;
    this.abertas = new Set();
    this.previa = this.dados.estado ?? 0;
  }

  get title() { return t("Editor.Titulo", { nome: this.dados.nome || nomeObjeto(this.doc) }); }
  get cena() { return this.doc.parent; }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "ov-raiz";
    div.innerHTML = `${this._htmlLado()}
      <section class="ov-principal">
        <nav class="ov-abas" aria-label="${esc(t("Editor.Etapas"))}">${this._abas().map(([id, nome], i) =>
          `<button type="button" class="ov-aba ${this.aba === id ? "ov-on" : ""}" data-aba="${id}"><span class="ov-n">${i + 1}</span>${esc(nome)}</button>`).join("")}</nav>
        <div class="ov-corpo">${this._htmlAba()}</div>
        <footer class="ov-rodape"><span class="ov-resumo">${esc(this._resumo())}</span>
          ${this.tile ? `<button type="button" class="ov-btn" data-a="biblioteca" data-tooltip="${esc(t("Bib.SalvarDica"))}">${icone("fa-bookmark")} ${t("Bib.Salvar")}</button>` : ""}
          <button type="button" class="ov-btn" data-a="cancelar">${t("Editor.Cancelar")}</button>
          <button type="button" class="ov-btn ov-primario" data-a="salvar">${icone("fa-floppy-disk")} ${t("Editor.Salvar")}</button></footer>
      </section>`;
    return div;
  }

  _replaceHTML(result, content) {
    const rolagem = content.querySelector(".ov-corpo")?.scrollTop ?? 0;
    content.replaceChildren(result);
    const corpo = content.querySelector(".ov-corpo");
    if (corpo) corpo.scrollTop = rolagem;
  }

  _abas() {
    return this.tile
      ? [["aparencia", t("Aba.Aparencia")], ["uso", t("Aba.Uso")], ["acoes", t("Aba.Acoes")]]
      : [["acoes", t("Aba.Acoes")]];
  }

  _resumo() {
    const d = this.dados;
    const total = Object.values(d.acoes ?? {}).reduce((s, l) => s + (l?.length ?? 0), 0);
    if (!this.tile) return t("Editor.ResumoParede", { n: total });
    return t("Editor.ResumoTile", { estados: d.estados.length, n: total, uso: t(`Uso.${d.interacao}.Resumo`) });
  }

  _htmlLado() {
    const d = this.dados;
    if (!this.tile) {
      const porta = this.doc.door > 0;
      return `<aside class="ov-lado">
        <div class="ov-palco"><span class="ov-porta">${icone(porta ? "fa-door-closed" : "fa-grip-lines-vertical")}</span>
          <span class="ov-chip">${esc(t(porta ? "Tipo.Porta" : "Tipo.Parede"))}</span></div>
        <div class="ov-campo"><label for="ov-nome">${t("Editor.Nome")}</label></div>
        <input id="ov-nome" type="text" data-geral="nome" value="${esc(d.nome ?? "")}" placeholder="${esc(nomeObjeto(this.doc))}">
        <p class="ov-dica" style="font-size:12px;color:#a8a1b4;margin:0">${t(porta ? "Editor.PortaDica" : "Editor.ParedeDica")}</p>
      </aside>`;
    }
    const atual = d.estados[this.previa] ?? d.estados[0];
    const img = atual?.img || this.doc.texture?.src || "";
    return `<aside class="ov-lado">
      <div class="ov-palco">${img ? `<img class="ov-previa" src="${esc(img)}" alt="" style="${this._estiloPrevia()}">` : `<span class="ov-porta">${icone("fa-image")}</span>`}
        <span class="ov-chip">${esc(atual?.nome ?? "")}</span></div>
      <button type="button" class="ov-btn ov-forte" data-a="testar">${icone("fa-play")} ${t("Editor.Testar")}</button>
      <div class="ov-campo"><label for="ov-nome">${t("Editor.Nome")}</label></div>
      <input id="ov-nome" type="text" data-geral="nome" value="${esc(d.nome ?? "")}" placeholder="${esc(nomeObjeto(this.doc))}">
      <span class="ov-rotulo">${t("Editor.Estados")}</span>
      ${d.estados.map((e, i) => `<div class="ov-estado ${i === this.previa ? "ov-atual" : ""}" data-e="${i}">
        <div class="ov-linha"><span class="ov-num">${i + 1}</span>
          <input type="text" data-estado="nome" value="${esc(e.nome)}" aria-label="${esc(t("Editor.NomeEstado"))}">
          ${d.estados.length > 2 ? `<button type="button" class="ov-btn ov-icone ov-perigo" data-a="estado-remover" aria-label="${esc(t("Editor.RemoverEstado"))}">${icone("fa-trash")}</button>` : ""}</div>
        <div class="ov-linha">${e.img ? `<img class="ov-mini" src="${esc(e.img)}" alt="">` : `<span class="ov-mini">${icone("fa-image")}</span>`}
          <span class="ov-arquivo" data-tooltip="${esc(e.img)}">${esc(e.img ? decodeURIComponent(e.img.split("/").pop()) : t("Editor.SemImagem"))}</span>
          <button type="button" class="ov-btn" data-a="estado-img">${t("Editor.TrocarImagem")}</button></div>
        ${i === 0 ? `<span style="font-size:11px;color:#a8a1b4">${t("Editor.Inicial")}</span>` : ""}
      </div>`).join("")}
      <button type="button" class="ov-btn" data-a="estado-add" style="border-style:dashed">+ ${t("Editor.AdicionarEstado")}</button>
      ${new Set(d.estados.map(e => e.img)).size === 1 ? `<p class="ov-aviso-img">${icone("fa-lightbulb")} ${t("Editor.MesmaImagem")}</p>` : ""}
    </aside>`;
  }

  _htmlAba() {
    const d = this.dados;
    const chave = (on, campo, nome, desc) => `<div class="ov-faixa"><div class="ov-txt"><b>${esc(nome)}</b><span>${esc(desc)}</span></div>
      <button type="button" role="switch" aria-checked="${on}" aria-label="${esc(nome)}" class="ov-chave ${on ? "ov-on" : ""}" data-chave="${campo}"><span></span></button></div>`;
    const passo = (campo, texto, nome, desc) => `<div class="ov-faixa"><div class="ov-txt"><b>${esc(nome)}</b><span>${esc(desc)}</span></div>
      <button type="button" class="ov-btn ov-icone" data-menos="${campo}" aria-label="−">−</button><span class="ov-valor">${esc(texto)}</span>
      <button type="button" class="ov-btn ov-icone" data-mais="${campo}" aria-label="+">+</button></div>`;

    if (this.aba === "aparencia") {
      const p = d.prof ?? profPadrao("plano");
      const faixa = (campo, max, sufixo = "") => `<div class="ov-faixa ov-faixa-linha"><b>${t(`Prof.${campo}`)}</b>
        <input type="range" min="0" max="${max}" step="1" data-prof="${campo}" value="${Number(p[campo]) || 0}" aria-label="${esc(t(`Prof.${campo}`))}">
        <span class="ov-valor">${Number(p[campo]) || 0}${sufixo}</span></div>`;
      return `
      <section style="display:flex;flex-direction:column;gap:8px"><h2>${t("Prof.Titulo")}</h2><p class="ov-dica">${t("Prof.Dica")}</p>
        <div class="ov-pilulas">${Object.keys(PROFS).map(n =>
          `<button type="button" class="ov-pilula ${p.preset === n ? "ov-on" : ""}" data-prof-preset="${n}">${t(`Prof.${n}`)}</button>`).join("")}</div>
        ${faixa("sombra", 100)}${faixa("altura", 30)}${faixa("incl", 40, "°")}
        ${chave(!!p.parallax, "parallax", t("Prof.Parallax"), t("Prof.ParallaxDica"))}</section>
      <section style="display:flex;flex-direction:column;gap:8px"><h2>${icone("fa-eye-slash")} ${t("Camaleao.Titulo")}</h2>
        ${chave(!!d.camaleao, "camaleao", t("Camaleao.Ligar"), t("Camaleao.LigarDica"))}
        ${d.camaleao ? `
          ${chave(!!d.revelarAoUsar, "revelarAoUsar", t("Camaleao.Revelar"), t("Camaleao.RevelarDica"))}
          ${d.revelado ? `<div class="ov-faixa"><div class="ov-txt"><b>${t("Camaleao.Revelado")}</b></div>
            <button type="button" class="ov-btn" data-a="reesconder">${icone("fa-eye-slash")} ${t("Camaleao.Reesconder")}</button></div>` : ""}
          <button type="button" class="ov-btn ${this.verCamo ? "ov-forte" : ""}" data-a="ver-camo" style="align-self:flex-start">${icone(this.verCamo ? "fa-eye" : "fa-user")} ${t(this.verCamo ? "Camaleao.VerParar" : "Camaleao.Ver")}</button>
          <p class="ov-dica">${t("Camaleao.SemProf")}</p>` : ""}</section>
      <section><h2>${t("Aparencia.Anim")}</h2>
        <div class="ov-pilulas">${ANIMS.map(a => `<button type="button" class="ov-pilula ${d.anim === a ? "ov-on" : ""}" data-anim="${a}">${t(`Anim.${a}`)}</button>`).join("")}</div>
        <p class="ov-dica" style="margin-top:6px">${t("Aparencia.AnimDica")}</p></section>
      <section><h2>${t("Aparencia.Som")}</h2>
        <div class="ov-campo"><input type="text" data-geral="som" value="${esc(d.som)}" placeholder="${esc(t("Editor.Arquivo"))}" aria-label="${esc(t("Aparencia.Som"))}">
          <button type="button" class="ov-btn" data-a="som-escolher">${t("Editor.Escolher")}</button>
          <button type="button" class="ov-btn ov-icone" data-a="som-ouvir" aria-label="${esc(t("Editor.Ouvir"))}">${icone("fa-play")}</button></div>
        <p class="ov-dica" style="margin-top:6px">${t("Aparencia.SomDica")}</p></section>`;
    }

    if (this.aba === "uso") return `
      <section><h2>${t("Uso.Titulo")}</h2>
        <div class="ov-grade ov-2">${INTERACOES.map(i =>
          `<button type="button" class="ov-cartao ${d.interacao === i ? "ov-on" : ""}" data-interacao="${i}" aria-pressed="${d.interacao === i}"><b>${t(`Uso.${i}.Nome`)}</b><span>${t(`Uso.${i}.Desc`)}</span></button>`).join("")}</div></section>
      ${d.interacao === "clicar" || d.interacao === "perto" ? passo("distancia", d.distancia > 0 ? t("Valor.Casas", { n: d.distancia }) : t("Valor.Qualquer"),
          t("Uso.Distancia"), t(d.interacao === "perto" ? "Uso.DistanciaPerto" : "Uso.DistanciaClicar")) : ""}
      ${this._htmlQuem()}
      <section style="display:flex;flex-direction:column;gap:8px">
        ${chave(d.voltar > 0, "voltar", t("Regras.Voltar"), t("Regras.VoltarDica"))}
        ${d.voltar > 0 ? passo("voltar", t("Valor.Segundos", { n: d.voltar }), t("Regras.VoltarTempo"), t("Regras.VoltarTempoDica")) : ""}
      </section>
      <section style="display:flex;flex-direction:column;gap:8px"><h2>${t("Uso.Ajudas")}</h2>
        ${chave(d.mao !== false, "mao", t("Uso.Mao"), t("Uso.MaoDica"))}
        ${chave(d.brilho !== false, "brilho", t("Uso.Brilho"), t("Uso.BrilhoDica"))}
        <p class="ov-dica">${t("Uso.MestreDica")}</p></section>`;

    if (this.aba === "acoes") {
      const momentos = momentosDe(this.doc, d);
      if (!momentos.some(m => m.id === this.momento)) this.momento = momentos[0].id;
      const lista = d.acoes?.[this.momento] ?? [];
      const temNav = !!navegador();
      return `
      <section style="display:flex;flex-direction:column;gap:10px"><h2>${t("Acoes.Titulo")}</h2>
        <div class="ov-momentos">${momentos.map(m => {
          const n = d.acoes?.[m.id]?.length ?? 0;
          return `<button type="button" class="ov-momento ${this.momento === m.id ? "ov-on" : ""}" data-momento="${m.id}">${esc(m.nome)}${n ? `<span class="ov-cont">${n}</span>` : ""}</button>`;
        }).join("")}</div>
        ${lista.length ? lista.map((a, i) => this._htmlAcao(a, i)).join("") : `<p class="ov-vazio">${t("Acoes.Vazio")}</p>`}
      </section>
      <section><h2 style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#a8a1b4">${t("Acoes.Adicionar")}</h2>
        <div class="ov-grade ov-4" style="margin-top:8px">${Object.keys(ACOES).map(k => {
          const bloqueada = k === "mover" && !temNav;
          return `<button type="button" class="ov-cartao" data-nova="${k}" ${bloqueada ? "disabled" : ""}><b>${icone(ICONES[k])} ${t(`Acao.${k}`)}</b><span>${t(bloqueada ? "Acoes.PrecisaNavegador" : `AcaoDesc.${k}`)}</span></button>`;
        }).join("")}</div></section>
      <section style="display:flex;flex-direction:column;gap:8px">
        <button type="button" class="ov-btn ov-mais" data-a="mais" aria-expanded="${!!this.mais}">${icone(this.mais ? "fa-chevron-up" : "fa-chevron-down")} ${t("Mais.Titulo")}</button>
        ${this.mais ? `
          ${this.tile ? "" : this._htmlQuem()}
          ${passo("usos", d.usos > 0 ? t("Valor.Vezes", { n: d.usos }) : t("Valor.SemLimite"), t("Regras.Usos"), t("Regras.UsosDica", { n: d.usados ?? 0 }))}
          ${d.usados ? `<button type="button" class="ov-btn" data-a="zerar" style="align-self:flex-start">${icone("fa-rotate-left")} ${t("Regras.Zerar")}</button>` : ""}
          ${chave(!!d.confirmar, "confirmar", t("Regras.Confirmar"), t("Regras.ConfirmarDica"))}
          ${this.tile ? chave(!!d.trancado, "trancado", t("Regras.Trancado"), t("Regras.TrancadoDica")) : ""}` : ""}
      </section>`;
    }
    return "";
  }

  _htmlQuem() {
    const d = this.dados;
    return `<section><h2>${t("Regras.Quem")}</h2>
      <div class="ov-pilulas">${QUEM.map(q => `<button type="button" class="ov-pilula ${d.quem === q ? "ov-on" : ""}" data-quem="${q}">${t(`Quem.${q}`)}</button>`).join("")}</div>
      ${d.quem === "ator" ? `<div class="ov-campo" style="margin-top:8px"><input type="text" data-geral="ator" data-drop="Actor" value="${esc(d.ator)}" placeholder="${esc(t("Regras.ArrasteAtor"))}" aria-label="${esc(t("Quem.ator"))}">
        ${d.ator ? `<span style="font-size:12px;color:#a8a1b4">${esc(nomeDoc(d.ator))}</span>` : ""}</div>` : ""}</section>`;
  }

  // A prévia do editor imita a profundidade do mapa
  _estiloPrevia() {
    const p = this.dados.prof;
    if (!p) return "";
    const s = Number(p.sombra) || 0, a = Number(p.altura) || 0, i = Number(p.incl) || 0;
    return `transform: perspective(500px) rotateX(${i}deg) translateY(${-a}px); transform-origin: 50% 90%;`
      + (s ? ` filter: drop-shadow(${Math.round(a * 0.5 + 3)}px ${Math.round(a + 5)}px ${Math.round(2 + s / 15)}px rgba(0,0,0,${(s / 100 * 0.85).toFixed(2)}));` : "");
  }

  // Mostra no mapa, ao vivo, a profundidade que está sendo escolhida
  _previaNoMapa() {
    if (!this.tile) return;
    const tile = this.doc.object;
    if (!tile) return;
    tile._ovPrevia = clone(this.dados.prof ?? profPadrao("plano"));
    aplicarProfundidade(tile);
    const img = this.element?.querySelector(".ov-previa");
    if (img) img.setAttribute("style", this._estiloPrevia());
  }

  // Mostra no mapa, ao vivo, o camaleão como está no editor (e "ver como o jogador vê")
  _previaCamo() {
    const tile = this.tile ? this.doc.object : null;
    if (!tile) return;
    tile._ovPreviaCamo = { camaleao: !!this.dados.camaleao, revelado: !!this.dados.revelado };
    tile._ovVerCamo = !!this.verCamo;
    if (tile._ovCamo) tile._ovCamo.sujo = true;
    aplicarCamaleao(tile);
    aplicarProfundidade(tile);
  }

  async close(opcoes) {
    const tile = this.tile ? this.doc.object : null;
    if (tile) {
      delete tile._ovPrevia; delete tile._ovPreviaCamo; delete tile._ovVerCamo;
      aplicarCamaleao(tile);
      aplicarProfundidade(tile);
    }
    return super.close(opcoes);
  }

  _htmlAcao(a, i) {
    const aberta = this.abertas.has(a.id);
    const tempo = a.tipo === "esperar" ? "" : `<div class="ov-campo"><label>${t("Campo.atraso")}</label>
      <input type="number" min="0" step="0.5" data-campo="atraso" data-rerender value="${Number(a.atraso) || 0}" style="flex:none;width:90px">
      <span class="ov-dica">${t("Campo.AtrasoDica")}</span></div>`;
    const campos = aberta ? tempo + Object.entries(ACOES[a.tipo]?.campos ?? {}).map(([campo, [tipo, , escolhas]]) => this._htmlCampo(a, campo, tipo, escolhas)).join("") : "";
    return `<div class="ov-acao" data-i="${i}">
      <div class="ov-acao-cab"><span class="ov-num">${i + 1}</span>
        <div class="ov-txt"><b>${icone(ICONES[a.tipo])} ${t(`Acao.${a.tipo}`)}</b><span>${esc(resumoAcao(a))}</span></div>
        <button type="button" class="ov-btn ov-icone" data-a="subir" ${i ? "" : "disabled"} aria-label="${esc(t("Editor.Subir"))}">${icone("fa-arrow-up")}</button>
        <button type="button" class="ov-btn ov-icone" data-a="descer" aria-label="${esc(t("Editor.Descer"))}">${icone("fa-arrow-down")}</button>
        <button type="button" class="ov-btn" data-a="editar">${t(aberta ? "Editor.Fechar" : "Editor.Editar")}</button>
        <button type="button" class="ov-btn ov-icone ov-perigo" data-a="remover" aria-label="${esc(t("Editor.Remover"))}">${icone("fa-trash")}</button></div>
      ${aberta ? `<div class="ov-acao-corpo">${campos}<p class="ov-dica">${t(`AcaoDica.${a.tipo}`)}</p></div>` : ""}
    </div>`;
  }

  _htmlCampo(a, campo, tipo, escolhas) {
    const v = a[campo];
    const attr = `data-campo="${campo}"`;
    const op = (val, rot, atual) => `<option value="${esc(val)}" ${val === atual ? "selected" : ""}>${esc(rot)}</option>`;
    const ordenado = col => col.contents.slice().sort((x, y) => comparar(x.name, y.name));
    let h = "";
    switch (tipo) {
      case "cena": h = `<select ${attr} data-rerender>${op("", "—", v)}${ordenado(game.scenes).map(s => op(s.id, s.name, v)).join("")}</select>`; break;
      case "regiaoDestino":
      case "regiaoAqui": {
        const cena = tipo === "regiaoAqui" ? this.cena : game.scenes.get(a.destino);
        const vazio = t(tipo === "regiaoAqui" ? "Resumo.EsteObjeto" : "Campo.PontoChegada");
        h = `<select ${attr}>${op("", vazio, v)}${(cena?.regions?.contents ?? []).map(r => op(r.uuid, r.name, v)).join("")}</select>`;
        break;
      }
      case "opcao": h = `<select ${attr} data-rerender>${escolhas.map(x => op(x, t(`Opc.${x}`), v)).join("")}</select>`; break;
      case "para": h = `<select ${attr} data-rerender>${PARA.map(x => op(x, t(`Para.${x}`), v)).join("")}</select>`; break;
      case "audio":
      case "imagem":
        h = `<input type="text" ${attr} value="${esc(v)}" placeholder="${esc(t("Editor.Arquivo"))}">
          <button type="button" class="ov-btn ov-icone" data-a="arquivo" data-tipo="${tipo === "audio" ? "audio" : "image"}" data-campo-alvo="${campo}" aria-label="${esc(t("Editor.Escolher"))}">${icone("fa-file-import")}</button>
          ${tipo === "audio" ? `<button type="button" class="ov-btn ov-icone" data-a="ouvir" aria-label="${esc(t("Editor.Ouvir"))}">${icone("fa-play")}</button>` : ""}`;
        break;
      case "faixa": h = `<input type="range" min="0" max="1" step="0.05" ${attr} value="${Number(v) || 0}" style="flex:1"><span class="ov-valor">${Math.round((Number(v) || 0) * 100)}%</span>`; break;
      case "numero": h = `<input type="number" min="0" step="0.5" ${attr} value="${Number(v) || 0}" style="flex:none;width:90px">`; break;
      case "texto": h = `<input type="text" ${attr} value="${esc(v)}">`; break;
      case "textoLongo": h = `<textarea ${attr} placeholder="${esc(t("Campo.TextoExemplo"))}">${esc(v)}</textarea>`; break;
      case "playlist": h = `<select ${attr} data-rerender>${op("", "—", v)}${ordenado(game.playlists).map(p => op(p.id, p.name, v)).join("")}</select>`; break;
      case "diario": {
        const ops = [];
        for (const j of ordenado(game.journal)) {
          ops.push(op(j.uuid, j.name, v));
          for (const p of j.pages?.contents ?? []) ops.push(op(p.uuid, `↳ ${p.name}`, v));
        }
        h = `<select ${attr} data-rerender>${op("", "—", v)}${ops.join("")}</select>`;
        break;
      }
      case "portas":
        h = `<span>${t("Resumo.PortasN", { n: v.length })}</span>
          <button type="button" class="ov-btn" data-a="portas-add">${icone("fa-plus")} ${t("Campo.UsarPortas")}</button>
          ${v.length ? `<button type="button" class="ov-btn" data-a="portas-limpar">${t("Campo.Limpar")}</button>` : ""}`;
        break;
      case "selecao":
        h = `<span data-tooltip="${esc(v.map(nomeDoc).join(", "))}">${t("Resumo.ObjetosN", { n: v.length })}</span>
          <button type="button" class="ov-btn" data-a="sel-add">${icone("fa-plus")} ${t("Campo.UsarSelecionados")}</button>
          ${v.length ? `<button type="button" class="ov-btn" data-a="sel-limpar">${t("Campo.Limpar")}</button>` : ""}`;
        break;
      case "objetos": {
        const outros = (this.cena?.tiles ?? []).filter(d => ehObjeto(d) && d.id !== this.doc.id);
        h = outros.length
          ? `<div class="ov-lista-alvos">${outros.map(d => `<label><input type="checkbox" data-alvo="${d.uuid}" ${v.includes(d.uuid) ? "checked" : ""}> ${esc(nomeObjeto(d))}</label>`).join("")}</div>`
          : `<span class="ov-dica">${t("Campo.SemObjetos")}</span>`;
        break;
      }
    }
    return `<div class="ov-campo"><label>${t(`Campo.${campo}`)}</label>${h}</div>`;
  }

  _onFirstRender() {
    injetarEstilo();
    const el = this.element;
    const valor = alvo => alvo.type === "checkbox" ? alvo.checked : alvo.type === "number" || alvo.type === "range" ? Number(alvo.value) : alvo.value;

    el.addEventListener("input", ev => this._aoDigitar(ev, valor));
    el.addEventListener("change", ev => this._aoDigitar(ev, valor, true));
    el.addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b || b.disabled) return;
      ev.preventDefault();
      this._aoClicar(b);
    });
    el.addEventListener("dragover", ev => { if (ev.target.dataset?.drop) ev.preventDefault(); });
    el.addEventListener("drop", ev => {
      if (!ev.target.dataset?.drop) return;
      ev.preventDefault();
      try {
        const dados = JSON.parse(ev.dataTransfer.getData("text/plain"));
        if (dados.type !== "Actor" || !dados.uuid) return ui.notifications.warn(t("Regras.SoAtor"));
        this.dados.ator = dados.uuid;
        this.render();
      } catch {}
    });
  }

  _acaoDe(alvo) {
    const i = alvo.closest("[data-i]")?.dataset.i;
    return i === undefined ? null : this.dados.acoes[this.momento]?.[Number(i)];
  }

  _aoDigitar(ev, valor, mudou = false) {
    const alvo = ev.target, d = this.dados;
    if (alvo.dataset.geral) { d[alvo.dataset.geral] = valor(alvo); return; }
    if (alvo.dataset.prof) {
      d.prof ??= profPadrao("plano");
      d.prof[alvo.dataset.prof] = Number(alvo.value) || 0;
      if (d.prof.preset) {
        d.prof.preset = "";
        this.element?.querySelectorAll("[data-prof-preset]").forEach(b => b.classList.remove("ov-on"));
      }
      const rotulo = alvo.nextElementSibling;
      if (rotulo) rotulo.textContent = `${alvo.value}${alvo.dataset.prof === "incl" ? "°" : ""}`;
      this._previaNoMapa();
      return;
    }
    if (alvo.dataset.estado) {
      const i = Number(alvo.closest("[data-e]").dataset.e);
      d.estados[i][alvo.dataset.estado] = alvo.value;
      if (mudou) this.render();
      return;
    }
    const a = this._acaoDe(alvo);
    if (!a) return;
    if (alvo.dataset.alvo && mudou) {
      a.alvos = alvo.checked ? [...new Set([...a.alvos, alvo.dataset.alvo])] : a.alvos.filter(x => x !== alvo.dataset.alvo);
      return this.render();
    }
    if (!alvo.dataset.campo) return;
    a[alvo.dataset.campo] = valor(alvo);
    if (alvo.type === "range") alvo.nextElementSibling.textContent = `${Math.round(Number(alvo.value) * 100)}%`;
    if (mudou && alvo.dataset.rerender !== undefined) {
      if (alvo.dataset.campo === "destino") a.regiao = "";
      this.render();
    }
  }

  _noMapa() {
    if (canvas.scene?.id === this.cena?.id) return true;
    ui.notifications.warn(t("Campo.AbraOMapa", { mapa: this.cena?.name ?? "?" }));
    return false;
  }

  _escolherArquivo(tipo, atual, aoEscolher) {
    const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    new FP({ type: tipo, current: atual || "", callback: caminho => { aoEscolher(caminho); this.render(); } }).render(true);
  }

  async _aoClicar(b) {
    const d = this.dados, ds = b.dataset;
    if (ds.aba) { this.aba = ds.aba; return this.render(); }
    if (ds.preset) {
      const p = PRESETS[ds.preset];
      d.preset = ds.preset;
      d.anim = p.anim; d.interacao = p.interacao; d.voltar = p.voltar;
      p.estados.forEach((n, i) => { if (d.estados[i]) d.estados[i].nome = t(n); });
      return this.render();
    }
    if (ds.anim) { d.anim = ds.anim; this.render(); return this._animarPrevia(); }
    if (ds.interacao) { d.interacao = ds.interacao; return this.render(); }
    if (ds.quem) { d.quem = ds.quem; return this.render(); }
    if (ds.momento) { this.momento = ds.momento; return this.render(); }
    if (ds.profPreset) {
      d.prof = { ...profPadrao(ds.profPreset), parallax: d.prof?.parallax ?? ds.profPreset !== "plano" };
      this.render();
      return this._previaNoMapa();
    }
    if (ds.chave) {
      if (ds.chave === "parallax") { d.prof ??= profPadrao("plano"); d.prof.parallax = !d.prof.parallax; this.render(); return this._previaNoMapa(); }
      if (ds.chave === "camaleao" || ds.chave === "revelarAoUsar") {
        d[ds.chave] = !d[ds.chave];
        if (ds.chave === "camaleao" && !d.camaleao) this.verCamo = false;
        this.render();
        return this._previaCamo();
      }
      if (ds.chave === "voltar") d.voltar = d.voltar > 0 ? 0 : 3;
      else d[ds.chave] = !(d[ds.chave] ?? (ds.chave === "mao" || ds.chave === "brilho"));
      return this.render();
    }
    if (ds.menos || ds.mais) {
      const campo = ds.menos || ds.mais, delta = ds.menos ? -1 : 1;
      const minimo = campo === "voltar" ? 1 : 0;
      d[campo] = Math.min(campo === "distancia" ? 20 : 999, Math.max(minimo, (Number(d[campo]) || 0) + delta));
      return this.render();
    }
    if (ds.nova) {
      const a = novaAcao(ds.nova);
      (d.acoes[this.momento] ??= []).push(a);
      this.abertas.add(a.id);
      return this.render();
    }
    const lista = d.acoes[this.momento] ?? [];
    const a = this._acaoDe(b);
    const i = a ? lista.indexOf(a) : -1;
    switch (ds.a) {
      case "salvar": return this._salvar();
      case "cancelar": return this.close();
      case "mais": this.mais = !this.mais; break;
      case "reesconder": d.revelado = false; this.render(); return this._previaCamo();
      case "ver-camo": this.verCamo = !this.verCamo; this.render(); return this._previaCamo();
      case "biblioteca": return salvarNaBiblioteca(this.doc, this.dados);
      case "testar":
        this.previa = (this.previa + 1) % d.estados.length;
        this.render();
        return setTimeout(() => this._animarPrevia(), 30);
      case "estado-add": d.estados.push({ id: novoId(), nome: t("Est.Novo", { n: d.estados.length + 1 }), img: d.estados.at(-1)?.img ?? "" }); break;
      case "estado-remover": {
        const e = Number(b.closest("[data-e]").dataset.e);
        const [fora] = d.estados.splice(e, 1);
        delete d.acoes[`estado:${fora.id}`];
        this.previa = 0;
        if (d.estado >= d.estados.length) d.estado = 0;
        break;
      }
      case "estado-img": {
        const e = d.estados[Number(b.closest("[data-e]").dataset.e)];
        return this._escolherArquivo("image", e.img, c => { e.img = c; });
      }
      case "som-escolher": return this._escolherArquivo("audio", d.som, c => { d.som = c; });
      case "som-ouvir": if (d.som) foundry.audio.AudioHelper.play({ src: d.som, volume: 0.8, loop: false, channel: "environment" }, false); return;
      case "zerar": d.usados = 0; break;
      case "subir": if (i > 0) [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]]; break;
      case "descer": if (i >= 0 && i < lista.length - 1) [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]]; break;
      case "editar": this.abertas.has(a.id) ? this.abertas.delete(a.id) : this.abertas.add(a.id); break;
      case "remover": lista.splice(i, 1); break;
      case "arquivo": return this._escolherArquivo(ds.tipo, a[ds.campoAlvo], c => { a[ds.campoAlvo] = c; });
      case "ouvir": if (a?.arquivo) foundry.audio.AudioHelper.play({ src: a.arquivo, volume: Number(a.volume) || 0.8, loop: false, channel: "environment" }, false); return;
      case "portas-add": {
        if (!this._noMapa()) return;
        const ids = (canvas.walls?.controlled ?? []).filter(w => w.document.door > 0).map(w => w.document.id);
        if (!ids.length) return ui.notifications.warn(t("Campo.SelecionePortas"));
        a.portas = [...new Set([...a.portas, ...ids])];
        break;
      }
      case "portas-limpar": a.portas = []; break;
      case "sel-add": {
        if (!this._noMapa()) return;
        const camadas = [canvas.tiles, canvas.tokens, canvas.lighting, canvas.sounds, canvas.drawings, canvas.notes];
        const uuids = camadas.flatMap(c => c?.controlled ?? []).map(o => o.document.uuid);
        if (!uuids.length) return ui.notifications.warn(t("Campo.SelecioneObjetos"));
        a.alvos = [...new Set([...a.alvos, ...uuids])];
        break;
      }
      case "sel-limpar": a.alvos = []; break;
      default: return;
    }
    this.render();
  }

  _animarPrevia() {
    const img = this.element?.querySelector(".ov-previa");
    if (!img || this.dados.anim === "nenhuma") return;
    img.classList.remove(...ANIMS.map(a => `ov-testar-${a}`));
    void img.offsetWidth;
    img.classList.add(`ov-testar-${this.dados.anim}`);
  }

  async _salvar() {
    const d = clone(this.dados);
    d.nome = (d.nome ?? "").trim();
    d.distancia = Math.max(0, Number(d.distancia) || 0);
    d.usos = Math.max(0, Math.floor(Number(d.usos) || 0));
    const upd = { [`flags.${ID}.objeto`]: d };
    if (this.tile) {
      d.estado = Math.min(d.estado ?? 0, d.estados.length - 1);
      const img = d.estados[d.estado]?.img;
      if (img && img !== this.doc.texture?.src) upd["texture.src"] = img;
    }
    await this.doc.update(upd);
    atualizarSecoes(this.doc);
    ui.notifications.info(t("Aviso.Salvo", { objeto: d.nome || nomeObjeto(this.doc) }));
    this.close();
  }
}

function abrirEditor(doc) {
  if (!doc?.id) return ui.notifications.warn(t("Aviso.SalvePrimeiro"));
  const existente = foundry.applications.instances?.get?.(`${ID}-editor-${doc.documentName}-${doc.id}`);
  if (existente) return existente.render({ force: true });
  injetarEstilo();
  new EditorObjeto(doc).render({ force: true });
}

// Criar um objeto no mapa: de um modelo pronto, de uma imagem do mestre ou de "Meus objetos"
async function tamanhoDaImagem(src, gs, pxPorCasa = null) {
  try {
    const carregar = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
    const tex = await carregar(src);
    const w = tex?.width || gs, h = tex?.height || gs;
    const escala = pxPorCasa ? gs / pxPorCasa : (gs * 1.5) / Math.max(w, h);
    return { w: Math.round(w * escala), h: Math.round(h * escala) };
  } catch { return { w: gs, h: gs }; }
}

// Monta a configuração, a imagem e o tamanho de um objeto novo
async function prepararObjeto({ preset = null, img = null, salvo = null, pxPorCasa = null } = {}) {
  const gs = canvas.dimensions.size;
  let cfg, w = gs, h = gs;
  if (salvo) {
    cfg = clone(salvo.cfg);
    cfg.estado = 0; cfg.usados = 0;
    w = Math.round((salvo.w || 1) * gs); h = Math.round((salvo.h || 1) * gs);
  } else if (img) {
    cfg = padrao(null, "livre", img);
    cfg.nome = nomeDoArquivo(img);
    ({ w, h } = await tamanhoDaImagem(img, gs, pxPorCasa));
  } else cfg = padrao(null, preset ?? "alavanca");
  const src = cfg.estados?.[0]?.img;
  return src ? { cfg, src, w, h, rotacao: salvo?.rotacao ?? 0 } : null;
}
const nomeDoArquivo = caminho => decodeURIComponent(String(caminho).split("/").pop().replace(/\.[a-z0-9]+$/i, "")).replace(/[-_]+/g, " ").trim();

// Onde o centro do objeto cai: objetos de casas inteiras ocupam casas; os outros encaixam a cada meia casa
function centroEncaixado(x, y, w, h, livre = false) {
  if (livre) return { x, y };
  const gs = canvas.dimensions.size;
  if (w % gs === 0 && h % gs === 0) {
    return { x: Math.floor((x - w / 2 + gs / 2) / gs) * gs + w / 2, y: Math.floor((y - h / 2 + gs / 2) / gs) * gs + h / 2 };
  }
  const meia = gs / 2;
  return { x: Math.round(x / meia) * meia, y: Math.round(y / meia) * meia };
}

async function criarObjeto({ preset = null, img = null, salvo = null, pxPorCasa = null, x = null, y = null, rotacao = null, escala = 1, livre = false, pronto = null } = {}) {
  if (!game.user.isGM) return;
  const cena = canvas.scene;
  if (!cena) return ui.notifications.warn(t("Bib.SemMapa"));
  const p = pronto ?? await prepararObjeto({ preset, img, salvo, pxPorCasa });
  if (!p) return;
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
let encaixe = null;
function cancelarEncaixe() {
  if (!encaixe) return;
  const e = encaixe;
  encaixe = null;
  for (const [nome, fn] of e.ouvintes) window.removeEventListener(nome, fn, { capture: true });
  e.spr?.destroy?.();
  e.aviso?.remove?.();
  document.body.classList.remove("ov-encaixando");
}

async function encaixar(opcoes = {}) {
  if (!game.user.isGM) return;
  if (!canvas.ready || !canvas.scene) return ui.notifications.warn(t("Bib.SemMapa"));
  cancelarEncaixe();
  const p = await prepararObjeto(opcoes);
  if (!p) return;
  const carregar = foundry.canvas?.loadTexture ?? globalThis.loadTexture;
  let tex = null;
  try { tex = await carregar(p.src); } catch {}
  const view = canvas.app?.view ?? canvas.app?.canvas;
  if (!tex || !view || !globalThis.PIXI?.Sprite) return criarObjeto({ pronto: p });

  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(0.5);
  spr.alpha = 0.75;
  spr.eventMode = "none";
  (canvas.controls ?? canvas.interface).addChild(spr);
  const e = { p, spr, rot: p.rotacao ?? 0, escala: 1, x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, livre: false, ouvintes: [] };
  encaixe = e;
  injetarEstilo();
  e.aviso = document.createElement("div");
  e.aviso.className = "ov-encaixe-aviso";
  e.aviso.setAttribute("role", "status");
  document.body.append(e.aviso);
  document.body.classList.add("ov-encaixando");

  const desenhar = () => {
    const w = p.w * e.escala, h = p.h * e.escala;
    const c = centroEncaixado(e.x, e.y, w, h, e.livre);
    spr.width = w; spr.height = h;
    spr.position.set(c.x, c.y);
    spr.rotation = e.rot * Math.PI / 180;
    e.aviso.innerHTML = `<b>${esc(p.cfg.nome || t(`Preset.${p.cfg.preset}.Nome`))}</b> · ${t("Encaixe.Dica")}
      <span class="ov-encaixe-valores">${Math.round(e.rot)}° · ${Math.round(e.escala * 100)}% · ${t(e.livre ? "Encaixe.Livre" : "Encaixe.Grade")}</span>`;
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
    const dados = { pronto: p, x: q.x, y: q.y, rotacao: e.rot, escala: e.escala, livre: ev.shiftKey };
    cancelarEncaixe();
    criarObjeto(dados);
  });
  // O Foundry também escuta soltar e o menu do botão direito: enquanto encaixa, eles ficam com a gente
  for (const nome of ["pointerup", "contextmenu"]) ouvir(nome, ev => { if (noMapa(ev)) { ev.preventDefault(); ev.stopImmediatePropagation(); } });
  ouvir("keydown", ev => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancelarEncaixe();
  });
  desenhar();
}

function escolherImagem() {
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  new FP({ type: "imagevideo", callback: caminho => encaixar({ img: caminho }) }).render(true);
}

// "Meus objetos": objetos que o mestre salvou para reaproveitar em qualquer mapa
const meusObjetos = () => game.settings.get(ID, "biblioteca") ?? [];
async function salvarNaBiblioteca(doc, dados) {
  const gs = doc.parent?.dimensions?.size ?? canvas.dimensions.size;
  const cfg = clone(dados);
  cfg.estado = 0; cfg.usados = 0;
  // Portas, objetos e regiões escolhidos nas ações são deste mapa; em outro mapa não valeriam
  for (const lista of Object.values(cfg.acoes ?? {})) for (const a of lista ?? []) {
    if (Array.isArray(a.portas)) a.portas = [];
    if (Array.isArray(a.alvos)) a.alvos = [];
    if (a.tipo === "camera") a.regiao = "";
  }
  const nome = (cfg.nome || nomeObjeto(doc)).trim();
  const lista = meusObjetos().filter(o => o.nome !== nome);
  lista.unshift({ id: novoId(), nome, img: cfg.estados?.[0]?.img ?? doc.texture?.src ?? "", w: doc.width / gs, h: doc.height / gs, cfg });
  await game.settings.set(ID, "biblioteca", lista);
  ui.notifications.info(t("Bib.Salvo", { objeto: nome }));
  foundry.applications.instances?.get?.(`${ID}-biblioteca`)?.render();
}

// Pacotes do Dungeondraft (.dungeondraft_pack): são pacotes do motor Godot (formato "GDPC").
// Lemos só o índice; cada imagem é recortada do arquivo quando precisa, sem carregar o pacote inteiro.
const DD_PX_POR_CASA = 256;
const EXT_DD = /\.(png|webp|jpe?g)$/i;
let pacoteAberto = null;

async function lerPacoteDD(blob, nomeArquivo = "") {
  let buf = new Uint8Array(0), ini = 0, pos = 0;
  const garantir = async n => {
    if (pos + n <= ini + buf.length) return;
    const fim = Math.min(blob.size, Math.max(pos + n, ini + buf.length + (1 << 20)));
    buf = new Uint8Array(await blob.slice(pos, fim).arrayBuffer());
    ini = pos;
    if (pos + n > ini + buf.length) throw new Error("pacote cortado");
  };
  const u32 = async () => { await garantir(4); const v = new DataView(buf.buffer, buf.byteOffset + pos - ini, 4).getUint32(0, true); pos += 4; return v; };
  const u64 = async () => { const lo = await u32(), hi = await u32(); return hi * 4294967296 + lo; };
  const bytes = async n => { await garantir(n); const b = buf.slice(pos - ini, pos - ini + n); pos += n; return b; };

  if (await u32() !== 0x43504447) throw new Error("não é um pacote do Dungeondraft");
  const versao = await u32();
  await u32(); await u32(); await u32();
  let base = 0;
  if (versao >= 2) {
    const flags = await u32();
    base = await u64();
    if (flags & 1) throw new Error("pacote criptografado");
  }
  pos += 16 * 4;
  const total = await u32();
  if (total > 200000) throw new Error("índice inválido");
  const texto = new TextDecoder();
  const arquivos = [];
  for (let i = 0; i < total; i++) {
    const n = await u32();
    const caminho = texto.decode(await bytes(n)).replace(/\0+$/, "").replace(/^res:\/\//, "");
    const ofs = await u64(), tam = await u64();
    pos += 16; // md5
    if (versao >= 2) pos += 4; // flags do arquivo
    arquivos.push({ caminho, ofs: ofs + base, tam });
  }
  const cortar = a => blob.slice(a.ofs, a.ofs + a.tam);

  // Nome e autor: o pacote guarda um pack.json
  let nome = nomeArquivo.replace(/\.dungeondraft_pack$/i, ""), autor = "";
  const info = arquivos.find(a => /(^|\/)pack\.json$/i.test(a.caminho)) ?? arquivos.find(a => /^packs\/[^/]+\.json$/i.test(a.caminho));
  if (info) {
    try { const j = JSON.parse(await cortar(info).text()); nome = j.name || nome; autor = j.author || ""; } catch {}
  }
  // Só as imagens, com o caminho a partir de "textures/" (objects/, terrain/, walls/...)
  const imagens = arquivos.filter(a => EXT_DD.test(a.caminho) && a.tam > 0 && a.ofs + a.tam <= blob.size).map(a => {
    const i = a.caminho.indexOf("textures/");
    return { ...a, rel: i >= 0 ? a.caminho.slice(i + 9) : a.caminho };
  }).sort((a, b) => comparar(a.rel, b.rel));
  if (!imagens.length) throw new Error("nenhuma imagem no pacote");
  const slug = (nome || "pacote").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pacote";
  return { nome, autor, slug, blob, imagens, cortar, urls: new Map(), enviados: new Map() };
}

const tipoImagem = c => /\.webp$/i.test(c) ? "image/webp" : /\.jpe?g$/i.test(c) ? "image/jpeg" : "image/png";
function urlDaMiniatura(pac, a) {
  if (!pac.urls.has(a.rel)) pac.urls.set(a.rel, URL.createObjectURL(new Blob([pac.cortar(a)], { type: tipoImagem(a.rel) })));
  return pac.urls.get(a.rel);
}
function fecharPacote() {
  for (const u of pacoteAberto?.urls?.values?.() ?? []) URL.revokeObjectURL(u);
  pacoteAberto = null;
}

// Manda para o Foundry só a imagem que vai ser usada (os jogadores precisam carregá-la do servidor)
async function enviarDoPacote(pac, a) {
  if (pac.enviados.has(a.rel)) return pac.enviados.get(a.rel);
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const fonte = game.settings.get(ID, "pastaAssets")?.fonte || "data";
  const partes = a.rel.split("/");
  const arquivo = partes.pop();
  const pasta = ["objetos-vivos", "dungeondraft", pac.slug, ...partes].join("/");
  // Já foi enviada antes (outra sessão)? Então só reaproveita
  let existentes = [];
  try { existentes = (await FP.browse(fonte, pasta)).files ?? []; } catch {
    let atual = "";
    for (const p of pasta.split("/")) {
      atual = atual ? `${atual}/${p}` : p;
      try { await FP.createDirectory(fonte, atual); } catch {}
    }
  }
  const ja = existentes.find(f => decodeURIComponent(f.split("/").pop()) === arquivo);
  if (ja) { pac.enviados.set(a.rel, ja); return ja; }
  const file = new File([pac.cortar(a)], arquivo, { type: tipoImagem(arquivo) });
  const r = await FP.upload(fonte, pasta, file, {}, { notify: false });
  const caminho = r?.path ?? (r ? `${pasta}/${arquivo}` : null);
  if (!caminho) throw new Error("envio recusado");
  pac.enviados.set(a.rel, caminho);
  return caminho;
}

async function usarDoPacote(rel, onde = null) {
  const pac = pacoteAberto;
  const a = pac?.imagens.find(x => x.rel === rel);
  if (!a) return;
  try {
    const img = await enviarDoPacote(pac, a);
    const opcoes = { img, pxPorCasa: DD_PX_POR_CASA };
    return onde ? criarObjeto({ ...opcoes, ...onde }) : encaixar(opcoes);
  } catch (err) {
    console.error(`${ID} | não consegui usar o asset do pacote`, err);
    ui.notifications.error(t("DD.ErroEnvio"));
  }
}

const EXT_IMAGEM = /\.(png|jpe?g|webp|gif|svg|avif|webm|mp4)$/i;
const ehVideo = c => /\.(webm|mp4)$/i.test(c);

class BibliotecaObjetos extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${ID}-biblioteca`,
    classes: ["ov-biblioteca"],
    position: { width: 380, height: 640, left: 120, top: 70 },
    window: { icon: "fa-solid fa-cube", resizable: true }
  };
  aba = "prontos";
  pasta = null;      // pasta de assets aberta agora
  lista = null;      // { dirs, files } da pasta aberta
  limite = 120;

  get title() { return t("Bib.Titulo"); }

  get FP() { return foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker; }

  // Lê a pasta de assets (só a pasta aberta, sem descer em todas de uma vez, para ficar rápido)
  async _carregarPasta() {
    const salva = game.settings.get(ID, "pastaAssets") ?? {};
    this.pasta ??= salva.pasta || null;
    if (!this.pasta) { this.lista = null; return; }
    try {
      const r = await this.FP.browse(salva.fonte || "data", this.pasta);
      this.lista = {
        dirs: (r.dirs ?? []).slice().sort(comparar),
        files: (r.files ?? []).filter(f => EXT_IMAGEM.test(f)).sort(comparar),
        pacotes: (r.files ?? []).filter(f => /\.dungeondraft_pack$/i.test(f)).sort(comparar)
      };
    } catch (err) {
      console.warn(`${ID} | não consegui abrir a pasta`, err);
      this.lista = { dirs: [], files: [], erro: true };
    }
  }

  _htmlPacote() {
    const pac = pacoteAberto;
    const atual = this.ddPasta ?? "";
    const prefixo = atual ? `${atual}/` : "";
    const dentro = pac.imagens.filter(a => a.rel.startsWith(prefixo));
    const subpastas = [...new Set(dentro.map(a => a.rel.slice(prefixo.length)).filter(r => r.includes("/")).map(r => r.split("/")[0]))]
      .sort((a, b) => (a === "objects" ? -1 : b === "objects" ? 1 : comparar(a, b)));
    const aqui = dentro.filter(a => !a.rel.slice(prefixo.length).includes("/"));
    // A busca procura no pacote todo, não só na pasta aberta
    const busca = (this.ddBusca ?? "").trim().toLowerCase();
    const lista = busca ? pac.imagens.filter(a => nomeDoArquivo(a.rel).toLowerCase().includes(busca)) : aqui;
    const mostrar = lista.slice(0, this.limite);
    const nomePasta = p => t(`DD.Pasta.${p}`) === `OV.DD.Pasta.${p}` ? p.replace(/[-_]+/g, " ") : t(`DD.Pasta.${p}`);
    return `<div class="ov-dd-cab">${icone("fa-box-open")}<span class="ov-txt"><b>${esc(pac.nome)}</b><span>${esc(pac.autor ? t("DD.De", { autor: pac.autor }) : "")} ${t("DD.Total", { n: pac.imagens.length })}</span></span>
        <button type="button" class="ov-btn" data-a="fechar-pacote">${t("DD.Fechar")}</button></div>
      <div class="ov-assets-topo">
        ${atual && !busca ? `<button type="button" class="ov-btn ov-icone" data-a="dd-subir" aria-label="${esc(t("Assets.Voltar"))}">${icone("fa-arrow-left")}</button>` : ""}
        <span class="ov-arquivo">${icone("fa-folder")} ${esc(busca ? t("DD.Resultados", { n: lista.length }) : atual ? atual.split("/").map(nomePasta).join(" › ") : t("DD.Inicio"))}</span></div>
      <input type="search" class="ov-assets-busca ov-dd-busca" value="${esc(this.ddBusca ?? "")}" placeholder="${esc(t("DD.Buscar"))}" aria-label="${esc(t("DD.Buscar"))}">
      ${busca ? "" : subpastas.map(d => `<button type="button" class="ov-assets-dir" data-dd-pasta="${esc(prefixo + d)}">${icone("fa-folder")} ${esc(nomePasta(d))}</button>`).join("")}
      <div class="ov-assets-grade">${mostrar.map(a => `<button type="button" class="ov-asset" draggable="true" data-dd="${esc(a.rel)}" data-tooltip="${esc(nomeDoArquivo(a.rel))}">
          <img src="${urlDaMiniatura(pac, a)}" alt="" loading="lazy"></button>`).join("")}</div>
      ${lista.length > this.limite ? `<button type="button" class="ov-btn" data-a="mais-assets" style="width:100%;margin-top:8px">${t("Assets.Mais", { n: lista.length - this.limite })}</button>` : ""}
      ${!lista.length && !subpastas.length ? `<p class="ov-vazio">${t("Assets.Vazia")}</p>` : ""}`;
  }

  _htmlAssets() {
    if (pacoteAberto) return this._htmlPacote();
    const salva = game.settings.get(ID, "pastaAssets") ?? {};
    const abrirPacote = `<button type="button" class="ov-btn ov-dd-abrir" data-a="abrir-pacote">${icone("fa-box-open")} ${t("DD.Abrir")}</button>
      <input type="file" class="ov-dd-arquivo" accept=".dungeondraft_pack" hidden>`;
    if (!salva.pasta) return `<div class="ov-bib-vazio">
        <p>${t("Assets.Explica")}</p>
        <button type="button" class="ov-btn ov-forte" data-a="pasta">${icone("fa-folder-open")} ${t("Assets.Escolher")}</button>
        <p>${t("DD.Explica")}</p>${abrirPacote}</div>`;
    const l = this.lista ?? { dirs: [], files: [] };
    const raiz = salva.pasta.replace(/\/$/, "");
    const atual = (this.pasta ?? raiz).replace(/\/$/, "");
    const podeSubir = atual !== raiz && atual.startsWith(raiz);
    const arquivos = l.files.slice(0, this.limite);
    return `<div class="ov-assets-topo">
        ${podeSubir ? `<button type="button" class="ov-btn ov-icone" data-a="subir-pasta" aria-label="${esc(t("Assets.Voltar"))}">${icone("fa-arrow-left")}</button>` : ""}
        <span class="ov-arquivo" data-tooltip="${esc(atual)}">${icone("fa-folder")} ${esc(decodeURIComponent(atual.split("/").pop() || atual))}</span>
        <button type="button" class="ov-btn" data-a="pasta">${t("Assets.Trocar")}</button></div>
      <div style="margin-bottom:8px">${abrirPacote}</div>
      <input type="search" class="ov-assets-busca" placeholder="${esc(t("Assets.Buscar"))}" aria-label="${esc(t("Assets.Buscar"))}">
      ${l.erro ? `<p class="ov-vazio">${t("Assets.Erro")}</p>` : ""}
      ${(l.pacotes ?? []).map(f => `<button type="button" class="ov-assets-dir ov-dd-item" data-pacote="${esc(f)}" data-nome="${esc(nomeDoArquivo(f).toLowerCase())}">${icone("fa-box-open")} ${esc(nomeDoArquivo(f))} <span class="ov-dd-tag">Dungeondraft</span></button>`).join("")}
      ${l.dirs.map(d => `<button type="button" class="ov-assets-dir" data-dir="${esc(d)}" data-nome="${esc(nomeDoArquivo(d).toLowerCase())}">${icone("fa-folder")} ${esc(decodeURIComponent(d.replace(/\/$/, "").split("/").pop()))}</button>`).join("")}
      <div class="ov-assets-grade">${arquivos.map(f => `<button type="button" class="ov-asset" draggable="true" data-img="${esc(f)}" data-nome="${esc(nomeDoArquivo(f).toLowerCase())}" data-tooltip="${esc(nomeDoArquivo(f))}">
          ${ehVideo(f) ? `<video src="${esc(f)}" muted loop preload="metadata"></video>` : `<img src="${esc(f)}" alt="" loading="lazy">`}</button>`).join("")}</div>
      ${l.files.length > this.limite ? `<button type="button" class="ov-btn" data-a="mais-assets" style="width:100%;margin-top:8px">${t("Assets.Mais", { n: l.files.length - this.limite })}</button>` : ""}
      ${!l.erro && !l.files.length && !l.dirs.length && !(l.pacotes ?? []).length ? `<p class="ov-vazio">${t("Assets.Vazia")}</p>` : ""}`;
  }

  async _renderHTML() {
    if (this.aba === "assets") await this._carregarPasta();
    const meus = meusObjetos();
    const div = document.createElement("div");
    div.className = "ov-bib";
    let corpo;
    if (this.aba === "prontos") corpo = `<div class="ov-bib-grade">${PRONTOS.map(p => `<button type="button" class="ov-bib-item" draggable="true" data-preset="${p}">
          <img src="${imgPreset(p, 0)}" alt=""><b>${t(`Preset.${p}.Nome`)}</b><span>${t(`Preset.${p}.Desc`)}</span></button>`).join("")}</div>`;
    else if (this.aba === "assets") corpo = this._htmlAssets();
    else corpo = meus.length
      ? meus.map(o => `<div class="ov-bib-linha" draggable="true" data-salvo="${o.id}" role="button" tabindex="0">
          <img src="${esc(o.img)}" alt=""><span class="ov-txt"><b>${esc(o.nome)}</b><span>${esc(t(`Uso.${o.cfg?.interacao ?? "clicar"}.Resumo`))}</span></span>
          <button type="button" class="ov-btn ov-icone ov-perigo" data-apagar="${o.id}" aria-label="${esc(t("Editor.Remover"))}">${icone("fa-trash")}</button></div>`).join("")
      : `<p class="ov-vazio">${t("Bib.MeusVazio")}</p>`;
    const aba = (id, nome) => `<button type="button" role="tab" aria-selected="${this.aba === id}" class="ov-bib-aba ${this.aba === id ? "ov-on" : ""}" data-aba="${id}">${nome}</button>`;
    div.innerHTML = `<div class="ov-bib-topo">
        <button type="button" class="ov-minha" data-a="imagem">${icone("fa-image")}<span><b>${t("Bib.Minha")}</b><span>${t("Bib.MinhaDica")}</span></span></button>
        <div class="ov-bib-abas" role="tablist">${aba("prontos", t("Bib.Prontos"))}${aba("assets", t("Assets.Aba"))}${aba("meus", `${t("Bib.Meus")} (${meus.length})`)}</div></div>
      <div class="ov-bib-corpo">${corpo}</div>
      <p class="ov-bib-dica">${t("Bib.Dica")}</p>`;
    return div;
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }

  _escolherPasta() {
    const atual = game.settings.get(ID, "pastaAssets") ?? {};
    new this.FP({
      type: "folder", current: atual.pasta || "",
      callback: async (caminho, fp) => {
        await game.settings.set(ID, "pastaAssets", { pasta: caminho, fonte: fp?.activeSource || atual.fonte || "data" });
        this.pasta = caminho; this.limite = 120;
        this.render();
      }
    }).render(true);
  }

  async _abrirPacote(blob, nome) {
    ui.notifications.info(t("DD.Abrindo", { nome }));
    try {
      fecharPacote();
      pacoteAberto = await lerPacoteDD(blob, nome);
      this.ddPasta = pacoteAberto.imagens.some(a => a.rel.startsWith("objects/")) ? "objects" : "";
      this.ddBusca = ""; this.limite = 120; this.aba = "assets";
      this.render();
    } catch (err) {
      console.error(`${ID} | não consegui ler o pacote`, err);
      ui.notifications.error(t("DD.ErroLer", { nome }));
    }
  }

  async close(opcoes) { fecharPacote(); return super.close(opcoes); }

  _onFirstRender() {
    injetarEstilo();
    const el = this.element;
    el.addEventListener("change", ev => {
      if (!ev.target.matches?.(".ov-dd-arquivo")) return;
      const f = ev.target.files?.[0];
      if (f) this._abrirPacote(f, f.name);
    });
    el.addEventListener("click", async ev => {
      const alvo = ev.target.closest("[data-a], [data-aba], [data-preset], [data-salvo], [data-apagar], [data-dir], [data-img], [data-dd], [data-dd-pasta], [data-pacote]");
      if (!alvo) return;
      ev.preventDefault();
      const ds = alvo.dataset;
      if (ds.apagar) {
        ev.stopPropagation();
        const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Bib.Meus") }, content: `<p>${t("Bib.ApagarPergunta")}</p>`, rejectClose: false });
        if (ok) { await game.settings.set(ID, "biblioteca", meusObjetos().filter(o => o.id !== ds.apagar)); this.render(); }
        return;
      }
      if (ds.a === "imagem") return escolherImagem();
      if (ds.a === "pasta") return this._escolherPasta();
      if (ds.a === "mais-assets") { this.limite += 120; return this.render(); }
      if (ds.a === "abrir-pacote") return el.querySelector(".ov-dd-arquivo")?.click();
      if (ds.a === "fechar-pacote") { fecharPacote(); this.limite = 120; return this.render(); }
      if (ds.a === "dd-subir") { this.ddPasta = (this.ddPasta ?? "").split("/").slice(0, -1).join("/"); this.limite = 120; return this.render(); }
      if (ds.ddPasta !== undefined) { this.ddPasta = ds.ddPasta; this.limite = 120; return this.render(); }
      if (ds.dd) return usarDoPacote(ds.dd);
      if (ds.pacote) {
        try {
          ui.notifications.info(t("DD.Abrindo", { nome: nomeDoArquivo(ds.pacote) }));
          const r = await fetch(ds.pacote);
          if (!r.ok) throw new Error(r.status);
          return this._abrirPacote(await r.blob(), decodeURIComponent(ds.pacote.split("/").pop()));
        } catch (err) { console.error(err); return ui.notifications.error(t("DD.ErroLer", { nome: nomeDoArquivo(ds.pacote) })); }
      }
      if (ds.a === "subir-pasta") { this.pasta = this.pasta.replace(/\/$/, "").split("/").slice(0, -1).join("/"); this.limite = 120; return this.render(); }
      if (ds.aba) { this.aba = ds.aba; return this.render(); }
      if (ds.dir) { this.pasta = ds.dir; this.limite = 120; return this.render(); }
      if (ds.img) return encaixar({ img: ds.img });
      if (ds.preset) return encaixar({ preset: ds.preset });
      if (ds.salvo) { const o = meusObjetos().find(x => x.id === ds.salvo); if (o) encaixar({ salvo: o }); }
    });
    // Busca na pasta aberta: só esconde o que não combina, sem redesenhar a janela
    el.addEventListener("input", ev => {
      if (ev.target.matches?.(".ov-dd-busca")) {
        this.ddBusca = ev.target.value;
        clearTimeout(this._tBusca);
        this._tBusca = setTimeout(async () => {
          await this.render();
          const campo = this.element.querySelector(".ov-dd-busca");
          if (campo) { campo.focus(); campo.setSelectionRange?.(campo.value.length, campo.value.length); }
        }, 300);
        return;
      }
      if (!ev.target.matches?.(".ov-assets-busca")) return;
      const q = ev.target.value.trim().toLowerCase();
      el.querySelectorAll("[data-nome]").forEach(b => { b.hidden = !!q && !b.dataset.nome.includes(q); });
    });
    el.addEventListener("dragstart", ev => {
      const item = ev.target.closest?.("[data-preset], [data-salvo], [data-img], [data-dd]");
      if (!item) return;
      const dados = { type: "ObjetoVivo", preset: item.dataset.preset ?? null, salvo: item.dataset.salvo ?? null, img: item.dataset.img ?? null, dd: item.dataset.dd ?? null };
      ev.dataTransfer.setData("text/plain", JSON.stringify(dados));
    });
  }
}

function abrirBiblioteca() {
  if (!game.user.isGM) return;
  injetarEstilo();
  const existente = foundry.applications.instances?.get?.(`${ID}-biblioteca`);
  if (existente) return existente.render({ force: true });
  new BibliotecaObjetos().render({ force: true });
}

// Botão "Objetos Vivos" na barra de ferramentas da esquerda (só para o mestre)
function botaoNaBarra(controles) {
  if (!game.user.isGM) return;
  const ferramentas = {
    select: { name: "select", order: 1, title: "OV.Controle.Editar", icon: "fa-solid fa-hand-pointer" },
    biblioteca: { name: "biblioteca", order: 2, title: "OV.Controle.Biblioteca", icon: "fa-solid fa-shapes", button: true, onChange: () => abrirBiblioteca() },
    imagem: { name: "imagem", order: 3, title: "OV.Controle.Imagem", icon: "fa-solid fa-image", button: true, onChange: () => escolherImagem() }
  };
  const base = { name: CONTROLE, title: "OV.Controle.Titulo", icon: "fa-solid fa-cube", layer: "tiles", visible: true, activeTool: "select" };
  if (Array.isArray(controles)) {
    controles.push({ ...base, tools: Object.values(ferramentas).map(f => ({ ...f, onClick: f.onChange })) });
    return;
  }
  controles[CONTROLE] = {
    ...base, order: (controles.tiles?.order ?? 3) + 0.5, tools: ferramentas,
    onChange: (ev, ativo) => { if (ativo) abrirBiblioteca(); }
  };
}

// Seção "Objeto Vivo" na configuração de tiles e paredes
function resumoSecao(doc) {
  const c = cfgDe(doc);
  if (!c) return t(ehTile(doc) ? "Secao.NaoETile" : "Secao.NaoEParede");
  const total = Object.values(c.acoes ?? {}).reduce((s, l) => s + (l?.length ?? 0), 0);
  return ehTile(doc)
    ? t("Secao.ResumoTile", { estado: c.estados?.[c.estado]?.nome ?? "?", n: total, uso: t(`Uso.${c.interacao}.Resumo`) })
    : t("Secao.ResumoParede", { n: total });
}

function atualizarSecoes(doc) {
  for (const fs of document.querySelectorAll(`.ov-secao[data-uuid="${doc.uuid}"]`)) {
    fs.querySelector("p").textContent = resumoSecao(doc);
    fs.querySelector('[data-a="editar"]').innerHTML = `${icone("fa-wand-sparkles")} ${t(ehObjeto(doc) ? "Secao.Editar" : "Secao.Transformar")}`;
    fs.querySelector('[data-a="remover"]').hidden = !ehObjeto(doc);
  }
}

function injetarSecao(app, html) {
  const doc = app.document;
  if (!game.user.isGM || !doc || !["Tile", "Wall"].includes(doc.documentName)) return;
  const raiz = html instanceof HTMLElement ? html : html?.[0];
  if (!raiz || raiz.querySelector(".ov-secao")) return;
  injetarEstilo();
  const fs = document.createElement("fieldset");
  fs.className = "ov-secao";
  fs.dataset.uuid = doc.uuid ?? "";
  fs.innerHTML = `<legend>${icone("fa-wand-sparkles")} ${t("Titulo")}</legend>
    <p>${esc(doc.id ? resumoSecao(doc) : t("Aviso.SalvePrimeiro"))}</p>
    ${doc.id ? `<div class="ov-botoes">
      <button type="button" data-a="editar">${icone("fa-wand-sparkles")} ${t(ehObjeto(doc) ? "Secao.Editar" : "Secao.Transformar")}</button>
      <button type="button" data-a="remover" ${ehObjeto(doc) ? "" : "hidden"}>${icone("fa-trash")} ${t("Secao.Remover")}</button></div>` : ""}`;
  fs.addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-a]");
    if (!b) return;
    ev.preventDefault();
    if (b.dataset.a === "editar") return abrirEditor(doc);
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Secao.Remover") }, content: `<p>${t("Secao.RemoverPergunta")}</p>`, rejectClose: false });
    if (ok) { await doc.unsetFlag(ID, "objeto"); atualizarSecoes(doc); }
  });
  const form = raiz.matches?.("form") ? raiz : raiz.querySelector("form") ?? raiz;
  const rodape = form.querySelector(":scope > footer, footer.form-footer, footer.sheet-footer");
  rodape ? rodape.before(fs) : form.append(fs);
  app.setPosition?.({ height: "auto" });
}

// Botões no HUD do tile (clique direito no tile, camada de tiles)
function botoesHud(hud, html) {
  if (!game.user.isGM) return;
  const doc = hud.document ?? hud.object?.document;
  const raiz = html instanceof HTMLElement ? html : html?.[0];
  const col = raiz?.querySelector(".col.right") ?? raiz?.querySelector(".col.left");
  if (!doc || !col || col.querySelector(".ov-hud")) return;
  const botao = (iconeNome, dica, fn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "control-icon ov-hud";
    b.dataset.tooltip = dica;
    b.setAttribute("aria-label", dica);
    b.innerHTML = icone(iconeNome);
    b.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); fn(); });
    col.append(b);
  };
  botao("fa-wand-sparkles", t(ehObjeto(doc) ? "Secao.Editar" : "Secao.Transformar"), () => abrirEditor(doc));
  if (ehObjeto(doc)) botao("fa-arrows-rotate", t("Hud.Alternar"), () => usarObjeto(doc, { userId: game.user.id, forcar: true }));
}

// Registro
Hooks.once("init", () => {
  injetarEstilo();
  game.settings.register(ID, "biblioteca", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "pastaAssets", { scope: "client", config: false, type: Object, default: {} });
});

Hooks.on("getSceneControlButtons", botaoNaBarra);
Hooks.on("renderTileConfig", injetarSecao);
Hooks.on("renderWallConfig", injetarSecao);
Hooks.on("renderTileHUD", botoesHud);

// Arrastar da biblioteca para o mapa
Hooks.on("dropCanvasData", (_canvas, dados) => {
  if (dados?.type !== "ObjetoVivo" || !game.user.isGM) return;
  if (dados.dd) { usarDoPacote(dados.dd, { x: dados.x, y: dados.y }); return false; }
  const salvo = dados.salvo ? meusObjetos().find(o => o.id === dados.salvo) : null;
  criarObjeto({ preset: dados.img ? null : dados.preset, img: dados.img ?? null, salvo, x: dados.x, y: dados.y });
  return false;
});

// Profundidade: reaplica sempre que o Foundry redesenha o tile ou a câmera anda
Hooks.on("refreshTile", tile => {
  if (tile._ovCamo || camuflado(tile) || camoMestre(tile)) aplicarCamaleao(tile);
  if (tile._ovSombra || profDe(tile)) aplicarProfundidade(tile);
});
for (const h of ["createTile", "deleteTile"]) Hooks.on(h, doc => { if (doc.parent?.id === canvas.scene?.id) refazerCamuflagens(); });
Hooks.on("updateScene", (cena, mud) => { if (cena.id === canvas.scene?.id && ("background" in mud || "backgroundColor" in mud)) refazerCamuflagens(); });
Hooks.on("canvasPan", () => atualizarProfundidades());

Hooks.on("drawWall", w => ouvirPorta(w.doorControl));
Hooks.on("refreshWall", w => ouvirPorta(w.doorControl));
Hooks.on("canvasReady", () => { ouvirTentativas(); ligarMapa(); lembrarPosicoes(canvas.scene); atualizarBrilho(); atualizarProfundidades(); refazerCamuflagens(); });
Hooks.on("createToken", tk => posicoes.set(tk.uuid, centroToken(tk)));
Hooks.on("deleteToken", tk => posicoes.delete(tk.uuid));
Hooks.on("updateToken", aoMoverToken);
Hooks.on("controlToken", () => atualizarBrilho());
Hooks.on("updateTile", (doc, mud) => {
  if (doc.parent?.id !== canvas.scene?.id) return;
  if (foundry.utils.hasProperty(mud, `flags.${ID}`)) { aplicarCamaleao(doc.object); aplicarProfundidade(doc.object); }
  // Mexeu a posição, o tamanho ou a imagem de um tile: o que está atrás dos camaleões mudou
  if (["x", "y", "width", "height", "rotation", "sort", "elevation", "texture", "hidden"].some(k => k in mud)) refazerCamuflagens();
  if (foundry.utils.hasProperty(mud, `flags.${ID}.objeto.estado`)) animar(doc.object, cfgDe(doc)?.anim);
  atualizarBrilho();
});

// Portas: o que aconteceu com elas
Hooks.on("updateWall", (parede, mud, op, userId) => {
  const S = CONST.WALL_DOOR_STATES;
  const antes = estadosPorta.get(parede.uuid);
  if ("ds" in mud) estadosPorta.set(parede.uuid, mud.ds);
  if (!("ds" in mud) || op?.ovInterno || !ehObjeto(parede)) return;
  let momento = { [S.OPEN]: "abrir", [S.LOCKED]: "trancar" }[mud.ds];
  if (mud.ds === S.CLOSED) momento = antes === S.LOCKED ? "destrancar" : "fechar";
  if (momento) eventoParede(parede, momento, { userId });
});
Hooks.on("createWall", w => { if (w.door > 0) estadosPorta.set(w.uuid, w.ds); });

Hooks.once("ready", () => {
  if (game.user.isGM) for (const cena of game.scenes) { lembrarPosicoes(cena); lembrarPortas(cena); }

  game.socket.on(SOCKET, async data => {
    if (data?.acao === "efeito") {
      if (data.userIds?.includes(game.user.id)) aplicarEfeito(data.efeito);
      return;
    }
    if (!souMestreAtivo()) return;
    const doc = data?.uuid ? await fromUuid(data.uuid) : null;
    if (!doc) return;
    if (data.acao === "usar") usarObjeto(doc, { tokenUuid: data.tokenUuid, userId: data.userId });
    else if (data.acao === "parede" && doc.documentName === "Wall") eventoParede(doc, data.momento, { userId: data.userId });
  });

  // API para macros e outros módulos
  game.modules.get(ID).api = {
    biblioteca: () => abrirBiblioteca(),
    criar: (opcoes = {}) => criarObjeto(opcoes),
    encaixar: (opcoes = {}) => encaixar(opcoes),
    editar: async uuid => abrirEditor(await fromUuid(uuid)),
    usar: async (uuid, tokenUuid = null) => { const d = await fromUuid(uuid); if (d && ehObjeto(d)) pedirUso(d, tokenUuid); },
    mudarEstado: async (uuid, indice) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) mudarEstado(d, indice, { cena: d.parent, token: null, userId: game.user.id, fonte: d, profundidade: 0 }); },
    trancar: async (uuid, trancado = true) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) await d.setFlag(ID, "objeto.trancado", !!trancado); }
  };
});
