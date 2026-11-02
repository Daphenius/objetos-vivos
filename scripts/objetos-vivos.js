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
// Nomes de arquivo podem ter "%" e outros caracteres que quebram decodeURIComponent: nunca deixa estourar
const decodificar = texto => { try { return decodeURIComponent(String(texto ?? "")); } catch { return String(texto ?? ""); } };
const clone = x => foundry.utils.deepClone(x);
const navegador = () => { const m = game.modules.get("navegador-mapas"); return m?.active ? m.api : null; };

// Níveis do mapa (Foundry v14): andares empilhados na mesma cena
function niveisDe(cena) {
  try {
    const col = cena?.levels ?? cena?.getEmbeddedCollection?.("Level");
    return (col?.contents ?? []).slice().sort((a, b) => (Number(a.elevation?.bottom) || 0) - (Number(b.elevation?.bottom) || 0) || (a.sort ?? 0) - (b.sort ?? 0));
  } catch { return []; }
}
// O objeto e o token estão no mesmo nível? (sem níveis no mapa, sempre sim)
function mesmoNivel(doc, tk) {
  const lv = tk?.level, lista = doc?.levels;
  const n = lista?.size ?? lista?.length ?? 0;
  if (!lv || !n) return true;
  return typeof lista.has === "function" ? lista.has(lv) : lista.includes(lv);
}

// Gazua da Mesa: um objeto (tile) pode ter fechadura. Trancado = "Trancado" do objeto OU fechadura trancada.
const gazua = () => { const m = game.modules.get("gazua-mesa"); return m?.active && m.api?.lerFechadura ? m.api : null; };
const temFechadura = doc => !!gazua()?.lerFechadura(doc);
const fechaduraTrancada = doc => { const g = gazua(); return !!(g && g.lerFechadura(doc) && g.estaTrancada(doc)); };
const estaTrancado = (doc, c = cfgDe(doc)) => !!c?.trancado || fechaduraTrancada(doc);

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
  escada:       { campos: { nivel: ["nivel", ""], chegada: ["regiaoChegada", ""], quem: ["opcao", "token", ["token", "jogadores"]], tela: ["opcao", "subindo", ["subindo", "descendo", "semTela"]] } },
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
  if (ehTile(doc) && (c?.trancado || temFechadura(doc) || c?.acoes?.destrancado?.length)) lista.push({ id: "destrancado", nome: t("Mom.destrancado") });
  if (ehTile(doc) && (c?.teste?.modo ?? "nenhum") === "desarmar") lista.push({ id: "desarmar", nome: t("Mom.desarmar") });
  if (ehTile(doc) && (c?.teste?.modo ?? "nenhum") !== "nenhum") lista.push({ id: "falha", nome: t("Mom.falha") });
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
    else if (e.tipo === "escada") await efeitoEscada(e);
  } catch (err) { console.warn(`${ID} | efeito falhou`, err); }
}

// Escada: escurece a tela, troca o nível que a pessoa vê e leva a câmera até o token
async function efeitoEscada(e) {
  let tela = document.getElementById("ov-escada");
  if (e.fase === "inicio") {
    if (!tela) { tela = document.createElement("div"); tela.id = "ov-escada"; document.body.append(tela); }
    tela.innerHTML = `<span>${esc(e.texto ?? "")}</span>`;
    requestAnimationFrame(() => tela.classList.add("ov-on"));
    clearTimeout(tela._ovFim);
    tela._ovFim = setTimeout(() => tela?.classList.remove("ov-on"), 8000); // nunca fica preso no escuro
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
    finally { for (const tk of tokens) { teleportados.delete(tk.uuid); posicoes.set(tk.uuid, centroToken(tk)); } }
    for (const tk of tokens) {
      const c = centroToken(tk);
      efeito([...new Set([...donos(tk), ...ids])], { tipo: "escada", fase: "fim", cena: cena.id, nivel: nivel?.id ?? null, x: c.x, y: c.y, token: tk.id, tela: a.tela !== "semTela" });
    }
  },
  async esperar(a) { await new Promise(r => setTimeout(r, Math.max(0, Number(a.segundos) || 0) * 1000)); }
};

// Tranca ou destranca um objeto (tile). Com fechadura da Gazua da Mesa, as duas andam juntas.
async function definirTrancado(doc, trancar, ctx = null) {
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
const destrancando = new Set();
async function aoDestrancar(doc, ctx) {
  const c = cfgDe(doc);
  if (!c || !ehTile(doc) || destrancando.has(doc.uuid) || (ctx.profundidade ?? 0) > 5) return;
  destrancando.add(doc.uuid);
  try {
    for (const a of c.acoes?.destrancado ?? []) {
      try { await rodarAcao(a, { ...ctx, fonte: doc }); } catch (err) { console.error(`${ID} |`, err); }
    }
    if (c.usarAoDestrancar) await usarObjeto(doc, { tokenUuid: ctx.token?.uuid ?? null, userId: ctx.userId, forcar: true });
  } finally { destrancando.delete(doc.uuid); }
}

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
  if (c.voltar > 0 && idx !== 0 && testeDe(c).modo !== "consertar") voltas.set(doc.uuid, setTimeout(() => mudarEstado(doc, 0, { ...ctx, token: null }), c.voltar * 1000));
}

// Alguém usou um objeto (tile)
// ---------- Teste (perícia, ferramenta, atributo, salvaguarda ou fórmula) e modo Consertar
const TESTE_PADRAO = { modo: "nenhum", como: "rolagem", minijogo: "aneis", tempo: 45, qual: "skill:arc", formula: "1d20", cd: 15, mostrarCD: false, quemRola: "jogador", tentativas: 0, feitas: 0, msgFalha: "", depois: "acoes" };
const testeDe = c => ({ ...TESTE_PADRAO, ...(c?.teste ?? {}) });
// Precisa passar no teste agora? (no Consertar, só enquanto está quebrado = primeira aparência)
function precisaTeste(c) {
  const tt = testeDe(c);
  if (tt.modo === "usar") return true;
  if (tt.modo === "consertar") return (c?.estado ?? 0) === 0;
  return false;
}
const consertado = c => testeDe(c).modo === "consertar" && (c?.estado ?? 0) !== 0;

