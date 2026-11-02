import { ID, esc, girar, t } from "./nucleo.js";

// ---------- Minijogos de conserto (abrem na tela de quem está consertando)
// A dificuldade acompanha a CD: mais anéis/pontos e passos mais finos quanto maior a CD.
export function dificuldade(cd) {
  const n = Math.max(1, Math.min(30, Number(cd) || 15));
  return {
    aneis: n <= 10 ? 2 : n <= 15 ? 3 : n <= 20 ? 4 : 5,
    passo: n <= 15 ? 45 : 30,
    pontos: Math.max(4, Math.min(8, 4 + Math.floor((n - 8) / 3)))
  };
}

// Monta um desafio: o estado inicial do minijogo (giro de cada anel, ou pontos e ordem da runa).
// Quando o teste é de um jogador, quem monta é o mestre, e é com ele que o mestre confere as jogadas.
export function gerarDesafio(jogo, cd) {
  const dif = dificuldade(cd);
  if (jogo === "runa") {
    const n = dif.pontos;
    const pontos = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.35;
      const r = 120 + Math.random() * 40;
      return { x: Math.round(200 + Math.cos(a) * r), y: Math.round(200 + Math.sin(a) * r) };
    });
    pontos.push({ x: Math.round(200 + (Math.random() - 0.5) * 40), y: Math.round(200 + (Math.random() - 0.5) * 40) });
    // a runa passa por todos os pontos, numa ordem embaralhada
    const ordem = pontos.map((_, i) => i);
    for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
    return { pontos, ordem };
  }
  const giros = Array.from({ length: dif.aneis }, () => dif.passo * (1 + Math.floor(Math.random() * (360 / dif.passo - 1))));
  return { giros };
}

// Quanto tempo o jogo pode durar (a runa só começa a contar depois de ser mostrada)
export function tempoDeMostrar(jogo, estado) {
  return jogo === "runa" ? 900 + (estado?.ordem?.length ?? 0) * 450 + 1200 : 0;
}

// O mestre refaz as jogadas em cima do desafio que ele mesmo montou e diz se o jogador conseguiu
export function conferirJogadas(jogo, cd, estado, jogadas) {
  if (!Array.isArray(jogadas) || jogadas.length > 600) return false;
  if (jogo === "runa") {
    const ordem = estado?.ordem ?? [], n = estado?.pontos?.length ?? 0;
    let feito = [], erros = 0;
    for (const i of jogadas) {
      if (!Number.isInteger(i) || i < 0 || i >= n || feito.includes(i)) continue;
      if (i === ordem[feito.length]) {
        feito.push(i);
        if (feito.length === ordem.length) return true;
      } else {
        erros++; feito = [];
        if (erros >= 3) return false;
      }
    }
    return false;
  }
  const { passo } = dificuldade(cd);
  const giros = [...(estado?.giros ?? [])];
  if (!giros.length) return false;
  for (const j of jogadas) {
    const [i, dir] = Array.isArray(j) ? j : [];
    if (!Number.isInteger(i) || i < 0 || i >= giros.length || (dir !== 1 && dir !== -1)) continue;
    giros[i] = ((giros[i] + dir * passo) % 360 + 360) % 360;
    if (giros.every(g => g === 0)) return true;
  }
  return false;
}

export class MinijogoConserto extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["ov-minijogo"],
    position: { width: 460, height: "auto" },
    window: { icon: "fa-solid fa-wand-magic-sparkles", resizable: false }
  };

  constructor({ jogo = "aneis", img = "", nome = "", cd = 15, tempo = 45, titulo = "Mini.Titulo", estado = null } = {}) {
    super({ id: `${ID}-minijogo-${foundry.utils.randomID(6)}` });
    Object.assign(this, { jogo, img, nome, titulo, cd, tempo: Math.max(0, Number(tempo) || 0), dif: dificuldade(cd) });
    // o desafio vem do mestre (teste de jogador) ou é montado aqui (mestre, macro, "Testar o minijogo")
    this.desafio = estado ?? gerarDesafio(jogo, cd);
    this.jogadas = []; // o que a pessoa fez, para o mestre conferir
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
    this.el = this.element.querySelector(".ov-mini-tela");
    this.ctx = this.el.getContext("2d");
    this.imagem = await new Promise(r => {
      if (!this.img || /\.(webm|mp4)$/i.test(this.img)) return r(null);
      const im = new Image();
      im.onload = () => r(im); im.onerror = () => r(null);
      im.src = this.img;
    });
    if (this.fim || !this.element) return; // fechou enquanto a imagem carregava
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
    const giros = this.desafio.giros ?? [];
    const n = giros.length || aneis;
    this.aneis = Array.from({ length: n }, (_, i) => {
      const r0 = miolo + (raioMax - miolo) * i / n, r1 = miolo + (raioMax - miolo) * (i + 1) / n;
      const giro = Number(giros[i]) || passo;
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
      this.jogadas.push([i, dir]);
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
    this.pontos = (this.desafio.pontos ?? []).map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 }));
    const ordem = [...(this.desafio.ordem ?? [])];
    this.ordem = ordem;
    this.feito = [];
    this.mostrarAte = performance.now() + tempoDeMostrar("runa", this.desafio);
    this.inicio = this.mostrarAte; // o tempo só começa a contar depois de ver a runa
    const st = this.element.querySelector(".ov-mini-status");
    if (st) st.textContent = t("Mini.Memorize");
    this.el.addEventListener("click", ev => {
      if (this.fim || performance.now() < this.mostrarAte) return;
      const r = this.el.getBoundingClientRect();
      const x = (ev.clientX - r.left) * 400 / r.width, y = (ev.clientY - r.top) * 400 / r.height;
      const i = this.pontos.findIndex(p => Math.hypot(p.x - x, p.y - y) < 22);
      if (i < 0 || this.feito.includes(i)) return;
      this.jogadas.push(i);
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
