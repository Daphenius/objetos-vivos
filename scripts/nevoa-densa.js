// Região de névoa densa: um comportamento para as Regiões nativas do Foundry. Dentro da forma da
// Região ninguém enxerga nada, a não ser quem tem permissão: os personagens marcados na Região ou quem
// carrega um item (ou tem um efeito ativo) com o nome escolhido. Para esses a névoa não é desenhada.
// A névoa é só visual e vale por computador: cada jogador vê conforme os personagens dele.
import { ID } from "./nucleo.js";

export const TIPO_DENSA = `${ID}.nevoaDensa`;

const campos = globalThis.foundry?.data?.fields;
const Base = globalThis.foundry?.data?.regionBehaviors?.RegionBehaviorType;

// Lista de personagens como seleção múltipla (os personagens dos jogadores). Guarda só os ids, sem
// conferir contra a lista: apagar um personagem depois não invalida a Região.
class CampoPersonagens extends (campos?.SetField ?? class {}) {
  _toInput(config) {
    try {
      const marcados = new Set(config.value ?? []);
      config.options = game.actors.filter(a => a.hasPlayerOwner || marcados.has(a.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(a => ({ value: a.id, label: a.name }));
    } catch { /* sem a lista, o Foundry mostra o campo de texto dele */ }
    return super._toInput(config);
  }
}

class NevoaDensa extends (Base ?? class {}) {
  static defineSchema() {
    return {
      personagens: new CampoPersonagens(new campos.StringField({ required: true, blank: false }), { label: "OV.Densa.Personagens", hint: "OV.Densa.PersonagensDica" }),
      chave: new campos.StringField({ required: false, blank: true, initial: "", label: "OV.Densa.Chave", hint: "OV.Densa.ChaveDica" }),
      cor: new campos.ColorField({ required: true, nullable: false, initial: "#aeb6c2", label: "OV.Densa.Cor", hint: "OV.Densa.CorDica" }),
      opacidade: new campos.NumberField({ required: true, nullable: false, integer: true, min: 10, max: 100, step: 5, initial: 100, label: "OV.Densa.Opacidade", hint: "OV.Densa.OpacidadeDica" })
    };
  }
}

export function registrarNevoaDensa() {
  if (!Base || !campos || !CONFIG.RegionBehavior) return;
  CONFIG.RegionBehavior.dataModels[TIPO_DENSA] = NevoaDensa;
  if (CONFIG.RegionBehavior.typeIcons) CONFIG.RegionBehavior.typeIcons[TIPO_DENSA] = "fa-solid fa-smog";
  if (CONFIG.RegionBehavior.typeLabels) CONFIG.RegionBehavior.typeLabels[TIPO_DENSA] = "OV.Densa.Tipo";
}

// As regiões de névoa densa ligadas de uma cena: [{ regiao, sys }]
export function regioesDensas(cena) {
  const lista = [];
  for (const regiao of cena?.regions ?? []) {
    for (const b of regiao.behaviors ?? []) if (b.type === TIPO_DENSA && !b.disabled) lista.push({ regiao, sys: b.system ?? {} });
  }
  return lista;
}

const igual = (a, b) => String(a ?? "").trim().toLowerCase() === b;
// O personagem carrega um item, ou tem um efeito ativo (ou condição), com este nome?
export function temChave(ator, chave) {
  const nome = String(chave ?? "").trim().toLowerCase();
  if (!nome || !ator) return false;
  for (const i of ator.items ?? []) if (igual(i.name, nome)) return true;
  for (const e of ator.appliedEffects ?? ator.effects ?? []) if (!e.disabled && igual(e.name, nome)) return true;
  return !!ator.statuses?.has?.(nome);
}

// Os personagens de um usuário neste mapa: o personagem dele e os tokens que ele controla
function atoresDe(user, cena) {
  const atores = new Map();
  if (user?.character) atores.set(user.character.id, user.character);
  for (const tk of cena?.tokens ?? []) {
    const a = tk.actor;
    if (a && a.testUserPermission?.(user, "OWNER")) atores.set(tk.id, a);
  }
  return [...atores.values()];
}

// Este usuário enxerga dentro da névoa densa? (algum personagem dele está na lista ou tem o item/efeito)
export function veNaNevoa(sys, user = game.user, cena = canvas.scene) {
  const marcados = new Set(sys?.personagens ?? []);
  return atoresDe(user, cena).some(a => marcados.has(a.id) || temChave(a, sys?.chave));
}

// ---------- Forma da região
// Ponto dentro de um polígono (lista corrida x0, y0, x1, y1...)
export function dentroDe(x, y, pontos) {
  let dentro = false;
  for (let i = 0, j = pontos.length - 2; i < pontos.length; j = i, i += 2) {
    const xi = pontos[i], yi = pontos[i + 1], xj = pontos[j], yj = pontos[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

const elipse = (x, y, rx, ry, n = 48) => { const p = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; p.push(x + Math.cos(a) * rx, y + Math.sin(a) * ry); } return p; };
// Uma forma simples da Região virada em lista de pontos (reserva, quando o Foundry não entrega os polígonos prontos)
function pontosDaForma(f) {
  switch (f?.type) {
    case "rectangle": {
      const cx = f.x + f.width / 2, cy = f.y + f.height / 2, a = ((Number(f.rotation) || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([sx, sy]) => { const dx = sx * f.width / 2, dy = sy * f.height / 2; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; });
    }
    case "circle": return elipse(f.x, f.y, f.radius, f.radius);
    case "ellipse": return elipse(f.x, f.y, f.radiusX, f.radiusY);
    case "polygon": return Array.from(f.points ?? []);
    default: return null;
  }
}

// Os polígonos de uma Região: [{ pontos, buraco }]. Usa os que o Foundry já calculou (formas somadas e
// buracos descontados); se não houver, monta pelas formas simples.
export function poligonosDe(regiao) {
  let prontos = null;
  try { prontos = regiao.polygons ?? regiao.object?.polygons ?? null; } catch { prontos = null; }
  if (prontos?.length) return prontos.map(p => ({ pontos: Array.from(p.points ?? []), buraco: p.isPositive === false })).filter(p => p.pontos.length >= 6);
  const lista = [];
  for (const f of regiao.shapes ?? []) {
    const pontos = pontosDaForma(f);
    if (pontos && pontos.length >= 6) lista.push({ pontos, buraco: !!f.hole });
  }
  return lista;
}
