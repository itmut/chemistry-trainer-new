const app = document.querySelector('#app');
const SESSION_KEY = 'chemistry-trainer-active-session-v4';
let cards = [];

const state = {
  screen: 'home', category: 'all', mode: 'formula', catalogCategory: 'organic',
  catalogQuery: '', catalogClass: 'all', catalogVisual: 'graphic', index: 0, order: [], answered: false,
  lastCorrect: false, completed: false, saved: false,
  stats: { answered: 0, correct: 0, streak: 0, best: 0 }
};

const storage = (() => {
  try {
    const candidate = window.sessionStorage;
    const probe = '__chemistry_probe__'; candidate.setItem(probe, '1'); candidate.removeItem(probe);
    return candidate;
  } catch {
    try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }
  }
})();
try { Object.assign(state, JSON.parse(storage.getItem(SESSION_KEY) || '{}')); } catch { /* fresh state */ }
if (!['formula', 'name'].includes(state.mode)) state.mode = 'formula';
if (!['home', 'modes', 'catalog', 'trainer'].includes(state.screen)) state.screen = 'home';
if (!['all', 'organic', 'inorganic'].includes(state.category)) state.category = 'all';
if (!['organic', 'inorganic'].includes(state.catalogCategory)) state.catalogCategory = 'organic';
if (!['graphic', 'formula'].includes(state.catalogVisual)) state.catalogVisual = 'graphic';
if (!Array.isArray(state.order)) state.order = [];
state.lastCorrect = Boolean(state.lastCorrect); state.completed = Boolean(state.completed);
if (!state.stats || typeof state.stats !== 'object') state.stats = { answered: 0, correct: 0, streak: 0, best: 0 };
for (const key of ['answered', 'correct', 'streak', 'best']) state.stats[key] = Number.isFinite(Number(state.stats[key])) ? Number(state.stats[key]) : 0;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const norm = value => String(value ?? '').toLowerCase().replaceAll('ё', 'е').replace(/[₀-₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c))).replace(/[\s\-–—−·.,;:()[\]{}'"«»]/g, '').replace(/\\/g, '').trim();
const persist = () => { try { storage.setItem(SESSION_KEY, JSON.stringify({ screen: state.screen, category: state.category, mode: state.mode, catalogCategory: state.catalogCategory, catalogQuery: state.catalogQuery, catalogClass: state.catalogClass, catalogVisual: state.catalogVisual, index: state.index, order: state.order, answered: state.answered, lastCorrect: state.lastCorrect, completed: state.completed, saved: state.saved, stats: state.stats })); } catch {} };
const categoryName = type => type === 'organic' ? 'органика' : type === 'inorganic' ? 'неорганика' : 'смешанный набор';
const getList = () => cards.filter(card => state.category === 'all' || card.type === state.category);
const getCurrent = () => { const list = getList(); return list[state.order[0]]; };
const answerValues = card => {
  if (state.mode === 'name') return [...new Set([card.formula, card.molecularFormula, card.structure].filter(value => value && value !== '—'))];
  return [card.trivialName, ...(card.aliases || [])].filter(Boolean);
};
const answerLabel = () => state.mode === 'name' ? 'формулу вещества' : 'тривиальное название';
const correctAnswerText = card => state.mode === 'name' ? (card.formula || card.molecularFormula || card.structure || '—') : card.trivialName;
const nomenclatureText = card => card.systematicName && norm(card.systematicName) !== norm(card.trivialName) ? card.systematicName : '—';
const shuffle = list => [...list].sort(() => Math.random() - 0.5);
const formulaText = card => card.type === 'organic' && card.structure && card.structure !== '—' ? card.structure : card.formula;

function repeatUnitVisual(card) {
  const repeat = card.structure || card.formula || '—';
  return `<div class="repeat-unit" role="img" aria-label="Повторяющееся звено ${esc(card.trivialName)}"><span class="repeat-bracket">[</span><strong>${esc(repeat)}</strong><span class="repeat-bracket">]</span><sup>n</sup></div>`;
}

function localImagePath(card) {
  if (card.type !== 'organic' || !card.imageUrl || Number(card.number) > 200) return '';
  return `public/images/organic/o${String(card.number).padStart(3, '0')}.png`;
}

function structureVisual(card, compact = false) {
  const classes = `structure-visual ${compact ? 'compact' : ''}`;
  if (compact && state.catalogVisual === 'formula' && card.type === 'organic') return `<div class="${classes} formula-frame"><strong>${esc(card.formula || '—')}</strong></div>`;
  const localImage = localImagePath(card);
  if (localImage && card.imageMode !== 'repeat_unit_preferred') return `<div class="${classes} image-frame"><img loading="lazy" src="${esc(localImage)}" alt="Структурный рисунок: ${esc(card.trivialName)}" title="Скелетная формула: вершины и концы линий обозначают атомы углерода" /><div class="image-fallback" aria-hidden="true"><b>${esc(formulaText(card))}</b></div></div>`;
  if (card.imageMode === 'repeat_unit_preferred') return `<div class="${classes} repeat-frame">${repeatUnitVisual(card)}</div>`;
  return `<div class="${classes} formula-frame">${compact ? '' : `<span>${card.type === 'organic' ? 'структурная запись' : 'формула'}</span>`}<strong>${esc(formulaText(card))}</strong>${card.molecularFormula ? `<small>${esc(card.molecularFormula)}</small>` : ''}</div>`;
}

function namePromptVisual(card) {
  return `<div class="structure-visual name-frame"><span>систематическое название</span><strong>${esc(card.systematicName || card.trivialName || '—')}</strong><small>введите формулу вещества</small></div>`;
}

function wireBack(id, target) { document.querySelector(`#${id}`)?.addEventListener('click', () => { state.screen = target; state.answered = false; persist(); render(); }); }

function renderHome() {
  document.body.classList.remove('trainer-active');
  const inorganic = cards.filter(c => c.type === 'inorganic').length, organic = cards.filter(c => c.type === 'organic').length;
  app.innerHTML = `<section class="home-screen"><div class="home-heading"><p class="eyebrow">карточки по химии</p><h1>тривиальные названия</h1></div><div class="category-grid"><button class="category-card" data-category="all"><strong>смешанный</strong><small>${inorganic + organic} карточек</small></button><button class="category-card" data-category="inorganic"><strong>неорганика</strong><small>${inorganic} карточек</small></button><button class="category-card" data-category="organic"><strong>органика</strong><small>${organic} карточек</small></button></div><button class="content-btn" id="contentBtn">содержание</button></section>`;
  document.querySelectorAll('[data-category]').forEach(btn => btn.addEventListener('click', () => { state.category = btn.dataset.category; state.screen = 'modes'; state.index = 0; state.order = []; state.answered = false; persist(); render(); }));
  document.querySelector('#contentBtn').addEventListener('click', () => { state.screen = 'catalog'; state.catalogCategory = 'organic'; state.catalogQuery = ''; state.catalogClass = 'all'; state.catalogVisual = 'graphic'; persist(); render(); });
}

function renderModes() {
  document.body.classList.remove('trainer-active');
  app.innerHTML = `<section class="mode-screen"><button class="back-btn mode-back" id="backHome">назад</button><div class="mode-heading"><p class="mode-category">${esc(categoryName(state.category))}</p><h1>выберите режим</h1></div><div class="mode-grid"><button class="mode-card" data-mode="formula"><strong>по формуле</strong><small>формула → тривиальное название</small></button><button class="mode-card" data-mode="name"><strong>по названию</strong><small>номенклатура → формула</small></button></div></section>`;
  wireBack('backHome', 'home');
  document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { state.mode = btn.dataset.mode; state.screen = 'trainer'; state.index = 0; state.answered = false; state.completed = false; state.lastCorrect = false; state.saved = false; state.order = shuffle(Array.from({ length: getList().length }, (_, i) => i)); persist(); render(); }));
}

