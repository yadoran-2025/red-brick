const materials=MATERIAL_DEFAULTS;
const session=new AuctionSession();
const teamColors = [['#eaf0f5','#456c87'],['#f3ece5','#94734e'],['#eaf1ec','#52775e'],['#eeeaf3','#77638e']];
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let chartMaterial=0, reflectionIndex=0, setupCount=4, noticeTimer, activeSaveKey=null, unsaved=false, pendingAction=null;

const displayParams=new URLSearchParams(location.search);
const isStudent=displayParams.get('student')==='1';
let displayId=displayParams.get('display'), studentMaterial=null, introTimer, studentSale=null, saleTimer;
if(!isStudent){
  try{displayId=sessionStorage.getItem('auction_display_id')||crypto.randomUUID();sessionStorage.setItem('auction_display_id',displayId)}
  catch(error){displayId=crypto.randomUUID()}
}
const displayChannel=displayId&&typeof BroadcastChannel!=='undefined'?new BroadcastChannel('red-brick-display-'+displayId):null;

function studentDisplayUrl(){
  const url=new URL(location.href);url.search='';
  url.searchParams.set('student','1');url.searchParams.set('display',displayId);
  if(activeSaveKey)url.searchParams.set('room',activeSaveKey);
  url.hash='auction';return url.href;
}

function hideMaterialIntro(){
  clearTimeout(introTimer);
  $('#material-intro').hidden=true;
}
function presentStudentMaterial(){
  if(!isStudent||studentSale||!session.teams.length)return;
  const key=JSON.stringify([activeSaveKey||session.slotName,session.current]);
  if(key===studentMaterial)return;
  studentMaterial=key;
  clearTimeout(introTimer);
  const m=materials[session.current], intro=$('#material-intro');
  intro.style.setProperty('--intro-color',m.color);
  intro.innerHTML=`<div class="intro-scene"><div class="intro-art" aria-hidden="true"><div class="material-object ${m.id}"><i></i><i></i><i></i></div></div><h2>${m.name}</h2><p>경매 시작</p></div>`;
  intro.hidden=false;
  introTimer=setTimeout(hideMaterialIntro,2400);
}

function matchesSale(a,b){
  return Boolean(a&&b&&['matId','teamName','qty','price','teamIndex'].every(key=>a[key]===b[key]));
}
function hideStudentSale(){
  clearTimeout(saleTimer);studentSale=null;$('#student-sale').hidden=true;
}
function presentStudentSale(sale){
  const latest=session.sales[session.sales.length-1];
  if(!isStudent||!matchesSale(sale,latest))return false;
  hideMaterialIntro();clearTimeout(saleTimer);clearTimeout(noticeTimer);$('#announcement').textContent='';
  studentSale={room:activeSaveKey,index:session.sales.length-1,sale:latest};
  const m=materials.find(m=>m.id===latest.matId);
  $('#student-sale').innerHTML=`<div class="sale-success-card"><p class="sale-success-heading"><span class="sale-success-check" aria-hidden="true">✓</span> 낙찰 확정</p><h2 class="sale-success-team">${escapeHTML(latest.teamName)}</h2><div class="sale-success-lot"><div class="sale-success-art" aria-hidden="true"><span class="material-object ${m.id}"><i></i><i></i><i></i></span></div><p>${m.name} <strong>×${latest.qty}</strong></p></div><div class="sale-success-price"><span>낙찰가</span><p aria-label="낙찰가 ${latest.price}어스"><strong>${latest.price}</strong><span>어스</span></p></div></div>`;
  $('#student-sale').hidden=false;
  saleTimer=setTimeout(()=>{hideStudentSale();presentStudentMaterial()},2600);
  return true;
}

