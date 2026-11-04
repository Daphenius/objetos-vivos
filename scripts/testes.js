import { efeito, executarAcoes, gastarUso, mudarEstado, passaFiltro, podeAgir, rodarLista } from "./estados.js";
import { ID, alvos, carregar, cfgDe, comparar, consertado, ehTile, emitir, esc, estaTrancado, fechaduraTrancada, nomeObjeto, pausa, precisaTeste, souMestreAtivo, t, testeDe, tokenDoUsuario } from "./nucleo.js";

// Opções de teste do sistema D&D 5e (perícias, ferramentas, atributos, salvaguardas)
export function opcoesDeTeste() {
  const D = CONFIG.DND5E;
  if (game.system?.id !== "dnd5e" || !D) return [];
  const loc = x => game.i18n.localize(typeof x === "string" ? x : x?.label ?? "");
  const nomeFerr = k => {
    try { const n = globalThis.dnd5e?.documents?.Trait?.keyLabel?.(`tool:${k}`); if (n && n !== k) return n; } catch {}
    const n = t(`Teste.Ferr.${k}`);
    return n.startsWith("OV.") ? k : n;
  };
  const ordenar = l => l.sort((a, b) => comparar(a.nome, b.nome));
  return [
    { nome: t("Teste.Grupo.skill"), itens: ordenar(Object.entries(D.skills ?? {}).map(([k, v]) => ({ valor: `skill:${k}`, nome: loc(v) }))) },
    { nome: t("Teste.Grupo.tool"), itens: ordenar(Object.keys(D.tools ?? D.toolIds ?? {}).map(k => ({ valor: `tool:${k}`, nome: nomeFerr(k) }))) },
    { nome: t("Teste.Grupo.ability"), itens: Object.entries(D.abilities ?? {}).map(([k, v]) => ({ valor: `ability:${k}`, nome: loc(v) })) },
    { nome: t("Teste.Grupo.save"), itens: Object.entries(D.abilities ?? {}).map(([k, v]) => ({ valor: `save:${k}`, nome: loc(v) })) }
  ];
}
export function nomeDoTeste(tt) {
  if (tt.qual === "formula" || game.system?.id !== "dnd5e") return tt.formula || "1d20";
  for (const g of opcoesDeTeste()) { const i = g.itens.find(x => x.valor === tt.qual); if (i) return `${i.nome} (${g.nome})`; }
  return tt.qual;
}

// Rola o teste com o personagem. Devolve o total, ou null se a pessoa cancelou.
export async function rolarTeste(ator, tt, { escondido = false } = {}) {
  const [tipo, chave] = String(tt.qual ?? "skill:arc").split(":");
  const modoRolagem = escondido ? (CONST.DICE_ROLL_MODES.BLIND) : null;
  let r;
  try {
    if (tipo === "formula" || game.system?.id !== "dnd5e") {
      const roll = await new Roll(tt.formula || "1d20", ator?.getRollData?.() ?? {}).evaluate();
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: ator }), flavor: t("Teste.Titulo") }, modoRolagem ? { rollMode: modoRolagem } : {});
      return roll.total;
    }
    const janela = { configure: !escondido };
    const msg = modoRolagem ? { rollMode: modoRolagem } : {};
    if (tipo === "skill") r = await ator.rollSkill({ skill: chave }, janela, msg);
    else if (tipo === "tool") r = await ator.rollToolCheck({ tool: chave }, janela, msg);
    else if (tipo === "ability") r = await ator.rollAbilityCheck({ ability: chave }, janela, msg);
    else if (tipo === "save") r = await ator.rollSavingThrow({ ability: chave }, janela, msg);
  } catch (err) {
    console.error(`${ID} | não consegui rolar o teste`, err);
    ui.notifications.error(t("Teste.Erro"));
    return null;
  }
  const roll = Array.isArray(r) ? r[0] : r;
  return Number.isFinite(roll?.total) ? roll.total : null;
}

