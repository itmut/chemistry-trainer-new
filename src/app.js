const app = document.querySelector('#app');
const SESSION_KEY = 'chemistry-trainer-active-session-v4';
let cards = [];
let catalogSearchTimer = 0;

const state = {
  screen: 'home', category: 'all', mode: 'formula', catalogCategory: 'organic',
  catalogQuery: '', catalogClass: 'all', catalogVisual: 'graphic', index: 0, order: [], answered: false,
  lastCorrect: false, lastSkipped: false, completed: false, saved: false,
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
if (!['formula', 'name', 'drawing'].includes(state.mode)) state.mode = 'formula';
if (!['home', 'modes', 'catalog', 'trainer'].includes(state.screen)) state.screen = 'home';
if (!['all', 'organic', 'inorganic'].includes(state.category)) state.category = 'all';
if (!['organic', 'inorganic'].includes(state.catalogCategory)) state.catalogCategory = 'organic';
if (!['graphic', 'formula'].includes(state.catalogVisual)) state.catalogVisual = 'graphic';
if (!Array.isArray(state.order)) state.order = [];
state.lastCorrect = Boolean(state.lastCorrect); state.lastSkipped = Boolean(state.lastSkipped); state.completed = Boolean(state.completed);
if (!state.stats || typeof state.stats !== 'object') state.stats = { answered: 0, correct: 0, streak: 0, best: 0 };
for (const key of ['answered', 'correct', 'streak', 'best']) state.stats[key] = Number.isFinite(Number(state.stats[key])) ? Number(state.stats[key]) : 0;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
// Answers are compared in a forgiving, chemistry-friendly way: case, ё/е,
// typographic dashes, spaces and formula subscripts do not change the result.
const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replaceAll('ё', 'е').replace(/[₀-₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c))).replace(/[\s\-–—−·.,;:()[\]{}'"«»]/g, '').replace(/\\/g, '').trim();
const subscriptDigits = Object.fromEntries([... '₀₁₂₃₄₅₆₇₈₉'].map((digit, index) => [digit, String(index)]));
const formulaMarkup = value => {
  const source = String(value ?? '—');
  let markup = esc(source).replace(/[₀-₉]+/g, run => `<sub>${[...run].map(digit => subscriptDigits[digit]).join('')}</sub>`);
  // A few legacy cards use ASCII digits. Convert only stoichiometric digits
  // (after an element, closing bracket, or parenthesis), leaving locants such
  // as 1,3- and the repeat-unit n untouched.
  markup = markup.replace(/([A-Za-z\)\]])(\d+)/g, '$1<sub>$2</sub>');
  return markup;
};

// Typography used only in the Content screen. Bond dashes are lifted slightly
// from the baseline and polymer n is shown as a lower index. Trainer cards keep
// their normal chemistry notation.
const catalogFormulaMarkup = value => {
  let markup = formulaMarkup(value);
  markup = markup.replace(/[–—−-]/g, '<span class="catalog-bond">−</span>');
  markup = markup.replace(/ₙ/g, '<sub class="polymer-index">n</sub>');
  return markup;
};

