import { definirTrancado } from "./estados.js";
import { CONTROLE } from "./gatilhos.js";
import { ID, abrirBiblioteca, abrirEditor, carregar, cfgDe, ehObjeto, ehTile, esc, estaTrancado, icone, t } from "./nucleo.js";
import { usarObjeto } from "./testes.js";

// Botão "Objetos Vivos" na barra de ferramentas da esquerda (só para o mestre)
export function botaoNaBarra(controles) {
  if (!game.user.isGM) return;
  const ferramentas = {
    select: { name: "select", order: 1, title: "OV.Controle.Editar", icon: "fa-solid fa-hand-pointer" },
    biblioteca: { name: "biblioteca", order: 2, title: "OV.Controle.Biblioteca", icon: "fa-solid fa-shapes", button: true, onChange: () => abrirBiblioteca() },
    imagem: { name: "imagem", order: 3, title: "OV.Controle.Imagem", icon: "fa-solid fa-image", button: true, onChange: async () => (await carregar.encaixe()).escolherImagem() }
  };
  const base = { name: CONTROLE, title: "OV.Controle.Titulo", icon: "fa-solid fa-cube", layer: "tiles", visible: true, activeTool: "select" };
  controles[CONTROLE] = {
    ...base, order: (controles.tiles?.order ?? 3) + 0.5, tools: ferramentas,
    onChange: (ev, ativo) => { if (ativo) abrirBiblioteca(); }
  };
}

// Seção "Objeto Vivo" na configuração de tiles e paredes
export function resumoSecao(doc) {
  const c = cfgDe(doc);
  if (!c) return t(ehTile(doc) ? "Secao.NaoETile" : "Secao.NaoEParede");
  const total = Object.values(c.acoes ?? {}).reduce((s, l) => s + (l?.length ?? 0), 0);
  return ehTile(doc)
    ? t("Secao.ResumoTile", { estado: c.estados?.[c.estado]?.nome ?? "?", n: total, uso: t(`Uso.${c.interacao}.Resumo`) })
    : t("Secao.ResumoParede", { n: total });
}

export function atualizarSecoes(doc) {
  for (const fs of document.querySelectorAll(`.ov-secao[data-uuid="${doc.uuid}"]`)) {
    fs.querySelector("p").textContent = resumoSecao(doc);
    fs.querySelector('[data-a="editar"]').innerHTML = `${icone("fa-wand-sparkles")} ${t(ehObjeto(doc) ? "Secao.Editar" : "Secao.Transformar")}`;
    fs.querySelector('[data-a="remover"]').hidden = !ehObjeto(doc);
  }
}

export function injetarSecao(app, html) {
  const doc = app.document;
  if (!game.user.isGM || !doc || !["Tile", "Wall"].includes(doc.documentName)) return;
  const raiz = html instanceof HTMLElement ? html : html?.[0];
  if (!raiz || raiz.querySelector(".ov-secao")) return;
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
export function botoesHud(hud, html) {
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
  // Cadeado: tranca/destranca na hora (no mapa interativo, é assim que uma cidade é liberada)
  if (ehObjeto(doc) && ehTile(doc)) {
    const trancado = estaTrancado(doc);
    botao(trancado ? "fa-lock-open" : "fa-lock", t(trancado ? "Hud.Destrancar" : "Hud.Trancar"), async () => {
      await definirTrancado(doc, !estaTrancado(doc), { cena: doc.parent, token: null, userId: game.user.id, fonte: doc, profundidade: 0 });
      hud.render?.();
    });
  }
}
