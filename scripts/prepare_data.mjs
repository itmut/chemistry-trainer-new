import { readFile, writeFile } from 'node:fs/promises';

const details = JSON.parse(await readFile(new URL('../../xlsx-analysis/output/details.json', import.meta.url)));
const imageManifest = JSON.parse(await readFile(new URL('../../upload/organic_image_manifest(1).json', import.meta.url)));
const manifestById = new Map(imageManifest.map(item => [Number(item.id), item]));
const corrections = {
  'organic-080': {
    formula: 'CH₃–CH(OH)–CH₂OH', molecularFormula: 'C₃H₈O₂',
    structure: 'CH₃–CH(OH)–CH₂OH', note: 'Исправлена структурная запись: это пропиленгликоль, а не изопропанол.'
  },
  'organic-116': {
    formula: 'CH₃(CH₂)₃CH=CHCH₂CH=CHCH₂CH=CH(CH₂)₄COOH',
    molecularFormula: 'C₁₈H₃₀O₂',
    structure: 'CH₃–CH₂–CH=CH–CH₂–CH=CH–CH₂–CH=CH–(CH₂)₄–COOH',
    note: 'Исправлена длина углеродной цепи для α-линоленовой кислоты.'
  },
  'organic-151': {
    formula: 'HO–C₆H₄–CH₂–CH(NH₂)–COOH', molecularFormula: 'C₉H₁₁NO₃',
    structure: 'p-HO–C₆H₄–CH₂–CH(NH₂)–COOH', note: 'Добавлен пропущенный фрагмент CH₂.'
  },
  'organic-152': { molecularFormula: 'C₉H₁₃NO₃', note: 'Молекулярная формула сверена по PubChem.' },
  'organic-153': { molecularFormula: 'C₈H₁₁NO₃', note: 'Молекулярная формула сверена по PubChem.' },
  'organic-158': { systematicName: 'N,N,N′,N′-тетраметилмочевина', review: true, note: 'Систематическое имя нормализовано; проверьте выбранный вариант номенклатуры.' },
  'organic-199': { molecularFormula: 'C₁₀H₁₃NO₂', note: 'Формула сверена со структурой фенacetина.' },
  'organic-200': { molecularFormula: 'C₁₄H₁₄O₃', note: 'Формула сверена со структурой напроксена.' },
  'inorganic-025': { aliases: ['сухой лёд'] },
  'inorganic-031': { aliases: ['веселящий газ'] },
  'inorganic-040': { aliases: ['железная окалина'] },
  'inorganic-051': { aliases: ['фосфорный ангидрид'] },
  'inorganic-120': { aliases: ['натриевая селитра'] },
  'inorganic-151': { aliases: ['хромпик'], review: true, note: 'В исходной таблице было «хромпик?» — знак вопроса удалён, запись помечена для проверки.' }
};

const normalize = (value) => String(value ?? '').trim();
const makeRows = (sheet, type) => sheet.values.slice(4).filter(row => row?.[0]).map((row) => {
  const id = `${type}-${String(row[0]).padStart(3, '0')}`;
  const patch = corrections[id] ?? {};
  const aliases = normalize(row[4]).split(';').map(s => s.trim()).filter(Boolean);
  const allAliases = [...new Set([...aliases, ...(patch.aliases ?? [])])];
  const manifest = type === 'organic' ? manifestById.get(Number(row[0])) : null;
  const manifestPatch = {};
  if (manifest?.validation_note?.includes('C₂H₄O')) { manifestPatch.formula = 'C₂H₄O'; manifestPatch.molecularFormula = 'C₂H₄O'; }
  if (id === 'organic-149') { manifestPatch.formula = 'HOOC–CH(NH₂)–CH₂–COOH'; manifestPatch.molecularFormula = 'C₄H₇NO₄'; manifestPatch.structure = 'HOOC–CH(NH₂)–CH₂–COOH'; }
  if (id === 'organic-197') { manifestPatch.formula = '–O–CH(CH₃)–CO–ₙ'; manifestPatch.molecularFormula = 'повторяющееся звено: C₃H₄O₂'; manifestPatch.structure = '–O–CH(CH₃)–CO–ₙ'; manifestPatch.review = true; }
  return {
    id, number: row[0], type,
    formula: manifestPatch.formula ?? patch.formula ?? normalize(row[1]),
    molecularFormula: manifestPatch.molecularFormula ?? patch.molecularFormula ?? '',
    trivialName: normalize(row[2]),
    systematicName: patch.systematicName ?? normalize(row[3]),
    aliases: allAliases,
    className: normalize(row[5]),
    structure: manifestPatch.structure ?? patch.structure ?? (manifest?.structure_text ? normalize(manifest.structure_text) : normalize(row[6])),
    appearance: normalize(row[7]),
    uses: normalize(row[8]),
    examNote: normalize(row[9]),
    sourceUrl: normalize(row[10]),
    image: '',
    imageUrl: manifest?.pubchem_png_500 ?? '',
    imageMode: manifest?.image_mode ?? '',
    review: Boolean(patch.review || manifestPatch.review || manifest?.validation_note),
    auditNote: [patch.note, manifest?.validation_note].filter(Boolean).join(' ')
  };
});

