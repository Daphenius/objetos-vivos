import { maisPerto, usaveis } from "./gatilhos.js";
import { ID, cfgDe, fechaduraTrancada } from "./nucleo.js";

// Animação do objeto ao mudar de estado (em todos os navegadores)
export function animar(tile, tipo) {
  if (!tile || tipo === "nenhuma" || !tipo) return;
  const dur = tipo === "virar" ? 520 : 450;
  const inicio = performance.now();
  const bases = new WeakMap();
  const passo = agora => {
    const mesh = tile.mesh;
    if (!mesh || mesh.destroyed) return;
    if (!bases.has(mesh)) bases.set(mesh, { rot: mesh.rotation, sx: mesh.scale.x, sy: mesh.scale.y, y: mesh.position.y, a: mesh.alpha });
    const b = bases.get(mesh);
    const p = Math.min(1, (agora - inicio) / dur);
    const k = Math.sin(p * Math.PI);
    if (tipo === "girar") mesh.rotation = b.rot + k * 0.35;
    else if (tipo === "deslizar") mesh.position.y = b.y + k * Math.max(8, tile.document.height * 0.12);
    else if (tipo === "virar") mesh.scale.x = b.sx * Math.abs(Math.cos(p * Math.PI));
    else if (tipo === "pulsar") { mesh.scale.x = b.sx * (1 + 0.12 * k); mesh.scale.y = b.sy * (1 + 0.12 * k); }
    else if (tipo === "sumir") mesh.alpha = b.a * (1 - 0.8 * k);
    if (p < 1) return requestAnimationFrame(passo);
    Object.assign(mesh, { rotation: b.rot, alpha: b.a });
    mesh.scale.set(b.sx, b.sy);
    mesh.position.y = b.y;
    tile.renderFlags?.set?.({ refreshTransform: true, refreshMesh: true });
  };
  requestAnimationFrame(passo);
}