function publishDisplay(notice='',sale=null){
  if(isStudent)return;
  displayChannel?.postMessage({type:'state',key:activeSaveKey,state:session.teams.length?session.snapshot():null,notice,sale});
}
function receiveDisplay(data){
  if(data?.type!=='state')return;
  try{
    if(data.state){
      session.load(JSON.stringify(data.state)); activeSaveKey=data.key;
      const url=new URL(location.href);
      if(activeSaveKey)url.searchParams.set('room',activeSaveKey);
      else url.searchParams.delete('room');
      history.replaceState(null,'',url);
    }else{Object.assign(session,new AuctionSession());activeSaveKey=null}
    if(studentSale&&(studentSale.room!==activeSaveKey||!matchesSale(studentSale.sale,session.sales[studentSale.index])))hideStudentSale();
    const saleShown=data.sale?presentStudentSale(data.sale):false;
    render(); showPage('auction');
    if(data.notice&&!saleShown)announce(data.notice);
  }catch(error){hideStudentSale();hideMaterialIntro();document.body.classList.add('student-waiting');$('#student-message').textContent='학생 화면을 갱신하지 못했습니다. 창을 닫고 교사 화면에서 다시 열어주세요.';$('#student-message').hidden=false}
}
if(displayChannel)displayChannel.onmessage=event=>{
  if(isStudent)receiveDisplay(event.data);
  else if(event.data?.type==='ready')publishDisplay();
};

function balance(team){return session.teams[team].money}
function owned(team,material){return session.owned(team,material)}
function remaining(material){return session.remaining(material)}
function progress(team){return session.progress(team)}

function swatch(m){return `<span class="swatch ${m.id}" style="--material:${m.color}" aria-hidden="true"></span>`}
function teamTitle(team,i){const [bg,color]=teamColors[i%teamColors.length];return `<span class="team-title" style="--team-bg:${bg};--team-color:${color}"><span class="team-number">${i+1}</span>${escapeHTML(team)}</span>`}
function announce(message){clearTimeout(noticeTimer);$('#announcement').textContent=message;noticeTimer=setTimeout(()=>{$('#announcement').textContent=''},2500)}

function showPage(id){
  if(id!=='setup'&&$('#room-create').open)$('#room-create').close();
  if(isStudent)id='auction';
  if(!['setup','auction','results','reflection'].includes(id))id='auction';
  if(!isStudent&&!session.teams.length&&id!=='setup')id='setup';
  document.body.classList.toggle('auction-open',id==='auction');
  document.body.classList.toggle('reflection-open',id==='reflection');
  document.body.classList.toggle('projecting',isStudent);
  document.body.classList.toggle('student-window',isStudent);
  document.body.classList.toggle('student-waiting',isStudent&&!session.teams.length);
  $('#student-message').hidden=!isStudent||Boolean(session.teams.length);
  if(isStudent&&!session.teams.length)$('#student-message').textContent='교사가 방을 열면 경매가 표시됩니다.';
  $('#project').innerHTML='학생 화면 열기 <span aria-hidden="true">↗</span>';
  if(id!=='setup')$('#tutorial-video').pause();
  document.querySelectorAll('.page').forEach(page=>page.hidden=page.id!==id);
  document.querySelectorAll('nav [data-page]').forEach(button=>{
    if(button.dataset.page===id)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  });
  history.replaceState(null,'','#'+id);
  if(id==='results')renderResults();
  if(id==='reflection')renderReflection();
  if(id==='setup'){showRoomList();renderSavedSessions();}
}

function render(){
  const {teams,sales,current,bid,qty}=session;
  $('.class-name').textContent=session.slotName||'수업 준비';
  document.querySelectorAll('nav [data-page]').forEach(button=>button.disabled=!teams.length&&button.dataset.page!=='setup');
  if(!teams.length){if(isStudent){studentMaterial=null;hideMaterialIntro()}return}
  if(!isStudent)$('#project').href=studentDisplayUrl();
  const m=materials[current], left=remaining(current);
  $('#round-label').textContent=`${current+1} / ${materials.length}번째 재료`;
  $('#remaining').textContent=`${left} / ${session.materials[current].stock}장 남음`;
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
  $('#team-list').innerHTML=teams.map((team,i)=>`<div class="team-row" data-balance="${balance(i)}" style="--team-color:${teamColors[i%4][1]}"><div class="team-summary">${teamTitle(team.name,i)}<strong class="team-money">${balance(i)}</strong></div><span class="spent-label student-only">잔액 소진</span><div class="team-progress teacher-only"><div class="completion-bar" aria-hidden="true">${Array.from({length:5},(_,j)=>`<span class="${j<progress(i)?'owned':''}"></span>`).join('')}</div><span class="completion-caption">집짓기 재료 ${progress(i)} / 5장</span></div></div>`).join('');
  $('#team-list').style.setProperty('--team-count',teams.length);
  $('#team-picks').innerHTML=teams.map((team,i)=>`<button class="team-pick" data-team="${i}" aria-label="${escapeHTML(team.name)}에 ${qty}장 ${bid}어스로 낙찰" ${balance(i)<bid||left<qty?'disabled':''}><span>${escapeHTML(team.name)}</span><span class="team-pick-action">낙찰</span></button>`).join('');
  $('#team-picks').style.setProperty('--team-count',teams.length);
  $('#undo').disabled=sales.length===0;
  $('#sale-count').textContent=`${sales.length}건`;
  $('#recent-sales').innerHTML=sales.slice(-3).reverse().map(s=>{
    const m=materials.find(m=>m.id===s.matId);
    return `<div class="sale-log"><span class="sale-thumb" aria-hidden="true"><span class="material-object ${m.id}"><i></i><i></i><i></i></span></span><strong>${escapeHTML(s.teamName)}</strong><span class="sale-material"><span>${m.name}</span>${s.qty>1?`<span class="sale-qty" aria-label="${s.qty}장">×${s.qty}</span>`:''}</span><b>${s.price}어스</b></div>`;
  }).join('')||'<p class="empty">첫 낙찰을 기다리고 있어요.</p>';
  renderResults();
  if(isStudent)presentStudentMaterial();
}

