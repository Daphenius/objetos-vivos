// Comportamento de Região "Névoa densa": a área da Região fica coberta por uma névoa espessa para
// quem não tem permissão de ver. Fica na aba Comportamentos da Região, como os comportamentos do Foundry.
// Quem vê através: os personagens escolhidos pelo mestre, quem tiver um item ou efeito com o nome
// combinado, e todo mundo quando o objeto ligado (uma cidade do mapa interativo) é destrancado.
import { ID, estaTrancado } from "./nucleo.js";

export const TIPO_NEVOA = `${ID}.nevoaDensa`;
const f = () => foundry.data.fields;

// A classe é criada no init (a base do Foundry só existe no jogo)
export let NevoaDensa = null;
export function criarTipoNevoa() {
  if (NevoaDensa) return NevoaDensa;
  NevoaDensa = class NevoaDensa extends foundry.data.regionBehaviors.RegionBehaviorType {
  static LOCALIZATION_PREFIXES = ["OV.NevoaDensa"];

  static defineSchema() {
    const F = f();
    const numero = (initial, min, max) => new F.NumberField({ required: true, nullable: false, integer: true, initial, min, max });
    return {
      atores: new F.SetField(new F.StringField({ blank: false }), { initial: [] }),
      itens: new F.StringField({ required: true, blank: true, initial: "" }),
      objeto: new F.StringField({ required: true, blank: true, initial: "" }),
      mestre: new F.BooleanField({ initial: true }),
      visualProprio: new F.BooleanField({ initial: false }),
      cor: new F.ColorField({ required: true, nullable: false, initial: "#b4bcc6" }),
      opacidade: numero(100, 30, 100),
      borda: numero(100, 0, 100),
      brilho: numero(0, 0, 100),
      corBrilho: new F.ColorField({ required: true, nullable: false, initial: "#ffffff" }),
      viva: new F.BooleanField({ initial: true }),
      densidade: numero(85, 0, 100),
      velocidade: numero(35, 0, 100)
    };
  }
  };
  return NevoaDensa;
}

// Escolhas dos campos (personagens dos jogadores e objetos do mapa), montadas na hora de abrir a ficha
export function escolhasNevoa() {
  const atores = Object.fromEntries(game.actors.filter(a => a.hasPlayerOwner).map(a => [a.id, a.name]));
  const objetos = { "": "—" };
  for (const d of canvas.scene?.tiles ?? []) { const nome = d.getFlag(ID, "objeto")?.nome; if (nome) objetos[d.uuid] = nome; }
  return { atores, objetos };
}

// Comportamentos de névoa densa ligados nas Regiões do mapa atual
export function nevoasDoMapa(cena = canvas.scene) {
  const lista = [];
  for (const r of cena?.regions ?? []) for (const b of r.behaviors ?? []) if (b.type === TIPO_NEVOA && !b.disabled) lista.push({ regiao: r, dados: b.system, id: b.uuid });
  return lista;
}

// Como este usuário vê a névoa: "nao" (cobre), "mestre" (clara, só para o mestre) ou "sim" (não aparece)
export function visaoDaNevoa(d, user = game.user, atores = atoresDoUsuario(user)) {
  // mestre: "vê através" = nada desenhado; senão, névoa clara, só para saber onde está
  if (user.isGM) return d.mestre ? "sim" : "mestre";
  if (d.objeto) { const o = globalThis.fromUuidSync?.(d.objeto); if (o && !estaTrancado(o)) return "sim"; }
  const ids = d.atores instanceof Set ? d.atores : new Set(d.atores ?? []);
  const nomes = String(d.itens ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  for (const a of atores) {
    if (ids.has(a.id)) return "sim";
    if (!nomes.length) continue;
    const bate = x => nomes.includes(String(x?.name ?? "").trim().toLowerCase());
    if ((a.items ?? []).some(bate)) return "sim";
    if ([...(a.appliedEffects ?? a.effects ?? [])].some(e => bate(e) && !e.disabled)) return "sim";
  }
  return "nao";
}
// Personagem do usuário mais os atores dos tokens dele no mapa
export function atoresDoUsuario(user = game.user, cena = canvas.scene) {
  const lista = new Map();
  if (user.character) lista.set(user.character.id, user.character);
  for (const tk of cena?.tokens ?? []) { const a = tk.actor; if (a && a.testUserPermission?.(user, "OWNER")) lista.set(a.id, a); }
  return [...lista.values()];
}

export function registrarNevoaDensa() {
  CONFIG.RegionBehavior.dataModels[TIPO_NEVOA] = criarTipoNevoa();
  CONFIG.RegionBehavior.typeIcons[TIPO_NEVOA] = "fa-solid fa-cloud";
}
