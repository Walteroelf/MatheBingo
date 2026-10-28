'use strict';

// Bingokarten und Lottoscheine aus den Zahlen im Topf (Einstellungen kommen aus dem Würfel)

const S = loadStore().settings;
const pool = buildPool(S);
let kind = 'bingo';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Spaltenzahl wie in der Vorlage: 0–20 ergibt 7 × 3, große Zahlenräume 10 pro Reihe
function lottoCols(n) {
  if (n <= 10) return n;
  if (n <= 24) return Math.ceil(n / 3);
  return 10;
}

function count() {
  return Math.min(40, Math.max(1, +$('#cardCount').value || 1));
}

function show(html, status, ok) {
  $('#cards').innerHTML = html;
  $('#cardStatus').textContent = status;
  $('#cardPrint').disabled = !ok;
}

function makeBingo() {
  const n = +$('#cardSize').value;
  const cells = n * n;
  const nums = pool.topf;
  if (nums.length < cells) {
    show('', `Für ${n} × ${n} braucht man ${cells} verschiedene Zahlen, im Topf sind aber nur ${nums.length}. `
      + 'Bitte kleinere Karten wählen oder im Würfel mehr Zahlen in den Topf legen.', false);
    return;
  }
  const sorted = $('#cardSorted').checked;
  let html = '';
  for (let c = 0; c < count(); c++) {
    const card = shuffle(nums).slice(0, cells);
    if (sorted) card.sort((a, b) => a - b);
    html += `<div class="bingo-card">
      <div class="title">Mathe-Bingo</div>
      <div class="sub">${describe(S)}</div>
      <div class="card-grid schrift" style="--n:${n}">${card.map((x) => `<div>${x}</div>`).join('')}</div>
    </div>`;
  }
  show(html, `${count()} Bingokarten mit je ${cells} Zahlen. Bei jedem Klick auf „Erstellen“ werden sie neu gemischt.`, true);
}

function makeLotto() {
  const nums = pool.topf;
  if (!nums.length) { show('', 'Im Topf sind keine Zahlen.', false); return; }
  const sheet = `<div class="lotto-sheet">
      <div class="lotto-head"><span class="lotto-title">Lotto-Schein von <span class="line"></span></span>
        <span class="lotto-sub">${describe(S)}</span></div>
      <div class="lotto-grid schrift" style="--cols:${lottoCols(nums.length)}">${nums.map((x) => `<div>${x}</div>`).join('')}</div>
    </div>`;
  show(sheet.repeat(count()), `${count()} Lottoscheine mit allen ${nums.length} Zahlen aus dem Topf.`, true);
}

function make() {
  $('#cards').classList.toggle('lotto', kind === 'lotto');
  if (kind === 'lotto') makeLotto(); else makeBingo();
}

function setKind(k) {
  kind = k;
  for (const b of $$('#printKind [data-kind]')) b.classList.toggle('on', b.dataset.kind === k);
  for (const el of $$('.bingo-only')) el.hidden = k !== 'bingo';
  show('', '', false);
}

const ex = S.excluded.filter((r) => pool.results.includes(r));
$('#printInfo').innerHTML = `Aus den <b>${pool.topf.length} Zahlen im Topf</b>: ${describe(S)}`
  + (ex.length ? ` · herausgenommen: ${ex.join(', ')}` : '')
  + '<br><span class="tiny">Ändern über ⚙️ im Würfel.</span>';

$('#printKind').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kind]');
  if (b) setKind(b.dataset.kind);
});
$('#cardGen').addEventListener('click', make);
$('#cardPrint').addEventListener('click', () => window.print());
