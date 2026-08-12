//  gerador-tiktok-core.js
//  Monta o fluxo "/cursos" do TikTok no formato de copiar/colar do editor
//  de fluxos do UnniChat (mesmo formato obtido ao selecionar os nós e
//  copiar com Ctrl+C).
//
//  Estrutura gerada:
//    [entrada]  action add_tag ["Fluxo de inscrição", "[NICOLE] - TIKTOK /CURSOS"]
//        └─> UMA ÚNICA mensagem de lista (message-list) com VÁRIAS SEÇÕES,
//            uma seção por semana ("Cursos que começam DD/MM"), e cada linha
//            apontando para o ramo do curso.
//              └─ (saída) remove_tag "Fluxo de inscrição"
//                    └─> delay 10 min
//                          └─> condicional "clicou?" — se NÃO clicou, lembrete
//    Ramo de cada curso:
//        action add_tag ["[NICOLE] - TIKTOK CLICOU /CURSOS"]
//          ├─ curso de OUTRA conta → mensagem cta-url (wa.me/<fone>?text=<frase gatilho>)
//          └─ curso da MESMA conta do fluxo → nó "Encaminhar para automação"
//             (o UnniChat não exporta o vínculo; precisa ser apontado à mão)

//  ————— Configuração (edite aqui se algo mudar) —————
export const CONFIG_TIKTOK = {
  // Conta onde o fluxo do TikTok roda (Conta 1 do UnniChat).
  connectionId: "ouLDZiM3pEddrZuTGJVw",
  contaFluxo: "Cessetembro",

  // Telefones de cada conta (mesmos do Porto/index.html).
  telefones: {
    "Cessetembro": "15557333134",
    "Cessetembro 2": "5511992543873",
    "Cessetembro 3": "5511939064173",
    "Cessetembro 4": "5511990127257",
  },

  tagRemoverNoFim: "Fluxo de inscrição",
  delayLembreteMinutos: 10,

  textos: {
    corpoLista:
      "Olá! Que bom saber que você está querendo se aprimorar. Parabéns pelo primeiro passo!\n\n"
      + "Temos muitos cursos que estão gratuitos.\n\n"
      + "O próximo passo é escolher qual curso vai fazer:",
    rodapeLista: "Estes cursos terão aulas entre {inicio} e {fim}",
    tituloSecao: "Cursos que começam {semana}",
    botaoLista: "Clique aqui",
    corpoCtaCongresso: "Boa escolha! Para se inscrever em {nome}, clique no botão abaixo👇",
    corpoCtaCurso: "Boa escolha! Para se inscrever no curso de {nome}, clique no botão abaixo👇",
    fraseGatilhoCongresso: "Garantir minha vaga gratuita no {nomeCompleto}",
    fraseGatilhoCurso: "Garantir minha vaga gratuita no curso de {nome}",
    botaoCta: "Clique aqui",
    lembrete:
      "Ei, passando só para lembrar que os cursos estão gratuitos por tempo limitado\n\n"
      + "Bora começar 2026 com tudo! \n\n"
      + "Clique nos botões acima e escolha seu curso 🚀 👆",
  },
};

//  ————— Pessoas (cada fluxo do TikTok tem tags próprias) —————
//  As duas rodam na MESMA conta (Cessetembro 1); só mudam as tags.
export const PESSOAS = {
  nicole: {
    nome: "Nicole",
    tagsEntrada: ["Fluxo de inscrição", "[NICOLE] - TIKTOK /CURSOS"],
    tagClicou: "[NICOLE] - TIKTOK CLICOU /CURSOS",
    // A condicional aceita também a tag antiga usada no fluxo manual.
    tagsCondicionalClicou: ["[NICOLE] - TIKTOK CLICOU /CURSOS", 'clicou "/cursos" Tiktok'],
  },
  alyne: {
    nome: "Alyne",
    tagsEntrada: ["Fluxo de inscrição", "[ALYNE] - TIKTOK /CURSOS"],
    tagClicou: "[ALYNE] - TIKTOK CLICOU /CURSOS",
    tagsCondicionalClicou: ["[ALYNE] - TIKTOK CLICOU /CURSOS"],
  },
};

