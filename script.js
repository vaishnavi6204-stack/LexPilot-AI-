let fileText = '', lastResult = null;

const fi = document.getElementById('file-input');
const dz = document.getElementById('drop-zone');
const fp = document.getElementById('file-pill');

fi.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
document.getElementById('btn-remove').addEventListener('click', e => {
  e.stopPropagation(); fileText = ''; fi.value = ''; fp.classList.remove('show');
});
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('over');
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});

function loadFile(f) {
  document.getElementById('pill-name').textContent = f.name;
  document.getElementById('pill-meta').textContent = fmt(f.size) + ' · ' + (f.type.split('/')[1] || 'txt').toUpperCase();
  fp.classList.add('show');
  const r = new FileReader();
  r.onload = e => fileText = e.target.result;
  r.readAsText(f);
}

function fmt(b) {
  return b < 1024 ? b + 'B' : b < 1048576 ? (b / 1024).toFixed(1) + 'KB' : (b / 1048576).toFixed(1) + 'MB';
}

async function runAnalysis() {
  const text = fileText || document.getElementById('contract-text').value.trim();
  if (!text) { showErr('Please upload a file or paste your contract text first.'); return; }
  clearErr();
  setForm(false);
  document.getElementById('loading-overlay').classList.add('show');
  document.getElementById('results-wrapper').classList.remove('show');
  animateAgents();

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 6000) })
    });

    if (res.status === 429) throw new Error('Daily limit reached for your connection. Please try again tomorrow.');
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || 'Server error. Please try again.');
    }

    const result = await res.json();
    lastResult = result;
    await new Promise(r => setTimeout(r, 1200));
    document.getElementById('loading-overlay').classList.remove('show');
    renderResults(result);
  } catch (err) {
    document.getElementById('loading-overlay').classList.remove('show');
    setForm(true);
    showErr('Something went wrong: ' + (err.message || 'Please try again.'));
  }
}

function animateAgents() {
  ['ag1','ag2','ag3','ag4','ag5'].forEach(id => document.getElementById(id).className = 'agent-node');
  let i = 0;
  const ids = ['ag1','ag2','ag3','ag4','ag5'];
  const t = setInterval(() => {
    if (i > 0) { document.getElementById(ids[i-1]).classList.remove('active'); document.getElementById(ids[i-1]).classList.add('done'); }
    if (i < ids.length) { document.getElementById(ids[i]).classList.add('active'); i++; }
    else clearInterval(t);
  }, 700);
}

function renderResults(r) {
  const score = Math.max(0, Math.min(100, r.score));
  const numEl = document.getElementById('gauge-num');
  numEl.textContent = score;
  numEl.style.color = score >= 75 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)';

  document.getElementById('score-verdict').textContent = r.verdict || 'Review complete';
  document.getElementById('score-summary').textContent = r.summary;
  document.getElementById('conf-val').textContent = r.confidence;

  const h = r.clauses.filter(c => c.risk === 'HIGH').length;
  const m = r.clauses.filter(c => c.risk === 'MEDIUM').length;
  const s = r.clauses.filter(c => c.risk === 'STANDARD').length;
  document.getElementById('score-tags').innerHTML =
    (h ? `<span class="score-tag tag-red">${h} need attention</span>` : '') +
    (m ? `<span class="score-tag tag-amber">${m} worth reviewing</span>` : '') +
    (s ? `<span class="score-tag tag-green">${s} standard</span>` : '');

  renderGroup(r.clauses.filter(c => c.risk === 'HIGH'), 'list-high', 'sec-high', 'accent-red', 'chip-red', 'Needs attention');
  renderGroup(r.clauses.filter(c => c.risk === 'MEDIUM'), 'list-medium', 'sec-medium', 'accent-amber', 'chip-amber', 'Worth reviewing');
  renderGroup(r.clauses.filter(c => c.risk === 'STANDARD'), 'list-standard', 'sec-standard', 'accent-green', 'chip-green', 'Standard');

  if (r.recommendations?.length) {
    document.getElementById('rec-list').innerHTML = r.recommendations.map(rec => `<li><span class="rec-arrow">→</span>${rec}</li>`).join('');
    document.getElementById('rec-card').style.display = 'block';
  }
  document.getElementById('results-wrapper').classList.add('show');
  document.getElementById('results-wrapper').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderGroup(clauses, listId, secId, accentCls, chipCls, label) {
  const sec = document.getElementById(secId);
  if (!clauses.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  document.getElementById(listId).innerHTML = clauses.map(c => `
    <div class="clause-card">
      <div class="clause-accent ${accentCls}"></div>
      <div class="clause-body">
        <div class="clause-row">
          <div class="clause-name">${c.name}</div>
          <span class="risk-chip ${chipCls}">${label}</span>
        </div>
        <div class="clause-issue">${c.issue}</div>
        <span class="clause-law">§ ${c.law}</span>
      </div>
    </div>`).join('');
}

function downloadReport() {
  if (!lastResult) return;
  const r = lastResult;
  const lines = [
    'LEXPILOT — CONTRACT REVIEW REPORT',
    '='.repeat(52),
    `Score      : ${r.score}/100`,
    `Confidence : ${r.confidence}`,
    `Verdict    : ${r.verdict}`,
    '',
    'SUMMARY',
    r.summary,
    '',
    'CLAUSE BREAKDOWN',
    '-'.repeat(52)
  ];
  ['HIGH','MEDIUM','STANDARD'].forEach(lv => {
    const g = r.clauses.filter(c => c.risk === lv);
    if (g.length) {
      lines.push(`\n${lv === 'HIGH' ? 'NEEDS ATTENTION' : lv === 'MEDIUM' ? 'WORTH REVIEWING' : 'STANDARD'}`);
      g.forEach(c => {
        lines.push(`  · ${c.name}`);
        lines.push(`    ${c.issue}`);
        lines.push(`    Ref: ${c.law}`);
      });
    }
  });
  lines.push('', 'WHAT TO DO NEXT', '-'.repeat(52));
  r.recommendations?.forEach(rec => lines.push(`  → ${rec}`));
  lines.push('', '', 'Generated by LexPilot · Team Agentic Avengers · The Arch Hackathon');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
  a.download = 'LexPilot_Report.txt';
  a.click();
}

function resetAll() {
  fileText = ''; fi.value = '';
  document.getElementById('contract-text').value = '';
  fp.classList.remove('show');
  document.getElementById('results-wrapper').classList.remove('show');
  document.getElementById('loading-overlay').classList.remove('show');
  clearErr(); setForm(true);
  document.getElementById('analyzer-section').scrollIntoView({ behavior: 'smooth' });
}

function setForm(show) {
  ['drop-zone','contract-text','btn-analyze'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
  document.querySelectorAll('.or-row,.paste-label').forEach(el => el.style.display = show ? '' : 'none');
}

function showErr(msg) { const e = document.getElementById('error-msg'); e.textContent = msg; e.classList.add('show'); }
function clearErr() { document.getElementById('error-msg').classList.remove('show'); }
