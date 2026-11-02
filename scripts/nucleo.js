
// Objetos Vivos — Foundry VTT v14
// Transforma tiles/assets em objetos interativos (alavancas, botões, baús, placas de
// pressão...) com estados, imagem por estado e animação; e dá às portas/paredes do
// Foundry uma lista de ações para cada coisa que acontece com elas.
// Quem executa as ações é sempre o mestre ativo; o que precisa aparecer na tela de
// alguém (som, imagem, diário, câmera, aviso) vai por socket.

export const ID = "objetos-vivos";
export const SOCKET = `module.${ID}`;

export const t = (chave, dados) => dados ? game.i18n.format(`OV.${chave}`, dados) : game.i18n.localize(`OV.${chave}`);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const emitir = data => game.socket.emit(SOCKET, data);
export const souMestreAtivo = () => game.user === game.users.activeGM;
export const comparar = (a, b) => String(a).localeCompare(String(b), game.i18n.lang);
export const novoId = () => foundry.utils.randomID(8);
// Nomes de arquivo podem ter "%" e outros caracteres que quebram decodeURIComponent: nunca deixa estourar
export const decodificar = texto => { try { return decodeURIComponent(String(texto ?? "")); } catch { return String(texto ?? ""); } };
export const clone = x => foundry.utils.deepClone(x);
export const navegador = () => { const m = game.modules.get("navegador-mapas"); return m?.active ? m.api : null; };

// Níveis do mapa (Foundry v14): andares empilhados na mesma cena
export function niveisDe(cena) {
  try {
    const col = cena?.levels ?? cena?.getEmbeddedCollection?.("Level");
    return (col?.contents ?? []).slice().sort((a, b) => (Number(a.elevation?.bottom) || 0) - (Number(b.elevation?.bottom) || 0) || (a.sort ?? 0) - (b.sort ?? 0));
  } catch { return []; }
}
// O objeto e o token estão no mesmo nível? (sem níveis no mapa, sempre sim)
export function mesmoNivel(doc, tk) {
  const lv = tk?.level, lista = doc?.levels;
  const n = lista?.size ?? lista?.length ?? 0;
  if (!lv || !n) return true;
  return typeof lista.has === "function" ? lista.has(lv) : lista.includes(lv);
}

// Gazua da Mesa: um objeto (tile) pode ter fechadura. Trancado = "Trancado" do objeto OU fechadura trancada.
export const gazua = () => { const m = game.modules.get("gazua-mesa"); return m?.active && m.api?.lerFechadura ? m.api : null; };
export const temFechadura = doc => !!gazua()?.lerFechadura(doc);
export const fechaduraTrancada = doc => { const g = gazua(); return !!(g && g.lerFechadura(doc) && g.estaTrancada(doc)); };
export const estaTrancado = (doc, c = cfgDe(doc)) => !!c?.trancado || fechaduraTrancada(doc);

// Modelos prontos (a biblioteca usa estes, com as imagens da pasta assets/)
export const ASSETS = `modules/${ID}/assets`;
export const PRESETS = {
  alavanca: { estados: ["Est.Desligada", "Est.Ligada"], imgs: ["alavanca-desligada", "alavanca-ligada"], anim: "girar", interacao: "clicar", voltar: 0, prof: "medio" },
  botao:    { estados: ["Est.Solto", "Est.Apertado"], imgs: ["botao-solto", "botao-apertado"], anim: "pulsar", interacao: "clicar", voltar: 1, prof: "leve" },
  bau:      { estados: ["Est.Fechado", "Est.Aberto"], imgs: ["bau-fechado", "bau-aberto"], anim: "pulsar", interacao: "clicar", voltar: 0, prof: "medio" },
  placa:    { estados: ["Est.Solta", "Est.Pressionada"], imgs: ["placa-solta", "placa-pressionada"], anim: "nenhuma", interacao: "pisar", voltar: 3, prof: "plano" },
  runa:     { estados: ["Est.Apagada", "Est.Acesa"], imgs: ["runa-apagada", "runa-acesa"], anim: "pulsar", interacao: "perto", voltar: 0, prof: "leve" },
  livre:    { estados: ["Est.Estado1", "Est.Estado2"], imgs: null, anim: "deslizar", interacao: "clicar", voltar: 0, prof: "medio" }
};
export const PRONTOS = ["alavanca", "botao", "bau", "placa", "runa"];
export const imgPreset = (p, i) => PRESETS[p]?.imgs ? `${ASSETS}/${PRESETS[p].imgs[i]}.svg` : "";