// Opções de teste do sistema D&D 5e (perícias, ferramentas, atributos, salvaguardas)
function opcoesDeTeste() {
  const D = CONFIG.DND5E;
  if (game.system?.id !== "dnd5e" || !D) return [];
  const loc = x => game.i18n.localize(typeof x === "string" ? x : x?.label ?? "");
  const nomeFerr = k => {
    try { const n = globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${k}`); if (n && n !== k) return n; } catch {}
    const n = t(`Teste.Ferr.${k}`);
    return n.startsWith("OV.") ? k : n;
  };
  const ordenar = l => l.sort((a, b) => comparar(a.nome, b.nome));
  return [
    { nome: t("Teste.Grupo.skill"), itens: ordenar(Object.entries(D.skills ?? {}).map(([k, v]) => ({ valor: `skill:${k}`, nome: loc(v) }))) },
    { nome: t("Teste.Grupo.tool"), itens: ordenar(Object.keys(D.tools ?? D.toolIds ?? {}).map(k => ({ valor: `tool:${k}`, nome: nomeFerr(k) }))) },
    { nome: t("Teste.Grupo.ability"), itens: Object.entries(D.abilities ?? {}).map(([k, v]) => ({ valor: `ability:${k}`, nome: loc(v) })) },
    { nome: t("Teste.Grupo.save"), itens: Object.entries(D.abilities ?? {}).map(([k, v]) => ({ valor: `save:${k}`, nome: loc(v) })) }
  ];
}
function nomeDoTeste(tt) {
  if (tt.qual === "formula" || game.system?.id !== "dnd5e") return tt.formula || "1d20";
  for (const g of opcoesDeTeste()) { const i = g.itens.find(x => x.valor === tt.qual); if (i) return `${i.nome} (${g.nome})`; }
  return tt.qual;
}

// Rola o teste com o personagem. Devolve o total, ou null se a pessoa cancelou.
async function rolarTeste(ator, tt, { escondido = false } = {}) {
  const [tipo, chave] = String(tt.qual ?? "skill:arc").split(":");
  const modoRolagem = escondido ? (CONST.DICE_ROLL_MODES?.BLIND ?? "blindroll") : null;
  let r;
  try {
    if (tipo === "formula" || game.system?.id !== "dnd5e") {
      const roll = await new Roll(tt.formula || "1d20", ator?.getRollData?.() ?? {}).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: ator }), flavor: t("Teste.Titulo") }, modoRolagem ? { rollMode: modoRolagem } : {});
      return roll.total;
    }
    const novo = foundry.utils.isNewerVersion(game.system.version, "3.99");
    if (novo) {
      const janela = { configure: !escondido };
      const msg = modoRolagem ? { rollMode: modoRolagem } : {};
      if (tipo === "skill") r = await ator.rollSkill({ skill: chave }, janela, msg);
      else if (tipo === "tool") r = await ator.rollToolCheck({ tool: chave }, janela, msg);
      else if (tipo === "ability") r = await ator.rollAbilityCheck({ ability: chave }, janela, msg);
      else if (tipo === "save") r = await ator.rollSavingThrow({ ability: chave }, janela, msg);
    } else {
      const op = { fastForward: escondido, ...(modoRolagem ? { rollMode: modoRolagem } : {}) };
      if (tipo === "skill") r = await ator.rollSkill(chave, op);
      else if (tipo === "tool") r = await ator.rollToolCheck(chave, op);
      else if (tipo === "ability") r = await ator.rollAbilityTest(chave, op);
      else if (tipo === "save") r = await ator.rollAbilitySave(chave, op);
    }
  } catch (err) {
    console.error(`${ID} | não consegui rolar o teste`, err);
    ui.notifications.error(t("Teste.Erro"));
    return null;
  }
  const roll = Array.isArray(r) ? r[0] : r;
  return Number.isFinite(roll?.total) ? roll.total : null;
}

// ---------- Minijogos de conserto (abrem na tela de quem está consertando)
// A dificuldade acompanha a CD: mais anéis/pontos e passos mais finos quanto maior a CD.
function dificuldade(cd) {
  const n = Math.max(1, Math.min(30, Number(cd) || 15));
  return {
    aneis: n <= 10 ? 2 : n <= 15 ? 3 : n <= 20 ? 4 : 5,
    passo: n <= 15 ? 45 : 30,
    pontos: Math.max(4, Math.min(8, 4 + Math.floor((n - 8) / 3)))
  };
}

class MinijogoConserto extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["ov-minijogo"],
    position: { width: 460, height: "auto" },
    window: { icon: "fa-solid fa-wand-magic-sparkles", resizable: false }
  };

  constructor({ jogo = "aneis", img = "", nome = "", cd = 15, tempo = 45, titulo = "Mini.Titulo" } = {}) {
    super({ id: `${ID}-minijogo-${foundry.utils.randomID(6)}` });
    Object.assign(this, { jogo, img, nome, titulo, cd, tempo: Math.max(0, Number(tempo) || 0), dif: dificuldade(cd) });
    this.resultado = new Promise(r => { this._resolver = r; });
    this.fim = false;
    this.erros = 0;
  }

  get title() { return t(this.titulo, { nome: this.nome }); }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "ov-mini-raiz";
    div.innerHTML = `<p class="ov-mini-dica">${t(this.jogo === "runa" ? "Mini.DicaRuna" : "Mini.DicaAneis")}</p>
      <canvas class="ov-mini-tela" width="400" height="400" aria-label="${esc(t(`Mini.Jogo.${this.jogo}`))}"></canvas>
      ${this.tempo ? `<div class="ov-mini-tempo"><span class="ov-mini-barra"></span></div>` : ""}
      <div class="ov-mini-rodape"><span class="ov-mini-status" role="status"></span>
        <button type="button" class="ov-btn" data-a="desistir">${t("Mini.Desistir")}</button></div>`;
    return div;
  }
  _replaceHTML(result, content) { content.replaceChildren(result); }

  _terminar(passou) {
    if (this.fim) return;
    this.fim = true;
    cancelAnimationFrame(this._quadro);
    const st = this.element?.querySelector(".ov-mini-status");
    if (st) st.textContent = t(passou ? "Mini.Conseguiu" : "Mini.Falhou");
    this._resolver(passou);
    setTimeout(() => this.close(), passou ? 900 : 700);
  }

  async close(opcoes) {
    if (!this.fim) { this.fim = true; cancelAnimationFrame(this._quadro); this._resolver(null); }
    return super.close(opcoes);
  }

  async _onFirstRender() {
    injetarEstilo();
    this.el = this.element.querySelector(".ov-mini-tela");
    this.ctx = this.el.getContext("2d");
    this.imagem = await new Promise(r => {
      if (!this.img || /\.(webm|mp4)$/i.test(this.img)) return r(null);
      const im = new Image();
      im.onload = () => r(im); im.onerror = () => r(null);
      im.src = this.img;
    });
    this.element.querySelector('[data-a="desistir"]')?.addEventListener("click", () => this._terminar(false));
    this.inicio = performance.now();
    if (this.jogo === "runa") this._iniciarRuna(); else this._iniciarAneis();
    const laco = agora => {
      if (this.fim) return;
      if (this.tempo) {
        const resta = Math.max(0, 1 - (agora - this.inicio) / (this.tempo * 1000));
        const b = this.element?.querySelector(".ov-mini-barra");
        if (b) { b.style.width = `${resta * 100}%`; b.classList.toggle("ov-pouco", resta < 0.25); }
        if (resta <= 0) return this._terminar(false);
      }
      this._desenhar(agora);
      this._quadro = requestAnimationFrame(laco);
    };
    this._quadro = requestAnimationFrame(laco);
  }

  _fundo(alpha = 1) {
    const c = this.ctx;
    c.clearRect(0, 0, 400, 400);
    c.fillStyle = "#14121a"; c.fillRect(0, 0, 400, 400);
    if (!this.imagem) return;
    c.save(); c.globalAlpha = alpha;
    const e = Math.min(360 / this.imagem.width, 360 / this.imagem.height);
    c.drawImage(this.imagem, 200 - this.imagem.width * e / 2, 200 - this.imagem.height * e / 2, this.imagem.width * e, this.imagem.height * e);
    c.restore();
  }

  // Desenho de reserva (sem imagem): um círculo rúnico, para o minijogo nunca ficar vazio
  _circuloRunico(c) {
    c.save(); c.translate(200, 200);
    c.strokeStyle = "#8fd8ff"; c.lineWidth = 3;
    for (const r of [170, 130, 90, 50]) { c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke(); }
    for (let i = 0; i < 12; i++) {
      c.rotate(Math.PI / 6);
      c.beginPath(); c.moveTo(0, -170); c.lineTo(10, -150); c.lineTo(-8, -138); c.moveTo(0, -128); c.lineTo(0, -95); c.moveTo(-12, -112); c.lineTo(12, -100); c.stroke();
    }
    c.beginPath(); for (let i = 0; i <= 5; i++) { const a = i * 4 * Math.PI / 5 - Math.PI / 2; c.lineTo(Math.cos(a) * 88, Math.sin(a) * 88); } c.stroke();
    c.restore();
  }

  // ---------- Girar os anéis
  _iniciarAneis() {
    const { aneis, passo } = this.dif;
    const raioMax = 190, miolo = 40;
    this.aneis = Array.from({ length: aneis }, (_, i) => {
      const r0 = miolo + (raioMax - miolo) * i / aneis, r1 = miolo + (raioMax - miolo) * (i + 1) / aneis;
      let giro = 0;
      while (giro === 0) giro = passo * (1 + Math.floor(Math.random() * (360 / passo - 1)));
      return { r0, r1, giro, mostra: giro };
    });
    // Fonte da imagem: a do objeto, ou o círculo rúnico de reserva
    this.fonte = document.createElement("canvas");
    this.fonte.width = 400; this.fonte.height = 400;
    const fc = this.fonte.getContext("2d");
    if (this.imagem) {
      const e = Math.min(380 / this.imagem.width, 380 / this.imagem.height);
      fc.drawImage(this.imagem, 200 - this.imagem.width * e / 2, 200 - this.imagem.height * e / 2, this.imagem.width * e, this.imagem.height * e);
    } else this._circuloRunico(fc);
    const anelNoPonto = ev => {
      const r = this.el.getBoundingClientRect();
      const x = (ev.clientX - r.left) * 400 / r.width - 200, y = (ev.clientY - r.top) * 400 / r.height - 200;
      const d = Math.hypot(x, y);
      return this.aneis.findIndex(a => d >= a.r0 && d < a.r1);
    };
    const girar = (ev, dir) => {
      ev.preventDefault();
      if (this.fim) return;
      const i = anelNoPonto(ev);
      if (i < 0) return;
      const a = this.aneis[i];
      a.giro = ((a.giro + dir * passo) % 360 + 360) % 360;
      if (this.aneis.every(x => x.giro === 0)) setTimeout(() => this._terminar(true), 250);
    };
    this.el.addEventListener("click", ev => girar(ev, 1));
    this.el.addEventListener("contextmenu", ev => girar(ev, -1));
    this.el.addEventListener("pointermove", ev => { this.sobre = anelNoPonto(ev); });
    this.el.addEventListener("pointerleave", () => { this.sobre = -1; });
  }

  _desenharAneis() {
    const c = this.ctx;
    c.clearRect(0, 0, 400, 400);
    c.fillStyle = "#14121a"; c.fillRect(0, 0, 400, 400);
    // Fora dos anéis e o miolo ficam parados
    c.save(); c.globalAlpha = 0.35; c.drawImage(this.fonte, 0, 0); c.restore();
    c.save(); c.beginPath(); c.arc(200, 200, this.aneis[0].r0, 0, Math.PI * 2); c.clip(); c.drawImage(this.fonte, 0, 0); c.restore();
    this.aneis.forEach((a, i) => {
      // animação suave até o ângulo novo
      let dif = ((a.giro - a.mostra + 540) % 360) - 180;
      a.mostra = Math.abs(dif) < 0.5 ? a.giro : a.mostra + dif * 0.25;
      c.save();
      c.beginPath(); c.arc(200, 200, a.r1, 0, Math.PI * 2); c.arc(200, 200, a.r0, 0, Math.PI * 2, true); c.clip();
      c.fillStyle = "#14121a"; c.fillRect(0, 0, 400, 400);
      c.translate(200, 200); c.rotate(a.mostra * Math.PI / 180); c.translate(-200, -200);
      c.drawImage(this.fonte, 0, 0);
      c.restore();
      c.save();
      c.strokeStyle = i === this.sobre && !this.fim ? "#ffc27a" : "rgba(240,160,60,.35)";
      c.lineWidth = i === this.sobre ? 3 : 1.5;
      c.beginPath(); c.arc(200, 200, a.r1 - 1, 0, Math.PI * 2); c.stroke();
      c.restore();
    });
  }

  // ---------- Redesenhar a runa
  _iniciarRuna() {
    const n = this.dif.pontos;
    this.pontos = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.35;
      const r = 120 + Math.random() * 40;
      return { x: 200 + Math.cos(a) * r, y: 200 + Math.sin(a) * r };
    });
    this.pontos.push({ x: 200 + (Math.random() - 0.5) * 40, y: 200 + (Math.random() - 0.5) * 40 });
    // Ordem da runa: passa por todos os pontos, numa ordem embaralhada
    const ordem = this.pontos.map((_, i) => i);
    for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
    this.ordem = ordem;
    this.feito = [];
    this.mostrarAte = performance.now() + 900 + ordem.length * 450 + 1200;
    this.inicio = this.mostrarAte; // o tempo só começa a contar depois de ver a runa
    const st = this.element.querySelector(".ov-mini-status");
    if (st) st.textContent = t("Mini.Memorize");
    this.el.addEventListener("click", ev => {
      if (this.fim || performance.now() < this.mostrarAte) return;
      const r = this.el.getBoundingClientRect();
      const x = (ev.clientX - r.left) * 400 / r.width, y = (ev.clientY - r.top) * 400 / r.height;
      const i = this.pontos.findIndex(p => Math.hypot(p.x - x, p.y - y) < 22);
      if (i < 0 || this.feito.includes(i)) return;
      if (i === this.ordem[this.feito.length]) {
        this.feito.push(i);
        if (this.feito.length === this.ordem.length) setTimeout(() => this._terminar(true), 250);
      } else {
        this.erros++;
        this.erroAte = performance.now() + 450;
        this.feito = [];
        const st2 = this.element.querySelector(".ov-mini-status");
        if (st2) st2.textContent = t("Mini.Erros", { n: this.erros, max: 3 });
        if (this.erros >= 3) this._terminar(false);
      }
    });
  }

  _desenharRuna(agora) {
    const c = this.ctx;
    this._fundo(0.28);
    const mostrando = agora < this.mostrarAte;
    if (!mostrando && this._avisou !== true) {
      this._avisou = true;
      const st = this.element.querySelector(".ov-mini-status");
      if (st && !this.erros) st.textContent = t("Mini.Sua");
    }
    const linha = (lista, cor, largura) => {
      if (lista.length < 2) return;
      c.save(); c.strokeStyle = cor; c.lineWidth = largura; c.lineCap = "round"; c.lineJoin = "round";
      c.shadowColor = cor; c.shadowBlur = 14;
      c.beginPath(); lista.forEach((i, k) => { const p = this.pontos[i]; k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); c.stroke(); c.restore();
    };
    if (mostrando) {
      const quantos = Math.min(this.ordem.length, 1 + Math.floor(Math.max(0, agora - (this.mostrarAte - 1200 - this.ordem.length * 450)) / 450));
      linha(this.ordem.slice(0, quantos), "#8fd8ff", 5);
    } else linha(this.feito, this.erroAte > agora ? "#ff8a7a" : "#ffc27a", 5);
    this.pontos.forEach((p, i) => {
      const ativo = this.feito.includes(i);
      c.save();
      c.fillStyle = ativo ? "#ffc27a" : "#2a2532"; c.strokeStyle = ativo ? "#fff3dd" : "#8fd8ff"; c.lineWidth = 2;
      c.shadowColor = "#8fd8ff"; c.shadowBlur = ativo ? 16 : 8;
      c.beginPath(); c.arc(p.x, p.y, 11, 0, Math.PI * 2); c.fill(); c.stroke();
      c.restore();
    });
  }

  _desenhar(agora) { if (this.jogo === "runa") this._desenharRuna(agora); else this._desenharAneis(); }
}

// Abre o minijogo e espera: true = conseguiu, false = falhou/acabou o tempo, null = fechou a janela
async function jogarMinijogo(doc, tt, { desarmar = false } = {}) {
  const c = cfgDe(doc);
  const app = new MinijogoConserto({
    jogo: tt.minijogo || "aneis",
    img: tt._img || c?.estados?.[0]?.img || doc.texture?.src || "",
    nome: nomeObjeto(doc), cd: tt.cd, tempo: tt.tempo, titulo: desarmar ? "Mini.TituloDesarmar" : tt.modo === "consertar" ? "Mini.Titulo" : "Mini.TituloTeste"
  });
  await app.render({ force: true });
  return app.resultado;
}
const usaRolagem = tt => (tt.como ?? "rolagem") !== "minijogo";
const usaMinijogo = tt => (tt.como ?? "rolagem") !== "rolagem";

// Falhou: conta a tentativa, avisa, roda "Ao falhar no teste" e trava se acabaram as tentativas
async function falhouTeste(doc, c, ctx, total, { desarmar = false } = {}) {
  const tt = testeDe(c);
  const feitas = (Number(tt.feitas) || 0) + 1;
  const max = Number(tt.tentativas) || 0;
  const travou = max > 0 && feitas >= max;
  const upd = { [`flags.${ID}.objeto.teste.feitas`]: feitas };
  // Acabaram as tentativas: trava (na armadilha, trava só as tentativas de desarmar; ela continua disparando)
  if (travou) upd[`flags.${ID}.objeto.trancado`] = true;
  await doc.update(upd);
  const cd = Number(tt.cd) || 10;
  let texto = tt.msgFalha?.trim() || t(desarmar ? "Teste.FalhouDesarmar" : tt.modo === "consertar" ? "Teste.FalhouConsertar" : "Teste.Falhou", { objeto: nomeObjeto(doc) });
  if (tt.mostrarCD && total != null) texto += ` (${total} × CD ${cd})`;
  if (travou) texto += ` ${t("Teste.Travou")}`;
  efeito(alvos("disparou", ctx), { tipo: "aviso", texto });
  for (const a of c.acoes?.falha ?? []) {
    try { await rodarAcao(a, ctx); } catch (err) { console.error(`${ID} |`, err); }
  }
  Hooks.callAll("objetosVivos.falhou", doc, { token: ctx.token, userId: ctx.userId, total, cd });
}

// Faz o teste (rolagem e/ou minijogo) e devolve "passou", "falhou" ou null (esperando alguém jogar,
// cancelado ou sem personagem). Na falha já conta a tentativa e roda "Ao falhar no teste".
async function avaliarTeste(doc, c, { token, userId, rolagem, desarmar = false }) {
  const tt = testeDe(c);
  const ctxT = { cena: doc.parent, token, userId, fonte: doc, profundidade: 0 };
  let total = Number.isFinite(rolagem?.total) ? rolagem.total : null;
  let mini = typeof rolagem?.minijogo === "boolean" ? rolagem.minijogo : undefined;
  // Minijogo: quem clicou já jogou na própria tela. Se ninguém jogou ainda, o mestre joga (se foi ele
  // quem usou) ou o minijogo abre na tela do jogador dono do token (pisou ou chegou perto).
  if (usaMinijogo(tt) && mini === undefined) {
    if (userId && userId === game.user.id) {
      mini = await jogarMinijogo(doc, tt, { desarmar });
      if (mini === null) return null;
    } else {
      const donos = token?.actor
        ? game.users.filter(u => u.active && !u.isGM && token.actor.testUserPermission?.(u, "OWNER")).map(u => u.id)
        : (userId && !game.users.get(userId)?.isGM ? [userId] : []);
      if (donos.length) { emitir({ acao: "jogar", uuid: doc.uuid, tokenUuid: token?.uuid ?? null, userIds: [donos[0]], desarmar }); return null; }
      ui.notifications.info(t("Mini.SemJogador", { objeto: nomeObjeto(doc) }));
      return null;
    }
  }
  if (usaRolagem(tt) && total === null) {
    // Ninguém rolou ainda (mestre clicou, alguém pisou ou chegou perto, ou o mestre rola escondido)
    const ator = token?.actor ?? game.users.get(userId)?.character ?? null;
    if (!ator) {
      if (game.users.get(userId)?.isGM) ui.notifications.info(t("Teste.SemTokenMestre"));
      else { if (userId) efeito([userId], { tipo: "aviso", texto: t("Teste.SemPersonagem") }); return null; }
    } else {
      total = await rolarTeste(ator, tt, { escondido: tt.quemRola === "mestre" });
      if (total === null) return null;
    }
  }
  const cd = Number(tt.cd) || 10;
  const passouRolagem = !usaRolagem(tt) || total === null || total >= cd;
  const passouMini = !usaMinijogo(tt) || mini === true;
  const passou = passouRolagem && passouMini;
  Hooks.callAll("objetosVivos.teste", doc, { token, userId, total, cd, minijogo: mini, passou, desarmar });
  if (!passou) { await falhouTeste(doc, c, ctxT, passouRolagem ? null : total, { desarmar }); return "falhou"; }
  const msg = desarmar ? "Teste.Desarmou" : tt.modo === "consertar" ? "Teste.Consertou" : "Teste.Passou";
  if (userId) efeito([userId], { tipo: "aviso", texto: t(msg, { objeto: nomeObjeto(doc) }) + (tt.mostrarCD && total !== null ? ` (${total} × CD ${cd})` : "") });
  return "passou";
}

// Dispara o objeto do jeito normal (troca a aparência e roda as ações)
async function dispararObjeto(doc, c, ctx) {
  await mudarEstado(doc, (c.estado + 1) % c.estados.length, ctx);
  if (c.camaleao && c.revelarAoUsar && !c.revelado) await doc.setFlag(ID, "objeto.revelado", true);
  Hooks.callAll("objetosVivos.usado", doc, { token: ctx.token, userId: ctx.userId });
}

async function usarObjeto(doc, { tokenUuid = null, userId = null, forcar = false, rolagem = null, desarmar = false }) {
  if (!game.user.isGM) return;
  const c = cfgDe(doc);
  if (!c || !ehTile(doc)) return;
  const cena = doc.parent;
  const token = (tokenUuid ? await fromUuid(tokenUuid) : null) ?? tokenDoUsuario(userId, cena);
  const ctx = { cena, token, userId, fonte: doc, profundidade: 0 };
  const tt = testeDe(c);
  if (!forcar) {
    // Armadilha: desarmada não dispara mais; a tentativa de desarmar é um teste à parte
    if (tt.modo === "desarmar") {
      if (c.desarmado) {
        if (userId && desarmar) efeito([userId], { tipo: "aviso", texto: t("Teste.JaDesarmada", { objeto: nomeObjeto(doc) }) });
        return;
      }
      if (desarmar) {
        if (c.trancado) { if (userId) efeito([userId], { tipo: "aviso", texto: t("Teste.SemTentativas", { objeto: nomeObjeto(doc) }) }); return; }
        if (!await podeAgir(doc, c, token, userId, "desarmar")) return;
        const r = await avaliarTeste(doc, c, { token, userId, rolagem, desarmar: true });
        if (r === "passou") {
          const upd = { [`flags.${ID}.objeto.desarmado`]: true };
          if (c.camaleao && !c.revelado) upd[`flags.${ID}.objeto.revelado`] = true;
          await doc.update(upd);
          for (const a of c.acoes?.desarmar ?? []) { try { await rodarAcao(a, ctx); } catch (err) { console.error(`${ID} |`, err); } }
          Hooks.callAll("objetosVivos.desarmado", doc, { token, userId });
        } else if (r === "falhou" && tt.falhaDispara !== false) {
          await dispararObjeto(doc, cfgDe(doc), ctx);
        }
        return;
      }
      // Disparar a armadilha (pisou, clicou em "Usar", chegou perto): sem teste
      if (!await podeAgir(doc, c, token, userId, "usar")) return;
      return dispararObjeto(doc, c, ctx);
    }
    if (estaTrancado(doc, c)) {
      if (userId) efeito([userId], { tipo: "aviso", texto: t(fechaduraTrancada(doc) ? "Aviso.TrancadoGazua" : "Aviso.Trancado", { objeto: nomeObjeto(doc) }) });
      Hooks.callAll("objetosVivos.trancado", doc, { token, userId });
      return;
    }
    // Consertar: depois de consertado ele não volta a quebrar
    if (consertado(c)) {
      if (tt.depois === "nada") {
        if (userId) efeito([userId], { tipo: "aviso", texto: t("Teste.JaConsertado", { objeto: nomeObjeto(doc) }) });
        return;
      }
      if (!await podeAgir(doc, c, token, userId, "usar")) return;
      await executarAcoes(doc, "usoConsertado", ctx);
      Hooks.callAll("objetosVivos.usado", doc, { token, userId });
      return;
    }
    if (precisaTeste(c)) {
      const r = await avaliarTeste(doc, c, { token, userId, rolagem });
      if (r !== "passou") return;
    }
    if (!await podeAgir(doc, c, token, userId, "usar")) return;
  }
  await dispararObjeto(doc, c, ctx);
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

async function escolherArmadilha(doc, c) {
  const D = foundry.applications.api.DialogV2;
  const nome = esc(nomeObjeto(doc));
  if (c.interacao !== "clicar" && c.interacao !== "mestre") {
    const ok = await D.confirm({ window: { title: t("Teste.Modo.desarmar") }, content: `<p>${t("Teste.PerguntaDesarmar", { objeto: nome })}</p>`, rejectClose: false });
    return ok ? "desarmar" : null;
  }
  return D.wait({
    window: { title: nomeObjeto(doc) },
    content: `<p>${t("Teste.PerguntaArmadilha", { objeto: nome })}</p>`,
    buttons: [
      { action: "usar", label: t("Teste.BotaoUsar"), icon: "fa-solid fa-hand-pointer" },
      { action: "desarmar", label: t("Teste.BotaoDesarmar"), icon: "fa-solid fa-screwdriver-wrench", default: true }
    ],
    rejectClose: false
  }).catch(() => null);
}

// Leva o pedido até o mestre ativo
async function pedirUso(doc, tokenUuid, { desarmar = false } = {}) {
  if (!souMestreAtivo() && !game.users.activeGM) return ui.notifications.warn(t("Aviso.SemMestre"));
  let rolagem = null;
  const c = cfgDe(doc);
  const tt = testeDe(c);
  const precisa = tt.modo === "desarmar" ? (desarmar && !c?.desarmado && !c?.trancado) : (!estaTrancado(doc, c) && precisaTeste(c));
  // O jogador rola o teste e joga o minijogo na própria tela (com a janela de vantagem do sistema); o mestre só confere
  if (!game.user.isGM && c && precisa) {
    if (usaRolagem(tt) && tt.quemRola !== "mestre") {
      const ator = (tokenUuid ? (await fromUuid(tokenUuid))?.actor : null) ?? game.user.character;
      if (!ator) return ui.notifications.warn(t("Teste.SemPersonagem"));
      const total = await rolarTeste(ator, tt);
      if (total === null) return;
      rolagem = { total };
    }
    if (usaMinijogo(tt)) {
      const r = await jogarMinijogo(doc, tt, { desarmar });
      if (r === null) return;
      rolagem = { ...(rolagem ?? {}), minijogo: r };
    }
  }
  if (souMestreAtivo()) return usarObjeto(doc, { tokenUuid, userId: game.user.id, rolagem, desarmar });
  emitir({ acao: "usar", uuid: doc.uuid, tokenUuid, userId: game.user.id, rolagem, desarmar });
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

// Camaleão: para os jogadores o objeto simplesmente NÃO é desenhado. Ele continua no mapa e
// funcionando (pisar, clicar, chegar perto), mas fica idêntico ao que está atrás dele, sem nenhuma
// diferença de cor, nitidez ou luz. O mestre vê o objeto meio transparente.
function camuflado(tile) {
  const c = tile?._ovPreviaCamo ?? cfgDe(tile?.document);
  if (!c?.camaleao || c.revelado) return false;
  return !game.user.isGM || !!tile._ovVerCamo;
}
const camoMestre = tile => { const c = tile?._ovPreviaCamo ?? cfgDe(tile?.document); return game.user.isGM && !!c?.camaleao && !c.revelado && !tile._ovVerCamo; };

function aplicarCamaleao(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed) return;
  if (camuflado(tile)) {
    // Nada desenhado: nem a imagem, nem sombra, nem contorno
    mesh.renderable = false;
    mesh.alpha = 0;
    tile._ovCamo = true;
    tile._ovMeio = false;
    return;
  }
  if (tile._ovCamo) {
    tile._ovCamo = false;
    mesh.renderable = true;
    tile.renderFlags?.set?.({ refreshState: true });
  }
  if (camoMestre(tile)) { mesh.alpha = Math.min(mesh.alpha ?? 1, 0.5); tile._ovMeio = true; }
  else if (tile._ovMeio) { tile._ovMeio = false; tile.renderFlags?.set?.({ refreshState: true }); }
}

// Visão (3D): a imagem vira uma "carta" que pode inclinar para frente/trás (eixo X) e virar
// para os lados (eixo Y), com perspectiva. O giro normal (eixo Z) continua sendo a rotação do tile.
// A carta é desenhada numa imagem do tamanho do tile; o documento guarda só os ângulos.
const VISAO_SEG = 14;
const VISAO_MAX = 80;
const VISOES = { cima: { x: 0, y: 0 }, frente: { x: 55, y: 0 }, esquerda: { x: 0, y: -55 }, direita: { x: 0, y: 55 } };
const temVisao = v => !!v && (Math.abs(Number(v.x) || 0) >= 1 || Math.abs(Number(v.y) || 0) >= 1 || !!v.espelho);
function visaoDe(tile) {
  if (camuflado(tile)) return null;
  const v = tile?._ovPrevia3d ?? cfgDe(tile?.document)?.visao;
  return temVisao(v) ? v : null;
}

// Pontos da carta girada, já encaixados dentro de W×H (sem sair do tamanho do tile)
function projetarCarta(W, H, v, seg = VISAO_SEG) {
  const ax = Math.max(-VISAO_MAX, Math.min(VISAO_MAX, Number(v.x) || 0)) * Math.PI / 180;
  const ay = Math.max(-VISAO_MAX, Math.min(VISAO_MAX, Number(v.y) || 0)) * Math.PI / 180;
  const d = 2.2 * Math.max(W, H);
  const pts = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < seg * seg; i++) {
    const u = (i % seg) / (seg - 1), w = Math.floor(i / seg) / (seg - 1);
    const x = (u - 0.5) * W * (v.espelho ? -1 : 1), y = (w - 0.5) * H;
    const y1r = y * Math.cos(ax), z1 = y * Math.sin(ax);
    const x2 = x * Math.cos(ay) + z1 * Math.sin(ay), z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
    const k = d / (d - z2);
    const px = x2 * k, py = y1r * k;
    pts.push(px, py);
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  const f = Math.min(1, W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < pts.length; i += 2) { pts[i] = W / 2 + (pts[i] - cx) * f; pts[i + 1] = H / 2 + (pts[i + 1] - cy) * f; }
  return pts;
}

function desenharVisao(textura, W, H, v) {
  W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
  const plano = new PIXI.SimplePlane(textura, VISAO_SEG, VISAO_SEG);
  const buf = plano.geometry.getBuffer("aVertexPosition");
  const pts = projetarCarta(W, H, v);
  for (let i = 0; i < pts.length; i++) buf.data[i] = pts[i];
  buf.update();
  const rt = PIXI.RenderTexture.create({ width: W, height: H, resolution: 2 });
  canvas.app.renderer.render(plano, { renderTexture: rt, clear: true });
  plano.destroy({ children: true, texture: false, baseTexture: false });
  return rt;
}

function aplicarVisao(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed || !globalThis.PIXI?.SimplePlane) return;
  const v = visaoDe(tile);
  const atual = tile._ov3d;
  if (!v) {
    if (atual) {
      tile._ov3d = null;
      if (mesh.texture === atual.rt && tile.texture) mesh.texture = tile.texture;
      atual.rt?.destroy?.(true);
      tile.renderFlags?.set?.({ refreshMesh: true, refreshSize: true });
    }
    return;
  }
  const doc = tile.document;
  const tex = tile.texture;
  if (!tex) return;
  const chave = JSON.stringify([Number(v.x) || 0, Number(v.y) || 0, !!v.espelho, doc.width, doc.height]);
  if (!atual || atual.tex !== tex || atual.chave !== chave) {
    try {
      const rt = desenharVisao(tex, doc.width, doc.height, v);
      atual?.rt?.destroy?.(true);
      tile._ov3d = { rt, tex, chave };
    } catch (err) { console.warn(`${ID} | visão 3D falhou`, err); return; }
  }
  mesh.texture = tile._ov3d.rt;
  mesh.width = doc.width;
  mesh.height = doc.height;
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
  if (o.document.hidden) return false;
  if (testeDe(c).modo === "desarmar" && !c.desarmado) return true;
  if (fechaduraTrancada(o.document)) return true;
  return c.interacao === "clicar";
});
const tileNoPonto = p => (canvas.tiles?.placeables ?? []).filter(o => o.visible !== false && noTile(o.document, p))
  .sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0] ?? null;
const objetoNoPonto = p => {
  const lista = usaveis().filter(o => o.visible !== false && noTile(o.document, p));
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
    if (!game.user.isGM && c.distancia > 0 && dist > c.distancia) return ui.notifications.info(t("Aviso.Longe"));
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
    if (c.brilho === false || (c.trancado && !fechaduraTrancada(doc)) || camuflado(o)) continue;
    const alcance = c.distancia > 0 ? c.distancia : 1;
    if (maisPerto(doc).dist > alcance) continue;
    brilhos.lineStyle(4, 0xffc27a, 1).drawRoundedRect(doc.x - 4, doc.y - 4, doc.width + 8, doc.height + 8, 10);
  }
}

// Tokens andando: pisar em cima, chegar perto e atravessar paredes
const posicoes = new Map();
function lembrarPosicoes(cena) { for (const tk of cena?.tokens ?? []) posicoes.set(tk.uuid, centroToken(tk)); }

const teleportados = new Set();
function aoMoverToken(tk, mud) {
  if (!("x" in mud || "y" in mud || "level" in mud)) return;
  if (teleportados.has(tk.uuid)) { posicoes.set(tk.uuid, centroToken(tk)); if (tk.parent?.id === canvas.scene?.id) atualizarBrilho(); return; }
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
    if (doc.hidden || !mesmoNivel(doc, tk)) continue;
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
#ov-escada { position: fixed; inset: 0; z-index: 9999; background: #000; opacity: 0; pointer-events: none; transition: opacity .55s ease; display: flex; align-items: center; justify-content: center; }
#ov-escada.ov-on { opacity: 1; pointer-events: all; }
#ov-escada span { color: #e9dcc3; font: 600 22px Signika, system-ui, sans-serif; letter-spacing: 2px; text-shadow: 0 0 12px #000; }
.ov-editor .window-content { padding: 0; background: #17151c; color: #ece8f1; }
.ov-raiz { display: flex; height: 100%; font-family: Signika, system-ui, sans-serif; }
.ov-raiz button { font-family: inherit; }
.ov-lado > * { flex: none; }
.ov-raiz .ov-lado > input[type=text], .ov-raiz .ov-lado > * { flex: none; }
.ov-raiz .ov-lado > input[type=text] { height: 36px; }
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
.ov-corpo section > select { flex: none; width: 100%; height: 36px; }
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
.ov-minijogo .window-content { padding: 0; background: #17151c; color: #ece8f1; }
.ov-mini-raiz { display: flex; flex-direction: column; gap: 10px; padding: 14px; font-family: Signika, system-ui, sans-serif; }
.ov-mini-dica { margin: 0; font-size: 13px; color: #cfc8da; line-height: 1.4; }
.ov-mini-tela { width: 100%; aspect-ratio: 1; border-radius: 12px; border: 1px solid #343041; background: #14121a; cursor: pointer; display: block; }
.ov-mini-tempo { height: 8px; border-radius: 999px; background: #2a2632; overflow: hidden; }
.ov-mini-barra { display: block; height: 100%; width: 100%; background: #f0a03c; transition: background .3s; }
.ov-mini-barra.ov-pouco { background: #ff7a6a; }
.ov-mini-rodape { display: flex; align-items: center; gap: 10px; }
.ov-mini-status { flex: 1; font-size: 13px; font-weight: 600; color: #ffd09a; }
.ov-faixa.ov-faixa-linha { display: grid; grid-template-columns: 110px minmax(0, 1fr) 52px; padding: 8px 14px; }
.ov-faixa-linha b { font-size: 13px; } .ov-faixa-linha input[type=range] { width: 100%; accent-color: #f0a03c; }
.ov-btn.ov-mais { align-self: flex-start; }
.ov-previa { transition: transform .25s, filter .25s; }
.ov-biblioteca .window-content { padding: 0; background: #17151c; color: #ece8f1; overflow: hidden; }
.ov-bib { display: flex; flex-direction: column; height: 100%; font-family: Signika, system-ui, sans-serif; --ov-tam: 116px; }
.ov-bib button { font-family: inherit; }
.ov-bib-barra { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid #343041; flex: none; }
.ov-bib-barra .ov-btn { flex: none; }
.ov-busca { flex: 1; min-width: 120px; height: 36px; box-sizing: border-box; border-radius: 8px; border: 1px solid #343041; background: #1e1b24; color: #ece8f1; padding: 0 12px; font-size: 13px; }
.ov-tamanhos { display: flex; gap: 2px; padding: 3px; border-radius: 9px; background: #1e1b24; border: 1px solid #343041; flex: none; }
.ov-tam { width: 32px; height: 30px; border: none; border-radius: 7px; background: transparent; color: #a8a1b4; cursor: pointer; padding: 0; line-height: 1; }
.ov-tam.ov-on { background: #f0a03c; color: #1a1408; }
.ov-bib-meio { flex: 1; min-height: 0; display: flex; }
.ov-bib-lado { width: 240px; flex: none; overflow-y: auto; border-right: 1px solid #343041; background: #1a1720; padding: 8px 6px; box-sizing: border-box; }
.ov-lado-grupo { display: flex; flex-direction: column; gap: 2px; }
.ov-lado-titulo { margin: 14px 8px 6px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: #a8a1b4; }
.ov-lado-titulo i { color: #f0a03c; }
.ov-lado-item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 4px 10px; border: none; border-radius: 8px; background: transparent;
  color: #cfc8da; font-size: 13px; text-align: left; cursor: pointer; line-height: 1.2; }
.ov-lado-item:hover { background: #26222d; color: #ece8f1; }
.ov-lado-item.ov-on { background: rgba(240,160,60,.16); color: #ffd09a; font-weight: 600; }
.ov-lado-item > i { width: 16px; text-align: center; flex: none; color: #a8a1b4; } .ov-lado-item.ov-on > i { color: #f0a03c; }
.ov-lado-nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-conta { flex: none; font-size: 11px; padding: 1px 7px; border-radius: 999px; background: #2e2a37; color: #a8a1b4; font-weight: 600; }
.ov-lado-abrir { margin-top: 6px; border: 1px dashed #4a4454; color: #ffd09a; }
.ov-lado-abrir .ov-lado-nome { white-space: normal; }
.ov-bib-conteudo { flex: 1; min-width: 0; overflow-y: auto; padding: 14px 16px 20px; box-sizing: border-box; }
.ov-sec-titulo { margin: 0 0 10px; font-size: 18px; font-weight: 700; border: none; color: #ece8f1; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-sec-titulo i { color: #f0a03c; font-size: 15px; }
.ov-sec-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; } .ov-sec-cab .ov-sec-titulo { margin: 0; }
.ov-sec-info { margin: 0 0 10px; font-size: 12px; color: #a8a1b4; }
.ov-dd-cab { padding: 10px 12px; border-radius: 10px; background: rgba(240,160,60,.08); border: 1px solid #f0a03c55; }
.ov-dd-cab .ov-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } .ov-dd-cab .ov-txt > span { font-size: 12px; color: #a8a1b4; }
.ov-trilha { font-size: 13px; color: #a8a1b4; margin: 0 0 12px; }
.ov-link { border: none; background: none; padding: 0; color: #ffc27a; cursor: pointer; font-size: inherit; width: auto; height: auto; line-height: inherit; }
.ov-link:hover { text-decoration: underline; }
.ov-grupo { margin-bottom: 18px; }
.ov-grupo-cab { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #2c2834; }
.ov-grupo-nome { font-size: 15px; font-weight: 600; color: #ece8f1; } button.ov-grupo-nome { color: #ece8f1; } .ov-grupo-nome i { color: #f0a03c; }
.ov-grupo-cab .ov-link:last-child { margin-left: auto; font-size: 12px; }
.ov-grade-assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(var(--ov-tam), 1fr)); gap: 8px; }
.ov-cartao-asset { display: flex; flex-direction: column; gap: 4px; padding: 6px; border-radius: 10px; border: 1px solid #343041; background: #221f29; color: #ece8f1;
  cursor: grab; width: 100%; height: auto; line-height: 1.2; text-align: center; }
.ov-cartao-asset:hover { border-color: #f0a03c; background: #2a2533; }
.ov-cartao-img { aspect-ratio: 1; width: 100%; border-radius: 7px; display: flex; align-items: center; justify-content: center; overflow: hidden;
  background: #2b2733 repeating-conic-gradient(#322d3b 0 25%, #2b2733 0 50%) 0 0 / 16px 16px; }
.ov-cartao-img img, .ov-cartao-img video { max-width: 92%; max-height: 92%; object-fit: contain; border: none; pointer-events: none; filter: drop-shadow(2px 4px 3px rgba(0,0,0,.5)); }
.ov-cartao-nome { font-size: 11px; color: #cfc8da; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-com-apagar { position: relative; }
.ov-com-apagar[hidden], .ov-cartao-asset[hidden], .ov-pasta-chip[hidden] { display: none; }
.ov-apagar { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; padding: 0; border-radius: 7px; border: none; background: #17151ccc; color: #ff9a8a; cursor: pointer; opacity: 0; line-height: 1; }
.ov-com-apagar:hover .ov-apagar, .ov-apagar:focus-visible { opacity: 1; }
.ov-pastas { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.ov-pasta-chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid #343041; background: #221f29; color: #ece8f1; font-size: 13px; cursor: pointer; width: auto; }
.ov-pasta-chip:hover { border-color: #f0a03c; } .ov-pasta-chip i { color: #f0a03c; }
.ov-dd-chip { border-color: #f0a03c88; }
.ov-mais-largo { width: 100%; margin-top: 10px; }
.ov-bib-vazio { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; font-size: 13px; color: #cfc8da; }
.ov-bib-vazio p { margin: 0; line-height: 1.45; max-width: 520px; }
.ov-bib-dica { margin: 0; padding: 8px 14px; border-top: 1px solid #343041; font-size: 12px; color: #a8a1b4; flex: none; }
.ov-encaixe-aviso { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 10000; padding: 10px 16px; border-radius: 10px;
  background: #17151cf0; border: 1px solid #f0a03c; color: #ece8f1; font-family: Signika, system-ui, sans-serif; font-size: 13px; pointer-events: none;
  box-shadow: 0 8px 24px rgba(0,0,0,.5); max-width: 90vw; text-align: center; }
.ov-encaixe-valores { display: block; margin-top: 4px; color: #ffd09a; font-weight: 600; }
.ov-encaixe-teclas { display: block; margin-top: 2px; color: #cfc8da; }
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
  imagem: "fa-image", diario: "fa-book-open", camera: "fa-video", escuridao: "fa-moon", musica: "fa-music", mover: "fa-map-location-dot", escada: "fa-stairs", esperar: "fa-hourglass-half" };

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
    case "escada": {
      const partes = [];
      if (a.nivel) partes.push(niveisDe(canvas.scene).find(l => l.id === a.nivel)?.name ?? t("Resumo.Nivel"));
      if (a.chegada) partes.push(nomeDoc(a.chegada));
      return partes.length ? `${partes.join(" · ")} · ${t(`Opc.${a.quem}`)}` : t("Resumo.Configurar");
    }
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
      ? [["aparencia", t("Aba.Aparencia")], ["uso", t("Aba.Uso")], ["teste", t("Aba.Teste")], ["acoes", t("Aba.Acoes")]]
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
          <span class="ov-arquivo" data-tooltip="${esc(e.img)}">${esc(e.img ? decodificar(e.img.split("/").pop()) : t("Editor.SemImagem"))}</span>
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
      const v = d.visao ?? { x: 0, y: 0, espelho: false };
      const vpreset = Object.entries(VISOES).find(([, a]) => a.x === (Number(v.x) || 0) && a.y === (Number(v.y) || 0))?.[0];
      const faixaV = (eixo, nome) => `<div class="ov-faixa ov-faixa-linha"><b>${t(nome)}</b>
        <input type="range" min="-${VISAO_MAX}" max="${VISAO_MAX}" step="1" data-visao="${eixo}" value="${Number(v[eixo]) || 0}" aria-label="${esc(t(nome))}">
        <span class="ov-valor">${Number(v[eixo]) || 0}°</span></div>`;
      return `
      <section style="display:flex;flex-direction:column;gap:8px"><h2>${icone("fa-cube")} ${t("Visao.Titulo")}</h2><p class="ov-dica">${t("Visao.Dica")}</p>
        <div class="ov-pilulas">${Object.keys(VISOES).map(n =>
          `<button type="button" class="ov-pilula ${vpreset === n ? "ov-on" : ""}" data-visao-preset="${n}">${t(`Visao.${n}`)}</button>`).join("")}</div>
        ${faixaV("x", "Visao.X")}${faixaV("y", "Visao.Y")}
        ${chave(!!v.espelho, "espelho", t("Visao.Espelhar"), t("Visao.EspelharDica"))}</section>
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

    if (this.aba === "teste") return this._htmlTeste(chave);

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
          ${this.tile ? chave(!!d.trancado, "trancado", t("Regras.Trancado"), t(temFechadura(this.doc) ? "Gazua.TrancadoDica" : "Regras.TrancadoDica")) : ""}
          ${this.tile ? this._htmlGazua() : ""}` : ""}
      </section>`;
    }
    return "";
  }

  // Fechadura da Gazua da Mesa
  _htmlGazua() {
    const g = gazua();
    if (!g) return `<p class="ov-dica">${icone("fa-key")} ${t("Gazua.Instale")}</p>`;
    const tem = temFechadura(this.doc);
    const estado = tem ? t(fechaduraTrancada(this.doc) ? "Gazua.EstaTrancada" : "Gazua.EstaAberta") : t("Gazua.SemFechadura");
    const marcado = !!this.dados.usarAoDestrancar;
    return `<div class="ov-faixa"><div class="ov-txt"><b>${icone("fa-key")} ${t("Gazua.Titulo")}</b><span>${esc(estado)}</span></div>
        <button type="button" class="ov-btn" data-a="gazua">${icone(tem ? "fa-lock" : "fa-plus")} ${t(tem ? "Gazua.Configurar" : "Gazua.Colocar")}</button></div>
      ${tem ? `<div class="ov-faixa"><div class="ov-txt"><b>${t("Gazua.UsarAoDestrancar")}</b><span>${t("Gazua.UsarAoDestrancarDica")}</span></div>
        <button type="button" role="switch" aria-checked="${marcado}" aria-label="${esc(t("Gazua.UsarAoDestrancar"))}" class="ov-chave ${marcado ? "ov-on" : ""}" data-chave="usarAoDestrancar"><span></span></button></div>` : ""}`;
  }

  _htmlTeste(chave) {
    const tt = testeDe(this.dados);
    const cartao = (m, nome, desc) => `<button type="button" class="ov-cartao ${tt.modo === m ? "ov-on" : ""}" data-teste-modo="${m}" aria-pressed="${tt.modo === m}"><b>${nome}</b><span>${desc}</span></button>`;
    let h = `<section><h2>${t("Teste.Pergunta")}</h2>
      <div class="ov-grade ov-2">${cartao("nenhum", t("Teste.Modo.nenhum"), t("Teste.Modo.nenhumDesc"))}${cartao("usar", t("Teste.Modo.usar"), t("Teste.Modo.usarDesc"))}${cartao("consertar", t("Teste.Modo.consertar"), t("Teste.Modo.consertarDesc"))}${cartao("desarmar", t("Teste.Modo.desarmar"), t("Teste.Modo.desarmarDesc"))}</div></section>`;
    if (tt.modo === "nenhum") return h;
    const grupos = opcoesDeTeste();
    const op = (v, n) => `<option value="${esc(v)}" ${tt.qual === v ? "selected" : ""}>${esc(n)}</option>`;
    const sel = grupos.length
      ? `<select data-teste="qual" data-rerender aria-label="${esc(t("Teste.Qual"))}">${grupos.map(g => `<optgroup label="${esc(g.nome)}">${g.itens.map(i => op(i.valor, i.nome)).join("")}</optgroup>`).join("")}
          <optgroup label="${esc(t("Teste.Grupo.outro"))}">${op("formula", t("Teste.Formula"))}</optgroup></select>`
      : "";
    const usaFormula = !grupos.length || tt.qual === "formula";
    const passoT = (campo, texto, nome, desc) => `<div class="ov-faixa"><div class="ov-txt"><b>${esc(nome)}</b><span>${esc(desc)}</span></div>
      <button type="button" class="ov-btn ov-icone" data-teste-menos="${campo}" aria-label="−">−</button><span class="ov-valor">${esc(texto)}</span>
      <button type="button" class="ov-btn ov-icone" data-teste-mais="${campo}" aria-label="+">+</button></div>`;
    const pilula = (attr, v, atual, nome) => `<button type="button" class="ov-pilula ${atual === v ? "ov-on" : ""}" ${attr}="${v}">${nome}</button>`;
    const como = tt.como ?? "rolagem";
    const cartaoJogo = (j, nome, desc) => `<button type="button" class="ov-cartao ${tt.minijogo === j ? "ov-on" : ""}" data-teste-jogo="${j}" aria-pressed="${tt.minijogo === j}"><b>${nome}</b><span>${desc}</span></button>`;
    if (tt.modo === "desarmar") h += `<section style="display:flex;flex-direction:column;gap:8px">
        <p class="ov-dica">${t("Teste.DesarmarDica")}</p>
        ${this.dados.desarmado ? `<div class="ov-faixa"><div class="ov-txt"><b>${t("Teste.EstaDesarmada")}</b></div>
          <button type="button" class="ov-btn" data-a="rearmar">${icone("fa-rotate-left")} ${t("Teste.Rearmar")}</button></div>` : ""}
        ${chave(tt.falhaDispara !== false, "teste.falhaDispara", t("Teste.FalhaDispara"), t("Teste.FalhaDisparaDica"))}</section>`;
    h += `<section style="display:flex;flex-direction:column;gap:8px"><h2>${t(tt.modo === "consertar" ? "Teste.ComoConsertar" : tt.modo === "desarmar" ? "Teste.ComoDesarmar" : "Teste.ComoPassar")}</h2>
        <div class="ov-pilulas">${pilula("data-teste-como", "rolagem", como, t("Teste.Como.rolagem"))}${pilula("data-teste-como", "minijogo", como, t("Teste.Como.minijogo"))}${pilula("data-teste-como", "ambos", como, t("Teste.Como.ambos"))}</div>
        ${como !== "rolagem" ? `
          <div class="ov-grade ov-2">${cartaoJogo("aneis", t("Mini.Jogo.aneis"), t("Mini.Desc.aneis"))}${cartaoJogo("runa", t("Mini.Jogo.runa"), t("Mini.Desc.runa"))}</div>
          ${passoT("tempo", Number(tt.tempo) > 0 ? t("Valor.Segundos", { n: tt.tempo }) : t("Valor.SemLimite"), t("Mini.Tempo"), t("Mini.TempoDica"))}
          <button type="button" class="ov-btn ov-forte" data-a="testar-minijogo" style="align-self:flex-start">${icone("fa-gamepad")} ${t("Mini.Testar")}</button>` : ""}
      </section>
      <section style="display:flex;flex-direction:column;gap:8px"><h2>${t(como === "minijogo" ? "Mini.Dificuldade" : "Teste.Qual")}</h2>
        ${como === "minijogo" ? "" : sel}
        ${como !== "minijogo" && usaFormula ? `<div class="ov-campo"><label>${t("Teste.Formula")}</label><input type="text" data-teste="formula" value="${esc(tt.formula)}" placeholder="1d20 + @abilities.int.mod"></div>` : ""}
        ${passoT("cd", `CD ${Number(tt.cd) || 10}`, t("Teste.CD"), t(como === "rolagem" ? "Teste.CDDica" : "Mini.CDDica", { aneis: dificuldade(tt.cd).aneis, pontos: dificuldade(tt.cd).pontos + 1 }))}
        ${como !== "minijogo" ? chave(!!tt.mostrarCD, "teste.mostrarCD", t("Teste.MostrarCD"), t("Teste.MostrarCDDica")) : ""}</section>
      ${como !== "minijogo" ? `<section><h2>${t("Teste.Quem")}</h2>
        <div class="ov-pilulas">${pilula("data-teste-quem", "jogador", tt.quemRola, t("Teste.QuemJogador"))}${pilula("data-teste-quem", "mestre", tt.quemRola, t("Teste.QuemMestre"))}</div>
        <p class="ov-dica" style="margin-top:6px">${t(tt.quemRola === "mestre" ? "Teste.QuemMestreDica" : "Teste.QuemJogadorDica")}</p></section>` : ""}
      <section style="display:flex;flex-direction:column;gap:8px"><h2>${t("Teste.AoFalhar")}</h2>
        ${passoT("tentativas", Number(tt.tentativas) > 0 ? t("Valor.Vezes", { n: tt.tentativas }) : t("Valor.SemLimite"), t("Teste.Tentativas"), t("Teste.TentativasDica", { n: Number(tt.feitas) || 0 }))}
        ${Number(tt.feitas) > 0 ? `<button type="button" class="ov-btn" data-a="zerar-tentativas" style="align-self:flex-start">${icone("fa-rotate-left")} ${t("Teste.Zerar")}</button>` : ""}
        <div class="ov-campo"><label>${t("Teste.Mensagem")}</label><input type="text" data-teste="msgFalha" value="${esc(tt.msgFalha)}" placeholder="${esc(t(tt.modo === "consertar" ? "Teste.FalhouConsertar" : "Teste.Falhou", { objeto: this.dados.nome || nomeObjeto(this.doc) }))}"></div>
        <p class="ov-dica">${t("Teste.AoFalharDica")}</p></section>`;
    if (tt.modo === "consertar") h += `<section><h2>${t("Teste.Depois")}</h2>
        <div class="ov-pilulas">${pilula("data-teste-depois", "acoes", tt.depois, t("Teste.DepoisAcoes"))}${pilula("data-teste-depois", "nada", tt.depois, t("Teste.DepoisNada"))}</div>
        <p class="ov-dica" style="margin-top:6px">${t("Teste.ConsertarDica")}</p></section>`;
    return h;
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
    const p = this.dados.prof ?? {};
    const v = this.dados.visao ?? {};
    const s = Number(p.sombra) || 0, a = Number(p.altura) || 0, i = Number(p.incl) || 0;
    const vx = Number(v.x) || 0, vy = Number(v.y) || 0;
    return `transform: perspective(500px) translateY(${-a}px) rotateX(${i + vx}deg) rotateY(${vy}deg)${v.espelho ? " scaleX(-1)" : ""}; transform-origin: 50% 50%;`
      + (s ? ` filter: drop-shadow(${Math.round(a * 0.5 + 3)}px ${Math.round(a + 5)}px ${Math.round(2 + s / 15)}px rgba(0,0,0,${(s / 100 * 0.85).toFixed(2)}));` : "");
  }

  // Mostra no mapa, ao vivo, a profundidade que está sendo escolhida
  _previaNoMapa() {
    if (!this.tile) return;
    const tile = this.doc.object;
    if (!tile) return;
    tile._ovPrevia = clone(this.dados.prof ?? profPadrao("plano"));
    tile._ovPrevia3d = clone(this.dados.visao ?? { x: 0, y: 0, espelho: false });
    aplicarVisao(tile);
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
    aplicarCamaleao(tile);
    aplicarProfundidade(tile);
  }

  async close(opcoes) {
    const tile = this.tile ? this.doc.object : null;
    if (tile) {
      delete tile._ovPrevia; delete tile._ovPreviaCamo; delete tile._ovVerCamo; delete tile._ovPrevia3d;
      aplicarCamaleao(tile);
      aplicarVisao(tile);
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
      case "nivel": {
        const niveis = niveisDe(this.cena);
        h = niveis.length
          ? `<select ${attr} data-rerender>${op("", t("Campo.MesmoNivel"), v)}${niveis.map(l => op(l.id, l.name || t("Resumo.Nivel"), v)).join("")}</select>`
          : `<span class="ov-dica" style="margin:0">${t("Campo.SemNiveis")}</span>`;
        break;
      }
      case "regiaoChegada":
        h = `<select ${attr} data-rerender>${op("", t("Campo.MesmoLugar"), v)}${(this.cena?.regions?.contents ?? []).map(r => op(r.uuid, r.name, v)).join("")}</select>`;
        break;
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
    if (alvo.dataset.teste) {
      d.teste = { ...testeDe(d), [alvo.dataset.teste]: alvo.value };
      if (mudou && alvo.dataset.rerender !== undefined) this.render();
      return;
    }
    if (alvo.dataset.visao) {
      d.visao = { x: 0, y: 0, espelho: false, ...(d.visao ?? {}) };
      d.visao[alvo.dataset.visao] = Number(alvo.value) || 0;
      this.element?.querySelectorAll("[data-visao-preset]").forEach(b => b.classList.toggle("ov-on", false));
      const rotulo = alvo.nextElementSibling;
      if (rotulo) rotulo.textContent = `${alvo.value}°`;
      this._previaNoMapa();
      return;
    }
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
    if (ds.testeModo) {
      d.teste = { ...testeDe(d), modo: ds.testeModo };
      // Consertar: a primeira aparência é a quebrada e a segunda a consertada
      if (ds.testeModo === "consertar" && d.estados?.length >= 2) {
        const padroes = Object.values(PRESETS).flatMap(p => p.estados.map(n => t(n)));
        if (padroes.includes(d.estados[0].nome) || !d.estados[0].nome) d.estados[0].nome = t("Est.Quebrado");
        if (padroes.includes(d.estados[1].nome) || !d.estados[1].nome) d.estados[1].nome = t("Est.Consertado");
        d.estado = 0;
      }
      return this.render();
    }
    if (ds.testeComo) { d.teste = { ...testeDe(d), como: ds.testeComo }; return this.render(); }
    if (ds.testeJogo) { d.teste = { ...testeDe(d), minijogo: ds.testeJogo }; return this.render(); }
    if (ds.testeQuem) { d.teste = { ...testeDe(d), quemRola: ds.testeQuem }; return this.render(); }
    if (ds.testeDepois) { d.teste = { ...testeDe(d), depois: ds.testeDepois }; return this.render(); }
    if (ds.testeMenos || ds.testeMais) {
      const campo = ds.testeMenos || ds.testeMais, delta = ds.testeMenos ? -1 : 1;
      const tt = testeDe(d);
      if (campo === "cd") tt.cd = Math.min(40, Math.max(1, (Number(tt.cd) || 10) + delta));
      else if (campo === "tempo") tt.tempo = Math.min(300, Math.max(0, (Number(tt.tempo) || 0) + delta * 15));
      else tt[campo] = Math.min(20, Math.max(0, (Number(tt[campo]) || 0) + delta));
      d.teste = tt;
      return this.render();
    }
    if (ds.momento) { this.momento = ds.momento; return this.render(); }
    if (ds.visaoPreset) {
      d.visao = { ...VISOES[ds.visaoPreset], espelho: !!d.visao?.espelho };
      this.render();
      return this._previaNoMapa();
    }
    if (ds.profPreset) {
      d.prof = { ...profPadrao(ds.profPreset), parallax: d.prof?.parallax ?? ds.profPreset !== "plano" };
      this.render();
      return this._previaNoMapa();
    }
    if (ds.chave) {
      if (ds.chave === "teste.falhaDispara") { d.teste = { ...testeDe(d), falhaDispara: testeDe(d).falhaDispara === false }; return this.render(); }
      if (ds.chave === "teste.mostrarCD") { d.teste = { ...testeDe(d), mostrarCD: !testeDe(d).mostrarCD }; return this.render(); }
      if (ds.chave === "espelho") { d.visao = { x: 0, y: 0, ...(d.visao ?? {}), espelho: !d.visao?.espelho }; this.render(); return this._previaNoMapa(); }
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
      case "testar-minijogo": return jogarMinijogo(this.doc, { ...testeDe(d), _img: d.estados?.[0]?.img }, { desarmar: testeDe(d).modo === "desarmar" }).then(r => {
        if (r !== null) ui.notifications.info(t(r ? "Mini.Conseguiu" : "Mini.Falhou"));
      });
      case "rearmar": d.desarmado = false; d.teste = { ...testeDe(d), feitas: 0 }; d.trancado = false; break;
      case "zerar-tentativas": d.teste = { ...testeDe(d), feitas: 0 }; if (d.trancado && Number(testeDe(d).tentativas) > 0) d.trancado = false; break;
      case "reesconder": d.revelado = false; this.render(); return this._previaCamo();
      case "ver-camo": this.verCamo = !this.verCamo; this.render(); return this._previaCamo();
      case "biblioteca": return salvarNaBiblioteca(this.doc, this.dados);
      case "gazua": {
        const g = gazua();
        if (!g) return;
        // a janela da Gazua guarda sozinha; o editor se atualiza quando ela fecha (updateTile)
        await g.configurar(this.doc);
        return this.render();
      }
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
    const mudouTranca = this.tile && !!cfgDe(this.doc)?.trancado !== !!d.trancado;
    await this.doc.update(upd);
    if (mudouTranca && temFechadura(this.doc)) {
      const g = gazua();
      if (g.estaTrancada(this.doc) !== !!d.trancado) await (d.trancado ? g.trancar(this.doc) : g.destrancar(this.doc));
    }
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
const nomeDoArquivo = caminho => decodificar(String(caminho).split("/").pop().replace(/\.[a-z0-9]+$/i, "")).replace(/[-_]+/g, " ").trim();

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

async function criarObjeto({ preset = null, img = null, salvo = null, pxPorCasa = null, x = null, y = null, rotacao = null, escala = 1, livre = false, pronto = null, visao = null } = {}) {
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
let encaixe = null;
function cancelarEncaixe() {
  if (!encaixe) return;
  const e = encaixe;
  encaixe = null;
  for (const [nome, fn] of e.ouvintes) window.removeEventListener(nome, fn, { capture: true });
  e.spr?.destroy?.();
  e.rt?.destroy?.(true);
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
  const v0 = p.cfg.visao ?? {};
  const e = { p, spr, tex, rot: p.rotacao ?? 0, escala: 1, x: canvas.stage.pivot.x, y: canvas.stage.pivot.y, livre: false, ouvintes: [],
    vx: Number(v0.x) || 0, vy: Number(v0.y) || 0, esp: !!v0.espelho, rt: null, chave: "" };
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
    if (a.tipo === "escada") { a.nivel = ""; a.chegada = ""; }
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
// Pacotes abertos nesta sessão (continuam abertos mesmo se a janela da biblioteca fechar)
const pacotes = new Map();

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
  // Categorias: "objects", "objects/furniture"... com quantas imagens cada uma tem (contando as de dentro)
  const contagem = new Map();
  for (const a of imagens) {
    const partes = a.rel.split("/").slice(0, -1);
    for (let i = 1; i <= partes.length; i++) { const k = partes.slice(0, i).join("/"); contagem.set(k, (contagem.get(k) ?? 0) + 1); }
  }
  return { id: slug, nome, autor, slug, blob, imagens, contagem, cortar, urls: new Map(), enviados: new Map() };
}

const tipoImagem = c => /\.webp$/i.test(c) ? "image/webp" : /\.jpe?g$/i.test(c) ? "image/jpeg" : "image/png";
function urlDaMiniatura(pac, a) {
  if (!pac.urls.has(a.rel)) pac.urls.set(a.rel, URL.createObjectURL(new Blob([pac.cortar(a)], { type: tipoImagem(a.rel) })));
  return pac.urls.get(a.rel);
}
function fecharPacote(id) {
  const pac = pacotes.get(id);
  for (const u of pac?.urls?.values?.() ?? []) URL.revokeObjectURL(u);
  pacotes.delete(id);
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
  const ja = existentes.find(f => decodificar(f.split("/").pop()) === arquivo);
  if (ja) { pac.enviados.set(a.rel, ja); return ja; }
  const file = new File([pac.cortar(a)], arquivo, { type: tipoImagem(arquivo) });
  const r = await FP.upload(fonte, pasta, file, {}, { notify: false });
  const caminho = r?.path ?? (r ? `${pasta}/${arquivo}` : null);
  if (!caminho) throw new Error("envio recusado");
  pac.enviados.set(a.rel, caminho);
  return caminho;
}

async function usarDoPacote(id, rel, onde = null) {
  const pac = pacotes.get(id);
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
const TAMANHOS = { p: 84, m: 116, g: 160 };
const POR_GRUPO = 36;

// Biblioteca: barra lateral (seções e categorias dos pacotes) + grade de miniaturas
class BibliotecaObjetos extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: `${ID}-biblioteca`,
    classes: ["ov-biblioteca"],
    position: { width: 900, height: 680, left: 110, top: 60 },
    window: { icon: "fa-solid fa-cube", resizable: true }
  };
  secao = "prontos";   // prontos | pasta | meus | pacote
  pacoteId = null;
  ddPasta = "";
  busca = "";
  limite = 240;
  pasta = null;
  lista = null;

  get title() { return t("Bib.Titulo"); }
  get FP() { return foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker; }
  get tam() { return game.settings.get(ID, "tamMiniatura") || "m"; }
  get pacote() { return pacotes.get(this.pacoteId) ?? null; }

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
      this.lista = { dirs: [], files: [], pacotes: [], erro: true };
    }
  }

  // ---------- partes da janela
  _item({ attrs, iconeNome, nome, conta = null, ativo = false, nivel = 0 }) {
    return `<button type="button" class="ov-lado-item ${ativo ? "ov-on" : ""}" style="padding-left:${10 + nivel * 14}px" ${attrs}>
      ${icone(iconeNome)}<span class="ov-lado-nome">${esc(nome)}</span>${conta !== null ? `<span class="ov-conta">${conta}</span>` : ""}</button>`;
  }

  _nomePasta(p) {
    const k = `DD.Pasta.${p}`;
    const tr = t(k);
    if (typeof tr === "string" && tr !== `OV.${k}`) return tr;
    const nome = p.replace(/[-_]+/g, " ").trim();
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  _htmlLado() {
    const meus = meusObjetos();
    const salva = game.settings.get(ID, "pastaAssets") ?? {};
    const guardados = (game.settings.get(ID, "pacotesGuardados") ?? []).filter(g => ![...pacotes.values()].some(p => p.caminho === g.caminho));
    let h = `<div class="ov-lado-grupo">
      ${this._item({ attrs: 'data-secao="prontos"', iconeNome: "fa-shapes", nome: t("Bib.Prontos"), conta: PRONTOS.length, ativo: this.secao === "prontos" })}
      ${this._item({ attrs: 'data-secao="meus"', iconeNome: "fa-bookmark", nome: t("Bib.Meus"), conta: meus.length, ativo: this.secao === "meus" })}
      ${this._item({ attrs: 'data-secao="pasta"', iconeNome: "fa-folder-open", nome: salva.pasta ? decodificar(salva.pasta.replace(/\/$/, "").split("/").pop()) : t("Assets.Aba"), ativo: this.secao === "pasta" })}
      </div><div class="ov-lado-titulo">${icone("fa-box-open")} Dungeondraft</div><div class="ov-lado-grupo">`;
    for (const pac of pacotes.values()) {
      const ativo = this.secao === "pacote" && this.pacoteId === pac.id;
      h += this._item({ attrs: `data-pacote-id="${esc(pac.id)}"`, iconeNome: "fa-box-open", nome: pac.nome, conta: pac.imagens.length, ativo: ativo && !this.ddPasta && !this.busca });
      if (!ativo) continue;
      // Categorias de primeiro nível e, da aberta, as subcategorias
      const topo = [...pac.contagem.keys()].filter(k => !k.includes("/")).sort((a, b) => (a === "objects" ? -1 : b === "objects" ? 1 : comparar(a, b)));
      for (const c of topo) {
        h += this._item({ attrs: `data-dd-pasta="${esc(c)}"`, iconeNome: "fa-folder", nome: this._nomePasta(c), conta: pac.contagem.get(c), ativo: this.ddPasta === c && !this.busca, nivel: 1 });
        if (!(this.ddPasta === c || this.ddPasta.startsWith(`${c}/`))) continue;
        const subs = [...pac.contagem.keys()].filter(k => k.startsWith(`${c}/`) && k.split("/").length === 2).sort(comparar);
        for (const sub of subs) h += this._item({ attrs: `data-dd-pasta="${esc(sub)}"`, iconeNome: "fa-folder-tree", nome: this._nomePasta(sub.split("/")[1]), conta: pac.contagem.get(sub), ativo: (this.ddPasta === sub || this.ddPasta.startsWith(`${sub}/`)) && !this.busca, nivel: 2 });
      }
    }
    for (const g of guardados) h += this._item({ attrs: `data-guardado="${esc(g.caminho)}"`, iconeNome: "fa-cloud-arrow-down", nome: g.nome, nivel: 0 });
    h += `<button type="button" class="ov-lado-item ov-lado-abrir" data-a="abrir-pacote">${icone("fa-plus")}<span class="ov-lado-nome">${t("DD.Abrir")}</span></button>
      <input type="file" class="ov-dd-arquivo" accept=".dungeondraft_pack" hidden></div>`;
    return h;
  }

  _cartao({ attrs, src, nome, video = false }) {
    return `<button type="button" class="ov-cartao-asset" draggable="true" ${attrs} data-nome="${esc(nome.toLowerCase())}" data-tooltip="${esc(nome)}">
      <span class="ov-cartao-img">${video ? `<video src="${esc(src)}" muted loop preload="metadata"></video>` : `<img src="${esc(src)}" alt="" loading="lazy">`}</span>
      <span class="ov-cartao-nome">${esc(nome)}</span></button>`;
  }

  _htmlProntos() {
    return `<h2 class="ov-sec-titulo">${t("Bib.Prontos")}</h2><div class="ov-grade-assets">${PRONTOS.map(p =>
      this._cartao({ attrs: `data-preset="${p}"`, src: imgPreset(p, 0), nome: t(`Preset.${p}.Nome`) })).join("")}</div>`;
  }

  _htmlMeus() {
    const meus = meusObjetos();
    if (!meus.length) return `<h2 class="ov-sec-titulo">${t("Bib.Meus")}</h2><p class="ov-vazio">${t("Bib.MeusVazio")}</p>`;
    return `<h2 class="ov-sec-titulo">${t("Bib.Meus")}</h2><div class="ov-grade-assets">${meus.map(o => `<div class="ov-com-apagar">
        ${this._cartao({ attrs: `data-salvo="${o.id}"`, src: o.img, nome: o.nome, video: ehVideo(o.img) })}
        <button type="button" class="ov-apagar" data-apagar="${o.id}" aria-label="${esc(t("Editor.Remover"))}">${icone("fa-trash")}</button></div>`).join("")}</div>`;
  }

  _htmlPasta() {
    const salva = game.settings.get(ID, "pastaAssets") ?? {};
    if (!salva.pasta) return `<div class="ov-bib-vazio"><h2 class="ov-sec-titulo">${t("Assets.Aba")}</h2><p>${t("Assets.Explica")}</p>
      <button type="button" class="ov-btn ov-forte" data-a="pasta">${icone("fa-folder-open")} ${t("Assets.Escolher")}</button></div>`;
    const l = this.lista ?? { dirs: [], files: [], pacotes: [] };
    const raiz = salva.pasta.replace(/\/$/, "");
    const atual = (this.pasta ?? raiz).replace(/\/$/, "");
    const podeSubir = atual !== raiz && atual.startsWith(raiz);
    const arquivos = l.files.slice(0, this.limite);
    return `<div class="ov-sec-cab">
        ${podeSubir ? `<button type="button" class="ov-btn ov-icone" data-a="subir-pasta" aria-label="${esc(t("Assets.Voltar"))}">${icone("fa-arrow-left")}</button>` : ""}
        <h2 class="ov-sec-titulo" data-tooltip="${esc(atual)}">${icone("fa-folder-open")} ${esc(decodificar(atual.split("/").pop() || atual))}</h2>
        <button type="button" class="ov-btn" data-a="pasta">${t("Assets.Trocar")}</button></div>
      ${l.erro ? `<p class="ov-vazio">${t("Assets.Erro")}</p>` : ""}
      ${(l.dirs.length || l.pacotes.length) ? `<div class="ov-pastas">
        ${l.pacotes.map(f => `<button type="button" class="ov-pasta-chip ov-dd-chip" data-pacote-arquivo="${esc(f)}" data-nome="${esc(nomeDoArquivo(f).toLowerCase())}">${icone("fa-box-open")} ${esc(nomeDoArquivo(f))}</button>`).join("")}
        ${l.dirs.map(d => `<button type="button" class="ov-pasta-chip" data-dir="${esc(d)}" data-nome="${esc(nomeDoArquivo(d).toLowerCase())}">${icone("fa-folder")} ${esc(decodificar(d.replace(/\/$/, "").split("/").pop()))}</button>`).join("")}</div>` : ""}
      <div class="ov-grade-assets">${arquivos.map(f => this._cartao({ attrs: `data-img="${esc(f)}"`, src: f, nome: nomeDoArquivo(f), video: ehVideo(f) })).join("")}</div>
      ${l.files.length > this.limite ? `<button type="button" class="ov-btn ov-mais-largo" data-a="mais">${t("Assets.Mais", { n: l.files.length - this.limite })}</button>` : ""}
      ${!l.erro && !l.files.length && !l.dirs.length && !l.pacotes.length ? `<p class="ov-vazio">${t("Assets.Vazia")}</p>` : ""}`;
  }

  _htmlPacote() {
    const pac = this.pacote;
    if (!pac) { this.secao = "prontos"; return this._htmlProntos(); }
    const cab = `<div class="ov-sec-cab ov-dd-cab">
        <div class="ov-txt"><h2 class="ov-sec-titulo">${icone("fa-box-open")} ${esc(pac.nome)}</h2>
          <span>${esc(pac.autor ? t("DD.De", { autor: pac.autor }) : "")} ${t("DD.Total", { n: pac.imagens.length })}</span></div>
        ${pac.caminho ? "" : `<button type="button" class="ov-btn" data-a="guardar-pacote" data-tooltip="${esc(t("DD.GuardarDica"))}">${icone("fa-cloud-arrow-up")} ${t("DD.Guardar")}</button>`}
        <button type="button" class="ov-btn" data-a="fechar-pacote">${icone("fa-xmark")} ${t("DD.Fechar")}</button></div>`;
    const card = a => this._cartao({ attrs: `data-dd="${esc(a.rel)}" data-pac="${esc(pac.id)}"`, src: urlDaMiniatura(pac, a), nome: nomeDoArquivo(a.rel) });

    // Busca: no pacote todo
    const q = this.busca.trim().toLowerCase();
    if (q) {
      const achados = pac.imagens.filter(a => nomeDoArquivo(a.rel).toLowerCase().includes(q) || a.rel.toLowerCase().includes(q));
      return `${cab}<p class="ov-sec-info">${t("DD.Resultados", { n: achados.length })}</p>
        <div class="ov-grade-assets">${achados.slice(0, this.limite).map(card).join("")}</div>
        ${achados.length > this.limite ? `<button type="button" class="ov-btn ov-mais-largo" data-a="mais">${t("Assets.Mais", { n: achados.length - this.limite })}</button>` : ""}`;
    }

    // Categoria aberta: um grupo para as imagens soltas dela e um para cada subcategoria
    const prefixo = this.ddPasta ? `${this.ddPasta}/` : "";
    const dentro = pac.imagens.filter(a => a.rel.startsWith(prefixo));
    const grupos = new Map();
    for (const a of dentro) {
      const resto = a.rel.slice(prefixo.length);
      const g = resto.includes("/") ? resto.split("/")[0] : "";
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(a);
    }
    const trilha = this.ddPasta ? `<nav class="ov-trilha">
        <button type="button" class="ov-link" data-dd-pasta="">${esc(pac.nome)}</button>
        ${this.ddPasta.split("/").map((p, i, arr) => ` › <button type="button" class="ov-link" data-dd-pasta="${esc(arr.slice(0, i + 1).join("/"))}">${esc(this._nomePasta(p))}</button>`).join("")}</nav>` : "";
    const ordem = [...grupos.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a === "objects" ? -1 : b === "objects" ? 1 : comparar(a, b)));
    const blocos = ordem.map(g => {
      const lista = grupos.get(g);
      const nome = g ? this._nomePasta(g) : (this.ddPasta ? this._nomePasta(this.ddPasta.split("/").pop()) : pac.nome);
      const mostrar = g ? lista.slice(0, POR_GRUPO) : lista.slice(0, this.limite);
      const ver = g && lista.length > POR_GRUPO ? `<button type="button" class="ov-link" data-dd-pasta="${esc(prefixo + g)}">${t("DD.VerTodos", { n: lista.length })} ›</button>` : "";
      return `<section class="ov-grupo"><div class="ov-grupo-cab">
          ${g ? `<button type="button" class="ov-link ov-grupo-nome" data-dd-pasta="${esc(prefixo + g)}">${icone("fa-folder")} ${esc(nome)}</button>` : `<span class="ov-grupo-nome">${esc(nome)}</span>`}
          <span class="ov-conta">${lista.length}</span>${ver}</div>
        <div class="ov-grade-assets">${mostrar.map(card).join("")}</div>
        ${!g && lista.length > this.limite ? `<button type="button" class="ov-btn ov-mais-largo" data-a="mais">${t("Assets.Mais", { n: lista.length - this.limite })}</button>` : ""}</section>`;
    }).join("");
    return `${cab}${trilha}${blocos || `<p class="ov-vazio">${t("Assets.Vazia")}</p>`}`;
  }

  async _renderHTML() {
    const div = document.createElement("div");
    div.className = "ov-bib";
    div.style.setProperty?.("--ov-tam", `${TAMANHOS[this.tam] ?? 116}px`);
    try {
      if (this.secao === "pasta") await this._carregarPasta();
      const corpo = this.secao === "pasta" ? this._htmlPasta() : this.secao === "meus" ? this._htmlMeus() : this.secao === "pacote" ? this._htmlPacote() : this._htmlProntos();
      const buscaPacote = this.secao === "pacote";
      div.innerHTML = `<div class="ov-bib-barra">
          <button type="button" class="ov-btn ov-forte" data-a="imagem">${icone("fa-image")} ${t("Bib.Minha")}</button>
          <input type="search" class="ov-busca ${buscaPacote ? "ov-busca-pacote" : ""}" value="${esc(buscaPacote ? this.busca : "")}" placeholder="${esc(t(buscaPacote ? "DD.Buscar" : this.secao === "pasta" ? "Assets.Buscar" : "Bib.Buscar"))}" aria-label="${esc(t("Assets.Buscar"))}">
          <div class="ov-tamanhos" role="group" aria-label="${esc(t("Bib.Tamanho"))}">${Object.keys(TAMANHOS).map(k =>
            `<button type="button" class="ov-tam ${this.tam === k ? "ov-on" : ""}" data-tam="${k}" aria-label="${esc(t(`Bib.Tam.${k}`))}" data-tooltip="${esc(t(`Bib.Tam.${k}`))}">${icone(k === "p" ? "fa-table-cells" : k === "m" ? "fa-table-cells-large" : "fa-square")}</button>`).join("")}</div>
        </div>
        <div class="ov-bib-meio"><nav class="ov-bib-lado" aria-label="${esc(t("Bib.Titulo"))}">${this._htmlLado()}</nav>
          <div class="ov-bib-conteudo">${corpo}</div></div>
        <p class="ov-bib-dica">${t("Bib.Dica")}</p>`;
    } catch (err) {
      // Nunca deixa a janela travada: mostra o erro e um botão para recomeçar
      console.error(`${ID} | erro ao desenhar a biblioteca`, err);
      div.innerHTML = `<div class="ov-bib-vazio" style="padding:20px"><p>${t("Bib.Erro")}</p>
        <button type="button" class="ov-btn ov-forte" data-a="recomecar">${icone("fa-rotate")} ${t("Bib.Recomecar")}</button></div>`;
    }
    return div;
  }

  _replaceHTML(result, content) {
    const rolagem = content.querySelector?.(".ov-bib-conteudo")?.scrollTop ?? 0;
    const lado = content.querySelector?.(".ov-bib-lado")?.scrollTop ?? 0;
    content.replaceChildren(result);
    const c = content.querySelector?.(".ov-bib-conteudo"); if (c && !this._rolarTopo) c.scrollTop = rolagem;
    const l = content.querySelector?.(".ov-bib-lado"); if (l) l.scrollTop = lado;
    this._rolarTopo = false;
  }

  // ---------- ações
  _ir(mudancas) { Object.assign(this, { limite: 240, ...mudancas }); this._rolarTopo = true; return this.render(); }

  async _abrirPacote(blob, nome, caminho = null) {
    ui.notifications.info(t("DD.Abrindo", { nome }));
    try {
      const pac = await lerPacoteDD(blob, nome);
      pac.caminho = caminho;
      if (pacotes.has(pac.id)) fecharPacote(pac.id);
      pacotes.set(pac.id, pac);
      return this._ir({ secao: "pacote", pacoteId: pac.id, ddPasta: pac.contagem.has("objects") ? "objects" : "", busca: "" });
    } catch (err) {
      console.error(`${ID} | não consegui ler o pacote`, err);
      ui.notifications.error(t("DD.ErroLer", { nome }));
    }
  }

  async _abrirDoServidor(caminho) {
    try {
      const r = await fetch(caminho);
      if (!r.ok) throw new Error(r.status);
      return this._abrirPacote(await r.blob(), decodificar(caminho.split("/").pop()), caminho);
    } catch (err) {
      console.error(err);
      ui.notifications.error(t("DD.ErroLer", { nome: nomeDoArquivo(caminho) }));
    }
  }

  // Guarda o arquivo do pacote no Foundry: na próxima sessão ele aparece na lista sem precisar escolher de novo
  async _guardarPacote() {
    const pac = this.pacote;
    if (!pac) return;
    ui.notifications.info(t("DD.Guardando", { nome: pac.nome }));
    try {
      const fonte = game.settings.get(ID, "pastaAssets")?.fonte || "data";
      const pasta = "objetos-vivos/pacotes";
      for (const p of ["objetos-vivos", pasta]) { try { await this.FP.createDirectory(fonte, p); } catch {} }
      const arquivo = `${pac.slug}.dungeondraft_pack`;
      const r = await this.FP.upload(fonte, pasta, new File([pac.blob], arquivo), {}, { notify: false });
      const caminho = r?.path ?? (r ? `${pasta}/${arquivo}` : null);
      if (!caminho) throw new Error("envio recusado");
      pac.caminho = caminho;
      const lista = (game.settings.get(ID, "pacotesGuardados") ?? []).filter(g => g.caminho !== caminho);
      lista.push({ nome: pac.nome, caminho });
      await game.settings.set(ID, "pacotesGuardados", lista);
      ui.notifications.info(t("DD.Guardado", { nome: pac.nome }));
      this.render();
    } catch (err) {
      console.error(`${ID} | não consegui guardar o pacote`, err);
      ui.notifications.error(t("DD.ErroEnvio"));
    }
  }

  _escolherPasta() {
    const atual = game.settings.get(ID, "pastaAssets") ?? {};
    new this.FP({
      type: "folder", current: atual.pasta || "",
      callback: async (caminho, fp) => {
        await game.settings.set(ID, "pastaAssets", { pasta: caminho, fonte: fp?.activeSource || atual.fonte || "data" });
        this._ir({ secao: "pasta", pasta: caminho });
      }
    }).render(true);
  }

  async _aoClicar(alvo, ev) {
    const ds = alvo.dataset;
    if (ds.apagar) {
      const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Bib.Meus") }, content: `<p>${t("Bib.ApagarPergunta")}</p>`, rejectClose: false });
      if (ok) { await game.settings.set(ID, "biblioteca", meusObjetos().filter(o => o.id !== ds.apagar)); this.render(); }
      return;
    }
    if (ds.tam) { await game.settings.set(ID, "tamMiniatura", ds.tam); return this.render(); }
    if (ds.secao) return this._ir({ secao: ds.secao, busca: "" });
    if (ds.pacoteId) return this._ir({ secao: "pacote", pacoteId: ds.pacoteId, ddPasta: "", busca: "" });
    if (ds.ddPasta !== undefined) return this._ir({ secao: "pacote", ddPasta: ds.ddPasta, busca: "" });
    if (ds.guardado) return this._abrirDoServidor(ds.guardado);
    if (ds.pacoteArquivo) return this._abrirDoServidor(ds.pacoteArquivo);
    if (ds.dir) return this._ir({ pasta: ds.dir });
    switch (ds.a) {
      case "imagem": return escolherImagem();
      case "pasta": return this._escolherPasta();
      case "abrir-pacote": return this.element.querySelector(".ov-dd-arquivo")?.click();
      case "guardar-pacote": return this._guardarPacote();
      case "fechar-pacote": fecharPacote(this.pacoteId); return this._ir({ secao: "prontos", pacoteId: null, ddPasta: "", busca: "" });
      case "subir-pasta": return this._ir({ pasta: this.pasta.replace(/\/$/, "").split("/").slice(0, -1).join("/") });
      case "mais": this.limite += 240; return this.render();
      case "recomecar": Object.assign(this, { secao: "prontos", pacoteId: null, ddPasta: "", busca: "", pasta: null }); return this.render();
    }
    if (ds.dd) return usarDoPacote(ds.pac, ds.dd);
    if (ds.img) return encaixar({ img: ds.img });
    if (ds.preset) return encaixar({ preset: ds.preset });
    if (ds.salvo) { const o = meusObjetos().find(x => x.id === ds.salvo); if (o) encaixar({ salvo: o }); }
  }

  _onFirstRender() {
    injetarEstilo();
    const el = this.element;
    el.addEventListener("change", ev => {
      if (!ev.target.matches?.(".ov-dd-arquivo")) return;
      const f = ev.target.files?.[0];
      if (f) this._abrirPacote(f, f.name);
      ev.target.value = "";
    });
    el.addEventListener("click", ev => {
      const alvo = ev.target.closest?.("button, [data-dd], [data-img], [data-preset], [data-salvo]");
      if (!alvo || !el.contains(alvo) || alvo.closest(".window-header")) return;
      ev.preventDefault();
      ev.stopPropagation();
      this._aoClicar(alvo, ev).catch(err => { console.error(`${ID} |`, err); ui.notifications.error(t("Bib.Erro")); });
    });
    el.addEventListener("input", ev => {
      if (!ev.target.matches?.(".ov-busca")) return;
      if (ev.target.matches(".ov-busca-pacote")) {
        // No pacote a busca procura em tudo: redesenha depois que a pessoa para de digitar
        this.busca = ev.target.value;
        clearTimeout(this._tBusca);
        this._tBusca = setTimeout(async () => {
          this.limite = 240;
          await this.render();
          const campo = this.element?.querySelector(".ov-busca");
          if (campo) { campo.focus(); campo.setSelectionRange?.(campo.value.length, campo.value.length); }
        }, 300);
        return;
      }
      const q = ev.target.value.trim().toLowerCase();
      el.querySelectorAll(".ov-bib-conteudo [data-nome]").forEach(b => {
        const alvo = b.closest(".ov-com-apagar") ?? b;
        alvo.hidden = !!q && !b.dataset.nome.includes(q);
      });
    });
    el.addEventListener("dragstart", ev => {
      const item = ev.target.closest?.("[data-preset], [data-salvo], [data-img], [data-dd]");
      if (!item) return;
      const d = item.dataset;
      ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "ObjetoVivo", preset: d.preset ?? null, salvo: d.salvo ?? null, img: d.img ?? null, dd: d.dd ?? null, pac: d.pac ?? null }));
    });
  }
}

