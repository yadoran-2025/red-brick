const materials = [
  { id:'red_brick', name:'빨간 벽돌', color:'#bc3d2e', need:2 },
  { id:'iron', name:'철근', color:'#778592', need:1 },
  { id:'blue_brick', name:'파란 벽돌', color:'#527e9e', need:0 },
  { id:'cement', name:'시멘트', color:'#a9afb0', need:1 },
  { id:'urethane', name:'우레탄', color:'#e2bf56', need:0 },
  { id:'plywood', name:'나무합판', color:'#ba9461', need:1 },
];
const teamColors = [['#eaf0f5','#456c87'],['#f3ece5','#94734e'],['#eaf1ec','#52775e'],['#eeeaf3','#77638e']];
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const recommendedStock = n => [n*2+1,n+1,1,n,20,n-1];
let teams = ['1팀','2팀','3팀','4팀'];
let stock = recommendedStock(4);
let sales = [1,2,3,2].map((price,team) => ({material:0,team,price,qty:1}));
let current = 0, bid = 3, qty = 1, selected = -1, chartMaterial = 0, setupCount = 4, noticeTimer;

function balance(team){return 20-sales.filter(s=>s.team===team).reduce((sum,s)=>sum+s.price,0)}
function owned(team,material){return sales.filter(s=>s.team===team&&s.material===material).reduce((sum,s)=>sum+s.qty,0)}
function remaining(material){return stock[material]-sales.filter(s=>s.material===material).reduce((sum,s)=>sum+s.qty,0)}
function progress(team){return materials.reduce((sum,m,i)=>sum+Math.min(m.need,owned(team,i)),0)}
function swatch(m){return `<span class="swatch ${m.id}" style="--material:${m.color}" aria-hidden="true"></span>`}
function teamTitle(team,i){const [bg,color]=teamColors[i%teamColors.length];return `<span class="team-title" style="--team-bg:${bg};--team-color:${color}"><span class="team-number">${i+1}</span>${escapeHTML(team)}</span>`}
function announce(message){clearTimeout(noticeTimer);$('#announcement').textContent=message;noticeTimer=setTimeout(()=>{$('#announcement').textContent=''},2500)}

