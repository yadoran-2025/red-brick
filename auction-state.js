const MATERIAL_DEFAULTS = [
  { id:'red_brick', name:'빨간 벽돌', color:'#bc3d2e', need:2, emoji:'🧱' },
  { id:'iron', name:'철근', color:'#778592', need:1, emoji:'🔩' },
  { id:'blue_brick', name:'파란 벽돌', color:'#527e9e', need:0, emoji:'🔷' },
  { id:'cement', name:'시멘트', color:'#a9afb0', need:1, emoji:'🪨' },
  { id:'urethane', name:'우레탄', color:'#e2bf56', need:0, emoji:'🟡' },
  { id:'plywood', name:'나무합판', color:'#ba9461', need:1, emoji:'🪵' },
];
const SAVE_PREFIX = 'auction_class_save_';
const recommendedStock = n => [n*2+1,n+1,1,n,20,n-1];
const validInteger = (value,min=0) => Number.isSafeInteger(value)&&value>=min;

class AuctionSession {
  constructor(){
    this.slotName=''; this.teams=[]; this.materials=[]; this.sales=[]; this.logs=[];
    this.current=0; this.bid=1; this.qty=1;
  }

  start(name,names,stocks){
    if(typeof name!=='string'||!name.trim())throw Error('학급 이름을 입력하세요.');
    if(!Array.isArray(names)||names.length<2||names.length>10||names.some(n=>typeof n!=='string'||!n.trim()))throw Error('팀은 2~10개로 구성하고 이름을 입력하세요.');
    const cleaned=names.map(n=>n.trim());
    if(new Set(cleaned).size!==cleaned.length)throw Error('팀 이름이 겹치지 않게 입력하세요.');
    if(!Array.isArray(stocks)||stocks.length!==6||stocks.some(n=>!validInteger(n,1)||n>99))throw Error('재료 수량은 1~99장으로 입력하세요.');
    this.slotName=name.trim();
    this.teams=cleaned.map(name=>({name,money:20,items:{}}));
    this.materials=MATERIAL_DEFAULTS.map((m,i)=>({...m,missionNeed:m.need,stock:stocks[i],soldCount:0}));
    this.sales=[]; this.logs=[]; this.current=0; this.bid=1; this.qty=1;
  }

  load(raw,fallbackName=''){
    const fail=()=>{throw Error('저장된 수업 기록을 읽을 수 없습니다. 원본 기록은 유지됩니다.');};
    let data;
    try{data=JSON.parse(raw)}catch(error){fail()}
    if(!data||typeof data!=='object'||!Array.isArray(data.teams)||data.teams.length<2||data.teams.length>10||!Array.isArray(data.materials)||data.materials.length!==6)fail();
    const slotName=data.slotName||fallbackName;
    if(typeof slotName!=='string'||!slotName.trim())fail();
    const teams=data.teams.map(t=>{
      if(!t||typeof t.name!=='string'||!t.name.trim()||!Number.isFinite(t.money)||t.money<0||!t.items||typeof t.items!=='object'||Array.isArray(t.items)||Object.values(t.items).some(n=>!validInteger(n)))fail();
      return {...t,items:{...t.items}};
    });
    const materials=MATERIAL_DEFAULTS.map(m=>{
      const saved=data.materials.find(s=>s&&s.id===m.id);
      if(!saved||!validInteger(saved.stock,1)||!validInteger(saved.soldCount)||saved.soldCount>saved.stock)fail();
      return {...m,missionNeed:m.need,stock:saved.stock,soldCount:saved.soldCount};
    });
    const history=data.saleHistory??[];
    if(!Array.isArray(history))fail();
    const sales=history.map(s=>{
      if(!s||!MATERIAL_DEFAULTS.some(m=>m.id===s.matId)||!validInteger(s.price,1)||!validInteger(s.qty??1,1)||!teams.some(t=>t.name===s.teamName))fail();
      if(s.teamIndex!==undefined&&(!validInteger(s.teamIndex)||teams[s.teamIndex]?.name!==s.teamName))fail();
      return {...s,qty:s.qty??1};
    });
    const current=data.curIdx??0, bid=data.curBid??1, qty=data.currentQty??1;
    if(!validInteger(current)||current>=6||!validInteger(bid,1)||!validInteger(qty,1))fail();
    // Keep legacy balances and inventories authoritative; old histories may be incomplete.
    this.slotName=slotName; this.teams=teams; this.materials=materials; this.sales=sales;
    this.current=current; this.bid=bid; this.qty=Math.min(qty,Math.max(1,this.remaining(current)));
    this.logs=Array.isArray(data.logs)?data.logs:[];
  }

