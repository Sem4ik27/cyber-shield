import { GREETING, RESP, MAIN_QUICK, QUICK } from './data.js';
import { state, store, classify } from './core.js';
import { apiUrl } from './api.js';
import {
  input, addMsg, botSay, cancelReply, showTyping, hideTyping,
  renderQuick, setActive, showAlert, toast, updateStats, clearChat,
  exportChat, setModelStatus
} from './ui.js';
import {
  openQuiz, openReport, openPrivacy, openEmergency
} from './features.js';

const sidebar = document.getElementById('sidebar');
const drawerScroll = document.getElementById('drawerScroll');
const chatEl = document.getElementById('chat');
const chatScrollbar = document.getElementById('chatScrollbar');
const chatThumb = document.getElementById('chatThumb');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const modePill = document.getElementById('modePill');
const modePillLabel = document.getElementById('modePillLabel');
const modeSwitch = document.getElementById('modeSwitch');
const modeHint = document.getElementById('modeHint');

const MODES = ['classic', 'neural', 'reference'];
const MODE_LABELS = { classic: 'Обычный', neural: 'Нейро', reference: 'Справочник' };
const MODE_HINTS = {
  classic: 'Мгновенные проверенные памятки и алгоритмы.',
  neural: 'Свободный диалог с локальной моделью. Медленнее, но гибче.',
  reference: 'Поиск по папке knowledge: статьи УК РФ, памятки и документы.'
};

const SECTION_RESP = {
  fraud: 'fraud',
  bullying: 'bully',
  recruit: 'recruit',
  resources: 'resources'
};

function openSection(view) {
  closeDrawer();
  if (view === 'quiz') return openQuiz();
  if (view === 'report') return openReport();
  if (view === 'privacy') return openPrivacy();
  setActive(view);
  if (view === 'home') {
    botSay(RESP.start, MAIN_QUICK);
    return;
  }
  const key = SECTION_RESP[view] || 'fallback';
  botSay(RESP[key] || RESP.fallback, QUICK[key] || MAIN_QUICK);
}

function runAction(action) {
  closeDrawer();
  if (action === 'quiz') openQuiz();
  else if (action === 'report') openReport();
  else if (action === 'privacy') openPrivacy();
  else if (action === 'emergency') openEmergency();
  else if (action === 'export') exportChat();
  else if (action === 'clear') clearChat();
  else if (action === 'modeClassic') setMode('classic');
  else if (action === 'modeNeural') setMode('neural');
  else if (action === 'modeReference') setMode('reference');
  else if (action === 'knowledgeChoices' && state.knowledge.choices.length) {
    showKnowledgeChoices(state.knowledge.choices, 'Подходящие статьи:');
  }
}

function updateModeUI() {
  const neural = state.mode === 'neural';
  const reference = state.mode === 'reference';
  modePill.classList.toggle('neural', neural);
  modePill.classList.toggle('reference', reference);
  modePillLabel.textContent = MODE_LABELS[state.mode] || MODE_LABELS.classic;
  modeSwitch.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === state.mode);
  });
  modeHint.textContent = MODE_HINTS[state.mode] || MODE_HINTS.classic;
}

function setMode(mode, silent) {
  if (!MODES.includes(mode)) return;
  state.mode = mode;
  store.set('ks_mode', mode);
  updateModeUI();
  if (mode === 'reference') checkKnowledge();
  else checkOllama();
  if (!silent) {
    if (mode === 'neural') toast('Нейро-режим: отвечает локальная модель');
    else if (mode === 'reference') toast('Режим справочника: поиск по документам');
    else toast('Обычный режим: памятки и правила');
  }
}

