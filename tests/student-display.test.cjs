const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {AuctionSession,recommendedStock,SAVE_PREFIX}=require('../auction-state.js');
const source=['auction-state.js','app.js'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');

function boot(search='',saves=[]){
  const nodes=new Map(),events={},classes=new Set(),channels=[],store=new Map(saves),writes=[],timers=new Map();let timerId=0;
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',value:'',hidden:false,disabled:false,style:{setProperty(){}},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this[type]=fn},focus(){},select(){},pause(){},showModal(){this.open=true},close(){this.open=false},reportValidity(){return true}});
    return nodes.get(selector);
  };
  const location=new URL('http://localhost/'+search);
  const context=vm.createContext({
    URL,URLSearchParams,Intl,crypto:{randomUUID:()=> 'test-display'},location,
    document:{title:'',querySelector:node,querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn,body:{classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)},add:name=>classes.add(name)}}},
    history:{replaceState(_state,_title,url){location.href=new URL(url,location).href}},
    sessionStorage:{getItem:()=>null,setItem(){}},
    localStorage:{getItem:key=>store.get(key)??null,setItem(key,value){store.set(key,value);writes.push(key)}},
    BroadcastChannel:class {constructor(name){this.name=name;this.messages=[];channels.push(this)}postMessage(message){this.messages.push(structuredClone(message))}},
    window:{addEventListener(){}},
    setTimeout(fn,ms){timers.set(++timerId,{fn,ms});return timerId},clearTimeout(id){timers.delete(id)}
  });
  vm.runInContext(source,context);
  return {context,nodes,events,classes,channels,store,writes,node,timers,read:code=>vm.runInContext(code,context)};
}
const savedRoom=name=>{const s=new AuctionSession();s.start(name,['1팀','2팀'],recommendedStock(2));return s.snapshot()};

test('one team click sells once, saves, broadcasts and undo restores funds',()=>{
  const app=boot();
  app.read("session.start('교실',['1팀','2팀'],recommendedStock(2));activeSaveKey=SAVE_PREFIX+'교실';session.qty=2;session.bid=3;render()");
  app.events.click({detail:1,target:{closest:()=>({dataset:{team:'0'},disabled:false})}});
  assert.equal(app.read('session.sales.length'),1);
  assert.equal(app.read('session.teams[0].money'),17);
  assert.equal(app.channels[0].messages.at(-1).state.saleHistory[0].qty,2);
  assert.equal(app.channels[0].messages.at(-1).sale.qty,2);
  assert.equal(JSON.parse(app.store.get(SAVE_PREFIX+'교실')).teams[0].money,17);
  assert.match(app.node('#announcement').textContent,/1팀 낙찰 확정/);
  assert.equal(app.nodes.has('#sell'),false);
  app.events.click({detail:2,target:{closest:()=>({dataset:{team:'0'},disabled:false})}});
  assert.equal(app.read('session.sales.length'),1);
  app.node('#undo').click();
  assert.equal(app.read('session.teams[0].money'),20);
  assert.equal(app.channels[0].messages.at(-1).state.saleHistory.length,0);
});

test('student loads a saved room, accepts live updates, follows room changes and cannot sell',()=>{
  const initial=savedRoom('가반'),key=SAVE_PREFIX+'가반';
  const app=boot('?student=1&display=test-display&room='+encodeURIComponent(key),[[key,JSON.stringify(initial)]]);
  assert.equal(app.channels[0].messages[0].type,'ready');
  assert.ok(app.classes.has('projecting'));
  const state=savedRoom('나반');state.curBid=7;state.currentQty=2;
  app.channels[0].onmessage({data:{type:'state',key:SAVE_PREFIX+'나반',state,notice:'2팀 낙찰 확정'}});
  assert.equal(app.node('#bid').textContent,7);
  assert.equal(app.node('#lot-count').textContent,'×2');
  assert.equal(app.context.location.searchParams.get('room'),SAVE_PREFIX+'나반');
  assert.equal(app.read('session.slotName'),'나반');
  assert.match(app.node('#announcement').textContent,/2팀 낙찰 확정/);
  app.events.click({detail:1,target:{closest:()=>({dataset:{team:'0'},disabled:false})}});
  assert.equal(app.read('session.sales.length'),0);
  assert.equal(app.writes.length,0);
  app.channels[0].onmessage({data:{type:'state',state:{broken:true}}});
  assert.equal(app.read('session.slotName'),'나반');
  assert.ok(app.classes.has('student-waiting'));
  app.channels[0].onmessage({data:{type:'state',state:null}});
  assert.equal(app.read('session.teams.length'),0);
  assert.ok(app.classes.has('student-waiting'));
});

