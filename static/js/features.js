import { state, store, shuffle } from './core.js';
import { CATEGORIES, QUIZ } from './data.js';
import {
  openModal, closeModal, toast, updateStats
} from './ui.js';

QUIZ.forEach(item => {
  const order = shuffle([0, 1, 2]);
  const nextCorrect = order.indexOf(item.correct);
  item.options = order.map(index => item.options[index]);
  item.correct = nextCorrect;
});

function queryAll(selector, root) {
  return Array.from(root.querySelectorAll(selector));
}

export function openEmergency() {
  const body = openModal(
    '<p class="eyebrow">Экстренная помощь</p>' +
    '<h2 id="modalTitle">Если нужна помощь прямо сейчас</h2>' +
    '<p>Звонки бесплатны. Если ты несовершеннолетний, ты можешь обратиться без согласия родителей.</p>' +
    '<a class="tele" href="tel:112"><span class="num red">112</span><span><b>Единый номер экстренных служб</b><small>Угроза жизни, здоровью, пожар, скорая</small></span></a>' +
    '<a class="tele" href="tel:102"><span class="num red">102</span><span><b>Полиция</b><small>Угрозы, шантаж, мошенничество, вербовка</small></span></a>' +
    '<a class="tele" href="tel:88002000122"><span class="num green">8 800</span><span><b>Детский телефон доверия</b><small>8-800-2000-122 · бесплатно и анонимно, для детей и родителей</small></span></a>' +
    '<div class="notice"><b>Важно:</b> не удаляйте переписку и скриншоты. Это доказательства, которые помогут специалистам.</div>' +
    '<div class="foot"><button class="btn primary" type="button" data-close>Понятно</button><button class="btn" type="button" data-report>Сообщить о проблеме</button></div>'
  );
  queryAll('[data-close]', body).forEach(btn => btn.addEventListener('click', closeModal));
  body.querySelector('[data-report]').addEventListener('click', () => {
    closeModal();
    openReport();
  });
}

export function openPrivacy() {
  const body = openModal(
    '<p class="eyebrow">Приватность</p>' +
    '<h2 id="modalTitle">Анонимность по умолчанию</h2>' +
    '<p>КиберЩит не запрашивает ФИО, телефон, адрес и другие идентифицирующие данные. Мы не просим авторизоваться.</p>' +
    '<h3>Как обрабатываются данные</h3>' +
    '<ul>' +
    '<li>В обычном режиме сообщения анализируются <b>прямо в браузере</b> и не отправляются на сервер.</li>' +
    '<li>История диалога живёт до перезагрузки страницы; экспорт — только по вашему действию.</li>' +
    '<li>Анонимные обращения и счётчики хранятся в <b>локальном хранилище</b> вашего устройства.</li>' +
    '<li>Аналитика — только агрегированная, без привязки к человеку.</li>' +
    '</ul>' +
    '<p>Поскольку идентифицирующие данные не собираются, согласие на обработку персональных данных не требуется. Вы можете удалить локальные данные в любой момент.</p>' +
    '<div class="foot"><button class="btn danger" type="button" data-wipe>Удалить локальные данные</button><button class="btn" type="button" data-close>Закрыть</button></div>'
  );
  queryAll('[data-close]', body).forEach(btn => btn.addEventListener('click', closeModal));
  body.querySelector('[data-wipe]').addEventListener('click', () => {
    store.del('ks_reports');
    store.del('ks_stats');
    state.reports = [];
    state.stats = { messages: 0, reports: 0 };
    updateStats();
    closeModal();
    toast('История обращений и статистика удалены');
  });
}

function reportListHtml() {
  if (!state.reports.length) return '';
  const items = state.reports.slice(0, 5).map(report => {
    const date = new Date(report.date);
    return '<div class="mini-item"><code>' + report.code + '</code>' + report.category +
      '<span>' + date.toLocaleDateString('ru-RU') + '</span></div>';
  }).join('');
  return '<div class="mini-list"><h3>Сохранённые обращения</h3>' + items + '</div>';
}

export function openReport() {
  const options = CATEGORIES.map(category => '<option value="' + category + '">' + category + '</option>').join('');
  const body = openModal(
    '<p class="eyebrow">Анонимное обращение</p>' +
    '<h2 id="modalTitle">Сообщить о проблеме</h2>' +
    '<div class="notice"><b>Это не экстренная служба.</b> При угрозе жизни звоните <a href="tel:112">112</a>. Обращение сохраняется только в вашем браузере и не передаётся специалистам автоматически.</div>' +
    '<form id="reportForm" novalidate>' +
    '<div class="field"><label for="rCat">Категория</label><select id="rCat">' + options + '</select></div>' +
    '<div class="field"><label for="rText">Что произошло</label><textarea id="rText" maxlength="1000" placeholder="Опишите ситуацию: что случилось, где, когда. Не указывайте ФИО, адрес и номера карт."></textarea><div class="err" id="rErr"></div></div>' +
    '<button class="btn primary block" type="submit">Отправить анонимно</button>' +
    '</form>' +
    reportListHtml()
  );
  const form = body.querySelector('#reportForm');
  form.addEventListener('submit', event => {
    event.preventDefault();
    const category = body.querySelector('#rCat').value;
    const text = body.querySelector('#rText').value.trim();
    const error = body.querySelector('#rErr');
    if (text.length < 10) {
      error.textContent = 'Опишите ситуацию хотя бы в 10 символах.';
      body.querySelector('#rText').focus();
      return;
    }
    const code = 'KS-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    state.reports.unshift({ code, category, text, date: Date.now() });
    state.reports = state.reports.slice(0, 20);
    store.set('ks_reports', state.reports);
    state.stats.reports = state.reports.length;
    updateStats();
    renderReportSuccess(code, category);
  });
}