// Abre a biblioteca; se uma janela anterior ficou presa por algum erro, descarta e abre outra
async function abrirBiblioteca() {
  if (!game.user.isGM) return;
  injetarEstilo();
  const existente = foundry.applications.instances?.get?.(`${ID}-biblioteca`);
  if (existente) {
    try {
      if (existente.rendered !== false && existente.element?.isConnected !== false) return await existente.render({ force: true });
    } catch (err) { console.warn(`${ID} | janela antiga da biblioteca com problema, abrindo outra`, err); }
    try { await existente.close({ animate: false }); } catch {}
    foundry.applications.instances?.delete?.(`${ID}-biblioteca`);
  }
  return new BibliotecaObjetos().render({ force: true });
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
  game.settings.register(ID, "pacotesGuardados", { scope: "world", config: false, type: Array, default: [] });
  game.settings.register(ID, "tamMiniatura", { scope: "client", config: false, type: String, default: "m" });
});

Hooks.on("getSceneControlButtons", botaoNaBarra);
Hooks.on("renderTileConfig", injetarSecao);
Hooks.on("renderWallConfig", injetarSecao);
Hooks.on("renderTileHUD", botoesHud);

// Arrastar da biblioteca para o mapa
Hooks.on("dropCanvasData", (_canvas, dados) => {
  if (dados?.type !== "ObjetoVivo" || !game.user.isGM) return;
  if (dados.dd) { usarDoPacote(dados.pac, dados.dd, { x: dados.x, y: dados.y }); return false; }
  const salvo = dados.salvo ? meusObjetos().find(o => o.id === dados.salvo) : null;
  criarObjeto({ preset: dados.img ? null : dados.preset, img: dados.img ?? null, salvo, x: dados.x, y: dados.y });
  return false;
});

