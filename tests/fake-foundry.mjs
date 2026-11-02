// Foundry falso, mínimo, só para os testes rodarem no Node (sem navegador).
// Imita o que o módulo usa: usuários, mensagens do chat, cena com tiles/tokens/paredes, flags,
// socket, notificações e as classes de janela (que aqui não desenham nada).

const getP = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
const setP = (o, p, v) => { const ks = p.split("."); let x = o; for (const k of ks.slice(0, -1)) x = x[k] ??= {}; x[ks.at(-1)] = v; };

export const registro = new Map();     // uuid -> documento
export const ganchos = {};             // nome -> [funções]
export const avisos = [];              // ui.notifications
export const chat = [];                // mensagens criadas pelas ações "chat"
export const emitidos = [];            // game.socket.emit
export const confirmacoes = { n: 0, resposta: true };
export const rolagens = { n: 0, total: 12 };
export const config = { biblioteca: [] };
let ouvinteSocket = null;
export const socket = (...args) => ouvinteSocket(...args);

class Colecao extends Map {
  [Symbol.iterator]() { return this.values(); } // como as coleções do Foundry: percorre os documentos
  get contents() { return [...this.values()]; }
  filter(f) { return this.contents.filter(f); }
  find(f) { return this.contents.find(f); }
}

export const usuarios = new Colecao();
export function usuario(id, isGM = false) {
  const u = { id, name: id, isGM, active: true, character: null };
  usuarios.set(id, u);
  return u;
}
export const mestre = usuario("gm", true);
export const ana = usuario("ana");
export const beto = usuario("beto");
Object.defineProperty(usuarios, "activeGM", { get: () => mestre });

export const mensagens = new Colecao();
export function mensagem(id, autor, total) {
  const m = { id, author: autor, timestamp: Date.now(), rolls: [{ total }] };
  mensagens.set(id, m);
  return m;
}

export const cena = { id: "c1", name: "Mapa", tiles: new Colecao(), tokens: [], walls: [], dimensions: { size: 100 } };

function documento(base) {
  return {
    ...base,
    getFlag(m, k) { return getP(this.flags?.[m], k); },
    async setFlag(m, k, v) { setP(this.flags[m] ??= {}, k, v); },
    async update(u) { for (const [k, v] of Object.entries(u)) setP(this, k, v); }
  };
}
export function tile(id, objeto) {
  const d = documento({ documentName: "Tile", id, uuid: `Scene.c1.Tile.${id}`, parent: cena, hidden: false, x: 0, y: 0, width: 100, height: 100,
    rotation: 0, texture: { src: "a.png" }, flags: { "objetos-vivos": { objeto } } });
  cena.tiles.set(id, d);
  registro.set(d.uuid, d);
  return d;
}
export function token(id, dono, { x = 0, y = 0 } = {}) {
  const tk = { id, uuid: `Scene.c1.Token.${id}`, name: id, parent: cena, x, y, width: 1, height: 1,
    actor: { uuid: `Actor.${id}`, hasPlayerOwner: !!dono, testUserPermission: u => u.id === dono, getRollData: () => ({}) } };
  registro.set(tk.uuid, tk);
  return tk;
}
export function parede(id, objeto, c = [0, 0, 0, 0]) {
  const w = documento({ documentName: "Wall", id, uuid: `Scene.c1.Wall.${id}`, parent: cena, door: 1, ds: 0, c, flags: { "objetos-vivos": { objeto } } });
  registro.set(w.uuid, w);
  cena.walls.push(w);
  return w;
}

export const espera = ms => new Promise(r => setTimeout(r, ms));

// Instala tudo em globalThis (antes de importar os scripts do módulo)
export function instalar() {
  globalThis.Hooks = {
    on: (n, f) => (ganchos[n] ??= []).push(f),
    once: (n, f) => (ganchos[n] ??= []).push(f),
    callAll: (n, ...a) => { for (const f of ganchos[n] ?? []) f(...a); }
  };
  class App { constructor(o = {}) { this.options = o; } render() { return this; } close() {} }
  globalThis.foundry = {
    utils: {
      randomID: (n = 16) => Math.random().toString(36).slice(2, 2 + n).padEnd(n, "0"),
      deepClone: x => structuredClone(x), getProperty: getP, setProperty: setP,
      hasProperty: (o, p) => getP(o, p) !== undefined, isNewerVersion: () => true
    },
    applications: {
      api: { ApplicationV2: App, HandlebarsApplicationMixin: B => class extends B {},
        DialogV2: { confirm: async () => { confirmacoes.n++; return confirmacoes.resposta; }, wait: async () => null } },
      apps: { FilePicker: { implementation: class {} }, ImagePopout: class {} },
      handlebars: { loadTemplates: async () => {} },
      instances: new Map()
    },
    canvas: { loadTexture: async () => null },
    audio: { AudioHelper: { play: async () => {} } }
  };
  globalThis.ui = { notifications: { info: m => avisos.push(m), warn: m => avisos.push(m), error: m => avisos.push(`ERRO ${m}`) } };
  globalThis.CONST = { DICE_ROLL_MODES: { BLIND: "blindroll" }, WALL_DOOR_STATES: { CLOSED: 0, OPEN: 1, LOCKED: 2 },
    DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 }, UPLOADABLE_FILE_EXTENSIONS: { png: "image/png" } };
  globalThis.CONFIG = { ChatMessage: { documentClass: { create: async d => { chat.push(d); } } } };
  globalThis.ChatMessage = { getSpeaker: () => ({}) };
  globalThis.fromUuid = async u => registro.get(u) ?? null;
  globalThis.fromUuidSync = u => registro.get(u) ?? null;
  globalThis.Roll = class {
    constructor(f) { this.formula = f; }
    async evaluate() { rolagens.n++; this.total = rolagens.total; return this; }
    async toMessage() { mensagem(`r${rolagens.n}`, game.user, this.total); }
  };
  globalThis.canvas = { ready: false, scene: cena, dimensions: { size: 100 }, tiles: { placeables: [] }, tokens: { placeables: [] } };
  globalThis.game = {
    user: mestre, users: usuarios, messages: mensagens, scenes: [cena], system: { id: "teste", version: "1" },
    modules: { get: () => ({ active: false }) }, playlists: { playing: [] },
    i18n: { lang: "pt-BR", localize: k => k, format: k => k },
    socket: { emit: (_canal, d) => emitidos.push(d), on: (_canal, f) => { ouvinteSocket = f; } },
    settings: { get: (_m, k) => config[k], set: async (_m, k, v) => { config[k] = v; }, register() {} }
  };
}

// Roda o "ready" do módulo (registra o socket e a API)
export function prontos() { for (const f of ganchos.ready ?? []) f(); }
