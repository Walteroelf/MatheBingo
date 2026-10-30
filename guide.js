'use strict';

// Anleitung wie beim ABC-Bingo: README.md als Fenster über dem Menü, statt auf GitHub.
// Kleiner Umwandler nur für das, was im README vorkommt: Überschriften, Absätze, Listen
// (auch eingerückte Unterpunkte), Tabellen, Codeblöcke, fett, kursiv, Code und Links.

function mdInline(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\(#([^)\s]+)\)/g, '<a href="#$2" data-anchor="$2">$1</a>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/&lt;(https?:[^&\s]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function mdSlug(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/ /g, '-');
}

function mdToHtml(md) {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    let m;
    if (!l.trim()) { i++; continue; }
    if (l.startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      out.push(`<pre><code>${mdInline(code.join('\n')).replace(/<\/?(b|i|code)>/g, '')}</code></pre>`);
      continue;
    }
    if ((m = l.match(/^(#{1,3}) (.*)/))) {
      const n = m[1].length;
      out.push(`<h${n} id="g-${mdSlug(m[2])}">${mdInline(m[2])}</h${n}>`);
      i++;
      continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => mdInline(c.trim()));
      const head = cells(rows[0]).map((c) => `<th>${c}</th>`).join('');
      const body = rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }
    if ((m = l.match(/^(\d+\.|-) /))) {
      const tag = m[1] === '-' ? 'ul' : 'ol';
      const items = [];   // { text, sub: [] }
      while (i < lines.length) {
        const mm = lines[i].match(/^(\d+\.|-) (.*)/);
        const sub = lines[i].match(/^\s+- (.*)/);
        const last = items[items.length - 1];
        if (mm) items.push({ text: mm[2], sub: [] });
        else if (sub && last) last.sub.push(sub[1]);
        else if (/^\s+\S/.test(lines[i]) && last) {
          if (last.sub.length) last.sub[last.sub.length - 1] += ` ${lines[i].trim()}`;
          else last.text += ` ${lines[i].trim()}`;
        } else break;
        i++;
      }
      out.push(`<${tag}>${items.map((it) => `<li>${mdInline(it.text)}${it.sub.length
        ? `<ul>${it.sub.map((t) => `<li>${mdInline(t)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</${tag}>`);
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |\||\d+\. |- |```)/.test(lines[i])) p.push(lines[i++].trim());
    out.push(`<p>${mdInline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

let guideLoaded = false;

function openGuide() {
  const body = $('#guideBody');
  $('#guide').hidden = false;
  body.scrollTop = 0;
  if (guideLoaded) return;
  body.textContent = 'Lädt …';
  fetch('README.md', { cache: 'no-cache' })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then((md) => { body.innerHTML = mdToHtml(md); guideLoaded = true; })
    .catch(() => {
      body.innerHTML = '<p>Die Anleitung ist gerade nicht erreichbar (kein Internet?).</p>'
        + '<p><a href="https://github.com/Walteroelf/MatheBingo#readme" target="_blank" rel="noopener">Anleitung auf GitHub öffnen</a></p>';
    });
}

function bindGuide() {
  $('#btnGuide').addEventListener('click', openGuide);
  $('#btnCloseGuide').addEventListener('click', () => { $('#guide').hidden = true; });
  $('#guide').addEventListener('click', (e) => {
    if (e.target.id === 'guide') { $('#guide').hidden = true; return; }
    const a = e.target.closest('a[data-anchor]');
    if (!a) return;
    e.preventDefault();
    const target = document.getElementById(`g-${a.dataset.anchor}`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
