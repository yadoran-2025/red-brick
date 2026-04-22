// ═══════════════════════════════════════
//  MATERIAL DEFAULTS
// ═══════════════════════════════════════
const MATERIAL_DEFAULTS = [
  { id: 'red_brick', name: '빨간 벽돌', emoji: '🧱', missionNeed: 2 },
  { id: 'iron', name: '철근', emoji: '🔩', missionNeed: 1 },
  { id: 'blue_brick', name: '파란 벽돌', emoji: '🔷', missionNeed: 0 },
  { id: 'cement', name: '시멘트', emoji: '🪨', missionNeed: 1 },
  { id: 'urethane', name: '우레탄', emoji: '🟡', missionNeed: 0 },
  { id: 'plywood', name: '나무합판', emoji: '🪵', missionNeed: 1 },
];

// 팀 수 → 권장 카드 수량 (확정 규칙)
// 빨간 벽돌 : 팀수 × 2 + 1
// 철근      : 팀수 + 1
// 파란 벽돌 : 항상 1장 (고정)
// 시멘트    : 팀수
// 우레탄    : 항상 20장 (고정)
// 나무합판  : 팀수 - 1
function calcRecommendedStock(n) {
  return {
    red_brick: n * 2 + 1,
    iron: n + 1,
    blue_brick: 1,
    cement: n,
    urethane: 20,
    plywood: Math.max(1, n - 1),
  };
}

// ═══════════════════════════════════════
//  RUNTIME STATE
// ═══════════════════════════════════════
let currentSlotName = null;
let teams = [];
let materials = [];
let curIdx = 0;
let curBid = 1;
let logs = [];
let saleHistory = [];       // { matId, price, teamName }
let chartMatId = 'red_brick';
let timerSec = 60;
let timerRunning = false;
let timerInterval = null;

// ═══════════════════════════════════════
//  TAB
// ═══════════════════════════════════════
function switchTab(id) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === id));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + id));
  if (id === 'auction') refreshAuctionUI();
  if (id === 'score') renderScore();
}
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

// ═══════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════
function buildSetupForm() {
  const n = parseInt(document.getElementById('teamCount').value);
  const rec = calcRecommendedStock(n);

  // 팀 이름
  let html = '';
  for (let i = 1; i <= n; i++) {
    html += `<div style="margin-bottom:0.45rem;">
      <label>팀 ${i} 이름</label>
      <input type="text" id="tname${i}" value="${i}팀">
    </div>`;
  }
  document.getElementById('teamNameInputs').innerHTML = html;

  // 재료 수량 (자동 계산값 표시, 직접 수정 가능)
  document.getElementById('stockInputs').innerHTML = MATERIAL_DEFAULTS.map((m, i) => {
    const auto = rec[m.id];
    const fixed = (m.id === 'blue_brick' || m.id === 'urethane' || m.id === 'plywood');
    const fixedLabel = m.id === 'blue_brick' ? '고정 1장' : m.id === 'urethane' ? '고정 20장' : m.id === 'plywood' ? '팀수-1' : '';
    return `<div class="stock-row">
      <span class="stock-name">${m.emoji} ${m.name}${fixed ? ` <span style="font-size:0.62rem;color:var(--red);margin-left:3px;">${fixedLabel}</span>` : ''}</span>
      <span class="stock-auto" id="auto${i}">권장 ${auto}장</span>
      <div class="stock-input-wrap">
        <input type="number" id="mstock${i}" value="${auto}" min="1" max="99" class="auto-set"
          ${fixed ? 'readonly' : `oninput="onStockInput(${i})"`}>
      </div>
    </div>`;
  }).join('');
}

function onTeamCountChange() {
  const n = parseInt(document.getElementById('teamCount').value);
  const rec = calcRecommendedStock(n);
  MATERIAL_DEFAULTS.forEach((m, i) => {
    const inp = document.getElementById('mstock' + i);
    const autoEl = document.getElementById('auto' + i);
    if (!inp) return;
    const auto = rec[m.id];
    inp.value = auto;
    inp.classList.add('auto-set');
    if (autoEl) autoEl.textContent = `권장 ${auto}장`;
  });
  // 팀 이름 입력란도 갱신
  buildSetupForm();
}

function onStockInput(idx) {
  const inp = document.getElementById('mstock' + idx);
  if (inp) inp.classList.remove('auto-set');
}