// Profundidade: reaplica sempre que o Foundry redesenha o tile ou a câmera anda
Hooks.on("refreshTile", tile => {
  if (tile._ovCamo || camuflado(tile) || camoMestre(tile)) aplicarCamaleao(tile);
  if (tile._ov3d || visaoDe(tile)) aplicarVisao(tile);
  if (tile._ovSombra || profDe(tile)) aplicarProfundidade(tile);
});
Hooks.on("canvasPan", () => atualizarProfundidades());

Hooks.on("drawWall", w => ouvirPorta(w.doorControl));
Hooks.on("refreshWall", w => ouvirPorta(w.doorControl));
Hooks.on("canvasReady", () => { ouvirTentativas(); ligarMapa(); lembrarPosicoes(canvas.scene); atualizarBrilho(); atualizarProfundidades(); for (const o of canvas.tiles?.placeables ?? []) if (camuflado(o) || camoMestre(o)) aplicarCamaleao(o); });
Hooks.on("createToken", tk => posicoes.set(tk.uuid, centroToken(tk)));
Hooks.on("deleteToken", tk => posicoes.delete(tk.uuid));
Hooks.on("updateToken", aoMoverToken);
Hooks.on("controlToken", () => atualizarBrilho());
Hooks.on("updateTile", (doc, mud) => {
  if (doc.parent?.id !== canvas.scene?.id) return;
  if (foundry.utils.hasProperty(mud, `flags.${ID}`)) { aplicarCamaleao(doc.object); aplicarVisao(doc.object); aplicarProfundidade(doc.object); }
  if (foundry.utils.hasProperty(mud, `flags.${ID}.objeto.estado`)) animar(doc.object, cfgDe(doc)?.anim);
  if (foundry.utils.hasProperty(mud, "flags.gazua-mesa")) foundry.applications.instances?.get?.(`${ID}-editor-Tile-${doc.id}`)?.render();
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

// Gazua da Mesa: a fechadura do objeto foi aberta (chave, gazua, teste, minijogo ou pelo mestre) ou trancada de novo
Hooks.on("gazua-mesa.destrancou", async (doc, { actor = null, userId = null } = {}) => {
  if (!souMestreAtivo() || !ehTile(doc) || !ehObjeto(doc)) return;
  if (cfgDe(doc)?.trancado) await doc.setFlag(ID, "objeto.trancado", false);
  const token = actor?.getActiveTokens?.(false, true)?.find(tk => tk.parent?.id === doc.parent?.id) ?? null;
  await aoDestrancar(doc, { cena: doc.parent, token, userId: userId ?? game.user.id, fonte: doc, profundidade: 0 });
});
Hooks.on("gazua-mesa.trancou", async doc => {
  if (!souMestreAtivo() || !ehTile(doc) || !ehObjeto(doc)) return;
  if (!cfgDe(doc)?.trancado) await doc.setFlag(ID, "objeto.trancado", true);
});

Hooks.once("ready", () => {
  if (game.user.isGM) for (const cena of game.scenes) { lembrarPosicoes(cena); lembrarPortas(cena); }

  game.socket.on(SOCKET, async data => {
    if (data?.acao === "jogar") {
      if (!data.userIds?.includes(game.user.id)) return;
      const d = await fromUuid(data.uuid);
      if (d) pedirUso(d, data.tokenUuid, { desarmar: !!data.desarmar });
      return;
    }
    if (data?.acao === "efeito") {
      if (data.userIds?.includes(game.user.id)) aplicarEfeito(data.efeito);
      return;
    }
    if (!souMestreAtivo()) return;
    const doc = data?.uuid ? await fromUuid(data.uuid) : null;
    if (!doc) return;
    if (data.acao === "usar") usarObjeto(doc, { tokenUuid: data.tokenUuid, userId: data.userId, rolagem: data.rolagem ?? null, desarmar: !!data.desarmar });
    else if (data.acao === "parede" && doc.documentName === "Wall") eventoParede(doc, data.momento, { userId: data.userId });
  });

  // API para macros e outros módulos
  game.modules.get(ID).api = {
    biblioteca: () => abrirBiblioteca(),
    criar: (opcoes = {}) => criarObjeto(opcoes),
    encaixar: (opcoes = {}) => encaixar(opcoes),
    // Abre um minijogo de conserto e devolve true (conseguiu), false (falhou) ou null (fechou)
    minijogo: ({ jogo = "aneis", img = "", nome = "", cd = 15, tempo = 45 } = {}) => {
      const app = new MinijogoConserto({ jogo, img, nome, cd, tempo });
      app.render({ force: true });
      return app.resultado;
    },
    editar: async uuid => abrirEditor(await fromUuid(uuid)),
    usar: async (uuid, tokenUuid = null) => { const d = await fromUuid(uuid); if (d && ehObjeto(d)) pedirUso(d, tokenUuid); },
    mudarEstado: async (uuid, indice) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) mudarEstado(d, indice, { cena: d.parent, token: null, userId: game.user.id, fonte: d, profundidade: 0 }); },
    trancar: async (uuid, trancado = true) => { if (!game.user.isGM) return; const d = await fromUuid(uuid); if (cfgDe(d)) await definirTrancado(d, !!trancado); },
    estaTrancado: async uuid => { const d = await fromUuid(uuid); return d ? estaTrancado(d) : false; }
  };
});