// Abre o minijogo na tela de quem chamou. Devolve { resultado, jogadas }:
// resultado true = conseguiu, false = falhou/acabou o tempo, null = fechou a janela.
export async function abrirMinijogo(doc, tt, { desarmar = false, estado = null } = {}) {
  const c = cfgDe(doc);
  const { MinijogoConserto } = await carregar.minijogos();
  const app = new MinijogoConserto({
    jogo: tt.minijogo || "aneis",
    img: tt._img || c?.estados?.[0]?.img || doc.texture?.src || "",
    nome: nomeObjeto(doc), cd: tt.cd, tempo: tt.tempo, estado,
    titulo: desarmar ? "Mini.TituloDesarmar" : tt.modo === "consertar" ? "Mini.Titulo" : "Mini.TituloTeste"
  });
  await app.render({ force: true });
  const resultado = await app.resultado;
  return { resultado, jogadas: app.jogadas };
}
// Atalho (mestre, "Testar o minijogo"): só o resultado
export async function jogarMinijogo(doc, tt, opcoes = {}) { return (await abrirMinijogo(doc, tt, opcoes)).resultado; }

// ---------- Desafios de minijogo (só na memória do mestre ativo; o jogador nunca recebe nada além
// do estado inicial que ele precisa ver para jogar)
export const desafios = new Map();
const VALIDADE_DESAFIO = 15 * 60 * 1000;
async function criarDesafio(doc, tt, { userId, token, total, desarmar }) {
  const { gerarDesafio } = await carregar.minijogos();
  const agora = Date.now();
  for (const [id, d] of desafios) if (agora - d.criado > VALIDADE_DESAFIO) desafios.delete(id);
  const jogo = tt.minijogo || "aneis";
  const estado = gerarDesafio(jogo, tt.cd);
  const id = foundry.utils.randomID(16);
  desafios.set(id, { id, uuid: doc.uuid, userId, tokenUuid: token?.uuid ?? null, total, desarmar, jogo, cd: tt.cd,
    tempo: Math.max(0, Number(tt.tempo) || 0), estado, criado: agora });
  emitir({ acao: "jogar", uuid: doc.uuid, userIds: [userId], desarmar, desafio: { id, estado } });
}

// O jogador terminou o minijogo: o mestre refaz as jogadas e decide (de quem pediu, uma vez só, no prazo)
export async function receberMinijogo(data, remetente) {
  const d = desafios.get(data?.desafio);
  if (!d || d.userId !== remetente.id) return;
  desafios.delete(d.id);
  if (data.cancelou) return; // fechou a janela: não conta como tentativa
  const doc = await fromUuid(d.uuid).catch(() => null);
  if (!doc) return;
  const { conferirJogadas, tempoDeMostrar } = await carregar.minijogos();
  const prazo = d.tempo ? d.tempo * 1000 + tempoDeMostrar(d.jogo, d.estado) + 10000 : VALIDADE_DESAFIO;
  const noPrazo = Date.now() - d.criado <= prazo;
  const conseguiu = noPrazo && conferirJogadas(d.jogo, d.cd, d.estado, data.jogadas);
  return usarObjeto(doc, { tokenUuid: d.tokenUuid, userId: d.userId, desarmar: d.desarmar, semConfirmar: true,
    rolagem: { total: d.total, minijogo: conseguiu } });
}

export const usaRolagem = tt => (tt.como ?? "rolagem") !== "minijogo";
export const usaMinijogo = tt => (tt.como ?? "rolagem") !== "rolagem";

// Falhou: conta a tentativa, avisa, roda "Ao falhar no teste" e trava se acabaram as tentativas
export async function falhouTeste(doc, c, ctx, total, { desarmar = false } = {}) {
  const tt = testeDe(c);
  const feitas = (Number(tt.feitas) || 0) + 1;
  const max = Number(tt.tentativas) || 0;
  const travou = max > 0 && feitas >= max;
  const upd = { [`flags.${ID}.objeto.teste.feitas`]: feitas };
  // Acabaram as tentativas: trava (na armadilha, trava só as tentativas de desarmar; ela continua disparando)
  if (travou) upd[`flags.${ID}.objeto.trancado`] = true;
  await doc.update(upd);
  const cd = Number(tt.cd) || 10;
  let texto = tt.msgFalha?.trim() || t(desarmar ? "Teste.FalhouDesarmar" : tt.modo === "consertar" ? "Teste.FalhouConsertar" : "Teste.Falhou", { objeto: nomeObjeto(doc) });
  if (tt.mostrarCD && total != null) texto += ` (${total} × CD ${cd})`;
  if (travou) texto += ` ${t("Teste.Travou")}`;
  efeito(alvos("disparou", ctx), { tipo: "aviso", texto });
  await rodarLista(doc, c.acoes?.falha, ctx);
  Hooks.callAll("objetosVivos.falhou", doc, { token: ctx.token, userId: ctx.userId, total, cd });
}