test('student link points to the right room and receives ready responses',()=>{
  const app=boot();
  app.read("session.start('방 이름',['1팀','2팀'],recommendedStock(2));activeSaveKey=SAVE_PREFIX+'방 이름';render()");
  app.node('#project').click({preventDefault(){}});
  const url=new URL(app.node('#project').href);
  assert.equal(url.searchParams.get('room'),SAVE_PREFIX+'방 이름');
  assert.equal(url.searchParams.get('student'),'1');
  assert.equal(url.searchParams.get('display'),'test-display');
  let prevented=false;
  app.node('#project').click({preventDefault(){prevented=true}});
  assert.equal(prevented,false);
  app.channels[0].onmessage({data:{type:'ready'}});
  assert.equal(app.channels[0].messages.at(-1).state.slotName,'방 이름');
});

test('room creation opens as a modal, cancel writes nothing and successful creation closes it',()=>{
  const app=boot();
  app.node('#new-room').click();
  assert.equal(app.node('#room-create').open,true);
  assert.equal(app.node('#room-lobby').hidden,false);
  app.node('#room-list').click();
  assert.equal(app.node('#room-create').open,false);
  assert.equal(app.writes.length,0);
  app.node('#new-room').click();
  app.node('#class-input').value='새 방';
  app.context.document.querySelectorAll=selector=>selector==='[data-name]'?[{value:'가팀'},{value:'나팀'}]:selector==='[data-stock]'?recommendedStock(2).map(value=>({value})):[];
  app.node('#setup-form').submit({preventDefault(){},currentTarget:app.node('#setup-form')});
  assert.equal(app.node('#room-create').open,false);
  assert.equal(app.read('session.slotName'),'새 방');
  assert.equal(app.context.location.hash,'#auction');
  assert.ok(app.store.has(SAVE_PREFIX+'새 방'));
});

test('completed houses are highlighted and lose completion after undo',()=>{
  const app=boot();
  app.read("session.start('교실',['가팀','나팀'],recommendedStock(2));session.qty=2;session.sell(0);session.chooseMaterial(1);session.sell(0);session.chooseMaterial(3);session.sell(0);session.chooseMaterial(5);session.sell(0);renderResults()");
  assert.match(app.node('#results-body').innerHTML,/house-complete/);
  assert.match(app.node('#results-body').innerHTML,/집 완성/);
  assert.match(app.node('#results-status').textContent,/집 완성 1팀/);
  assert.ok(app.node('#results-body').innerHTML.indexOf('나팀')<app.node('#results-body').innerHTML.indexOf('가팀'));
  app.read('session.undo();renderResults()');
  assert.doesNotMatch(app.node('#results-body').innerHTML,/house-complete|집 완성/);
});

test('reflection is a separate page and still requires an active room',()=>{
  const app=boot();
  const pages=['setup','auction','results','reflection'].map(id=>({id,hidden:false}));
  app.context.document.querySelectorAll=selector=>selector==='.page'?pages:[];
  app.read("showPage('reflection')");
  assert.equal(app.context.location.hash,'#setup');
  app.read("session.start('교실',['가팀','나팀'],recommendedStock(2));showPage('reflection')");
  assert.equal(app.context.location.hash,'#reflection');
  assert.deepEqual(pages.filter(p=>!p.hidden).map(p=>p.id),['reflection']);
  app.read("showPage('results')");
  assert.deepEqual(pages.filter(p=>!p.hidden).map(p=>p.id),['results']);
  const student=boot('?student=1&display=test-display');
  student.read("showPage('reflection')");
  assert.equal(student.context.location.hash,'#auction');
});