function catalogMatches(card) {
  const query = norm(state.catalogQuery), text = [card.trivialName, card.systematicName, card.formula, card.structure, card.molecularFormula, ...(card.aliases || [])].join(' ');
  return (!query || norm(text).includes(query)) && (state.catalogClass === 'all' || card.className === state.catalogClass);
}

function renderCatalog() {
  document.body.classList.remove('trainer-active');
  const source = cards.filter(c => c.type === state.catalogCategory);
  const classes = [...new Set(source.map(c => c.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  if (state.catalogClass !== 'all' && !classes.includes(state.catalogClass)) state.catalogClass = 'all';
  const list = source.filter(catalogMatches);
  app.innerHTML = `<section class="catalog-screen"><button class="back-btn" id="backHome">назад</button><div class="catalog-heading"><div><p class="eyebrow">справочник</p><h1>содержание</h1></div><span class="catalog-count">${list.length} из ${source.length}</span></div><div class="catalog-controls"><label class="search-field"><span aria-hidden="true">⌕</span><input id="catalogSearch" type="search" value="${esc(state.catalogQuery)}" placeholder="поиск по названию или формуле" aria-label="поиск по содержанию" /></label><select id="catalogClass" aria-label="фильтр по классу"><option value="all">все классы</option>${classes.map(c => `<option value="${esc(c)}" ${state.catalogClass === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${state.catalogCategory === 'organic' ? `<div class="visual-toggle" role="group" aria-label="вид карточек"><button class="visual-option ${state.catalogVisual === 'graphic' ? 'active' : ''}" data-visual="graphic">рисунки</button><button class="visual-option ${state.catalogVisual === 'formula' ? 'active' : ''}" data-visual="formula">формулы</button></div>` : ''}</div><div class="catalog-tabs"><button class="catalog-tab ${state.catalogCategory === 'organic' ? 'active' : ''}" data-catalog="organic">органика <span>${cards.filter(c => c.type === 'organic').length}</span></button><button class="catalog-tab ${state.catalogCategory === 'inorganic' ? 'active' : ''}" data-catalog="inorganic">неорганика <span>${cards.filter(c => c.type === 'inorganic').length}</span></button></div><div class="catalog-grid">${list.length ? list.map(card => `<article class="catalog-card">${structureVisual(card, true)}<div class="catalog-name">${esc(card.trivialName)}</div><small>${esc(nomenclatureText(card))}</small></article>`).join('') : '<div class="catalog-empty">ничего не найдено. измените запрос или фильтр.</div>'}</div></section>`;
  wireBack('backHome', 'home');
  document.querySelectorAll('[data-catalog]').forEach(btn => btn.addEventListener('click', () => { state.catalogCategory = btn.dataset.catalog; state.catalogClass = 'all'; persist(); renderCatalog(); }));
  document.querySelectorAll('[data-visual]').forEach(btn => btn.addEventListener('click', () => { state.catalogVisual = btn.dataset.visual; persist(); renderCatalog(); }));
  document.querySelector('#catalogSearch').addEventListener('input', e => { state.catalogQuery = e.target.value; persist(); renderCatalog(); const field = document.querySelector('#catalogSearch'); field.focus(); field.setSelectionRange(state.catalogQuery.length, state.catalogQuery.length); });
  document.querySelector('#catalogClass').addEventListener('change', e => { state.catalogClass = e.target.value; persist(); renderCatalog(); });
  document.querySelectorAll('.image-frame img').forEach(img => img.addEventListener('error', () => { img.hidden = true; img.parentElement.classList.add('image-missing'); }));
}

function renderTrainer() {
  document.body.classList.add('trainer-active');
  const list = getList();
  if (!list.length) { app.innerHTML = '<div class="empty">В этом разделе пока нет карточек.</div>'; return; }
  if (!Array.isArray(state.order) || state.order.some(i => i >= list.length || i < 0)) state.order = [];
  if (!state.completed && state.order.length === 0) state.order = shuffle(Array.from({ length: list.length }, (_, i) => i));
  if (state.completed) {
    app.innerHTML = `<section class="completion-screen"><button class="back-btn" id="backModes">назад</button><div><p class="eyebrow">сессия завершена</p><h1>все карточки пройдены</h1><p>Ошибочные ответы возвращались в случайную позицию, пока не были решены правильно.</p><button class="next-btn" id="restart">пройти ещё раз</button></div></section>`;
    wireBack('backModes', 'modes');
    document.querySelector('#restart').addEventListener('click', () => { state.completed = false; state.index = 0; state.order = shuffle(Array.from({ length: list.length }, (_, i) => i)); persist(); renderTrainer(); });
    return;
  }
  const card = getCurrent();
  if (!card) { state.completed = true; persist(); renderTrainer(); return; }
  const completedCount = Math.max(0, list.length - state.order.length);
  const progress = ((completedCount + (state.answered && state.lastCorrect ? 1 : 0)) / list.length) * 100;
  app.innerHTML = `<section class="trainer-screen"><header class="session-header"><button class="back-btn" id="backModes">назад</button><div class="session-title"><span>${esc(categoryName(state.category))}</span><b>${state.mode === 'name' ? 'по названию' : 'по формуле'}</b></div><div class="session-stats"><span>отвечено <b>${state.stats.answered}</b></span><span>точность <b>${state.stats.answered ? Math.round(state.stats.correct / state.stats.answered * 100) : 0}%</b></span><span>серия <b>${state.stats.best}</b></span></div><div class="session-actions"><button class="ghost-btn" id="saveSession">${state.saved ? 'сохранено' : 'сохранить'}</button><button class="ghost-btn danger" id="resetSession">сбросить</button></div></header><div class="session-progress"><span>${completedCount} / ${list.length}</span><div><i style="width:${Math.min(100, progress)}%"></i></div></div><article class="quiz-card"><div class="quiz-visual">${state.mode === 'name' ? namePromptVisual(card) : structureVisual(card)}</div><div class="quiz-copy"><form id="answerForm"><input id="answer" autocomplete="off" placeholder="введите ${answerLabel()}" aria-label="${answerLabel()}" /><button class="check-btn" type="submit">проверить</button><button class="skip-btn" id="skip" type="button">пропустить</button><button class="next-btn" id="next" type="button" style="display:none">продолжить</button></form><div id="feedback" class="feedback" role="status"></div><div class="card-facts"><span><em>номенклатура</em>${esc(nomenclatureText(card))}</span><span><em>класс</em>${esc(card.className || '—')}</span><span><em>внешний вид</em>${esc(card.appearance || '—')}</span><span><em>применение</em>${esc(card.uses || '—')}</span></div></div></article></section>`;
  wireBack('backModes', 'modes');
  document.querySelector('#saveSession').addEventListener('click', () => { state.saved = true; persist(); renderTrainer(); });
  document.querySelector('#resetSession').addEventListener('click', () => { state.stats = { answered: 0, correct: 0, streak: 0, best: 0 }; state.index = 0; state.answered = false; state.completed = false; state.lastCorrect = false; state.saved = false; state.order = shuffle(Array.from({ length: list.length }, (_, i) => i)); persist(); renderTrainer(); });
  document.querySelector('#answerForm').addEventListener('submit', e => { e.preventDefault(); checkAnswer(); });
  document.querySelector('#skip').addEventListener('click', skipCard); document.querySelector('#next').addEventListener('click', nextCard);
  document.querySelector('.image-frame img')?.addEventListener('error', e => { e.currentTarget.hidden = true; e.currentTarget.parentElement.classList.add('image-missing'); });
  document.querySelector('#answer').focus();
}

function nextCard() {
  const list = getList();
  if (!state.order.length) { state.completed = true; persist(); renderTrainer(); return; }
  const current = state.order.shift();
  if (!state.lastCorrect) {
    const position = Math.floor(Math.random() * (state.order.length + 1));
    state.order.splice(position, 0, current);
  } else state.index++;
  state.answered = false; state.lastCorrect = false;
  if (!state.order.length) state.completed = true;
  persist(); renderTrainer();
}
function skipCard() {
  if (state.answered) return;
  state.lastCorrect = false; state.answered = true;
  const card = getCurrent(); const feedback = document.querySelector('#feedback'); feedback.className = 'feedback reveal'; feedback.innerHTML = `правильный ответ: <strong>${esc(correctAnswerText(card))}</strong> · карточка вернётся позже.`;
  persist();
  document.querySelector('.check-btn').style.display = 'none'; document.querySelector('#skip').style.display = 'none'; document.querySelector('#next').style.display = 'inline-flex';
}
function checkAnswer() {
  if (state.answered) return;
  const input = document.querySelector('#answer'); if (!norm(input.value)) return;
  const card = getCurrent(), correct = answerValues(card).some(expected => norm(expected) === norm(input.value));
  state.stats.answered++; if (correct) { state.stats.correct++; state.stats.streak++; state.stats.best = Math.max(state.stats.best, state.stats.streak); } else state.stats.streak = 0;
  state.answered = true; state.lastCorrect = correct; persist(); const feedback = document.querySelector('#feedback'); feedback.className = `feedback ${correct ? 'good' : 'bad'} reveal`; feedback.innerHTML = correct ? 'верно.' : `правильный ответ: <strong>${esc(correctAnswerText(card))}</strong> · карточка вернётся позже.`;
  input.disabled = true; document.querySelector('.check-btn').style.display = 'none'; document.querySelector('#skip').style.display = 'none'; document.querySelector('#next').style.display = 'inline-flex';
}
function render() { if (state.screen === 'home') renderHome(); else if (state.screen === 'modes') renderModes(); else if (state.screen === 'catalog') renderCatalog(); else renderTrainer(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (state.screen === 'trainer') { state.screen = 'modes'; state.answered = false; persist(); render(); } else if (state.screen === 'modes' || state.screen === 'catalog') { state.screen = 'home'; persist(); render(); } } if (e.key.toLowerCase() === 'n' && state.screen === 'trainer' && !['INPUT', 'SELECT'].includes(document.activeElement?.tagName) && state.answered) nextCard(); });
fetch('data/chemistry.json').then(r => { if (!r.ok) throw new Error('data'); return r.json(); }).then(data => { cards = Array.isArray(data.cards) ? data.cards : []; render(); }).catch(() => { app.innerHTML = '<div class="empty">Не удалось загрузить карточки. Откройте index.html через Live Server.</div>'; });