// Faz o teste (rolagem e/ou minijogo) e devolve "passou", "falhou" ou null (esperando alguém jogar,
// cancelado ou sem personagem). Na falha já conta a tentativa e roda "Ao falhar no teste".
// Pedidos de teste que o mestre mandou para a tela de um jogador ("uuid|userId" -> quando)
export const aguardando = new Map();
export async function avaliarTeste(doc, c, { token, userId, rolagem, desarmar = false }) {
  const tt = testeDe(c);
  const ctxT = { cena: doc.parent, token, userId, fonte: doc, profundidade: 0 };
  let total = Number.isFinite(rolagem?.total) ? rolagem.total : null;
  let mini = typeof rolagem?.minijogo === "boolean" ? rolagem.minijogo : undefined;
  const foiOMestre = !!userId && userId === game.user.id;
  let escondido = tt.quemRola === "mestre";
  // Falta a parte do jogador (o minijogo, ou rolar quando "quem rola" é o jogador) e não foi o mestre quem
  // usou: o pedido abre na tela do jogador dono do token (pisou, chegou perto). Sem dono online, o mestre
  // rola às cegas (o minijogo, sem jogador, não tem como ser feito).
  const faltaMini = usaMinijogo(tt) && mini === undefined;
  const faltaRolagemJogador = usaRolagem(tt) && total === null && tt.quemRola !== "mestre";
  if (!foiOMestre && (faltaMini || faltaRolagemJogador)) {
    const donos = token?.actor
      ? game.users.filter(u => u.active && !u.isGM && token.actor.testUserPermission?.(u, "OWNER")).map(u => u.id)
      : (userId && !game.users.get(userId)?.isGM && game.users.get(userId)?.active ? [userId] : []);
    if (donos.length) {
      // de preferência quem clicou, se for dono do token
      const quem = donos.includes(userId) ? userId : donos[0];
      if (faltaRolagemJogador) {
        // primeiro a rolagem (na tela do jogador); o minijogo, se houver, vem depois
        aguardando.set(`${doc.uuid}|${quem}`, Date.now());
        emitir({ acao: "jogar", uuid: doc.uuid, tokenUuid: token?.uuid ?? null, userIds: [quem], desarmar });
      } else await criarDesafio(doc, tt, { userId: quem, token, total, desarmar });
      return null;
    }
    if (faltaMini) { ui.notifications.info(t("Mini.SemJogador", { objeto: nomeObjeto(doc) })); return null; }
    escondido = true;
  }
  // O mestre usou: ele mesmo joga o minijogo
  if (faltaMini) {
    mini = await jogarMinijogo(doc, tt, { desarmar });
    if (mini === null) return null;
  }
  if (usaRolagem(tt) && total === null) {
    // O mestre rola (foi ele quem usou, o mestre rola escondido, ou o dono do token não está online)
    const ator = token?.actor ?? game.users.get(userId)?.character ?? null;
    if (!ator) {
      if (game.users.get(userId)?.isGM) ui.notifications.info(t("Teste.SemTokenMestre"));
      else { if (userId) efeito([userId], { tipo: "aviso", texto: t("Teste.SemPersonagem") }); return null; }
    } else {
      total = await rolarTeste(ator, tt, { escondido });
      if (total === null) return null;
    }
  }
  const cd = Number(tt.cd) || 10;
  const passouRolagem = !usaRolagem(tt) || total === null || total >= cd;
  const passouMini = !usaMinijogo(tt) || mini === true;
  const passou = passouRolagem && passouMini;
  Hooks.callAll("objetosVivos.teste", doc, { token, userId, total, cd, minijogo: mini, passou, desarmar });
  if (!passou) { await falhouTeste(doc, c, ctxT, passouRolagem ? null : total, { desarmar }); return "falhou"; }
  const msg = desarmar ? "Teste.Desarmou" : tt.modo === "consertar" ? "Teste.Consertou" : "Teste.Passou";
  if (userId) efeito([userId], { tipo: "aviso", texto: t(msg, { objeto: nomeObjeto(doc) }) + (tt.mostrarCD && total !== null ? ` (${total} × CD ${cd})` : "") });
  return "passou";
}

