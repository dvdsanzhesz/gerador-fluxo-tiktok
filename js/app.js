//  app.js — Gerador do Fluxo "/cursos" do TikTok (versão independente)
//  Login com o e-mail/senha do CESS Hub + geração do fluxo pro UnniChat.
import { auth } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { buscarAberturasPorSemana } from './gerador-fluxos-dados.js';
import {
  montarFluxoTiktok,
  identificarTipoEvento,
  dataCurta,
  CONFIG_TIKTOK,
  PESSOAS,
} from './gerador-tiktok-core.js';

const $ = (id) => document.getElementById(id);

// Versão do gerador — aparece na tela pra sabermos qual arquivo está rodando.
const VERSAO = 'v8';

// ————— Regra do TikTok: quem já estava na semana anterior fica FORA —————
// Um curso/congresso não entra no fluxo se:
//  a) é reabertura pelo cadastro (campo `tipo` = 'reabertura' ou código com rN
//     depois de um número, ex.: condir1r1 ✔ / condir1 ✘ — o "r" é do nome); OU
//  b) o MESMO curso/edição também aparece nas aberturas da SEMANA ANTERIOR
//     (é assim que pegamos os congressos de semana seguida, que no Hub não
//     levam r1 nem tipo 'reabertura').
function ehReabertura(abertura) {
  const tipo = String(abertura?.tipo || '').trim().toLowerCase();
  if (tipo === 'reabertura') return true;
  const codigo = String(abertura?.codigoAbertura || abertura?.id || '').trim();
  return /(?<=\d)r\d+$/i.test(codigo);
}

