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

//  Versão deste arquivo — a página mostra na tela pra confirmar que não é cache.
export const VERSAO_CORE = 'v11';

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
    corpoPrimeiraLista:
      "Olá! Que bom saber que você está querendo se aprimorar. Parabéns pelo primeiro passo!\n\n"
      + "Temos muitos cursos que estão gratuitos.\n\n"
      + "O próximo passo é escolher qual curso vai fazer:",
    corpoOutrasListas:
      "E aqui tem mais alguns cursos com inscrições abertas...\n\n"
      + "Estes ocorrerão na semana {semana}👇",
    rodapePrimeiraLista: "Estes cursos terão aulas entre {inicio} e {fim}",
    rodapeOutrasListas: "Aulas entre {inicio} e {fim}",
    tituloSecao: "Cursos que começam {semana}",
    // Usado quando tudo vai numa mensagem só (uma seção com todos os cursos).
    tituloSecaoUnica: "Cursos com inscrições abertas",
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

// O WhatsApp limita o título da linha da lista a 24 caracteres.
// Em vez de cortar com "…", abrevia as palavras grandes (mantendo a última):
// "Suplementação e Nutrição Esportiva" -> "Supl. e Nutr. Esportiva"
const PALAVRAS_PEQUENAS = new Set([
  "e", "de", "da", "do", "das", "dos", "a", "o", "à", "ao", "na", "no",
  "nas", "nos", "em", "com", "para", "por", "y", "en", "la", "el",
]);

function tituloLinhaLista(nome) {
  const texto = String(nome || "").trim();
  if (texto.length <= 24) return texto;

  const palavras = texto.split(/\s+/);

  // Abrevia da maior pra menor quantidade de letras, preservando a última palavra.
  for (let corte = 6; corte >= 3; corte--) {
    const tentativa = palavras.map((p, i) => {
      if (i === palavras.length - 1) return p;            // última fica inteira
      if (PALAVRAS_PEQUENAS.has(p.toLowerCase())) return p; // "e", "de"... ficam
      if (p.length <= corte + 1) return p;
      return `${p.slice(0, corte)}.`;
    }).join(" ");
    if (tentativa.length <= 24) return tentativa;
  }

  // Nome muito longo: abrevia a última palavra também.
  const tudoAbreviado = palavras.map((p) => {
    if (PALAVRAS_PEQUENAS.has(p.toLowerCase())) return p;
    return p.length > 5 ? `${p.slice(0, 4)}.` : p;
  }).join(" ");
  if (tudoAbreviado.length <= 24) return tudoAbreviado;

  // Ainda não coube: remove as palavrinhas ("de", "da", "e", hífens...) e tenta de novo.
  const soGrandes = palavras.filter(
    (p) => !PALAVRAS_PEQUENAS.has(p.toLowerCase()) && /[a-zà-ú]/i.test(p)
  );
  for (let corte = 5; corte >= 3; corte--) {
    const tentativa = soGrandes.map((p, i) => {
      // Última palavra fica inteira enquanto der; no aperto máximo, abrevia também.
      if (i === soGrandes.length - 1 && p.length <= 8 && corte > 3) return p;
      if (p.length <= corte + 1) return p;
      return `${p.slice(0, corte)}.`;
    }).join(" ");
    if (tentativa.length <= 24) return tentativa;
  }

  return `${tudoAbreviado.slice(0, 23)}…`;
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

//  Mensagem de lista de UMA semana (texto próprio + uma seção com os cursos).
//  As listas das semanas são ligadas em corrente pelo sonId (conexão normal,
//  que comprovadamente sobrevive ao colar no UnniChat).
function noListaSemana(id, x, y, { corpo, rodape, cta, tituloSecao, linhas, sonId }) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "message", tag: "message", icon: "", color: "transparent" };
  node.data.sonId = sonId;
  const msg = mensagemBase();
  msg.messageType = "message-list";
  msg.listComponents = { body: corpo, footer: rodape, cta };
  msg.sections = [{
    id: novoId(),
    title: tituloSecao,
    rows: linhas.map(({ titulo, sonId: alvo }) => ({ id: novoId(), title: titulo, sonId: alvo })),
  }];
  node.data.message = msg;
  node.width = 345;
  node.height = 800 + linhas.length * 60;
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