// Dispara o objeto do jeito normal (troca a aparência e roda as ações)
export async function dispararObjeto(doc, c, ctx) {
  await mudarEstado(doc, (c.estado + 1) % c.estados.length, ctx);
  if (c.camaleao && c.revelarAoUsar && !c.revelado) await doc.setFlag(ID, "objeto.revelado", true);
  Hooks.callAll("objetosVivos.usado", doc, { token: ctx.token, userId: ctx.userId });
}

export async function usarObjeto(doc, { tokenUuid = null, userId = null, forcar = false, rolagem = null, desarmar = false, semConfirmar = false }) {
  if (!game.user.isGM) return;
  const c = cfgDe(doc);
  if (!c || !ehTile(doc)) return;
  const cena = doc.parent;
  const token = (tokenUuid ? await fromUuid(tokenUuid) : null) ?? tokenDoUsuario(userId, cena);
  const ctx = { cena, token, userId, fonte: doc, profundidade: 0 };
  const tt = testeDe(c);
  if (!forcar) {
    // Armadilha: desarmada não dispara mais; a tentativa de desarmar é um teste à parte
    if (tt.modo === "desarmar") {
      if (c.desarmado) {
        if (userId && desarmar) efeito([userId], { tipo: "aviso", texto: t("Teste.JaDesarmada", { objeto: nomeObjeto(doc) }) });
        return;
      }
      if (desarmar) {
        if (c.trancado) { if (userId) efeito([userId], { tipo: "aviso", texto: t("Teste.SemTentativas", { objeto: nomeObjeto(doc) }) }); return; }
        // confere as regras sem gastar o uso; o uso só é gasto se desarmar
        if (!await podeAgir(doc, c, token, userId, "desarmar", { gastar: false, confirmar: !semConfirmar })) return;
        const r = await avaliarTeste(doc, c, { token, userId, rolagem, desarmar: true });
        if (r === "passou") {
          await gastarUso(doc);
          const upd = { [`flags.${ID}.objeto.desarmado`]: true };
          if (c.camaleao && !c.revelado) upd[`flags.${ID}.objeto.revelado`] = true;
          await doc.update(upd);
          await rodarLista(doc, c.acoes?.desarmar, ctx);
          Hooks.callAll("objetosVivos.desarmado", doc, { token, userId });
        } else if (r === "falhou" && tt.falhaDispara !== false) {
          await dispararObjeto(doc, cfgDe(doc), ctx);
        }
        return;
      }
      // Disparar a armadilha (pisou, clicou em "Usar", chegou perto): sem teste
      if (!await podeAgir(doc, c, token, userId, "usar")) return;
      return dispararObjeto(doc, c, ctx);
    }
    if (estaTrancado(doc, c)) {
      if (userId) efeito([userId], { tipo: "aviso", texto: t(fechaduraTrancada(doc) ? "Aviso.TrancadoGazua" : "Aviso.Trancado", { objeto: nomeObjeto(doc) }) });
      Hooks.callAll("objetosVivos.trancado", doc, { token, userId });
      return;
    }
    // Consertar: depois de consertado ele não volta a quebrar
    if (consertado(c)) {
      if (tt.depois === "nada") {
        if (userId) efeito([userId], { tipo: "aviso", texto: t("Teste.JaConsertado", { objeto: nomeObjeto(doc) }) });
        return;
      }
      if (!await podeAgir(doc, c, token, userId, "usar")) return;
      await executarAcoes(doc, "usoConsertado", ctx);
      Hooks.callAll("objetosVivos.usado", doc, { token, userId });
      return;
    }
    // Primeiro as regras (quem pode, usos, confirmação); só depois o teste. O uso só é gasto se passar.
    const comTeste = precisaTeste(c);
    if (!await podeAgir(doc, c, token, userId, "usar", { gastar: !comTeste, confirmar: !semConfirmar })) return;
    if (comTeste) {
      const r = await avaliarTeste(doc, c, { token, userId, rolagem });
      if (r !== "passou") return;
      await gastarUso(doc);
    }
  }
  await dispararObjeto(doc, c, ctx);
}

