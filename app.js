(function(){
const $=s=>document.querySelector(s);
const pad2=n=>String(n).padStart(2,'0');
const DAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ymd=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const ymOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1);
const hm=d=>pad2(d.getHours())+':'+pad2(d.getMinutes());
const toMin=t=>{if(!t)return null;const[a,b]=String(t).split(':').map(Number);return a*60+b};
const fmtMin=m=>m==null?'':Math.floor(m/60)+'h '+pad2(m%60)+'m';
const t12=t=>{if(!t)return '';let[h,m]=String(t).split(':').map(Number);const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+pad2(m)+' '+ap};
const rs=n=>'₹'+Math.round(n||0).toLocaleString('en-IN');
const rsPlain=n=>'Rs. '+Math.round(n||0).toLocaleString('en-IN');
function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in (attrs||{})){const v=attrs[k];if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v)}for(const c of kids){if(c==null)continue;e.append(c.nodeType?c:document.createTextNode(c))}return e}

/* ---------- server link (Google Apps Script) ---------- */
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
let API=(window.COUPLO_API||'').trim()||LS.get('couplo_api')||'';
async function call(action,data){
  if(!API)throw new Error('No server link');
  const res=await fetch(API,{method:'POST',body:JSON.stringify({action,...(data||{})})});
  const j=await res.json();
  if(!j.ok){const er=new Error(j.error||(j.needReason?'Reason needed':j.needPin?'Create your PIN':'Server error'));if(j.needPin){er.needPin=true;er.staffId=j.staffId;er.name=j.name}if(j.needReason){er.need=j.needReason;er.time=j.time;er.inTime=j.in}er.data=j;throw er}
  return j;
}

function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>t.hidden=true,2800)}
function banner(msg){const b=$('#banner');b.textContent=msg||'';b.hidden=!msg}
function closeOv(){$('#ov').hidden=true;$('#sheet').replaceChildren()}
function openOv(...kids){$('#sheet').style.maxWidth='';$('#sheet').replaceChildren(...kids);$('#ov').hidden=false}
$('#ov').addEventListener('click',e=>{if(e.target.id==='ov')closeOv()});

/* ---------- first-time link setup ---------- */
function askServer(){
  const inp=el('input',{id:'api',type:'url',placeholder:'https://script.google.com/macros/s/…/exec',value:API});
  const save=async()=>{const v=inp.value.trim();if(!/^https:\/\/script\.google(usercontent)?\.com\//.test(v)){toast('Paste the Web app link from Apps Script (it starts with https://script.google.com/).');return}
    API=v;try{await call('kiosk');LS.set('couplo_api',v);closeOv();toast('Connected');boot()}catch(e){toast('That link did not answer. Check the deployment is "Anyone".')}};
  openOv(el('h2',{text:'Connect to your sheet'}),el('p',{text:'Paste the Web app link you copied from Google Apps Script. You do this once on each phone.'}),
    el('label',{class:'f',for:'api'},'Web app link',inp),el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Connect',onclick:save})));
}

/* ---------- clock ---------- */
function tick(){const n=new Date();$('#clk').textContent=t12(hm(n));$('#dte').textContent=DAYS[n.getDay()].charAt(0)+DAYS[n.getDay()].slice(1).toLowerCase()+', '+n.getDate()+' '+MON[n.getMonth()]+' '+n.getFullYear()}
tick();setInterval(tick,15000);

/* ---------- one site, one login: home (login) · kiosk (office IN/OUT) · orders (staff page) · admin ---------- */
let adminOpen=false, adminPin=null, view='home';
const TITLES={home:'Couplo Team',kiosk:'Check in / out',orders:'My page',admin:'Admin'};
function show(v){view=v;adminOpen=v==='admin';['home','kiosk','admin','orders'].forEach(id=>{$('#'+id).hidden=id!==v});
  document.querySelector('.brand h1').textContent=TITLES[v];banner('');
  if(v!=='kiosk')loadKioskStop();if(v!=='admin'){$('#admin').replaceChildren();adminPin=null}window.scrollTo(0,0)}
function goHome(prefill){me=null;LS.del('couplo_me');show('home');renderHome(prefill)}
function openKiosk(){show('kiosk');loadKiosk()}
function renderHome(prefill){
  const idI=el('input',{id:'lg-id',type:'text',autocomplete:'username',autocapitalize:'none',spellcheck:'false',placeholder:'Your name, e.g. vinaya',value:prefill||LS.get('couplo_last_id')||''});
  const pinI=el('input',{id:'lg-pin',type:'password',inputmode:'numeric',maxlength:'4',autocomplete:'current-password',placeholder:'4 digits'});
  const btn=el('button',{class:'btn primary big',type:'button',text:'Log in'});
  const staffDone=(r,pin)=>{me={id:r.staffId,name:r.name,pin,sales:r.sales};LS.set('couplo_me',JSON.stringify(me));LS.set('couplo_last_id',idI.value.trim());closeOv();portalTab='auto';show('orders');ordersHome()};
  const createPin=(sid,name)=>{let first=null;
    const ask=()=>pinSheet({title:first?'Repeat your new PIN':'Hi '+name+'! Create your PIN',sub:first?'Type the same 4 digits again':'Choose 4 digits only you know. You will use it to log in and to mark IN/OUT.',onDone:async v=>{
      if(!first){first=v;setTimeout(ask,150);return}
      if(v!==first){first=null;toast('PINs did not match. Try again.');setTimeout(ask,150);return}
      try{const r=await call('setMyPin',{staffId:sid,newPin:v});toast('PIN created');staffDone(r,v)}catch(e){closeOv();toast(e.message)}}});
    ask()};
  btn.onclick=async()=>{const id=idI.value.trim(),pin=pinI.value.trim();
    if(!id){toast('Type your ID.');idI.focus();return}
    btn.disabled=true;btn.textContent='Checking…';
    try{
      if(id.toLowerCase()==='admin'){
        const c=await call('adminCheck',{adminPin:pin});
        if(c.needSetup){askAdminPin()}
        else if(c.valid){adminPin=pin;LS.set('couplo_last_id','admin');openAdmin()}
        else toast('Wrong admin PIN.');
      }else{
        if(!/^\d{4}$/.test(pin)&&pin!==''){toast('PIN is 4 digits.');}
        else{const r=await call('portalLogin',{staffId:id,pin});staffDone(r,pin)}
      }
    }catch(e){if(e.needPin)createPin(e.staffId,e.name);else toast(e.message==='Wrong PIN'?'Wrong PIN. Try again.':e.message==='Staff ID not found'?'No staff with that ID. Use your name, e.g. vinaya.':e.message)}
    btn.disabled=false;btn.textContent='Log in'};
  [idI,pinI].forEach(i=>i.addEventListener('keydown',e=>{if(e.key==='Enter')btn.click()}));
  const keep=el('input',{id:'kiosk-keep',type:'checkbox'});keep.checked=LS.get('couplo_mode')==='kiosk';
  keep.onchange=()=>{keep.checked?LS.set('couplo_mode','kiosk'):LS.del('couplo_mode');toast(keep.checked?'This phone will open the check-in screen first':'This phone will open the login page first')};
  $('#home').replaceChildren(
    el('div',{class:'panel homecard'},el('h3',{text:'Log in'}),
      el('label',{class:'f',for:'lg-id'},'ID',idI),el('label',{class:'f',for:'lg-pin'},'PIN',pinI),btn,
      el('p',{class:'hint',text:'Staff: your name and your PIN (first PIN is 1234). Owner / HR: type admin and the admin PIN. Forgot your PIN? Ask HR.'})),
    el('div',{class:'panel homecard'},el('h3',{text:'Office check-in'}),
      el('p',{class:'hint',text:'For the office phone: everyone taps their name to mark IN and OUT.'}),
      el('button',{class:'btn big',type:'button',text:'Open check-in screen (IN / OUT)',onclick:openKiosk}),
      el('label',{for:'kiosk-keep',style:'display:flex;gap:8px;align-items:center;font-weight:500'},keep,'Always open the check-in screen on this phone')));
}

$('#kiosk-login').onclick=()=>{show('home');renderHome()};

/* ---------- PIN pad ---------- */
function pinSheet({title,sub,len=4,onDone}){
  let v='',busy=false;const dots=el('div',{class:'dots'});
  const draw=bad=>{dots.replaceChildren(...Array.from({length:len},(_,i)=>el('span',{class:i<v.length?'f':''})));dots.classList.toggle('bad',!!bad)};
  draw();
  const press=async k=>{if(busy)return;if(k==='⌫'){v=v.slice(0,-1);draw();return}if(k==='✕'){closeOv();return}if(v.length>=len)return;v+=k;draw();
    if(v.length===len){busy=true;const ok=await onDone(v);busy=false;if(ok===false){setTimeout(()=>{v='';draw(true)},200)}}};
  const keys=['1','2','3','4','5','6','7','8','9','✕','0','⌫'];
  openOv(el('h2',{text:title}),sub?el('p',{text:sub}):null,dots,el('div',{class:'pad'},...keys.map(k=>el('button',{type:'button',text:k,'aria-label':k==='⌫'?'Delete':k==='✕'?'Cancel':k,onclick:()=>press(k)}))));
}

/* ---------- kiosk ---------- */
let kStaff=[], kAtt={}, kTimer=null, kCfg={lateAfter:'09:40',minHours:8};
function statusOf(r){
  if(!r)return{cls:'none',txt:'Not checked in'};
  if(r.status==='leave')return{cls:'leave',txt:'Leave'};
  if(r.status==='wfh')return{cls:'wfh',txt:'Work from home'};
  if(r.in&&!r.out)return{cls:'in',txt:'IN since '+t12(r.in)};
  if(r.in&&r.out)return{cls:'out',txt:'OUT at '+t12(r.out)};
  return{cls:'none',txt:'Not checked in'};
}
const byOrder=(a,b)=>(a.order??99)-(b.order??99)||a.name.localeCompare(b.name);
async function loadKiosk(){
  clearTimeout(kTimer);
  try{const j=await call('kiosk');kStaff=j.staff.sort(byOrder);kAtt=j.att||{};kCfg={lateAfter:j.lateAfter||'09:40',minHours:Number(j.minHours)||8};banner('');renderTiles()}
  catch(e){banner('Cannot reach the sheet. Check the internet connection.')}
  if(view==='kiosk')kTimer=setTimeout(loadKiosk,60000);
}
function loadKioskStop(){clearTimeout(kTimer)}
function renderTiles(){
  const g=$('#tiles');
  if(!kStaff.length){g.replaceChildren(el('div',{class:'empty',text:'No staff yet. Open Admin → Staff to add your team.'}));return}
  g.replaceChildren(...kStaff.map(s=>{const st=statusOf(kAtt[s.id]);
    return el('button',{class:'tile',type:'button',onclick:()=>startPunch(s)},
      el('div',{},el('div',{class:'nm',text:s.name}),s.role?el('div',{class:'role',text:roleText(s.role)}):null),
      el('span',{class:'chip '+st.cls,text:st.txt}))}));
}
function startPunch(s){
  if(s.hasPin)pinSheet({title:s.name,sub:'Enter your 4-digit PIN',onDone:v=>{punchSheet(s,v)}});
  else punchSheet(s,'');
}
function punchSheet(s,pin){
  const r=kAtt[s.id], now=hm(new Date());
  const kids=[el('h2',{text:s.name}),el('p',{text:'Time now: '+t12(now)})];
  if(r&&(r.status==='leave'||r.status==='wfh')){kids.push(el('p',{text:'Today is marked as '+(r.status==='leave'?'leave':'work from home')+'. Ask HR to change it if you are here.'}),el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv}));openOv(...kids);return}
  const send=async(reason)=>{
    const j=await call('punch',{staffId:s.id,pin,reason:reason||''});
    kAtt[s.id]=j.rec;renderTiles();closeOv();toast(s.name+' · '+(j.kind==='in'?'IN':'OUT')+' at '+t12(j.time)+(reason?' · reason saved':''));
  };
  const go=async(btn)=>{btn.disabled=true;btn.textContent='Saving…';
    try{await send('')}
    catch(e){
      if(e.need){reasonSheet(s,e.need,e.time,e.inTime,send);return}
      closeOv();toast(e.message==='Wrong PIN'?'Wrong PIN. Try again.':'Could not save. Check the internet and try again.')}};
  let label;
  if(!r||!r.in)label='IN  ·  '+t12(now);
  else if(!r.out){kids.push(el('p',{text:'You came in at '+t12(r.in)+'.'}));label='OUT  ·  '+t12(now)}
  else{kids.push(el('p',{text:'Today: IN '+t12(r.in)+', OUT '+t12(r.out)+'. Leaving again later? Update your OUT time.'}));label='Update OUT to '+t12(now)}
  const b=el('button',{class:'btn primary big',type:'button',text:label});b.onclick=()=>go(b);
  kids.push(b,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv}));
  openOv(...kids);
}

