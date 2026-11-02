import { salvarNaBiblioteca } from "./biblioteca.js";
import { atualizarSecoes } from "./interface.js";
import { dificuldade } from "./minijogos.js";
import { ACOES, ANIMS, ID, INTERACOES, PARA, PRESETS, PROFS, QUEM, cfgDe, clone, comparar, decodificar, ehObjeto, ehTile, fechaduraTrancada, gazua, momentosDe, navegador, niveisDe, nomeObjeto, novaAcao, novoId, padrao, profPadrao, t, temFechadura, testeDe, volumeDe } from "./nucleo.js";
import { jogarMinijogo, opcoesDeTeste } from "./testes.js";
import { VISAO_MAX, VISOES, aplicarCamaleao, aplicarProfundidade, aplicarVisao } from "./visual.js";

export const icone = nome => `<i class="fa-solid ${nome}" aria-hidden="true"></i>`;
export const ICONES = { som: "fa-volume-high", portas: "fa-door-open", visibilidade: "fa-eye-low-vision", objeto: "fa-arrows-rotate", chat: "fa-comment",
  imagem: "fa-image", diario: "fa-book-open", camera: "fa-video", escuridao: "fa-moon", musica: "fa-music", mover: "fa-map-location-dot", escada: "fa-stairs", esperar: "fa-hourglass-half" };

export function nomeDoc(uuid) {
  try { const d = fromUuidSync(uuid); return d?.name || (d?.documentName === "Tile" ? nomeObjeto(d) : d?.documentName) || uuid; } catch { return uuid; }
}

// Resumo de uma ação em uma linha
export function resumoAcao(a) {
  const base = resumoBase(a);
  return Number(a.atraso) > 0 ? `${t("Resumo.Depois", { n: a.atraso })} · ${base}` : base;
}
export function resumoBase(a) {
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

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TPL = `modules/${ID}/templates`;

// Textos fixos usados nos templates (viram L.Grupo.Chave no contexto)
const TEXTOS = ["Editor.Etapas", "Editor.Nome", "Editor.Testar", "Editor.Estados", "Editor.NomeEstado", "Editor.RemoverEstado", "Editor.TrocarImagem",
  "Editor.Inicial", "Editor.AdicionarEstado", "Editor.MesmaImagem", "Editor.Cancelar", "Editor.Salvar", "Editor.Arquivo", "Editor.Escolher", "Editor.Ouvir",
  "Editor.Subir", "Editor.Descer", "Editor.Remover", "Bib.Salvar", "Bib.SalvarDica", "Visao.Titulo", "Visao.Dica", "Prof.Titulo", "Prof.Dica",
  "Camaleao.Titulo", "Camaleao.Revelado", "Camaleao.Reesconder", "Camaleao.SemProf", "Aparencia.Anim", "Aparencia.AnimDica", "Aparencia.Som",
  "Aparencia.SomDica", "Uso.Titulo", "Uso.Ajudas", "Uso.MestreDica", "Regras.Quem", "Regras.ArrasteAtor", "Regras.Zerar", "Quem.ator",
  "Acoes.Titulo", "Acoes.Vazio", "Acoes.Adicionar", "Mais.Titulo", "Gazua.Titulo", "Gazua.Instale", "Teste.Pergunta", "Teste.DesarmarDica",
  "Teste.EstaDesarmada", "Teste.Rearmar", "Teste.Qual", "Teste.Grupo.outro", "Teste.Formula", "Teste.Quem", "Teste.AoFalhar", "Teste.Zerar",
  "Teste.Mensagem", "Teste.AoFalharDica", "Teste.Depois", "Teste.ConsertarDica", "Mini.Testar", "Campo.atraso", "Campo.AtrasoDica",
  "Campo.SemNiveis", "Campo.TextoExemplo", "Campo.UsarPortas", "Campo.UsarSelecionados", "Campo.Limpar", "Campo.SemObjetos"];
function textos() {
  const L = {};
  for (const k of TEXTOS) foundry.utils.setProperty(L, k, t(k));
  return L;
}

// Interruptor (chave) e linha de − valor + (passo) usados por editor-faixa.hbs
const chave = (on, campo, nome, desc) => ({ on: !!on, campo, nome, desc });
const passo = (campo, texto, nome, desc, prefixo = "data") => ({ passo: true, campo, texto, nome, desc, attrMenos: `${prefixo}-menos`, attrMais: `${prefixo}-mais` });
const pilulas = (lista, atual) => lista.map(([id, chaveTexto]) => ({ id, on: atual === id, nome: t(chaveTexto) }));

// Junta a edição com o objeto como ele está agora: um campo só é trocado se foi mudado na janela
// (comparando com como estava ao abrir). Em "teste", "prof" e "visao", campo a campo.
const igual = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
function ordenar(x) {
  if (Array.isArray(x)) return x.map(ordenar);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map(k => [k, ordenar(x[k])]));
  return x;
}
const POR_CAMPO = ["teste", "prof", "visao"];
export function mesclarEdicao(atual, base, editado) {
  if (!atual) return clone(editado);
  const final = clone(atual);
  for (const k of Object.keys(editado)) {
    if (!(k in final)) { final[k] = clone(editado[k]); continue; }
    if (igual(editado[k], base[k])) continue;
    const obj = v => v && typeof v === "object" && !Array.isArray(v);
    if (POR_CAMPO.includes(k) && obj(editado[k]) && obj(final[k])) {
      for (const s of Object.keys(editado[k])) if (!igual(editado[k][s], base[k]?.[s])) final[k][s] = clone(editado[k][s]);
    } else final[k] = clone(editado[k]);
  }
  return final;
}

