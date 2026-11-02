import { icone } from "./editor.js";
import { criarObjeto, encaixar, escolherImagem, nomeDoArquivo } from "./encaixe.js";
import { DD_PX_POR_CASA, fecharPacote, lerPacoteDD, pacotes, tipoImagem, urlDaMiniatura } from "./gdpc.js";
import { ID, PRONTOS, clone, comparar, decodificar, esc, imgPreset, nomeObjeto, novoId, t } from "./nucleo.js";

// "Meus objetos": objetos que o mestre salvou para reaproveitar em qualquer mapa
// Nada do estado de jogo vai para a biblioteca: o objeto salvo sempre começa do zero
export function zerarEstado(cfg) {
  Object.assign(cfg, { estado: 0, usados: 0, trancado: false, revelado: false, desarmado: false });
  if (cfg.teste) cfg.teste.feitas = 0;
  return cfg;
}
export const meusObjetos = () => game.settings.get(ID, "biblioteca") ?? [];
export async function salvarNaBiblioteca(doc, dados) {
  const gs = doc.parent?.dimensions?.size ?? canvas.dimensions.size;
  const cfg = clone(dados);
  zerarEstado(cfg);
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

// Manda para o Foundry só a imagem que vai ser usada (os jogadores precisam carregá-la do servidor)
export async function enviarDoPacote(pac, a) {
  if (pac.enviados.has(a.rel)) return pac.enviados.get(a.rel);
  const FP = foundry.applications.apps.FilePicker.implementation;
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

export async function usarDoPacote(id, rel, onde = null) {
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

export const EXT_IMAGEM = /\.(png|jpe?g|webp|gif|svg|avif|webm|mp4)$/i;
export const ehVideo = c => /\.(webm|mp4)$/i.test(c);
export const TAMANHOS = { p: 84, m: 116, g: 160 };
export const POR_GRUPO = 36;

// Biblioteca: barra lateral (seções e categorias dos pacotes) + grade de miniaturas
// O HTML fica em templates/biblioteca.hbs (+ parciais do cartão e do item da barra lateral);
// aqui só se montam os dados. O Handlebars escapa tudo o que entra com {{ }}.
const TEMPLATES = `modules/${ID}/templates`;
const ICONE_TAM = { p: "fa-table-cells", m: "fa-table-cells-large", g: "fa-square" };

export class BibliotecaObjetos extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${ID}-biblioteca`,
    classes: ["ov-biblioteca"],
    position: { width: 900, height: 680, left: 110, top: 60 },
    window: { icon: "fa-solid fa-cube", resizable: true }
  };
  // Uma parte só, com a janela inteira. As parciais listadas em "templates" são carregadas
  // (e registradas) pelo Foundry com loadTemplates antes da primeira renderização.
  static PARTS = {
    biblioteca: {
      template: `${TEMPLATES}/biblioteca.hbs`,
      templates: [`${TEMPLATES}/biblioteca-cartao.hbs`, `${TEMPLATES}/biblioteca-item.hbs`]
    }
  };
  secao = "prontos";   // prontos | pasta | meus | pacote
  pacoteId = null;
  ddPasta = "";
  busca = "";
  limite = 240;
  pasta = null;
  lista = null;

  get title() { return t("Bib.Titulo"); }
  get FP() { return foundry.applications.apps.FilePicker.implementation; }
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

  // ---------- dados para o template
  // Item da barra lateral: só um dos campos secao/pacoteId/ddPasta/guardado vem preenchido
  _ctxItem({ secao = null, pacoteId = null, ddPasta = null, guardado = null, iconeNome, nome, conta = null, ativo = false, nivel = 0 }) {
    return { secao, pacoteId, temDdPasta: ddPasta !== null, ddPasta, guardado, icone: iconeNome, nome, temConta: conta !== null, conta, ativo, nivel };
  }

  _nomePasta(p) {
    const k = `DD.Pasta.${p}`;
    const tr = t(k);
    if (typeof tr === "string" && tr !== `OV.${k}`) return tr;
    const nome = p.replace(/[-_]+/g, " ").trim();
    return nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  _ctxLado() {
    const meus = meusObjetos();
    const salva = game.settings.get(ID, "pastaAssets") ?? {};
    const guardados = (game.settings.get(ID, "pacotesGuardados") ?? []).filter(g => ![...pacotes.values()].some(p => p.caminho === g.caminho));
    const secoes = [
      this._ctxItem({ secao: "prontos", iconeNome: "fa-shapes", nome: t("Bib.Prontos"), conta: PRONTOS.length, ativo: this.secao === "prontos" }),
      this._ctxItem({ secao: "meus", iconeNome: "fa-bookmark", nome: t("Bib.Meus"), conta: meus.length, ativo: this.secao === "meus" }),
      this._ctxItem({ secao: "pasta", iconeNome: "fa-folder-open", nome: salva.pasta ? decodificar(salva.pasta.replace(/\/$/, "").split("/").pop()) : t("Assets.Aba"), ativo: this.secao === "pasta" })
    ];
    const lista = [];
    for (const pac of pacotes.values()) {
      const ativo = this.secao === "pacote" && this.pacoteId === pac.id;
      lista.push(this._ctxItem({ pacoteId: pac.id, iconeNome: "fa-box-open", nome: pac.nome, conta: pac.imagens.length, ativo: ativo && !this.ddPasta && !this.busca }));
      if (!ativo) continue;
      // Categorias de primeiro nível e, da aberta, as subcategorias
      const topo = [...pac.contagem.keys()].filter(k => !k.includes("/")).sort((a, b) => (a === "objects" ? -1 : b === "objects" ? 1 : comparar(a, b)));
      for (const c of topo) {
        lista.push(this._ctxItem({ ddPasta: c, iconeNome: "fa-folder", nome: this._nomePasta(c), conta: pac.contagem.get(c), ativo: this.ddPasta === c && !this.busca, nivel: 1 }));
        if (!(this.ddPasta === c || this.ddPasta.startsWith(`${c}/`))) continue;
        const subs = [...pac.contagem.keys()].filter(k => k.startsWith(`${c}/`) && k.split("/").length === 2).sort(comparar);
        for (const sub of subs) lista.push(this._ctxItem({ ddPasta: sub, iconeNome: "fa-folder-tree", nome: this._nomePasta(sub.split("/")[1]), conta: pac.contagem.get(sub), ativo: (this.ddPasta === sub || this.ddPasta.startsWith(`${sub}/`)) && !this.busca, nivel: 2 }));
      }
    }
    for (const g of guardados) lista.push(this._ctxItem({ guardado: g.caminho, iconeNome: "fa-cloud-arrow-down", nome: g.nome, nivel: 0 }));
    return { rotulo: t("Bib.Titulo"), secoes, pacotes: lista, abrir: t("DD.Abrir") };
  }

  // Cartão de asset: só um de preset/salvo/img/dd vem preenchido (dd sempre junto com pac)
  _ctxCartao({ preset = null, salvo = null, img = null, dd = null, pac = null, src, nome, video = false }) {
    return { preset, salvo, img, dd, pac, src, nome, nomeBusca: nome.toLowerCase(), video };
  }

  _ctxProntos() {
    return { prontos: { titulo: t("Bib.Prontos"), cartoes: PRONTOS.map(p => this._ctxCartao({ preset: p, src: imgPreset(p, 0), nome: t(`Preset.${p}.Nome`) })) } };
  }

  _ctxMeus() {
    const rotuloApagar = t("Editor.Remover");
    const cartoes = meusObjetos().map(o => ({ ...this._ctxCartao({ salvo: o.id, src: o.img, nome: o.nome, video: ehVideo(o.img) }), rotuloApagar }));
    return { meus: { titulo: t("Bib.Meus"), vazio: t("Bib.MeusVazio"), cartoes } };
  }

  _ctxPasta() {
    const salva = game.settings.get(ID, "pastaAssets") ?? {};
    if (!salva.pasta) return { semPasta: { titulo: t("Assets.Aba"), explica: t("Assets.Explica"), escolher: t("Assets.Escolher") } };
    const l = this.lista ?? { dirs: [], files: [], pacotes: [] };
    const raiz = salva.pasta.replace(/\/$/, "");
    const atual = (this.pasta ?? raiz).replace(/\/$/, "");
    return { pasta: {
      podeSubir: atual !== raiz && atual.startsWith(raiz),
      rotuloVoltar: t("Assets.Voltar"),
      caminho: atual,
      nome: decodificar(atual.split("/").pop() || atual),
      trocar: t("Assets.Trocar"),
      erro: l.erro ? t("Assets.Erro") : "",
      temChips: !!(l.dirs.length || l.pacotes.length),
      pacotes: l.pacotes.map(f => ({ arquivo: f, nome: nomeDoArquivo(f), nomeBusca: nomeDoArquivo(f).toLowerCase() })),
      dirs: l.dirs.map(d => ({ dir: d, nome: decodificar(d.replace(/\/$/, "").split("/").pop()), nomeBusca: nomeDoArquivo(d).toLowerCase() })),
      cartoes: l.files.slice(0, this.limite).map(f => this._ctxCartao({ img: f, src: f, nome: nomeDoArquivo(f), video: ehVideo(f) })),
      mais: l.files.length > this.limite ? t("Assets.Mais", { n: l.files.length - this.limite }) : "",
      vazia: !l.erro && !l.files.length && !l.dirs.length && !l.pacotes.length ? t("Assets.Vazia") : ""
    } };
  }

  _ctxPacote() {
    const pac = this.pacote;
    if (!pac) { this.secao = "prontos"; return this._ctxProntos(); }
    const pacote = {
      nome: pac.nome,
      autor: pac.autor ? t("DD.De", { autor: pac.autor }) : "",
      total: t("DD.Total", { n: pac.imagens.length }),
      guardar: pac.caminho ? null : { texto: t("DD.Guardar"), dica: t("DD.GuardarDica") },
      fechar: t("DD.Fechar"),
      vazia: t("Assets.Vazia"),
      busca: null, trilha: null, grupos: []
    };
    const card = a => this._ctxCartao({ dd: a.rel, pac: pac.id, src: urlDaMiniatura(pac, a), nome: nomeDoArquivo(a.rel) });

    // Busca: no pacote todo
    const q = this.busca.trim().toLowerCase();
    if (q) {
      const achados = pac.imagens.filter(a => nomeDoArquivo(a.rel).toLowerCase().includes(q) || a.rel.toLowerCase().includes(q));
      pacote.busca = {
        resultados: t("DD.Resultados", { n: achados.length }),
        cartoes: achados.slice(0, this.limite).map(card),
        mais: achados.length > this.limite ? t("Assets.Mais", { n: achados.length - this.limite }) : ""
      };
      return { pacote };
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
    if (this.ddPasta) pacote.trilha = this.ddPasta.split("/").map((p, i, arr) => ({ caminho: arr.slice(0, i + 1).join("/"), nome: this._nomePasta(p) }));
    const ordem = [...grupos.keys()].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a === "objects" ? -1 : b === "objects" ? 1 : comparar(a, b)));
    pacote.grupos = ordem.map(g => {
      const lista = grupos.get(g);
      const mostrar = g ? lista.slice(0, POR_GRUPO) : lista.slice(0, this.limite);
      return {
        temPasta: !!g,
        caminho: prefixo + g,
        nome: g ? this._nomePasta(g) : (this.ddPasta ? this._nomePasta(this.ddPasta.split("/").pop()) : pac.nome),
        conta: lista.length,
        verTodos: g && lista.length > POR_GRUPO ? t("DD.VerTodos", { n: lista.length }) : "",
        cartoes: mostrar.map(card),
        mais: !g && lista.length > this.limite ? t("Assets.Mais", { n: lista.length - this.limite }) : ""
      };
    });
    return { pacote };
  }

  async _prepareContext(options) {
    try {
      if (this.secao === "pasta") await this._carregarPasta();
      // A seção vem antes da barra e da lateral: sem o pacote aberto, ela volta para "prontos"
      const corpo = this.secao === "pasta" ? this._ctxPasta() : this.secao === "meus" ? this._ctxMeus() : this.secao === "pacote" ? this._ctxPacote() : this._ctxProntos();
      const buscaPacote = this.secao === "pacote";
      return {
        ...corpo,
        barra: {
          minha: t("Bib.Minha"),
          buscaPacote,
          busca: buscaPacote ? this.busca : "",
          placeholder: t(buscaPacote ? "DD.Buscar" : this.secao === "pasta" ? "Assets.Buscar" : "Bib.Buscar"),
          rotuloBusca: t("Assets.Buscar"),
          rotuloTamanho: t("Bib.Tamanho"),
          tamanhos: Object.keys(TAMANHOS).map(k => ({ k, on: this.tam === k, rotulo: t(`Bib.Tam.${k}`), icone: ICONE_TAM[k] }))
        },
        lado: this._ctxLado(),
        dica: t("Bib.Dica")
      };
    } catch (err) {
      // Nunca deixa a janela travada: mostra o erro e um botão para recomeçar
      console.error(`${ID} | erro ao desenhar a biblioteca`, err);
      return { erro: true, textos: { erro: t("Bib.Erro"), recomecar: t("Bib.Recomecar") } };
    }
  }

  async _renderHTML(context, options) {
    let partes;
    try {
      partes = await super._renderHTML(context, options);
    } catch (err) {
      // Se até o template falhar, monta a tela de erro à mão (mesmo HTML do template)
      console.error(`${ID} | erro ao desenhar a biblioteca`, err);
      const div = document.createElement("div");
      div.className = "ov-bib";
      div.dataset.applicationPart = "biblioteca";
      div.innerHTML = `<div class="ov-bib-vazio ov-folgado"><p>${esc(t("Bib.Erro"))}</p>
        <button type="button" class="ov-btn ov-forte" data-a="recomecar">${icone("fa-rotate")} ${esc(t("Bib.Recomecar"))}</button></div>`;
      partes = { biblioteca: div };
    }
    partes.biblioteca?.style?.setProperty?.("--ov-tam", `${TAMANHOS[this.tam] ?? 116}px`);
    return partes;
  }

  // Ao trocar de seção/pasta (_rolarTopo) o conteúdo volta para o topo; nos outros redesenhos a rolagem fica onde estava
  _replaceHTML(result, content, options) {
    const rolagem = content.querySelector?.(".ov-bib-conteudo")?.scrollTop ?? 0;
    const lado = content.querySelector?.(".ov-bib-lado")?.scrollTop ?? 0;
    super._replaceHTML(result, content, options);
    const c = content.querySelector?.(".ov-bib-conteudo"); if (c) c.scrollTop = this._rolarTopo ? 0 : rolagem;
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
      // O Foundry só aceita enviar alguns tipos de arquivo; se não aceitar o pacote, explica o caminho manual
      const aceitos = CONST.UPLOADABLE_FILE_EXTENSIONS ?? {};
      if (!("dungeondraft_pack" in aceitos)) return ui.notifications.warn(t("DD.NaoAceito"), { permanent: true });
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
export async function abrirBiblioteca() {
  if (!game.user.isGM) return;
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