// Profundidade: sombra desenhada por um filtro na imagem do tile, mais altura, inclinação
// e um leve movimento (parallax) quando a câmera anda. Só mexe no desenho, nunca no documento.
export const SOMBRA_FRAG = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputSize;
uniform vec2 uDesloc;
uniform float uForca;
uniform float uBorrao;
void main(void) {
  vec4 cor = texture2D(uSampler, vTextureCoord);
  vec2 px = inputSize.zw;
  float a = 0.0;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      a += texture2D(uSampler, vTextureCoord - uDesloc * px + vec2(float(x), float(y)) * uBorrao * px).a;
    }
  }
  a = a / 25.0 * uForca;
  gl_FragColor = cor + vec4(0.0, 0.0, 0.0, a) * (1.0 - cor.a);
}`;
export let ClasseSombra = null;
export function novaSombra() {
  if (!globalThis.PIXI?.Filter) return null;
  ClasseSombra ??= class extends PIXI.Filter {
    constructor() { super(undefined, SOMBRA_FRAG, { uDesloc: new Float32Array([0, 0]), uForca: 0.5, uBorrao: 1 }); }
  };
  return new ClasseSombra();
}

// Camaleão: para os jogadores o objeto simplesmente NÃO é desenhado. Ele continua no mapa e
// funcionando (pisar, clicar, chegar perto), mas fica idêntico ao que está atrás dele, sem nenhuma
// diferença de cor, nitidez ou luz. O mestre vê o objeto meio transparente.
export function camuflado(tile) {
  const c = tile?._ovPreviaCamo ?? cfgDe(tile?.document);
  if (!c?.camaleao || c.revelado) return false;
  return !game.user.isGM || !!tile._ovVerCamo;
}
export const camoMestre = tile => { const c = tile?._ovPreviaCamo ?? cfgDe(tile?.document); return game.user.isGM && !!c?.camaleao && !c.revelado && !tile._ovVerCamo; };

export function aplicarCamaleao(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed) return;
  if (camuflado(tile)) {
    // Nada desenhado: nem a imagem, nem sombra, nem contorno
    mesh.renderable = false;
    mesh.alpha = 0;
    tile._ovCamo = true;
    tile._ovMeio = false;
    return;
  }
  if (tile._ovCamo) {
    tile._ovCamo = false;
    mesh.renderable = true;
    tile.renderFlags?.set?.({ refreshState: true });
  }
  if (camoMestre(tile)) { mesh.alpha = Math.min(mesh.alpha ?? 1, 0.5); tile._ovMeio = true; }
  else if (tile._ovMeio) { tile._ovMeio = false; tile.renderFlags?.set?.({ refreshState: true }); }
}

// Visão (3D): a imagem vira uma "carta" que pode inclinar para frente/trás (eixo X) e virar
// para os lados (eixo Y), com perspectiva. O giro normal (eixo Z) continua sendo a rotação do tile.
// A carta é desenhada numa imagem do tamanho do tile; o documento guarda só os ângulos.
export const VISAO_SEG = 14;
export const VISAO_MAX = 80;
export const VISOES = { cima: { x: 0, y: 0 }, frente: { x: 55, y: 0 }, esquerda: { x: 0, y: -55 }, direita: { x: 0, y: 55 } };
export const temVisao = v => !!v && (Math.abs(Number(v.x) || 0) >= 1 || Math.abs(Number(v.y) || 0) >= 1 || !!v.espelho);
export function visaoDe(tile) {
  if (camuflado(tile)) return null;
  const v = tile?._ovPrevia3d ?? cfgDe(tile?.document)?.visao;
  return temVisao(v) ? v : null;
}

// Pontos da carta girada, já encaixados dentro de W×H (sem sair do tamanho do tile)
export function projetarCarta(W, H, v, seg = VISAO_SEG) {
  const ax = Math.max(-VISAO_MAX, Math.min(VISAO_MAX, Number(v.x) || 0)) * Math.PI / 180;
  const ay = Math.max(-VISAO_MAX, Math.min(VISAO_MAX, Number(v.y) || 0)) * Math.PI / 180;
  const d = 2.2 * Math.max(W, H);
  const pts = [];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < seg * seg; i++) {
    const u = (i % seg) / (seg - 1), w = Math.floor(i / seg) / (seg - 1);
    const x = (u - 0.5) * W * (v.espelho ? -1 : 1), y = (w - 0.5) * H;
    const y1r = y * Math.cos(ax), z1 = y * Math.sin(ax);
    const x2 = x * Math.cos(ay) + z1 * Math.sin(ay), z2 = -x * Math.sin(ay) + z1 * Math.cos(ay);
    const k = d / (d - z2);
    const px = x2 * k, py = y1r * k;
    pts.push(px, py);
    x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  const f = Math.min(1, W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < pts.length; i += 2) { pts[i] = W / 2 + (pts[i] - cx) * f; pts[i + 1] = H / 2 + (pts[i + 1] - cy) * f; }
  return pts;
}

// Resolução da imagem da carta: nítida em objetos pequenos, mas nunca mais de 2048 px no maior lado
// (tile grande com resolução 2 pesava na placa de vídeo)
export const resolucaoVisao = (W, H) => Math.min(2, 2048 / Math.max(1, W, H));
// Tile de vídeo: a imagem muda a cada quadro, então a carta precisa ser redesenhada junto
export const ehTexturaVideo = tex => {
  const fonte = tex?.baseTexture?.resource?.source;
  return typeof HTMLVideoElement !== "undefined" && fonte instanceof HTMLVideoElement;
};
function montarCarta(textura, W, H, v) {
  const plano = new PIXI.SimplePlane(textura, VISAO_SEG, VISAO_SEG);
  const buf = plano.geometry.getBuffer("aVertexPosition");
  const pts = projetarCarta(W, H, v);
  for (let i = 0; i < pts.length; i++) buf.data[i] = pts[i];
  buf.update();
  return plano;
}
export function desenharVisao(textura, W, H, v) {
  W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
  const plano = montarCarta(textura, W, H, v);
  const rt = PIXI.RenderTexture.create({ width: W, height: H, resolution: resolucaoVisao(W, H) });
  canvas.app.renderer.render(plano, { renderTexture: rt, clear: true });
  plano.destroy({ children: true, texture: false, baseTexture: false });
  return rt;
}
// Solta tudo que a visão 3D de um tile estava usando (imagem, carta do vídeo e o redesenho por quadro)
export function liberarVisao(tile) {
  const atual = tile?._ov3d;
  if (!atual) return;
  tile._ov3d = null;
  if (atual.quadro) canvas.app?.ticker?.remove(atual.quadro);
  atual.plano?.destroy?.({ children: true, texture: false, baseTexture: false });
  atual.rt?.destroy?.(true);
}
export function aplicarVisao(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed || !globalThis.PIXI?.SimplePlane) return;
  const v = visaoDe(tile);
  const atual = tile._ov3d;
  if (!v) {
    if (atual) {
      const rt = atual.rt;
      liberarVisao(tile);
      if (mesh.texture === rt && tile.texture) mesh.texture = tile.texture;
      tile.renderFlags?.set?.({ refreshMesh: true, refreshSize: true });
    }
    return;
  }
  const doc = tile.document;
  const tex = tile.texture;
  if (!tex) return;
  const chave = JSON.stringify([Number(v.x) || 0, Number(v.y) || 0, !!v.espelho, doc.width, doc.height]);
  if (!atual || atual.tex !== tex || atual.chave !== chave) {
    try {
      const W = Math.max(1, Math.round(doc.width)), H = Math.max(1, Math.round(doc.height));
      const anterior = tile._ov3d;
      let novo;
      if (ehTexturaVideo(tex)) {
        // vídeo: a carta fica montada e é redesenhada a cada quadro (senão o vídeo congela)
        const plano = montarCarta(tex, W, H, v);
        const rt = PIXI.RenderTexture.create({ width: W, height: H, resolution: resolucaoVisao(W, H) });
        const quadro = () => { if (!rt.destroyed && !plano.destroyed) canvas.app.renderer.render(plano, { renderTexture: rt, clear: true }); };
        quadro();
        canvas.app.ticker.add(quadro);
        novo = { rt, tex, chave, plano, quadro };
      } else novo = { rt: desenharVisao(tex, W, H, v), tex, chave };
      if (anterior) { tile._ov3d = anterior; liberarVisao(tile); }
      tile._ov3d = novo;
    } catch (err) { console.warn(`${ID} | visão 3D falhou`, err); return; }
  }
  mesh.texture = tile._ov3d.rt;
  mesh.width = doc.width;
  mesh.height = doc.height;
}

// O que vale para este tile agora (a prévia do editor aberto tem prioridade)
export function profDe(tile) {
  if (camuflado(tile)) return null;
  const p = tile?._ovPrevia ?? cfgDe(tile?.document)?.prof;
  return p && (p.sombra > 0 || p.altura > 0 || p.incl > 0) ? p : null;
}

export function aplicarProfundidade(tile) {
  const mesh = tile?.mesh;
  if (!mesh || mesh.destroyed) return;
  // Camuflado: sem sombra, sem altura e sem mexer no tamanho (que o camaleão acabou de acertar)
  if (camuflado(tile)) {
    const m0 = tile._ovMarca, b0 = tile._ovBase;
    if (m0 && b0 && mesh.position.x === m0.x && mesh.position.y === m0.y) mesh.position.set(b0.x, b0.y);
    const resto = (mesh.filters ?? []).filter(f => f !== tile._ovSombra);
    mesh.filters = resto.length ? resto : null;
    tile._ovBase = null; tile._ovMarca = null;
    return;
  }
  const p = profDe(tile);
  const m = tile._ovMarca;
  // Descobre a posição "de verdade" do Foundry: se ele redesenhou, o valor mudou desde a nossa última marca
  const base = tile._ovBase ?? { y: mesh.position.y, x: mesh.position.x, sy: mesh.scale.y };
  if (!m || mesh.position.y !== m.y) base.y = mesh.position.y;
  if (!m || mesh.position.x !== m.x) base.x = mesh.position.x;
  if (!m || mesh.scale.y !== m.sy) base.sy = mesh.scale.y;
  tile._ovBase = base;

  const filtros = (mesh.filters ?? []).filter(f => f !== tile._ovSombra);
  if (!p) {
    mesh.position.set(base.x, base.y);
    mesh.scale.y = base.sy;
    mesh.filters = filtros.length ? filtros : null;
    tile._ovMarca = { x: base.x, y: base.y, sy: base.sy };
    return;
  }
  const gs = canvas.dimensions?.size ?? 100;
  const k = gs / 100;
  const zoom = canvas.stage?.scale?.x ?? 1;
  const res = canvas.app?.renderer?.resolution ?? 1;
  const alt = (Number(p.altura) || 0) * k;
  // Parallax: quanto mais alto, mais o objeto "acompanha" a câmera
  let px = 0, py = 0;
  if (p.parallax && alt > 0 && canvas.stage?.pivot) {
    const doc = tile.document;
    px = (doc.x + doc.width / 2 - canvas.stage.pivot.x) * alt * 0.0012;
    py = (doc.y + doc.height / 2 - canvas.stage.pivot.y) * alt * 0.0012;
  }
  const incl = Math.min(45, Math.max(0, Number(p.incl) || 0));
  const fatorY = Math.cos(incl * Math.PI / 180);
  const x = base.x + px, y = base.y - alt + py + (1 - fatorY) * (tile.document.height / 2);
  mesh.position.set(x, y);
  mesh.scale.y = base.sy * fatorY;

  const sombra = Math.min(100, Math.max(0, Number(p.sombra) || 0));
  if (sombra > 0) {
    tile._ovSombra ??= novaSombra();
    const f = tile._ovSombra;
    if (f) {
      const dx = (alt * 0.5 + 3 * k) * zoom * res, dy = (alt + 5 * k) * zoom * res;
      f.uniforms.uDesloc[0] = dx;
      f.uniforms.uDesloc[1] = dy;
      f.uniforms.uForca = sombra / 100 * 0.85;
      f.uniforms.uBorrao = (1 + sombra / 40) * zoom * res;
      f.padding = Math.ceil((Math.abs(dx) + Math.abs(dy)) / res + f.uniforms.uBorrao * 3);
      filtros.push(f);
    }
  }
  mesh.filters = filtros.length ? filtros : null;
  tile._ovMarca = { x, y, sy: mesh.scale.y };
}
export function atualizarProfundidades() {
  for (const tile of canvas.tiles?.placeables ?? []) if (tile._ovSombra || profDe(tile)) aplicarProfundidade(tile);
}

export let brilhos = null, pulsoBrilho = null;
export function atualizarBrilho() {
  if (!canvas.ready) return;
  if (!brilhos || brilhos.destroyed) {
    if (!globalThis.PIXI) return;
    brilhos = new PIXI.Graphics();
    brilhos.eventMode = "none";
    (canvas.controls ?? canvas.interface)?.addChild(brilhos);
    // um só pulso por vez: tira o anterior antes de pôr outro (senão acumulam a cada mapa)
    if (pulsoBrilho) canvas.app.ticker.remove(pulsoBrilho);
    pulsoBrilho = () => { if (brilhos && !brilhos.destroyed) brilhos.alpha = 0.55 + 0.35 * Math.sin(performance.now() / 260); };
    canvas.app.ticker.add(pulsoBrilho);
  }
  brilhos.clear();
  if (game.user.isGM) return;
  for (const o of usaveis()) {
    const doc = o.document, c = cfgDe(doc);
    if (c.brilho === false || (c.trancado && !fechaduraTrancada(doc)) || camuflado(o)) continue;
    const alcance = c.distancia > 0 ? c.distancia : 1;
    if (maisPerto(doc).dist > alcance) continue;
    brilhos.lineStyle(4, 0xffc27a, 1).drawRoundedRect(doc.x - 4, doc.y - 4, doc.width + 8, doc.height + 8, 10);
  }
}
