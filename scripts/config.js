// Janela de configurações do módulo (Configurar Definições → Objetos Vivos → Névoa e efeitos).
// Só é carregada quando o mestre abre. Mexer nos controles mostra o resultado no mapa na hora;
// "Salvar" grava para o mundo, "Cancelar" desfaz.
import { ID, PADRAO_NEVOA, esc, icone, nevoaCfg, t } from "./nucleo.js";

export const ESTILOS = {
  noite:      { cor: "#0c0f17", opJog: 94, opMestre: 40, borda: 50, brilho: 35, corBrilho: "#f0a03c" },
  pergaminho: { cor: "#3b2f1e", opJog: 88, opMestre: 35, borda: 70, brilho: 25, corBrilho: "#ffd79a" },
  arcano:     { cor: "#1a1030", opJog: 90, opMestre: 40, borda: 80, brilho: 55, corBrilho: "#9d7bff" },
  bruma:      { cor: "#6e7a86", opJog: 80, opMestre: 30, borda: 100, brilho: 0, corBrilho: "#ffffff" }
};

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ConfigObjetosVivos extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-config`,
    classes: ["ov-app", "ov-config"],
    tag: "form",
    window: { title: "OV.Config.Titulo", icon: "fa-solid fa-wand-magic-sparkles", resizable: false },
    position: { width: 520 },
    form: { handler: ConfigObjetosVivos.#salvar, closeOnSubmit: true },
    actions: { estilo: ConfigObjetosVivos.#estilo, cancelar: ConfigObjetosVivos.#cancelar, padrao: ConfigObjetosVivos.#padrao }
  };
  static PARTS = { corpo: { template: `modules/${ID}/templates/config.hbs` } };

  static abrir() {
    const aberta = foundry.applications.instances?.get?.(`${ID}-config`);
    return (aberta ?? new ConfigObjetosVivos()).render({ force: true });
  }

  constructor(opcoes = {}) {
    super(opcoes);
    this.original = nevoaCfg();
    this.dados = { ...this.original };
  }

  async _prepareContext() {
    const d = this.dados;
    const campo = (chave, nome, desc, min, max, unidade = "%") => ({ chave, nome: t(nome), desc: t(desc), valor: d[chave], min, max, unidade });
    const estiloAtivo = Object.entries(ESTILOS).find(([, e]) => Object.keys(e).every(k => String(e[k]).toLowerCase() === String(d[k]).toLowerCase()))?.[0] ?? null;
    return {
      L: { Titulo: t("Config.NevoaTitulo"), Intro: t("Config.NevoaIntro"), Estilos: t("Config.Estilos"), Cores: t("Config.Cores"), Salvar: t("Config.Salvar"), Cancelar: t("Config.Cancelar"), Padrao: t("Config.Padrao"), Dica: t("Config.NevoaDica"), Qualidade: t("Config.Qualidade"), QualidadeDica: t("Config.QualidadeDica") },
      estilos: Object.keys(ESTILOS).map(k => ({ id: k, nome: t(`Config.Estilo.${k}`), cor: ESTILOS[k].cor, brilho: ESTILOS[k].corBrilho, ativo: k === estiloAtivo })),
      cor: { chave: "cor", nome: t("Config.Cor"), desc: t("Config.CorDica"), valor: d.cor },
      corBrilho: { chave: "corBrilho", nome: t("Config.CorBrilho"), desc: t("Config.CorBrilhoDica"), valor: d.corBrilho },
      faixas: [
        campo("opJog", "Config.OpJog", "Config.OpJogDica", 30, 100),
        campo("opMestre", "Config.OpMestre", "Config.OpMestreDica", 0, 100),
        campo("borda", "Config.Borda", "Config.BordaDica", 0, 100),
        campo("brilho", "Config.Brilho", "Config.BrilhoDica", 0, 100)
      ],
      qualidade: { valor: game.settings.get(ID, "qualidade"), opcoes: ["completa", "leve", "minima"].map(v => ({ v, nome: t(`Config.${v[0].toUpperCase()}${v.slice(1)}`) })) },
      icone
    };
  }

  _onRender() {
    const el = this.element;
    el.querySelectorAll("[data-campo]").forEach(inp => inp.addEventListener("input", () => {
      const chave = inp.dataset.campo;
      this.dados[chave] = inp.type === "range" ? Number(inp.value) : inp.value;
      const saida = el.querySelector(`[data-saida="${chave}"]`);
      if (saida) saida.textContent = `${this.dados[chave]}${inp.dataset.unidade ?? ""}`;
      el.querySelectorAll("[data-action=estilo]").forEach(b => b.classList.remove("ov-on"));
      this.#previa();
    }));
  }

  // Mostra no mapa sem gravar
  #previa() { nevoaCfg.previa = { ...this.dados }; game.modules.get(ID)?.api?.atualizarMapa?.(); }

  static #estilo(_ev, alvo) {
    Object.assign(this.dados, ESTILOS[alvo.dataset.estilo]);
    this.#previa();
    this.render();
  }
  static #padrao() { this.dados = { ...PADRAO_NEVOA }; this.#previa(); this.render(); }
  static #cancelar() { this.close(); }

  static async #salvar(_ev, _form, dados) {
    const q = dados.object?.qualidade;
    if (q && q !== game.settings.get(ID, "qualidade")) await game.settings.set(ID, "qualidade", q);
    nevoaCfg.previa = null;
    await game.settings.set(ID, "nevoa", { ...this.dados });
    this.original = { ...this.dados };
  }

  async close(opcoes) {
    // fechou sem salvar: volta ao que estava
    nevoaCfg.previa = null;
    game.modules.get(ID)?.api?.atualizarMapa?.();
    return super.close(opcoes);
  }
}