function showPage(id){
  if(!['setup','auction','results'].includes(id))id='auction';
  document.body.classList.toggle('auction-open',id==='auction');
  document.body.classList.remove('projecting');
  $('#project').innerHTML='학생 화면 보기 <span aria-hidden="true">↗</span>';
  document.querySelectorAll('.page').forEach(page=>page.hidden=page.id!==id);
  document.querySelectorAll('nav [data-page]').forEach(button=>{
    if(button.dataset.page===id)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  history.replaceState(null,'','#'+id);
  if(id==='results')renderResults();
}

function render(){
  if(selected>=0&&(balance(selected)<bid||remaining(current)<qty))selected=-1;
  const m=materials[current], left=remaining(current);
  $('#round-label').textContent=`${current+1} / ${materials.length}번째 재료`;
  $('#remaining').textContent=`${left} / ${stock[current]}장 남음`;
  $('#material-name').textContent=m.name;
  $('.material-object').className=`material-object ${m.id}`;
  $('#bid').textContent=bid;
  $('#bid-label').textContent=qty===1?'현재 입찰가':`${qty}장 묶음 입찰가`;
  $('#quantity').textContent=qty;
  $('#lot-count').textContent=`×${qty}`;
  $('[data-qty="-1"]').disabled=qty<=1;
  $('[data-qty="1"]').disabled=qty>=left;
  $('[data-bid="-1"]').disabled=bid<=1;
  $('#material-list').innerHTML=materials.map((m,i)=>`<button class="material-row" data-material="${i}" aria-pressed="${i===current}">${swatch(m)}<span>${m.name}</span><span class="stock">${remaining(i)}장</span></button>`).join('');
  $('#team-list').innerHTML=teams.map((team,i)=>`<div class="team-row" data-balance="${balance(i)}" style="--team-color:${teamColors[i%4][1]}"><div class="team-summary">${teamTitle(team,i)}<strong class="team-money">${balance(i)}</strong></div><span class="spent-label student-only">잔액 소진</span><div class="team-progress teacher-only"><div class="completion-bar" aria-hidden="true">${Array.from({length:5},(_,j)=>`<span class="${j<progress(i)?'owned':''}"></span>`).join('')}</div><span class="completion-caption">집짓기 재료 ${progress(i)} / 5장</span></div></div>`).join('');
  $('#team-list').style.setProperty('--team-count',teams.length);
  $('#team-picks').innerHTML=teams.map((team,i)=>`<button class="team-pick" data-team="${i}" aria-pressed="${i===selected}" ${balance(i)<bid||left<qty?'disabled':''}>${escapeHTML(team)}</button>`).join('');
  $('#team-picks').style.setProperty('--team-count',teams.length);
  $('#sell').disabled=selected<0||left<qty;
  $('#sell').textContent=left===0?'이 재료는 모두 팔렸어요':selected<0?'팀을 선택하세요':`${teams[selected]} · ${bid}어스 낙찰 확정`;
  $('#undo').disabled=sales.length===0;
  $('#sale-count').textContent=`${sales.length}건`;
  $('#recent-sales').innerHTML=sales.slice(-3).reverse().map(s=>`<div class="sale-log"><span class="sale-thumb" aria-hidden="true"><span class="material-object ${materials[s.material].id}"><i></i><i></i><i></i></span></span><strong>${escapeHTML(teams[s.team])}</strong><span class="sale-material"><span>${materials[s.material].name}</span>${s.qty>1?`<span class="sale-qty" aria-label="${s.qty}장">×${s.qty}</span>`:''}</span><b>${s.price}어스</b></div>`).join('')||'<p class="empty">첫 낙찰을 기다리고 있어요.</p>';
  renderResults();
}

function renderSetup(){
  const names=Array.from(document.querySelectorAll('[data-name]'),input=>input.value);
  $('#name-fields').innerHTML=Array.from({length:setupCount},(_,i)=>`<div><label for="team-name-${i}">${i+1}팀 이름</label><input id="team-name-${i}" data-name="${i}" maxlength="24" value="${escapeHTML(names[i]||teams[i]||`${i+1}팀`)}" required></div>`).join('');
  $('#stock-fields').innerHTML=materials.map((m,i)=>`<tr><td>${swatch(m)}${m.name}</td><td>${m.need?`${m.need}장`:'—'}</td><td><input type="number" aria-label="${m.name} 전체 수량" data-stock="${i}" value="${recommendedStock(setupCount)[i]}" min="1" max="99" step="1" required></td></tr>`).join('');
  document.querySelectorAll('[data-count]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.count)===setupCount)));
}

function renderResults(){
  $('#results-status').textContent=`${sales.length}건 낙찰 · 현재까지의 결과`;
  $('#results-body').innerHTML=teams.map((team,i)=>`<tr><td>${teamTitle(team,i)}</td>${[0,1,3,5].map(m=>`<td class="${owned(i,m)>=materials[m].need?'complete':'count'}">${owned(i,m)} / ${materials[m].need}</td>`).join('')}<td><strong>${balance(i)}</strong></td><td><span class="result-label ${progress(i)===5?'success':''}">${progress(i)===5?'완성':'짓는 중'}</span></td></tr>`).join('');
  $('#chart-picks').innerHTML=materials.map((m,i)=>`<button data-chart="${i}" aria-pressed="${i===chartMaterial}"><span class="chart-icon" aria-hidden="true"><span class="material-object ${m.id}"><i></i><i></i><i></i></span></span><span>${m.name}</span></button>`).join('');
  const points=sales.filter(s=>s.material===chartMaterial);
  const unitPrices=points.map(s=>s.price/s.qty);
  const priceFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
  const max=Math.max(2,Math.ceil(Math.max(1,...unitPrices)/2)*2);
  const coordinates=unitPrices.map((price,i)=>[points.length===1?251:44+i*414/(points.length-1),184-price/max*132]);
  $('#chart').innerHTML=points.length?`<div class="line-chart"><svg viewBox="0 0 480 240" role="img" aria-label="${materials[chartMaterial].name} 장당 낙찰 단가 순서: ${unitPrices.map(price=>`${priceFormat.format(price)}어스`).join(', ')}">
    ${[0,max/2,max].map(value=>`<line class="chart-grid" x1="44" x2="458" y1="${184-value/max*132}" y2="${184-value/max*132}"/><text class="chart-tick" x="28" y="${189-value/max*132}" text-anchor="end">${value}</text>`).join('')}
    <polyline class="price-line" points="${coordinates.map(p=>p.join(',')).join(' ')}"/>
    ${points.map((s,i)=>`<g class="price-point"><title>${escapeHTML(teams[s.team])} · ${s.qty}장 ${s.price}어스 · 단가 ${priceFormat.format(unitPrices[i])}어스/장</title><circle cx="${coordinates[i][0]}" cy="${coordinates[i][1]}" r="5"/><text class="point-value" x="${coordinates[i][0]}" y="${coordinates[i][1]-15}">${priceFormat.format(unitPrices[i])}</text><text class="chart-tick" x="${coordinates[i][0]}" y="216">${i+1}회</text></g>`).join('')}
  </svg></div>`:'<p class="empty">이 재료의 낙찰 기록은 아직 없어요.</p>';
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  if(button.dataset.page)showPage(button.dataset.page);
  if(button.dataset.material!==undefined){current=Number(button.dataset.material);bid=1;qty=1;selected=-1;render()}
  if(button.dataset.bid){bid=Math.min(999,Math.max(1,bid+Number(button.dataset.bid)));render()}
  if(button.dataset.qty){qty=Math.max(1,Math.min(remaining(current),qty+Number(button.dataset.qty)));render()}
  if(button.dataset.team!==undefined){selected=Number(button.dataset.team);render()}
  if(button.dataset.count){setupCount=Number(button.dataset.count);renderSetup()}
  if(button.dataset.chart!==undefined){chartMaterial=Number(button.dataset.chart);renderResults()}
  const focusKey=['material','team','chart'].find(key=>button.dataset[key]!==undefined);
  if(focusKey)document.querySelector(`[data-${focusKey}="${button.dataset[focusKey]}"]`).focus({preventScroll:true});
});
$('#sell').addEventListener('click',()=>{
  if(selected<0||balance(selected)<bid||remaining(current)<qty)return;
  const team=selected;
  sales.push({material:current,team,price:bid,qty});
  announce(`${teams[team]} 낙찰 확정 · ${materials[current].name} ${qty}장 · ${bid}어스`);
  selected=-1;bid=1;qty=1;render();
});
$('#undo').addEventListener('click',()=>{
  const sale=sales.pop();if(!sale)return;
  current=sale.material;bid=sale.price;qty=sale.qty;selected=-1;render();
  announce(`${teams[sale.team]}의 직전 낙찰을 취소했어요.`);
});
$('#next').addEventListener('click',()=>{
  if(current===materials.length-1){showPage('results');return}
  current++;bid=1;qty=1;selected=-1;render();
});
$('#project').addEventListener('click',()=>{
  const projecting=document.body.classList.toggle('projecting');
  $('#project').textContent=projecting?'교사 화면으로 돌아가기 ↙':'학생 화면 보기 ↗';
});
$('#setup-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(!event.currentTarget.reportValidity())return;
  const nextTeams=Array.from(document.querySelectorAll('[data-name]'),(input,i)=>input.value.trim()||`${i+1}팀`);
  const nextStock=Array.from(document.querySelectorAll('[data-stock]'),input=>Number(input.value));
  if(nextStock.some(n=>!Number.isInteger(n)||n<1||n>99))return;
  teams=nextTeams;stock=nextStock;sales=[];current=0;bid=1;qty=1;selected=-1;
  $('.class-name').textContent=($('#class-input').value.trim()||'우리 반')+' · 예시';
  render();showPage('auction');announce(`${teams.length}팀 경매를 시작합니다.`);
});
$('.brand').addEventListener('click',event=>{event.preventDefault();showPage('auction')});
renderSetup();render();showPage(location.hash.slice(1)||'auction');