// Profundidade (efeito 3D): sombra, altura (o quanto "salta" do mapa) e inclinação
export const PROFS = { plano: { sombra: 0, altura: 0, incl: 0 }, leve: { sombra: 40, altura: 5, incl: 8 }, medio: { sombra: 60, altura: 12, incl: 16 }, alto: { sombra: 85, altura: 22, incl: 28 } };
export const profPadrao = nome => ({ preset: nome, ...PROFS[nome], parallax: nome !== "plano" });
export const ANIMS = ["nenhuma", "girar", "deslizar", "virar", "pulsar", "sumir"];
export const INTERACOES = ["clicar", "pisar", "perto", "mestre"];
export const QUEM = ["todos", "jogadores", "npcs", "ator"];
export const PARA = ["disparou", "mapa", "todos", "mestre"];
export const MOMENTOS_PAREDE = ["abrir", "fechar", "trancar", "destrancar", "tentativa", "atravessar"];

// Ações: campos (tipo do campo, valor inicial, escolhas)
export const ACOES = {
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
export const novaAcao = tipo => ({ id: novoId(), tipo, atraso: 0, ...Object.fromEntries(Object.entries(ACOES[tipo].campos).map(([k, [, v]]) => [k, clone(v)])) });

// Configuração guardada no objeto (flags)
export const cfgDe = doc => doc?.getFlag?.(ID, "objeto") ?? null;
export const ehObjeto = doc => !!cfgDe(doc);
export const ehTile = doc => doc?.documentName === "Tile";

// Configuração inicial de um objeto. Sem doc (objeto ainda não criado) é sempre um tile.
export function padrao(doc, preset = null, img = null) {
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

export function objetosDe(cena) {
  const lista = [];
  for (const d of cena?.tiles ?? []) if (ehObjeto(d)) lista.push(d);
  for (const d of cena?.walls ?? []) if (ehObjeto(d)) lista.push(d);
  return lista;
}

export function nomeObjeto(doc) {
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
export function momentosDe(doc, c = cfgDe(doc)) {
  const lista = ehTile(doc)
    ? (c?.estados ?? []).map(e => ({ id: `estado:${e.id}`, nome: t("Mom.AoFicar", { estado: e.nome || "?" }) }))
    : MOMENTOS_PAREDE.filter(m => doc.door > 0 || m === "atravessar").map(m => ({ id: m, nome: t(`Mom.${m}`) }));
  if (ehTile(doc) || doc.door > 0) lista.push({ id: "sempre", nome: t(ehTile(doc) ? "Mom.sempreTile" : "Mom.sempreParede") });
  if (ehTile(doc) && (c?.trancado || temFechadura(doc) || c?.acoes?.destrancado?.length)) lista.push({ id: "destrancado", nome: t("Mom.destrancado") });
  if (ehTile(doc) && (c?.teste?.modo ?? "nenhum") === "desarmar") lista.push({ id: "desarmar", nome: t("Mom.desarmar") });
  if (ehTile(doc) && (c?.teste?.modo ?? "nenhum") !== "nenhum") lista.push({ id: "falha", nome: t("Mom.falha") });
  if (ehTile(doc) && c?.teste?.modo === "consertar" && (c.teste.depois ?? "acoes") !== "nada") lista.push({ id: "usoConsertado", nome: t("Mom.usoConsertado") });
  return lista;
}

// Geometria
export function girar(p, cx, cy, graus) {
  const r = -(graus ?? 0) * Math.PI / 180;
  if (!r) return p;
  const dx = p.x - cx, dy = p.y - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}
export function noTile(doc, p) {
  const q = girar(p, doc.x + doc.width / 2, doc.y + doc.height / 2, doc.rotation);
  return q.x >= doc.x && q.x <= doc.x + doc.width && q.y >= doc.y && q.y <= doc.y + doc.height;
}
// Distância (em casas) de um ponto até a borda do tile
export function distanciaAoTile(doc, p, gs) {
  const q = girar(p, doc.x + doc.width / 2, doc.y + doc.height / 2, doc.rotation);
  const dx = Math.max(doc.x - q.x, 0, q.x - (doc.x + doc.width));
  const dy = Math.max(doc.y - q.y, 0, q.y - (doc.y + doc.height));
  return Math.hypot(dx, dy) / gs;
}
export const centroToken = (tk, x = tk.x, y = tk.y) => {
  const gs = tk.parent.dimensions.size;
  return { x: x + (tk.width ?? 1) * gs / 2, y: y + (tk.height ?? 1) * gs / 2 };
};
export function centroDe(doc) {
  if (ehTile(doc)) return { x: doc.x + doc.width / 2, y: doc.y + doc.height / 2 };
  if (doc?.documentName === "Wall") return { x: (doc.c[0] + doc.c[2]) / 2, y: (doc.c[1] + doc.c[3]) / 2 };
  return null;
}
export async function centroDaRegiao(uuid) {
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
export function cruza(a, b, c) {
  if (!c) return false;
  const [x1, y1, x2, y2] = c;
  const lado = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return lado(a.x, a.y, b.x, b.y, x1, y1) !== lado(a.x, a.y, b.x, b.y, x2, y2)
    && lado(x1, y1, x2, y2, a.x, a.y) !== lado(x1, y1, x2, y2, b.x, b.y);
}

// Quem recebe um efeito na tela
export function alvos(para, ctx) {
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
export function tokenDoUsuario(userId, cena) {
  const u = game.users.get(userId);
  if (!u || u.isGM || !u.character || !cena) return null;
  return cena.tokens.find(tk => tk.actorId === u.character.id) ?? null;
}

// Nomes de token, jogador, objeto e mapa entram no chat escapados (o texto do mestre continua com HTML)
export const preencher = (texto, ctx) => String(texto ?? "")
  .replaceAll("{token}", esc(ctx.token?.name ?? ""))
  .replaceAll("{jogador}", esc(game.users.get(ctx.userId)?.name ?? ""))
  .replaceAll("{objeto}", esc(nomeObjeto(ctx.fonte)))
  .replaceAll("{mapa}", esc(ctx.cena.navName || ctx.cena.name));

// Uma ação, com o tempo de espera antes dela (as ações acontecem uma depois da outra)
export const pausa = segundos => new Promise(r => setTimeout(r, Math.max(0, Number(segundos) || 0) * 1000));

// Alguém usou um objeto (tile)
// ---------- Teste (perícia, ferramenta, atributo, salvaguarda ou fórmula) e modo Consertar
export const TESTE_PADRAO = { modo: "nenhum", como: "rolagem", minijogo: "aneis", tempo: 45, qual: "skill:arc", formula: "1d20", cd: 15, mostrarCD: false, quemRola: "jogador", tentativas: 0, feitas: 0, msgFalha: "", depois: "acoes" };
export const testeDe = c => ({ ...TESTE_PADRAO, ...(c?.teste ?? {}) });
// Precisa passar no teste agora? (no Consertar, só enquanto está quebrado = primeira aparência)
export function precisaTeste(c) {
  const tt = testeDe(c);
  if (tt.modo === "usar") return true;
  if (tt.modo === "consertar") return (c?.estado ?? 0) === 0;
  return false;
}
export const consertado = c => testeDe(c).modo === "consertar" && (c?.estado ?? 0) !== 0;