function renderSetup(){
  $('#team-count').value=setupCount;
  const names=Array.from(document.querySelectorAll('[data-name]'),input=>input.value);
  $('#name-fields').innerHTML=Array.from({length:setupCount},(_,i)=>`<div><label for="team-name-${i}">${i+1}팀 이름</label><input id="team-name-${i}" data-name="${i}" maxlength="24" value="${escapeHTML(names[i]||session.teams[i]?.name||`${i+1}팀`)}" required></div>`).join('');
  $('#stock-fields').innerHTML=materials.map((m,i)=>`<tr><td><span class="stock-material"><span class="stock-icon" aria-hidden="true"><span class="material-object ${m.id}"><i></i><i></i><i></i></span></span>${m.name}</span></td><td>${m.need?`${m.need}장`:'—'}</td><td><input type="number" aria-label="${m.name} 전체 수량" data-stock="${i}" value="${recommendedStock(setupCount)[i]}" min="1" max="99" step="1" required></td></tr>`).join('');
}

function unitPriceChart(materialIndex){
  const points=session.sales.filter(s=>s.matId===materials[materialIndex].id);
  const unitPrices=points.map(s=>s.price/s.qty);
  const priceFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
  const max=Math.max(2,Math.ceil(Math.max(1,...unitPrices)/2)*2);
  const chartWidth=Math.max(480,(points.length-1)*96+128);
  const coordinates=unitPrices.map((price,i)=>[points.length===1?chartWidth/2:64+i*(chartWidth-128)/(points.length-1),184-price/max*132]);
  return points.length?`<div class="line-chart"><svg viewBox="0 0 ${chartWidth} 240" style="min-width:${points.length>4?chartWidth:0}px" role="img" aria-label="${materials[materialIndex].name} 장당 낙찰 단가 순서: ${unitPrices.map(price=>`${priceFormat.format(price)}어스`).join(', ')}">
    ${[0,max/2,max].map(value=>`<line class="chart-grid" x1="64" x2="${chartWidth-64}" y1="${184-value/max*132}" y2="${184-value/max*132}"/><text class="chart-tick" x="48" y="${189-value/max*132}" text-anchor="end">${value}</text>`).join('')}
    <polyline class="price-line" points="${coordinates.map(p=>p.join(',')).join(' ')}"/>
    ${points.map((s,i)=>`<g class="price-point"><title>${escapeHTML(s.teamName)} · ${s.qty}장 ${s.price}어스 · 단가 ${priceFormat.format(unitPrices[i])}어스/장</title><circle cx="${coordinates[i][0]}" cy="${coordinates[i][1]}" r="5"/><text class="point-value" x="${coordinates[i][0]}" y="${coordinates[i][1]-15}">${priceFormat.format(unitPrices[i])}어스</text><text class="chart-tick" x="${coordinates[i][0]}" y="216">${i+1}회</text></g>`).join('')}
  </svg></div>`:'<p class="empty">이 재료의 낙찰 기록은 아직 없어요.</p>';
}