async function checkOllama() {
  setModelStatus('checking', 'Проверяю нейросеть…');
  state.ollama.status = 'checking';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(apiUrl('api/status'), { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    if (!data.ok) {
      state.ollama = { status: 'down', model: data.model || null, error: data.error };
      setModelStatus('bad', data.error || 'Ollama не запущена');
      return;
    }
    if (!data.available) {
      state.ollama = { status: 'missing', model: data.model, error: null };
      setModelStatus('bad', 'Нет модели ' + data.model);
      return;
    }
    state.ollama = { status: 'ok', model: data.model, error: null };
    setModelStatus('ok', 'Модель: ' + data.model);
  } catch {
    clearTimeout(timer);
    state.ollama = { status: 'down', model: null, error: 'server' };
    setModelStatus('bad', 'Запустите server.py');
  }
}

async function checkKnowledge() {
  setModelStatus('checking', 'Читаю справочник…');
  state.knowledge.status = 'checking';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(apiUrl('api/knowledge'), { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const count = Number(data.count) || 0;
    state.knowledge = { status: 'ok', count, error: null };
    if (count > 0) setModelStatus('ok', 'Документов: ' + count);
    else setModelStatus('bad', 'Папка knowledge пуста');
  } catch {
    clearTimeout(timer);
    state.knowledge = { status: 'down', count: 0, error: 'server' };
    setModelStatus('bad', 'Справочник недоступен');
  }
}

function classicReply(key) {
  botSay(RESP[key] || RESP.fallback, QUICK[key] || MAIN_QUICK);
}

async function neuralReply(text, key) {
  cancelReply();
  showTyping();
  const history = state.log
    .slice(0, -1)
    .filter(msg => msg.role === 'user')
    .slice(-6)
    .map(msg => ({
      role: 'user',
      content: msg.text
    }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(apiUrl('api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) {
      let detail = 'HTTP ' + response.status;
      try {
        const error = await response.json();
        if (error.error) detail = error.error;
      } catch {}
      throw new Error(detail);
    }
    const data = await response.json();
    if (!data.answer) throw new Error('Пустой ответ модели');
    hideTyping();
    addMsg('bot', data.answer.trim(), 'КиберЩит · нейро');
    renderQuick(QUICK[key] || MAIN_QUICK);
    state.ollama = { status: 'ok', model: data.model || state.ollama.model, error: null };
    setModelStatus('ok', 'Модель: ' + (data.model || state.ollama.model || 'готова'));
  } catch (error) {
    clearTimeout(timer);
    hideTyping();
    const reason = error.name === 'AbortError'
      ? 'Модель не ответила вовремя.'
      : 'Нейросеть недоступна.';
    addMsg('bot',
      (RESP[key] || RESP.fallback) + '\n\n' + reason +
      ' Отвечаю по памяткам. Проверьте, что Ollama и server.py запущены.',
      'КиберЩит');
    renderQuick(QUICK[key] || MAIN_QUICK);
    setModelStatus('bad', error.name === 'AbortError' ? 'Модель не ответила' : 'Нейросеть недоступна');
  }
}

function articleLabel(item) {
  if (item.article) {
    let short = item.title.split('—').slice(1).join('—').trim();
    if (!short) short = item.title;
    if (short.length > 34) short = short.slice(0, 33).trim() + '…';
    return 'Ст. ' + item.article + ' — ' + short;
  }
  return item.title;
}

function formatKnowledgeDocument(item) {
  const lines = ['**' + item.title + '**'];
  const sections = Array.isArray(item.sections) ? item.sections : [];
  if (sections.length) {
    sections.forEach(section => {
      lines.push('');
      if (section.title) lines.push('**' + section.title + '**');
      lines.push(section.text);
    });
  } else {
    lines.push('');
    lines.push(item.snippet || 'Текст статьи недоступен.');
  }
  lines.push('');
  lines.push('Краткая справка, не официальный текст статьи.');
  return lines.join('\n');
}

function knowledgeActions() {
  const items = [];
  if (state.knowledge.choices.length > 1) {
    items.push({ label: 'Другие статьи', action: 'knowledgeChoices' });
  }
  items.push({ label: 'Перейти в нейро', action: 'modeNeural' });
  items.push({ label: 'Обычный режим', action: 'modeClassic' });
  items.push({ label: 'В меню', view: 'home' });
  return items;
}

function showKnowledgeChoices(results, intro) {
  const lines = [intro || 'Подходящие статьи:', ''];
  results.forEach((item, index) => {
    lines.push((index + 1) + '. ' + item.title);
  });
  lines.push('');
  lines.push('Выберите статью кнопкой ниже.');
  addMsg('bot', lines.join('\n'), 'КиберЩит · справочник');
  const items = results.map(item => ({
    label: articleLabel(item),
    article: item.id
  }));
  items.push({ label: 'В меню', view: 'home' });
  renderQuick(items);
}

async function fetchArticle(id) {
  const response = await fetch(apiUrl('api/knowledge/doc?id=' + encodeURIComponent(id)));
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function showArticle(document) {
  addMsg('bot', formatKnowledgeDocument(document), 'КиберЩит · справочник');
  renderQuick(knowledgeActions());
}

async function openArticle(id) {
  cancelReply();
  showTyping();
  try {
    const document = await fetchArticle(id);
    hideTyping();
    showArticle(document);
  } catch (error) {
    hideTyping();
    addMsg('bot',
      'Не удалось открыть статью. Проверьте, что server.py запущен и файл не удалён.',
      'КиберЩит · справочник');
    renderQuick([
      { label: 'Перейти в нейро', action: 'modeNeural' },
      { label: 'В меню', view: 'home' }
    ]);
  }
}

async function referenceReply(text) {
  cancelReply();
  showTyping();
  state.knowledge.choices = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(apiUrl('api/search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text, limit: 5 }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (!results.length) {
      hideTyping();
      addMsg('bot',
        'В справочнике не нашёл подходящих документов.\n\n' +
        'Попробуйте назвать номер статьи или ключевые слова: «мошенничество», «кража», «клевета», «угрозы», «вербовка», «вымогательство».\n\n' +
        'Можно переключиться в «Нейро» — он ответит своими словами.',
        'КиберЩит · справочник');
      renderQuick([
        { label: 'Перейти в нейро', action: 'modeNeural' },
        { label: 'В меню', view: 'home' }
      ]);
      return;
    }
    state.knowledge.choices = results;
    if (results.length === 1) {
      const document = await fetchArticle(results[0].id);
      hideTyping();
      showArticle(document);
      return;
    }
    hideTyping();
    showKnowledgeChoices(results, 'Под запрос подходит несколько статей:');
  } catch (error) {
    clearTimeout(timer);
    hideTyping();
    const reason = error.name === 'AbortError'
      ? 'Поиск занял слишком много времени.'
      : 'Справочник недоступен.';
    addMsg('bot',
      reason + ' Проверьте, что server.py запущен, а папка knowledge существует.',
      'КиберЩит · справочник');
    renderQuick([
      { label: 'Перейти в нейро', action: 'modeNeural' },
      { label: 'В меню', view: 'home' }
    ]);
    setModelStatus('bad', 'Справочник недоступен');
  }
}

function sendUser(text) {
  const value = (text || '').trim();
  if (!value) return;
  addMsg('user', value);
  input.value = '';
  input.style.height = 'auto';
  state.stats.messages++;
  updateStats();
  const key = classify(value);
  if (key === 'crisis') showAlert('crisis');
  if (key === 'fraud_lost') showAlert('fraud_lost');
  if (key === 'crisis' || key === 'fraud_lost') {
    classicReply(key);
    return;
  }
  if (state.mode === 'reference') {
    referenceReply(value);
    return;
  }
  if (state.mode === 'neural') {
    if (state.ollama.status === 'down' || state.ollama.status === 'missing') {
      addMsg('bot',
        (RESP[key] || RESP.fallback) +
        '\n\nНейросеть недоступна — отвечаю по памяткам. Запустите Ollama и server.py.',
        'КиберЩит');
      renderQuick(QUICK[key] || MAIN_QUICK);
      checkOllama();
      return;
    }
    neuralReply(value, key);
    return;
  }
  classicReply(key);
}

function openDrawer() {
  drawerScroll.scrollTop = 0;
  sidebar.classList.add('open');
  drawerBackdrop.hidden = false;
}

function closeDrawer() {
  sidebar.classList.remove('open');
  drawerBackdrop.hidden = true;
}

document.getElementById('menuBtn').addEventListener('click', () => {
  if (sidebar.classList.contains('open')) closeDrawer();
  else openDrawer();
});
drawerBackdrop.addEventListener('click', closeDrawer);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);

document.getElementById('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('ks_theme', next);
});

modePill.addEventListener('click', () => {
  const index = MODES.indexOf(state.mode);
  setMode(MODES[(index + 1) % MODES.length]);
});
modeSwitch.querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', () => setMode(btn.dataset.mode));
});

document.querySelectorAll('#nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view) openSection(btn.dataset.view);
    else if (btn.dataset.action) runAction(btn.dataset.action);
  });
});