export class EditorObjeto extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["ov-editor"],
    position: { width: 940, height: 700 },
    window: { icon: "fa-solid fa-wand-sparkles", resizable: true }
  };

  // Uma parte só: a raiz .ov-raiz (lado + principal) continua igual à de antes
  static PARTS = {
    editor: {
      template: `${TPL}/editor.hbs`,
      templates: ["editor-lado", "editor-aparencia", "editor-uso", "editor-teste", "editor-acoes", "editor-acao", "editor-faixa", "editor-quem"].map(n => `${TPL}/${n}.hbs`),
      scrollable: [".ov-corpo"]
    }
  };

  constructor(doc, opcoes = {}) {
    super({ ...opcoes, id: `${ID}-editor-${doc.documentName}-${doc.id}` });
    this.doc = doc;
    this.dados = { ...padrao(doc), ...clone(cfgDe(doc) ?? {}) };
    // como estava ao abrir: ao salvar, só o que mudou aqui na janela é gravado
    this.base = clone(this.dados);
    this.tile = ehTile(doc);
    this.aba = this.tile ? "aparencia" : "acoes";
    this.momento = momentosDe(doc, this.dados)[0].id;
    this.abertas = new Set();
    this.previa = this.dados.estado ?? 0;
  }

  get title() { return t("Editor.Titulo", { nome: this.dados.nome || nomeObjeto(this.doc) }); }
  get cena() { return this.doc.parent; }

  async _prepareContext(options) {
    const d = this.dados;
    const ctx = {
      L: textos(), tile: this.tile, nome: d.nome ?? "", nomePadrao: nomeObjeto(this.doc), resumo: this._resumo(),
      abas: this._abas().map(([id, nome], i) => ({ id, nome, n: i + 1, on: this.aba === id })),
      aba: { [this.aba]: true }, lado: this._ctxLado()
    };
    if (this.aba === "aparencia") ctx.ap = this._ctxAparencia();
    else if (this.aba === "teste") ctx.te = this._ctxTeste();
    else if (this.aba === "uso") { ctx.uso = this._ctxUso(); ctx.quem = this._ctxQuem(); }
    else if (this.aba === "acoes") {
      ctx.ac = this._ctxAcoes();
      if (ctx.ac.quem) ctx.quem = this._ctxQuem();
    }
    return ctx;
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

  _ctxLado() {
    const d = this.dados;
    if (!this.tile) {
      const porta = this.doc.door > 0;
      return { icone: porta ? "fa-door-closed" : "fa-grip-lines-vertical", tipo: t(porta ? "Tipo.Porta" : "Tipo.Parede"), dica: t(porta ? "Editor.PortaDica" : "Editor.ParedeDica") };
    }
    const atual = d.estados[this.previa] ?? d.estados[0];
    return {
      img: atual?.img || this.doc.texture?.src || "", estilo: this._estiloPrevia(), chip: atual?.nome ?? "",
      podeRemover: d.estados.length > 2,
      estados: d.estados.map((e, i) => ({ i, n: i + 1, nome: e.nome, img: e.img, atual: i === this.previa, inicial: i === 0,
        arquivo: e.img ? decodificar(e.img.split("/").pop()) : t("Editor.SemImagem") })),
      mesmaImagem: new Set(d.estados.map(e => e.img)).size === 1
    };
  }

  _ctxAparencia() {
    const d = this.dados;
    const p = d.prof ?? profPadrao("plano");
    const v = d.visao ?? { x: 0, y: 0, espelho: false };
    const vpreset = Object.entries(VISOES).find(([, a]) => a.x === (Number(v.x) || 0) && a.y === (Number(v.y) || 0))?.[0];
    return {
      visoes: Object.keys(VISOES).map(id => ({ id, on: vpreset === id, nome: t(`Visao.${id}`) })),
      eixos: [["x", "Visao.X"], ["y", "Visao.Y"]].map(([eixo, nome]) => ({ eixo, nome: t(nome), min: -VISAO_MAX, max: VISAO_MAX, valor: Number(v[eixo]) || 0 })),
      espelho: chave(v.espelho, "espelho", t("Visao.Espelhar"), t("Visao.EspelharDica")),
      profs: Object.keys(PROFS).map(id => ({ id, on: p.preset === id, nome: t(`Prof.${id}`) })),
      faixas: [["sombra", 100, ""], ["altura", 30, ""], ["incl", 40, "°"]].map(([campo, max, sufixo]) => ({ campo, max, sufixo, nome: t(`Prof.${campo}`), valor: Number(p[campo]) || 0 })),
      parallax: chave(p.parallax, "parallax", t("Prof.Parallax"), t("Prof.ParallaxDica")),
      camaleao: chave(d.camaleao, "camaleao", t("Camaleao.Ligar"), t("Camaleao.LigarDica")),
      ligado: !!d.camaleao,
      revelar: chave(d.revelarAoUsar, "revelarAoUsar", t("Camaleao.Revelar"), t("Camaleao.RevelarDica")),
      revelado: !!d.revelado,
      verCamo: !!this.verCamo, verIcone: this.verCamo ? "fa-eye" : "fa-user", verTexto: t(this.verCamo ? "Camaleao.VerParar" : "Camaleao.Ver"),
      anims: ANIMS.map(id => ({ id, on: d.anim === id, nome: t(`Anim.${id}`) })),
      som: d.som
    };
  }

  _ctxUso() {
    const d = this.dados;
    return {
      interacoes: INTERACOES.map(id => ({ id, on: d.interacao === id, nome: t(`Uso.${id}.Nome`), desc: t(`Uso.${id}.Desc`) })),
      distancia: d.interacao === "clicar" || d.interacao === "perto"
        ? passo("distancia", d.distancia > 0 ? t("Valor.Casas", { n: d.distancia }) : t("Valor.Qualquer"), t("Uso.Distancia"), t(d.interacao === "perto" ? "Uso.DistanciaPerto" : "Uso.DistanciaClicar"))
        : null,
      voltar: chave(d.voltar > 0, "voltar", t("Regras.Voltar"), t("Regras.VoltarDica")),
      tempo: d.voltar > 0 ? passo("voltar", t("Valor.Segundos", { n: d.voltar }), t("Regras.VoltarTempo"), t("Regras.VoltarTempoDica")) : null,
      mao: chave(d.mao !== false, "mao", t("Uso.Mao"), t("Uso.MaoDica")),
      brilho: chave(d.brilho !== false, "brilho", t("Uso.Brilho"), t("Uso.BrilhoDica"))
    };
  }

  _ctxQuem() {
    const d = this.dados;
    return { opcoes: QUEM.map(id => ({ id, on: d.quem === id, nome: t(`Quem.${id}`) })), ator: d.quem === "ator", valor: d.ator, temAtor: !!d.ator, nomeAtor: d.ator ? nomeDoc(d.ator) : "" };
  }

  _ctxTeste() {
    const tt = testeDe(this.dados);
    const modos = ["nenhum", "usar", "consertar", "desarmar"].map(id => ({ id, on: tt.modo === id, nome: t(`Teste.Modo.${id}`), desc: t(`Teste.Modo.${id}Desc`) }));
    if (tt.modo === "nenhum") return { modos, nenhum: true };
    const grupos = opcoesDeTeste();
    const usaFormula = !grupos.length || tt.qual === "formula";
    const como = tt.como ?? "rolagem";
    const dif = dificuldade(tt.cd);
    return {
      modos, nenhum: false,
      desarmar: tt.modo === "desarmar", desarmado: !!this.dados.desarmado,
      falhaDispara: chave(tt.falhaDispara !== false, "teste.falhaDispara", t("Teste.FalhaDispara"), t("Teste.FalhaDisparaDica")),
      tituloComo: t(tt.modo === "consertar" ? "Teste.ComoConsertar" : tt.modo === "desarmar" ? "Teste.ComoDesarmar" : "Teste.ComoPassar"),
      comos: pilulas([["rolagem", "Teste.Como.rolagem"], ["minijogo", "Teste.Como.minijogo"], ["ambos", "Teste.Como.ambos"]], como),
      comJogo: como !== "rolagem",
      jogos: ["aneis", "runa"].map(id => ({ id, on: tt.minijogo === id, nome: t(`Mini.Jogo.${id}`), desc: t(`Mini.Desc.${id}`) })),
      tempo: passo("tempo", Number(tt.tempo) > 0 ? t("Valor.Segundos", { n: tt.tempo }) : t("Valor.SemLimite"), t("Mini.Tempo"), t("Mini.TempoDica"), "data-teste"),
      tituloQual: t(como === "minijogo" ? "Mini.Dificuldade" : "Teste.Qual"),
      select: como !== "minijogo" && grupos.length > 0,
      grupos: grupos.map(g => ({ nome: g.nome, itens: g.itens.map(i => ({ valor: i.valor, nome: i.nome, sel: tt.qual === i.valor })) })),
      formulaSel: tt.qual === "formula",
      campoFormula: como !== "minijogo" && usaFormula, formula: tt.formula,
      cd: passo("cd", `CD ${Number(tt.cd) || 10}`, t("Teste.CD"), t(como === "rolagem" ? "Teste.CDDica" : "Mini.CDDica", { aneis: dif.aneis, pontos: dif.pontos + 1 }), "data-teste"),
      mostrarCD: como !== "minijogo" ? chave(tt.mostrarCD, "teste.mostrarCD", t("Teste.MostrarCD"), t("Teste.MostrarCDDica")) : null,
      comRolagem: como !== "minijogo",
      quem: pilulas([["jogador", "Teste.QuemJogador"], ["mestre", "Teste.QuemMestre"]], tt.quemRola),
      dicaQuem: t(tt.quemRola === "mestre" ? "Teste.QuemMestreDica" : "Teste.QuemJogadorDica"),
      tentativas: passo("tentativas", Number(tt.tentativas) > 0 ? t("Valor.Vezes", { n: tt.tentativas }) : t("Valor.SemLimite"), t("Teste.Tentativas"), t("Teste.TentativasDica", { n: Number(tt.feitas) || 0 }), "data-teste"),
      feitas: Number(tt.feitas) > 0,
      msgFalha: tt.msgFalha,
      msgPadrao: t(tt.modo === "consertar" ? "Teste.FalhouConsertar" : "Teste.Falhou", { objeto: this.dados.nome || nomeObjeto(this.doc) }),
      consertar: tt.modo === "consertar",
      depois: pilulas([["acoes", "Teste.DepoisAcoes"], ["nada", "Teste.DepoisNada"]], tt.depois)
    };
  }

  _ctxAcoes() {
    const d = this.dados;
    const momentos = momentosDe(this.doc, d);
    if (!momentos.some(m => m.id === this.momento)) this.momento = momentos[0].id;
    const lista = d.acoes?.[this.momento] ?? [];
    const temNav = !!navegador();
    const ac = {
      momentos: momentos.map(m => ({ id: m.id, nome: m.nome, on: this.momento === m.id, n: d.acoes?.[m.id]?.length ?? 0 })),
      lista: lista.map((a, i) => this._ctxAcao(a, i)),
      novas: Object.keys(ACOES).map(k => {
        const bloqueada = k === "mover" && !temNav;
        return { id: k, bloqueada, icone: ICONES[k], nome: t(`Acao.${k}`), desc: t(bloqueada ? "Acoes.PrecisaNavegador" : `AcaoDesc.${k}`) };
      }),
      mais: !!this.mais, maisIcone: this.mais ? "fa-chevron-up" : "fa-chevron-down"
    };
    if (!this.mais) return ac;
    return Object.assign(ac, {
      quem: !this.tile,
      usos: passo("usos", d.usos > 0 ? t("Valor.Vezes", { n: d.usos }) : t("Valor.SemLimite"), t("Regras.Usos"), t("Regras.UsosDica", { n: d.usados ?? 0 })),
      usados: !!d.usados,
      confirmar: chave(d.confirmar, "confirmar", t("Regras.Confirmar"), t("Regras.ConfirmarDica")),
      trancado: this.tile ? chave(d.trancado, "trancado", t("Regras.Trancado"), t(temFechadura(this.doc) ? "Gazua.TrancadoDica" : "Regras.TrancadoDica")) : null,
      gazua: this.tile ? this._ctxGazua() : null
    });
  }

  // Fechadura da Gazua da Mesa
  _ctxGazua() {
    if (!gazua()) return { instalada: false };
    const tem = temFechadura(this.doc);
    return {
      instalada: true, tem,
      estado: tem ? t(fechaduraTrancada(this.doc) ? "Gazua.EstaTrancada" : "Gazua.EstaAberta") : t("Gazua.SemFechadura"),
      icone: tem ? "fa-lock" : "fa-plus", botao: t(tem ? "Gazua.Configurar" : "Gazua.Colocar"),
      usar: tem ? chave(this.dados.usarAoDestrancar, "usarAoDestrancar", t("Gazua.UsarAoDestrancar"), t("Gazua.UsarAoDestrancarDica")) : null
    };
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

  _ctxAcao(a, i) {
    const aberta = this.abertas.has(a.id);
    const ctx = { i, n: i + 1, primeira: i === 0, icone: ICONES[a.tipo], nome: t(`Acao.${a.tipo}`), resumo: resumoAcao(a), aberta, rotuloEditar: t(aberta ? "Editor.Fechar" : "Editor.Editar") };
    if (!aberta) return ctx;
    return Object.assign(ctx, {
      tempo: a.tipo === "esperar" ? null : { valor: Number(a.atraso) || 0 },
      campos: Object.entries(ACOES[a.tipo]?.campos ?? {}).map(([campo, [tipo, , escolhas]]) => this._ctxCampo(a, campo, tipo, escolhas)),
      dica: t(`AcaoDica.${a.tipo}`)
    });
  }

  _ctxCampo(a, campo, tipo, escolhas) {
    const v = a[campo];
    const c = { campo, rotulo: t(`Campo.${campo}`) };
    const select = (opcoes, rerender = true) => Object.assign(c, { select: true, rerender, opcoes: opcoes.map(([val, r]) => ({ v: val, r, sel: val === v })) });
    const ordenado = col => col.contents.slice().sort((x, y) => comparar(x.name, y.name));
    switch (tipo) {
      case "cena": return select([["", "—"], ...ordenado(game.scenes).map(s => [s.id, s.name])]);
      case "regiaoDestino":
      case "regiaoAqui": {
        const cena = tipo === "regiaoAqui" ? this.cena : game.scenes.get(a.destino);
        const vazio = t(tipo === "regiaoAqui" ? "Resumo.EsteObjeto" : "Campo.PontoChegada");
        return select([["", vazio], ...(cena?.regions?.contents ?? []).map(r => [r.uuid, r.name])], false);
      }
      case "nivel": {
        const niveis = niveisDe(this.cena);
        return niveis.length ? select([["", t("Campo.MesmoNivel")], ...niveis.map(l => [l.id, l.name || t("Resumo.Nivel")])]) : Object.assign(c, { semNiveis: true });
      }
      case "regiaoChegada": return select([["", t("Campo.MesmoLugar")], ...(this.cena?.regions?.contents ?? []).map(r => [r.uuid, r.name])]);
      case "opcao": return select(escolhas.map(x => [x, t(`Opc.${x}`)]));
      case "para": return select(PARA.map(x => [x, t(`Para.${x}`)]));
      case "audio":
      case "imagem": return Object.assign(c, { arquivo: tipo === "audio" ? "audio" : "image", audio: tipo === "audio", valor: v });
      case "faixa": return Object.assign(c, { faixa: true, valor: Number(v) || 0, pct: Math.round((Number(v) || 0) * 100) });
      case "numero": return Object.assign(c, { numero: true, valor: Number(v) || 0 });
      case "texto": return Object.assign(c, { texto: true, valor: v });
      case "textoLongo": return Object.assign(c, { textoLongo: true, valor: v });
      case "playlist": return select([["", "—"], ...ordenado(game.playlists).map(p => [p.id, p.name])]);
      case "diario": {
        const ops = [];
        for (const j of ordenado(game.journal)) {
          ops.push([j.uuid, j.name]);
          for (const p of j.pages?.contents ?? []) ops.push([p.uuid, `↳ ${p.name}`]);
        }
        return select([["", "—"], ...ops]);
      }
      case "portas": return Object.assign(c, { portas: true, contagem: t("Resumo.PortasN", { n: v.length }), limpar: v.length > 0 });
      case "selecao": return Object.assign(c, { selecao: true, tooltip: v.map(nomeDoc).join(", "), contagem: t("Resumo.ObjetosN", { n: v.length }), limpar: v.length > 0 });
      case "objetos": {
        const outros = (this.cena?.tiles ?? []).filter(d => ehObjeto(d) && d.id !== this.doc.id);
        return Object.assign(c, { ehObjetos: true, objetos: outros.map(d => ({ uuid: d.uuid, nome: nomeObjeto(d), marcado: v.includes(d.uuid) })) });
      }
    }
    return c;
  }


  _onFirstRender() {
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
    const FP = foundry.applications.apps.FilePicker.implementation;
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
      case "ouvir": if (a?.arquivo) foundry.audio.AudioHelper.play({ src: a.arquivo, volume: volumeDe(a.volume), loop: false, channel: "environment" }, false); return;
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
    const editado = clone(this.dados);
    editado.nome = (editado.nome ?? "").trim();
    editado.distancia = Math.max(0, Number(editado.distancia) || 0);
    editado.usos = Math.max(0, Math.floor(Number(editado.usos) || 0));
    // O jogo pode ter mudado o objeto com a janela aberta (estado, usos gastos, tentativas, desarmado...).
    // Por cima do que está no objeto AGORA, entra só o que foi mudado na janela.
    const d = mesclarEdicao(cfgDe(this.doc), this.base, editado);
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

export function abrirEditor(doc) {
  if (!doc?.id) return ui.notifications.warn(t("Aviso.SalvePrimeiro"));
  const existente = foundry.applications.instances?.get?.(`${ID}-editor-${doc.documentName}-${doc.id}`);
  if (existente) return existente.render({ force: true });
  new EditorObjeto(doc).render({ force: true });
}
