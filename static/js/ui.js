import { state, store } from './core.js';
import { GREETING, MAIN_QUICK } from './data.js';

export const chat = document.getElementById('chat');
export const quick = document.getElementById('quick');
export const input = document.getElementById('input');
export const alertBar = document.getElementById('alertBar');
export const modal = document.getElementById('modal');
export const modalBody = document.getElementById('modalBody');
export const toastEl = document.getElementById('toast');

function esc(value) {
  return value.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

export function fmt(value) {
  return esc(value).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

export function now() {
  return new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function addMsg(role, text, label) {
  const el = document.createElement('div');
  el.className = 'msg ' + role;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (role === 'bot') bubble.innerHTML = fmt(text);
  else bubble.textContent = text;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = (label || (role === 'bot' ? 'КиберЩит' : 'Вы')) + ' · ' + now();
  if (role === 'bot' && label && label.includes('нейро')) el.classList.add('neural');
  if (role === 'bot' && label && label.includes('справочник')) el.classList.add('reference');
  el.appendChild(bubble);
  el.appendChild(meta);
  chat.appendChild(el);
  state.log.push({ role, text, time: now() });
  chat.scrollTop = chat.scrollHeight;
  return el;
}

let typingEl = null;
let replyTimer = null;

export function showTyping() {
  if (typingEl) return;
  typingEl = document.createElement('div');
  typingEl.className = 'msg bot typing';
  typingEl.innerHTML = '<div class="bubble"><span></span><span></span><span></span></div>';
  chat.appendChild(typingEl);
  chat.scrollTop = chat.scrollHeight;
}

export function hideTyping() {
  if (typingEl) {
    typingEl.remove();
    typingEl = null;
  }
}

export function cancelReply() {
  if (replyTimer) {
    clearTimeout(replyTimer);
    replyTimer = null;
  }
  hideTyping();
}

export function botSay(text, quickItems) {
  cancelReply();
  showTyping();
  const delay = Math.min(900, 380 + text.length * 4);
  replyTimer = setTimeout(() => {
    hideTyping();
    replyTimer = null;
    addMsg('bot', text);
    renderQuick(quickItems || MAIN_QUICK);
  }, delay);
}

export function renderQuick(items) {
  quick.innerHTML = '';
  (items || []).forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = item.label;
    btn.addEventListener('click', () => {
      if (item.send) document.dispatchEvent(new CustomEvent('ks:send', { detail: item.send }));
      else if (item.view) document.dispatchEvent(new CustomEvent('ks:navigate', { detail: item.view }));
      else if (item.article) document.dispatchEvent(new CustomEvent('ks:article', { detail: item.article }));
      else if (item.action) document.dispatchEvent(new CustomEvent('ks:action', { detail: item.action }));
    });
    quick.appendChild(btn);
  });
}

export function setActive(view) {
  document.querySelectorAll('#nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

export function showAlert(kind) {
  const content = kind === 'crisis'
    ? 'Если есть непосредственная угроза — звоните <a href="tel:112">112</a> или на бесплатный телефон доверия <a href="tel:88002000122">8-800-2000-122</a>. Это бесплатно и анонимно.'
    : 'Деньги уже списаны? Позвоните в банк по номеру с обратной стороны карты и в полицию — <a href="tel:102">102</a>. Чем быстрее, тем выше шанс остановить перевод.';
  alertBar.hidden = false;
  alertBar.className = 'alert-bar';
  alertBar.innerHTML =
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>' +
    '<div>' + content + '</div>' +
    '<button type="button" aria-label="Закрыть">×</button>';
  alertBar.querySelector('button').addEventListener('click', () => { alertBar.hidden = true; });
}

export function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2300);
}

export function updateStats() {
  store.set('ks_stats', state.stats);
  const messages = document.getElementById('statMessages');
  const reports = document.getElementById('statReports');
  if (messages) messages.textContent = state.stats.messages || 0;
  if (reports) reports.textContent = state.reports.length || 0;
}

export function setModelStatus(kind, text) {
  const box = document.getElementById('modelStatus');
  if (!box) return;
  box.className = 'model-status' + (kind ? ' ' + kind : '');
  const span = box.querySelector('span');
  if (span) span.textContent = text;
}

export function exportChat() {
  const lines = ['КиберЩит — экспорт диалога', new Date().toLocaleString('ru-RU'), ''];
  state.log.forEach(msg => {
    lines.push((msg.role === 'user' ? 'Вы' : 'КиберЩит') + ' [' + msg.time + ']: ' + msg.text, '');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kibershchit-dialog.txt';
  link.click();
  URL.revokeObjectURL(url);
  toast('Диалог сохранён в файл');
}

export function clearChat() {
  chat.innerHTML = '';
  state.log = [];
  alertBar.hidden = true;
  setActive('home');
  addMsg('bot', GREETING);
  renderQuick(MAIN_QUICK);
  toast('Диалог очищен');
}

export function openModal(html) {
  modalBody.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    if (!window.matchMedia('(pointer:fine)').matches) return;
    const target = document.querySelector('.modal .btn, .modal .opt, .modal .modal-close');
    if (target) target.focus({ preventScroll: true });
  }, 30);
  return modalBody;
}

export function closeModal() {
  modal.hidden = true;
  modalBody.innerHTML = '';
  document.body.style.overflow = '';
}

document.getElementById('modalClose').addEventListener('click', closeModal);
modal.addEventListener('click', event => {
  if (event.target === modal) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.hidden) closeModal();
});