document.querySelectorAll('[data-action]').forEach(btn => {
  if (btn.closest('#nav')) return;
  btn.addEventListener('click', () => runAction(btn.dataset.action));
});

document.addEventListener('ks:send', event => sendUser(event.detail));
document.addEventListener('ks:navigate', event => openSection(event.detail));
document.addEventListener('ks:action', event => runAction(event.detail));
document.addEventListener('ks:article', event => openArticle(event.detail));

const composer = document.getElementById('composer');
composer.addEventListener('submit', event => {
  event.preventDefault();
  sendUser(input.value);
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendUser(input.value);
  }
});
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 120) + 'px';
});

function setupChatScrollbar() {
  let timer = null;

  function update() {
    const maxScroll = chatEl.scrollHeight - chatEl.clientHeight;
    const trackHeight = chatScrollbar.clientHeight;
    if (maxScroll <= 2 || trackHeight <= 0) {
      chatScrollbar.classList.add('hidden');
      chatThumb.style.transform = 'translate3d(0,0,0)';
      return;
    }
    chatScrollbar.classList.remove('hidden');
    const thumbHeight = Math.max(40, Math.round(trackHeight * 0.5));
    chatThumb.style.height = thumbHeight + 'px';
    const progress = maxScroll > 0 ? chatEl.scrollTop / maxScroll : 0;
    const offset = progress * Math.max(0, trackHeight - thumbHeight);
    chatThumb.style.transform = 'translate3d(0,' + Math.round(offset) + 'px,0)';
  }

  function flash() {
    chatScrollbar.classList.add('active');
    clearTimeout(timer);
    timer = setTimeout(() => chatScrollbar.classList.remove('active'), 900);
  }

  chatEl.addEventListener('scroll', () => {
    update();
    flash();
  }, { passive: true });

  let dragging = false;
  let dragStartY = 0;
  let dragStartScroll = 0;
  let dragTrackHeight = 0;
  let dragThumbHeight = 0;

  chatThumb.addEventListener('pointerdown', event => {
    const trackHeight = chatScrollbar.clientHeight;
    if (trackHeight <= 0) return;
    event.preventDefault();
    dragging = true;
    dragStartY = event.clientY;
    dragStartScroll = chatEl.scrollTop;
    dragTrackHeight = trackHeight;
    dragThumbHeight = parseFloat(chatThumb.style.height) || trackHeight / 2;
    chatThumb.setPointerCapture(event.pointerId);
    flash();
  });

  chatThumb.addEventListener('pointermove', event => {
    if (!dragging) return;
    const maxScroll = chatEl.scrollHeight - chatEl.clientHeight;
    const range = Math.max(1, dragTrackHeight - dragThumbHeight);
    const delta = (event.clientY - dragStartY) / range;
    chatEl.scrollTop = dragStartScroll + delta * maxScroll;
  });

  function endDrag(event) {
    if (!dragging) return;
    dragging = false;
    if (chatThumb.hasPointerCapture(event.pointerId)) {
      chatThumb.releasePointerCapture(event.pointerId);
    }
  }
  chatThumb.addEventListener('pointerup', endDrag);
  chatThumb.addEventListener('pointercancel', endDrag);

  if (window.ResizeObserver) {
    new ResizeObserver(() => requestAnimationFrame(update)).observe(chatEl);
  }
  if (window.MutationObserver) {
    new MutationObserver(() => requestAnimationFrame(update)).observe(chatEl, {
      childList: true,
      subtree: true
    });
  }
  window.addEventListener('resize', update);
  requestAnimationFrame(update);
}

function init() {
  if (!MODES.includes(state.mode)) state.mode = 'classic';
  const theme = store.get('ks_theme', 'dark');
  document.documentElement.dataset.theme = theme;
  updateStats();
  updateModeUI();
  setupChatScrollbar();
  addMsg('bot', GREETING);
  renderQuick(MAIN_QUICK);
  if (state.mode === 'reference') checkKnowledge();
  else checkOllama();
  if (window.matchMedia('(pointer:fine)').matches) input.focus();
}

init();