//  ————— Helpers —————
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function novoId(tamanho = 20) {
  let id = "";
  const aleatorio = new Uint32Array(tamanho);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(aleatorio);
  } else {
    for (let i = 0; i < tamanho; i++) aleatorio[i] = Math.floor(Math.random() * 4294967296);
  }
  for (let i = 0; i < tamanho; i++) id += ALFABETO[aleatorio[i] % ALFABETO.length];
  return id;
}

export function dataCurta(semana) {
  // "10/08/2026" -> "10/08"
  const partes = String(semana || "").split("/");
  return partes.length >= 2 ? `${partes[0]}/${partes[1]}` : String(semana || "");
}

export function sextaDaSemana(semana) {
  // "10/08/2026" (segunda) -> "14/08" (sexta da mesma semana)
  const [d, m, a] = String(semana || "").split("/").map(Number);
  if (!d || !m || !a) return "";
  const data = new Date(Date.UTC(a, m - 1, d + 4));
  const dd = String(data.getUTCDate()).padStart(2, "0");
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function preencher(texto, valores) {
  let saida = String(texto || "");
  for (const [chave, valor] of Object.entries(valores)) {
    saida = saida.split(`{${chave}}`).join(valor);
  }
  return saida;
}

function tituloLinhaLista(nome) {
  // O WhatsApp limita o título da linha da lista a 24 caracteres.
  const texto = String(nome || "").trim();
  return texto.length <= 24 ? texto : `${texto.slice(0, 23)}…`;
}

export function identificarTipoEvento(abertura) {
  const origem = String(abertura?.origem || "").trim().toLowerCase();
  if (origem === "congresso") return "congresso";
  if (origem === "curso") return "curso";
  if (abertura?.edicaoId || abertura?.congressoSigla) return "congresso";
  return /^\d/.test(String(abertura?.nomeCurso || "").trim()) ? "congresso" : "curso";
}

//  ————— Fábricas de nós (formato copiar/colar do UnniChat) —————
function baseNode(id, x, y) {
  return {
    id,
    type: "customNode",
    position: { x, y },
    positionAbsolute: { x, y },
    data: {
      id,
      pos: JSON.stringify({ x, y }),
      sonId: null,
      sequentialSonId: null,
      sequentialFatherId: null,
      lastEditedBy: "gerador-tiktok@cess-hub",
    },
    width: 272,
    height: 300,
    selected: true,
    dragging: false,
  };
}

function noAcaoTag(id, x, y, tipo, tags, sonId = null) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "action", tag: "action", icon: "", color: "transparent" };
  node.data.sonId = sonId;
  node.data.action = {
    type: tipo, // "add_tag" | "remove_tag"
    tags,
    keepChatActive: false,
    forceAttribution: false,
    unniiaForceReply: false,
    unniiaAtributionOnly: false,
    unniiaStatus: null,
    userResourceGroupId: null,
    userResourceGroupName: null,
    userResourceGroupSendRandomic: false,
    customFields: null,
    activityConfig: null,
    attendantId: null,
    attendantName: null,
    pipeline: null,
  };
  node.height = 304;
  return node;
}

function mensagemBase() {
  return {
    type: "send_message",
    message: null,
    messageType: null,
    interactiveType: null,
    buttonsBodyText: null,
    buttons: null,
    sections: null,
    listComponents: null,
    ctaUrl: null,
    file: null,
    links: null,
    flow: null,
    flowId: null,
    flowButton: null,
    flowComponents: null,
    template: null,
    templateId: null,
    templateTtl: null,
    templateButtons: null,
    headerParameters: null,
    bodyParameters: null,
    urlButtonParameters: null,
    carousel: null,
    carouselBody: null,
    requestContactButton: null,
    sendingType: null,
  };
}

//  UMA mensagem de lista com VÁRIAS seções (uma por semana).
//  secoes: [{ titulo, linhas: [{ titulo, sonId }] }]
function noListaMultiSecoes(id, x, y, { corpo, rodape, cta, secoes, sonId }) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "message", tag: "message", icon: "", color: "transparent" };
  node.data.sonId = sonId;
  const msg = mensagemBase();
  msg.messageType = "message-list";
  msg.listComponents = { body: corpo, footer: rodape, cta };
  msg.sections = secoes.map((secao) => ({
    id: novoId(),
    title: secao.titulo,
    rows: secao.linhas.map(({ titulo, sonId: alvo }) => ({ id: novoId(), title: titulo, sonId: alvo })),
  }));
  node.data.message = msg;
  node.width = 345;
  const totalLinhas = secoes.reduce((s, sec) => s + sec.linhas.length, 0);
  node.height = 700 + totalLinhas * 60 + secoes.length * 80;
  return node;
}