function reasonSheet(s,kind,time,inTime,send){
  const late=kind==='late';
  const quick=late?['Traffic / bus late','Hospital / doctor','Family function','Permission taken','Other']:['Feeling unwell','Family emergency','Hospital / doctor','Permission taken','Other'];
  const txt=el('textarea',{id:'reason',rows:'3',placeholder:'Type the reason…',style:'font:500 15px var(--f-body);padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%'});
  const chips=el('div',{class:'row'},...quick.map(q=>el('button',{type:'button',class:'btn',style:'flex:0 0 auto;padding:8px 12px;font-size:14px',text:q,onclick:()=>{txt.value=q==='Other'?'':q;txt.focus()}})));
  const ok=el('button',{class:'btn primary big',type:'button',text:(late?'IN':'OUT')+'  ·  '+t12(time)});
  ok.onclick=async()=>{const r=txt.value.trim();if(r.length<3){toast('Please write the reason.');return}ok.disabled=true;ok.textContent='Saving…';
    try{await send(r)}catch(e){closeOv();toast('Could not save. Check the internet and try again.')}};
  const worked=inTime?toMin(time)-toMin(inTime):0;
  openOv(el('h2',{text:s.name}),
    el('p',{text:late?('You are coming in at '+t12(time)+'. Why are you late?'):('You came at '+t12(inTime)+' and worked '+fmtMin(worked)+' (less than '+kCfg.minHours+' hours). Why are you leaving early?')}),
    chips,txt,ok,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv}));
}

/* ---------- admin ---------- */
let adminMonth=null, adminView='register', salesDate=null, staff=[], adminRecs={}, adminSales={}, adminPay={}, drafts={}, todayStr=ymd(new Date());
function askAdminPin(){
  call('adminCheck',{adminPin:''}).then(j=>{
    if(j.needSetup){let first=null;
      const ask=()=>pinSheet({title:first?'Repeat admin PIN':'Set an admin PIN',sub:'Only the owner and HR should know this PIN.',onDone:async v=>{
        if(!first){first=v;setTimeout(ask,150);return}
        if(v!==first){first=null;toast('PINs did not match. Try again.');setTimeout(ask,150);return}
        try{await call('setAdminPin',{newPin:v});adminPin=v;closeOv();openAdmin()}catch(e){toast(e.message)}}});
      ask();return}
    pinSheet({title:'Admin',sub:'Enter the admin PIN',onDone:async v=>{const c=await call('adminCheck',{adminPin:v});if(!c.valid)return false;adminPin=v;closeOv();openAdmin()}});
  }).catch(()=>toast('Cannot reach the sheet.'));
}
function openAdmin(){closeOv();show('admin');salesDate=ymd(new Date());loadMonth(ymOf(new Date()))}
async function loadMonth(m){
  adminMonth=m;
  if(salesDate&&salesDate.slice(0,7)!==m)salesDate=m+'-01';
  $('#admin').replaceChildren(el('div',{class:'empty',text:'Loading '+m+'…'}));
  try{const j=await call('month',{adminPin,month:m});todayStr=j.today;staff=j.staff;if(j.products)products=j.products;if(j.tasks)tasks=j.tasks;adminWork=j.work||[];
    adminRecs={};j.att.forEach(r=>adminRecs[r.date+'__'+r.staffId]=r);
    adminSales={};const sx=k=>adminSales[k]=adminSales[k]||{leads:0,premium:0,affordable:0,amount:0};
    j.sales.forEach(r=>{sx(r.date+'__'+r.staffId).leads=+r.leads||0});
    adminOrders=j.orders||[];adminOrders.forEach(o=>{const x=sx(o.date+'__'+o.staffId);if(o.type==='affordable')x.affordable++;else x.premium++;x.amount+=(+o.amount||0)});
    adminPay={};j.pay.forEach(r=>adminPay[r.staffId]={advance:+r.advance||0,extra:+r.extra||0,note:r.note||''});
    renderAdmin()}
  catch(e){$('#admin').replaceChildren(el('div',{class:'empty',text:'Could not load: '+e.message}))}
}
const reload=()=>loadMonth(adminMonth);
function monthDates(m){const[y,mo]=m.split('-').map(Number);const n=new Date(y,mo,0).getDate();return Array.from({length:n},(_,i)=>new Date(y,mo-1,i+1))}
const activeStaff=()=>staff.filter(s=>s.active!==false).sort(byOrder);
const salesStaff=()=>staff.filter(s=>s.sales).sort(byOrder);
const payStaff=()=>staff.filter(s=>s.active!==false||s.sales).sort(byOrder);
function ordersOn(ds,sid){const x=adminSales[ds+'__'+sid];return x?x.premium+x.affordable:0}
function cellInfo(r){
  if(!r)return null;
  if(r.status==='leave')return{txt:'LEAVE',cls:'leave'};
  if(r.status==='wfh')return{txt:'WFH',cls:'wfh'};
  const a=toMin(r.in),b=toMin(r.out);
  return{txt:(r.in?t12(r.in):'?')+' – '+(r.out?t12(r.out):'no OUT'),hrs:(a!=null&&b!=null)?b-a:null,noOut:!r.out};
}
/* Couplo salary rules: salary ÷ days in month; Sundays paid unless leave/absent on both the Saturday before and Monday after;
   6h+ = full day, under 6h = half day; a sales person's WFH day is paid only if orders were entered for that day */