function normalizarChave(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// Identidades de uma abertura, para comparar entre semanas.
function chavesAbertura(a) {
  const chaves = [];
  if (a?.cursoId) chaves.push(`curso:${normalizarChave(a.cursoId)}`);
  if (a?.edicaoId) chaves.push(`edicao:${normalizarChave(a.edicaoId)}`);
  const nome = normalizarChave(a?.nomeCurso);
  if (nome) chaves.push(`nome:${nome}`);
  const base = normalizarChave(a?.codigoAbertura || a?.id).replace(/(?<=\d)r\d+$/i, '');
  if (base) chaves.push(`codigo:${base}`);
  return chaves;
}

// Cursos do México ficam FORA do fluxo do TikTok (Brasil).
// Identificação: código começando com "mx" (padrão do Hub) ou categoria México.
function ehMexico(a) {
  const codigo = normalizarChave(a?.codigoAbertura || a?.cursoCodigo || a?.cursoId || a?.id);
  if (codigo.startsWith('mx')) return true;
  return normalizarChave(a?.categoria).includes('mexico');
}

function semanaAnteriorDe(semana) {
  const [d, m, a] = String(semana || '').split('/').map(Number);
  const data = new Date(a, m - 1, d - 7);
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${data.getFullYear()}`;
}

const estado = {
  modo: null,
  pessoa: 'nicole',   // "nicole" | "alyne" — muda somente as tags do fluxo
  referencia: null,
  semanas: [],
  resultado: null,
};

//  ————— Datas —————
function segundaFeira(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function formatarSemana(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function somarDias(date, dias) {
  const d = new Date(date);
  d.setDate(d.getDate() + dias);
  return d;
}

function modoAutomatico() {
  return new Date().getDay() === 3 ? 'quarta' : 'segunda';
}

function semanasDoModo(modo, referencia) {
  const base = segundaFeira(referencia);
  const offsets = modo === 'segunda' ? [0, 7, 14] : [7, 14];
  const rotulos = modo === 'segunda'
    ? ['Semana atual (em aula)', '1ª divulgação', '2ª divulgação']
    : ['1ª divulgação', '2ª divulgação'];
  return offsets.map((off, i) => ({
    semana: formatarSemana(somarDias(base, off)),
    rotulo: rotulos[i],
  }));
}

//  ————— Login —————
function initLogin() {
  onAuthStateChanged(auth, (user) => {
    $('tela-login').style.display = user ? 'none' : 'flex';
    $('tela-app').style.display = user ? 'block' : 'none';
    if (user) $('usuario-logado').textContent = user.email;
  });

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('login-erro');
    msg.textContent = '';
    try {
      await signInWithEmailAndPassword(auth, $('login-email').value.trim(), $('login-senha').value);
    } catch (err) {
      console.error(err);
      const codigo = err?.code || err?.message || 'erro desconhecido';
      const dicas = {
        'auth/invalid-credential': 'E-mail ou senha incorretos (os mesmos do CESS Hub).',
        'auth/invalid-email': 'O e-mail digitado não é válido.',
        'auth/user-disabled': 'Este usuário está desativado no Hub.',
        'auth/too-many-requests': 'Muitas tentativas — espere alguns minutos e tente de novo.',
        'auth/network-request-failed': 'Falha de rede — confira sua internet ou se algum bloqueador está ativo.',
      };
      msg.textContent = `${dicas[codigo] || 'Não consegui entrar.'} [código: ${codigo}]`;
    }
  });

  $('btn-sair').addEventListener('click', () => signOut(auth));
}

//  ————— UI do gerador —————
function status(msg, tipo = 'info') {
  const el = $('tk-status');
  el.textContent = msg;
  el.className = `status ${tipo}`;
  el.style.display = msg ? 'block' : 'none';
}

function renderControles() {
  const base = segundaFeira(estado.referencia || new Date());
  $('tk-data-ref').value = base.toISOString().slice(0, 10);

  document.querySelectorAll('.tk-modo').forEach((btn) => {
    btn.classList.toggle('ativo', btn.dataset.modo === estado.modo);
  });

  document.querySelectorAll('.tk-pessoa').forEach((btn) => {
    btn.classList.toggle('ativo', btn.dataset.pessoa === estado.pessoa);
  });

  $('tk-semanas-preview').innerHTML = semanasDoModo(estado.modo, base)
    .map((s) => `<span class="chip-semana"><strong>${s.rotulo}:</strong> ${s.semana}</span>`)
    .join('');
}

async function buscarCursos() {
  const base = new Date(`${$('tk-data-ref').value}T12:00:00`);
  if (Number.isNaN(base.getTime())) {
    status('❌ Escolha uma data de referência válida.', 'error');
    return;
  }
  estado.referencia = base;

  const defs = semanasDoModo(estado.modo, base);
  status('Buscando aberturas no calendário...', 'info');
  $('tk-btn-buscar').disabled = true;
  $('tk-geracao').style.display = 'none';
  $('tk-download').style.display = 'none';

  try {
    estado.semanas = [];

    // Busca cada semana só uma vez (as semanas do fluxo + a anterior de cada uma).
    const cacheSemanas = new Map();
    const obterSemana = async (sem) => {
      if (!cacheSemanas.has(sem)) {
        cacheSemanas.set(sem, await buscarAberturasPorSemana(sem, 'normal'));
      }
      return cacheSemanas.get(sem);
    };

    for (const def of defs) {
      const aberturas = await obterSemana(def.semana);

      // Identidades de tudo que rodou na SEMANA ANTERIOR.
      const anteriores = await obterSemana(semanaAnteriorDe(def.semana));
      const chavesAnterior = new Set();
      for (const ant of anteriores) {
        for (const chave of chavesAbertura(ant)) chavesAnterior.add(chave);
      }

      // Marca cada abertura: fora por padrão se é do México, reabertura
      // ou repete a semana anterior.
      for (const a of aberturas) {
        const mexico = ehMexico(a);
        const reab = ehReabertura(a);
        const repetida = chavesAbertura(a).some((chave) => chavesAnterior.has(chave));
        a._foraPorPadrao = mexico || reab || repetida;
        a._motivoFora = mexico
          ? '🇲🇽 curso do México'
          : (reab ? '🔁 reabertura' : (repetida ? '↩️ já estava na semana anterior' : ''));
      }

      estado.semanas.push({
        ...def,
        aberturas,
        selecionados: new Set(
          aberturas
            .filter((a) => !a._foraPorPadrao)
            .map((a) => (a.nomeCurso || '').trim())
            .filter(Boolean)
        ),
      });
    }

    const total = estado.semanas.reduce((s, g) => s + g.aberturas.length, 0);
    if (!total) {
      status('❌ Nenhuma abertura encontrada para essas semanas.', 'error');
      return;
    }
    const foraTotal = estado.semanas.reduce(
      (s, g) => s + g.aberturas.filter((a) => a._foraPorPadrao).length, 0
    );
    status(`✅ ${total} curso(s) encontrado(s) — ${foraTotal} fora por padrão (México/reabertura/semana anterior). [${VERSAO}]`, 'success');
    renderSelecao();
  } catch (e) {
    console.error('[Gerador TikTok]', e);
    status(`❌ Erro ao buscar dados: ${e.message}`, 'error');
  } finally {
    $('tk-btn-buscar').disabled = false;
  }
}

function renderSelecao() {
  const wrap = $('tk-geracao');
  wrap.style.display = 'block';
  wrap.innerHTML = `
    <h2>Cursos por semana</h2>
    <p class="hint">Clique em um curso para tirar/voltar da lista. Todos entram por padrão.</p>
    <div id="tk-grupos"></div>
    <button id="tk-btn-gerar" class="btn btn-primario btn-largo">🏗️ Gerar Fluxo do TikTok</button>
  `;

  const grupos = $('tk-grupos');
  estado.semanas.forEach((grupo) => {
    // Reaberturas, México e repetidos da semana anterior nem aparecem como opção.
    const visiveis = grupo.aberturas.filter((a) => !a._foraPorPadrao);
    const ocultos = grupo.aberturas.length - visiveis.length;

    const bloco = document.createElement('div');
    bloco.className = 'grupo';
    bloco.innerHTML = `
      <div class="grupo-titulo">${grupo.rotulo} — semana ${dataCurta(grupo.semana)}
        <small>(${visiveis.length} curso(s)${ocultos ? ` · ${ocultos} oculto(s): México/reabertura/semana anterior` : ''})</small></div>
      <div class="chips"></div>
    `;
    const chips = bloco.querySelector('.chips');
    if (!visiveis.length) {
      chips.innerHTML = '<em class="vazio">Nenhum curso novo para esta semana.</em>';
    }
    visiveis.forEach((abertura) => {
      const nome = (abertura.nomeCurso || '').trim();
      if (!nome) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip ativo';
      chip.textContent = `${nome} · ${abertura.contaAPI || 'sem conta'}`;
      // Passe o mouse no chip pra ver o código — ajuda a investigar intrusos.
      chip.title = `código: ${abertura.codigoAbertura || abertura.id || '?'} · semana: ${abertura.semana || '?'}`;
      chip.addEventListener('click', () => {
        if (grupo.selecionados.has(nome)) {
          grupo.selecionados.delete(nome);
          chip.classList.remove('ativo');
        } else {
          grupo.selecionados.add(nome);
          chip.classList.add('ativo');
        }
      });
      chips.appendChild(chip);
    });
    grupos.appendChild(bloco);
  });

  $('tk-btn-gerar').addEventListener('click', gerar);
}

function gerar() {
  try {
    const semanas = estado.semanas
      .map((grupo) => ({
        semana: grupo.semana,
        cursos: grupo.aberturas
          .filter((a) => grupo.selecionados.has((a.nomeCurso || '').trim()))
          .map((a) => ({
            nomeCurso: (a.nomeCurso || '').trim(),
            tipoEvento: identificarTipoEvento(a),
            contaAPI: a.contaAPI || '',
            nomeWhatsapp: a.nomeCursoWhatsapp || a.nomeCursoCompleto || a.nomeCurso || '',
          })),
      }))
      .filter((g) => g.cursos.length);

    const pessoa = PESSOAS[estado.pessoa] || PESSOAS.nicole;
    const resultado = montarFluxoTiktok(semanas, CONFIG_TIKTOK, pessoa);
    estado.resultado = resultado;

    const avisosHtml = resultado.avisos.length
      ? `<div class="status warning avisos"><strong>Atenção:</strong><ul>${
        resultado.avisos.map((a) => `<li>${a}</li>`).join('')}</ul></div>`
      : '';

    const wrap = $('tk-download');
    wrap.style.display = 'block';
    wrap.innerHTML = `
      <h2>Pronto!</h2>
      <div class="status success">✅ Fluxo da ${pessoa.nome} gerado: ${resultado.totalCursos} curso(s) em
        ${resultado.totalListas} lista(s) encadeada(s), cada uma com seu texto. Tags: ${pessoa.tagClicou}</div>
      ${avisosHtml}
      <div class="acoes">
        <button id="tk-btn-copiar" class="btn btn-primario">📋 Copiar para colar no UnniChat</button>
        <button id="tk-btn-baixar" class="btn">⬇️ Baixar .json</button>
      </div>
      <p class="hint">No UnniChat: abra o fluxo "/cursos" do TikTok, apague os nós antigos
        (menos o gatilho inicial), clique no quadro e cole (Ctrl+V). Depois ligue o gatilho
        inicial ao nó de entrada (o que adiciona as tags "Fluxo de inscrição" +
        "[NICOLE] - TIKTOK /CURSOS").</p>
    `;

    const jsonTexto = JSON.stringify(resultado.fluxo);

    $('tk-btn-copiar').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(jsonTexto);
        status('📋 Copiado! Agora é só colar no editor de fluxos do UnniChat.', 'success');
      } catch {
        status('❌ Não consegui copiar automaticamente — use o botão de baixar.', 'error');
      }
    });

    $('tk-btn-baixar').addEventListener('click', () => {
      const nome = `fluxo_tiktok_${estado.pessoa}_${estado.modo}_${dataCurta(estado.semanas[0].semana).split('/').join('-')}.json`;
      const blob = new Blob([JSON.stringify(resultado.fluxo, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: nome }).click();
      URL.revokeObjectURL(url);
    });
  } catch (e) {
    console.error('[Gerador TikTok]', e);
    status(`❌ Erro ao gerar: ${e.message}`, 'error');
  }
}

//  ————— Boot —————
function init() {
  const badge = $('tk-versao');
  if (badge) badge.textContent = `gerador ${VERSAO}`;

  initLogin();

  estado.modo = modoAutomatico();
  estado.referencia = new Date();

  document.querySelectorAll('.tk-modo').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.modo = btn.dataset.modo;
      renderControles();
    });
  });

  document.querySelectorAll('.tk-pessoa').forEach((btn) => {
    btn.addEventListener('click', () => {
      estado.pessoa = btn.dataset.pessoa;
      renderControles();
    });
  });

  $('tk-data-ref').addEventListener('change', () => {
    const valor = new Date(`${$('tk-data-ref').value}T12:00:00`);
    if (!Number.isNaN(valor.getTime())) {
      estado.referencia = valor;
      renderControles();
    }
  });

  $('tk-btn-buscar').addEventListener('click', buscarCursos);
  renderControles();
}

document.addEventListener('DOMContentLoaded', init);
