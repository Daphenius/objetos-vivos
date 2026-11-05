// A névoa densa das Regiões saiu deste módulo (vai para um módulo próprio). O tipo de comportamento
// continua registrado, VAZIO, só para que Regiões que ainda o tenham não quebrem o carregamento da
// cena ("not a valid type"). Ele não faz nada; o mestre é avisado para apagá-lo.
import { ID, t } from "./nucleo.js";

export const TIPO_NEVOA = `${ID}.nevoaDensa`;

export function registrarNevoaLegada() {
  const Base = foundry.data.regionBehaviors.RegionBehaviorType;
  CONFIG.RegionBehavior.dataModels[TIPO_NEVOA] = class NevoaLegada extends Base {
    static defineSchema() { return {}; }
  };
  CONFIG.RegionBehavior.typeIcons[TIPO_NEVOA] = "fa-solid fa-ban";
}

// Regiões (em todos os mapas) que ainda têm o comportamento antigo
export function regioesComNevoaLegada() {
  const lista = [];
  for (const cena of game.scenes) for (const r of cena.regions ?? []) {
    if ((r.behaviors ?? []).some(b => b.type === TIPO_NEVOA)) lista.push(`${cena.name} → ${r.name}`);
  }
  return lista;
}

export function avisarNevoaLegada() {
  if (!game.user.isGM) return;
  const lista = regioesComNevoaLegada();
  if (!lista.length) return;
  ui.notifications.warn(t("Aviso.NevoaRemovida", { n: lista.length }), { permanent: true });
  console.warn(`${ID} | Regiões com o comportamento "Névoa densa" (removido; pode apagar):\n${lista.join("\n")}`);
}