function noCtaUrl(id, x, y, { corpo, url, textoBotao }) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "message", tag: "message", icon: "", color: "transparent" };
  const msg = mensagemBase();
  msg.messageType = "interactive-message";
  msg.interactiveType = "cta-url";
  msg.buttonsBodyText = corpo;
  msg.ctaUrl = { sonId: null, parameters: { url, display_text: textoBotao } };
  node.data.message = msg;
  node.height = 354;
  return node;
}

function noTexto(id, x, y, texto) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "message", tag: "message", icon: "", color: "transparent" };
  const msg = mensagemBase();
  msg.messageType = "message-text";
  msg.message = texto;
  node.data.message = msg;
  node.height = 390;
  return node;
}

function noEncaminharAutomacao(id, x, y, nomeAutomacao) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "fowardAutomation", tag: "fowardAutomation", icon: "", color: "transparent" };
  node.data.fowardAutomation = {
    automationType: "whatsapp",
    automationId: "",
    automationName: nomeAutomacao || "",
  };
  node.height = 258;
  return node;
}

function noDelayMinutos(id, x, y, minutos, sonId) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "delay", tag: "delay", icon: "", color: "transparent" };
  node.data.sonId = sonId;
  node.data.delay = {
    type: "minutes",
    time: minutos,
    sendAt: null,
    isComercialInterval: false,
    commercialDays: null,
    commercialTimeRange: null,
    sendMessagesIntervalRange: [10, 201],
    sendMessagesIntervalRangeType: "minutes",
  };
  node.height = 284;
  return node;
}

function noCondicionalClicou(id, x, y, tags, falseId) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "conditionalV2", tag: "conditionalV2", icon: "", color: "transparent" };
  node.data.conditionalV2 = {
    falseId,
    groupConditions: [{
      conditionType: "or",
      sonId: null,
      conditions: [{
        type: "contains-some-tag",
        tags,
        commercialDate: null,
        commercialDays: null,
        commercialTimeRange: null,
        commercialTimeType: null,
        commercialTimeCheckCondtional: null,
        contactCheckField: null,
        contactCheckFieldType: null,
        contactCheckCondtional: null,
        contactCheckValue: null,
        attendantIds: null,
        businessStatus: null,
        pipelineId: null,
        pipelineColumnsIds: null,
      }],
    }],
  };
  node.height = 481;
  return node;
}