const formulaRevealMarkup = card => {
  const primary = card.formula || card.molecularFormula || card.structure || '—';
  const secondary = card.molecularFormula && norm(card.molecularFormula) !== norm(primary) ? card.molecularFormula : '';
  return `<div class="answer-formula-reveal"><em>формула</em><strong>${formulaMarkup(primary)}</strong>${secondary ? `<small>${formulaMarkup(secondary)}</small>` : ''}</div>`;
};
const persist = () => { try { storage.setItem(SESSION_KEY, JSON.stringify({ screen: state.screen, category: state.category, mode: state.mode, catalogCategory: state.catalogCategory, catalogQuery: state.catalogQuery, catalogClass: state.catalogClass, catalogVisual: state.catalogVisual, index: state.index, order: state.order, answered: state.answered, lastCorrect: state.lastCorrect, lastSkipped: state.lastSkipped, completed: state.completed, saved: state.saved, stats: state.stats })); } catch {} };
const categoryName = type => type === 'organic' ? 'органика' : type === 'inorganic' ? 'неорганика' : 'смешанный набор';
const getList = () => cards.filter(card => {
  if (state.category !== 'all' && card.type !== state.category) return false;
  // The drawing mode is deliberately limited to cards that have a matching
  // local structure asset; reference-only organic cards stay available in the
  // formula and name modes instead of showing a misleading fallback formula.
  if (state.mode === 'drawing') return card.type === 'organic' && Boolean(card.imageUrl) && Number(card.number) <= 200;
  return true;
});
const getCurrent = () => {
  const list = getList();
  const index = state.order[0];
  return Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : undefined;
};
const referenceClassByName = {
  'криолит': 'комплексная соль', 'пирит': 'сульфид', 'карбид кальция': 'карбид', 'карбид алюминия': 'карбид',
  'карборунд': 'карбид', 'синтез газ': 'смесь газов', 'известковая вода': 'основание', 'известковое молоко': 'основание',
  'олеум': 'кислотная смесь', 'хромовый ангидрид': 'кислотный оксид', 'марганцевый ангидрид': 'кислотный оксид',
  'молочная кислота': 'гидроксикислота', 'акриловая кислота': 'карбоновая кислота', 'н-бутан': 'алкан', 'изобутан': 'алкан',
  'н-пентан': 'алкан', 'изопентан': 'алкан', 'дивинил': 'диен', 'хлоропрен': 'галогендиен', 'винилацетилен': 'енин',
  'мета-ксилол': 'арен', 'орто-ксилол': 'арен', 'пара-ксилол': 'арен', 'изопропил': 'углеводородный радикал',
  'винил': 'углеводородный радикал', 'фенил': 'углеводородный радикал', 'бензил': 'углеводородный радикал',
  'втор-бутил': 'углеводородный радикал', 'изобутил': 'углеводородный радикал', 'н-бутил': 'углеводородный радикал',
  'трет-бутил': 'углеводородный радикал', 'бензиловый спирт': 'спирт', 'капрон': 'полиамид', 'фенилаланин': 'аминокислота',
  'формиат': 'карбоксилат-ион', 'ацетат': 'карбоксилат-ион', 'пропионат': 'карбоксилат-ион', 'бутират': 'карбоксилат-ион',
  'акрилат': 'карбоксилат-ион', 'бензоат': 'карбоксилат-ион', 'пальмитат': 'карбоксилат-ион', 'стеарат': 'карбоксилат-ион',
  'олеат': 'карбоксилат-ион', 'линолеат': 'карбоксилат-ион', 'оксалат': 'дикарбоксилат-ион', 'адипинат': 'дикарбоксилат-ион'
};
const cardClass = card => referenceClassByName[card.trivialName] || card.className || '—';
const answerValues = card => {
  // Name mode accepts only actual formula fields. Descriptive structure notes
  // (for example, "катехольное кольцо + …") are useful metadata but are not
  // valid answers and must not accidentally pass the check.
  if (state.mode === 'name') return [...new Set([card.formula, card.molecularFormula].filter(value => value && value !== '—'))];
  return [card.trivialName, ...(card.aliases || [])].filter(Boolean);
};
const answerLabel = () => state.mode === 'name' ? 'формулу вещества' : 'тривиальное название';
const correctAnswerText = card => state.mode === 'name' ? (card.formula || card.molecularFormula || card.structure || '—') : card.trivialName;
const displayFormula = card => {
  const molecular = String(card.molecularFormula || '').trim();
  return molecular && !/^повторяющееся\s+звено/i.test(molecular)
    ? molecular
    : (card.formula || card.structure || '—');
};
const nomenclatureText = card => card.systematicName && norm(card.systematicName) !== norm(card.trivialName) ? card.systematicName : '—';
const catalogCardMarkup = card => {
  const formulaLine = state.catalogCategory === 'organic' && state.catalogVisual === 'graphic'
    ? `<div class="catalog-formula-line" aria-label="формула">${catalogFormulaMarkup(displayFormula(card))}</div>`
    : '';
  return `<article class="catalog-card">${structureVisual(card, true)}<div class="catalog-name">${esc(card.trivialName)}</div>${formulaLine}<small>${esc(nomenclatureText(card))}</small></article>`;
};
const shuffle = list => [...list].sort(() => Math.random() - 0.5);
const formulaText = card => {
  const structure = String(card.structure || '');
  const hasChemicalStructure = structure && structure !== '—' && !/[а-яё]{3,}/i.test(structure);
  return card.type === 'organic' && hasChemicalStructure ? structure : (card.formula || card.molecularFormula || '—');
};