function renderReportSuccess(code, category) {
  const body = openModal(
    '<div class="success">' +
    '<div class="badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 12.5 5 5L20 6.5"/></svg></div>' +
    '<h2 id="modalTitle">Обращение сохранено</h2>' +
    '<p>Категория: <b>' + category + '</b>. Данные остались на этом устройстве.</p>' +
    '<div class="code-box"><code>' + code + '</code><button type="button" data-copy>копировать</button></div>' +
    '<p class="mode-hint">Код понадобится, если вы захотите вернуться к обращению. Он не отправлен никуда.</p>' +
    '<div class="foot" style="justify-content:center">' +
    '<button class="btn" type="button" data-close>Закрыть</button>' +
    '<button class="btn primary" type="button" data-help>Получить помощь сейчас</button>' +
    '</div></div>'
  );
  body.querySelector('[data-copy]').addEventListener('click', () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => toast('Код скопирован')).catch(() => toast(code));
    } else {
      toast(code);
    }
  });
  queryAll('[data-close]', body).forEach(btn => btn.addEventListener('click', closeModal));
  body.querySelector('[data-help]').addEventListener('click', () => {
    closeModal();
    openEmergency();
  });
}

export function openQuiz() {
  state.quiz = { i: 0, score: 0, selected: null, answered: false };
  renderQuiz();
}

function renderQuiz() {
  const quiz = state.quiz;
  const item = QUIZ[quiz.i];
  const progress = Math.round((quiz.i / QUIZ.length) * 100);
  const options = item.options.map((option, index) => {
    let cls = 'opt';
    if (quiz.answered) {
      if (index === item.correct) cls += ' correct';
      else if (index === quiz.selected) cls += ' wrong';
      else cls += ' dim';
    }
    return '<button type="button" class="' + cls + '" data-opt="' + index + '"' +
      (quiz.answered ? ' disabled' : '') + '>' + option + '</button>';
  }).join('');
  let feedback = '';
  if (quiz.answered) {
    const correct = quiz.selected === item.correct;
    feedback = '<div class="feedback ' + (correct ? 'ok' : 'no') + '"><b>' +
      (correct ? 'Верно' : 'Не совсем') + '</b>' + item.why + '</div>' +
      '<div class="foot"><button class="btn primary" type="button" data-next>' +
      (quiz.i === QUIZ.length - 1 ? 'Результат' : 'Далее') + '</button></div>';
  }
  const body = openModal(
    '<p class="eyebrow">Проверь себя</p>' +
    '<h2 id="modalTitle">Смогу ли я распознать угрозу?</h2>' +
    '<div class="quiz-top"><span>Вопрос ' + (quiz.i + 1) + ' из ' + QUIZ.length + '</span><span>' + quiz.score + ' верно</span></div>' +
    '<div class="quiz-progress"><i style="width:' + progress + '%"></i></div>' +
    '<p class="quiz-q">' + item.q + '</p>' +
    '<div class="opts">' + options + '</div>' + feedback
  );
  if (!quiz.answered) {
    queryAll('[data-opt]', body).forEach(btn => btn.addEventListener('click', () => {
      quiz.selected = Number(btn.dataset.opt);
      quiz.answered = true;
      if (quiz.selected === item.correct) quiz.score++;
      renderQuiz();
    }));
  } else {
    body.querySelector('[data-next]').addEventListener('click', () => {
      if (quiz.i === QUIZ.length - 1) {
        renderQuizResult();
      } else {
        quiz.i++;
        quiz.selected = null;
        quiz.answered = false;
        renderQuiz();
      }
    });
  }
}

function renderQuizResult() {
  const score = state.quiz.score;
  const percent = Math.round((score / QUIZ.length) * 100);
  let title;
  let text;
  if (score === QUIZ.length) {
    title = 'Отличный результат!';
    text = 'Ты уверенно распознаёшь типичные схемы. Поделись знаниями с друзьями — это тоже защита.';
  } else if (score >= 3) {
    title = 'Хороший результат';
    text = 'Основные признаки ты замечаешь, но стоит потренироваться на сложных ситуациях. Загляни в памятки.';
  } else {
    title = 'Стоит потренироваться';
    text = 'Мошенники и вербовщики действуют хитро. Разбери памятки — там простые алгоритмы, которые помогают не растеряться.';
  }
  const body = openModal(
    '<p class="eyebrow">Результат</p>' +
    '<h2 id="modalTitle">' + title + '</h2>' +
    '<div class="score-ring" style="--p:' + percent + '"><b>' + score + '<small>/' + QUIZ.length + '</small></b></div>' +
    '<p style="text-align:center">' + text + '</p>' +
    '<div class="foot" style="justify-content:center">' +
    '<button class="btn primary" type="button" data-again>Пройти ещё раз</button>' +
    '<button class="btn" type="button" data-learn>Разобрать схемы</button>' +
    '</div>'
  );
  body.querySelector('[data-again]').addEventListener('click', openQuiz);
  body.querySelector('[data-learn]').addEventListener('click', () => {
    closeModal();
    document.dispatchEvent(new CustomEvent('ks:navigate', { detail: 'fraud' }));
  });
}