//  ————— Montagem do fluxo —————
//  semanas: [{ semana: "DD/MM/YYYY", cursos: [{ nomeCurso, tipoEvento, contaAPI, nomeWhatsapp }] }]
//  Segunda-feira: [atual, +7, +14]. Quarta: [+7, +14].
//  Gera UMA ÚNICA mensagem de lista com uma seção por semana.
//  pessoa: PESSOAS.nicole (padrão) ou PESSOAS.alyne — muda somente as tags.
export function montarFluxoTiktok(semanas, config = CONFIG_TIKTOK, pessoa = PESSOAS.nicole) {
  const nodes = [];
  const avisos = [];
  const t = config.textos;

  const X_LISTA = 600;
  const X_RAMOS = 1400;
  const LARGURA_RAMO = 360;
  const RAMOS_POR_LINHA = 6;
  const ALTURA_RAMO = 760;

  // Ramos por curso (criados antes para termos os IDs nas linhas da lista)
  let indiceRamo = 0;
  const secoes = [];

  const semanasComCursos = (semanas || []).filter((g) => (g.cursos || []).length);
  if (!semanasComCursos.length) {
    throw new Error("Nenhum curso para gerar — verifique as semanas selecionadas.");
  }

  for (const grupo of semanasComCursos) {
    const linhas = [];
    for (const curso of grupo.cursos) {
      const nome = String(curso.nomeCurso || "").trim();
      if (!nome) continue;

      const tipo = curso.tipoEvento || "curso";
      const conta = String(curso.contaAPI || "").trim();
      const col = indiceRamo % RAMOS_POR_LINHA;
      const lin = Math.floor(indiceRamo / RAMOS_POR_LINHA);
      const x = X_RAMOS + col * LARGURA_RAMO;
      const y = -600 + lin * ALTURA_RAMO;
      indiceRamo += 1;

      const idAcao = novoId();
      let idDestino;

      if (conta === config.contaFluxo) {
        // Curso da mesma conta do fluxo: encaminha para a automação de inscrição.
        idDestino = novoId();
        const nomeAutomacao = `Fluxo ${dataCurta(grupo.semana)} - ${nome}`;
        nodes.push(noEncaminharAutomacao(idDestino, x, y + 360, nomeAutomacao));
        avisos.push(
          `"${nome}" é da conta ${conta || "?"} (mesma do fluxo): após colar, `
          + `abra o nó "Encaminhar para automação" e selecione o fluxo de inscrição `
          + `(${nomeAutomacao}).`
        );
      } else {
        const fone = config.telefones[conta];
        if (!fone) {
          avisos.push(`"${nome}": conta API "${conta || "vazia"}" sem telefone mapeado — usei link sem número, revise!`);
        }
        const nomeCompleto = String(curso.nomeWhatsapp || nome).trim();
        const frase = tipo === "congresso"
          ? preencher(t.fraseGatilhoCongresso, { nomeCompleto, nome })
          : preencher(t.fraseGatilhoCurso, { nome });
        const corpo = tipo === "congresso"
          ? preencher(t.corpoCtaCongresso, { nome })
          : preencher(t.corpoCtaCurso, { nome });
        idDestino = novoId();
        nodes.push(noCtaUrl(idDestino, x, y + 360, {
          corpo,
          url: `https://wa.me/${fone || ""}?text=${frase}`,
          textoBotao: t.botaoCta,
        }));
      }

      nodes.push(noAcaoTag(idAcao, x, y, "add_tag", [pessoa.tagClicou], idDestino));
      linhas.push({ titulo: tituloLinhaLista(nome), sonId: idAcao });

      if (nome.length > 24) {
        avisos.push(`"${nome}" tem mais de 24 caracteres — o título na lista ficou "${tituloLinhaLista(nome)}".`);
      }
    }
    if (linhas.length) {
      secoes.push({
        titulo: preencher(t.tituloSecao, { semana: dataCurta(grupo.semana) }),
        linhas,
      });
    }
  }

  const totalLinhas = secoes.reduce((s, sec) => s + sec.linhas.length, 0);
  if (totalLinhas > 10) {
    avisos.push(
      `A lista ficou com ${totalLinhas} cursos no total. O WhatsApp oficialmente `
      + `aceita até 10 itens por mensagem de lista — se o envio falhar, reduza a `
      + `seleção de cursos ou divida em dois disparos.`
    );
  }

  // Cauda: remove tag -> delay -> condicional -> lembrete p/ quem não clicou
  const idRemove = novoId();
  const idDelay = novoId();
  const idCond = novoId();
  const idLembrete = novoId();

  nodes.push(noAcaoTag(idRemove, X_LISTA - 100, 2600, "remove_tag", [config.tagRemoverNoFim], idDelay));
  nodes.push(noDelayMinutos(idDelay, X_LISTA - 100, 2950, config.delayLembreteMinutos, idCond));
  nodes.push(noCondicionalClicou(idCond, X_LISTA - 100, 3300, pessoa.tagsCondicionalClicou, idLembrete));
  nodes.push(noTexto(idLembrete, X_LISTA - 100, 3850, t.lembrete));

  // UMA ÚNICA mensagem de lista com todas as seções, já ligada na cauda.
  const primeiraSemana = semanasComCursos[0].semana;
  const ultimaSemana = semanasComCursos[semanasComCursos.length - 1].semana;
  const idLista = novoId();
  nodes.push(noListaMultiSecoes(idLista, X_LISTA, 0, {
    corpo: t.corpoLista,
    rodape: preencher(t.rodapeLista, {
      inicio: dataCurta(primeiraSemana),
      fim: sextaDaSemana(ultimaSemana),
    }),
    cta: t.botaoLista,
    secoes,
    sonId: idRemove,
  }));

  // Entrada do fluxo.
  const idEntrada = novoId();
  nodes.push(noAcaoTag(idEntrada, 100, 0, "add_tag", pessoa.tagsEntrada, idLista));

  return {
    fluxo: {
      connectionId: config.connectionId,
      connectionType: "whatsapp",
      data: nodes,
      customFieldsToCreate: {},
    },
    idEntrada,
    avisos,
    totalCursos: indiceRamo,
    totalListas: 1,
    totalSecoes: secoes.length,
  };
}
