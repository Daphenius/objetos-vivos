import { comparar } from "./nucleo.js";

// Pacotes do Dungeondraft (.dungeondraft_pack): são pacotes do motor Godot (formato "GDPC").
// Lemos só o índice; cada imagem é recortada do arquivo quando precisa, sem carregar o pacote inteiro.
export const DD_PX_POR_CASA = 256;
export const EXT_DD = /\.(png|webp|jpe?g)$/i;
// Pacotes abertos nesta sessão (continuam abertos mesmo se a janela da biblioteca fechar)
export const pacotes = new Map();

export async function lerPacoteDD(blob, nomeArquivo = "") {
  let buf = new Uint8Array(0), ini = 0, pos = 0;
  const garantir = async n => {
    if (pos + n <= ini + buf.length) return;
    const fim = Math.min(blob.size, Math.max(pos + n, ini + buf.length + (1 << 20)));
    buf = new Uint8Array(await blob.slice(pos, fim).arrayBuffer());
    ini = pos;
    if (pos + n > ini + buf.length) throw new Error("pacote cortado");
  };
  const u32 = async () => { await garantir(4); const v = new DataView(buf.buffer, buf.byteOffset + pos - ini, 4).getUint32(0, true); pos += 4; return v; };
  const u64 = async () => { const lo = await u32(), hi = await u32(); return hi * 4294967296 + lo; };
  const bytes = async n => { await garantir(n); const b = buf.slice(pos - ini, pos - ini + n); pos += n; return b; };

  if (await u32() !== 0x43504447) throw new Error("não é um pacote do Dungeondraft");
  const versao = await u32();
  await u32(); await u32(); await u32();
  let base = 0;
  if (versao >= 2) {
    const flags = await u32();
    base = await u64();
    if (flags & 1) throw new Error("pacote criptografado");
  }
  pos += 16 * 4;
  const total = await u32();
  if (total > 200000) throw new Error("índice inválido");
  const texto = new TextDecoder();
  const arquivos = [];
  for (let i = 0; i < total; i++) {
    const n = await u32();
    const caminho = texto.decode(await bytes(n)).replace(/\0+$/, "").replace(/^res:\/\//, "");
    const ofs = await u64(), tam = await u64();
    pos += 16; // md5
    if (versao >= 2) pos += 4; // flags do arquivo
    arquivos.push({ caminho, ofs: ofs + base, tam });
  }
  const cortar = a => blob.slice(a.ofs, a.ofs + a.tam);

  // Nome e autor: o pacote guarda um pack.json
  let nome = nomeArquivo.replace(/\.dungeondraft_pack$/i, ""), autor = "";
  const info = arquivos.find(a => /(^|\/)pack\.json$/i.test(a.caminho)) ?? arquivos.find(a => /^packs\/[^/]+\.json$/i.test(a.caminho));
  if (info) {
    try { const j = JSON.parse(await cortar(info).text()); nome = j.name || nome; autor = j.author || ""; } catch {}
  }
  // Só as imagens, com o caminho a partir de "textures/" (objects/, terrain/, walls/...)
  const imagens = arquivos.filter(a => EXT_DD.test(a.caminho) && a.tam > 0 && a.ofs + a.tam <= blob.size).map(a => {
    const i = a.caminho.indexOf("textures/");
    return { ...a, rel: i >= 0 ? a.caminho.slice(i + 9) : a.caminho };
  }).sort((a, b) => comparar(a.rel, b.rel));
  if (!imagens.length) throw new Error("nenhuma imagem no pacote");
  const slug = (nome || "pacote").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pacote";
  // Categorias: "objects", "objects/furniture"... com quantas imagens cada uma tem (contando as de dentro)
  const contagem = new Map();
  for (const a of imagens) {
    const partes = a.rel.split("/").slice(0, -1);
    for (let i = 1; i <= partes.length; i++) { const k = partes.slice(0, i).join("/"); contagem.set(k, (contagem.get(k) ?? 0) + 1); }
  }
  return { id: slug, nome, autor, slug, blob, imagens, contagem, cortar, urls: new Map(), enviados: new Map() };
}

export const tipoImagem = c => /\.webp$/i.test(c) ? "image/webp" : /\.jpe?g$/i.test(c) ? "image/jpeg" : "image/png";
export function urlDaMiniatura(pac, a) {
  if (!pac.urls.has(a.rel)) pac.urls.set(a.rel, URL.createObjectURL(new Blob([pac.cortar(a)], { type: tipoImagem(a.rel) })));
  return pac.urls.get(a.rel);
}
export function fecharPacote(id) {
  const pac = pacotes.get(id);
  for (const u of pac?.urls?.values?.() ?? []) URL.revokeObjectURL(u);
  pacotes.delete(id);
}
