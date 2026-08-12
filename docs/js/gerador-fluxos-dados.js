//  gerador-fluxos-dados.js
//  Porte de src/firebase_client.py para o Firestore client-side do Cess-Hub.
//
//  Busca aberturas por semana e enriquece congressos com nome extenso,
//  exatamente como o backend Python fazia — mas usando o SDK web já
//  presente no Cess-Hub (autenticado, protegido pelas regras do Firestore).
//  A chave secreta de serviço NÃO é usada aqui: o acesso é o mesmo das
//  demais páginas do Hub (Auth + firestore.rules).
import { db } from './firebase-config.js?v=11';
import {
  collection, query, where, limit, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

function normalizarSigla(sigla) {
  return String(sigla == null ? "" : sigla).trim().toUpperCase();
}

function normalizarTipoAbertura(valor) {
  const tipo = String(valor == null ? "" : valor).trim().toLowerCase();
  if (tipo === "retomada") return "retomada";
  if (tipo === "retroativo" || tipo === "super chance retroativo") return "retroativo";
  return "normal";
}

function extrairSiglaDoNomeCurto(nomeCurto) {
  // Ex.: "1° COPEC" / "1º COVET" -> "COPEC" / "COVET"
  let texto = String(nomeCurto == null ? "" : nomeCurto).trim();
  if (!texto) return "";
  texto = texto.replace(/^\s*\d+\s*[°ºªoO]?\s*/, "").trim();
  texto = texto.split("-")[0].trim();
  const partes = texto.split(/\s+/);
  return normalizarSigla(partes.length ? partes[0] : texto);
}

function montarNomeWhatsapp(nomeCurto, nomeExtenso) {
  nomeCurto = String(nomeCurto == null ? "" : nomeCurto).trim();
  nomeExtenso = String(nomeExtenso == null ? "" : nomeExtenso).trim();
  if (!nomeCurto || !nomeExtenso) return nomeCurto;

  const curtoNorm = nomeCurto.toLowerCase();
  const extensoNorm = nomeExtenso.toLowerCase();
  if (extensoNorm.includes(curtoNorm) || curtoNorm.includes(extensoNorm)) return nomeCurto;

  return `${nomeCurto} - ${nomeExtenso}`;
}

async function buscarCongressoPorSigla(sigla, cacheCongressos) {
  const siglaNorm = normalizarSigla(sigla);
  if (!siglaNorm) return null;
  if (siglaNorm in cacheCongressos) return cacheCongressos[siglaNorm];

  // No CESS-Hub, o documento do congresso costuma ser a sigla em minúsculo.
  const docRef = doc(db, "congressos", siglaNorm.toLowerCase());
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const dados = docSnap.data();
    cacheCongressos[siglaNorm] = dados;
    return dados;
  }

  // Fallback: busca por campo sigla.
  const q = query(collection(db, "congressos"), where("sigla", "==", siglaNorm), limit(1));
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const dados = d.data();
    cacheCongressos[siglaNorm] = dados;
    return dados;
  }

  cacheCongressos[siglaNorm] = null;
  return null;
}