test('student material intro runs once per material and stays current through live bid updates',()=>{
  const initial=savedRoom('가반'),key=SAVE_PREFIX+'가반';
  const app=boot('?student=1&display=test-display&room='+encodeURIComponent(key),[[key,JSON.stringify(initial)]]);
  const intro=app.node('#material-intro');
  assert.equal(intro.hidden,false);
  assert.match(intro.innerHTML,/빨간 벽돌/);
  const firstTimer=app.read('introTimer');
  const update={type:'state',key,state:{...initial,curBid:8,currentQty:2}};
  app.channels[0].onmessage({data:update});
  assert.equal(app.read('introTimer'),firstTimer);
  assert.equal(app.node('#bid').textContent,8);
  app.timers.get(firstTimer).fn();
  assert.equal(intro.hidden,true);
  app.channels[0].onmessage({data:update});
  assert.equal(intro.hidden,true);
  update.state.curIdx=1;
  app.channels[0].onmessage({data:update});
  assert.equal(intro.hidden,false);
  assert.match(intro.innerHTML,/철근/);
  const ironTimer=app.read('introTimer');
  update.state.curIdx=2;
  app.channels[0].onmessage({data:update});
  assert.equal(app.timers.has(ironTimer),false);
  assert.match(intro.innerHTML,/파란 벽돌/);
  app.channels[0].onmessage({data:{type:'state',state:null}});
  assert.equal(intro.hidden,true);
  assert.equal(app.timers.has(app.read('introTimer')),false);
  const teacher=boot();
  teacher.read("session.start('교실',['가팀','나팀'],recommendedStock(2));render()");
  assert.equal(teacher.read('studentMaterial'),null);
  assert.equal(teacher.timers.size,0);
});

test('reflection charts share unit prices with results, stay material-specific and update after undo',()=>{
  const app=boot();
  app.read("session.start('교실',['가팀','나팀'],recommendedStock(2));session.qty=2;session.bid=3;session.sell(0);session.chooseMaterial(1);session.bid=4;session.sell(1);renderResults()");
  const red=app.node('#reflection-chart-0').innerHTML;
  assert.equal(red,app.node('#chart').innerHTML);
  assert.match(red,/1.5어스/);
  assert.match(red,/2장 3어스/);
  assert.doesNotMatch(red,/단가 4어스/);
  assert.match(app.node('#reflection-chart-1').innerHTML,/4어스/);
  assert.match(app.node('#reflection-chart-2').innerHTML,/낙찰 기록은 아직 없어요/);
  app.read('session.undo();renderResults()');
  assert.match(app.node('#reflection-chart-1').innerHTML,/낙찰 기록은 아직 없어요/);
  assert.equal(app.node('#reflection-chart-0').innerHTML,red);
});

test('reflection shows one question at a time with bounded previous and next navigation',()=>{
  const app=boot(),questions=Array.from({length:7},()=>({hidden:false}));
  app.context.document.querySelectorAll=selector=>selector==='[data-reflection-question]'?questions:[];
  app.read('renderReflection()');
  assert.deepEqual(questions.map(q=>q.hidden),[false,true,true,true,true,true,true]);
  assert.equal(app.node('#reflection-prev').disabled,true);
  app.node('#reflection-next').click();
  assert.equal(app.node('#reflection-step').textContent,'2 / 7');
  assert.deepEqual(questions.map(q=>q.hidden),[true,false,true,true,true,true,true]);
  for(let i=0;i<10;i++)app.node('#reflection-next').click();
  assert.equal(app.node('#reflection-next').disabled,true);
  assert.deepEqual(questions.map(q=>q.hidden),[true,true,true,true,true,true,false]);
  app.read('renderReflection()');
  assert.equal(questions[6].hidden,false);
  app.node('#reflection-prev').click();
  assert.equal(questions[5].hidden,false);
  assert.equal(questions[6].hidden,true);
  for(let i=0;i<10;i++)app.node('#reflection-prev').click();
  assert.equal(app.node('#reflection-step').textContent,'1 / 7');
});