function renderReflection(){
  materials.forEach((m,i)=>$('#reflection-chart-'+i).innerHTML=unitPriceChart(i));
  showReflectionQuestion(reflectionIndex);
}

function showReflectionQuestion(index){
  const questions=Array.from(document.querySelectorAll('[data-reflection-question]'));
  if(!questions.length)return;
  reflectionIndex=Math.max(0,Math.min(questions.length-1,index));
  questions.forEach((question,i)=>question.hidden=i!==reflectionIndex);
  $('#reflection-step').textContent=`${reflectionIndex+1} / ${questions.length}`;
  $('#reflection-step').setAttribute('aria-label',`총 ${questions.length}개 중 ${reflectionIndex+1}번째 질문`);
  $('#reflection-prev').disabled=reflectionIndex===0;
  $('#reflection-next').disabled=reflectionIndex===questions.length-1;
}
$('#reflection-prev').addEventListener('click',()=>{if(!isStudent)showReflectionQuestion(reflectionIndex-1)});
$('#reflection-next').addEventListener('click',()=>{if(!isStudent)showReflectionQuestion(reflectionIndex+1)});

function renderResults(){
  const {teams,sales}=session;
  if(!teams.length)return;
  const completed=teams.map((team,i)=>({team,i,spent:20-team.money})).filter(t=>progress(t.i)===5);
  const least=completed.length?Math.min(...completed.map(t=>t.spent)):0;
  const winners=completed.filter(t=>t.spent===least);
  $('#winner').hidden=!winners.length;
  $('#winner').textContent=winners.length?`집 완성 최저 지출: ${winners.map(t=>t.team.name).join(' · ')} — 집 완성, 지출 ${least}어스`:'';
  $('#results-status').textContent=completed.length?`집 완성 ${completed.length}팀 · ${sales.length}건 낙찰`:`${sales.length}건 낙찰`;
  $('#results-body').innerHTML=session.balanceRanking().map(({team,index:i,rank,tied})=>`<tr class="${rank===1?'rank-leading':rank<=3?'rank-podium':''} ${progress(i)===5?'house-complete':''}"><td><span class="rank-badge">${tied?'공동 ':''}${rank}위</span></td><th scope="row" class="ranking-team">${escapeHTML(team.name)}</th><td class="ranking-balance"><strong>${team.money}</strong></td>${[0,1,3,5].map(m=>`<td class="${owned(i,m)>=materials[m].need?'complete':'count'}">${owned(i,m)} / ${materials[m].need}</td>`).join('')}<td><span class="result-label ${progress(i)===5?'success':''}">${progress(i)===5?'<span aria-hidden="true">✓</span> 집 완성':'짓는 중'}</span></td></tr>`).join('');
  $('#chart-picks').innerHTML=materials.map((m,i)=>`<button data-chart="${i}" aria-pressed="${i===chartMaterial}"><span class="chart-icon" aria-hidden="true"><span class="material-object ${m.id}"><i></i><i></i><i></i></span></span><span>${m.name}</span></button>`).join('');
  $('#chart').innerHTML=unitPriceChart(chartMaterial);
  renderReflection();
  $('#purchase-summary').innerHTML=teams.map((team,i)=>{
    const inventory=materials.filter((m,j)=>owned(i,j)>0).map(m=>`${m.name} ×${team.items[m.id]}`).join(' · ');
    const purchases=sales.filter(s=>s.teamIndex===i||(s.teamIndex===undefined&&s.teamName===team.name));
    return `<article class="purchase-team"><h3>${escapeHTML(team.name)}</h3><p>${escapeHTML(inventory||'확보 재료 없음')}</p><div>${purchases.map(s=>`<span class="purchase-entry">${materials.find(m=>m.id===s.matId).name} ×${s.qty} · 총 ${s.price}어스</span>`).join('')||'<span class="empty-history">낙찰 없음</span>'}</div></article>`;
  }).join('');
}

function saveProgress(notice='',sale=null){
  if(isStudent)return false;
  if(!session.teams.length)return false;
  try{
    localStorage.setItem(activeSaveKey||SAVE_PREFIX+session.slotName,JSON.stringify(session.snapshot()));
    unsaved=false; $('#save-error').hidden=true; publishDisplay(notice,sale); return true;
  }catch(error){unsaved=true;$('#save-error').hidden=false;publishDisplay(notice,sale);return false}
}

