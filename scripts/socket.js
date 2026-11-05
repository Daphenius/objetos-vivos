import { aplicarEfeito } from "./estados.js";
import { receberVolta } from "./mapa.js";
import { ID, SOCKET, cfgDe, ehTile, pausa, souMestreAtivo, t, testeDe } from "./nucleo.js";
import { aguardando, eventoParede, jogarDesafio, pedirUso, receberMinijogo, usarObjeto } from "./testes.js";

// ---------- Pedidos que chegam dos jogadores (no mestre ativo). Nada do que vem no pedido é aceito sem
// conferir: quem pediu é o remetente real do socket, o token tem que ser dele, e a rolagem é lida da
// mensagem no chat (autor = quem pediu, uma vez só).
export const mensagensUsadas = new Set();
export async function totalDaMensagem(id, remetente) {
  if (typeof id !== "string" || mensagensUsadas.has(id)) return null;
  let m = game.messages.get(id);
  for (let i = 0; !m && i < 6; i++) { await pausa(0.25); m = game.messages.get(id); }
  if (!m || m.author?.id !== remetente.id) return null;
  if (Math.abs(Date.now() - (Number(m.timestamp) || 0)) > 10 * 60 * 1000) return null;
  const total = m.rolls?.[0]?.total;
  if (!Number.isFinite(total)) return null;
  mensagensUsadas.add(id);
  return total;
}
export async function receberUso(doc, data, remetente) {
  const c = cfgDe(doc);
  if (!c || !ehTile(doc)) return;
  const pedido = `${doc.uuid}|${remetente.id}`;
  const pedidoPeloMestre = Date.now() - (aguardando.get(pedido) ?? 0) < 5 * 60 * 1000;
  aguardando.delete(pedido);
  // Objeto escondido, só do mestre ou armadilha camuflada: o jogador não usa pelo clique (só se o mestre pediu o teste)
  const armadilhaCamuflada = c.camaleao && !c.revelado && testeDe(c).modo === "desarmar" && !c.desarmado;
  if (!remetente.isGM && !pedidoPeloMestre && (doc.hidden || c.interacao === "mestre" || armadilhaCamuflada)) return;
  // O token só vale se for do remetente e estiver neste mapa
  let tokenUuid = null;
  if (data.tokenUuid) {
    const tk = await fromUuid(data.tokenUuid).catch(() => null);
    if (tk?.parent?.id === doc.parent?.id && (remetente.isGM || tk.actor?.testUserPermission(remetente, "OWNER"))) tokenUuid = tk.uuid;
  }
  let rolagem = null;
  const r = data.rolagem ?? {};
  if (r.mensagem && testeDe(c).quemRola !== "mestre") {
    const total = await totalDaMensagem(r.mensagem, remetente);
    if (total === null) return console.warn(`${ID} | rolagem de ${remetente.name} recusada: a mensagem não confere`);
    rolagem = { total };
  }
  // Resultado de minijogo nunca vem por aqui: só pelo desafio que o mestre montou (receberMinijogo)
  return usarObjeto(doc, { tokenUuid, userId: remetente.id, rolagem, desarmar: !!data.desarmar, semConfirmar: pedidoPeloMestre });
}

// Canal do módulo: pedidos dos jogadores (no mestre) e efeitos/minijogos mandados pelo mestre
export function registrarSocket() {
  // O servidor do Foundry acrescenta no fim o id de quem mandou de verdade. Se chegar argumento a mais,
  // alguém tentou se passar por outra pessoa: o pedido é descartado.
  game.socket.on(SOCKET, async (...args) => {
    if (args.length !== 2 || typeof args[1] !== "string") return;
    const [data, senderId] = args;
    const remetente = game.users.get(senderId);
    if (!remetente || !data || typeof data !== "object") return;
    try { await tratar(data, remetente); }
    catch (err) {
      // uma falha num pedido não pode virar "erro não tratado" mudo: fica no console com a ação e quem pediu
      console.error(`${ID} | falha ao tratar "${data.acao}" de ${remetente.name}`, err);
      if (game.user.isGM) ui.notifications.warn(t("Aviso.PedidoFalhou", { acao: String(data.acao ?? "?"), quem: remetente.name }));
    }
  });
}
async function tratar(data, remetente) {
  {
    if (data.acao === "jogar") {
      if (!remetente.isGM || !data.userIds?.includes(game.user.id)) return;
      const d = await fromUuid(data.uuid);
      if (!d) return;
      if (data.desafio?.id) jogarDesafio(d, data.desafio, { desarmar: !!data.desarmar });
      else pedirUso(d, data.tokenUuid, { desarmar: !!data.desarmar });
      return;
    }
    if (data.acao === "efeito") {
      if (remetente.isGM && data.userIds?.includes(game.user.id)) aplicarEfeito(data.efeito);
      return;
    }
    if (!souMestreAtivo()) return;
    if (data.acao === "minijogo") return receberMinijogo(data, remetente);
    if (data.acao === "voltar") return receberVolta(data, remetente);
    const doc = typeof data.uuid === "string" ? await fromUuid(data.uuid).catch(() => null) : null;
    if (!doc) return;
    if (data.acao === "usar") return receberUso(doc, data, remetente);
    // Dos jogadores, só chega "tentou abrir a porta trancada"
    if (data.acao === "parede" && doc.documentName === "Wall" && (remetente.isGM || data.momento === "tentativa")) {
      eventoParede(doc, data.momento, { userId: remetente.id });
    }
  }
}