function normalizarChaveCurso(valor) {
  return String(valor == null ? "" : valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}


function resolverPdfFluxo3(abertura, materiais = {}) {
  const nomeItem = String(abertura?.nomeCurso || "").trim();
  const tituloInformado = String(
    abertura?.tituloPdf || abertura?.tituloPDF || ""
  ).trim();

  // A mensagem "Aqui está seu manual" do Fluxo 3 sempre envia o Volume 3.
  // E-book e bônus são materiais diferentes e não podem ser usados como
  // substitutos, pois isso faria o gerador anexar o arquivo errado.
  const volume3 = materiais?.volume3 || abertura?.volume3 || {};
  const linkVolume3 = String(volume3?.link || "").trim();
  if (linkVolume3) {
    return {
      link: linkVolume3,
      nome: String(volume3?.nome || tituloInformado || `Volume 3 - ${nomeItem}`).trim(),
      origem: "materiais.volume3.link",
    };
  }

  return { link: "", nome: tituloInformado, origem: "" };
}

async function buscarCursoDaAbertura(abertura, cacheCursos) {
  const cursoId = String(abertura.cursoId || "").trim();
  const nomeCurso = String(abertura.nomeCurso || "").trim();
  const codigoAbertura = String(abertura.codigoAbertura || "").trim();

  const chaveCache = cursoId
    ? `id:${cursoId}`
    : nomeCurso
      ? `nome:${normalizarChaveCurso(nomeCurso)}`
      : `abertura:${codigoAbertura}`;

  if (chaveCache in cacheCursos) return cacheCursos[chaveCache];

  // 1) Caminho principal: cursoId é o ID real do documento salvo na abertura.
  if (cursoId) {
    const docRef = doc(db, "cursos", cursoId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const dados = { id: docSnap.id, ...docSnap.data() };
      cacheCursos[chaveCache] = dados;
      return dados;
    }

    // 2) Compatibilidade: algumas bases usam o código do curso em cursoId.
    const qCodigo = query(collection(db, "cursos"), where("codigo", "==", cursoId), limit(1));
    const snapCodigo = await getDocs(qCodigo);
    for (const d of snapCodigo.docs) {
      const dados = { id: d.id, ...d.data() };
      cacheCursos[chaveCache] = dados;
      return dados;
    }
  }

  // 3) Aberturas antigas podem não ter cursoId. O nome do curso já existia
  // nelas e é suficiente para localizar o documento atual de cursos.
  if (nomeCurso) {
    const qNome = query(collection(db, "cursos"), where("nome", "==", nomeCurso), limit(1));
    const snapNome = await getDocs(qNome);
    for (const d of snapNome.docs) {
      const dados = { id: d.id, ...d.data() };
      cacheCursos[chaveCache] = dados;
      return dados;
    }
  }

  // 4) Último fallback para reaberturas antigas: tenta o código base sem r1/r2/...
  const codigoBase = codigoAbertura.replace(/r\d+$/i, "");
  if (codigoBase) {
    const qCodigoBase = query(collection(db, "cursos"), where("codigo", "==", codigoBase), limit(1));
    const snapCodigoBase = await getDocs(qCodigoBase);
    for (const d of snapCodigoBase.docs) {
      const dados = { id: d.id, ...d.data() };
      cacheCursos[chaveCache] = dados;
      return dados;
    }
  }

  cacheCursos[chaveCache] = null;
  return null;
}

async function enriquecerAberturaCurso(abertura, cacheCursos) {
  const origem = String(abertura.origem || "").trim().toLowerCase();
  if (origem === "congresso") return abertura;

  const curso = await buscarCursoDaAbertura(abertura, cacheCursos);
  if (!curso) return abertura;

  // O cadastro de cursos é a fonte de verdade para o Volume 3 enviado no F3.
  const materiaisCurso = curso.materiais || {};
  const pdfFluxo3 = resolverPdfFluxo3(abertura, materiaisCurso);

  abertura.cursoMateriais = materiaisCurso;
  abertura.pdfFluxo3 = pdfFluxo3;
  abertura.linkEbook = pdfFluxo3.link;
  abertura.tituloPdf = pdfFluxo3.nome;
  abertura.cursoCodigo = curso.codigo || abertura.cursoId || "";
  abertura.cursoDocumentoId = curso.id || abertura.cursoId || "";

  return abertura;
}

async function buscarEdicaoDaAbertura(abertura, cacheEdicoes) {
  const edicaoId = String(abertura.edicaoId || "").trim();
  const nomeCurso = String(abertura.nomeCurso || "").trim();
  const codigoAbertura = String(abertura.codigoAbertura || abertura.id || "").trim();
  const sigla = normalizarSigla(
    abertura.congressoSigla || extrairSiglaDoNomeCurto(nomeCurso)
  );
  const numeroNome = (nomeCurso.match(/^\s*(\d+)/) || [])[1] || "";

  const chaveCache = edicaoId
    ? `id:${edicaoId}`
    : codigoAbertura
      ? `codigo:${codigoAbertura}`
      : nomeCurso
        ? `nome:${normalizarChaveCurso(nomeCurso)}`
        : `sigla:${sigla}:${numeroNome}`;

  if (chaveCache in cacheEdicoes) return cacheEdicoes[chaveCache];

  // 1) Caminho atual: a abertura possui o ID real da edição.
  if (edicaoId) {
    const snap = await getDoc(doc(db, "edicoes", edicaoId));
    if (snap.exists()) {
      const dados = { id: snap.id, ...snap.data() };
      cacheEdicoes[chaveCache] = dados;
      return dados;
    }

    // Compatibilidade com registros que guardaram o código da edição no campo edicaoId.
    const qCodigoEdicao = query(
      collection(db, "edicoes"),
      where("codigo", "==", edicaoId),
      limit(1)
    );
    const snapCodigoEdicao = await getDocs(qCodigoEdicao);
    for (const d of snapCodigoEdicao.docs) {
      const dados = { id: d.id, ...d.data() };
      cacheEdicoes[chaveCache] = dados;
      return dados;
    }
  }

  // 2) Aberturas antigas podem não possuir edicaoId. O nome curto da edição
  // (ex.: "1º COPEC") continua salvo e permite localizar a edição atual.
  if (nomeCurso) {
    const qNome = query(
      collection(db, "edicoes"),
      where("nome", "==", nomeCurso),
      limit(1)
    );
    const snapNome = await getDocs(qNome);
    for (const d of snapNome.docs) {
      const dados = { id: d.id, ...d.data() };
      cacheEdicoes[chaveCache] = dados;
      return dados;
    }
  }

  // 3) O código de abertura de congresso nasce do código da edição e recebe
  // apenas o sufixo r1/r2/... nas reaberturas.
  const codigoBase = codigoAbertura.replace(/r\d+$/i, "");
  if (codigoBase) {
    const qCodigoBase = query(
      collection(db, "edicoes"),
      where("codigo", "==", codigoBase),
      limit(1)
    );
    const snapCodigoBase = await getDocs(qCodigoBase);
    for (const d of snapCodigoBase.docs) {
      const dados = { id: d.id, ...d.data() };
      cacheEdicoes[chaveCache] = dados;
      return dados;
    }
  }

  // 4) Último fallback: sigla + número da edição. Evita depender de um ID
  // que não existia nas aberturas antigas.
  if (sigla) {
    const qSigla = query(
      collection(db, "edicoes"),
      where("congressoSigla", "==", sigla)
    );
    const snapSigla = await getDocs(qSigla);
    for (const d of snapSigla.docs) {
      const dados = { id: d.id, ...d.data() };
      const numeroEdicao = String(dados.numero || "").trim();
      const nomeEdicao = String(dados.nome || "").trim();
      if (
        !numeroNome
        || numeroEdicao === numeroNome
        || normalizarChaveCurso(nomeEdicao) === normalizarChaveCurso(nomeCurso)
      ) {
        cacheEdicoes[chaveCache] = dados;
        return dados;
      }
    }
  }

  cacheEdicoes[chaveCache] = null;
  return null;
}

async function enriquecerAberturaCongresso(abertura, cacheEdicoes, cacheCongressos) {
  const origem = String(abertura.origem || "").trim().toLowerCase();
  const primeiroChar = String(abertura.nomeCurso || "").charAt(0);
  const pareceCongresso = Boolean(abertura.edicaoId) || /\d/.test(primeiroChar);

  if (origem !== "congresso" && !pareceCongresso) {
    if (abertura.nomeCursoWhatsapp == null) abertura.nomeCursoWhatsapp = abertura.nomeCurso || "";
    if (abertura.nomeCursoCompleto == null) abertura.nomeCursoCompleto = abertura.nomeCurso || "";
    return abertura;
  }

  let nomeCurto = abertura.nomeCurso || "";
  let nomeExtenso = abertura.nomeCongresso || "";
  let sigla = abertura.congressoSigla || "";

  if (!sigla) sigla = extrairSiglaDoNomeCurto(nomeCurto);

  const edicao = await buscarEdicaoDaAbertura(abertura, cacheEdicoes);

  if (edicao) {
    // Mantém a abertura enriquecida com o ID real encontrado. Isso é só em
    // memória durante a geração; não altera o documento salvo no Firestore.
    abertura.edicaoId = abertura.edicaoId || edicao.id || null;
    sigla = sigla || edicao.congressoSigla || "";
    nomeCurto = nomeCurto || edicao.nome || "";
    nomeExtenso = nomeExtenso || edicao.nomeCongresso || edicao.congressoNome || "";

    // Para congressos, o Volume 3 atual pertence ao cadastro da edição.
    const materiaisEdicao = edicao.materiais || {};
    const pdfFluxo3 = resolverPdfFluxo3(abertura, materiaisEdicao);

    abertura.cursoMateriais = materiaisEdicao;
    abertura.pdfFluxo3 = pdfFluxo3;
    abertura.linkEbook = pdfFluxo3.link;
    abertura.tituloPdf = pdfFluxo3.nome;
  }

  if (sigla && !nomeExtenso) {
    const congresso = await buscarCongressoPorSigla(sigla, cacheCongressos);
    if (congresso) {
      nomeExtenso = congresso.nome || nomeExtenso;
      sigla = sigla || congresso.sigla || "";
    }
  }

  let nomeWhatsapp = abertura.nomeCursoWhatsapp || abertura.nomeCursoCompleto;
  nomeWhatsapp = nomeWhatsapp || montarNomeWhatsapp(nomeCurto, nomeExtenso);

  abertura.congressoSigla = normalizarSigla(sigla) || abertura.congressoSigla;
  abertura.nomeCongresso = nomeExtenso || abertura.nomeCongresso;
  abertura.nomeCursoCompleto = nomeWhatsapp || nomeCurto;
  abertura.nomeCursoWhatsapp = nomeWhatsapp || nomeCurto;

  return abertura;
}

// Busca as aberturas de uma data e, quando informado, filtra pelo tipo especial.
export async function buscarAberturasPorSemana(semana, tipoAbertura = null) {
  const q = query(collection(db, "aberturas"), where("semana", "==", semana));
  const snap = await getDocs(q);

  const cacheCursos = {};
  const cacheEdicoes = {};
  const cacheCongressos = {};
  const aberturas = [];
  const tipoFiltro = tipoAbertura ? normalizarTipoAbertura(tipoAbertura) : null;

  for (const d of snap.docs) {
    let abertura = d.data();
    const tipoDocumento = normalizarTipoAbertura(abertura.tipoAbertura || abertura.tipo);

    if (tipoFiltro && tipoDocumento !== tipoFiltro) continue;

    abertura.id = d.id;
    abertura.tipoAbertura = tipoDocumento;
    abertura = await enriquecerAberturaCurso(abertura, cacheCursos);
    abertura = await enriquecerAberturaCongresso(abertura, cacheEdicoes, cacheCongressos);
    aberturas.push(abertura);
  }

  return aberturas;
}

// Busca um curso pela coleção "cursos" via campo "codigo" (usado no Instagram).
export async function buscarCursoPorCodigo(codigo) {
  const q = query(collection(db, "cursos"), where("codigo", "==", codigo), limit(1));
  const snap = await getDocs(q);
  for (const d of snap.docs) return d.data();
  return null;
}

// Resolve o número usado como gatilho/nome do fluxo de Instagram.
// Curso: campo `numero` da coleção cursos.
// Congresso: campo `numero` do CONGRESSO (coleção congressos), não o da edição.
export async function buscarNumeroFluxo(abertura) {
  const origem = String(abertura?.origem || "").trim().toLowerCase();
  const ehCongresso = origem === "congresso"
    || Boolean(abertura?.edicaoId || abertura?.congressoSigla);

  if (ehCongresso) {
    const cacheEdicoes = {};
    let sigla = normalizarSigla(abertura?.congressoSigla || "");

    if (!sigla) {
      const edicao = await buscarEdicaoDaAbertura(abertura, cacheEdicoes);
      sigla = normalizarSigla(edicao?.congressoSigla || "");
    }
    if (!sigla) sigla = extrairSiglaDoNomeCurto(abertura?.nomeCurso || "");
    if (!sigla) return "";

    const congresso = await buscarCongressoPorSigla(sigla, {});
    return congresso ? String(congresso.numero ?? congresso.codigo ?? "").trim() : "";
  }

  const curso = await buscarCursoDaAbertura(abertura, {});
  return curso ? String(curso.numero ?? curso.codigo ?? "").trim() : "";
}
