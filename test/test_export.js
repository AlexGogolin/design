const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const WS = '/workspace';
const html = fs.readFileSync(path.join(WS, 'index.html'), 'utf8')
  .replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/, '');

const vc = new VirtualConsole();
vc.on('jsdomError', e => console.error('JSDOM ERROR:', e.message));
vc.on('error', (...a) => console.error('console.error:', ...a));

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
});
const { window } = dom;

window.fetch = async (u) => {
  const p = path.join(WS, u.replace(/^\.\//, ''));
  try {
    const buf = fs.readFileSync(p);
    return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch (e) {
    return { ok: false };
  }
};
window.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
window.Blob = class Blob { constructor(parts){ this._buf = Buffer.concat(parts.map(p=>Buffer.from(p))); } };
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};

// load jsPDF UMD into window (same CDN build the page uses)
window.TextEncoder = TextEncoder; window.TextDecoder = TextDecoder;
const jspdfSrc = fs.readFileSync('/tmp/jspdf.umd.min.js', 'utf8');
try { window.eval(jspdfSrc); } catch(e){ console.error('jspdf eval error:', e.message); }
if (!window.jspdf) {
  const mod = require('jspdf');
  window.jspdf = mod.jsPDF ? mod : mod.default;
}
console.log('jspdf loaded:', !!window.jspdf, window.jspdf && Object.keys(window.jspdf).join(','));

let saved = null;
window.jspdf.jsPDF.prototype.save = function(name){
  saved = { name, buffer: Buffer.from(this.output('arraybuffer')) };
  console.log('SAVED:', name, saved.buffer.length, 'bytes');
};

// run page scripts (await async IIFEs so font loading completes)
let p = Promise.resolve();
[...window.document.querySelectorAll('script')].forEach(s => {
  try { const r = window.eval(s.textContent); if (r && r.then) p = p.then(()=>r.catch(()=>{})); } catch(e){ console.error('PAGE SCRIPT ERROR:', e.message); }
});

setTimeout(async () => {
  const d = window.document;
  const cb = q => { const el = d.querySelector(`input[data-q="${q}"]`); if(!el){ console.error('NOT FOUND checkbox:', q); return;} el.checked = true; };
  cb('Стиль: Неоклассика'); cb('Стиль: Лофт'); cb('Помещения: Кухня'); cb('Помещения: Спальня');
  cb('Гостиная: Диван'); cb('Спальня: Комод'); cb('Ванная: Душ'); cb('Цвета: Бежевый');
  cb('Декор: Зеркала'); cb('Материалы: Дерево'); cb('Электрика: USB-розетки'); cb('Интерьер это: Уют');
  cb('Формы: Круг'); cb('Общение: Telegram');
  const radio = (name,val)=>{ const els=[...d.querySelectorAll(`input[name="${name}"]`)]; const el=els.find(e=>e.parentElement.textContent.trim()===val); if(el) el.checked=true; else console.error('radio not found',name,val); };
  radio('bti','Да'); radio('aes','Практичность'); radio('exp','Да'); radio('mirror','Да');
  const txt = (q,v)=>{ const el=d.querySelector(`[data-q="${q}"]`); if(!el){console.error('NOT FOUND field:',q);return;} el.value=v; };
  txt('Размеры кухни','3,5 × 4,2 м, потолок 2,7 м');
  txt('Пожелания по объединению зон','Хочу кухню-гостиную с островом');
  txt('Гостиная: Особые пожелания','Много растений, тёплый свет');
  txt('Бюджет под ключ','12 000 000 ₽');
  txt('Страны-производители','Италия, Германия');
  const vrows = d.querySelectorAll('.visit-row');
  vrows[0].querySelectorAll('input')[0].value='Иванов И.И.';
  vrows[0].querySelectorAll('input')[1].value='2026-05-14';
  vrows[0].querySelectorAll('input')[2].value='Салон кухни, Москва';

  console.log('PROGRESS:', d.getElementById('progLabel').textContent);

  d.getElementById('downloadPdf').click();
  await new Promise(r=>setTimeout(r, 2000));

  if(saved){
    fs.writeFileSync('/tmp/out_test.pdf', saved.buffer);
    console.log('PDF written /tmp/out_test.pdf');
    process.exit(0);
  } else {
    console.error('NO PDF SAVED');
    process.exit(1);
  }
}, 800));
