const test=require('node:test');
const assert=require('node:assert/strict');
const {AuctionSession,SAVE_PREFIX,recommendedStock}=require('../auction-state.js');
const fresh=()=>{const s=new AuctionSession();s.start('2반',['1팀','2팀'],recommendedStock(2));return s;};
const legacy=()=>({slotName:'기존 반',teams:[{name:'가팀',money:17,items:{red_brick:2}},{name:'나팀',money:20,items:{}}],materials:[
  {id:'red_brick',stock:5,soldCount:2},{id:'iron',stock:3,soldCount:0},{id:'blue_brick',stock:1,soldCount:0},{id:'cement',stock:2,soldCount:0},{id:'urethane',stock:20,soldCount:0},{id:'plywood',stock:1,soldCount:0}
],curIdx:0,curBid:4,logs:[{text:'예전 기록',ts:'09:00',isWin:true}],saleHistory:[{matId:'red_brick',teamName:'가팀',price:3,qty:2}]});

test('starts without mock data and supports all original team counts',()=>{
  assert.equal(new AuctionSession().teams.length,0);
  for(let n=2;n<=10;n++){
    const s=new AuctionSession();s.start('우리 반',Array.from({length:n},(_,i)=>`${i+1}팀`),recommendedStock(n));
    assert.equal(s.teams.length,n);assert.equal(s.materials[0].stock,n*2+1);assert.equal(s.materials[5].stock,n-1);assert.equal(s.teams[0].money,20);assert.equal(s.sales.length,0);
  }
});
test('setup validation rejects duplicate names, fractional and invalid stock',()=>{
  const s=fresh();
  assert.throws(()=>s.start('2반',['같음',' 같음 '],recommendedStock(2)),/겹치/);
  assert.throws(()=>s.start('', ['가','나'],recommendedStock(2)),/학급/);
  assert.throws(()=>s.start('반',['가','나'],[0,3,1,2,20,1]),/수량/);
  assert.throws(()=>s.start('반',['가','나'],[1.5,3,1,2,20,1]),/수량/);
  assert.equal(s.teams[0].money,20);
});
test('bundle sale charges total once and bid adjustments preserve quantity',()=>{
  const s=fresh();s.changeQty(1);s.changeBid(2);assert.equal(s.qty,2);
  const sale=s.sell(0);assert.equal(sale.qty,2);assert.equal(sale.price,3);assert.equal(s.teams[0].money,17);assert.equal(s.teams[0].items.red_brick,2);assert.equal(s.remaining(0),3);assert.equal(s.progress(0),2);
  assert.equal(sale.price/sale.qty,1.5);
  s.undo();assert.equal(s.teams[0].money,20);assert.equal(s.remaining(0),5);assert.equal(s.qty,2);assert.equal(s.bid,3);
});
test('invalid sale cannot spend money or change history and inventory',()=>{
  const s=fresh();s.bid=21;assert.throws(()=>s.sell(0),/잔액/);s.bid=1;s.qty=6;assert.throws(()=>s.sell(0),/수량/);s.qty=1;
  assert.throws(()=>s.sell(-1),/팀/);s.bid=0;assert.throws(()=>s.sell(0),/잔액/);
  assert.equal(s.teams[0].money,20);assert.equal(s.sales.length,0);assert.equal(s.remaining(0),5);
});
test('sellout advances material, undo restores original material and zero budget',()=>{
  const s=fresh();s.materials[0].stock=1;s.bid=20;s.sell(0);
  assert.equal(s.current,1);assert.equal(s.teams[0].money,0);s.undo();assert.equal(s.current,0);assert.equal(s.teams[0].money,20);assert.equal(s.remaining(0),1);
});
test('legacy save retains balances, inventory, history, logs and chart quantities',()=>{
  const s=new AuctionSession();s.load(JSON.stringify(legacy()));
  assert.equal(s.slotName,'기존 반');assert.equal(s.teams[0].money,17);assert.equal(s.owned(0,0),2);assert.equal(s.remaining(0),3);assert.equal(s.bid,4);assert.equal(s.logs[0].text,'예전 기록');assert.equal(s.sales[0].price/s.sales[0].qty,1.5);
  s.undo();assert.equal(s.teams[0].money,20);assert.equal(s.owned(0,0),0);assert.equal(s.remaining(0),5);
});
test('older one-item histories and incomplete histories do not overwrite saved totals',()=>{
  const data=legacy();delete data.saleHistory[0].qty;delete data.slotName;
  const s=new AuctionSession();s.load(JSON.stringify(data),'이전 학급');
  assert.equal(s.slotName,'이전 학급');assert.equal(s.sales[0].qty,1);assert.equal(s.owned(0,0),2);assert.equal(s.teams[0].money,17);
  s.undo();assert.equal(s.owned(0,0),1);
});
test('invalid restore is atomic and leaves the current lesson intact',()=>{
  const s=fresh(), data=legacy();data.saleHistory[0].qty=0;
  assert.throws(()=>s.load(JSON.stringify(data)),/기록/);assert.equal(s.slotName,'2반');assert.equal(s.teams[0].money,20);
  assert.throws(()=>s.load('{bad json'));assert.equal(s.slotName,'2반');
  const bad=legacy();bad.materials[0].soldCount=99;assert.throws(()=>s.load(JSON.stringify(bad)),/기록/);
});
test('round-trip storage keeps old key and schema, bid, quantity and sale identity',()=>{
  assert.equal(SAVE_PREFIX,'auction_class_save_');
  const s=fresh();s.qty=2;s.bid=3;s.sell(1);s.chooseMaterial(1);s.qty=2;s.bid=4;
  const raw=JSON.stringify(s.snapshot()), restored=new AuctionSession();restored.load(raw);
  assert.equal(restored.teams[1].money,17);assert.equal(restored.sales[0].teamIndex,1);assert.equal(restored.current,1);assert.equal(restored.bid,4);assert.equal(restored.qty,2);
  assert.ok(JSON.parse(raw).saleHistory);assert.equal(JSON.parse(raw).materials[0].missionNeed,2);
});

test('balance ranking sorts descending, shares ranks and preserves team identity',()=>{
  const s=new AuctionSession();s.start('순위',['가팀','나팀','다팀','라팀'],recommendedStock(4));
  assert.deepEqual(s.balanceRanking().map(r=>[r.index,r.rank,r.tied]),[[0,1,true],[1,1,true],[2,1,true],[3,1,true]]);
  s.bid=5;s.sell(0);s.bid=2;s.sell(2);s.bid=2;s.sell(3);
  assert.deepEqual(s.balanceRanking().map(r=>[r.index,r.team.money,r.rank,r.tied]),[[1,20,1,false],[2,18,2,true],[3,18,2,true],[0,15,4,false]]);
  assert.deepEqual(s.teams.map(t=>t.name),['가팀','나팀','다팀','라팀']);
  s.undo();assert.deepEqual(s.balanceRanking().map(r=>r.index),[1,3,2,0]);
  const restored=new AuctionSession();restored.load(JSON.stringify(s.snapshot()));
  assert.deepEqual(restored.balanceRanking(),s.balanceRanking());
});