function calcPay(m,s){
  const dates=monthDates(m), td=todayStr, nd=dates.length;
  const val={}, info={full:0,half:0,leave:0,absent:0,wfhPaid:0,wfhUnpaid:0,sunPaid:0,sunCut:0,noOut:0,mins:0};
  for(const d of dates){const ds=ymd(d);if(ds>td){val[ds]=null;continue}if(d.getDay()===0)continue;
    const r=adminRecs[ds+'__'+s.id];
    if(!r){val[ds]=ds===td?null:0;if(ds!==td)info.absent++;continue}
    if(r.status==='leave'){val[ds]=0;info.leave++;continue}
    if(r.status==='wfh'){if(s.sales){const ok=ordersOn(ds,s.id)>0;val[ds]=ok?1:0;ok?info.wfhPaid++:info.wfhUnpaid++}else{val[ds]=1;info.wfhPaid++}continue}
    const a=toMin(r.in),b=toMin(r.out);
    if(a!=null&&b!=null){const h=b-a;info.mins+=h;if(h>=360){val[ds]=1;info.full++}else{val[ds]=.5;info.half++}}
    else if(a!=null){val[ds]=1;info.full++;if(ds!==td)info.noOut++}
    else{val[ds]=0;info.absent++}}
  for(const d of dates){if(d.getDay()!==0)continue;const ds=ymd(d);if(ds>td){val[ds]=null;continue}
    const nb=[-1,1].map(o=>{const x=new Date(d);x.setDate(x.getDate()+o);return ymd(x)}).filter(x=>x in val&&val[x]!==null);
    const cut=nb.length>0&&nb.every(x=>val[x]===0);val[ds]=cut?0:1;cut?info.sunCut++:info.sunPaid++}
  const paid=Object.values(val).reduce((t,v)=>t+(v||0),0);
  const salary=Number(s.salary)||0, perDay=salary/nd, earned=Math.round(perDay*paid);
  const p=adminPay[s.id]||{}; const adv=p.advance||0, extra=p.extra||0;
  return{...info,nd,paid,salary,perDay,earned,adv,extra,net:earned+extra-adv,note:p.note||'',future:dates.some(d=>ymd(d)>td)};
}
function adminNav(){
  const views=[['register','Register'],['orders','Orders'],['products','Products'],['work','Work'],['sales','Leads'],['salary','Salary'],['staff','Staff']];
  return el('nav',{class:'tabs',role:'tablist'},...views.map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':String(adminView===v),text:t,onclick:()=>{adminView=v;renderAdmin()}})));
}
function monthPicker(){
  const now=new Date(),opts=[];for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);opts.push(el('option',{value:ymOf(d),selected:ymOf(d)===adminMonth,text:MON[d.getMonth()]+' '+d.getFullYear()}))}
  return el('select',{id:'mpick','aria-label':'Month',onchange:e=>loadMonth(e.target.value)},...opts);
}
function renderAdmin(){
  if(!adminOpen)return;
  const parts=[el('div',{class:'toolbar'},adminNav(),el('div',{class:'row'},monthPicker(),el('button',{class:'btn',type:'button',text:'Refresh',onclick:reload}),el('button',{class:'btn',type:'button',text:'Log out',onclick:()=>goHome()})))];
  if(adminView==='register')parts.push(...viewRegister());
  else if(adminView==='orders')parts.push(...viewOrders());
  else if(adminView==='products')parts.push(...viewProducts());
  else if(adminView==='work')parts.push(...viewWork());
  else if(adminView==='sales')parts.push(...viewSales());
  else if(adminView==='salary')parts.push(...viewSalary());
  else parts.push(...viewStaff());
  $('#admin').replaceChildren(...parts);
}
function viewRegister(){
  const m=adminMonth, list=activeStaff(), td=todayStr;
  let inN=0,outN=0,noneN=0,lvN=0;
  list.forEach(s=>{const st=statusOf(adminRecs[td+'__'+s.id]).cls;if(st==='in')inN++;else if(st==='out')outN++;else if(st==='leave'||st==='wfh')lvN++;else noneN++});
  const todayPanel=m===td.slice(0,7)?el('div',{class:'panel'},el('h3',{text:'Today'}),el('div',{class:'stats'},
    el('div',{},el('b',{class:'mono',text:String(inN)}),el('span',{text:'In office'})),
    el('div',{},el('b',{class:'mono',text:String(outN)}),el('span',{text:'Gone home'})),
    el('div',{},el('b',{class:'mono',text:String(lvN)}),el('span',{text:'Leave / WFH'})),
    el('div',{},el('b',{class:'mono',text:String(noneN)}),el('span',{text:'Not in yet'})))):null;
  const dates=monthDates(m);
  const thead=el('thead',{},el('tr',{},el('th',{text:'Date'}),...list.map(s=>el('th',{text:s.name}))));
  const tbody=el('tbody');
  dates.forEach(d=>{const ds=ymd(d);const sun=d.getDay()===0;
    const tr=el('tr',{class:sun?'sun':''},el('th',{},el('span',{class:'mono',text:pad2(d.getDate())}),' '+DAYS[d.getDay()].slice(0,3)));
    list.forEach(s=>{const r=adminRecs[ds+'__'+s.id];const ci=cellInfo(r);
      const c=el('td',{class:'cell',title:'Edit '+s.name+' on '+ds,onclick:()=>editCell(s,ds,r)});
      if(ci){if(ci.cls)c.append(el('span',{class:'chip '+ci.cls,text:ci.txt}));else{c.append(el('span',{class:'mono'+(ci.noOut&&ds!==td?' flag':''),text:ci.txt}));if(ci.hrs!=null)c.append(el('div',{class:'c-hrs mono',text:fmtMin(ci.hrs)+(ci.hrs<360?' · half day':'')}));if(r.lateReason)c.append(el('div',{class:'c-hrs flag',text:'Late: '+r.lateReason}));if(r.earlyReason)c.append(el('div',{class:'c-hrs flag',text:'Early: '+r.earlyReason}))}}
      else c.append(el('span',{class:'c-hrs',text:sun?'':'—'}));
      tr.append(c)});
    tbody.append(tr)});
  const reg=el('div',{class:'panel'},
    el('div',{class:'toolbar'},el('h3',{text:'Monthly register'}),el('button',{class:'btn primary',type:'button',text:'Download Excel',onclick:()=>exportXlsx(m)})),
    el('p',{class:'hint',text:'Tap any cell to fix a time or mark leave / work from home. Under 6 hours shows as a half day. Red means OUT was not tapped.'}),
    list.length?el('div',{class:'scroll'},el('table',{},thead,tbody)):el('div',{class:'empty',text:'Add staff in the Staff tab to see the register.'}));
  return[todayPanel,reg];
}
function viewSales(){
  const list=salesStaff(), m=adminMonth;
  if(!list.length)return[el('div',{class:'empty',text:'No sales staff yet. In the Staff tab, edit a person and set "Sales staff" to Yes.'})];
  const dInp=el('input',{id:'sdate',type:'date',value:salesDate,min:m+'-01',max:ymd(monthDates(m).slice(-1)[0]),onchange:e=>{salesDate=e.target.value;renderAdmin()}});
  const rows=list.map(s=>{const x=adminSales[salesDate+'__'+s.id]||{};const id='sl-'+salesDate+'-'+s.id;
    return{s,x,leads:el('input',{id,type:'number',min:'0',inputmode:'numeric',placeholder:'0',value:(id in drafts?drafts[id]:(x.leads||'')),style:'width:100%',oninput:e=>{drafts[id]=e.target.value}})}});
  const saveBtn=el('button',{class:'btn primary',type:'button',text:'Save leads for this day'});
  saveBtn.onclick=async()=>{const out=rows.filter(r=>r.leads.value!=='').map(r=>({staffId:r.s.id,date:salesDate,leads:Number(r.leads.value)||0,premium:'',affordable:'',amount:''}));
    if(!out.length){toast('Type the lead numbers first.');return}
    saveBtn.disabled=true;saveBtn.textContent='Saving…';
    try{await call('saveSales',{adminPin,rows:out});drafts={};toast('Leads saved for '+salesDate);reload()}catch(e){toast('Could not save: '+e.message);saveBtn.disabled=false;saveBtn.textContent='Save leads for this day'}};
  const entry=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Daily leads'}),dInp),
    el('p',{class:'hint',text:'HR types how many new leads each sales person got. Orders and sales amount come in automatically from the orders staff enter in the app.'}),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Name','Leads','Orders (auto)','Sales ₹ (auto)'].map(t=>el('th',{text:t})))),
      el('tbody',{},...rows.map(r=>el('tr',{},el('th',{text:r.s.name}),el('td',{},r.leads),el('td',{class:'mono',text:String((r.x.premium||0)+(r.x.affordable||0))}),el('td',{class:'mono',text:rs(r.x.amount||0)})))))),
    el('div',{class:'row'},saveBtn));
  const dates=monthDates(m);
  const tot=list.map(s=>{let L=0,P=0,Af=0,Am=0;dates.forEach(d=>{const x=adminSales[ymd(d)+'__'+s.id];if(x){L+=x.leads;P+=x.premium;Af+=x.affordable;Am+=x.amount}});return{s,L,P,Af,O:P+Af,Am}});
  const all=tot.reduce((a,t)=>({L:a.L+t.L,O:a.O+t.O,Am:a.Am+t.Am}),{L:0,O:0,Am:0});
  const pct=(o,l)=>l?Math.round(o/l*100)+'%':'—';
  const report=el('div',{class:'panel'},el('h3',{text:'This month'}),
    el('div',{class:'stats'},el('div',{},el('b',{class:'mono',text:String(all.L)}),el('span',{text:'Leads'})),el('div',{},el('b',{class:'mono',text:String(all.O)}),el('span',{text:'Orders'})),el('div',{},el('b',{class:'mono',text:pct(all.O,all.L)}),el('span',{text:'Conversion'})),el('div',{},el('b',{class:'mono',text:rs(all.Am)}),el('span',{text:'Sales'}))),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Name','Leads','Premium','Affordable','Orders','Conversion','Sales'].map(t=>el('th',{text:t})))),
      el('tbody',{},...tot.map(t=>el('tr',{},el('th',{text:t.s.name}),...[t.L,t.P,t.Af,t.O].map(v=>el('td',{class:'mono',text:String(v)})),el('td',{class:'mono',text:pct(t.O,t.L)}),el('td',{class:'mono',text:rs(t.Am)})))))));
  const days=dates.filter(d=>list.some(s=>adminSales[ymd(d)+'__'+s.id]));
  const daily=el('div',{class:'panel'},el('h3',{text:'Day by day (orders · sales)'}),days.length?el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},el('th',{text:'Date'}),...list.map(s=>el('th',{text:s.name})),el('th',{text:'Total'}))),
    el('tbody',{},...days.map(d=>{const ds=ymd(d);let tO=0,tA=0;
      return el('tr',{},el('th',{},el('span',{class:'mono',text:pad2(d.getDate())}),' '+DAYS[d.getDay()].slice(0,3)),...list.map(s=>{const x=adminSales[ds+'__'+s.id];if(!x)return el('td',{class:'c-hrs',text:'—'});const o=x.premium+x.affordable;tO+=o;tA+=x.amount;return el('td',{class:'mono',text:o+' · '+rs(x.amount)})}),el('td',{class:'mono',text:tO+' · '+rs(tA)}))})))):el('div',{class:'empty',text:'No sales entered this month yet.'}));
  return[entry,report,daily];
}
function viewSalary(){
  const m=adminMonth, list=payStaff();const[y,mo]=m.split('-').map(Number);
  if(!list.length)return[el('div',{class:'empty',text:'Add staff first.'})];
  const calc=list.map(s=>({s,c:calcPay(m,s)}));
  const total=calc.reduce((t,x)=>t+x.c.net,0);
  const warn=[];
  const noSal=calc.filter(x=>!x.c.salary).map(x=>x.s.name);if(noSal.length)warn.push('No monthly salary set for: '+noSal.join(', ')+'. Add it in the Staff tab.');
  const miss=calc.filter(x=>x.c.noOut).map(x=>x.s.name+' ('+x.c.noOut+')');if(miss.length)warn.push('Missing OUT (counted as full day until fixed): '+miss.join(', ')+'.');
  if(calc[0]&&calc[0].c.future)warn.push('This month is not over yet. Days after today are not counted.');
  const tbl=el('table',{},el('thead',{},el('tr',{},...['Name','Salary','Full','Half','WFH paid','WFH no order','Leave','Absent','Sun paid','Sun cut','Paid days','Earned','Bonus','Advance','Net pay',''].map(t=>el('th',{text:t})))),
    el('tbody',{},...calc.map(({s,c})=>el('tr',{},el('th',{text:s.name}),el('td',{class:'mono',text:rs(c.salary)}),
      ...[c.full,c.half,c.wfhPaid,c.wfhUnpaid,c.leave,c.absent,c.sunPaid,c.sunCut].map(v=>el('td',{class:'mono',text:String(v)})),
      el('td',{class:'mono',text:c.paid+' / '+c.nd}),el('td',{class:'mono',text:rs(c.earned)}),el('td',{class:'mono',text:c.extra?rs(c.extra):'—'}),el('td',{class:'mono',text:c.adv?'− '+rs(c.adv):'—'}),
      el('td',{class:'mono',style:'font-weight:700',text:rs(c.net)}),el('td',{},el('button',{class:'btn',type:'button',text:'Advance',onclick:()=>editPay(s,m)}))))),
    el('tfoot',{},el('tr',{},el('th',{text:'Total'}),...Array(13).fill(0).map(()=>el('td')),el('td',{class:'mono',text:rs(total)}),el('td'))));
  return[el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Salary · '+MON[mo-1]+' '+y}),el('div',{class:'row'},
      el('button',{class:'btn',type:'button',text:'Salary Excel',onclick:()=>exportSalary(m,calc)}),el('button',{class:'btn',type:'button',text:'Salary slips (PDF)',onclick:()=>exportSlips(m,calc)}),el('button',{class:'btn primary',type:'button',text:'Email slips',onclick:()=>emailSlips(m,calc)}))),
    ...warn.map(w=>el('div',{class:'banner',text:w})),
    el('div',{class:'scroll'},tbl),
    el('p',{class:'hint',text:'Rules: per day = salary ÷ days in the month. Sundays are paid, but a Sunday with leave or absence on both the Saturday before and the Monday after is cut. 6 hours or more is a full day, less is a half day. A sales person\'s work-from-home day is paid only if orders were entered for that day in Sales.'}))];
}
function editPay(s,m){
  const p=adminPay[s.id]||{};
  const adv=el('input',{id:'p-adv',type:'number',min:'0',value:p.advance||'',placeholder:'0'});
  const ex=el('input',{id:'p-ex',type:'number',min:'0',value:p.extra||'',placeholder:'0'});
  const nt=el('input',{id:'p-nt',type:'text',value:p.note||'',placeholder:'e.g. Advance on 15 Sep'});
  const save=async()=>{try{await call('savePay',{adminPin,pay:{month:m,staffId:s.id,advance:Number(adv.value)||0,extra:Number(ex.value)||0,note:nt.value.trim()}});closeOv();toast('Saved');reload()}catch(e){toast('Could not save: '+e.message)}};
  openOv(el('h2',{text:s.name}),el('p',{text:'Amounts for this month only.'}),el('label',{class:'f',for:'p-adv'},'Advance to deduct (₹)',adv),el('label',{class:'f',for:'p-ex'},'Bonus / extra to add (₹)',ex),el('label',{class:'f',for:'p-nt'},'Note (shows on the slip)',nt),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}),el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
}
function viewStaff(){
  const all=[...staff].sort(byOrder);
  const staffPanel=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Staff'}),el('button',{class:'btn',type:'button',text:'+ Add staff',onclick:()=>editStaff(null)})),
    all.length?el('div',{},...all.map(s=>el('div',{class:'staffrow'},
      el('div',{},el('div',{style:'font-weight:600',text:s.name+(s.active===false?' (not on check-in)':'')}),el('div',{class:'meta',text:['ID: '+s.id,catOf(s),(s.salary?rs(s.salary)+'/month':'No salary set'),(s.pin?'PIN set':'No PIN'),(s.email||'No email')].filter(Boolean).join(' · ')})),
      el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>editStaff(s)})))):el('div',{class:'empty',text:'No staff yet.'}));
  const setPanel=el('div',{class:'panel'},el('h3',{text:'Settings'}),
    el('p',{class:'hint',text:'The office phone opens the normal link and shows only check-in. Add #admin to the end of the link on the owner\'s or HR\'s phone to see these tabs. Everything is saved in your Google Sheet.'}),
    el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Change admin PIN',onclick:changeAdminPin}),
      el('button',{class:'btn',type:'button',text:'Change sheet link',onclick:askServer}),
      el('button',{class:'btn',type:'button',text:'Log out',onclick:()=>goHome()})));
  const rp=el('div',{class:'panel'},el('h3',{text:'Daily report & office rules'}),el('div',{class:'empty',text:'Loading…'}));
  call('reportSettings',{adminPin}).then(r=>{
    const on=el('select',{id:'r-on'},el('option',{value:'1',text:'On, send every day',selected:r.on}),el('option',{value:'0',text:'Off',selected:!r.on}));
    const hr=el('select',{id:'r-hr'},...Array.from({length:24},(_,h)=>el('option',{value:String(h),text:t12(pad2(h)+':00'),selected:r.hour===h})));
    const em=el('input',{id:'r-em',type:'email',value:r.email||'',placeholder:'office@gmail.com'});
    const la=el('input',{id:'r-la',type:'time',value:r.lateAfter||'09:40'});
    const mh=el('input',{id:'r-mh',type:'number',min:'1',max:'12',step:'0.5',value:r.minHours||8});
    const save=el('button',{class:'btn primary',type:'button',text:'Save'});
    save.onclick=async()=>{save.disabled=true;try{await call('reportSettings',{adminPin,set:{on:on.value==='1',hour:Number(hr.value),email:em.value.trim(),lateAfter:la.value,minHours:Number(mh.value)||8}});toast('Saved')}catch(e){toast('Could not save: '+e.message)}save.disabled=false};
    const now=el('button',{class:'btn',type:'button',text:'Send today\'s report now'});
    now.onclick=async()=>{now.disabled=true;now.textContent='Sending…';try{const j=await call('sendReportNow',{adminPin});toast('Report sent to '+j.to)}catch(e){toast('Could not send: '+e.message)}now.disabled=false;now.textContent='Send today\'s report now'};
    rp.replaceChildren(el('h3',{text:'Daily report & office rules'}),
      el('p',{class:'hint',text:'Every day the office mail gets one report: orders and sales of each sales staff, products, districts, and who was late, left early or did not come, with reasons.'}),
      el('div',{class:'form2'},el('label',{class:'f',for:'r-on'},'Daily report e-mail',on),el('label',{class:'f',for:'r-hr'},'Send at',hr),el('label',{class:'f',for:'r-em'},'Send to',em),
        el('label',{class:'f',for:'r-la'},'Late after',la),el('label',{class:'f',for:'r-mh'},'Minimum hours (early-leave reason)',mh)),
      el('div',{class:'row'},save,now));
  }).catch(e=>rp.replaceChildren(el('h3',{text:'Daily report & office rules'}),el('div',{class:'empty',text:'Update Code.gs in Apps Script to use this. ('+e.message+')'})));
  return[el('div',{class:'split'},staffPanel,setPanel),rp];
}
function changeAdminPin(){let first=null;
  const ask=()=>pinSheet({title:first?'Repeat new PIN':'New admin PIN',onDone:async v=>{
    if(!first){first=v;setTimeout(ask,150);return}
    if(v!==first){first=null;toast('PINs did not match.');setTimeout(ask,150);return}
    try{await call('setAdminPin',{adminPin,newPin:v});adminPin=v;closeOv();toast('Admin PIN changed')}catch(e){toast(e.message)}}});
  ask()}