// Algo aconteceu com uma porta/parede que é objeto
export async function eventoParede(doc, momento, { tokenUuid = null, userId = null }) {
  if (!souMestreAtivo()) return;
  const c = cfgDe(doc);
  if (!c) return;
  const tem = (c.acoes?.[momento]?.length ?? 0) + (momento !== "atravessar" ? (c.acoes?.sempre?.length ?? 0) : 0);
  if (!tem) return;
  const cena = doc.parent;
  const token = (tokenUuid ? await fromUuid(tokenUuid) : null) ?? tokenDoUsuario(userId, cena);
  if (!await podeAgir(doc, c, token, userId, momento)) return;
  const ctx = { cena, token, userId, fonte: doc, profundidade: 0 };
  if (momento === "atravessar") {
    await rodarLista(doc, c.acoes?.atravessar, ctx);
  } else await executarAcoes(doc, momento, ctx);
}

export async function escolherArmadilha(doc, c) {
  const D = foundry.applications.api.DialogV2;
  const nome = esc(nomeObjeto(doc));
  if (c.interacao !== "clicar" && c.interacao !== "mestre") {
    const ok = await D.confirm({ window: { title: t("Teste.Modo.desarmar") }, content: `<p>${t("Teste.PerguntaDesarmar", { objeto: nome })}</p>`, rejectClose: false });
    return ok ? "desarmar" : null;
  }
  return D.wait({
    window: { title: nomeObjeto(doc) },
    content: `<p>${t("Teste.PerguntaArmadilha", { objeto: nome })}</p>`,
    buttons: [
      { action: "usar", label: t("Teste.BotaoUsar"), icon: "fa-solid fa-hand-pointer" },
      { action: "desarmar", label: t("Teste.BotaoDesarmar"), icon: "fa-solid fa-screwdriver-wrench", default: true }
    ],
    rejectClose: false
  }).catch(() => null);
}

// Rola o teste e devolve o id da mensagem da rolagem no chat (o mestre lê o resultado dela)
export async function rolarComMensagem(ator, tt) {
  const antes = new Set(game.messages.keys());
  const total = await rolarTeste(ator, tt);
  if (total === null) return null;
  for (let i = 0; i < 20; i++) {
    const m = game.messages.contents.findLast(m => !antes.has(m.id) && m.author?.id === game.user.id && m.rolls?.[0]?.total === total);
    if (m) return m.id;
    await pausa(0.1);
  }
  ui.notifications.warn(t("Teste.SemMensagem"));
  return null;
}

// Leva o pedido até o mestre ativo
// O mestre mandou um desafio de minijogo: joga e devolve as jogadas (não o resultado)
export async function jogarDesafio(doc, desafio, { desarmar = false } = {}) {
  const tt = testeDe(cfgDe(doc));
  const { resultado, jogadas } = await abrirMinijogo(doc, tt, { desarmar, estado: desafio.estado });
  emitir({ acao: "minijogo", desafio: desafio.id, jogadas, cancelou: resultado === null });
}

export async function pedirUso(doc, tokenUuid, { desarmar = false } = {}) {
  if (!souMestreAtivo() && !game.users.activeGM) return ui.notifications.warn(t("Aviso.SemMestre"));
  let rolagem = null;
  const c = cfgDe(doc);
  const tt = testeDe(c);
  const precisa = tt.modo === "desarmar" ? (desarmar && !c?.desarmado && !c?.trancado) : (!estaTrancado(doc, c) && precisaTeste(c));
  // O jogador rola o teste na própria tela (com a janela de vantagem do sistema). O mestre não aceita um
  // número: ele lê o resultado da mensagem da rolagem no chat. O minijogo vem depois, montado pelo mestre.
  if (!game.user.isGM && c && precisa) {
    // Antes de rolar, confere o que já dá para saber aqui (quem pode usar e se ainda tem usos)
    const tokenDoc = tokenUuid ? await fromUuid(tokenUuid) : null;
    if (!passaFiltro(c, tokenDoc, game.user.id) || (c.usos > 0 && (c.usados ?? 0) >= c.usos)) {
      return ui.notifications.info(t("Aviso.NaoPode", { objeto: nomeObjeto(doc) }));
    }
    if (usaRolagem(tt) && tt.quemRola !== "mestre") {
      const ator = tokenDoc?.actor ?? game.user.character;
      if (!ator) return ui.notifications.warn(t("Teste.SemPersonagem"));
      const mensagem = await rolarComMensagem(ator, tt);
      if (!mensagem) return;
      rolagem = { mensagem };
    }
  }
  if (souMestreAtivo()) return usarObjeto(doc, { tokenUuid, userId: game.user.id, rolagem, desarmar });
  emitir({ acao: "usar", uuid: doc.uuid, tokenUuid, rolagem, desarmar });
}