  remaining(i){const m=this.materials[i];return m?m.stock-m.soldCount:0;}
  owned(team,material){return this.teams[team].items[MATERIAL_DEFAULTS[material].id]||0;}
  progress(team){return MATERIAL_DEFAULTS.reduce((sum,m,i)=>sum+Math.min(m.need,this.owned(team,i)),0);}

  balanceRanking(){
    const rows=this.teams.map((team,index)=>({team,index})).sort((a,b)=>b.team.money-a.team.money);
    return rows.map((row,pos)=>({...row,
      rank:rows.findIndex(other=>other.team.money===row.team.money)+1,
      tied:rows[pos-1]?.team.money===row.team.money||rows[pos+1]?.team.money===row.team.money
    }));
  }

  chooseMaterial(i){
    if(!validInteger(i)||!this.materials[i])throw Error('재료를 선택하세요.');
    this.current=i; this.bid=1; this.qty=1;
  }

  changeBid(delta){
    if(!Number.isSafeInteger(delta)||!validInteger(this.bid+delta,1))return;
    this.bid+=delta;
  }

  changeQty(delta){
    if(!Number.isSafeInteger(delta))return;
    this.qty=Math.max(1,Math.min(this.remaining(this.current),this.qty+delta));
  }

  sell(teamIndex){
    const t=this.teams[teamIndex], m=this.materials[this.current];
    if(!validInteger(teamIndex)||!t||!m)throw Error('낙찰 팀을 선택하세요.');
    if(!validInteger(this.qty,1)||this.qty>this.remaining(this.current))throw Error('남은 재료 수량이 부족합니다.');
    if(!validInteger(this.bid,1)||this.bid>t.money)throw Error('팀 잔액이 부족합니다.');
    const sale={matId:m.id,teamName:t.name,teamIndex,price:this.bid,qty:this.qty};
    t.money-=sale.price; t.items[m.id]=(t.items[m.id]||0)+sale.qty; m.soldCount+=sale.qty;
    this.sales.push(sale); this.bid=1; this.qty=1;
    if(m.soldCount===m.stock){
      const next=this.materials.findIndex((item,i)=>i>this.current&&item.soldCount<item.stock);
      if(next>=0)this.current=next;
    }
    return sale;
  }

  undo(){
    const s=this.sales[this.sales.length-1];
    if(!s)throw Error('취소할 낙찰이 없습니다.');
    const team=s.teamIndex===undefined?this.teams.find(t=>t.name===s.teamName):this.teams[s.teamIndex];
    const index=this.materials.findIndex(m=>m.id===s.matId), m=this.materials[index];
    if(!team||!m||(team.items[s.matId]||0)<s.qty||m.soldCount<s.qty)throw Error('저장된 수량과 낙찰 기록이 달라 취소할 수 없습니다.');
    this.sales.pop(); team.money+=s.price; team.items[s.matId]-=s.qty; m.soldCount-=s.qty;
    this.current=index; this.bid=s.price; this.qty=s.qty;
    return s;
  }

  snapshot(){
    return {slotName:this.slotName,teams:this.teams,materials:this.materials,curIdx:this.current,curBid:this.bid,currentQty:this.qty,logs:this.logs,saleHistory:this.sales,savedAt:new Date().toISOString()};
  }
}

if(typeof module!=='undefined'&&module.exports)module.exports={AuctionSession,MATERIAL_DEFAULTS,SAVE_PREFIX,recommendedStock};