function editCell(s,ds,r){
  const st=el('select',{id:'e-st'},...[['present','Present (times below)'],['leave','Leave'],['wfh','Work from home']].map(([v,t])=>el('option',{value:v,text:t,selected:(r?.status||'present')===v})));
  const tin=el('input',{id:'e-in',type:'time',value:r?.in||''});const tout=el('input',{id:'e-out',type:'time',value:r?.out||''});
  const note=el('input',{id:'e-note',type:'text',placeholder:'Note (optional)',value:r?.note||''});
  const lr=el('input',{id:'e-lr',type:'text',placeholder:'—',value:r?.lateReason||''});const er=el('input',{id:'e-er',type:'text',placeholder:'—',value:r?.earlyReason||''});
  const save=async()=>{const status=st.value;const rec={staffId:s.id,date:ds,status,in:status==='present'?(tin.value||''):'',out:status==='present'?(tout.value||''):'',note:note.value||'',lateReason:lr.value.trim(),earlyReason:er.value.trim()};
    if(status==='present'&&!rec.in){toast('Enter the IN time, or choose Leave / WFH.');return}
    if(rec.in&&rec.out&&toMin(rec.out)<=toMin(rec.in)){toast('OUT time must be after IN time.');return}
    try{await call('saveAtt',{adminPin,rec});closeOv();toast('Saved');reload()}catch(e){toast('Could not save: '+e.message)}};
  const clear=async()=>{try{await call('deleteAtt',{adminPin,date:ds,staffId:s.id});closeOv();toast('Cleared');reload()}catch(e){toast('Could not clear.')}};
  openOv(el('h2',{text:s.name}),el('p',{text:ds}),el('label',{class:'f',for:'e-st'},'Status',st),
    el('div',{class:'row'},el('label',{class:'f',style:'flex:1',for:'e-in'},'IN',tin),el('label',{class:'f',style:'flex:1',for:'e-out'},'OUT',tout)),
    el('label',{class:'f',for:'e-note'},'Note',note),el('label',{class:'f',for:'e-lr'},'Late reason',lr),el('label',{class:'f',for:'e-er'},'Early leaving reason',er),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}),r?el('button',{class:'btn danger',type:'button',text:'Clear day',onclick:clear}):null,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
}
function editStaff(s){
  const nm=el('input',{id:'s-nm',type:'text',value:s?.name||'',placeholder:'Name'});
  const sal=el('input',{id:'s-sal',type:'number',min:'0',value:s?.salary||'',placeholder:'e.g. 9000'});
  const em=el('input',{id:'s-em',type:'email',value:s?.email||'',placeholder:'name@gmail.com'});
  const pn=el('input',{id:'s-pn',type:'text',inputmode:'numeric',maxlength:'4',value:s?.pin||'',placeholder:'4 digits'});
  const od=el('input',{id:'s-od',type:'number',value:s?.order??'',placeholder:'1, 2, 3…'});
  /* one person can have more than one category (e.g. Media + Add-ons). Regular = attendance only, so it stands alone */
  const cur=s?catsOf(s):['Office'];
  const boxes=CATS.map(c=>{const b=el('input',{type:'checkbox',value:c,style:'width:20px;height:20px;margin:0'});b.checked=cur.includes(c);return b});
  boxes.forEach(b=>b.addEventListener('change',()=>{if(!b.checked)return;if(b.value==='Regular')boxes.forEach(x=>{if(x!==b)x.checked=false});else boxes.forEach(x=>{if(x.value==='Regular')x.checked=false})}));
  const sl=el('div',{id:'s-sl',style:'display:flex;flex-direction:column;gap:6px;padding:4px 0'},...boxes.map(b=>el('label',{style:'display:flex;align-items:center;gap:10px;font-weight:500;cursor:pointer'},b,el('span',{},b.value,el('span',{class:'hint',text:CAT_NOTE[b.value]||''})))));
  const picked=()=>boxes.filter(b=>b.checked).map(b=>b.value);
  const ac=el('select',{id:'s-ac'},el('option',{value:'1',text:'Shown on check-in screen',selected:s?.active!==false}),el('option',{value:'0',text:'Not on check-in (left, or works outside)',selected:s?.active===false}));
  const save=async()=>{const name=nm.value.trim().toUpperCase();if(!name){toast('Enter a name.');return}
    const cats=picked();if(!cats.length){toast('Tick at least one category.');return}
    const pin=pn.value.trim();if(pin&&!/^\d{4}$/.test(pin)){toast('PIN must be exactly 4 digits.');return}
    const id=s?.id||name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now().toString(36).slice(-4);
    try{await call('saveStaff',{adminPin,staff:{id,name,role:cats.join(','),salary:Number(sal.value)||0,pin,order:od.value===''?null:Number(od.value),sales:cats.includes('Sales'),active:ac.value==='1',email:em.value.trim()}});closeOv();toast('Saved '+name);reload()}catch(e){toast('Could not save: '+e.message)}};
  openOv(el('h2',{text:s?'Edit staff':'Add staff'}),el('label',{class:'f',for:'s-nm'},'Name',nm),el('label',{class:'f',for:'s-sal'},'Monthly salary (₹)',sal),el('label',{class:'f',for:'s-em'},'Email (for salary slips)',em),
    el('label',{class:'f',for:'s-pn'},'PIN (4 digits). Leave empty so the staff can create their own PIN',pn),el('div',{class:'f'},el('span',{},'Category (tick one or more)'),sl),el('label',{class:'f',for:'s-od'},'Order on screen',od),el('label',{class:'f',for:'s-ac'},'Check-in',ac),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}),s?delStaffBtn(s):null,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
}
/* Delete: staff with no saved data go straight away; staff with data get a second screen (hide instead, or delete everything) */
function delStaffBtn(s){
  const b=el('button',{class:'btn danger',type:'button',text:'Delete'});
  b.onclick=async()=>{if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='Tap again to delete';return}
    b.disabled=true;b.textContent='Deleting…';
    try{await call('deleteStaff',{adminPin,id:s.id});closeOv();toast('Deleted '+s.name);reload()}
    catch(e){const h=e.data&&e.data.hasData;if(h){delStaffData(s,h);return}b.disabled=false;b.dataset.sure='';b.textContent='Delete';toast('Could not delete: '+e.message)}};
  return b}