function applySetup() {
  const slotInput = document.getElementById('slotNameInput');
  currentSlotName = (slotInput && slotInput.value.trim()) ? slotInput.value.trim() : '기본슬롯';

  const n = parseInt(document.getElementById('teamCount').value);
  teams = [];
  for (let i = 1; i <= n; i++) {
    const el = document.getElementById('tname' + i);
    teams.push({ name: el ? (el.value.trim() || `${i}팀`) : `${i}팀`, money: 20, items: {} });
  }
  materials = MATERIAL_DEFAULTS.map((m, i) => {
    const stockEl = document.getElementById('mstock' + i);
    const stock = stockEl ? (parseInt(stockEl.value) || 1) : 1;
    return { ...m, stock, soldCount: 0 };
  });
  curIdx = 0; curBid = 1; logs = []; saleHistory = [];
  clearInterval(timerInterval); timerRunning = false; timerSec = 60;
  saveProgress();
  toast('설정 완료! 경매를 시작하세요 🎉');
  setTimeout(() => switchTab('auction'), 700);
}

// ═══════════════════════════════════════
//  AUCTION UI
// ═══════════════════════════════════════
function refreshAuctionUI() {
  const empty = teams.length === 0;
  document.getElementById('auction-empty').style.display = empty ? 'block' : 'none';
  document.getElementById('auction-main').style.display = empty ? 'none' : 'block';
  if (empty) return;
  updateStage(); updateTeamGrid(); updateQueue(); updateTimerDisplay();
  renderChartTabs(); renderChart();
}

function updateStage() {
  const m = materials[curIdx];
  const remaining = m.stock - m.soldCount;
  const pct = m.stock > 0 ? (remaining / m.stock * 100) : 0;
  document.getElementById('stageEmoji').textContent = m.emoji;
  document.getElementById('stageName').textContent = m.name;
  document.getElementById('stageStock').textContent = `남은 ${remaining}장 / 전체 ${m.stock}장`;
  const bar = document.getElementById('stockBarFill');
  bar.style.width = pct + '%';
  bar.style.background = pct <= 25 ? '#ff4444' : pct <= 50 ? 'var(--yellow)' : 'var(--red-light)';
  document.getElementById('bidNum').textContent = curBid;
  updateTeamBidBtns();
}

function updateTeamBidBtns() {
  const wrap = document.getElementById('teamBidBtns');
  if (!wrap) return;
  wrap.innerHTML = teams.map((t, i) => {
    const canAfford = t.money >= curBid;
    return `<button class="team-bid-btn${canAfford ? '' : ' no-money'}"
      onclick="${canAfford ? `sellTo(${i})` : ''}"
      ${canAfford ? '' : 'disabled title="잔액 부족"'}>
      ${t.name}
      <span class="tb-money">${t.money}어스 보유</span>
    </button>`;
  }).join('');
}

function updateTeamGrid() {
  document.getElementById('teamGrid').innerHTML = teams.map(t => `
    <div class="team-chip">
      <div class="tc-name">${t.name}</div>
      <div class="tc-money">${t.money}<span class="tc-unit"> 어스</span></div>
    </div>`).join('');
}