function renderSavedSessions(){
  const records=[];
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(SAVE_PREFIX))continue;
      let name=key.slice(SAVE_PREFIX.length),valid=true,savedAt=0,teamCount=0,saleCount=0;
      try{
        const raw=localStorage.getItem(key), saved=new AuctionSession();
        saved.load(raw,name); name=saved.slotName; savedAt=Date.parse(JSON.parse(raw).savedAt)||0;
        teamCount=saved.teams.length; saleCount=saved.sales.length;
      }catch(error){valid=false}
      records.push({key,name,valid,savedAt,teamCount,saleCount});
    }
  }catch(error){$('#save-error').hidden=false}
  records.sort((a,b)=>b.savedAt-a.savedAt);
  $('#session-list').innerHTML=records.map(s=>`<article class="saved-session"><div class="room-details"><h3>${escapeHTML(s.name)}</h3>${s.valid?`<p>${s.teamCount}팀 · 낙찰 ${s.saleCount}건</p>`:''}</div><div class="room-actions"><button class="button dark" data-restore="${escapeHTML(s.key)}" aria-label="${escapeHTML(s.name)} 방 들어가기" ${s.valid?'':'disabled'}>${s.valid?'들어가기':'불러오기 불가'}</button><button class="text-button" data-delete="${escapeHTML(s.key)}" aria-label="${escapeHTML(s.name)} 방 삭제">삭제</button></div></article>`).join('')||'<p class="rooms-empty">아직 만든 방이 없어요.</p>';
}

function showRoomList(){
  if($('#room-create').open)$('#room-create').close();
}
$('#new-room').addEventListener('click',()=>{
  $('#class-input').value=''; $('#name-fields').innerHTML='';
  setupCount=4; renderSetup();
  document.querySelectorAll('[data-name]').forEach((input,i)=>input.value=`${i+1}팀`);
  $('#setup-error').hidden=true; $('#room-create').showModal(); $('#class-input').focus();
});
$('#room-list').addEventListener('click',()=>$('#room-create').close());

function confirmAction(title,message,label,action){
  $('#confirm-title').textContent=title; $('#confirm-message').textContent=message;
  $('#confirm-action').textContent=label; pendingAction=action;
  $('#confirm-dialog').returnValue=''; $('#confirm-dialog').showModal();
}
$('#confirm-dialog').addEventListener('close',()=>{
  const action=pendingAction; pendingAction=null;
  if($('#confirm-dialog').returnValue==='confirm'&&action){try{action()}catch(error){announce(error.message)}}
});

function restoreSession(key){
  if(!key.startsWith(SAVE_PREFIX))return;
  if(unsaved)throw Error('현재 방의 저장 문제를 해결한 뒤 다른 방에 들어가세요.');
  session.load(localStorage.getItem(key),key.slice(SAVE_PREFIX.length));
  activeSaveKey=key; chartMaterial=0; reflectionIndex=0; setupCount=session.teams.length; unsaved=false;
  $('#save-error').hidden=true; $('#class-input').value=session.slotName;
  $('#name-fields').innerHTML=''; renderSetup();
  document.querySelectorAll('[data-stock]').forEach((input,i)=>input.value=session.materials[i].stock);
  render(); showPage('auction'); publishDisplay(); announce(`${session.slotName} 방에 입장했습니다.`);
}