function repeatUnitVisual(card, compact = false) {
  const repeat = card.structure || card.formula || '—';
  const repeatMarkup = compact ? catalogFormulaMarkup(repeat) : formulaMarkup(repeat);
  const indexMarkup = compact ? '<sub class="polymer-index">n</sub>' : '<sup>n</sup>';
  return `<div class="repeat-unit ${compact ? 'catalog-repeat' : ''}" role="img" aria-label="Повторяющееся звено ${esc(card.trivialName)}"><span class="repeat-bracket">[</span><strong>${repeatMarkup}</strong><span class="repeat-bracket">]</span>${indexMarkup}</div>`;
}

function localImagePath(card) {
  if (card.type !== 'organic' || !card.imageUrl || Number(card.number) > 200) return '';
  return `public/images/organic/o${String(card.number).padStart(3, '0')}.svg`;
}

function structureVisual(card, compact = false) {
  const classes = `structure-visual ${compact ? 'compact' : ''}`;
  if (compact && state.catalogVisual === 'formula' && card.type === 'organic') {
    const text = card.formula || card.structure || '—';
    const lengthClass = String(text).length > 38 ? 'formula-xlong' : String(text).length > 24 ? 'formula-long' : '';
    return `<div class="${classes} formula-frame catalog-formula ${lengthClass}"><strong>${catalogFormulaMarkup(text)}</strong></div>`;
  }
  // Keep every available organic drawing. Repeat-unit fallback is used only
  // when a local image is genuinely unavailable.
  const localImage = localImagePath(card);
  if (localImage) return `<div class="${classes} image-frame"><img loading="${compact ? 'lazy' : 'eager'}" decoding="async" fetchpriority="${compact ? 'low' : 'high'}" src="${esc(localImage)}" alt="Структурный рисунок: ${esc(card.trivialName)}" title="Скелетная формула: вершины и концы линий обозначают атомы углерода" /><div class="image-fallback" aria-hidden="true"><b>${compact ? catalogFormulaMarkup(formulaText(card)) : formulaMarkup(formulaText(card))}</b></div></div>`;
  if (card.imageMode === 'repeat_unit_preferred') return `<div class="${classes} repeat-frame">${repeatUnitVisual(card, compact)}</div>`;
  const displayFormula = formulaText(card);
  return `<div class="${classes} formula-frame">${compact ? '' : `<span>${card.type === 'organic' ? 'структурная запись' : 'формула'}</span>`}<strong>${compact ? catalogFormulaMarkup(displayFormula) : formulaMarkup(displayFormula)}</strong>${!compact && card.molecularFormula && norm(card.molecularFormula) !== norm(displayFormula) ? `<small>${formulaMarkup(card.molecularFormula)}</small>` : ''}</div>`;
}

// The formula mode is intentionally text-only. Organic cards still have a
// structural drawing available in the separate "по рисунку" mode, but this
// view should never silently switch back to an image or a condensed structure.
function formulaOnlyVisual(card) {
  const text = displayFormula(card);
  const lengthClass = String(text).length > 38 ? 'formula-xlong' : String(text).length > 24 ? 'formula-long' : '';
  return `<div class="structure-visual formula-frame formula-only-frame ${lengthClass}"><span>молекулярная формула</span><strong>${formulaMarkup(text)}</strong></div>`;
}

function namePromptVisual(card) {
  return `<div class="structure-visual name-frame"><span>тривиальное название</span><strong>${esc(card.trivialName || '—')}</strong></div>`;
}

function drawingAnswerMarkup(card) {
  return `<div class="drawing-answer-reveal"><div><em>название</em><strong>${esc(card.trivialName || '—')}</strong></div><div><em>формула</em><strong>${formulaMarkup(displayFormula(card))}</strong></div></div>`;
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
  const hasDrawingMode = state.category === 'organic';
  app.innerHTML = `<section class="mode-screen"><button class="back-btn mode-back" id="backHome">назад</button><div class="mode-heading"><p class="mode-category">${esc(categoryName(state.category))}</p><h1>выберите режим</h1></div><div class="mode-grid ${hasDrawingMode ? 'three-modes' : ''}"><button class="mode-card" data-mode="formula"><strong>по формуле</strong><small>формула → тривиальное название</small></button><button class="mode-card" data-mode="name"><strong>по названию</strong><small>номенклатура → формула</small></button>${hasDrawingMode ? '<button class="mode-card" data-mode="drawing"><strong>по рисунку</strong><small>структурный рисунок → название</small></button>' : ''}</div></section>`;
  wireBack('backHome', 'home');
  document.querySelectorAll('[data-mode]').forEach(btn => btn.addEventListener('click', () => { state.mode = btn.dataset.mode; state.screen = 'trainer'; state.index = 0; state.answered = false; state.completed = false; state.lastCorrect = false; state.lastSkipped = false; state.saved = false; state.order = shuffle(Array.from({ length: getList().length }, (_, i) => i)); persist(); render(); }));
}