test('student sale popup shows confirmed sale, dismisses itself and defers next material intro',()=>{
  const initial=savedRoom('가반'),key=SAVE_PREFIX+'가반';
  const student=boot('?student=1&display=test-display&room='+encodeURIComponent(key),[[key,JSON.stringify(initial)]]);
  student.timers.get(student.read('introTimer')).fn();
  const teacher=new AuctionSession();teacher.load(JSON.stringify(initial));
  teacher.materials[0].stock=1;teacher.bid=3;
  const sale=teacher.sell(0);
  student.channels[0].onmessage({data:{type:'state',key,state:teacher.snapshot(),sale,notice:'낙찰 확정'}});
  const popup=student.node('#student-sale');
  assert.equal(popup.hidden,false);
  assert.match(popup.innerHTML,/낙찰 확정/);
  assert.match(popup.innerHTML,/1팀/);
  assert.match(popup.innerHTML,/빨간 벽돌/);
  assert.match(popup.innerHTML,/×1/);
  assert.match(popup.innerHTML,/3어스/);
  assert.equal(student.node('#material-intro').hidden,true);
  assert.equal(student.node('#announcement').textContent,'');
  const timer=student.read('saleTimer');
  teacher.bid=4;
  student.channels[0].onmessage({data:{type:'state',key,state:teacher.snapshot()}});
  assert.equal(student.read('saleTimer'),timer);
  student.timers.get(timer).fn();
  assert.equal(popup.hidden,true);
  assert.equal(student.node('#material-intro').hidden,false);
  assert.match(student.node('#material-intro').innerHTML,/철근/);
});

test('student popup is cancelled on undo and is not replayed from saved history',()=>{
  const initial=savedRoom('가반'),key=SAVE_PREFIX+'가반';
  const student=boot('?student=1&display=test-display&room='+encodeURIComponent(key),[[key,JSON.stringify(initial)]]);
  const teacher=new AuctionSession();teacher.load(JSON.stringify(initial));
  const sale=teacher.sell(1),snapshot=JSON.stringify(teacher.snapshot());
  student.channels[0].onmessage({data:{type:'state',key,state:teacher.snapshot(),sale}});
  assert.equal(student.node('#student-sale').hidden,false);
  const timer=student.read('saleTimer');
  teacher.undo();
  student.channels[0].onmessage({data:{type:'state',key,state:teacher.snapshot(),notice:'낙찰 취소'}});
  assert.equal(student.node('#student-sale').hidden,true);
  assert.equal(student.timers.has(timer),false);
  student.channels[0].onmessage({data:{type:'state',key,state:teacher.snapshot(),sale:{...sale,teamName:'가짜팀'}}});
  assert.equal(student.node('#student-sale').hidden,true);
  const reloaded=boot('?student=1&display=test-display&room='+encodeURIComponent(key),[[key,snapshot]]);
  assert.equal(reloaded.read('studentSale'),null);
});

test('tutorial is inline on setup without autoplay and pauses when leaving',()=>{
  const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
  const setup=html.slice(html.indexOf('<section id="setup"'),html.indexOf('<dialog id="room-create"'));
  assert.match(setup,/<video id="tutorial-video"[^>]*controls[^>]*playsinline/);
  assert.match(setup,/<source src=".\/media\/tutorial.mp4"/);
  assert.doesNotMatch(setup,/autoplay/);
  assert.doesNotMatch(html,/id="(?:open-video|video-dialog)"/);
  const app=boot(),video=app.node('#tutorial-video');let played=0,paused=0;
  video.play=()=>{played++;return Promise.resolve()};video.pause=()=>{paused++};
  app.read("showPage('setup')");
  assert.equal(played,0);
  assert.equal(paused,0);
  app.read("session.start('교실',['가팀','나팀'],recommendedStock(2));showPage('auction')");
  assert.equal(paused,1);
});