function setTeamCount(value){
  if(!Number.isInteger(value)||value<2||value>10){$('#team-count').reportValidity();return}
  setupCount=value; renderSetup();
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(isStudent||!button||button.disabled)return;
  try{
    if(button.dataset.page)showPage(button.dataset.page);
    if(button.dataset.restore)restoreSession(button.dataset.restore);
    if(button.dataset.delete){
      const key=button.dataset.delete;
      if(!key.startsWith(SAVE_PREFIX))return;
      confirmAction('저장된 방 삭제',`${key.slice(SAVE_PREFIX.length)} 방과 경매 기록을 삭제합니다. 이 방을 진행 중이면 방도 닫힙니다.`,'삭제',()=>{
        localStorage.removeItem(key);
        if(key===activeSaveKey){Object.assign(session,new AuctionSession());activeSaveKey=null;unsaved=false;render();showPage('setup');publishDisplay()}
        renderSavedSessions();announce('저장된 방을 삭제했습니다.');
      });
    }
    let changed=false;
    if(button.dataset.material!==undefined){session.chooseMaterial(Number(button.dataset.material));changed=true}
    if(button.dataset.bid){session.changeBid(Number(button.dataset.bid));changed=true}
    if(button.dataset.qty){session.changeQty(Number(button.dataset.qty));changed=true}
    if(button.dataset.team!==undefined&&event.detail<2)sellToTeam(Number(button.dataset.team));
    if(button.dataset.chart!==undefined){chartMaterial=Number(button.dataset.chart);renderResults()}
    if(changed){render();saveProgress()}
    const focusKey=['material','team','chart'].find(key=>button.dataset[key]!==undefined);
    if(focusKey)document.querySelector(`[data-${focusKey}="${button.dataset[focusKey]}"]`)?.focus({preventScroll:true});
  }catch(error){announce(error.message)}
});
function sellToTeam(index){
  if(isStudent)return;
  const sale=session.sell(index);
  const notice=`${sale.teamName} 낙찰 확정`+` · ${materials.find(m=>m.id===sale.matId).name} ${sale.qty}장 · ${sale.price}어스`;
  render(); saveProgress(notice,sale); announce(notice);
}
$('#undo').addEventListener('click',()=>{
  if(isStudent)return;
  try{const sale=session.undo();const notice=`${sale.teamName}의 직전 낙찰을 취소했어요.`;render();saveProgress(notice);announce(notice)}catch(error){announce(error.message)}
});
$('#next').addEventListener('click',()=>{
  if(isStudent)return;
  if(session.current===materials.length-1){showPage('results');return}
  session.chooseMaterial(session.current+1); render();saveProgress();
});
$('#project').addEventListener('click',event=>{
  if(isStudent||!session.teams.length){event.preventDefault();return}
  if(!displayChannel){event.preventDefault();announce('이 브라우저는 학생 화면 동기화를 지원하지 않습니다. 최신 브라우저에서 열어주세요.')}
});
$('#team-count').addEventListener('input',event=>{
  const count=Number(event.target.value);
  if(Number.isInteger(count)&&count>=2&&count<=10)setTeamCount(count);
});
$('#setup-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(isStudent||!event.currentTarget.reportValidity())return;
  $('#setup-error').hidden=true;
  try{
    if(unsaved)throw Error('현재 수업을 저장하지 못했습니다. 저장 문제를 해결한 뒤 새 수업을 시작하세요.');
    const next=new AuctionSession();
    next.start($('#class-input').value,Array.from(document.querySelectorAll('[data-name]'),input=>input.value),Array.from(document.querySelectorAll('[data-stock]'),input=>Number(input.value)));
    const key=SAVE_PREFIX+next.slotName;
    const begin=()=>{Object.assign(session,next);activeSaveKey=key;chartMaterial=0;reflectionIndex=0;render();saveProgress();showPage('auction');announce(`${session.teams.length}팀 경매를 시작합니다.`)};
    let existing;
    try{existing=localStorage.getItem(key)}catch(error){throw Error('브라우저 저장 공간에 접근할 수 없습니다. 사이트 저장 권한을 확인하세요.')}
    if(existing!==null)confirmAction('같은 이름의 방이 있어요',`${next.slotName} 방의 저장 기록을 지우고 새로 만듭니다.`,'방 새로 만들기',begin);
    else begin();
  }catch(error){$('#setup-error').textContent=error.message;$('#setup-error').hidden=false}
});
$('#retry-save').addEventListener('click',()=>{if(saveProgress())announce('수업 기록을 저장했습니다.')});
$('#open-guide').addEventListener('click',()=>$('#guide-dialog').showModal());
$('.brand').addEventListener('click',event=>{event.preventDefault();showPage('auction')});
window.addEventListener('beforeunload',event=>{if(unsaved){event.preventDefault();event.returnValue=''}});
renderSetup();
if(isStudent){
  document.title='빨간벽돌집짓기 — 학생 화면';
  const room=displayParams.get('room');
  if(room?.startsWith(SAVE_PREFIX)){
    try{const raw=localStorage.getItem(room);if(raw){session.load(raw,room.slice(SAVE_PREFIX.length));activeSaveKey=room}}catch(error){announce(error.message)}
  }
  render();showPage('auction');displayChannel?.postMessage({type:'ready'});
}else{render();showPage('setup')}