function delStaffData(s,h){
  const parts=[[h.att,'attendance day'],[h.orders,'order'],[h.work,'work entry','work entries'],[h.sales,'lead entry','lead entries'],[h.pay,'advance / extra entry','advance / extra entries']].filter(x=>x[0]>0).map(x=>x[0]+' '+(x[0]===1?x[1]:(x[2]||x[1]+'s')));
  const hide=el('button',{class:'btn primary',type:'button',text:'Hide from check-in (keep data)',onclick:async()=>{
    try{await call('saveStaff',{adminPin,staff:{...s,active:false}});closeOv();toast(s.name+' hidden');reload()}catch(e){toast('Could not save: '+e.message)}}});
  const all=el('button',{class:'btn danger',type:'button',text:'Delete with all data'});
  all.onclick=async()=>{if(all.dataset.sure!=='1'){all.dataset.sure='1';all.textContent='Sure? Tap again — this cannot be undone';return}
    all.disabled=true;all.textContent='Deleting…';
    try{await call('deleteStaff',{adminPin,id:s.id,withData:true});closeOv();toast('Deleted '+s.name+' and all data');reload()}catch(e){all.disabled=false;toast('Could not delete: '+e.message)}};
  openOv(el('h2',{text:'Delete '+s.name+'?'}),
    el('p',{text:s.name+' has saved data: '+parts.join(', ')+'.'}),
    el('p',{class:'hint',text:'If this was a test / sample entry, delete with all data. If this person really worked here, hide them instead — salary, sales and order reports stay correct.'}),
    el('div',{class:'row'},hide,all,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
}

/* ---------- shared lists ---------- */
const DISTRICTS=['MALAPPURAM','KOZHIKODE','PALAKKAD','THRISSUR','ERNAKULAM','KANNUR','KASARAGOD','WAYANAD','KOLLAM','THIRUVANANTHAPURAM','ALAPPUZHA','KOTTAYAM','IDUKKI','PATHANAMTHITTA','CHENNAI','COIMBATORE','MADURAI','TIRUCHIRAPPALLI','SALEM','TIRUNELVELI','KANYAKUMARI','THANJAVUR','DINDIGUL','NILGIRIS','PUDUCHERRY','KARNATAKA','TAMILNADU','OTHER STATE'];
/* product list comes from the Products tab of the sheet; this is only used until the sheet answers */
let products=[['FULL ROMBER','premium',1350],['HALF ROMBER','premium',899],['PANT TYPE ROMBER','premium',1050],['SKIRTS','premium',1500],['CODSET','premium',800],['T SHIRT','premium',650],
  ['FULL ROMBER','affordable',810],['HALF ROMBER','affordable',650],['CODSET','affordable',0]].map(([name,type,price],i)=>({id:(type[0])+'-'+i,name,type,price,active:true,order:i+1}));
const pkey=v=>String(v||'').trim().toUpperCase();
function datalist(id,items){let d=document.getElementById(id);if(!d){d=el('datalist',{id});document.body.append(d)}d.replaceChildren(...[...new Set(items)].map(v=>el('option',{value:v})));return id}
function orderForm(o,onSave,extra){
  o=o||{};
  const f=(id,label,attrs)=>{const i=el('input',{id,...attrs});return[i,el('label',{class:'f',for:id},label,i)]};
  const [nm,lnm]=f('o-nm','Customer name',{type:'text',value:o.customer||'',autocomplete:'off'});
  const [ph,lph]=f('o-ph','Phone (10 digits)',{type:'tel',inputmode:'numeric',maxlength:'14',value:o.phone||''});
  const [di,ldi]=f('o-di','District',{type:'text',value:o.district||'',list:datalist('dl-dist',DISTRICTS),autocomplete:'off'});
  const [pc,lpc]=f('o-pc','Pincode',{type:'text',inputmode:'numeric',maxlength:'6',value:o.pincode||''});
  const [qt,lqt]=f('o-qt','Qty',{type:'number',min:'1',value:o.qty||1});
  const [am,lam]=f('o-am','Amount ₹ (total)',{type:'number',min:'0',value:o.amount||''});
  /* Type first, then pick the product from that list; the price fills the amount (it can still be changed) */
  let type=o.type==='affordable'?'affordable':'premium';
  const tyBox=el('div',{class:'seg',role:'radiogroup','aria-label':'Type'});
  const pr=el('select',{id:'o-pr'});
  const other=el('input',{id:'o-pr2',type:'text',placeholder:'Type the product name',autocomplete:'off',hidden:true,style:'margin-top:6px'});
  const fillProducts=()=>{
    const list=products.filter(p=>p.type===type&&p.active!==false);const cur=pkey(o.product);
    const opts=[el('option',{value:'',text:'— Choose product —'}),...list.map(p=>el('option',{value:pkey(p.name),text:p.name}))];
    if(cur&&!list.some(p=>pkey(p.name)===cur)&&type===(o.type==='affordable'?'affordable':'premium'))opts.push(el('option',{value:cur,text:cur}));
    opts.push(el('option',{value:'__other',text:'Other (type name)…'}));
    pr.replaceChildren(...opts);pr.value=(type===(o.type==='affordable'?'affordable':'premium')&&cur)?cur:'';other.hidden=true};
  const drawType=()=>tyBox.replaceChildren(...[['premium','Premium'],['affordable','Affordable']].map(([v,t])=>el('button',{type:'button',role:'radio','aria-checked':String(type===v),class:'segbtn'+(type===v?' on':''),text:t,onclick:()=>{if(type===v)return;type=v;drawType();fillProducts()}})));
  drawType();fillProducts();
  pr.onchange=()=>{other.hidden=pr.value!=='__other';if(!other.hidden)other.focus()};
  const lpr=el('label',{class:'f',for:'o-pr',style:'grid-column:1/-1'},'Product',pr,other);
  const [nt,lnt]=f('o-nt','Note (optional)',{type:'text',value:o.note||''});
  const [on,lon]=f('o-no','Order No. (empty = automatic)',{type:'text',value:o.orderNo||'',autocomplete:'off',style:'text-transform:uppercase'});
  const dp=el('input',{id:'o-dp',type:'checkbox'});dp.checked=o.dispatched==='TRUE'||o.dispatched===true;
  const ldp=el('label',{for:'o-dp',style:'display:flex;gap:8px;align-items:center;font-weight:500'},dp,'Dispatched');
  const btn=el('button',{class:'btn primary big',type:'button',text:o.id?'Save changes':'Save order'});
  btn.onclick=async()=>{
    const data={...o,orderNo:on.value.trim().toUpperCase(),dispatched:dp.checked,customer:nm.value.trim(),phone:ph.value.replace(/\D/g,''),district:di.value.trim().toUpperCase(),pincode:pc.value.replace(/\D/g,''),product:pr.value==='__other'?pkey(other.value):pr.value,qty:Number(qt.value)||1,amount:Number(am.value)||0,type,note:nt.value.trim()};
    if(!data.customer&&!data.phone){toast('Enter the customer name or phone.');return}
    if(data.phone&&data.phone.length<10){toast('Phone number needs 10 digits.');return}
    if(data.pincode&&data.pincode.length!==6){toast('Pincode needs 6 digits.');return}
    if(!data.product){toast('Choose the product.');return}
    btn.disabled=true;btn.textContent='Saving…';
    try{await onSave(data)}catch(e){toast('Could not save: '+e.message)}finally{btn.disabled=false;btn.textContent=o.id?'Save changes':'Save order'}
  };
  return el('div',{class:'panel'},el('h3',{text:o.id?'Edit order '+(o.orderNo||''):'New order'}),
    el('div',{class:'f'},'Type',tyBox),
    el('div',{class:'form2'},lpr,lqt,lam,lon,lnm,lph,ldi,lpc),lnt,ldp,btn);
}

/* ---------- daily work (media / production) ---------- */
let tasks=[], adminWork=[], adminWorkDate=null;
const CATS=['Sales','Office','Media','Printing','Add-ons','Regular'];
const CAT_NOTE={Sales:' (enters orders)',Printing:' (printing production)','Add-ons':' (bows, socks, boots…)',Regular:' (all work · attendance only)'};
const roleCat=r=>{const x=String(r||'').trim();if(x.toLowerCase()==='production')return'Printing';return CATS.includes(x)?x:'Office'};
/* role can hold several categories: "Media,Add-ons" */
const catsOf=s=>{const l=String(s.role||'').split(',').map(x=>x.trim()).filter(Boolean).map(roleCat);if(s.sales&&!l.includes('Sales'))l.unshift('Sales');const u=[...new Set(l)];return u.length?u:['Office']};
const roleText=r=>String(r||'').split(',').map(x=>x.trim()).filter(Boolean).join(' + ');
const isRegular=s=>!!s&&catsOf(s).includes('Regular'); /* Regular = does every kind of work; attendance + salary only, no work list */
const catOf=s=>catsOf(s).join(' + ');
const KINDS=[['count','Number (how many)'],['yesno','Done / not done'],['colours','Colour + how many (bows)'],['items','Fixed list + how many (e.g. PHR, PFR…)'],['text','Short note / order numbers']];
const tasksFor=s=>isRegular(s)?[]:tasks.filter(t=>t.active!==false&&(catsOf(s).includes(t.category)||t.category===s.id));
/* options like "PHR:PREMIUM HALF ROMBER" → saved as PHR, shown with the full name */
const optList=t=>(t.options||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>{const[c,l]=x.split(':').map(y=>y.trim());return{code:c.toUpperCase(),label:l||c}});
const optLabel=(t,c)=>{const o=optList(t).find(x=>x.code===c);return o?o.label:c};
const forLabel=c=>{const s=staff.find(x=>x.id===c);return s?s.name:c};
const COLOURS=['RED','BLUE','NAVY BLUE','PEPSI BLUE','GREEN','GOLD','BROWN','PINK','CARBON','BLACK','WHITE','CREAM','YELLOW','PEACH','LAVENDER','MAROON'];
const colTotal=v=>{try{return Object.values(JSON.parse(v||'{}')).reduce((a,b)=>a+(+b||0),0)}catch(e){return 0}};
const colParse=v=>{try{return JSON.parse(v||'{}')}catch(e){return{}}};
function fmtWork(t,v){if(v==null||v==='')return'';if(t.kind==='yesno')return v==='TRUE'?'✓ Done':'✗ Not done';if(t.kind==='text')return String(v);
  if(t.kind==='colours'||t.kind==='items'){const o=colParse(v);return colTotal(v)+' ('+Object.entries(o).map(([c,q])=>optLabel(t,c).toLowerCase()+' '+q).join(', ')+')'}return String(v)}
/* one form for a day's work; rows = existing Work rows of that staff+date */
function workForm(list,rows,onSave){
  const val=id=>(rows.find(r=>r.taskId===id)||{}).value||'';
  datalist('dl-col',COLOURS);
  const getters=list.map(t=>{const id='w-'+t.id;
    if(t.kind==='yesno'){const sel=el('select',{id},el('option',{value:'',text:'—'}),el('option',{value:'TRUE',text:'Done',selected:val(t.id)==='TRUE'}),el('option',{value:'FALSE',text:'Not done',selected:val(t.id)==='FALSE'}));
      return{node:el('label',{class:'f',for:id},t.name,sel),get:()=>sel.value}}
    if(t.kind==='text'){const inp=el('textarea',{id,rows:'2',placeholder:'Type here…',style:'width:100%;font:inherit;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--sunk);color:var(--ink)'});inp.value=val(t.id);
      return{wide:true,node:el('label',{class:'f',for:id},t.name,inp),get:()=>inp.value.trim()}}
    if(t.kind==='items'){const opts=optList(t);const cur=colParse(val(t.id));const tot=el('span',{class:'hint'});
      const inps=opts.map(o=>el('input',{type:'number',min:'0',inputmode:'numeric',value:cur[o.code]||'',placeholder:'0','aria-label':o.label}));
      const upd=()=>{tot.textContent='Total: '+inps.reduce((a,i)=>a+(+i.value||0),0)};inps.forEach(i=>i.addEventListener('input',upd));upd();
      return{wide:true,node:el('div',{class:'f'},el('div',{class:'toolbar'},el('b',{text:t.name}),tot),el('div',{class:'itemgrid'},...opts.map((o,k)=>el('label',{class:'f'},el('span',{},o.label,o.label!==o.code?el('span',{class:'c-hrs',text:' ('+o.code+')'}):null),inps[k])))),
        get:()=>{const r={};opts.forEach((o,k)=>{if(+inps[k].value>0)r[o.code]=+inps[k].value});return r}}}
    if(t.kind==='colours'){const box=el('div',{class:'colrows'});const tot=el('span',{class:'hint'});
      const upd=()=>{let n=0;box.querySelectorAll('input[type=number]').forEach(i=>n+=+i.value||0);tot.textContent='Total: '+n};
      const addRow=(c,q)=>{const ci=el('input',{type:'text',list:'dl-col',value:c||'',placeholder:'Colour',autocomplete:'off','aria-label':'Colour',style:'text-transform:uppercase'});
        const qi=el('input',{type:'number',min:'0',inputmode:'numeric',value:q||'',placeholder:'0','aria-label':'How many',oninput:upd});
        const rm=el('button',{class:'btn',type:'button','aria-label':'Remove colour',text:'✕',onclick:()=>{r.remove();upd()}});
        const r=el('div',{class:'colrow'},ci,qi,rm);box.append(r);upd();return ci};
      const ex=Object.entries(colParse(val(t.id)));ex.length?ex.forEach(([c,q])=>addRow(c,q)):addRow();
      return{node:el('div',{class:'f'},el('div',{class:'toolbar'},el('b',{text:t.name}),tot),box,el('button',{class:'btn',type:'button',text:'+ Add colour',onclick:()=>addRow().focus()})),
        wide:true,get:()=>{const o={};box.querySelectorAll('.colrow').forEach(r=>{const[c,q]=r.querySelectorAll('input');const k=c.value.trim().toUpperCase();if(k&&+q.value>0)o[k]=(o[k]||0)+(+q.value)});return o}}}
    const inp=el('input',{id,type:'number',min:'0',inputmode:'numeric',value:val(t.id),placeholder:'0'});
    return{node:el('label',{class:'f',for:id},t.name,inp),get:()=>inp.value}});
  const btn=el('button',{class:'btn primary big',type:'button',text:'Save work',style:'width:100%;margin-top:12px'});
  btn.onclick=async()=>{btn.disabled=true;btn.textContent='Saving…';
    try{await onSave(list.map((t,i)=>({taskId:t.id,value:getters[i].get()})))}catch(e){toast('Could not save: '+e.message)}
    btn.disabled=false;btn.textContent='Save work'};
  /* keep the sheet's order; small fields sit two per row, big ones take a full row */
  const out=[];let run=[];const flush=()=>{if(run.length){out.push(el('div',{class:'form2'},...run));run=[]}};
  getters.forEach(g=>{if(g.wide){flush();out.push(g.node)}else run.push(g.node)});flush();
  return el('div',{},...out,btn);
}
function myWorkView(d){
  const td=d.today;const days=[0,1,2,3].map(i=>{const x=new Date(td+'T12:00:00');x.setDate(x.getDate()-i);return ymd(x)});
  if(!workDate||!days.includes(workDate))workDate=td;
  const sel=el('select',{id:'wdate','aria-label':'Day',onchange:e=>{workDate=e.target.value;ordersHome()}},...days.map((ds,i)=>el('option',{value:ds,selected:ds===workDate,text:(i===0?'Today':i===1?'Yesterday':'')+' '+ds.slice(8)+'/'+ds.slice(5,7)})));
  const rows=myWork.filter(w=>w.date===workDate);
  const form=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Today\'s work · '+d.category}),sel),
    workForm(myTasks,rows,async items=>{const j=await call('saveMyWork',{staffId:me.id,pin:me.pin,date:workDate,items});toast('Work saved');if(workDate.slice(0,7)===d.month)myWork=j.work;ordersHome()}));
  const dates=[...new Set(myWork.map(w=>w.date))].sort().reverse();
  const hist=el('div',{class:'panel'},el('h3',{text:'This month'}),dates.length?el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},el('th',{text:'Date'}),...myTasks.map(t=>el('th',{text:t.name})))),
    el('tbody',{},...dates.map(ds=>el('tr',{},el('th',{class:'mono',text:ds.slice(8)+'/'+ds.slice(5,7)}),...myTasks.map(t=>{const w=myWork.find(x=>x.date===ds&&x.taskId===t.id);return el('td',{text:w?fmtWork(t,w.value):''})})))),
    el('tfoot',{},el('tr',{},el('th',{text:'Total'}),...myTasks.map(t=>el('td',{class:'mono',text:workTotal(t,myWork.filter(w=>w.taskId===t.id))})))))):el('div',{class:'empty',text:'No work saved this month yet.'}));
  return[form,hist];
}
function workTotal(t,list){if(!list.length)return'';if(t.kind==='yesno')return list.filter(w=>w.value==='TRUE').length+' days';if(t.kind==='text')return list.length+' days';if(t.kind==='colours'||t.kind==='items')return String(list.reduce((a,w)=>a+colTotal(w.value),0));return String(list.reduce((a,w)=>a+(+w.value||0),0))}
function viewWork(){
  const m=adminMonth;if(!adminWorkDate||adminWorkDate.slice(0,7)!==m)adminWorkDate=m===todayStr.slice(0,7)?todayStr:m+'-01';
  const people=[...staff].sort(byOrder).filter(s=>tasksFor(s).length&&(s.active!==false||adminWork.some(w=>w.staffId===s.id)));
  const dI=el('input',{id:'wdate-a',type:'date',value:adminWorkDate,min:m+'-01',max:ymd(monthDates(m).slice(-1)[0]),onchange:e=>{adminWorkDate=e.target.value;renderAdmin()}});
  const day=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Work on this day'}),dI),
    people.length?el('div',{},...people.map(s=>{const list=tasksFor(s);const rows=adminWork.filter(w=>w.staffId===s.id&&w.date===adminWorkDate);
      return el('div',{class:'staffrow'},el('div',{},el('div',{style:'font-weight:600',text:s.name+' · '+catOf(s)}),
        el('div',{class:'meta',text:rows.length?list.filter(t=>rows.some(r=>r.taskId===t.id)).map(t=>t.name.toLowerCase()+': '+fmtWork(t,rows.find(r=>r.taskId===t.id).value)).join(' · '):'Nothing saved'})),
        el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>{openOv(el('h2',{text:s.name+' · '+adminWorkDate}),workForm(list,rows,async items=>{const j=await call('saveWork',{adminPin,staffId:s.id,date:adminWorkDate,items});adminWork=j.work;closeOv();toast('Saved');renderAdmin()}),el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv})));$('#sheet').style.maxWidth='560px'}}))})):
      el('div',{class:'empty',text:'No work list for any staff yet. Add work below.'}));
  const totals=people.map(s=>{const list=tasksFor(s);const mine=adminWork.filter(w=>w.staffId===s.id);
    return el('div',{class:'panel'},el('h3',{text:s.name+' · '+MON[+m.slice(5)-1]+' total · '+new Set(mine.map(w=>w.date)).size+' days filled'}),
      el('div',{class:'scroll'},el('table',{},el('tbody',{},...list.filter(t=>t.kind!=='text').map(t=>el('tr',{},el('th',{text:t.name}),el('td',{class:'mono',text:workTotal(t,mine.filter(w=>w.taskId===t.id))||'—'})))))))});
  const colTasks=tasks.filter(t=>t.kind==='colours'||t.kind==='items');
  const colPanels=colTasks.map(t=>{const g={};adminWork.filter(w=>w.taskId===t.id).forEach(w=>Object.entries(colParse(w.value)).forEach(([c,q])=>g[c]=(g[c]||0)+(+q||0)));const rowsC=Object.entries(g).sort((a,b)=>b[1]-a[1]);if(!rowsC.length)return null;
    return el('div',{class:'panel'},el('h3',{text:t.name+(t.kind==='colours'?' by colour · ':' · ')+MON[+m.slice(5)-1]}),el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},el('th',{text:t.kind==='colours'?'Colour':'Item'}),el('th',{text:'Total'}))),
      el('tbody',{},...rowsC.map(([c,q])=>el('tr',{},el('th',{text:optLabel(t,c)}),el('td',{class:'mono',text:String(q)})))),el('tfoot',{},el('tr',{},el('th',{text:'Total'}),el('td',{class:'mono',text:String(rowsC.reduce((a,r)=>a+r[1],0))}))))))}).filter(Boolean);
  const groups=[...new Set(tasks.map(t=>t.category))];
  const manage=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Work list (who fills what)'}),el('button',{class:'btn',type:'button',text:'+ Add work',onclick:()=>editTask({category:'Printing',kind:'count'})})),
    el('p',{class:'hint',text:'A work item can be for a whole category (everyone in Media sees it) or for one person (only Jaseera sees it).'}),
    ...groups.map(c=>{const list=tasks.filter(t=>t.category===c);return el('div',{},el('div',{class:'hint',style:'margin-top:10px;font-weight:600',text:'For '+forLabel(c)}),...list.map(t=>el('div',{class:'staffrow'},el('div',{},el('div',{style:'font-weight:600',text:t.name+(t.active===false?' (hidden)':'')}),el('div',{class:'meta',text:(KINDS.find(k=>k[0]===t.kind)||KINDS[0])[1]+(t.options?' · '+t.options:'')})),el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>editTask(t)}))))}));
  return[day,...colPanels,...totals,manage];
}
function editTask(t){
  const nm=el('input',{id:'t-nm',type:'text',value:t.name||'',placeholder:'e.g. VIDEO EDITING',style:'text-transform:uppercase'});
  const ct=el('select',{id:'t-ct'},el('optgroup',{label:'Everyone in a category'},...CATS.filter(c=>c!=='Sales'&&c!=='Regular').map(c=>el('option',{value:c,text:c,selected:t.category===c}))),
    el('optgroup',{label:'Only one person'},...[...staff].sort(byOrder).filter(x=>!x.sales&&!isRegular(x)).map(x=>el('option',{value:x.id,text:x.name,selected:t.category===x.id}))));
  const op=el('input',{id:'t-op',type:'text',value:t.options||'',placeholder:'e.g. PHR, PFR, PPR'});
  const kd=el('select',{id:'t-kd'},...KINDS.map(([v,x])=>el('option',{value:v,text:x,selected:t.kind===v})));
  const od=el('input',{id:'t-od',type:'number',value:t.order&&t.order!==999?t.order:'',placeholder:'1, 2, 3…'});
  const ac=el('select',{id:'t-ac'},el('option',{value:'1',text:'Shown to staff',selected:t.active!==false}),el('option',{value:'0',text:'Hidden',selected:t.active===false}));
  const save=async()=>{if(!nm.value.trim()){toast('Enter the work name.');return}
    try{const j=await call('saveTask',{adminPin,task:{id:t.id,name:nm.value,category:ct.value,kind:kd.value,options:op.value,order:od.value,active:ac.value==='1'}});tasks=j.tasks;closeOv();toast('Saved');renderAdmin()}catch(e){toast('Could not save: '+e.message)}};
  const del=t.id?el('button',{class:'btn danger',type:'button',text:'Delete',onclick:async()=>{if(del.dataset.sure!=='1'){del.dataset.sure='1';del.textContent='Tap again to delete';return}
    try{const j=await call('deleteTask',{adminPin,id:t.id});tasks=j.tasks;closeOv();toast('Deleted');renderAdmin()}catch(e){toast('Could not delete.')}}}):null;
  openOv(el('h2',{text:t.id?'Edit work':'Add work'}),el('label',{class:'f',for:'t-nm'},'Work name',nm),el('label',{class:'f',for:'t-ct'},'For',ct),el('label',{class:'f',for:'t-kd'},'How it is filled',kd),el('label',{class:'f',for:'t-op'},'List (only for "Fixed list"), separated by commas. Short form + full name: PHR:PREMIUM HALF ROMBER',op),
    el('label',{class:'f',for:'t-od'},'Order in the list',od),el('label',{class:'f',for:'t-ac'},'Show',ac),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}),del,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
}