function updateQueue() {
  document.getElementById('queueList').innerHTML = materials.map((m, i) => {
    const done = m.soldCount >= m.stock;
    const cur = i === curIdx && !done;
    const cls = cur ? 'cur' : done ? 'done' : '';
    const onclick = (!done && !cur) ? `onclick="jumpToItem(${i})"` : '';
    const remaining = m.stock - m.soldCount;
    return `<div class="queue-row ${cls}" ${onclick}>
      <div class="qnum">${i + 1}</div>
      <span>${m.emoji} ${m.name}</span>
      <span class="qcount">${done ? '매진' : `${remaining}/${m.stock}`}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════
//  BID
// ═══════════════════════════════════════
function changeBid(delta) {
  curBid = Math.max(1, curBid + delta);
  document.getElementById('bidNum').textContent = curBid;
  updateTeamBidBtns();
}

function raiseBid() {
  curBid++;
  document.getElementById('bidNum').textContent = curBid;
  updateTeamBidBtns();
  addLog(`📢 ${materials[curIdx].name} — ${curBid}어스 호가`);
}

// 팀 버튼 직접 클릭 → 즉시 낙찰
function sellTo(ti) {
  const team = teams[ti];
  const mat = materials[curIdx];
  if (curBid > team.money) { toast(`❌ ${team.name} 잔액 부족!`); return; }

  team.money -= curBid;
  team.items[mat.id] = (team.items[mat.id] || 0) + 1;
  mat.soldCount++;
  saleHistory.push({ matId: mat.id, price: curBid, teamName: team.name });

  addLog(`🏷 [낙찰] ${team.name} ← ${mat.name} (${curBid}어스)`, true);
  toast(`✅ ${team.name} 낙찰 완료!`);

  if (mat.soldCount >= mat.stock) {
    addLog(`📦 ${mat.name} 매진!`);
    moveToNext();
  } else {
    curBid = 1;
    updateStage(); updateQueue();
  }
  updateTeamGrid();
  renderChartTabs(); renderChart();
  saveProgress();
}

function skipItem() {
  addLog(`⏭ ${materials[curIdx].name} 건너뜀`);
  moveToNext();
  saveProgress();
}

function jumpToItem(i) {
  curIdx = i; curBid = 1;
  updateStage(); updateQueue();
}

function moveToNext() {
  let next = curIdx + 1;
  while (next < materials.length && materials[next].soldCount >= materials[next].stock) next++;
  if (next < materials.length) curIdx = next;
  curBid = 1;
  updateStage(); updateQueue();
}

// ═══════════════════════════════════════
//  PRICE CHART
// ═══════════════════════════════════════
function renderChartTabs() {
  const el = document.getElementById('chartTabs');
  if (!el) return;
  el.innerHTML = MATERIAL_DEFAULTS.map(m => {
    const cnt = saleHistory.filter(s => s.matId === m.id).length;
    const on = m.id === chartMatId ? 'on' : '';
    return `<button class="chart-tab ${on}" onclick="setChartMat('${m.id}')">${m.emoji} ${m.name}${cnt > 0 ? ` <b style="color:var(--red)">${cnt}</b>` : ''}</button>`;
  }).join('');
}

function setChartMat(id) {
  chartMatId = id; renderChartTabs(); renderChart();
}

function renderChart() {
  const area = document.getElementById('chartArea');
  if (!area) return;
  const sales = saleHistory.filter(s => s.matId === chartMatId);
  if (sales.length === 0) {
    area.innerHTML = '<div class="no-data-msg">이 재료의 낙찰 기록이 없습니다.</div>';
    return;
  }

  const W = 320, H = 130, PL = 34, PR = 8, PT = 12, PB = 26;
  const prices = sales.map(s => s.price);
  const minP = Math.max(0, Math.min(...prices) - 1);
  const maxP = Math.max(...prices) + 1;
  const range = maxP - minP || 1;
  const toX = i => PL + i * (W - PL - PR) / Math.max(sales.length - 1, 1);
  const toY = p => PT + (1 - (p - minP) / range) * (H - PT - PB);

  const pts = sales.map((s, i) => `${toX(i).toFixed(1)},${toY(s.price).toFixed(1)}`).join(' ');

  // Y축 눈금 3개
  const yVals = [minP, Math.round((minP + maxP) / 2), maxP];
  const yGrid = yVals.map(v => {
    const y = toY(v).toFixed(1);
    return `<line x1="${PL}" y1="${y}" x2="${W - PR}" y2="${y}" stroke="#eee" stroke-width="1"/>
            <text x="${PL - 3}" y="${(parseFloat(y) + 3.5).toFixed(1)}" text-anchor="end" font-size="9" fill="#bbb">${v}</text>`;
  }).join('');

  // 면적 채우기
  const areaPath = `${PL},${toY(sales[0].price).toFixed(1)} ${pts} ${toX(sales.length - 1).toFixed(1)},${H - PB} ${PL},${H - PB}`;

  // 점 + 라벨 + X축(팀명)
  const dots = sales.map((s, i) => {
    const x = toX(i).toFixed(1), y = toY(s.price).toFixed(1);
    const labelY = parseFloat(y) < PT + 13 ? (parseFloat(y) + 13).toFixed(1) : (parseFloat(y) - 4).toFixed(1);
    const shortName = s.teamName.length > 3 ? s.teamName.slice(0, 3) : s.teamName;
    return `<circle cx="${x}" cy="${y}" r="4" fill="var(--red)" stroke="white" stroke-width="1.5"/>
            <text x="${x}" y="${labelY}" text-anchor="middle" font-size="9" fill="#333" font-weight="700">${s.price}</text>
            <text x="${x}" y="${H - 4}" text-anchor="middle" font-size="8" fill="#999">${shortName}</text>`;
  }).join('');

  area.innerHTML = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
    ${yGrid}
    <line x1="${PL}" y1="${PT}" x2="${PL}" y2="${H - PB}" stroke="#ddd" stroke-width="1"/>
    <line x1="${PL}" y1="${H - PB}" x2="${W - PR}" y2="${H - PB}" stroke="#ddd" stroke-width="1"/>
    <polyline points="${areaPath}" fill="var(--red)" fill-opacity="0.07" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

// ═══════════════════════════════════════
//  LOG
// ═══════════════════════════════════════
function addLog(text, isWin = false) {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  logs.unshift({ ts, text, isWin });
  const box = document.getElementById('logBox');
  if (!box) return;
  box.innerHTML = logs.map(l =>
    `<div class="log-row ${l.isWin ? 'win' : ''}"><span class="lt">${l.ts}</span><span class="lm">${l.text}</span></div>`
  ).join('');
}

// ═══════════════════════════════════════
//  TIMER
// ═══════════════════════════════════════
function resetTimer(sec) {
  clearInterval(timerInterval); timerRunning = false; timerSec = sec;
  document.getElementById('timerToggleBtn').textContent = '▶ 시작';
  updateTimerDisplay();
}
function toggleTimer() {
  if (timerRunning) {
    clearInterval(timerInterval); timerRunning = false;
    document.getElementById('timerToggleBtn').textContent = '▶ 재개';
  } else {
    timerRunning = true;
    document.getElementById('timerToggleBtn').textContent = '⏸ 정지';
    timerInterval = setInterval(() => {
      timerSec--;
      updateTimerDisplay();
      if (timerSec <= 0) {
        clearInterval(timerInterval); timerRunning = false;
        document.getElementById('timerToggleBtn').textContent = '▶ 시작';
        toast('⏰ 시간 종료!');
      }
    }, 1000);
  }
}
function updateTimerDisplay() {
  const el = document.getElementById('timerDisplay');
  if (!el) return;
  const m = Math.floor(timerSec / 60), s = timerSec % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  el.classList.toggle('warn', timerSec <= 10 && timerSec > 0);
}

// ═══════════════════════════════════════
//  SCORE
// ═══════════════════════════════════════
function renderScore() {
  const card = document.getElementById('scoreCard');
  if (!teams.length) {
    card.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);">설정 후 경매를 진행하면 결과가 표시됩니다.</div>';
    return;
  }
  const MISSION = {};
  MATERIAL_DEFAULTS.forEach(m => { if (m.missionNeed > 0) MISSION[m.id] = m.missionNeed; });
  let bestTeam = null, bestCost = Infinity;
  const rows = teams.map(t => {
    const spent = 20 - t.money;
    const ok = Object.entries(MISSION).every(([k, n]) => (t.items[k] || 0) >= n);
    if (ok && spent < bestCost) { bestCost = spent; bestTeam = t.name; }
    return `<tr>
      <td><b>${t.name}</b></td><td>${t.money}</td>
      <td>${t.items.red_brick || 0}</td><td>${t.items.iron || 0}</td><td>${t.items.blue_brick || 0}</td>
      <td>${t.items.cement || 0}</td><td>${t.items.urethane || 0}</td><td>${t.items.plywood || 0}</td>
      <td>${spent}</td>
      <td>${ok ? '<span class="ms-ok">✅ 성공</span>' : '<span class="ms-fail">❌ 미달</span>'}</td>
    </tr>`;
  }).join('');
  const winnerHtml = bestTeam
    ? `<div class="winner-box"><div style="font-size:2rem;">🏆</div>
       <div style="font-family:'Black Han Sans',sans-serif;font-size:1.5rem;color:var(--red);margin:0.3rem 0;">${bestTeam} 우승!</div>
       <div style="color:var(--muted);font-size:0.85rem;">최저 비용 ${bestCost}어스로 미션 성공!</div></div>` : '';
  card.innerHTML = `<div style="overflow-x:auto"><table class="score-table">
    <thead><tr><th>팀</th><th>잔액</th><th>🧱빨간벽돌</th><th>🔩철근</th><th>🔷파란벽돌</th><th>🪨시멘트</th><th>🟡우레탄</th><th>🪵나무합판</th><th>총지출</th><th>미션</th></tr></thead>
    <tbody>${rows}</tbody></table></div>${winnerHtml}`;
}

// ═══════════════════════════════════════
//  저장 / 복구 (localStorage 다중 슬롯)
// ═══════════════════════════════════════
const SAVE_PREFIX = 'auction_class_save_';

function saveProgress() {
  if (!currentSlotName) return;
  try {
    localStorage.setItem(SAVE_PREFIX + currentSlotName, JSON.stringify({
      slotName: currentSlotName, teams, materials, curIdx, curBid, logs, saleHistory, savedAt: new Date().toISOString()
    }));
    showSaveStatus();
  } catch (e) { }
}

function showSaveStatus() {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  const now = new Date();
  const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  el.textContent = `💾 [${currentSlotName}] ${t} 자동저장 완료`;
  el.style.color = 'var(--green)';
  setTimeout(() => { el.style.color = 'var(--muted)'; }, 2000);
}

function checkSavedSessions() {
  let saves = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(SAVE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && data.teams) saves.push({ key, data });
      } catch (e) { }
    }
  }

  if (saves.length > 0) {
    saves.sort((a, b) => new Date(b.data.savedAt) - new Date(a.data.savedAt));
    document.getElementById('restoreModal').classList.add('open');
    const listEl = document.getElementById('restoreSlotList');
    listEl.innerHTML = saves.map(s => {
      const savedAt = new Date(s.data.savedAt);
      const timeStr = `${savedAt.getMonth() + 1}/${savedAt.getDate()} ${String(savedAt.getHours()).padStart(2, '0')}:${String(savedAt.getMinutes()).padStart(2, '0')}`;
      return `<div class="slot-row" id="row-${s.key}">
        <div class="slot-info">
          <span class="slot-name">📁 ${s.data.slotName || '이름 없음'}</span>
          <span class="slot-time">최근 기록: ${timeStr} </span>
        </div>
        <div class="slot-btns">
          <button class="btn btn-red" style="font-size:0.85rem;padding:0.6rem 1.2rem;min-width:80px;" onclick="doRestore('${s.key}')">이어하기</button>
          <button class="btn btn-ghost" style="font-size:0.85rem;padding:0.6rem 1.2rem;min-width:80px;" onclick="deleteSlot('${s.key}')">삭제</button>
        </div>
      </div>`;
    }).join('');
  }
}

function doRestore(key) {
  const data = JSON.parse(localStorage.getItem(key));
  currentSlotName = data.slotName || key.replace(SAVE_PREFIX, '');
  teams = data.teams;
  materials = data.materials;
  curIdx = data.curIdx;
  curBid = data.curBid;
  logs = data.logs || [];
  saleHistory = data.saleHistory || [];

  clearInterval(timerInterval); timerRunning = false; timerSec = 60;

  const setupNameInput = document.getElementById('slotNameInput');
  if (setupNameInput) setupNameInput.value = currentSlotName;
  const teamCountSelect = document.getElementById('teamCount');
  if (teamCountSelect) teamCountSelect.value = teams.length;

  switchTab('auction');

  const box = document.getElementById('logBox');
  if (box && logs.length) {
    box.innerHTML = logs.map(l =>
      `<div class="log-row ${l.isWin ? 'win' : ''}"><span class="lt">${l.ts}</span><span class="lm">${l.text}</span></div>`
    ).join('');
  }

  closeRestoreModal();
  toast(`✅ [${currentSlotName}] 이어서 진행합니다.`);
}

function deleteSlot(key) {
  if (confirm('이 진행 상황 기록을 정말 삭제하시겠습니까?')) {
    localStorage.removeItem(key);
    const row = document.getElementById('row-' + key);
    if (row) row.remove();
    const listEl = document.getElementById('restoreSlotList');
    if (!listEl || listEl.innerHTML.trim() === '') closeRestoreModal();
    toast('🗑 기록이 삭제되었습니다.');
  }
}

function closeRestoreModal() {
  const modal = document.getElementById('restoreModal');
  if (modal) modal.classList.remove('open');
}

// ═══════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════
//  INIT
// ═══════════════════════════════════════
buildSetupForm();
checkSavedSessions();