const cards = [...makeRows(details[1], 'inorganic'), ...makeRows(details[2], 'organic')];

// Сопоставляем названия из тренажёра-референса с карточками пользователя.
// Сам исходный JS не копируется: из него берутся только проверяемые пары формула/имена.
const referenceSource = await readFile(new URL('../../ref.8LAm2Q/trainer.js', import.meta.url), 'utf8');
const refItems = [];
const refSegment = referenceSource.slice(referenceSource.indexOf('En=['), referenceSource.indexOf('];', referenceSource.indexOf('En=[')));
for (const object of refSegment.matchAll(/\{id:`[^}]+\}/g)) {
  const chunk = object[0];
  const type = chunk.match(/type:`([^`]+)`/)?.[1];
  const formula = chunk.match(/formula:`([^`]+)`/)?.[1];
  const namesText = chunk.match(/names:\[([^\]]*)\]/)?.[1] ?? '';
  const names = [...namesText.matchAll(/`([^`]*)`/g)].map(m => m[1]);
  if (type && formula && names.length) refItems.push({ type, formula, names });
}
const digits = value => String(value ?? '').replace(/[₀-₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)));
const compact = value => digits(value).toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
let matchedReference = 0;
const unmatchedReference = [];
for (const ref of refItems) {
  const byName = cards.find(card => card.type === ref.type && ref.names.some(name => {
    const n = compact(name); return n && [card.trivialName, card.systematicName, ...card.aliases].some(v => compact(v) === n);
  }));
  const byFormula = cards.find(card => card.type === ref.type && compact(card.formula) === compact(ref.formula));
  const target = byName || byFormula;
  if (target) {
    target.aliases = [...new Set([...target.aliases, ...ref.names.filter(n => compact(n) !== compact(target.trivialName))])];
    matchedReference++;
  } else unmatchedReference.push(ref);
}
for (const [index, ref] of unmatchedReference.entries()) {
  const id = `reference-${ref.type}-${String(index + 1).padStart(2, '0')}`;
  cards.push({
    id, number: index + 1, type: ref.type, formula: ref.formula, molecularFormula: '',
    trivialName: ref.names[0], systematicName: '', aliases: ref.names.slice(1),
    className: 'карточка из базового тренажёра', structure: '—', appearance: '—', uses: '—',
    examNote: 'Материал из исходного референса; дополните и проверьте при расширении набора.', sourceUrl: 'https://scienceforyou.ru/trivialnye-nazvaniya-veschestv',
    image: '', review: true, referenceOnly: true, auditNote: 'Добавлено из базового тренажёра.'
  });
}
const excludedEasy = cards.filter(card => card.type === 'inorganic' && card.className === 'простое вещество');
const trainingCards = cards.filter(card => !(card.type === 'inorganic' && card.className === 'простое вещество'));
const output = {
  version: 1,
  generatedAt: new Date().toISOString(),
  counts: { total: trainingCards.length, inorganic: trainingCards.filter(c => c.type === 'inorganic').length, organic: trainingCards.filter(c => c.type === 'organic').length, workbookCards: 400, referenceItems: refItems.length, referenceMatched: matchedReference, referenceAdded: unmatchedReference.length, excludedEasy: excludedEasy.length },
  excludedEasy,
  cards: trainingCards
};
await writeFile(new URL('../data/chemistry.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(`Prepared ${cards.length} cards`);