/* ---------- admin: product list ---------- */
function viewProducts(){
  const cnt={};adminOrders.forEach(o=>{const k=o.type+'|'+pkey(o.product);cnt[k]=(cnt[k]||0)+1});
  const block=(type,title)=>{const list=products.filter(p=>p.type===type);
    return el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:title+' ('+list.length+')'}),el('button',{class:'btn',type:'button',text:'+ Add '+title.toLowerCase()+' product',onclick:()=>editProduct({type})})),
      list.length?el('div',{},...list.map(p=>el('div',{class:'staffrow'},
        el('div',{},el('div',{style:'font-weight:600',text:p.name+(p.active===false?' (hidden)':'')}),el('div',{class:'meta',text:(cnt[type+'|'+pkey(p.name)]||0)+' orders this month'})),
        el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>editProduct(p)})))):el('div',{class:'empty',text:'No products yet.'}))};
  return[el('p',{class:'hint',text:'Sales staff choose from this list when they make an order. Hide a product instead of deleting it if old orders use it.'}),
    el('div',{class:'split'},block('premium','Premium'),block('affordable','Affordable'))];
}
function editProduct(p){
  const nm=el('input',{id:'p-nm',type:'text',value:p.name||'',placeholder:'e.g. FULL ROMBER',style:'text-transform:uppercase'});
  const ty=el('select',{id:'p-ty'},el('option',{value:'premium',text:'Premium',selected:p.type!=='affordable'}),el('option',{value:'affordable',text:'Affordable',selected:p.type==='affordable'}));
  const od=el('input',{id:'p-od',type:'number',value:p.order&&p.order!==999?p.order:'',placeholder:'1, 2, 3…'});
  const ac=el('select',{id:'p-ac'},el('option',{value:'1',text:'Shown in order form',selected:p.active!==false}),el('option',{value:'0',text:'Hidden (not sold now)',selected:p.active===false}));
  const save=async()=>{if(!nm.value.trim()){toast('Enter the product name.');return}
    try{const j=await call('saveProduct',{adminPin,product:{id:p.id,name:nm.value,type:ty.value,price:'',order:od.value,active:ac.value==='1'}});products=j.products;closeOv();toast('Saved');renderAdmin()}catch(e){toast('Could not save: '+e.message)}};
  const del=p.id?el('button',{class:'btn danger',type:'button',text:'Delete',onclick:async()=>{if(del.dataset.sure!=='1'){del.dataset.sure='1';del.textContent='Tap again to delete';return}
    try{const j=await call('deleteProduct',{adminPin,id:p.id});products=j.products;closeOv();toast('Deleted');renderAdmin()}catch(e){toast('Could not delete.')}}}):null;
  openOv(el('h2',{text:p.id?'Edit product':'Add product'}),el('label',{class:'f',for:'p-nm'},'Product name',nm),el('label',{class:'f',for:'p-ty'},'Type',ty),
    el('label',{class:'f',for:'p-od'},'Order in the list',od),el('label',{class:'f',for:'p-ac'},'Show',ac),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}),del,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
}

/* ---------- staff portal (#me): each staff logs in with name + PIN ---------- */
let me=null;
try{me=JSON.parse(LS.get('couplo_me')||'null')}catch(e){me=null}
let portalTab='auto', portalMonth=null, myTasks=[], myWork=[], workDate=null;
function portalOut(){goHome()}
async function ordersBoot(){show('orders');if(!me){goHome();return}ordersHome()}
let myOrders=[];
async function ordersHome(edit){
  const box=$('#orders');
  portalMonth=portalMonth||ymOf(new Date());
  let d;
  try{d=await call('myData',{staffId:me.id,pin:me.pin,month:portalMonth})}
  catch(e){if(/PIN|not found/i.test(e.message)){toast(e.message);portalOut();return}box.replaceChildren(el('div',{class:'empty',text:'Cannot reach the sheet. Check the internet.'}));return}
  me.sales=d.sales;if(d.products)products=d.products;
  myOrders=d.orders.sort((a,b)=>(b.createdAt||b.date).localeCompare(a.createdAt||a.date));
  const now=new Date(),opts=[0,1,2].map(i=>{const x=new Date(now.getFullYear(),now.getMonth()-i,1);return el('option',{value:ymOf(x),selected:ymOf(x)===portalMonth,text:MON[x.getMonth()]+' '+x.getFullYear()})});
  const head=el('div',{class:'toolbar'},el('div',{style:'font:600 22px var(--f-display)',text:me.name}),
    el('div',{class:'row'},el('select',{id:'pm','aria-label':'Month',onchange:e=>{portalMonth=e.target.value;ordersHome()}},...opts),el('button',{class:'btn',type:'button',text:'Change PIN',onclick:changeMyPin}),el('button',{class:'btn',type:'button',text:'Log out',onclick:portalOut})));
  myTasks=d.tasks||[];myWork=d.work||[];
  if(d.category==='Regular'&&!me.sales){myTasks=[];myWork=[]} /* Regular staff see only attendance */
  const tabList=[['att','My attendance']].concat(me.sales?[['orders','My orders']]:[]).concat(myTasks.length?[['work','My work']]:[]);
  if(portalTab==='auto')portalTab=me.sales?'orders':myTasks.length?'work':'att';
  if(!tabList.some(t=>t[0]===portalTab))portalTab='att';
  const tabs=el('nav',{class:'tabs',role:'tablist'},...tabList.map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':String(portalTab===v),text:t,onclick:()=>{portalTab=v;ordersHome()}})));
  const body=portalTab==='att'?myAttendance(d):portalTab==='work'?myWorkView(d):myOrdersView(edit,d);
  const warn=me.pin==='1234'?el('div',{class:'banner'},'You are using the default PIN 1234. ',el('button',{class:'btn',type:'button',text:'Change PIN now',onclick:changeMyPin})):null;
  box.replaceChildren(head,warn,tabs,...body);
}
function changeMyPin(){let first=null;
  const ask=()=>pinSheet({title:first?'Repeat new PIN':'New PIN',onDone:async v=>{
    if(!first){first=v;setTimeout(ask,150);return}
    if(v!==first){first=null;toast('PINs did not match.');setTimeout(ask,150);return}
    try{await call('changeMyPin',{staffId:me.id,pin:me.pin,newPin:v});me.pin=v;LS.set('couplo_me',JSON.stringify(me));closeOv();toast('PIN changed')}catch(e){closeOv();toast(e.message)}}});
  ask()}
function myAttendance(d){
  const recs={};d.att.forEach(r=>recs[r.date]=r);
  const dates=monthDates(d.month).filter(x=>ymd(x)<=d.today);
  let full=0,half=0,leave=0,wfh=0,late=0,early=0,absent=0,mins=0;
  const rows=dates.slice().reverse().map(x=>{const ds=ymd(x),sun=x.getDay()===0,r=recs[ds];let st,cls='',hrs='';
    if(!r){if(sun){st='Sunday';cls='c-hrs'}else if(ds===d.today){st='Not checked in yet';cls='c-hrs'}else{st='Absent';cls='flag';absent++}}
    else if(r.status==='leave'){st='Leave';leave++}
    else if(r.status==='wfh'){st='Work from home';wfh++}
    else{const a=toMin(r.in),b=toMin(r.out);st=t12(r.in)+' – '+(r.out?t12(r.out):'no OUT');if(a!=null&&b!=null){const h=b-a;mins+=h;hrs=fmtMin(h);if(h>=360)full++;else half++}else if(ds!==d.today){cls='flag'}else full+=0;if(r.lateReason)late++;if(r.earlyReason)early++}
    return el('tr',{class:sun?'sun':''},el('th',{},el('span',{class:'mono',text:pad2(x.getDate())}),' '+DAYS[x.getDay()].slice(0,3)),el('td',{class:'mono '+cls,text:st}),el('td',{class:'mono c-hrs',text:hrs}),
      el('td',{class:'c-hrs',text:r?[r.lateReason?'Late: '+r.lateReason:'',r.earlyReason?'Early: '+r.earlyReason:'',r.note||''].filter(Boolean).join(' · '):''}))});
  const stat=(n,l)=>el('div',{},el('b',{class:'mono',text:String(n)}),el('span',{text:l}));
  return[el('div',{class:'panel'},el('h3',{text:'Summary'}),el('div',{class:'stats'},stat(full,'Full days'),stat(half,'Half days'),stat(leave,'Leave'),stat(absent,'Absent'),stat(wfh,'WFH'),stat(late,'Late'),stat(early,'Left early'),stat(fmtMin(mins),'Total hours')),
      el('p',{class:'hint',text:'Office rule: in by '+t12(d.lateAfter)+', at least '+d.minHours+' hours a day. Under 6 hours counts as a half day. If something is wrong, tell HR.'})),
    el('div',{class:'panel'},el('h3',{text:'Day by day'}),el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','In – Out','Hours','Reason / note'].map(t=>el('th',{text:t})))),el('tbody',{},...rows))))];
}
function myOrdersView(edit,d){
  const td=ymd(new Date());const today=myOrders.filter(o=>o.date===td);
  const sum=a=>a.reduce((t,o)=>t+(+o.amount||0),0);
  const thisMonth=d.month===ymOf(new Date());
  const info=el('p',{class:'hint',text:'Today: '+today.length+' orders · '+rs(sum(today))+'  ·  '+MON[+d.month.slice(5)-1]+': '+myOrders.length+' orders · '+rs(sum(myOrders))});
  const form=thisMonth?orderForm(edit,async data=>{
    if(data.id){await call('editOrder',{staffId:me.id,pin:me.pin,order:data});toast('Order updated')}
    else{const j=await call('addOrder',{staffId:me.id,pin:me.pin,order:data});toast('Saved · '+j.order.orderNo)}
    ordersHome()},myOrders.map(o=>o.product)):null;
  const list=el('div',{class:'panel'},el('h3',{text:'My orders'}),myOrders.length?el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Date','No.','Customer','District','Product','₹','Sent',''].map(t=>el('th',{text:t})))),
    el('tbody',{},...myOrders.map(o=>el('tr',{},el('td',{class:'mono',text:o.date.slice(8)+'/'+o.date.slice(5,7)}),el('td',{class:'mono',text:o.orderNo}),el('td',{text:(o.customer||'—')+(o.phone?' · '+o.phone:'')}),el('td',{text:o.district}),el('td',{text:o.product+(o.type==='affordable'?' (A)':'')}),el('td',{class:'mono',text:o.amount?rs(o.amount):'—'}),el('td',{text:o.dispatched==='TRUE'?'✓':''}),
      el('td',{},thisMonth?el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>{ordersHome(o);window.scrollTo(0,0)}}):null)))))):el('div',{class:'empty',text:'No orders in this month.'}));
  return[info,form,list];
}