// "Aguardar X segundo(s) e depois continuar" — usado DENTRO do bloco de
// mensagens, entre uma lista e outra (igual ao fluxo original).
function noDelaySegundos(id, x, y, segundos) {
  const node = baseNode(id, x, y);
  node.data.type = { id: "delay", tag: "delay", icon: "", color: "transparent" };
  node.data.delay = {
    type: "seconds",
    time: segundos,
    sendAt: null,
    isComercialInterval: false,
    commercialDays: null,
    commercialTimeRange: null,
    sendMessagesIntervalRange: [10, 201],
    sendMessagesIntervalRangeType: "minutes",
  };
  node.height = 120;
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
//  opcoes.formato: "unica" (padrão) = UMA mensagem com UMA seção e todos os
//  cursos juntos; "semana" = uma mensagem por semana, ligadas em corrente.
export function montarFluxoTiktok(semanas, config = CONFIG_TIKTOK, pessoa = PESSOAS.nicole, opcoes = {}) {
  const formato = opcoes.formato === "semana" ? "semana" : "unica";
  const nodes = [];
  const avisos = [];
  const t = config.textos;

  // Layout: cada curso é UMA LINHA horizontal (tag → mensagem, lado a lado),
  // um curso embaixo do outro — igual ao fluxo feito à mão.
  const X_LISTA = 600;
  const X_RAMOS = 1500;          // coluna da ação de tag
  const X_DESTINO = X_RAMOS + 420; // mensagem/encaminhamento à direita da tag
  const ALTURA_LINHA = 420;      // espaço vertical entre um curso e outro

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
      const x = X_RAMOS;
      const y = -600 + indiceRamo * ALTURA_LINHA;
      indiceRamo += 1;

      const idAcao = novoId();
      let idDestino;

      if (conta === config.contaFluxo) {
        // Curso da mesma conta do fluxo: encaminha para a automação de inscrição.
        idDestino = novoId();
        // Padrão real das automações no UnniChat:
        // "Joelho: da Anatomia ao Tratamento - Inscrição - 17/08 (imported)"
        const nomeAutomacao = `${nome} - Inscrição - ${dataCurta(grupo.semana)} (imported)`;
        nodes.push(noEncaminharAutomacao(idDestino, X_DESTINO, y, nomeAutomacao));
        avisos.push(
          `"${nome}" (conta ${conta || "?"}): nó "Encaminhar para automação" gerado com o `
          + `nome "${nomeAutomacao}" — confira no UnniChat se ficou vinculado; se não, `
          + `selecione a automação com esse nome.`
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
        nodes.push(noCtaUrl(idDestino, X_DESTINO, y, {
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
        semana: grupo.semana,
        titulo: preencher(t.tituloSecao, { semana: dataCurta(grupo.semana) }),
        linhas,
      });
    }
  }

  // Cauda: remove tag -> delay -> condicional -> lembrete p/ quem não clicou
  const idRemove = novoId();
  const idDelay = novoId();
  const idCond = novoId();
  const idLembrete = novoId();

  nodes.push(noAcaoTag(idRemove, X_LISTA - 100, 5200, "remove_tag", [config.tagRemoverNoFim], idDelay));
  nodes.push(noDelayMinutos(idDelay, X_LISTA - 100, 5550, config.delayLembreteMinutos, idCond));
  nodes.push(noCondicionalClicou(idCond, X_LISTA - 100, 5900, pessoa.tagsCondicionalClicou, idLembrete));
  nodes.push(noTexto(idLembrete, X_LISTA - 100, 6450, t.lembrete));

  const primeiraSemana = secoes[0].semana;
  const ultimaSemana = secoes[secoes.length - 1].semana;
  let idPrimeiraMensagem;
  let totalListas;

  if (formato === "unica") {
    // UMA mensagem só, com UMA seção contendo TODOS os cursos.
    const todasLinhas = secoes.flatMap((s) => s.linhas);
    const idLista = novoId();
    nodes.push(noListaSemana(idLista, X_LISTA, 0, {
      corpo: t.corpoPrimeiraLista,
      rodape: preencher(t.rodapePrimeiraLista, {
        inicio: dataCurta(primeiraSemana),
        fim: sextaDaSemana(ultimaSemana),
      }),
      cta: t.botaoLista,
      tituloSecao: t.tituloSecaoUnica,
      linhas: todasLinhas,
      sonId: idRemove,
    }));
    idPrimeiraMensagem = idLista;
    totalListas = 1;

    if (todasLinhas.length > 10) {
      avisos.push(
        `A mensagem ficou com ${todasLinhas.length} cursos. O WhatsApp aceita no `
        + `máximo 10 itens por lista — se o envio falhar, troque para "Uma mensagem `
        + `por semana" ou tire alguns cursos.`
      );
    }
  } else {
    // UMA mensagem por semana, com texto próprio, ligadas em corrente (setas).
    const blocos = [];
    let primeira = true;
    for (const secao of secoes) {
      for (let i = 0; i < secao.linhas.length; i += 10) {
        const ehPrimeira = primeira && i === 0;
        blocos.push({
          corpo: ehPrimeira
            ? t.corpoPrimeiraLista
            : preencher(t.corpoOutrasListas, { semana: dataCurta(secao.semana) }),
          rodape: ehPrimeira
            ? preencher(t.rodapePrimeiraLista, { inicio: dataCurta(secao.semana), fim: sextaDaSemana(secao.semana) })
            : preencher(t.rodapeOutrasListas, { inicio: dataCurta(secao.semana), fim: sextaDaSemana(secao.semana) }),
          tituloSecao: secao.titulo,
          linhas: secao.linhas.slice(i, i + 10),
        });
      }
      primeira = false;
    }

    const idsListas = blocos.map(() => novoId());
    blocos.forEach((bloco, i) => {
      nodes.push(noListaSemana(idsListas[i], X_LISTA, i * 1700, {
        corpo: bloco.corpo,
        rodape: bloco.rodape,
        cta: t.botaoLista,
        tituloSecao: bloco.tituloSecao,
        linhas: bloco.linhas,
        sonId: i + 1 < idsListas.length ? idsListas[i + 1] : idRemove,
      }));
    });
    idPrimeiraMensagem = idsListas[0];
    totalListas = blocos.length;
  }

  // Entrada do fluxo.
  const idEntrada = novoId();
  nodes.push(noAcaoTag(idEntrada, 100, 0, "add_tag", pessoa.tagsEntrada, idPrimeiraMensagem));

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
    totalListas,
    totalSecoes: formato === "unica" ? 1 : secoes.length,
    formato,
  };
}