function catalogMatches(card) {
  const query = norm(state.catalogQuery), text = [card.trivialName, card.systematicName, card.formula, card.structure, card.molecularFormula, ...(card.aliases || [])].join(' ');
  return (!query || norm(text).includes(query)) && (state.catalogClass === 'all' || cardClass(card) === state.catalogClass);
}

function renderCatalog() {
  if (catalogSearchTimer) { window.clearTimeout(catalogSearchTimer); catalogSearchTimer = 0; }
  document.body.classList.remove('trainer-active');
  const source = cards.filter(c => c.type === state.catalogCategory);
  const classes = [...new Set(source.map(cardClass).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  if (state.catalogClass !== 'all' && !classes.includes(state.catalogClass)) state.catalogClass = 'all';
  const list = source.filter(catalogMatches);
  app.innerHTML = `<section class="catalog-screen"><div class="catalog-topbar"><button class="back-btn" id="backHome">назад</button><div class="catalog-heading"><div><h1>содержание</h1></div><span class="catalog-count">${list.length} из ${source.length}</span></div></div><div class="catalog-controls ${state.catalogCategory}"><label class="search-field"><span aria-hidden="true">⌕</span><input id="catalogSearch" type="search" value="${esc(state.catalogQuery)}" placeholder="поиск по названию или формуле" aria-label="поиск по содержанию" /></label><select id="catalogClass" aria-label="фильтр по классу"><option value="all">все классы</option>${classes.map(c => `<option value="${esc(c)}" ${state.catalogClass === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${state.catalogCategory === 'organic' ? `<div class="visual-toggle" role="group" aria-label="вид карточек"><button class="visual-option ${state.catalogVisual === 'graphic' ? 'active' : ''}" data-visual="graphic">рисунки</button><button class="visual-option ${state.catalogVisual === 'formula' ? 'active' : ''}" data-visual="formula">формулы</button></div>` : ''}</div><div class="catalog-tabs"><button class="catalog-tab ${state.catalogCategory === 'organic' ? 'active' : ''}" data-catalog="organic">органика <span>${cards.filter(c => c.type === 'organic').length}</span></button><button class="catalog-tab ${state.catalogCategory === 'inorganic' ? 'active' : ''}" data-catalog="inorganic">неорганика <span>${cards.filter(c => c.type === 'inorganic').length}</span></button></div><div class="catalog-grid">${list.length ? list.map(catalogCardMarkup).join('') : '<div class="catalog-empty">ничего не найдено. измените запрос или фильтр.</div>'}</div></section>`;
  wireBack('backHome', 'home');
  document.querySelectorAll('[data-catalog]').forEach(btn => btn.addEventListener('click', () => { state.catalogCategory = btn.dataset.catalog; state.catalogClass = 'all'; persist(); renderCatalog(); }));
  document.querySelectorAll('[data-visual]').forEach(btn => btn.addEventListener('click', () => { state.catalogVisual = btn.dataset.visual; persist(); renderCatalog(); }));
  document.querySelector('#catalogSearch').addEventListener('input', e => {
    state.catalogQuery = e.target.value;
    persist();
    window.clearTimeout(catalogSearchTimer);
    catalogSearchTimer = window.setTimeout(() => {
      catalogSearchTimer = 0;
      renderCatalog();
      const field = document.querySelector('#catalogSearch');
      field?.focus();
      field?.setSelectionRange(state.catalogQuery.length, state.catalogQuery.length);
    }, 90);
  });
  document.querySelector('#catalogClass').addEventListener('change', e => { state.catalogClass = e.target.value; persist(); renderCatalog(); });
  document.querySelectorAll('.image-frame img').forEach(img => img.addEventListener('error', () => { img.hidden = true; img.parentElement.classList.add('image-missing'); }));
}

function renderTrainer() {
  document.body.classList.add('trainer-active');
  const list = getList();
  if (!list.length) { app.innerHTML = '<div class="empty">В этом разделе пока нет карточек.</div>'; return; }
  if (!Array.isArray(state.order) || state.order.some(i => !Number.isInteger(i) || i >= list.length || i < 0) || new Set(state.order).size !== state.order.length) state.order = [];
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
  const modeLabel = state.mode === 'name' ? 'по названию' : state.mode === 'drawing' ? 'по рисунку' : 'по формуле';
  const visual = state.mode === 'name' ? namePromptVisual(card) : state.mode === 'drawing' ? structureVisual(card) : formulaOnlyVisual(card);
  app.innerHTML = `<section class="trainer-screen"><header class="session-header"><button class="back-btn" id="backModes">назад</button><div class="session-title"><span>${esc(categoryName(state.category))}</span><b>${modeLabel}</b></div><div class="session-stats"><span>отвечено <b>${state.stats.answered}</b></span><span>точность <b>${state.stats.answered ? Math.round(state.stats.correct / state.stats.answered * 100) : 0}%</b></span><span>серия <b>${state.stats.best}</b></span></div><div class="session-actions"><button class="ghost-btn" id="saveSession">${state.saved ? 'сохранено' : 'сохранить'}</button><button class="ghost-btn danger" id="resetSession">сбросить</button></div></header><div class="session-progress"><span>${completedCount} / ${list.length}</span><div><i style="width:${Math.min(100, progress)}%"></i></div></div><article class="quiz-card"><div class="quiz-visual">${visual}</div><div class="quiz-copy"><form id="answerForm"><input id="answer" class="${state.mode === 'name' ? 'formula-answer' : ''}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${state.mode === 'name' ? 'формула' : 'тривиальное название'}" aria-label="${answerLabel()}" /><button class="check-btn" type="submit">проверить</button><button class="skip-btn" id="skip" type="button">пропустить</button><button class="next-btn" id="next" type="button" style="display:none">продолжить</button></form><div id="feedback" class="feedback" role="status"></div><div id="answerReveal" class="answer-reveal-slot"></div><div class="card-facts"><span><em>номенклатура</em>${esc(nomenclatureText(card))}</span><span><em>класс</em>${esc(cardClass(card))}</span><span><em>внешний вид</em>${esc(card.appearance || '—')}</span><span><em>применение</em>${esc(card.uses || '—')}</span></div></div></article></section>`;
  wireBack('backModes', 'modes');
  document.querySelector('#saveSession').addEventListener('click', () => { state.saved = true; persist(); renderTrainer(); });
  document.querySelector('#resetSession').addEventListener('click', () => { state.stats = { answered: 0, correct: 0, streak: 0, best: 0 }; state.index = 0; state.answered = false; state.completed = false; state.lastCorrect = false; state.lastSkipped = false; state.saved = false; state.order = shuffle(Array.from({ length: list.length }, (_, i) => i)); persist(); renderTrainer(); });
  document.querySelector('#answerForm').addEventListener('submit', e => {
    e.preventDefault();
    if (state.answered) { nextCard(); return; }
    const input = document.querySelector('#answer');
    if (!norm(input.value)) { skipCard(); return; }
    checkAnswer();
  });
  document.querySelector('#skip').addEventListener('click', skipCard); document.querySelector('#next').addEventListener('click', nextCard);
  document.querySelector('.image-frame img')?.addEventListener('error', e => { e.currentTarget.hidden = true; e.currentTarget.parentElement.classList.add('image-missing'); });
  if (state.answered) restoreAnsweredState(card); else document.querySelector('#answer').focus();
}

function nextCard() {
  if (!state.order.length) { state.completed = true; persist(); renderTrainer(); return; }
  const current = state.order.shift();
  if (!state.lastCorrect) {
    const position = Math.floor(Math.random() * (state.order.length + 1));
    state.order.splice(position, 0, current);
  } else state.index++;
  state.answered = false; state.lastCorrect = false; state.lastSkipped = false;
  if (!state.order.length) state.completed = true;
  persist(); renderTrainer();
}
function revealAnsweredState() {
  const input = document.querySelector('#answer');
  if (input) input.disabled = true;
  const check = document.querySelector('.check-btn');
  const skip = document.querySelector('#skip');
  const next = document.querySelector('#next');
  if (check) check.style.display = 'none';
  if (skip) skip.style.display = 'none';
  if (next) next.style.display = 'inline-flex';
}

function renderAnswerReveal(card) {
  const slot = document.querySelector('#answerReveal');
  if (slot && state.mode === 'drawing') slot.innerHTML = drawingAnswerMarkup(card);
}

// Rehydrate the visible result when a saved session is restored after a
// refresh. Without this, the persisted `answered` flag would advance on Enter
// while the feedback line still looked empty.
function restoreAnsweredState(card) {
  const feedback = document.querySelector('#feedback');
  if (!feedback) return;
  const prefix = state.lastSkipped ? 'пропущено' : 'неверно';
  feedback.className = `feedback ${state.lastCorrect ? 'good' : 'bad'} reveal`;
  if (state.lastCorrect) feedback.textContent = 'верно.';
  else if (state.mode === 'name') feedback.innerHTML = `${prefix} · правильная формула: <strong>${formulaMarkup(correctAnswerText(card))}</strong>`;
  else if (state.mode === 'drawing') {
    feedback.textContent = `${prefix} · правильное название и формула ниже`;
    renderAnswerReveal(card);
  } else feedback.innerHTML = `${prefix} · правильное название: <strong>${esc(card.trivialName)}</strong> · карточка вернётся позже.`;
  if (state.mode === 'drawing' && state.lastCorrect) renderAnswerReveal(card);
  revealAnsweredState();
}

function skipCard() {
  if (state.answered) { nextCard(); return; }
  state.stats.answered++;
  state.stats.streak = 0;
  state.lastCorrect = false; state.lastSkipped = true; state.answered = true;
  const card = getCurrent();
  const feedback = document.querySelector('#feedback');
  feedback.className = 'feedback bad reveal';
  if (state.mode === 'name') {
    feedback.innerHTML = `пропущено · правильная формула: <strong>${formulaMarkup(correctAnswerText(card))}</strong>`;
  } else if (state.mode === 'drawing') {
    feedback.textContent = 'пропущено · правильное название и формула ниже';
    renderAnswerReveal(card);
  } else {
    feedback.innerHTML = `пропущено · правильное название: <strong>${esc(card.trivialName)}</strong> · карточка вернётся позже.`;
  }
  persist();
  revealAnsweredState();
}
function checkAnswer() {
  if (state.answered) { nextCard(); return; }
  const input = document.querySelector('#answer'); if (!norm(input.value)) { skipCard(); return; }
  const card = getCurrent(), correct = answerValues(card).some(expected => norm(expected) === norm(input.value));
  state.stats.answered++; if (correct) { state.stats.correct++; state.stats.streak++; state.stats.best = Math.max(state.stats.best, state.stats.streak); } else state.stats.streak = 0;
  state.answered = true; state.lastCorrect = correct; state.lastSkipped = false; persist();
  const feedback = document.querySelector('#feedback');
  feedback.className = `feedback ${correct ? 'good' : 'bad'} reveal`;
  if (state.mode === 'name') {
    feedback.innerHTML = correct ? 'верно.' : `неверно · правильная формула: <strong>${formulaMarkup(correctAnswerText(card))}</strong>`;
  } else if (state.mode === 'drawing') {
    feedback.textContent = correct ? 'верно.' : 'неверно · правильное название и формула ниже';
    renderAnswerReveal(card);
  } else {
    feedback.innerHTML = correct ? 'верно.' : `неверно · правильное название: <strong>${esc(card.trivialName)}</strong> · карточка вернётся позже.`;
  }
  revealAnsweredState();
}
function render() { if (state.screen === 'home') renderHome(); else if (state.screen === 'modes') renderModes(); else if (state.screen === 'catalog') renderCatalog(); else renderTrainer(); }
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (state.screen === 'trainer') { state.screen = 'modes'; state.answered = false; persist(); render(); }
    else if (state.screen === 'modes' || state.screen === 'catalog') { state.screen = 'home'; persist(); render(); }
    return;
  }
  if (e.key === 'Enter' && state.screen === 'trainer' && state.answered) { e.preventDefault(); nextCard(); return; }
  if (e.key.toLowerCase() === 'n' && state.screen === 'trainer' && !['INPUT', 'SELECT'].includes(document.activeElement?.tagName) && state.answered) nextCard();
});
async function loadCards() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('data/chemistry.json', { cache: 'force-cache', signal: controller.signal });
    if (!response.ok) throw new Error(`data-${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.cards)) throw new Error('invalid-data');
    cards = data.cards.filter(card => card && typeof card === 'object' && ['organic', 'inorganic'].includes(card.type) && card.trivialName && (card.formula || card.structure));
    if (!cards.length) throw new Error('empty-data');
    render();
  } catch {
    app.innerHTML = '<div class="empty">Не удалось загрузить карточки. Откройте сайт через Live Server и обновите страницу.</div>';
  } finally {
    window.clearTimeout(timeout);
  }
}
loadCards();