/* ---------- admin: orders & reports ---------- */
let adminOrders=[], allOrdersCache=null, orderScope='month', orderSearch='', of={staff:'',type:'',district:'',product:'',sent:'',from:'',to:''};
/* which printing code an order belongs to: PHR, PFR, PPR, AFR, AHR, T SHIRT… (others keep their own name) */
function prodCode(o){const p=pkey(o.product),a=o.type==='affordable'?'A':'P';
  if(!p)return'';if(/T.?SHIRT/.test(p))return'T SHIRT';if(/TURKEY|TARKY/.test(p))return'TURKEY';if(/\bCAP\b/.test(p))return'CAP';
  if(/PANT/.test(p))return a+'PR';if(/HALF/.test(p))return a+'HR';if(/FULL/.test(p))return a+'FR';return p}
const CODE_NAMES={PHR:'PREMIUM HALF ROMBER',PFR:'PREMIUM FULL ROMBER',PPR:'PREMIUM PANT ROMBER',AHR:'AFFORDABLE HALF ROMBER',AFR:'AFFORDABLE FULL ROMBER',APR:'AFFORDABLE PANT ROMBER'};
function productReport(src,m,showPrinted){
  const g={};src.forEach(o=>{const c=prodCode(o);if(!c)return;const r=g[c]=g[c]||{c,n:0,q:0,a:0,p:0,af:0};r.n++;r.q+=(+o.qty||1);r.a+=(+o.amount||0);o.type==='affordable'?r.af+=(+o.qty||1):r.p+=(+o.qty||1)});
  const printed={};if(showPrinted)adminWork.filter(w=>w.taskId==='printed-items').forEach(w=>Object.entries(colParse(w.value)).forEach(([c,q])=>printed[c]=(printed[c]||0)+(+q||0)));
  Object.keys(printed).forEach(c=>{g[c]=g[c]||{c,n:0,q:0,a:0,p:0,af:0}});
  const order=['PHR','PFR','PPR','AHR','AFR','APR','T SHIRT','TURKEY','CAP'];
  const rows=Object.values(g).sort((x,y)=>{const i=order.indexOf(x.c),j=order.indexOf(y.c);return(i<0?99:i)-(j<0?99:j)||y.q-x.q});
  const tot=rows.reduce((t,r)=>({p:t.p+r.p,af:t.af+r.af,q:t.q+r.q,a:t.a+r.a,pr:t.pr+(printed[r.c]||0)}),{p:0,af:0,q:0,a:0,pr:0});
  const head=['Product','Premium','Affordable','Total sold','Sales ₹'].concat(showPrinted?['Printed']:[]);
  return el('div',{class:'panel'},el('h3',{text:'Products sold'+(showPrinted?' & printed':'')+' · '+(orderScope==='all'?'all time':MON[+m.slice(5)-1]+' '+m.slice(0,4))}),
    el('p',{class:'hint',text:'Pieces sold of each product, from the orders. '+(showPrinted?'"Printed" comes from Jaseera\'s daily work, so you can see if printing is keeping up. ':'')+'The filters above apply here too (except Printed).'}),
    rows.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...head.map(h=>el('th',{text:h})))),
      el('tbody',{},...rows.map(r=>el('tr',{},el('th',{},CODE_NAMES[r.c]||r.c,CODE_NAMES[r.c]?el('span',{class:'c-hrs',text:' ('+r.c+')'}):null),
        el('td',{class:'mono',text:r.p?String(r.p):'—'}),el('td',{class:'mono',text:r.af?String(r.af):'—'}),el('td',{class:'mono',style:'font-weight:700',text:String(r.q)}),el('td',{class:'mono',text:r.a?rs(r.a):'—'}),
        ...(showPrinted?[el('td',{class:'mono',text:printed[r.c]?String(printed[r.c]):'—'})]:[])))),
      el('tfoot',{},el('tr',{},el('th',{text:'Total'}),el('td',{class:'mono',text:String(tot.p)}),el('td',{class:'mono',text:String(tot.af)}),el('td',{class:'mono',text:String(tot.q)}),el('td',{class:'mono',text:rs(tot.a)}),...(showPrinted?[el('td',{class:'mono',text:String(tot.pr)})]:[]))))):
      el('div',{class:'empty',text:'No orders with a product in this period.'}));
}
function viewOrders(){
  const m=adminMonth, byId=Object.fromEntries(staff.map(s=>[s.id,s.name]));
  const base=orderScope==='all'?(allOrdersCache||[]):adminOrders;
  const src=base.filter(o=>(!of.staff||o.staffId===of.staff)&&(!of.type||o.type===of.type)&&(!of.district||o.district===of.district)&&(!of.product||pkey(o.product)===of.product)&&(!of.sent||(of.sent==='yes')===(o.dispatched==='TRUE'))&&(!of.from||o.date>=of.from)&&(!of.to||o.date<=of.to));
  if(orderScope==='all'&&!allOrdersCache){call('allOrders',{adminPin}).then(j=>{allOrdersCache=j.orders;renderAdmin()}).catch(e=>toast(e.message));return[el('div',{class:'empty',text:'Loading all orders…'})]}
  const amt=o=>+o.amount||0, qty=o=>+o.qty||1;
  const group=(key)=>{const g={};src.forEach(o=>{const k=(key(o)||'—');g[k]=g[k]||{k,n:0,q:0,a:0};g[k].n++;g[k].q+=qty(o);g[k].a+=amt(o)});return Object.values(g).sort((a,b)=>b.n-a.n||b.a-a.a)};
  const top=(title,rows,label)=>el('div',{class:'panel'},el('h3',{text:title}),rows.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},el('th',{text:label}),el('th',{text:'Orders'}),el('th',{text:'Qty'}),el('th',{text:'Amount'}))),
    el('tbody',{},...rows.slice(0,10).map(r=>el('tr',{},el('th',{text:r.k}),el('td',{class:'mono',text:String(r.n)}),el('td',{class:'mono',text:String(r.q)}),el('td',{class:'mono',text:r.a?rs(r.a):'—'})))))):el('div',{class:'empty',text:'No orders.'}));
  const total=src.reduce((t,o)=>t+amt(o),0), withAmt=src.filter(o=>amt(o)).length;
  const custs={};src.forEach(o=>{const k=o.phone||o.customer;if(!k)return;const c=custs[k]=custs[k]||{name:'',phone:o.phone,n:0,a:0,prods:new Set(),dist:o.district};c.n++;c.a+=amt(o);if(o.customer)c.name=o.customer;if(o.product)c.prods.add(o.product)});
  const repeat=Object.values(custs).filter(c=>c.n>1).sort((a,b)=>b.n-a.n||b.a-a.a);
  const scopeSel=el('select',{id:'oscope','aria-label':'Report period',onchange:e=>{orderScope=e.target.value;renderAdmin()}},el('option',{value:'month',text:'Selected month',selected:orderScope==='month'}),el('option',{value:'all',text:'All time',selected:orderScope==='all'}));
  const uniq=k=>[...new Set(base.map(o=>o[k]).filter(Boolean))].sort();
  const fsel=(key,label,opts)=>el('label',{class:'f',for:'of-'+key},label,el('select',{id:'of-'+key,onchange:e=>{of[key]=e.target.value;renderAdmin()}},el('option',{value:'',text:'All'}),...opts.map(([v,t])=>el('option',{value:v,text:t,selected:of[key]===v}))));
  const fdate=(key,label)=>el('label',{class:'f',for:'of-'+key},label,el('input',{id:'of-'+key,type:'date',value:of[key],onchange:e=>{of[key]=e.target.value;renderAdmin()}}));
  const active=Object.values(of).some(Boolean);
  const filters=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Filter sales'}),active?el('button',{class:'btn',type:'button',text:'Clear filters',onclick:()=>{of={staff:'',type:'',district:'',product:'',sent:'',from:'',to:''};renderAdmin()}}):null),
    el('div',{class:'form2'},fsel('staff','Staff',salesStaff().concat(staff.filter(s=>!s.sales&&base.some(o=>o.staffId===s.id))).map(s=>[s.id,s.name])),fsel('type','Type',[['premium','Premium'],['affordable','Affordable']]),
      fsel('district','District',uniq('district').map(v=>[v,v])),fsel('product','Product',[...new Set(base.map(o=>pkey(o.product)).filter(Boolean))].sort().map(v=>[v,v])),fsel('sent','Dispatched',[['yes','Sent'],['no','Not sent']]),fdate('from','From date'),fdate('to','To date')));
  const summary=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Order report'+(active?' (filtered)':'')}),el('div',{class:'row'},scopeSel,el('button',{class:'btn primary',type:'button',text:'+ Add order',onclick:()=>adminOrderSheet(null)}))),
    el('div',{class:'stats'},el('div',{},el('b',{class:'mono',text:String(src.length)}),el('span',{text:'Orders'})),el('div',{},el('b',{class:'mono',text:rs(total)}),el('span',{text:'Sales'})),
      el('div',{},el('b',{class:'mono',text:String(src.filter(o=>o.type==='premium').length)}),el('span',{text:'Premium'})),el('div',{},el('b',{class:'mono',text:String(src.filter(o=>o.type==='affordable').length)}),el('span',{text:'Affordable'})),
      el('div',{},el('b',{class:'mono',text:String(Object.keys(custs).length)}),el('span',{text:'Customers'})),el('div',{},el('b',{class:'mono',text:String(repeat.length)}),el('span',{text:'Repeat customers'}))),
    withAmt<src.length?el('p',{class:'hint',text:(src.length-withAmt)+' orders have no amount or product written (mostly from the old sheets), so totals are lower than real sales.'}):null);
  const rep=el('div',{class:'panel'},el('h3',{text:'Repeat customers'}),repeat.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Customer','Phone','District','Orders','Amount','Products'].map(t=>el('th',{text:t})))),
    el('tbody',{},...repeat.slice(0,30).map(c=>el('tr',{},el('th',{text:c.name||'—'}),el('td',{class:'mono',text:c.phone||''}),el('td',{text:c.dist||''}),el('td',{class:'mono',text:String(c.n)}),el('td',{class:'mono',text:c.a?rs(c.a):'—'}),el('td',{text:[...c.prods].join(', ')})))))):el('div',{class:'empty',text:'No repeat customers in this period.'}));
  const q=orderSearch.toLowerCase();
  const rows=src.filter(o=>!q||[o.customer,o.phone,o.district,o.pincode,o.product,o.orderNo,byId[o.staffId]].join(' ').toLowerCase().includes(q)).sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt));
  const search=el('input',{id:'osearch',type:'search',placeholder:'Search name, phone, district, product…',value:orderSearch,oninput:e=>{orderSearch=e.target.value;clearTimeout(viewOrders._t);viewOrders._t=setTimeout(()=>{renderAdmin();const i=$('#osearch');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},300)}});
  const list=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'All orders ('+rows.length+')'}),search),el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Date','No.','Staff','Customer','Phone','District','Pincode','Product','Type','₹','Sent',''].map(t=>el('th',{text:t})))),
    el('tbody',{},...rows.slice(0,300).map(o=>{const cb=el('input',{type:'checkbox','aria-label':'Dispatched'});cb.checked=o.dispatched==='TRUE';cb.onchange=async()=>{try{await call('setDispatched',{adminPin,id:o.id,value:cb.checked});o.dispatched=cb.checked?'TRUE':'FALSE'}catch(e){cb.checked=!cb.checked;toast('Could not save.')}};
      return el('tr',{},el('td',{class:'mono',text:o.date}),el('td',{class:'mono',text:o.orderNo||''}),el('td',{text:byId[o.staffId]||o.staffId}),el('td',{text:o.customer||'—'}),el('td',{class:'mono',text:o.phone||''}),el('td',{text:o.district||''}),el('td',{class:'mono',text:o.pincode||''}),el('td',{text:o.product||''}),el('td',{text:o.type==='affordable'?'Affordable':'Premium'}),el('td',{class:'mono',text:amt(o)?rs(amt(o)):'—'}),el('td',{},cb),
        el('td',{},el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>adminOrderSheet(o)})))})))),
    rows.length>300?el('p',{class:'hint',text:'Showing the newest 300. Use search to find older ones.'}):null);
  return[filters,summary,productReport(src,m,orderScope==='month'),el('div',{class:'split'},top('Best products',group(o=>o.product?pkey(o.product)+(o.type==='affordable'?' (A)':' (P)'):''),'Product'),top('Top districts',group(o=>o.district),'District')),el('div',{class:'split'},top('Top pincodes',group(o=>o.pincode),'Pincode'),top('By staff',group(o=>(staff.find(s=>s.id===o.staffId)||{}).name||o.staffId),'Staff')),rep,list];
}
function adminOrderSheet(o){
  const ss=el('select',{id:'o-st'},...salesStaff().map(s=>el('option',{value:s.id,text:s.name,selected:o?o.staffId===s.id:false})));
  const dt=el('input',{id:'o-dt',type:'date',value:o?o.date:todayStr});
  const form=orderForm(o,async data=>{data.staffId=ss.value;data.date=dt.value||todayStr;await call('saveOrder',{adminPin,order:data});closeOv();toast('Order saved');allOrdersCache=null;reload()});
  const del=o?el('button',{class:'btn danger',type:'button',text:'Delete order',onclick:async()=>{if(del.dataset.sure!=='1'){del.dataset.sure='1';del.textContent='Tap again to delete';return}try{await call('deleteOrder',{adminPin,id:o.id});closeOv();toast('Deleted');allOrdersCache=null;reload()}catch(e){toast('Could not delete.')}}}):null;
  openOv(el('div',{class:'row'},el('label',{class:'f',for:'o-st',style:'flex:1'},'Sales staff',ss),el('label',{class:'f',for:'o-dt',style:'flex:1'},'Date',dt)),form,el('div',{class:'row'},del,el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv})));
  $('#sheet').style.maxWidth='560px';
}

/* ---------- downloads ---------- */
function saveFile(filename,data,type){
  const url=URL.createObjectURL(new Blob([data],{type}));
  const a=el('a',{href:url,download:filename});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
}
const XLSXT='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function exportXlsx(m){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const list=activeStaff(), dates=monthDates(m);const[y,mo]=m.split('-').map(Number);
  const r2=['DATE','DAY'],r3=['',''];
  list.forEach(s=>{r2.push(s.name,'','','','');r3.push('CHECK IN','CHECK OUT','HOURS','STATUS','REASON')});
  const rows=[['ATTENDANCE REGISTER '+MON[mo-1].toUpperCase()+' '+y],r2,r3];
  dates.forEach(d=>{const ds=ymd(d);const row=[ds,DAYS[d.getDay()]];
    list.forEach(s=>{const r=adminRecs[ds+'__'+s.id];
      if(!r){row.push('','','','','');return}
      if(r.status==='leave'){row.push('LEAVE','LEAVE','','LEAVE',r.note||'');return}
      if(r.status==='wfh'){row.push('WFH','WFH','','WFH',r.note||'');return}
      const a=toMin(r.in),b=toMin(r.out);const h=(a!=null&&b!=null)?b-a:null;
      row.push(r.in||'',r.out||'',h!=null?Math.floor(h/60)+':'+pad2(h%60):'',h==null?'NO OUT':h>=360?'FULL':'HALF',[r.lateReason?'Late: '+r.lateReason:'',r.earlyReason?'Early: '+r.earlyReason:'',r.note||''].filter(Boolean).join(' | '))});
    rows.push(row)});
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}}].concat(list.map((_,i)=>({s:{r:1,c:2+i*5},e:{r:1,c:6+i*5}})));
  ws['!cols']=[{wch:12},{wch:11}].concat(list.flatMap(()=>[{wch:9},{wch:10},{wch:7},{wch:8},{wch:22}]));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ATTENDANCE');
  saveFile('ATTENDANCE_'+MON[mo-1].toUpperCase()+'_'+y+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT);
}
function exportSalary(m,calc){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const[y,mo]=m.split('-').map(Number);
  const rows=[['SALARY '+MON[mo-1].toUpperCase()+' '+y],['NAME','ROLE','MONTHLY SALARY','FULL DAYS','HALF DAYS','WFH PAID','WFH NO ORDER','LEAVE','ABSENT','SUNDAYS PAID','SUNDAYS CUT','PAID DAYS','DAYS IN MONTH','PER DAY','EARNED','BONUS','ADVANCE','NET PAY','NOTE']];
  calc.forEach(({s,c})=>rows.push([s.name,roleText(s.role),c.salary,c.full,c.half,c.wfhPaid,c.wfhUnpaid,c.leave,c.absent,c.sunPaid,c.sunCut,c.paid,c.nd,Math.round(c.perDay*100)/100,c.earned,c.extra,c.adv,c.net,c.note]));
  rows.push(['TOTAL','',calc.reduce((t,x)=>t+x.c.salary,0),'','','','','','','','','','','',calc.reduce((t,x)=>t+x.c.earned,0),calc.reduce((t,x)=>t+x.c.extra,0),calc.reduce((t,x)=>t+x.c.adv,0),calc.reduce((t,x)=>t+x.c.net,0),'']);
  const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=rows[1].map((h,i)=>({wch:i<2?14:Math.max(9,h.length+2)}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'SALARY');
  saveFile('SALARY_'+MON[mo-1].toUpperCase()+'_'+y+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT);
}
function slipDoc(m,list){
  const J=window.jspdf&&window.jspdf.jsPDF;if(!J)return null;
  const[y,mo]=m.split('-').map(Number);const doc=new J({unit:'pt',format:'a5'});const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight();
  list.forEach(({s,c},i)=>{if(i)doc.addPage();
    doc.setFillColor(81,31,82);doc.rect(0,0,W,78,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('COUPLO DESIGN STUDIO',26,36);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Vengara, Malappuram',26,52);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('SALARY SLIP',W-26,36,{align:'right'});
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(MON[mo-1]+' '+y,W-26,52,{align:'right'});
    doc.setTextColor(30);let yy=108;doc.setFontSize(9);doc.text('Employee',26,yy);doc.text('Role',W/2,yy);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(s.name,26,yy+15);doc.text(roleText(s.role)||'-',W/2,yy+15);yy+=44;
    const sect=t=>{doc.setFillColor(243,235,243);doc.rect(26,yy-11,W-52,17,'F');doc.setFont('helvetica','bold');doc.setFontSize(9.5);doc.setTextColor(81,31,82);doc.text(t,32,yy);doc.setTextColor(30);yy+=19};
    const line=(a,b,bold)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(9.5);doc.text(a,32,yy);doc.text(String(b),W-32,yy,{align:'right'});yy+=15};
    sect('ATTENDANCE');line('Days in month',c.nd);line('Full days worked',c.full);line('Half days',c.half);if(c.wfhPaid||c.wfhUnpaid)line('Work from home (paid / no orders)',c.wfhPaid+' / '+c.wfhUnpaid);
    line('Leave / absent',c.leave+c.absent);line('Sundays paid / cut',c.sunPaid+' / '+c.sunCut);line('Total paid days',c.paid,true);yy+=6;
    sect('SALARY');line('Monthly salary',rsPlain(c.salary));line('Per day','Rs. '+(Math.round(c.perDay*100)/100).toFixed(2));line('Deduction for leave / half days','- '+rsPlain(c.salary-c.earned));line('Earned salary',rsPlain(c.earned));
    if(c.extra)line('Bonus / extra',rsPlain(c.extra));if(c.adv)line('Advance','- '+rsPlain(c.adv));yy+=4;
    doc.setFillColor(81,31,82);doc.rect(26,yy-14,W-52,24,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('NET SALARY',32,yy+2);doc.text(rsPlain(c.net),W-32,yy+2,{align:'right'});doc.setTextColor(30);yy+=30;
    if(c.note){doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.text(doc.splitTextToSize('Note: '+c.note,W-52),26,yy)}
    doc.setDrawColor(120);doc.line(26,H-60,150,H-60);doc.line(W-150,H-60,W-26,H-60);doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Employee signature',26,H-47);doc.text('For Couplo Design Studio',W-26,H-47,{align:'right'})});
  return doc;
}
function exportSlips(m,calc){
  const doc=slipDoc(m,calc);if(!doc){toast('PDF tool did not load. Check the internet and reload.');return}
  const[y,mo]=m.split('-').map(Number);
  saveFile('SALARY_SLIPS_'+MON[mo-1].toUpperCase()+'_'+y+'.pdf',doc.output('arraybuffer'),'application/pdf');
}
function emailSlips(m,calc){
  const[y,mo]=m.split('-').map(Number);const label=MON[mo-1]+' '+y;
  const withMail=calc.filter(x=>x.s.email), without=calc.filter(x=>!x.s.email).map(x=>x.s.name);
  if(!withMail.length){toast('No staff has an email yet. Add emails in the Staff tab.');return}
  if(!(window.jspdf&&window.jspdf.jsPDF)){toast('PDF tool did not load. Check the internet and reload.');return}
  const go=el('button',{class:'btn primary big',type:'button',text:'Send '+withMail.length+' slips'});
  go.onclick=async()=>{go.disabled=true;go.textContent='Sending…';
    try{const items=withMail.map(({s,c})=>{const d=slipDoc(m,[{s,c}]);return{staffId:s.id,monthLabel:label,net:Math.round(c.net).toLocaleString('en-IN'),filename:'Salary_Slip_'+MON[mo-1]+'_'+y+'_'+s.name+'.pdf',pdf:d.output('datauristring').split(',')[1]}});
      const j=await call('emailSlips',{adminPin,items});closeOv();toast('Sent to '+j.sent.length+' staff'+(j.skipped.length?' · skipped '+j.skipped.join(', '):''))}
    catch(e){go.disabled=false;go.textContent='Try again';toast('Could not send: '+e.message)}};
  openOv(el('h2',{text:'Email salary slips'}),el('p',{text:label+' slips will go to:'}),
    el('div',{},...withMail.map(({s,c})=>el('div',{class:'staffrow'},el('div',{},el('div',{style:'font-weight:600',text:s.name}),el('div',{class:'meta',text:s.email})),el('span',{class:'mono',text:rs(c.net)})))),
    without.length?el('p',{text:'No email for: '+without.join(', ')+'. They will not get a slip.'}):null,
    go,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv}));
}

/* ---------- boot ---------- */
function boot(){
  if(!API){show('home');$('#home').replaceChildren(el('div',{class:'empty',text:'Not connected to the Google Sheet yet.'}));askServer();return}
  const h=location.hash;
  if(h==='#admin'){history.replaceState(null,'',location.pathname);goHome('admin');setTimeout(()=>{const p=$('#lg-pin');if(p)p.focus()},50);return}
  if(h==='#me'||h==='#orders')history.replaceState(null,'',location.pathname);
  if(me){ordersBoot();return}
  if(LS.get('couplo_mode')==='kiosk'){openKiosk();return}
  goHome();
}
window.addEventListener('hashchange',()=>{if(location.hash==='#admin'){history.replaceState(null,'',location.pathname);goHome('admin')}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&view==='kiosk'&&API)loadKiosk()});
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
})();
