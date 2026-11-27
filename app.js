(function(){
const $=s=>document.querySelector(s);
const pad2=n=>String(n).padStart(2,'0');
const DAYS=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ymd=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
const ymOf=d=>d.getFullYear()+'-'+pad2(d.getMonth()+1);
const hm=d=>pad2(d.getHours())+':'+pad2(d.getMinutes());
const toMin=t=>{if(!t)return null;const[a,b]=String(t).split(':').map(Number);return a*60+b};
/* from 14 Nov 2026: working hours start at 9:30 AM — coming in earlier still counts from 9:30 (hours, half day, overtime).
   Days before that keep their real IN time, so old records stay exactly as they were. */
const WORK_START='09:30',RULE_FROM='2026-11-14',OT_FROM='2026-11-01'; /* overtime counted from 1 Nov 2026 */const inMin=(t,ds)=>{const m=toMin(t);return m==null?null:(ds||'')>=RULE_FROM?Math.max(m,toMin(WORK_START)):m};
const fmtMin=m=>m==null?'':Math.floor(m/60)+'h '+pad2(m%60)+'m';
const t12=t=>{if(!t)return '';let[h,m]=String(t).split(':').map(Number);const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+pad2(m)+' '+ap};
const rs=n=>'₹'+Math.round(n||0).toLocaleString('en-IN');
const rsPlain=n=>'Rs. '+Math.round(n||0).toLocaleString('en-IN');
function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in (attrs||{})){const v=attrs[k];if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v===true?'':v)}for(const c of kids){if(c==null)continue;e.append(c.nodeType?c:document.createTextNode(c))}return e}

/* ---------- server link (Google Apps Script) ---------- */
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
let API=(window.COUPLO_API||'').trim()||LS.get('couplo_api')||'';
/* send app errors to the Errors sheet (max 15 per visit; PIN / validation messages are not errors) */
let errSent=0;
function reportErr(msg,where){try{msg=String(msg||'');if(!msg||errSent>=15||!API)return;if(/Wrong PIN|PIN|Enter |Pick |Type |Choose |not found|already|Only |No access|Admin PIN needed|older than yesterday|Reason needed|Create your PIN/i.test(msg))return;errSent++;
  fetch(API,{method:'POST',body:JSON.stringify({action:'logError',msg,where:where||(typeof adminView!=='undefined'&&adminOpen?'admin:'+adminView:(typeof portalTab!=='undefined'?'staff:'+portalTab:'')),who:(typeof me!=='undefined'&&me&&me.name)||(typeof adminOpen!=='undefined'&&adminOpen?'admin':''),ua:navigator.userAgent})}).catch(()=>{})}catch(e){}}
window.addEventListener('error',e=>reportErr((e.message||'JS error')+(e.filename?' @'+String(e.filename).split('/').pop()+':'+e.lineno:'')));
window.addEventListener('unhandledrejection',e=>reportErr('Promise: '+((e.reason&&e.reason.message)||e.reason)));
async function call(action,data){
  if(!API)throw new Error('No server link');
  let res,j;const t0=Date.now();
  try{res=await fetch(API,{method:'POST',body:JSON.stringify({action,...(data||{})})});j=await res.json()}
  catch(e){reportErr('Network/server: '+e.message+' ('+action+', '+Math.round((Date.now()-t0)/1000)+'s)');throw new Error('Cannot reach the sheet. Check the internet and try again.')}
  if(!j.ok&&j.error&&!/Wrong PIN|not found|PIN|Only |No access|Admin PIN/i.test(j.error))reportErr('Server: '+j.error+' ('+action+')');
  if(Date.now()-t0>20000&&action!=='logError')reportErr('Slow: '+action+' took '+Math.round((Date.now()-t0)/1000)+'s');
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
/* staff who were given some admin tabs (Staff → Edit → Admin tabs) open them with their own PIN. mgrAccess=null means the owner (admin PIN, everything) */
let mgrAccess=null;
/* unlock requests from sales staff (owner only): shown as a banner on every admin tab, checked every minute */
let unlockReqs={},unlockSeen=null,unlockTimer=null;
function notifyAdmin(title,body){try{if(!('Notification' in window)||Notification.permission!=='granted')return;
  if(navigator.serviceWorker&&navigator.serviceWorker.ready)navigator.serviceWorker.ready.then(r=>r.showNotification(title,{body,icon:'icons/icon-192.png',tag:'unlock'})).catch(()=>new Notification(title,{body}));else new Notification(title,{body})}catch(e){}}
function pollUnlock(){if(unlockTimer||mgrAccess)return;unlockTimer=setInterval(async()=>{if(!adminOpen||mgrAccess||document.hidden)return;
  try{const r=await call('unlockDates',{adminPin});const q=r.requests||{},fresh=Object.keys(q).filter(id=>!(id in unlockReqs));unlockReqs=q;
    if(fresh.length){fresh.forEach(id=>{notifyAdmin('🔓 '+q[id].name+' asks to enter older orders',(q[id].note||'Tap to open the admin panel'));toast(q[id].name+' asks to unlock older dates')});renderAdmin()}}catch(e){}},180000)}
function unlockBanner(){if(mgrAccess)return null;const ids=Object.keys(unlockReqs||{});if(!ids.length)return null;
  const act=(id,reject)=>async e=>{e.target.disabled=true;try{const r=await call('unlockDates',{adminPin,staffId:id,reject});unlockReqs=r.requests||{};toast(reject?'Declined':unlockReqsName(id)+' unlocked for today');renderAdmin()}catch(x){toast(x.message);e.target.disabled=false}};
  return el('div',{class:'panel',style:'border:2px solid #7b3fa0'},el('h3',{text:'🔓 Unlock requests · '+ids.length}),
    ...ids.map(id=>{const q=unlockReqs[id];return el('div',{class:'staffrow'},el('div',{},el('div',{style:'font-weight:600',text:q.name+' wants to enter older orders'}),el('div',{class:'meta',text:'Asked at '+q.time+(q.note?' · '+q.note:'')})),
      el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Approve for today',onclick:act(id,false)}),el('button',{class:'btn',type:'button',text:'Decline',onclick:act(id,true)})))}))}
function unlockReqsName(id){const s=(staff||[]).find(x=>x.id===id);return s?s.name:id}
/* Dispatch tab opens for anyone who has Orders (or Dispatch) — ticking dispatched is an Orders action on the server */
const hasTab=(acc,t)=>(acc||[]).includes(t)||((t==='dispatch'||t==='daily'||t==='cod'||t==='customers')&&(acc||[]).includes('orders'));
const can=t=>!mgrAccess||(t!=='ads'&&hasTab(mgrAccess,t)); /* Ads (spend) is owner only */
/* drops the Leads column (index i) from a header/row list for people without the Leads tab */
const xL=(a,i)=>can('sales')?a:a.filter((_,j)=>j!==i);
const ADMIN_TABS=[['dash','Dashboard'],['crm','📊 CRM Center'],['arena','Arena'],['reports','Reports'],['register','Register'],['orders','Orders'],['customers','Customers'],['dispatch','Dispatch'],['daily','Daily sold'],['cod','COD'],['products','Products'],['work','Work'],['sales','Leads'],['ads','Ads'],['salary','Salary'],['staff','Staff'],['ai','✨ AI Assistant']];
const TITLES={home:'Couplo Team',kiosk:'Check in / out',orders:'My page',admin:'Admin'};
function show(v){view=v;adminOpen=v==='admin';['home','kiosk','admin','orders'].forEach(id=>{$('#'+id).hidden=id!==v});
  document.querySelector('.brand h1').textContent=TITLES[v];banner('');
  if(v!=='kiosk')loadKioskStop();if(v!=='admin'){$('#admin').replaceChildren();adminPin=null;mgrAccess=null;aiChat=[]}window.scrollTo(0,0)}
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
        else if(c.valid){adminPin=pin;mgrAccess=null;LS.set('couplo_last_id','admin');openAdmin()}
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
/* SPEED: the last list is kept on the phone, so names show at once; fresh data comes in behind it */
function kioskApply(j){kStaff=j.staff.sort(byOrder);kAtt=Object.assign({},j.att||{});for(const id in kPend)if(kPend[id].rec)kAtt[id]=kPend[id].rec;kCfg={lateAfter:j.lateAfter||'09:40',minHours:Number(j.minHours)||8}}
let kPend={};
async function loadKiosk(){
  clearTimeout(kTimer);
  if(!kStaff.length){try{const c=JSON.parse(LS.get('couplo_kiosk')||'null');if(c&&c.staff){if(c.today!==ymd(new Date()))c.att={};kioskApply(c);renderTiles()}}catch(e){}}
  try{const j=await call('kiosk');LS.set('couplo_kiosk',JSON.stringify(j));kioskApply(j);banner('');renderTiles()}
  catch(e){banner('Cannot reach the sheet. Check the internet connection.')}
  if(view==='kiosk')kTimer=setTimeout(loadKiosk,60000);
}
function loadKioskStop(){clearTimeout(kTimer)}
function renderTiles(){
  const g=$('#tiles');
  if(!kStaff.length){g.replaceChildren(el('div',{class:'empty',text:'No staff yet. Open Admin → Staff to add your team.'}));return}
  g.replaceChildren(...kStaff.map(s=>{const st=kPend[s.id]?{cls:'wfh',txt:'Saving '+kPend[s.id].kind+'…'}:statusOf(kAtt[s.id]);
    return el('button',{class:'tile',type:'button',onclick:()=>startPunch(s)},
      el('div',{},el('div',{class:'nm',text:s.name}),s.role?el('div',{class:'role',text:roleText(s.role)}):null),
      el('span',{class:'chip '+st.cls,text:st.txt}))}));
}
function startPunch(s){
  if(kPend[s.id]){toast(s.name+': still saving, wait a moment.');return}
  if(s.hasPin)pinSheet({title:s.name,sub:'Enter your 4-digit PIN',onDone:v=>{punchSheet(s,v)}});
  else punchSheet(s,'');
}
function punchSheet(s,pin){
  const r=kAtt[s.id], now=hm(new Date());
  const kids=[el('h2',{text:s.name}),el('p',{text:'Time now: '+t12(now)})];
  if(r&&(r.status==='leave'||r.status==='wfh')){kids.push(el('p',{text:'Today is marked as '+(r.status==='leave'?'leave':'work from home')+'. Ask HR to change it if you are here.'}),el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv}));openOv(...kids);return}
  /* SPEED: the screen closes at once and the tile shows "Saving…"; the sheet is updated in the background.
     If the PIN was wrong or the internet failed, the tile goes back and a message says so. */
  const send=async(reason)=>{
    const kind=(!r||!r.in)?'IN':'OUT', t=hm(new Date());
    kPend[s.id]={kind};renderTiles();closeOv();toast(s.name+' · '+kind+' at '+t12(t)+' · saving…');
    try{const j=await call('punch',{staffId:s.id,pin,reason:reason||''});
      delete kPend[s.id];kAtt[s.id]=j.rec;renderTiles();toast('✓ '+s.name+' · '+(j.kind==='in'?'IN':'OUT')+' at '+t12(j.time)+' saved'+(reason?' · reason saved':''))}
    catch(e){delete kPend[s.id];renderTiles();
      if(e.need){reasonSheet(s,e.need,e.time,e.inTime,async rs=>{closeOv();await send(rs)});return}
      toast(e.message==='Wrong PIN'?'✕ '+s.name+': wrong PIN. Not saved — try again.':'✕ '+s.name+': not saved. Check the internet and try again.')}
  };
  /* late / early is checked on the phone, so there is no extra trip to the sheet */
  const go=(btn)=>{btn.disabled=true;const t=hm(new Date());
    if((!r||!r.in)&&toMin(t)>toMin(kCfg.lateAfter)){reasonSheet(s,'late',t,null,send);return}
    if(r&&r.in&&!r.out&&toMin(t)-toMin(r.in)<(Number(s.hours)||kCfg.minHours)*60){reasonSheet(s,'early',t,r.in,send);return}
    send('')};
  let label;
  if(!r||!r.in)label='IN  ·  '+t12(now);
  else if(!r.out){kids.push(el('p',{text:'You came in at '+t12(r.in)+'.'}));label='OUT  ·  '+t12(now)}
  else{kids.push(el('p',{text:'Today: IN '+t12(r.in)+', OUT '+t12(r.out)+'. OUT is already marked and cannot be changed here. If it is wrong, ask admin.'}),el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv}));openOv(...kids);return}
  const b=el('button',{class:'btn primary big',type:'button',text:label});b.onclick=()=>go(b);
  kids.push(b,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv}));
  openOv(...kids);
}

function reasonSheet(s,kind,time,inTime,send){
  const late=kind==='late';
  const txt=el('textarea',{id:'reason',rows:'3',placeholder:'Write the real reason in your own words…',style:'font:500 15px var(--f-body);padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink);width:100%'});
  const ok=el('button',{class:'btn primary big',type:'button',text:(late?'IN':'OUT')+'  ·  '+t12(time)});
  ok.onclick=async()=>{const r=txt.value.trim();if(r.length<10){toast('Please write the full reason (at least 10 letters).');txt.focus();return}ok.disabled=true;ok.textContent='Saving…';
    try{await send(r)}catch(e){closeOv();toast('Could not save. Check the internet and try again.')}};
  const worked=inTime?Math.max(0,toMin(time)-inMin(inTime,ymd(new Date()))):0;
  openOv(el('h2',{text:s.name}),
    el('p',{text:late?('You are coming in at '+t12(time)+'. Why are you late?'):('You came at '+t12(inTime)+' and worked '+fmtMin(worked)+' (less than '+(Number(s.hours)||kCfg.minHours)+' hours). Why are you leaving early?')}),
    txt,ok,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv}));
  setTimeout(()=>txt.focus(),50);
}

/* ---------- admin ---------- */
let adminAd={}; /* Meta ad spend per day (owner only) */
let adminMonth=null, adminView='dash', salesDate=null, staff=[], adminRecs={}, adminSales={}, adminPay={}, drafts={}, todayStr=ymd(new Date());
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
function openAdmin(){closeOv();show('admin');salesDate=ymd(new Date());call('reportSettings',{adminPin}).then(r=>{const h=Number(r&&r.minHours);if(h>0&&h!==adminMinH){adminMinH=h;if(adminMonth)renderAdmin()}}).catch(()=>{});loadMonth(ymOf(new Date()))}
async function loadMonth(m){
  adminMonth=m;
  if(salesDate&&salesDate.slice(0,7)!==m)salesDate=m+'-01';
  $('#admin').replaceChildren(el('div',{class:'empty',text:'Loading '+m+'…'}));
  try{const j=await call('month',{adminPin,month:m});todayStr=j.today;staff=j.staff;if(j.products)products=j.products;if(j.tasks)tasks=j.tasks;adminWork=j.work||[];if(j.holidays)holidays=j.holidays;unlockReqs=j.unlockReqs||{};pollUnlock();
    adminRecs={};j.att.forEach(r=>adminRecs[r.date+'__'+r.staffId]=r);
    adminSales={};const sx=k=>adminSales[k]=adminSales[k]||{leads:0,premium:0,affordable:0,amount:0};
    j.sales.forEach(r=>{const x=sx(r.date+'__'+r.staffId);x.leads=+r.leads||0;x.calls=+r.calls||0;x.answered=+r.answered||0;x.missed=+r.missed||0;x.called=+r.called||0});
    adminAd={};(j.adspend||[]).forEach(r=>adminAd[r.date]=+r.amount||0);adminOrders=j.orders||[];adminOrders.forEach(o=>{const x=sx(o.date+'__'+o.staffId);if(o.type==='affordable')x.affordable++;else x.premium++;x.amount+=(+o.amount||0)});
    rpCache[m]=j;adminPay={};j.pay.forEach(r=>adminPay[r.staffId]={advance:+r.advance||0,extra:+r.extra||0,note:r.note||''});
    renderAdmin()}
  catch(e){$('#admin').replaceChildren(el('div',{class:'empty',text:'Could not load: '+e.message}))}
}
const reload=()=>loadMonth(adminMonth);
function monthDates(m){const[y,mo]=m.split('-').map(Number);const n=new Date(y,mo,0).getDate();return Array.from({length:n},(_,i)=>new Date(y,mo-1,i+1))}
const activeStaff=()=>staff.filter(s=>s.active!==false).sort(byOrder);
const salesStaff=()=>staff.filter(s=>s.sales).sort(byOrder);
const payStaff=()=>staff.filter(s=>s.active!==false||s.sales).sort(byOrder);
function ordersOn(ds,sid){const x=adminSales[ds+'__'+sid];return x?x.premium+x.affordable:0}
/* overtime (admin only): time worked beyond the office minimum hours (Settings → minHours, default 8). Under 15 min is ignored. */
let adminMinH=8;
function otMin(r){if(!r||r.status==='leave'||r.status==='wfh'||(r.date||'')<OT_FROM)return 0;const a=inMin(r.in,r.date),b=toMin(r.out);if(a==null||b==null)return 0;const x=b-a-hoursOf(r.staffId)*60;return x>=15?x:0}
/* hours a day for one person (Admin → Staff → Edit), else the office rule */
function hoursOf(id){const p=(typeof staff!=='undefined'&&staff||[]).find(x=>x.id===id);return (p&&Number(p.hours)>0)?Number(p.hours):adminMinH}
function cellInfo(r){
  if(!r)return null;
  if(r.status==='leave')return{txt:'LEAVE',cls:'leave'};
  if(r.status==='wfh')return{txt:'WFH',cls:'wfh'};
  const a=inMin(r.in,r.date),b=toMin(r.out);
  return{txt:(r.in?t12(r.in):'?')+' – '+(r.out?t12(r.out):'no OUT'),hrs:(a!=null&&b!=null)?b-a:null,noOut:!r.out};
}
/* Couplo salary rules: salary ÷ days in month; Sundays paid unless leave/absent on both the Saturday before and Monday after;
   6h+ = full day, under 6h = half day; a sales person's WFH day is paid only if orders were entered for that day */
function calcPay(m,s){
  const dates=monthDates(m), td=todayStr, nd=dates.length;
  const val={}, info={full:0,half:0,leave:0,absent:0,wfhPaid:0,wfhUnpaid:0,sunPaid:0,sunCut:0,noOut:0,mins:0,ot:0};
  for(const d of dates){const ds=ymd(d);if(ds>td){val[ds]=null;continue}if(d.getDay()===0)continue;
    const r=adminRecs[ds+'__'+s.id];
    if(!r){val[ds]=ds===td?null:0;if(ds!==td)info.absent++;continue}
    if(r.status==='leave'){val[ds]=0;info.leave++;continue}
    if(r.status==='wfh'){if(s.sales){const ok=ordersOn(ds,s.id)>0;val[ds]=ok?1:0;ok?info.wfhPaid++:info.wfhUnpaid++}else{val[ds]=1;info.wfhPaid++}continue}
    const a=inMin(r.in,r.date),b=toMin(r.out);
    if(a!=null&&b!=null){const h=b-a;info.mins+=h;info.ot=(info.ot||0)+otMin(r);if(h>=360){val[ds]=1;info.full++}else{val[ds]=.5;info.half++}}
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
  const views=ADMIN_TABS.filter(([v])=>can(v));
  if(mgrAccess&&me){/* staff with given tabs: their own tabs and the given tabs sit in one bar, on one page */
    const own=(me.portalTabs||[['arena','🏆 Arena'],['att','My attendance']]).map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':'false',text:t,onclick:()=>{portalTab=v;show('orders');ordersHome()}}));
    return el('nav',{class:'tabs',role:'tablist'},...own,...views.map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':String(adminView===v),text:t,onclick:()=>{adminView=v;renderAdmin()}})));
  }
  return el('nav',{class:'tabs',role:'tablist'},...views.map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':String(adminView===v),text:t,onclick:()=>{adminView=v;renderAdmin()}})));
}
function monthPicker(){
  const now=new Date(),opts=[];for(let i=0;i<12;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);opts.push(el('option',{value:ymOf(d),selected:ymOf(d)===adminMonth,text:MON[d.getMonth()]+' '+d.getFullYear()}))}
  return el('select',{id:'mpick','aria-label':'Month',onchange:e=>loadMonth(e.target.value)},...opts);
}
function renderAdmin(){
  if(!adminOpen)return;
  if(!can(adminView))adminView=(ADMIN_TABS.find(([v])=>can(v))||['orders'])[0];
  const back=null;
  const parts=[el('div',{class:'toolbar'},el('div',{class:'row'},adminView==='dash'||adminView==='customers'?null:monthPicker(),el('button',{class:'btn',type:'button',text:'Refresh',onclick:reload}),back,el('button',{class:'btn',type:'button',text:'Log out',onclick:()=>goHome()})),themeBtn())];
  const ub=unlockBanner();if(ub)parts.push(ub);
  if(adminView==='dash')parts.push(...viewDashboard());
  else if(adminView==='crm')parts.push(...viewCrm());
  else if(adminView==='arena')parts.push(...viewArena());
  else if(adminView==='reports')parts.push(...viewReports());
  else if(adminView==='register')parts.push(...viewRegister());
  else if(adminView==='orders')parts.push(...viewOrders());
  else if(adminView==='customers')parts.push(...viewCustomers());
  else if(adminView==='dispatch')parts.push(...viewDashboard(true));
  else if(adminView==='daily')parts.push(...viewDailySold());
  else if(adminView==='cod')parts.push(...viewCod());
  else if(adminView==='products')parts.push(...viewProducts());
  else if(adminView==='work')parts.push(...viewWork());
  else if(adminView==='sales')parts.push(...viewSales());
  else if(adminView==='ads')parts.push(...viewAds());
  else if(adminView==='salary')parts.push(...viewSalary());
  else if(adminView==='ai')parts.push(...viewAi());
  else parts.push(...viewStaff());
  /* tabs: a menu on the left on wide screens, a wrapping bar on top on phones (CSS .adm) */
  $('#admin').replaceChildren(el('div',{class:'adm'},adminNav(),el('div',{class:'admmain'},...parts)));
}
/* Light / Dark / Auto (follows the phone or computer setting) — remembered on this device */
const THEMES=[['auto','Theme: Auto'],['light','Theme: Light'],['dark','Theme: Dark']];
function applyTheme(t){if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme}
function themeBtn(){const cur=LS.get('theme')||'auto',i=Math.max(0,THEMES.findIndex(x=>x[0]===cur));
  return el('button',{class:'btn',type:'button',text:THEMES[i][1],title:'Change theme','aria-label':'Theme: '+THEMES[i][0]+'. Tap to change',onclick:()=>{const n=THEMES[(i+1)%THEMES.length][0];LS.set('theme',n);applyTheme(n);renderAdmin()}})}
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
      if(ci){if(ci.cls)c.append(el('span',{class:'chip '+ci.cls,text:ci.txt}));else{c.append(el('span',{class:'mono'+(ci.noOut&&ds!==td?' flag':''),text:ci.txt}));if(ci.hrs!=null)c.append(el('div',{class:'c-hrs mono',text:fmtMin(ci.hrs)+(ci.hrs<360?' · half day':'')}));{const ot=otMin(r);if(ot)c.append(el('div',{class:'c-hrs mono',style:'color:#0a7a3d;font-weight:600',text:'OT '+fmtMin(ot)}))}if(r.lateReason)c.append(el('div',{class:'c-hrs flag',text:'Late: '+r.lateReason}));if(r.earlyReason)c.append(el('div',{class:'c-hrs flag',text:'Early: '+r.earlyReason}))}}
      else c.append(el('span',{class:'c-hrs',text:sun?'':'—'}));
      tr.append(c)});
    tbody.append(tr)});
  const otTot=list.map(s=>dates.reduce((t,d)=>t+otMin(adminRecs[ymd(d)+'__'+s.id]),0));
  const tfoot=el('tfoot',{},el('tr',{},el('th',{text:'OT total'}),...otTot.map(v=>el('td',{class:'mono',style:v?'color:#0a7a3d;font-weight:700':'',text:v?fmtMin(v):'—'}))));
  const reg=el('div',{class:'panel'},
    el('div',{class:'toolbar'},el('h3',{text:'Monthly register'}),el('button',{class:'btn primary',type:'button',text:'Download Excel',onclick:()=>exportXlsx(m)})),
    el('p',{class:'hint',text:'Tap any cell to fix a time or mark leave / work from home. Under 6 hours shows as a half day. Red means OUT was not tapped. From 14 Nov: hours count from 9:30 AM even if someone comes earlier. Green OT = overtime: time worked beyond '+adminMinH+' hours.'}),
    list.length?el('div',{class:'scroll'},el('table',{},thead,tbody,tfoot)):el('div',{class:'empty',text:'Add staff in the Staff tab to see the register.'}));
  return[todayPanel,reg];
}
/* Ads dashboard (owner only): Meta spend (AdSpend sheet, filled every morning) against leads, orders and sales of the month */
function viewAds(){
  const m=adminMonth, list=salesStaff(), td=todayStr;
  const dates=monthDates(m).filter(d=>ymd(d)<td); /* till yesterday: today's spend comes in tomorrow morning */
  if(!dates.length)return[el('div',{class:'empty',text:'Nothing yet for this month — numbers show from the 2nd (till yesterday).'})];
  const day=dates.map(d=>{const ds=ymd(d);let L=0,O=0,Am=0;list.forEach(s=>{const x=adminSales[ds+'__'+s.id];if(x){L+=x.leads||0;O+=(x.premium||0)+(x.affordable||0);Am+=x.amount||0}});return{d,ds,Sp:adminAd[ds]||0,L,O,Am}});
  const sum=a=>a.reduce((t,r)=>({Sp:t.Sp+r.Sp,L:t.L+r.L,O:t.O+r.O,Am:t.Am+r.Am}),{Sp:0,L:0,O:0,Am:0});
  const T=sum(day), last7=sum(day.slice(-7)), prev7=sum(day.slice(-14,-7));
  const per=(a,b)=>a&&b?rs(a/b):'—', roas=(am,sp)=>sp?(am/sp).toFixed(1)+'x':'—';
  /* good: 1 = higher is better, -1 = lower is better, 0 = neither */
  const chg=(a,b,good)=>{if(!a||!b)return'';const p=Math.round((a-b)/b*100);return(p>=0?'▲ ':'▼ ')+Math.abs(p)+'% vs week before'+(good&&p&&(p>0)===(good>0)?' 👍':'')};
  const kpi=(v,l,sub,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
  const cpl7=last7.L?last7.Sp/last7.L:0, cplP=prev7.L?prev7.Sp/prev7.L:0;
  const month=el('div',{class:'panel'},el('h3',{text:'This month · '+monFull(m)}),el('div',{class:'kpis'},
    kpi(rs(T.Sp),'Ad spend',m===td.slice(0,7)?'till yesterday':''),kpi(rs(T.Sp*(1+GST_RATE)),'Ad spend + GST',rs(T.Sp)+' + '+rs(T.Sp*GST_RATE)+' GST (18%)'),kpi(T.L,'Leads'),kpi(per(T.Sp,T.L),'Cost / lead'),kpi(T.O,'Orders',T.L?Math.round(T.O/T.L*100)+'% of leads':''),
    kpi(per(T.Sp,T.O),'Cost / order'),kpi(rs(T.Am),'Sales'),kpi(roas(T.Am,T.Sp),'ROAS','sales ÷ ad spend')));
  const week=el('div',{class:'panel'},el('h3',{text:'Last 7 days'+(m===td.slice(0,7)?' (till yesterday)':' of the month')}),el('div',{class:'kpis'},
    kpi(rs(last7.Sp),'Ad spend',chg(last7.Sp,prev7.Sp,0)),kpi(last7.L,'Leads',chg(last7.L,prev7.L,1)),kpi(cpl7?rs(cpl7):'—','Cost / lead',chg(cpl7,cplP,-1)),
    kpi(last7.O,'Orders',chg(last7.O,prev7.O,1)),kpi(per(last7.Sp,last7.O),'Cost / order'),kpi(roas(last7.Am,last7.Sp),'ROAS')));
  const lbl=r=>({label:String(r.d.getDate()),sun:r.d.getDay()===0});
  const ch=(t,cols,note)=>el('div',{class:'panel'},el('h3',{text:t}),note?el('p',{class:'hint',text:note}):null,el('div',{class:'scroll chartscroll'},colChart(cols,true)));
  const charts=[
    ch('Ad spend per day (₹)',day.map(r=>({...lbl(r),p:Math.round(r.Sp),a:0,tip:r.ds+': '+rs(r.Sp)}))),
    ch('Leads per day',day.map(r=>({...lbl(r),p:r.L,a:0,tip:r.ds+': '+r.L+' leads'}))),
    ch('Cost per lead per day (₹)',day.map(r=>({...lbl(r),p:r.Sp&&r.L?Math.round(r.Sp/r.L):0,a:0,tip:r.ds+': '+per(r.Sp,r.L)})),'Lower is better.')];
  const rows=day.slice().reverse();
  const table=el('div',{class:'panel'},el('h3',{text:'Day by day'}),el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Date','Ad spend','Leads','Cost / lead','Orders','Cost / order','Sales','ROAS'].map(t=>el('th',{text:t})))),
    el('tbody',{},...rows.map(r=>el('tr',{},el('th',{},el('span',{class:'mono',text:pad2(r.d.getDate())}),' '+DAYS[r.d.getDay()].slice(0,3)),
      el('td',{class:'mono',text:r.Sp?rs(r.Sp):'—'}),el('td',{class:'mono',text:String(r.L)}),el('td',{class:'mono',text:per(r.Sp,r.L)}),
      el('td',{class:'mono',text:String(r.O)}),el('td',{class:'mono',text:per(r.Sp,r.O)}),el('td',{class:'mono',text:rs(r.Am)}),el('td',{class:'mono',text:roas(r.Am,r.Sp)})))),
    el('tfoot',{},el('tr',{},el('th',{text:'Total'}),el('td',{class:'mono',text:rs(T.Sp)}),el('td',{class:'mono',text:String(T.L)}),el('td',{class:'mono',text:per(T.Sp,T.L)}),
      el('td',{class:'mono',text:String(T.O)}),el('td',{class:'mono',text:per(T.Sp,T.O)}),el('td',{class:'mono',text:rs(T.Am)}),el('td',{class:'mono',text:roas(T.Am,T.Sp)}))))),
    el('p',{class:'hint',text:'Ad spend comes from Meta ("print and trend" account) every morning at 7. Leads come from the Leads tab; orders and sales from the orders entered in the app. Orders often come from leads of earlier days, so judge cost and ROAS over a week or month, not one day.'}));
  return[m===td.slice(0,7)?actionPlan(day,last7,prev7,T,list):null,month,week,...charts,table].filter(Boolean);
}
/* 🎯 Action plan (owner, current month): what each sales person must do and what ad budget the target needs.
   Worked out from the numbers (targets from Arena, leads/orders from the Leads tab, spend from Meta) — no AI cost. */
function actionPlan(day,last7,prev7,T,list){
  const box=el('div',{class:'panel',style:'border:2px solid var(--accent)'},el('h3',{text:'🎯 Action plan'}),el('div',{class:'hint',text:'Working it out…'}));
  (async()=>{try{
    const A=await call('arenaAdmin',{adminPin,day:todayStr,period:'month'});
    const sales=A.board.filter(r=>r.section==='Sales'), dl=Math.max(1,A.team.daysLeft||1);
    const tLeft=Math.max(0,A.team.monthTarget-A.team.month), needDay=tLeft/dl;
    const last7days=day.slice(-7).map(r=>r.ds), f1=x=>Math.round(x*10)/10;
    const pace=id=>last7days.reduce((t,ds)=>{const x=adminSales[ds+'__'+id];return t+(x?(x.premium||0)+(x.affordable||0):0)},0)/Math.max(1,last7days.length);
    const teamPace=sales.reduce((t,r)=>t+pace(r.id),0);
    const li=(icon,txt,sub)=>el('div',{style:'display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)'},el('span',{style:'font-size:18px;line-height:1.3',text:icon}),
      el('div',{},el('div',{style:'font-weight:600',text:txt}),sub?el('div',{class:'hint',style:'margin:0',text:sub}):null));
    const items=[];
    /* team */
    items.push(tLeft?li(teamPace>=needDay?'✅':'⚠️','Team: '+tLeft+' orders left in '+dl+' working days → need '+f1(needDay)+' a day',
        'Last 7 days the team did '+f1(teamPace)+' a day. '+(teamPace>=needDay?'On track — keep this speed.':'Short by '+f1(needDay-teamPace)+' orders a day.'))
      :li('🏆','Team target crossed: '+A.team.month+' of '+A.team.monthTarget+' orders','Everything from here is incentive.'));
    /* each sales person, biggest gap first */
    sales.map(r=>({r,need:r.left/dl,p:pace(r.id)})).sort((x,y)=>(y.need-y.p)-(x.need-x.p)).forEach(({r,need,p})=>{
      items.push(!r.left?li('🔥',r.name+': target crossed (+'+r.incentive+')','Last 7 days: '+f1(p)+' orders a day.')
        :li(p>=need?'✅':'👉',r.name+': '+r.left+' orders left → '+f1(need)+' a day',
          'Doing '+f1(p)+' a day now'+(p>=need?' — on track.':' — needs +'+f1(need-p)+' a day.')+(r.conv!=null?' Conversion '+r.conv+'% of '+r.leads+' leads.':'')))});
    /* ads budget */
    const conv=T.L?T.O/T.L:0, cpl7=last7.L?last7.Sp/last7.L:0, spDay=last7.Sp/Math.max(1,last7days.length);
    if(tLeft&&conv&&cpl7){
      const leadsNeed=Math.ceil(tLeft/conv), budDay=leadsNeed*cpl7/dl, chg=budDay-spDay;
      items.push(li(chg>spDay*0.1?'📈':chg<-spDay*0.1?'💰':'👌',
        chg>spDay*0.1?'Ads: raise the daily budget from '+rs(spDay)+' to about '+rs(budDay)+' (+'+rs(chg)+' a day)'
          :chg<-spDay*0.1?'Ads: the current '+rs(spDay)+' a day is more than the target needs ('+rs(budDay)+')'
          :'Ads: keep the daily budget at about '+rs(spDay),
        'To get '+tLeft+' more orders at '+f1(conv*100)+'% conversion you need ~'+leadsNeed+' leads; at '+rs(cpl7)+' a lead that is '+rs(leadsNeed*cpl7)+' over '+dl+' days.'+(chg<-spDay*0.1?' Keep it if you want to beat the target.':'')+(budDay>spDay*1.5?' That is a big jump — raise it step by step (about +25% every 3 days) and push conversion at the same time; better conversion lowers the budget needed.':'')));
    }
    const aov=T.O?T.Am/T.O:0, cpo=T.O?T.Sp/T.O:0;
    if(aov&&cpo)items.push(li(cpo<=aov*0.3?'💵':'⚠️','Each order costs '+rs(cpo)+' in ads and brings '+rs(aov)+' in sales',
      cpo<=aov*0.3?'Ads are paying back well ('+Math.round(cpo/aov*100)+'% of sales).':'Ads take '+Math.round(cpo/aov*100)+'% of each sale — work on conversion before raising budget.'));
    const cplP=prev7.L?prev7.Sp/prev7.L:0;
    if(cpl7&&cplP&&cpl7>cplP*1.2)items.push(li('🔎','Cost per lead went up '+Math.round((cpl7/cplP-1)*100)+'% this week ('+rs(cplP)+' → '+rs(cpl7)+')','Try a fresh creative or check which ad set got costlier.'));
    if(last7days.length&&!(adminAd[last7days[last7days.length-1]]))items.push(li('⛔','No ad spend yesterday','Check if the Meta ads are paused or the payment failed.'));
    box.replaceChildren(el('h3',{text:'🎯 Action plan'}),...items,el('p',{class:'hint',style:'margin:0',text:'Worked out from this month\'s targets, leads, orders and Meta spend. Refresh after new orders.'}));
  }catch(e){box.replaceChildren(el('h3',{text:'🎯 Action plan'}),el('div',{class:'hint',text:'Could not work it out: '+e.message}))}})();
  return box;
}
/* 📊 CRM Center: leads from the Leadvyne CRM sheet, orders only from the app (matched by phone, last 10 digits).
   Five parts, each switched on/off by the owner (⚙️ at the bottom). Loaded once; Refresh loads it again. */
let crmData=null,crmBusy=false,crmErr='';
const CRM_PARTS=[['target','🎯 Target meter & top 3'],['funnel','🔻 Lead → order funnel'],['timing','🕒 When leads come'],['speed','⏱️ Days from first message to order'],['mix','🗣️ Language, bot score & product asked'],['calls','📞 Staff call list (Call first)']];
/* new Code.gs has crmCenter; until it is deployed, build the same data from the old leadMatch + allOrders (no language / bot score / product) */
async function crmLoad(){
  try{return await call('crmCenter',{adminPin})}
  catch(e){if(!/Unknown action/i.test(e.message))throw e}
  const[L,O]=await Promise.all([call('leadMatch',{adminPin}),call('allOrders',{adminPin})]);
  const leads=[];Object.entries(L.leads||{}).forEach(([p,rows])=>rows.forEach(r=>{if(r[3]!=='manual')leads.push([p,r[0],r[2]||'','','',-1])}));
  const orders=(O.orders||[]).map(o=>[String(o.phone||'').replace(/\D/g,'').slice(-10),String(o.date||''),o.staffId||'',+o.amount||0,(String(o.dispatched).toUpperCase()==='TRUE'||o.awb)?1:0,o.type==='affordable'?'A':'P']);
  let cfg=null;try{cfg=JSON.parse(LS.get('crmCfg')||'null')}catch(x){}
  cfg=cfg&&cfg.mods?cfg:{mods:{calls:false},revTarget:500000};
  return{ok:true,old:true,today:todayStr,cfg,leads,ints:[],orders,orderTarget:0,adspend:mgrAccess?[]:Object.entries(adminAd||{}),synced:L.synced||''};
}
/* 📞 Call first (sales staff): own CRM leads of the last 7 days with no order yet, best chances first (server ranks them) */
function myCallView(){
  const H=t=>el('h3',{text:t});
  const box=el('div',{class:'panel'},H('📞 Call first'),el('div',{class:'empty',text:'Loading your leads…'}));
  (async()=>{
    let j;try{j=await call('myCallList',{staffId:me.id,pin:me.pin})}
    catch(e){box.replaceChildren(H('📞 Call first'),el('div',{class:'empty',text:/Unknown action/i.test(e.message)?'Update the sheet script (Code.gs) first.':e.message}));return}
    const OUT={called:'✅ Called',noans:'📵 No answer',not:'🚫 Not interested'};
    const when=(d,t)=>(d===j.today?'today':dm(d))+' '+t12(t);
    const icon=(href,t,lbl)=>el('a',{href,target:href.startsWith('http')?'_blank':null,rel:'noopener','aria-label':lbl,text:t,style:'flex:0 0 auto;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);text-decoration:none;font-size:20px'});
    const card=x=>{
      const st=el('small',{style:'display:block;font-size:12.5px;'+(x.last?'color:var(--muted)':'color:var(--warn);font-weight:600'),text:x.last?OUT[x.last.outcome]+' · '+when(x.last.date,x.last.time):'Not called yet'});
      const wa=waLink(x.phone);let wrap;
      const btn=(oc,t)=>el('button',{class:'btn',type:'button',text:t,style:'flex:1 1 0;min-width:0;padding:10px 6px;font-size:13.5px',onclick:async e=>{const b=e.currentTarget;b.disabled=true;
        try{const r=await call('logCall',{staffId:me.id,pin:me.pin,phone:x.phone,outcome:oc});x.last={outcome:oc,date:r.date,time:r.time};
          if(oc==='not'){wrap.remove();toast('Removed from your list')}else{st.textContent=OUT[oc]+' · just now';st.style.color='var(--muted)';st.style.fontWeight='400';toast('Saved')}}
        catch(er){toast(er.message)}b.disabled=false}});
      wrap=el('div',{style:'border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--surface);display:flex;flex-direction:column;gap:8px'},
        el('div',{style:'display:flex;gap:10px;align-items:center'},
          el('div',{style:'flex:1;min-width:0'},el('b',{style:'display:block;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',text:x.name||'No name'}),
            el('small',{class:'mono',style:'display:block;color:var(--muted);font-size:12.5px',text:'+'+x.phone+' · came '+when(x.at.slice(0,10),x.at.slice(11))}),st),
          icon('tel:+'+x.phone,'📞','Call '+(x.name||'')),wa?icon(wa,'💬','WhatsApp '+(x.name||'')):null),
        (x.why.length||x.look)?el('div',{style:'display:flex;flex-wrap:wrap;gap:6px'},...x.why.map(w=>el('span',{class:'chip',style:'background:var(--accent-soft);color:var(--accent)',text:w})),
          x.look?el('span',{class:'chip',style:'background:var(--sunk);color:var(--ink);white-space:normal',text:'Wants: '+x.look}):null):null,
        el('div',{style:'display:flex;gap:6px'},btn('called','✅ Called'),btn('noans','📵 No answer'),btn('not','🚫 Not int.')));
      return wrap};
    const notYet=j.notCalled!=null?j.notCalled:j.list.filter(x=>!x.last).length;
    box.replaceChildren(H('📞 Call first'),
      el('div',{class:'stats'},el('div',{},el('b',{class:'mono',text:String(j.total)}),el('span',{text:'Leads, no order yet'})),el('div',{},el('b',{class:'mono',text:String(notYet)}),el('span',{text:'Not called yet'}))),
      el('p',{class:'hint',text:'Your CRM leads from the last 7 days who have not ordered. Top of the list = best chance: answered the bot, baby 1–6 months, asked for several items, came in the last 1–3 days. After each call, tap what happened.'}),
      j.list.length?el('div',{style:'display:flex;flex-direction:column;gap:10px'},...j.list.map(card)):el('div',{class:'empty',text:'No leads waiting. 🎉'}),
      j.total>j.list.length?el('p',{class:'hint',text:'Showing the top '+j.list.length+' of '+j.total+'.'}):null);
  })();
  return[box];
}
function viewCrm(){
  if(!crmData){
    if(!crmBusy&&!crmErr){crmBusy=true;crmLoad().then(j=>{crmData=j}).catch(e=>{crmErr=/Unknown action/i.test(e.message)?'Update the sheet script (Code.gs) first, then deploy a new version.':e.message}).finally(()=>{crmBusy=false;if(adminView==='crm')renderAdmin()})}
    return[el('div',{class:'panel'},el('h3',{text:'📊 CRM Center'}),el('div',{class:'empty',text:crmErr||'Reading the CRM sheet… (takes a few seconds)'}),crmErr?el('button',{class:'btn',type:'button',text:'Try again',onclick:()=>{crmErr='';renderAdmin()}}):null)];
  }
  const J=crmData,m=adminMonth,td=J.today||todayStr,cfg=J.cfg,on=k=>cfg.mods[k]!==false;
  const daysIn=monthDates(m).length,mEnd=m+'-'+pad2(daysIn);
  const name=id=>{const s=(staff||[]).find(x=>x.id===id);return s?s.name:(id||'Not assigned')};
  const pct=(a,b)=>b?Math.round(a/b*100)+'%':'—';
  const kpi=(v,l,sub,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
  const tbl=(head,rows,foot)=>el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...head.map(t=>el('th',{text:t})))),
    el('tbody',{},...rows.map(r=>el('tr',{},el('th',{text:String(r[0])}),...r.slice(1).map(v=>el('td',{class:'mono',text:String(v)}))))),
    foot?el('tfoot',{},el('tr',{},el('th',{text:String(foot[0])}),...foot.slice(1).map(v=>el('td',{class:'mono',text:String(v)})))):null));
  /* orders by phone; month orders */
  const byPh={};J.orders.forEach(o=>{if(o[0].length>=7)(byPh[o[0]]=byPh[o[0]]||[]).push(o)});
  const mOrd=J.orders.filter(o=>o[1].slice(0,7)===m);
  /* first lead ever per phone, and this month's leads per phone (first lead of the month decides staff / time) */
  const first={},mon={};let rowsM=0;
  J.leads.forEach(l=>{const p=l[0],day=l[1].slice(0,10);if(!first[p]||l[1]<first[p])first[p]=l[1];
    if(day.slice(0,7)!==m)return;rowsM++;
    const x=mon[p];if(!x||l[1]<x.t)mon[p]={t:l[1],day,staff:l[2],sc:x?best(x.sc,l[3]):l[3],lg:l[4]||(x&&x.lg)||'',it:l[5]>=0?l[5]:(x?x.it:-1)};
    else{x.sc=best(x.sc,l[3]);if(x.it<0&&l[5]>=0)x.it=l[5];if(!x.lg&&l[4])x.lg=l[4]}});
  function best(a,b){const r={H:3,W:2,C:1};return(r[b]||0)>(r[a]||0)?b:a}
  const U=Object.entries(mon).map(([p,x])=>{const os=(byPh[p]||[]).filter(o=>o[1]>=x.day);return{p,...x,os,ord:os.length>0,amt:os.reduce((t,o)=>t+o[3],0),disp:os.some(o=>o[4])}});
  const parts=[];
  const sync=el('p',{class:'hint',style:'margin:0',text:'Leads: Leadvyne CRM sheet'+(J.synced?' (synced '+J.synced+')':'')+'. Orders: only from this app, matched by phone number. CRM "stage" is not used.'});
  /* ---- 1. target meter + top 3 ---- */
  if(on('target')){
    const rev=mOrd.reduce((t,o)=>t+o[3],0),cnt=mOrd.length,tgt=cfg.revTarget||0,ot=J.orderTarget||0;
    const elapsed=m===td.slice(0,7)?+td.slice(8):(m<td.slice(0,7)?daysIn:0),proj=elapsed?rev/elapsed*daysIn:0;
    const p=tgt?Math.min(1,rev/tgt):0,R=80,cx=100,cy=95,ang=Math.PI*(1-p),x2=cx+R*Math.cos(ang),y2=cy-R*Math.sin(ang);
    const arc=`<path d="M20 95 A80 80 0 0 1 180 95" fill="none" stroke="var(--line)" stroke-width="16" stroke-linecap="round"/>`+(p>0?`<path d="M20 95 A80 80 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${p>=1?'var(--ok)':'var(--accent)'}" stroke-width="16" stroke-linecap="round"/>`:'')+
      `<text x="100" y="78" text-anchor="middle" style="font:700 26px var(--f-display)">${tgt?Math.round(rev/tgt*100):0}%</text><text x="100" y="96" text-anchor="middle" class="ax">of ${esc(rs(tgt))}</text>`;
    const gauge=svgBox(`<svg viewBox="0 0 200 105" width="100%" style="max-width:260px">${arc}</svg>`,'Sales against target');
    const bySt={};mOrd.forEach(o=>{const s=bySt[o[2]]=bySt[o[2]]||{id:o[2],n:0,amt:0};s.n++;s.amt+=o[3]});
    const top=Object.values(bySt).filter(s=>s.id).sort((a,b)=>b.amt-a.amt).slice(0,3);
    const medal=['🥇','🥈','🥉'];
    const podium=el('div',{style:'display:grid;grid-template-columns:repeat(3,1fr);gap:8px'},...top.map((s,i)=>el('div',{class:'kpi',style:'text-align:center;align-items:center'+(i===0?';border:2px solid var(--accent)':'')},
      el('div',{style:'font-size:26px',text:medal[i]}),el('b',{style:'font-size:16px',text:name(s.id)}),el('small',{text:s.n+' orders'}),el('small',{class:'mono',style:'font-weight:600;color:var(--ink)',text:rs(s.amt)}))));
    /* cumulative sales vs a straight target line */
    const cum=[];let run=0;for(let d=1;d<=daysIn;d++){const ds=m+'-'+pad2(d);run+=mOrd.filter(o=>o[1]===ds).reduce((t,o)=>t+o[3],0);cum.push(ds<=td?run:null)}
    const W=320,H=150,L=8,B=18,mx=niceMax(Math.max(1,tgt,run)),X=d=>L+(W-L-8)*(d-1)/Math.max(1,daysIn-1),Y=v=>H-B-(H-B-8)*v/mx;
    const pts=cum.map((v,i)=>v==null?null:X(i+1).toFixed(1)+','+Y(v).toFixed(1)).filter(Boolean).join(' ');
    const line=svgBox(`<svg viewBox="0 0 ${W} ${H}" width="100%">`+
      `<line x1="${L}" x2="${W-8}" y1="${H-B}" y2="${H-B}" class="gl"/>`+(tgt?`<line x1="${X(1)}" y1="${Y(tgt/daysIn)}" x2="${X(daysIn)}" y2="${Y(tgt)}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1.5"/>`:'')+
      (pts?`<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`:'')+
      [1,8,15,22,daysIn].map(d=>`<text x="${X(d)}" y="${H-4}" text-anchor="middle" class="ax">${d}</text>`).join('')+`</svg>`,'Sales so far against target');
    parts.push(el('div',{class:'panel'},el('h3',{text:'🎯 Target · '+monFull(m)}),
      el('div',{style:'display:flex;flex-wrap:wrap;gap:16px;align-items:center'},el('div',{style:'flex:1 1 220px;max-width:280px'},gauge),
        el('div',{class:'kpis',style:'flex:2 1 260px'},kpi(rs(rev),'Sales so far',cnt+' orders'),kpi(elapsed&&elapsed<daysIn?rs(proj):'—','Month-end at this speed',elapsed&&elapsed<daysIn?(tgt?(proj>=tgt?'✅ will cross target':'short by '+rs(tgt-proj)):''):''),
          kpi(tgt?rs(Math.max(0,tgt-rev)):'—','Left to target',elapsed<daysIn&&tgt>rev?rs((tgt-rev)/Math.max(1,daysIn-elapsed))+' a day':''),kpi(ot?cnt+' / '+ot:cnt,'Orders',ot?'team order target (Arena)':''))),
      el('h3',{style:'margin-top:14px',text:'Top 3 this month'}),top.length?podium:el('div',{class:'empty',text:'No orders yet this month.'}),
      el('h3',{style:'margin-top:14px',text:'Sales so far vs target line'}),line,
      el('div',{class:'legend'},el('span',{},el('i',{class:'sw',style:'background:var(--accent)'}),'Sales so far'),tgt?el('span',{},el('i',{class:'sw',style:'background:var(--muted)'}),'Where the target needs you'):null)));
  }
  /* ---- 2. funnel ---- */
  if(on('funnel')){
    const n=U.length,o=U.filter(u=>u.ord).length,d=U.filter(u=>u.disp).length;
    const fromLead=mOrd.filter(x=>first[x[0]]&&first[x[0]].slice(0,10)<=x[1]).length;
    const bar=(lbl,v,base,cls)=>el('div',{style:'margin:6px 0'},el('div',{style:'display:flex;justify-content:space-between;font-size:14px'},el('b',{text:lbl}),el('span',{class:'mono',text:v+(base?' · '+pct(v,base):'')})),
      el('div',{style:'height:14px;background:var(--sunk);border-radius:7px;overflow:hidden'},el('div',{style:`height:100%;width:${n?Math.max(2,v/n*100):0}%;background:var(${cls});border-radius:7px`})));
    const sp=!mgrAccess?(J.adspend||[]).filter(a=>a[0].slice(0,7)===m).reduce((t,a)=>t+a[1],0):0;
    const st={};U.forEach(u=>{const s=st[u.staff]=st[u.staff]||{L:0,O:0,A:0,W:0};s.L++;if(u.ord){s.O++;s.A+=u.amt}else if(u.day<=addDays(td,-3))s.W++});
    const ids=Object.keys(st).sort((a,b)=>st[b].L-st[a].L);
    parts.push(el('div',{class:'panel'},el('h3',{text:'🔻 Lead → order funnel · '+monFull(m)}),
      bar('Leads (people)',n,0,'--c-one'),bar('Ordered',o,n,'--accent'),bar('Dispatched',d,n,'--ok'),
      el('p',{class:'hint',text:rowsM+' CRM rows this month = '+n+' different phone numbers. '+fromLead+' of '+mOrd.length+' orders this month came from a CRM lead; the rest are organic / old customers.'+(sp&&o?' Ad spend per ordered lead: '+rs(sp/o)+'.':'')}),
      el('h3',{style:'margin-top:10px',text:'By sales staff (who the CRM assigned)'}),
      tbl(['Staff','Leads','Ordered','Conversion','Sales','No order 3+ days'],ids.map(id=>{const s=st[id];return[name(id),s.L,s.O,pct(s.O,s.L),rs(s.A),s.W]}),
        ['Total',n,o,pct(o,n),rs(U.reduce((t,u)=>t+u.amt,0)),ids.reduce((t,id)=>t+st[id].W,0)]),
      el('p',{class:'hint',text:'"Ordered" counts a lead when that phone number has an order in the app on or after the day it first messaged this month — whoever took the order.'})));
  }
  /* ---- 3. when leads come ---- */
  if(on('timing')){
    const hr=Array.from({length:24},()=>({n:0,o:0})),wd=Array.from({length:7},()=>({n:0,o:0}));
    const band={office:{n:0,o:0},eve:{n:0,o:0},night:{n:0,o:0}};
    U.forEach(u=>{const h=+u.t.slice(11,13),mi=h*60+ +u.t.slice(14,16),w=new Date(u.day+'T12:00:00').getDay();
      hr[h].n++;wd[w].n++;const b=mi>=570&&mi<1050?'office':mi>=1050&&mi<1320?'eve':'night';band[b].n++;if(u.ord){hr[h].o++;wd[w].o++;band[b].o++}});
    const hl=h=>h===0?'12a':h<12?h+'a':h===12?'12p':(h-12)+'p';
    const bk=[['office','Office time (9:30 AM – 5:30 PM)'],['eve','Evening (5:30 – 10 PM)'],['night','Night (10 PM – 9:30 AM)']];
    parts.push(el('div',{class:'panel'},el('h3',{text:'🕒 When leads come · '+monFull(m)}),
      tbl(['Time','Leads','Share','Ordered','Conversion'],bk.map(([k,t])=>[t,band[k].n,pct(band[k].n,U.length),band[k].o,pct(band[k].o,band[k].n)])),
      el('h3',{style:'margin-top:12px',text:'Leads by hour'}),el('div',{class:'scroll chartscroll'},colChart(hr.map((x,h)=>({label:hl(h),p:x.n,a:0,sun:h<9||h>=18,tip:hl(h)+': '+x.n+' leads, '+x.o+' ordered'})),true)),
      el('h3',{style:'margin-top:12px',text:'By day of the week'}),
      tbl(['Day','Leads','Ordered','Conversion'],[1,2,3,4,5,6,0].map(w=>[DAYS[w].charAt(0)+DAYS[w].slice(1,3).toLowerCase(),wd[w].n,wd[w].o,pct(wd[w].o,wd[w].n)])),
      el('p',{class:'hint',text:'Time is when the customer first messaged this month (India time). Coloured hours are outside office time.'})));
  }
  /* ---- 4. days from first message to order ---- */
  if(on('speed')){
    const B=[['Same day',0,0],['Next day',1,1],['2–3 days',2,3],['4–7 days',4,7],['8–30 days',8,30],['More than 30 days',31,1e9]],cnt=B.map(()=>0),ds=[];let none=0;
    mOrd.forEach(o=>{const f=first[o[0]];if(!f||f.slice(0,10)>o[1]){none++;return}const d=Math.round((new Date(o[1]+'T12:00:00')-new Date(f.slice(0,10)+'T12:00:00'))/864e5);ds.push(d);cnt[B.findIndex(b=>d>=b[1]&&d<=b[2])]++});
    ds.sort((a,b)=>a-b);const med=ds.length?ds[Math.floor(ds.length/2)]:null,avg=ds.length?ds.reduce((t,v)=>t+v,0)/ds.length:null;
    parts.push(el('div',{class:'panel'},el('h3',{text:'⏱️ First message → order · '+monFull(m)}),
      el('div',{class:'kpis'},kpi(med==null?'—':med+(med===1?' day':' days'),'Usual time (median)'),kpi(avg==null?'—':avg.toFixed(1)+' days','Average'),kpi(pct(cnt[0],ds.length),'Order the same day'),kpi(none,'Orders with no CRM lead','organic / old customers')),
      el('div',{style:'margin-top:10px'},hBars(B.map((b,i)=>[b[0],cnt[i]]))),
      el('p',{class:'hint',text:'For each order this month: days since that phone number first messaged the CRM number (first message ever, not just this month).'})));
  }
  /* ---- 5. language, bot score, product asked ---- */
  if(on('mix')&&J.old)parts.push(el('div',{class:'panel'},el('h3',{text:'🗣️ Language, bot score & product asked'}),el('div',{class:'empty',text:'This part needs the new sheet script (Code.gs). Update it in Apps Script and it shows here.'})));
  if(on('mix')&&!J.old){
    const grp=f=>{const g={};U.forEach(u=>{const k=f(u);if(k==null)return;const x=g[k]=g[k]||{n:0,o:0};x.n++;if(u.ord)x.o++});return g};
    const lg=grp(u=>u.lg==='ml'?'Malayalam':u.lg==='en'?'English':u.lg?'Other':'Not known');
    const sc=grp(u=>u.sc==='H'?'🔥 Hot':u.sc==='W'?'🌤️ Warm':u.sc==='C'?'❄️ Cold':'Not scored');
    const it=grp(u=>u.it>=0?J.ints[u.it]:null);
    const rows=(g,order)=>(order||Object.keys(g).sort((a,b)=>g[b].n-g[a].n)).filter(k=>g[k]).map(k=>[k,g[k].n,g[k].o,pct(g[k].o,g[k].n)]);
    const itRows=rows(it).slice(0,12);
    parts.push(el('div',{class:'panel'},el('h3',{text:'🗣️ Language, bot score & product asked · '+monFull(m)}),
      el('h3',{style:'margin-top:6px',text:'Language the customer wrote in'}),tbl(['Language','Leads','Ordered','Conversion'],rows(lg,['Malayalam','English','Other','Not known'])),
      el('h3',{style:'margin-top:12px',text:'Bot score (Leadvyne)'}),tbl(['Score','Leads','Ordered','Conversion'],rows(sc,['🔥 Hot','🌤️ Warm','❄️ Cold','Not scored'])),
      el('p',{class:'hint',text:'If Hot leads do not convert better than Cold, the bot score is not worth following.'}),
      el('h3',{style:'margin-top:12px',text:'Product / question the customer picked in the bot'}),itRows.length?tbl(['Asked for','Leads','Ordered','Conversion'],itRows):el('div',{class:'empty',text:'No product picked in the bot this month.'}),
      el('p',{class:'hint',text:Object.values(it).reduce((t,x)=>t+x.n,0)+' of '+U.length+' leads picked something in the bot menu.'})));
  }
  if(on('calls')){
    if(J.old)parts.push(el('div',{class:'panel'},el('h3',{text:'📞 Staff calls'}),el('div',{class:'empty',text:'The staff call list needs the new sheet script (Code.gs). Update it in Apps Script and it shows here.'})));
    else{const cs=J.calls||[],ids=[...new Set(salesStaff().map(s=>s.id).concat(cs.map(c=>c[1])))];
      const row=id=>{const mine=cs.filter(c=>c[1]===id),t=mine.filter(c=>c[0]===td),k=o=>t.filter(c=>c[3]===o).length,mm=mine.filter(c=>c[0].slice(0,7)===m);
        return[name(id),t.length,k('called'),k('noans'),k('not'),mm.length,new Set(mm.map(c=>c[2])).size]};
      const rows=ids.map(row).filter(r=>r.slice(1).some(Number));
      parts.push(el('div',{class:'panel'},el('h3',{text:'📞 Staff calls (tapped in Call first)'}),
        rows.length?tbl(['Staff','Today','✅ Called','📵 No answer','🚫 Not int.',monFull(m),'People'],rows):el('div',{class:'empty',text:'No calls tapped yet.'}),
        el('p',{class:'hint',text:'Sales staff see a 📞 Call first list on their page (their own CRM leads with no order, best chances first) and tap what happened after each call. These counts come from those taps.'})));}
  }
  if(!parts.length)parts.push(el('div',{class:'empty',text:'All parts are switched off. Turn them on in ⚙️ Settings below.'}));
  /* ---- ⚙️ owner switches ---- */
  if(!mgrAccess){
    const chk={};const tI=el('input',{id:'crm-tgt',type:'number',min:'0',inputmode:'numeric',value:String(cfg.revTarget||'')});
    const save=async e=>{e.target.disabled=true;const mods={};CRM_PARTS.forEach(([k])=>mods[k]=chk[k].checked);
      const want={mods,revTarget:tI.value===''?0:+tI.value};
      try{const r=await call('crmSettings',{adminPin,cfg:want});crmData.cfg=r.cfg;toast('Saved');renderAdmin()}
      catch(x){if(/Unknown action/i.test(x.message)){LS.set('crmCfg',JSON.stringify(want));crmData.cfg=want;toast('Saved on this phone (until Code.gs is updated)');renderAdmin();return}toast(x.message);e.target.disabled=false}};
    parts.push(el('details',{class:'panel'},el('summary',{style:'cursor:pointer;font-weight:600',text:'⚙️ Settings — switch parts on / off'}),
      ...CRM_PARTS.map(([k,t])=>{chk[k]=el('input',{type:'checkbox',id:'crm-'+k,checked:on(k)});return el('label',{for:'crm-'+k,style:'display:flex;gap:10px;align-items:center;padding:8px 0;font-size:15px'},chk[k],t)}),
      el('label',{class:'f',for:'crm-tgt'},'Monthly sales target (₹)',tI),
      el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}))));
  }
  return[el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'📊 CRM Center'}),el('button',{class:'btn',type:'button',text:'Reload CRM',onclick:()=>{crmData=null;crmErr='';renderAdmin()}})),sync),...parts];
}
/* 📅 Weekly report (Leads tab): pick a week (Mon–Sun) — target progress, leads, orders, conversion, ad spend with / without GST,
   per sales person, compared with the week before. Data: Leads tab + orders in the app + Meta spend; targets from Arena settings. */
const GST_RATE=0.18;
let wkPick='';
function weeklyReport(list,owner){
  const box=el('div',{class:'panel',style:'border:2px solid var(--accent)'},el('h3',{text:'📅 Weekly report'}),el('div',{class:'hint',text:'Loading the week…'}));
  const addD=(ds,n)=>{const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return ymd(d)};
  const monday=ds=>addD(ds,-((new Date(ds+'T12:00:00').getDay()+6)%7));
  const m=adminMonth, td=todayStr, lastDay=ymd(monthDates(m).slice(-1)[0]);
  const weeks=[];for(let w=monday(m+'-01');w<=lastDay&&w<=td;w=addD(w,7))weeks.push(w);
  if(!weeks.length){box.replaceChildren(el('h3',{text:'📅 Weekly report'}),el('div',{class:'empty',text:'No week of this month has started yet.'}));return box}
  if(!weeks.includes(wkPick))wkPick=weeks.includes(monday(td))?monday(td):weeks[weeks.length-1];
  (async()=>{try{
    /* the months these weeks (and the week before the first one) touch */
    const from=addD(weeks[0],-7), to=addD(weeks[weeks.length-1],6);
    const months=[...new Set([from,m+'-01',to].map(d=>d.slice(0,7)))].filter(x=>x<=td.slice(0,7));
    const js=await Promise.all(months.map(async x=>rpCache[x]||(rpCache[x]=await call('month',{adminPin,month:x}))));
    const S={},AD={},ids=new Set(list.map(s=>s.id));
    const sx=k=>S[k]=S[k]||{L:0,O:0,Am:0};
    js.forEach(j=>{(j.sales||[]).forEach(r=>{if(ids.has(r.staffId))sx(r.date+'__'+r.staffId).L=+r.leads||0});
      (j.adspend||[]).forEach(r=>AD[r.date]=+r.amount||0);
      (j.orders||[]).forEach(o=>{if(!ids.has(o.staffId))return;const x=sx(o.date+'__'+o.staffId);x.O++;x.Am+=(+o.amount||0)})});
    /* one week: totals and per person; ad spend split by each person's share of that day's leads */
    const wk=w=>{const days=[...Array(7)].map((_,i)=>addD(w,i)).filter(d=>d<=td);
      const per={};list.forEach(s=>per[s.id]={L:0,O:0,Am:0,Sp:0});const day=[];
      days.forEach(d=>{const L=list.reduce((t,s)=>t+((S[d+'__'+s.id]||{}).L||0),0),sp=AD[d]||0;let O=0;
        list.forEach(s=>{const x=S[d+'__'+s.id];if(!x)return;const p=per[s.id];p.L+=x.L;p.O+=x.O;p.Am+=x.Am;O+=x.O;if(sp&&L)p.Sp+=sp*x.L/L});
        day.push({d,L,O,Sp:sp})});
      const T=Object.values(per).reduce((a,p)=>({L:a.L+p.L,O:a.O+p.O,Am:a.Am+p.Am}),{L:0,O:0,Am:0});T.Sp=day.reduce((t,r)=>t+r.Sp,0);
      return{w,days,day,per,T}};
    const cur=wk(wkPick), prev=wk(addD(wkPick,-7));
    /* targets from Arena (owner, or staff with the Arena tab) */
    let A=null;try{A=await call('arenaAdmin',{adminPin,day:wkPick<td?(addD(wkPick,6)<td?addD(wkPick,6):td):td,period:'week'})}catch(e){}
    const nSales=A?Math.max(1,A.board.filter(r=>r.section==='Sales').length):list.length;
    const wTgt=A?A.team.weekTarget:0, perW=wTgt?Math.round(wTgt/nSales):0;
    /* helpers */
    const f1=x=>Math.round(x*10)/10, pc=(a,b)=>b?Math.round(a/b*100)+'%':'—', per=(a,b)=>a&&b?rs(a/b):'—', gst=x=>x*(1+GST_RATE);
    const chg=(a,b,good)=>{if(!b)return a?'new this week':'';const p=Math.round((a-b)/b*100);if(!p)return'same as last week';return(p>0?'▲ ':'▼ ')+Math.abs(p)+'% vs last week'+(good&&(p>0)===(good>0)?' 👍':'')};
    const kpi=(v,l,sub)=>el('div',{class:'kpi'},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
    const dlabel=w=>{const a=new Date(w+'T12:00:00'),b=new Date(addD(w,6)+'T12:00:00'),mn=d=>d.toLocaleString('en-IN',{month:'short'});return a.getDate()+(a.getMonth()===b.getMonth()?'':' '+mn(a))+'–'+b.getDate()+' '+mn(b)};
    const prog=(lbl,v,tgt,expect)=>{const p=tgt?Math.min(100,v/tgt*100):0,e=tgt&&expect!=null?Math.min(100,expect/tgt*100):null,ok=expect==null||v>=expect;
      return el('div',{style:'margin:10px 0'},el('div',{style:'display:flex;justify-content:space-between;gap:8px;font-size:14px'},el('b',{text:lbl}),el('span',{class:'mono',text:v+' / '+tgt+' · '+pc(v,tgt)})),
        el('div',{style:'position:relative;height:16px;background:var(--sunk);border-radius:8px;overflow:hidden'},
          el('div',{style:`height:100%;width:${Math.max(v?2:0,p)}%;background:var(${v>=tgt?'--ok':ok?'--accent':'--warn'});border-radius:8px`}),
          e!=null?el('div',{title:'Where you should be by today',style:`position:absolute;top:0;bottom:0;left:${e}%;width:2px;background:var(--ink,#000)`}):null),
        expect!=null&&v<tgt?el('div',{class:'hint',style:'margin:2px 0 0',text:(ok?'✅ Ahead of pace':'⚠️ Behind pace')+' — should be at '+Math.round(expect)+' by today (black line).'}):null)};
    /* working days (Mon–Sat) passed in the picked week */
    const wd=[...Array(6)].map((_,i)=>addD(wkPick,i)), wdDone=wd.filter(d=>d<td).length+(wd.includes(td)?0.5:0), wdLeft=wd.filter(d=>d>=td).length;
    const parts=[];
    /* ---- week picker ---- */
    parts.push(el('div',{style:'display:flex;gap:6px;overflow-x:auto;padding-bottom:4px'},...weeks.map(w=>el('button',{class:'btn'+(w===wkPick?' primary':''),type:'button',style:'white-space:nowrap',text:dlabel(w),onclick:()=>{wkPick=w;renderAdmin()}}))));
    /* ---- 1. target ---- */
    if(A){
      const tparts=[el('h3',{style:'margin-top:8px',text:'🎯 Target'})];
      tparts.push(prog('Team this week',cur.T.O,wTgt,wkPick===monday(td)?wTgt*wdDone/6:null));
      if(wkPick===monday(td)&&cur.T.O<wTgt&&wdLeft)tparts.push(el('p',{class:'hint',style:'margin:0',text:'Need '+(wTgt-cur.T.O)+' more orders in '+wdLeft+' working day'+(wdLeft>1?'s':'')+' → '+f1((wTgt-cur.T.O)/wdLeft)+' a day.'}));
      if(m===td.slice(0,7)){const mWd=monthDates(m).filter(d=>d.getDay()!==0).map(ymd),mDone=mWd.filter(d=>d<td).length+(mWd.includes(td)?0.5:0);
        tparts.push(prog('Team this month',A.team.month,A.team.monthTarget,A.team.monthTarget*mDone/mWd.length));}
      if(perW){tparts.push(el('h3',{style:'margin-top:10px',text:'Each person this week (target '+perW+')'}));
        list.forEach(s=>tparts.push(prog(s.name,cur.per[s.id].O,perW,wkPick===monday(td)?perW*wdDone/6:null)))}
      parts.push(el('div',{},...tparts));
    }else parts.push(el('p',{class:'hint',text:'Targets show for people who can open the Arena tab.'}));
    /* ---- 2. numbers vs last week ---- */
    const c=cur.T,p=prev.T;
    parts.push(el('h3',{style:'margin-top:10px',text:'📊 This week vs last week'}),el('div',{class:'kpis'},
      kpi(c.L,'Leads',chg(c.L,p.L,1)),kpi(c.O,'Orders',chg(c.O,p.O,1)),kpi(pc(c.O,c.L),'Conversion',p.L?'last week '+pc(p.O,p.L):''),kpi(rs(c.Am),'Sales',chg(c.Am,p.Am,1)),
      ...(owner?[kpi(rs(c.Sp),'Ad spend (no GST)',chg(c.Sp,p.Sp,0)),kpi(rs(gst(c.Sp)),'Ad spend + GST',rs(c.Sp)+' + '+rs(c.Sp*GST_RATE)+' GST'),
        kpi(per(gst(c.Sp),c.L),'Cost / lead (+GST)',p.L&&p.Sp?'last week '+per(gst(p.Sp),p.L):''),kpi(per(gst(c.Sp),c.O),'Cost / order (+GST)',p.O&&p.Sp?'last week '+per(gst(p.Sp),p.O):''),
        kpi(c.Sp?(c.Am/gst(c.Sp)).toFixed(1)+'x':'—','ROAS (+GST)','sales ÷ spend with GST')]:[])));
    if(owner&&c.Sp){const g=c.Sp*GST_RATE,row=(a,b,bold)=>el('div',{style:'display:flex;justify-content:space-between;gap:10px;padding:4px 0'+(bold?';border-top:1px solid var(--line);font-weight:700':'')},el('span',{text:a}),el('span',{class:'mono',text:b}));
      parts.push(el('div',{style:'margin-top:10px;padding:10px 12px;background:var(--sunk);border-radius:12px'},el('b',{text:'🧮 Ad spend calculation · '+dlabel(wkPick)}),
        row('Ad spend (Meta, without GST)',rs(c.Sp)),row('GST 18%  ('+rs(c.Sp)+' × 18%)',rs(g)),row('Total paid (with GST)',rs(c.Sp+g),1),
        c.L?row('Cost / lead  ('+rs(c.Sp+g)+' ÷ '+c.L+' leads)',rs((c.Sp+g)/c.L)):null,c.O?row('Cost / order  ('+rs(c.Sp+g)+' ÷ '+c.O+' orders)',rs((c.Sp+g)/c.O)):null))}
    /* ---- 3. per person ---- */
    const head=['Name','Leads','Orders','Last week','Conversion','Sales'].concat(perW?['Target']:[]).concat(owner?['Ad spend','+ GST','Cost / lead','Cost / order']:[]);
    parts.push(el('h3',{style:'margin-top:12px',text:'👥 Each sales person'}),el('div',{class:'scroll'},el('table',{},
      el('thead',{},el('tr',{},...head.map(t=>el('th',{text:t})))),
      el('tbody',{},...list.map(s=>{const x=cur.per[s.id],y=prev.per[s.id],d=x.O-y.O;
        return el('tr',{},el('th',{text:s.name}),el('td',{class:'mono',text:String(x.L)}),el('td',{class:'mono',text:String(x.O)}),
          el('td',{class:'mono',style:d>0?'color:var(--ok)':d<0?'color:var(--warn)':'',text:y.O+(d?' ('+(d>0?'+':'')+d+')':'')}),
          el('td',{class:'mono',text:pc(x.O,x.L)}),el('td',{class:'mono',text:rs(x.Am)}),
          ...(perW?[el('td',{class:'mono',text:pc(x.O,perW)})]:[]),
          ...(owner?[el('td',{class:'mono',text:x.Sp?rs(x.Sp):'—'}),el('td',{class:'mono',text:x.Sp?rs(gst(x.Sp)):'—'}),el('td',{class:'mono',text:per(gst(x.Sp),x.L)}),el('td',{class:'mono',text:per(gst(x.Sp),x.O)})]:[]))})),
      el('tfoot',{},el('tr',{},el('th',{text:'Total'}),el('td',{class:'mono',text:String(c.L)}),el('td',{class:'mono',text:String(c.O)}),el('td',{class:'mono',text:String(p.O)}),
        el('td',{class:'mono',text:pc(c.O,c.L)}),el('td',{class:'mono',text:rs(c.Am)}),...(perW?[el('td',{class:'mono',text:pc(c.O,wTgt)})]:[]),
        ...(owner?[el('td',{class:'mono',text:rs(c.Sp)}),el('td',{class:'mono',text:rs(gst(c.Sp))}),el('td',{class:'mono',text:per(gst(c.Sp),c.L)}),el('td',{class:'mono',text:per(gst(c.Sp),c.O)})]:[]))))));
    /* ---- 4. charts ---- */
    const D3=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    parts.push(el('h3',{style:'margin-top:12px',text:'📈 Day by day · leads and orders'}),legend('Leads','Orders'),
      el('div',{class:'scroll chartscroll'},pairChart([...Array(7)].map((_,i)=>{const d=addD(wkPick,i),r=cur.day.find(x=>x.d===d)||{L:0,O:0};
        return{label:D3[i],a:r.L,b:r.O,sun:i===6,tip:d+': '+r.L+' leads, '+r.O+' orders'}}))));
    const wkRows=weeks.map(w=>({w,O:wk(w).T.O}));
    parts.push(el('h3',{style:'margin-top:12px',text:'📆 Orders week by week'+(wTgt?' · target '+wTgt:'')}),
      el('div',{class:'scroll chartscroll'},targetChart(wkRows.map(r=>({label:dlabel(r.w),v:r.O,on:r.w===wkPick,tip:dlabel(r.w)+': '+r.O+' orders'})),wTgt)));
    if(owner)parts.push(el('p',{class:'hint',text:'Ad spend from Meta is without GST; "+ GST" adds 18% — the amount actually paid. Cost / lead, cost / order and ROAS here use the amount with GST. Each person\'s spend = each day\'s spend split by their share of that day\'s leads.'}));
    box.replaceChildren(el('h3',{text:'📅 Weekly report · '+dlabel(wkPick)}),...parts);
  }catch(e){box.replaceChildren(el('h3',{text:'📅 Weekly report'}),el('div',{class:'hint',text:'Could not load: '+e.message}))}})();
  return box;
}
/* two bars per column (a = first colour, b = second), for leads vs orders */
function pairChart(cols){
  const n=cols.length,cw=44,L=30,T=14,ch=150,W=L+n*cw+6,H=T+ch+26,mx=niceMax(Math.max(1,...cols.map(c=>Math.max(c.a,c.b))));
  let s='';for(let i=0;i<=4;i++){const y=T+ch-ch*i/4;s+=`<line x1="${L}" x2="${W-4}" y1="${y}" y2="${y}" class="gl"/><text x="${L-5}" y="${y+3.5}" text-anchor="end" class="ax">${Math.round(mx*i/4)}</text>`}
  cols.forEach((c,i)=>{const x=L+i*cw+5,w=(cw-12)/2,ha=ch*c.a/mx,hb=ch*c.b/mx;
    s+=`<g><title>${esc(c.tip)}</title><rect x="${x}" y="${T+ch-ha}" width="${w}" height="${ha}" class="c-prem" rx="2"/><rect x="${x+w+2}" y="${T+ch-hb}" width="${w}" height="${hb}" class="c-aff" rx="2"/>`;
    if(c.a)s+=`<text x="${x+w/2}" y="${T+ch-ha-3}" text-anchor="middle" class="vl">${c.a}</text>`;
    if(c.b)s+=`<text x="${x+w*1.5+2}" y="${T+ch-hb-3}" text-anchor="middle" class="vl">${c.b}</text>`;
    s+=`<text x="${x+w+1}" y="${T+ch+14}" text-anchor="middle" class="ax${c.sun?' sun':''}">${esc(c.label)}</text></g>`});
  return svgBox(`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`,'Leads and orders per day')}
/* columns with a dashed target line */
function targetChart(cols,tgt){
  const n=cols.length,cw=70,L=30,T=16,ch=150,W=L+n*cw+6,H=T+ch+26,mx=niceMax(Math.max(1,tgt||0,...cols.map(c=>c.v)));
  let s='';for(let i=0;i<=4;i++){const y=T+ch-ch*i/4;s+=`<line x1="${L}" x2="${W-4}" y1="${y}" y2="${y}" class="gl"/><text x="${L-5}" y="${y+3.5}" text-anchor="end" class="ax">${Math.round(mx*i/4)}</text>`}
  cols.forEach((c,i)=>{const x=L+i*cw+10,w=cw-20,h=ch*c.v/mx;
    s+=`<g><title>${esc(c.tip)}</title><rect x="${x}" y="${T+ch-h}" width="${w}" height="${h}" class="c-one" rx="3" style="opacity:${c.on?1:.55}"/>`;
    if(c.v)s+=`<text x="${x+w/2}" y="${T+ch-h-3}" text-anchor="middle" class="vl">${c.v}</text>`;
    s+=`<text x="${x+w/2}" y="${T+ch+14}" text-anchor="middle" class="ax" style="font-weight:${c.on?700:400}">${esc(c.label)}</text></g>`});
  if(tgt){const y=T+ch-ch*tgt/mx;s+=`<line x1="${L}" x2="${W-4}" y1="${y}" y2="${y}" stroke="var(--warn)" stroke-width="2" stroke-dasharray="5 4"/><text x="${W-6}" y="${y-4}" text-anchor="end" class="vl" style="fill:var(--warn)">target ${tgt}</text>`}
  return svgBox(`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`,'Orders per week against target')}
function viewSales(){
  const list=salesStaff(), m=adminMonth;
  if(!list.length)return[el('div',{class:'empty',text:'No sales staff yet. In the Staff tab, edit a person and set "Sales staff" to Yes.'})];
  const dInp=el('input',{id:'sdate',type:'date',value:salesDate,min:m+'-01',max:ymd(monthDates(m).slice(-1)[0]),onchange:e=>{salesDate=e.target.value;renderAdmin()}});
  const rows=list.map(s=>{const x=adminSales[salesDate+'__'+s.id]||{};const id='sl-'+salesDate+'-'+s.id;
    return{s,x,leads:el('input',{id,type:'number',min:'0',inputmode:'numeric',placeholder:'0',value:(id in drafts?drafts[id]:(x.leads||'')),style:'width:100%',oninput:e=>{drafts[id]=e.target.value}})}});
  /* Meta ad spend — only the owner (admin PIN) sees or types it. Each day's spend is split over the sales staff by their share of that day's leads */
  const owner=!mgrAccess;
  const dayLeads=ds=>list.reduce((t,s)=>t+((adminSales[ds+'__'+s.id]||{}).leads||0),0);
  const share=(ds,sid)=>{const sp=adminAd[ds]||0,L=dayLeads(ds);return sp&&L?sp*((adminSales[ds+'__'+sid]||{}).leads||0)/L:0};
  const per=(a,b)=>b?rs(a/b):'—', roas=(sales,sp)=>sp?(sales/sp).toFixed(1)+'x':'—';
  const spI=owner?el('input',{id:'sl-spend',type:'number',min:'0',step:'any',inputmode:'decimal',placeholder:'e.g. 850',value:adminAd[salesDate]!=null?adminAd[salesDate]:'',style:'max-width:160px'}):null;
  const saveBtn=el('button',{class:'btn primary',type:'button',text:'Save leads for this day'});
  saveBtn.onclick=async()=>{const out=rows.filter(r=>r.leads.value!=='').map(r=>({staffId:r.s.id,date:salesDate,leads:Number(r.leads.value)||0,premium:'',affordable:'',amount:''}));
    const spChanged=owner&&String(spI.value)!==String(adminAd[salesDate]!=null?adminAd[salesDate]:'');
    if(!out.length&&!spChanged){toast('Type the lead numbers first.');return}
    saveBtn.disabled=true;saveBtn.textContent='Saving…';
    try{if(out.length)await call('saveSales',{adminPin,rows:out});if(spChanged)await call('saveAdSpend',{adminPin,date:salesDate,amount:spI.value});drafts={};toast('Saved for '+salesDate);reload()}catch(e){toast('Could not save: '+e.message);saveBtn.disabled=false;saveBtn.textContent='Save leads for this day'}};
  const head=['Name','Leads','Orders (auto)','Sales ₹ (auto)'].concat(owner?['Ad spend','Cost / lead','Cost / order','ROAS']:[]);
  const entry=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Daily leads'}),dInp),
    el('p',{class:'hint',text:'HR types how many new leads each sales person got. Orders and sales amount come in automatically from the orders staff enter in the app.'+(owner?' Ad spend is only shown to you (admin): it fills in automatically from Meta every morning at 7 (you can still type over it), and it is split by each person\'s share of the leads.':'')}),
    owner?el('label',{class:'f',for:'sl-spend'},'Meta ad spend this day (₹)',spI):null,
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...head.map(t=>el('th',{text:t})))),
      el('tbody',{},...rows.map(r=>{const o=(r.x.premium||0)+(r.x.affordable||0),sp=share(salesDate,r.s.id);
        return el('tr',{},el('th',{text:r.s.name}),el('td',{},r.leads),el('td',{class:'mono',text:String(o)}),el('td',{class:'mono',text:rs(r.x.amount||0)}),
          ...(owner?[el('td',{class:'mono',text:sp?rs(sp):'—'}),el('td',{class:'mono',text:sp?per(sp,r.x.leads||0):'—'}),el('td',{class:'mono',text:sp?per(sp,o):'—'}),el('td',{class:'mono',text:roas(r.x.amount||0,sp)})]:[]))})))),
    el('div',{class:'row'},saveBtn));
  const dates=monthDates(m);
  const tot=list.map(s=>{let L=0,P=0,Af=0,Am=0,Sp=0;dates.forEach(d=>{const ds=ymd(d),x=adminSales[ds+'__'+s.id];if(x){L+=x.leads;P+=x.premium;Af+=x.affordable;Am+=x.amount}Sp+=share(ds,s.id)});return{s,L,P,Af,O:P+Af,Am,Sp}});
  const all=tot.reduce((a,t)=>({L:a.L+t.L,O:a.O+t.O,Am:a.Am+t.Am}),{L:0,O:0,Am:0});
  const spMonth=dates.reduce((t,d)=>t+(adminAd[ymd(d)]||0),0);
  const pct=(o,l)=>l?Math.round(o/l*100)+'%':'—';
  const stat2=(v,t)=>el('div',{},el('b',{class:'mono',text:v}),el('span',{text:t}));
  const report=el('div',{class:'panel'},el('h3',{text:'This month'}),
    el('div',{class:'stats'},stat2(String(all.L),'Leads'),stat2(String(all.O),'Orders'),stat2(pct(all.O,all.L),'Conversion'),stat2(rs(all.Am),'Sales'),
      ...(owner?[stat2(rs(spMonth),'Ad spend (no GST)'),stat2(rs(spMonth*(1+GST_RATE)),'Ad spend + GST'),stat2(per(spMonth,all.O),'Cost / order'),stat2(roas(all.Am,spMonth),'ROAS')]:[])),
    owner?el('p',{class:'hint',text:'Ad spend per person = each day\'s Meta spend split by their share of that day\'s leads. Orders often come from leads of earlier days, so read cost and ROAS over the month, not one day.'}):null,
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Name','Leads','Premium','Affordable','Orders','Conversion','Sales'].concat(owner?['Ad spend','Cost / lead','Cost / order','ROAS']:[]).map(t=>el('th',{text:t})))),
      el('tbody',{},...tot.map(t=>el('tr',{},el('th',{text:t.s.name}),...[t.L,t.P,t.Af,t.O].map(v=>el('td',{class:'mono',text:String(v)})),el('td',{class:'mono',text:pct(t.O,t.L)}),el('td',{class:'mono',text:rs(t.Am)}),
        ...(owner?[el('td',{class:'mono',text:t.Sp?rs(t.Sp):'—'}),el('td',{class:'mono',text:t.Sp?per(t.Sp,t.L):'—'}),el('td',{class:'mono',text:t.Sp?per(t.Sp,t.O):'—'}),el('td',{class:'mono',text:roas(t.Am,t.Sp)})]:[])))))));
  const days=dates.filter(d=>list.some(s=>adminSales[ymd(d)+'__'+s.id]));
  const daily=el('div',{class:'panel'},el('h3',{text:'Day by day (orders · sales)'}),days.length?el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},el('th',{text:'Date'}),...list.map(s=>el('th',{text:s.name})),el('th',{text:'Total'}))),
    el('tbody',{},...days.map(d=>{const ds=ymd(d);let tO=0,tA=0;
      return el('tr',{},el('th',{},el('span',{class:'mono',text:pad2(d.getDate())}),' '+DAYS[d.getDay()].slice(0,3)),...list.map(s=>{const x=adminSales[ds+'__'+s.id];if(!x)return el('td',{class:'c-hrs',text:'—'});const o=x.premium+x.affordable;tO+=o;tA+=x.amount;return el('td',{class:'mono',text:o+' · '+rs(x.amount)})}),el('td',{class:'mono',text:tO+' · '+rs(tA)}))})))):el('div',{class:'empty',text:'No sales entered this month yet.'}));
  /* leads + calls per day (all staff together), like the Leadvyne report */
  const all2=list.concat(staff.filter(s=>s.id==='team-leads'&&!list.includes(s)));
  const dayRows=dates.map(d=>{const ds=ymd(d);const r={d,L:0,C:0,A:0,M:0,K:0,O:0};all2.forEach(s=>{const x=adminSales[ds+'__'+s.id];if(x){r.L+=x.leads;r.C+=x.calls||0;r.A+=x.answered||0;r.M+=x.missed||0;r.K+=x.called||0;r.O+=x.premium+x.affordable}});return r}).filter(r=>r.L||r.C||r.O).reverse();
  const T=dayRows.reduce((a,r)=>({L:a.L+r.L,C:a.C+r.C,A:a.A+r.A,M:a.M+r.M,K:a.K+r.K,O:a.O+r.O}),{L:0,C:0,A:0,M:0,K:0,O:0});
  const lc=el('div',{class:'panel'},el('h3',{text:'Day by day · leads & calls'}),
    el('p',{class:'hint',text:'New leads and calls from Leadvyne, orders from the app. Calls made counts every call; customers called counts each person once that day.'}),
    dayRows.length?el('div',{class:'scroll'},el('table',{},
      el('thead',{},el('tr',{},...['Date','New leads','Calls made','Answered','Missed','Customers called','Orders','Conversion'].map(t=>el('th',{text:t})))),
      el('tbody',{},...dayRows.map(r=>el('tr',{},el('th',{},el('span',{class:'mono',text:pad2(r.d.getDate())}),' '+DAYS[r.d.getDay()].slice(0,3)),
        ...[r.L,r.C,r.A].map(v=>el('td',{class:'mono',text:String(v)})),el('td',{class:'mono',style:r.M?'color:#c0392b':'',text:String(r.M)}),el('td',{class:'mono',text:String(r.K)}),el('td',{class:'mono',text:String(r.O)}),el('td',{class:'mono',text:pct(r.O,r.L)})))),
      el('tfoot',{},el('tr',{},el('th',{text:'Total'}),...[T.L,T.C,T.A,T.M,T.K,T.O].map(v=>el('td',{class:'mono',text:String(v)})),el('td',{class:'mono',text:pct(T.O,T.L)}))))):el('div',{class:'empty',text:'No leads entered this month yet.'}));
  return[weeklyReport(list,owner),entry,report,lc,daily];
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
  const tbl=el('table',{},el('thead',{},el('tr',{},...['Name','Salary','Full','Half','WFH paid','WFH no order','Leave','Absent','Sun paid','Sun cut','OT hours','Paid days','Earned','Bonus','Advance','Net pay',''].map(t=>el('th',{text:t})))),
    el('tbody',{},...calc.map(({s,c})=>el('tr',{},el('th',{text:s.name}),el('td',{class:'mono',text:rs(c.salary)}),
      ...[c.full,c.half,c.wfhPaid,c.wfhUnpaid,c.leave,c.absent,c.sunPaid,c.sunCut].map(v=>el('td',{class:'mono',text:String(v)})),el('td',{class:'mono',style:c.ot?'color:#0a7a3d;font-weight:600':'',text:c.ot?fmtMin(c.ot):'—'}),
      el('td',{class:'mono',text:c.paid+' / '+c.nd}),el('td',{class:'mono',text:rs(c.earned)}),el('td',{class:'mono',text:c.extra?rs(c.extra):'—'}),el('td',{class:'mono',text:c.adv?'− '+rs(c.adv):'—'}),
      el('td',{class:'mono',style:'font-weight:700',text:rs(c.net)}),el('td',{},el('button',{class:'btn',type:'button',text:'Advance',onclick:()=>editPay(s,m)}))))),
    el('tfoot',{},el('tr',{},el('th',{text:'Total'}),...Array(9).fill(0).map(()=>el('td')),el('td',{class:'mono',text:(t=>t?fmtMin(t):'—')(calc.reduce((t,x)=>t+x.c.ot,0))}),...Array(4).fill(0).map(()=>el('td')),el('td',{class:'mono',text:rs(total)}),el('td'))));
  return[el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Salary · '+MON[mo-1]+' '+y}),el('div',{class:'row'},
      el('button',{class:'btn',type:'button',text:'Salary Excel',onclick:()=>exportSalary(m,calc)}),el('button',{class:'btn',type:'button',text:'Salary slips (PDF)',onclick:()=>exportSlips(m,calc)}),el('button',{class:'btn primary',type:'button',text:'Email slips',onclick:()=>emailSlips(m,calc)}))),
    ...warn.map(w=>el('div',{class:'banner',text:w})),
    el('div',{class:'scroll'},tbl),
    el('p',{class:'hint',text:'Rules: per day = salary ÷ days in the month. Sundays are paid, but a Sunday with leave or absence on both the Saturday before and the Monday after is cut. 6 hours or more is a full day, less is a half day. A sales person\'s work-from-home day is paid only if orders were entered for that day in Sales. OT hours = time worked beyond '+adminMinH+' hours a day; shown for information, it does not change the pay.'}))];
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
      el('div',{},el('div',{style:'font-weight:600',text:s.name+(s.active===false?' (not on check-in)':'')}),el('div',{class:'meta',text:['ID: '+s.id,catOf(s),Number(s.hours)>0?s.hours+' h a day':null,can('salary')?(s.salary?rs(s.salary)+'/month':'No salary set'):null,((s.pin||s.hasPin)?'PIN set':'No PIN'),!mgrAccess&&(s.access||[]).length?'Admin tabs: '+s.access.map(a=>(ADMIN_TABS.find(t=>t[0]===a)||[a,a])[1]).join(', '):null,(s.email||'No email')].filter(Boolean).join(' · ')})),
      el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>editStaff(s)})))):el('div',{class:'empty',text:'No staff yet.'}));
  const setPanel=el('div',{class:'panel'},el('h3',{text:'Settings'}),
    el('p',{class:'hint',text:'The office phone opens the normal link and shows only check-in. Add #admin to the end of the link on the owner\'s or HR\'s phone to see these tabs. Everything is saved in your Google Sheet.'}),
    el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Change admin PIN',onclick:changeAdminPin}),
      el('button',{class:'btn',type:'button',text:'Change sheet link',onclick:askServer}),
      el('button',{class:'btn',type:'button',text:'Log out',onclick:()=>goHome()})));
  if(mgrAccess)return[staffPanel];
  const ul=el('div',{class:'panel'},el('h3',{text:'Allow older order dates'}),el('div',{class:'empty',text:'Loading…'}));
  const drawUl=r=>ul.replaceChildren(el('h3',{text:'Allow older order dates'}),
    el('p',{class:'hint',text:'Sales staff can enter orders for today and yesterday only. Unlock lets one person also enter orders up to 4 days back — for today only. It closes by itself tomorrow. When staff tap "Ask admin", you get an e-mail with an Approve button, and a request box shows at the top of the admin panel.'}),
    ('Notification' in window)&&Notification.permission!=='granted'?el('button',{class:'btn',type:'button',style:'margin-bottom:8px',text:'🔔 Turn on notifications on this phone',onclick:async()=>{try{const p=await Notification.requestPermission();toast(p==='granted'?'Notifications on (while the admin panel is open)':'Notifications blocked in the browser settings')}catch(e){toast('This browser cannot show notifications')}}}):'',
    ...all.filter(s=>r.unlocked&&s.id in r.unlocked).map(s=>{const on=r.unlocked[s.id];
      return el('div',{class:'staffrow'},el('div',{},el('div',{style:'font-weight:600',text:s.name}),el('div',{class:'meta',text:on?'Unlocked today':'Today + yesterday only'})),
        el('button',{class:'btn'+(on?'':' primary'),type:'button',text:on?'Lock again':'Unlock for today',onclick:async e=>{e.target.disabled=true;try{drawUl(await call('unlockDates',{adminPin,staffId:s.id,off:on}));toast(on?s.name+' locked':s.name+' can enter older orders today')}catch(x){toast(/Unknown action/i.test(x.message)?'Update the sheet script (Code.gs) first.':x.message);e.target.disabled=false}}}))}));
  call('unlockDates',{adminPin}).then(drawUl).catch(e=>ul.replaceChildren(el('h3',{text:'Allow older order dates'}),el('p',{class:'hint',text:/Unknown action/i.test(e.message)?'Update the sheet script (Code.gs) first.':'Could not load.'})));
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
  return[el('div',{class:'split'},staffPanel,setPanel),ul,rp];
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
  const hrs=el('input',{id:'s-hr',type:'number',min:'1',max:'16',step:'0.5',inputmode:'decimal',value:s&&Number(s.hours)>0?s.hours:'',placeholder:'Office rule'});
  const od=el('input',{id:'s-od',type:'number',value:s?.order??'',placeholder:'1, 2, 3…'});
  /* one person can have more than one category (e.g. Media + Add-ons). Regular = attendance only, so it stands alone */
  const cur=s?catsOf(s):['Office'];
  const boxes=CATS.map(c=>{const b=el('input',{type:'checkbox',value:c,style:'width:20px;height:20px;margin:0'});b.checked=cur.includes(c);return b});
  boxes.forEach(b=>b.addEventListener('change',()=>{if(!b.checked)return;if(b.value==='Regular')boxes.forEach(x=>{if(x!==b)x.checked=false});else boxes.forEach(x=>{if(x.value==='Regular')x.checked=false})}));
  const sl=el('div',{id:'s-sl',style:'display:flex;flex-direction:column;gap:6px;padding:4px 0'},...boxes.map(b=>el('label',{style:'display:flex;align-items:center;gap:10px;font-weight:500;cursor:pointer'},b,el('span',{},b.value,el('span',{class:'hint',text:CAT_NOTE[b.value]||''})))));
  const picked=()=>boxes.filter(b=>b.checked).map(b=>b.value);
  const ac=el('select',{id:'s-ac'},el('option',{value:'1',text:'Shown on check-in screen',selected:s?.active!==false}),el('option',{value:'0',text:'Not on check-in (left, or works outside)',selected:s?.active===false}));
  /* admin tabs this person may open with their own PIN — only the owner sets this */
  const curA=s?.access||[];
  const aBoxes=ADMIN_TABS.filter(([v])=>v!=='dispatch'&&v!=='daily'&&v!=='cod'&&v!=='ads').map(([v,t])=>{const b=el('input',{type:'checkbox',value:v,style:'width:20px;height:20px;margin:0'});b.checked=curA.includes(v);return el('label',{style:'display:flex;align-items:center;gap:10px;font-weight:500;cursor:pointer'},b,t)});
  const accBox=mgrAccess?null:el('div',{class:'f'},el('span',{},'Admin tabs this person can open (with their own PIN)'),el('p',{class:'hint',text:'Leave all empty for normal staff. Ticked tabs open from an "Admin panel" button on their page, and they can edit there. Leads, Salary and Staff show money and private data.'}),
    el('div',{style:'display:flex;flex-wrap:wrap;gap:6px 16px;padding:4px 0'},...aBoxes));
  const save=async()=>{const name=nm.value.trim().toUpperCase();if(!name){toast('Enter a name.');return}
    const cats=picked();if(!cats.length){toast('Tick at least one category.');return}
    const pin=pn.value.trim();if(pin&&!/^\d{4}$/.test(pin)){toast('PIN must be exactly 4 digits.');return}
    const id=s?.id||name.toLowerCase().replace(/[^a-z0-9]+/g,'-')+'-'+Date.now().toString(36).slice(-4);
    const access=mgrAccess?(s?.access||[]):aBoxes.map(l=>l.firstChild).filter(b=>b.checked).map(b=>b.value);
    try{await call('saveStaff',{adminPin,staff:{id,name,role:cats.join(','),salary:Number(sal.value)||0,pin,order:od.value===''?null:Number(od.value),sales:cats.includes('Sales'),active:ac.value==='1',email:em.value.trim(),access,...(mgrAccess?{}:{hours:hrs.value===''?0:Number(hrs.value)})}});closeOv();toast('Saved '+name);reload()}catch(e){toast('Could not save: '+e.message)}};
  openOv(el('h2',{text:s?'Edit staff':'Add staff'}),el('label',{class:'f',for:'s-nm'},'Name',nm),can('salary')?el('label',{class:'f',for:'s-sal'},'Monthly salary (₹)',sal):null,el('label',{class:'f',for:'s-em'},'Email (for salary slips)',em),
    mgrAccess?el('p',{class:'hint',text:s?((s.hasPin||s.pin)?'PIN is set. Only the owner can reset a PIN.':'No PIN yet: the staff makes their own PIN at first login.'):'The new staff makes their own PIN at first login.'}):el('label',{class:'f',for:'s-pn'},'PIN (4 digits). Leave empty so the staff can create their own PIN',pn),
    el('div',{class:'f'},el('span',{},'Category (tick one or more)'),sl),mgrAccess?null:el('label',{class:'f',for:'s-hr'},'Work hours a day (from 9:30 AM). Empty = office rule. e.g. 9.5 = till 7:00 PM',hrs),el('label',{class:'f',for:'s-od'},'Order on screen',od),el('label',{class:'f',for:'s-ac'},'Check-in',ac),accBox,
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}),s&&!mgrAccess?delStaffBtn(s):null,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})));
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
const payTxt=o=>o.payment==='cod'?'COD':o.payment==='prepaid'?'Prepaid':'—';
/* one order can hold several products (e.g. HALF + FULL + PANT). They are kept in o.items as JSON;
   old orders have only product/qty/amount. linesOf gives one entry per product so product reports count each piece. */
const itemsOf=o=>{let it=o&&o.items;if(typeof it==='string'){try{it=JSON.parse(it||'[]')}catch(e){it=[]}}return Array.isArray(it)?it.filter(x=>x&&x.product):[]};
const linesOf=o=>{const it=itemsOf(o);return it.length?it.map((x,i)=>({...o,product:x.product,qty:+x.qty||1,amount:+x.amount||0,_line:i})):[o]};
const orderLines=os=>os.flatMap(linesOf);
function datalist(id,items){let d=document.getElementById(id);if(!d){d=el('datalist',{id});document.body.append(d)}d.replaceChildren(...[...new Set(items)].map(v=>el('option',{value:v})));return id}
function orderForm(o,onSave,extra){
  o=o||{};
  const f=(id,label,attrs)=>{const i=el('input',{id,...attrs});return[i,el('label',{class:'f',for:id},label,i)]};
  const [nm,lnm]=f('o-nm','Customer name',{type:'text',value:o.customer||'',autocomplete:'off'});
  /* country: India by default; GCC numbers are saved with their code (e.g. 971501234567) */
  const CC=[['91','🇮🇳 +91',10],['971','🇦🇪 +971',9],['966','🇸🇦 +966',9],['974','🇶🇦 +974',8],['968','🇴🇲 +968',8],['965','🇰🇼 +965',8],['973','🇧🇭 +973',8]];
  const p0=String(o.phone||'').replace(/\D/g,'');const cc0=CC.find(c=>c[0]!=='91'&&p0.startsWith(c[0])&&p0.length===c[0].length+c[2]);
  const ccs=el('select',{id:'o-cc','aria-label':'Country code',style:'flex:0 0 auto;width:auto'},...CC.map(c=>el('option',{value:c[0],text:c[1]})));
  ccs.value=cc0?cc0[0]:'91';
  const ph=el('input',{id:'o-ph',type:'tel',inputmode:'numeric',maxlength:'14',autocomplete:'off',style:'flex:1;min-width:0',value:cc0?p0.slice(cc0[0].length):p0});
  const phHint=()=>{const c=CC.find(c=>c[0]===ccs.value);ph.placeholder=c[2]+' digits'};phHint();ccs.onchange=phHint;
  const lph=el('label',{class:'f',for:'o-ph'},'Phone',el('div',{style:'display:flex;gap:6px'},ccs,ph));
  const [di,ldi]=f('o-di','District',{type:'text',value:o.district||'',list:datalist('dl-dist',DISTRICTS),autocomplete:'off'});
  const [pc,lpc]=f('o-pc','Pincode',{type:'text',inputmode:'numeric',maxlength:'6',value:o.pincode||''});
  /* India Post pincode check: shows the post office + state under the box; fills District if it is empty */
  const pcInfo=el('small',{class:'hint',style:'display:block;margin:4px 0 0;font-weight:600'});lpc.append(pcInfo);
  const pcCheck=async()=>{const v=pc.value.replace(/\D/g,'');pcInfo.style.color='';if(v.length!==6){pcInfo.textContent='';return}
    pcInfo.textContent='Checking pincode…';try{const j=await ipPincode(v);if(pc.value.replace(/\D/g,'')!==v)return;
      if(!j.valid){pcInfo.style.color='#c0392b';pcInfo.textContent='⚠ India Post does not know this pincode — check it with the customer.';return}
      const po=(j.offices||[]).find(x=>x.delivery)||(j.offices||[])[0]||{};
      pcInfo.style.color='#1e7e4a';pcInfo.textContent='✓ '+[po.office,j.taluk,j.district,j.state].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(' · ');
      if(!di.value.trim()&&j.district){const dd=pkey(j.district);di.value=DISTRICTS.find(x=>x===dd||dd.includes(x))||dd}}
    catch(e){pcInfo.textContent=/not set|Unknown action/i.test(e.message)?'':'Pincode check: '+e.message}};
  pc.addEventListener('input',()=>{clearTimeout(pcCheck._t);pcCheck._t=setTimeout(pcCheck,350)});if(o.pincode)setTimeout(pcCheck,0);
  /* Type first, then one or more products. Each product line has its own qty and ₹; the total adds up by itself. */
  let type=o.type==='affordable'?'affordable':'premium';
  const type0=type;
  const tyBox=el('div',{class:'seg',role:'radiogroup','aria-label':'Type'});
  const lines=[], linesBox=el('div',{style:'display:grid;gap:10px'});
  const totalEl=el('b',{class:'mono',style:'font-size:18px'});
  const total=()=>lines.reduce((t,r)=>t+(Number(r.am.value)||0),0);
  const showTotal=()=>{totalEl.textContent=rs(total())};
  const priceOf=name=>{const p=products.find(p=>p.type===type&&pkey(p.name)===name);return p?+p.price||0:0};
  const fillLine=r=>{
    const list=products.filter(p=>p.type===type&&p.active!==false);
    const opts=[el('option',{value:'',text:'— Choose product —'}),...list.map(p=>el('option',{value:pkey(p.name),text:p.name}))];
    const keep=r.cur&&type===type0;
    if(keep&&!list.some(p=>pkey(p.name)===r.cur))opts.push(el('option',{value:r.cur,text:r.cur}));
    opts.push(el('option',{value:'__other',text:'Other (type name)…'}));
    r.pr.replaceChildren(...opts);r.pr.value=keep?r.cur:'';r.other.hidden=true};
  const renum=()=>lines.forEach((r,i)=>{r.num.textContent='Product '+(i+1);r.rm.hidden=lines.length<2});
  const autoPrice=r=>{if(r.touched)return;const pz=priceOf(r.pr.value);if(pz){r.am.value=pz*(Number(r.qt.value)||1);showTotal()}};
  const addLine=(x,focus)=>{x=x||{};
    const n=lines.length;
    const r={cur:pkey(x.product),touched:!!x.amount,
      pr:el('select',{id:'o-pr'+(n?'-'+n:''),'aria-label':'Product'}),
      other:el('input',{type:'text',placeholder:'Type the product name',autocomplete:'off',hidden:true,'aria-label':'Product name'}),
      qt:el('input',{type:'number',min:'1',inputmode:'numeric',value:x.qty||1,'aria-label':'Qty'}),
      am:el('input',{type:'number',min:'0',inputmode:'numeric',value:x.amount||'',placeholder:'₹','aria-label':'Amount ₹'}),
      num:el('b',{})};
    r.rm=el('button',{class:'btn',type:'button',text:'✕ Remove',style:'padding:6px 10px;font-size:13px',onclick:()=>{lines.splice(lines.indexOf(r),1);r.box.remove();renum();showTotal()}});
    r.pr.onchange=()=>{r.other.hidden=r.pr.value!=='__other';if(!r.other.hidden)r.other.focus();autoPrice(r)};
    r.qt.oninput=()=>autoPrice(r);
    r.am.oninput=()=>{r.touched=true;showTotal()};
    r.box=el('div',{style:'border:1px solid var(--line);border-radius:12px;padding:10px;display:grid;gap:6px'},
      el('div',{style:'display:flex;justify-content:space-between;align-items:center'},r.num,r.rm),
      r.pr,r.other,
      el('div',{style:'display:grid;grid-template-columns:90px 1fr;gap:8px'},
        el('label',{class:'f'},'Qty',r.qt),el('label',{class:'f'},'Amount ₹',r.am)));
    fillLine(r);lines.push(r);linesBox.append(r.box);renum();showTotal();if(focus)r.pr.focus()};
  const start=itemsOf(o).length?itemsOf(o):[{product:o.product||'',qty:+o.qty||1,amount:+o.amount||0}];
  start.forEach(x=>addLine(x));
  const addBtn=el('button',{class:'btn',type:'button',text:'+ Add product',onclick:()=>addLine({},true)});
  const drawType=()=>tyBox.replaceChildren(...[['premium','Premium'],['affordable','Affordable']].map(([v,t])=>el('button',{type:'button',role:'radio','aria-checked':String(type===v),class:'segbtn'+(type===v?' on':''),text:t,onclick:()=>{if(type===v)return;type=v;drawType();lines.forEach(fillLine)}})));
  drawType();
  let pay=o.payment==='cod'||o.payment==='prepaid'?o.payment:'';
  const payBox=el('div',{class:'seg',role:'radiogroup','aria-label':'Payment'});
  const drawPay=()=>payBox.replaceChildren(...[['prepaid','Prepaid'],['cod','COD (cash on delivery)']].map(([v,t])=>el('button',{type:'button',role:'radio','aria-checked':String(pay===v),class:'segbtn'+(pay===v?' on':''),text:t,onclick:()=>{pay=v;drawPay()}})));
  drawPay();
  const lpr=el('div',{class:'f',style:'grid-column:1/-1'},'Products',linesBox,addBtn,
    el('div',{style:'display:flex;justify-content:space-between;align-items:center;margin-top:4px'},el('span',{text:'Total amount'}),totalEl));
  const [nt,lnt]=f('o-nt','Note (optional)',{type:'text',value:o.note||''});
  const [on,lon]=f('o-no','Order No. (empty = automatic)',{type:'text',value:o.orderNo||'',autocomplete:'off',style:'text-transform:uppercase'});
  const dp=el('input',{id:'o-dp',type:'checkbox'});dp.checked=o.dispatched==='TRUE'||o.dispatched===true;
  const ldp=el('label',{for:'o-dp',style:'display:flex;gap:8px;align-items:center;font-weight:500'},dp,'Dispatched');
  const btn=el('button',{class:'btn primary big',type:'button',text:o.id?'Save changes':'Save order'});
  /* '' = no phone; null = wrong length; India → 10 digits, GCC → code + number */
  const fullPhone=()=>{let d=ph.value.replace(/\D/g,'').replace(/^0+/,'');if(!d)return '';const c=CC.find(c=>c[0]===ccs.value);
    if(d.length===c[0].length+c[2]&&d.startsWith(c[0]))d=d.slice(c[0].length);
    if(d.length!==c[2])return null;return c[0]==='91'?d:c[0]+d};
  btn.onclick=async()=>{
    const items=lines.map(r=>({product:r.pr.value==='__other'?pkey(r.other.value):r.pr.value,qty:Math.max(1,Number(r.qt.value)||1),amount:Number(r.am.value)||0}));
    if(!items.length){toast('Add at least one product.');return}
    if(items.some(i=>!i.product)){toast('Choose the product in every line (or remove the empty one).');return}
    const data={...o,orderNo:on.value.trim().toUpperCase(),dispatched:dp.checked,customer:nm.value.trim(),phone:fullPhone(),district:di.value.trim().toUpperCase(),pincode:pc.value.replace(/\D/g,''),
      product:items.map(i=>i.product).join(' + '),qty:items.reduce((t,i)=>t+i.qty,0),amount:items.reduce((t,i)=>t+i.amount,0),items:items.length>1?items:[],type,payment:pay,note:nt.value.trim()};
    if(!pay){toast('Choose Prepaid or COD.');return}
    if(!data.customer&&!data.phone){toast('Enter the customer name or phone.');return}
    if(data.phone===null){const c=CC.find(c=>c[0]===ccs.value);toast('Phone number needs '+c[2]+' digits for '+c[1].split(' ')[1]+'.');return}
    if(data.pincode&&data.pincode.length!==6){toast('Pincode needs 6 digits.');return}
    btn.disabled=true;btn.textContent='Saving…';
    try{await onSave(data)}catch(e){toast('Could not save: '+e.message)}finally{btn.disabled=false;btn.textContent=o.id?'Save changes':'Save order'}
  };
  return el('div',{class:'panel'},el('h3',{text:o.id?'Edit order '+(o.orderNo||''):'New order'}),
    el('div',{class:'f'},'Type',tyBox),
    el('div',{class:'f'},'Payment',payBox),
    el('div',{class:'form2'},lpr,lon,lnm,lph,ldi,lpc),lnt,ldp,btn);
}

/* ---------- daily work (media / production) ---------- */
let tasks=[], adminWork=[], adminWorkDate=null;
const CATS=['Sales','Office','Media','Printing','Add-ons','HR','Regular'];
const CAT_NOTE={Sales:' (enters orders)',Printing:' (printing production)','Add-ons':' (bows, socks, boots…)',HR:' (enters daily leads)',Regular:' (all work · attendance only)'};
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
/* HR: type how many new leads each sales person got. Same rows as the admin Leads tab; orders come in by themselves. */
function hrLeadsView(d){
  const H=d.hr,td=d.today,lo=new Date(td+'T12:00:00');lo.setDate(lo.getDate()-45);
  const mFirst=d.month+'-01',mLast=ymd(new Date(+d.month.slice(0,4),+d.month.slice(5,7),0));
  const min=[ymd(lo),mFirst].sort()[1],max=[td,mLast].sort()[0];
  if(min>max)return[el('div',{class:'empty',text:'Leads can be entered only for the last 45 days. Pick this month above.'})];
  if(!hrDate||hrDate<min||hrDate>max)hrDate=max;
  const leadOf=(ds,id)=>{const r=H.leads.find(x=>x.date===ds&&x.staffId===id);return r?r.leads:''};
  const ordOf=(ds,id)=>H.orders[ds+'__'+id]||0;
  const dInp=el('input',{id:'hrdate',type:'date',value:hrDate,min,max,onchange:e=>{if(e.target.value){hrDate=e.target.value;ordersHome()}}});
  const rows=H.staff.map(s=>({s,inp:el('input',{type:'number',min:'0',inputmode:'numeric',placeholder:'0',value:String(leadOf(hrDate,s.id)),style:'width:100%','aria-label':'Leads for '+s.name})}));
  const btn=el('button',{class:'btn primary',type:'button',text:'Save leads'});
  btn.onclick=async()=>{const out=rows.filter(r=>r.inp.value!=='').map(r=>({staffId:r.s.id,leads:Number(r.inp.value)||0}));
    if(!out.length){toast('Type the lead numbers first.');return}
    btn.disabled=true;btn.textContent='Saving…';
    try{await call('hrSaveLeads',{staffId:me.id,pin:me.pin,date:hrDate,rows:out});toast('Leads saved for '+dm(hrDate));ordersHome()}
    catch(e){toast('Could not save: '+e.message);btn.disabled=false;btn.textContent='Save leads'}};
  const form=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Daily leads'}),dInp),
    el('p',{class:'hint',text:'Count the new leads given to each sales person in Leadvyne for this day and type them here. Orders come in by themselves from the orders staff enter.'}),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Name','Leads','Orders (auto)'].map(t=>el('th',{text:t})))),
      el('tbody',{},...rows.map(r=>el('tr',{},el('th',{text:r.s.name}),el('td',{},r.inp),el('td',{class:'mono',text:String(ordOf(hrDate,r.s.id))})))))),
    el('div',{class:'row'},btn));
  const pct=(o,l)=>l?Math.round(o/l*100)+'%':'—';
  const tot=H.staff.map(s=>{const L=H.leads.filter(x=>x.staffId===s.id).reduce((a,x)=>a+x.leads,0);const O=Object.keys(H.orders).filter(k=>k.endsWith('__'+s.id)).reduce((a,k)=>a+H.orders[k],0);return{s,L,O}});
  const all=tot.reduce((a,t)=>({L:a.L+t.L,O:a.O+t.O}),{L:0,O:0});
  const sum=el('div',{class:'panel'},el('h3',{text:'This month'}),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Name','Leads','Orders','Conversion'].map(t=>el('th',{text:t})))),
      el('tbody',{},...tot.map(t=>el('tr',{},el('th',{text:t.s.name}),el('td',{class:'mono',text:String(t.L)}),el('td',{class:'mono',text:String(t.O)}),el('td',{class:'mono',text:pct(t.O,t.L)})))),
      el('tfoot',{},el('tr',{},el('th',{text:'Total'}),el('td',{class:'mono',text:String(all.L)}),el('td',{class:'mono',text:String(all.O)}),el('td',{class:'mono',text:pct(all.O,all.L)}))))));
  const days=[...new Set(H.leads.map(x=>x.date))].sort().reverse();
  const missing=[];for(let x=new Date(min+'T12:00:00');ymd(x)<=max;x.setDate(x.getDate()+1)){const ds=ymd(x);if(x.getDay()!==0&&!days.includes(ds))missing.push(ds)}
  const miss=missing.length?el('div',{class:'banner'},'Leads not entered: '+missing.slice(-10).map(dm).join(', ')+(missing.length>10?' and '+(missing.length-10)+' more':'')):null;
  return[miss,form,sum].filter(Boolean);
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
        el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>{const old=adminWorkDate;const wd=el('input',{id:'w-move',type:'date',value:old,max:todayStr});
          openOv(el('h2',{text:s.name}),el('label',{class:'f',for:'w-move'},'Date (change it to move this work to another day)',wd),workForm(list,rows,async items=>{const nd=wd.value||old;
            let j=await call('saveWork',{adminPin,staffId:s.id,date:nd,items});
            if(nd!==old){j=await call('saveWork',{adminPin,staffId:s.id,date:old,items:rows.map(r=>({taskId:r.taskId,value:''}))});adminWorkDate=nd;closeOv();toast('Moved to '+dm(nd));if(nd.slice(0,7)!==old.slice(0,7)){loadMonth(nd.slice(0,7));return}reload();return}
            adminWork=j.work;closeOv();toast('Saved');renderAdmin()}),el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv})));$('#sheet').style.maxWidth='560px'}}))})):
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

/* ---------- admin: reports (dashboard) — any period: production work, sales, products, attendance; PDF + Excel ---------- */
let rp={preset:'today',from:'',to:''}, rpCache={}, rpLoading=false;
const addDays=(ds,n)=>{const d=new Date(ds+'T12:00:00');d.setDate(d.getDate()+n);return ymd(d)};
const dm=ds=>ds.slice(8)+'/'+ds.slice(5,7);
function rpRange(st){st=st||rp;const td=todayStr;
  if(st.preset==='today')return[td,td];
  if(st.preset==='yesterday'){const y=addDays(td,-1);return[y,y]}
  if(st.preset==='week')return[addDays(td,-6),td];
  if(st.preset==='w8')return[addDays(td,-55),td];
  if(st.preset==='month')return[td.slice(0,7)+'-01',td];
  if(st.preset==='lastmonth'){const d=new Date(td.slice(0,7)+'-01T12:00:00');d.setMonth(d.getMonth()-1);const m=ymOf(d);return[m+'-01',ymd(monthDates(m).slice(-1)[0])]}
  if(st.preset==='year')return[td.slice(0,4)+'-01-01',td];
  if(st.preset==='lastyear'){const y=+td.slice(0,4)-1;return[y+'-01-01',y+'-12-31']}
  let f=st.from||td,t=st.to||td;if(f>t)[f,t]=[t,f];return[f,t]}
const rpLabel=(f,t)=>f===t?dm(f)+'/'+f.slice(0,4):dm(f)+'/'+f.slice(0,4)+' to '+dm(t)+'/'+t.slice(0,4);
function rangeDays(f,t){const out=[];for(let d=f;d<=t;d=addDays(d,1))out.push(d);return out}
function rpMonths(f,t){const out=[];let m=f.slice(0,7);while(m<=t.slice(0,7)&&out.length<14){out.push(m);const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+1);m=ymOf(d)}return out}
async function rpLoad(months){rpLoading=true;
  try{await Promise.all(months.filter(m=>!rpCache[m]).map(async m=>{rpCache[m]=await call('month',{adminPin,month:m})}))}
  catch(e){toast('Could not load: '+e.message)}
  rpLoading=false;renderAdmin()}
function rpData(st){
  const[f,t]=rpRange(st);const months=rpMonths(f,t);
  if(months.length>12)return{f,t,tooLong:true};
  const miss=months.filter(m=>!rpCache[m]);if(miss.length){if(!rpLoading)rpLoad(miss);return{f,t,loading:true}}
  const inR=x=>x.date>=f&&x.date<=t, pick=k=>months.flatMap(m=>rpCache[m][k]||[]).filter(inR);
  return{f,t,days:rangeDays(f,t),work:pick('work'),orders:pick('orders'),att:pick('att'),sales:pick('sales')};
}
function rpBuild(D){
  const all=[...staff].sort(byOrder), amt=o=>+o.amount||0, isPrem=o=>o.type!=='affordable';
  const sum={orders:D.orders.length,amount:D.orders.reduce((a,o)=>a+amt(o),0),premium:D.orders.filter(isPrem).length,affordable:D.orders.filter(o=>!isPrem(o)).length,
    leads:D.sales.reduce((a,r)=>a+(+r.leads||0),0),noAmt:D.orders.filter(o=>!amt(o)).length};
  const sales=all.filter(s=>s.sales||D.orders.some(o=>o.staffId===s.id)).map(s=>{const os=D.orders.filter(o=>o.staffId===s.id);
    const pp={};orderLines(os).forEach(o=>{const c=prodCode(o)||'NOT WRITTEN';const r=pp[c]=pp[c]||{c,q:0,amt:0};r.q+=(+o.qty||1);r.amt+=amt(o)});
    return{s,os:os.slice().sort((a,b)=>(a.date+(a.createdAt||'')).localeCompare(b.date+(b.createdAt||''))),prods:Object.values(pp).sort((a,b)=>b.q-a.q),n:os.length,p:os.filter(isPrem).length,a:os.filter(o=>!isPrem(o)).length,amt:os.reduce((x,o)=>x+amt(o),0),leads:D.sales.filter(r=>r.staffId===s.id).reduce((a,r)=>a+(+r.leads||0),0)}})
    .filter(r=>r.n||r.leads||r.s.active!==false);
  /* days a person came (IN or WFH) but saved no work — so you can see who skipped filling */
  const workDays=D.days.filter(ds=>ds<todayStr&&new Date(ds+'T12:00:00').getDay()!==0);
  const work=all.filter(s=>tasksFor(s).length||D.work.some(w=>w.staffId===s.id)).map(s=>{
    const mine=D.work.filter(w=>w.staffId===s.id&&w.value!=='');const own=tasksFor(s);
    const list=own.concat(tasks.filter(t=>!own.includes(t)&&mine.some(w=>w.taskId===t.id)));
    const dates=[...new Set(mine.map(w=>w.date))].sort();
    const totals=list.map(t=>{const ws=mine.filter(w=>w.taskId===t.id);let parts=null,notes=null;
      if(t.kind==='colours'||t.kind==='items'){const g={};ws.forEach(w=>Object.entries(colParse(w.value)).forEach(([c,q])=>g[c]=(g[c]||0)+(+q||0)));parts=Object.entries(g).sort((a,b)=>b[1]-a[1]).map(([c,q])=>[optLabel(t,c),q])}
      if(t.kind==='text')notes=ws.filter(w=>w.value).sort((a,b)=>a.date.localeCompare(b.date)).map(w=>[w.date,w.value]);
      return{t,total:t.kind==='text'?(notes.length?(D.days.length>1?notes.length+' day'+(notes.length>1?'s':''):'✓'):''):workTotal(t,ws),parts,notes}});
    const missing=workDays.filter(ds=>{const a=D.att.find(r=>r.staffId===s.id&&r.date===ds);return a&&(a.in||a.status==='wfh')&&a.status!=='leave'&&!dates.includes(ds)});
    return{s,list,dates,mine,totals,missing}}).filter(r=>r.s.active!==false||r.mine.length);
  const pg={};orderLines(D.orders).forEach(o=>{const c=prodCode(o);if(!c)return;const r=pg[c]=pg[c]||{c,p:0,a:0,q:0,amt:0};const q=+o.qty||1;isPrem(o)?r.p+=q:r.a+=q;r.q+=q;r.amt+=amt(o)});
  const products=Object.values(pg).sort((a,b)=>b.q-a.q);
  const att=all.filter(s=>s.active!==false||D.att.some(r=>r.staffId===s.id)).map(s=>{const l=D.att.filter(r=>r.staffId===s.id);
    return{s,present:l.filter(r=>r.in&&r.status!=='leave'&&r.status!=='wfh').length,wfh:l.filter(r=>r.status==='wfh').length,leave:l.filter(r=>r.status==='leave').length,
      late:l.filter(r=>r.lateReason).length,early:l.filter(r=>r.earlyReason).length,ot:l.reduce((t,r)=>t+otMin(r),0),noOut:l.filter(r=>r.in&&!r.out&&r.date<todayStr).length}});
  return{...D,sum,sales,work,products,att};
}
const workDetail=x=>x.parts?x.parts.map(([c,q])=>c.toLowerCase()+' '+q).join(', '):x.notes?x.notes.map(([d,v])=>dm(d)+': '+v).join(' · '):'';
function viewReports(){
  const D=rpData();
  const presets=[['today','Today'],['yesterday','Yesterday'],['week','Last 7 days'],['month','This month'],['lastmonth','Last month'],['custom','Pick dates']];
  const ps=el('select',{id:'rp-p','aria-label':'Period',onchange:e=>{rp.preset=e.target.value;if(rp.preset==='custom'&&!rp.from){rp.from=D.f;rp.to=D.t}renderAdmin()}},...presets.map(([v,t])=>el('option',{value:v,text:t,selected:rp.preset===v})));
  const ready=!D.loading&&!D.tooLong, R=ready?rpBuild(D):null;
  const head=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Report · '+rpLabel(D.f,D.t)}),el('div',{class:'row'},ps,
      el('button',{class:'btn',type:'button',text:'Reload',onclick:()=>{rpMonths(D.f,D.t).forEach(m=>delete rpCache[m]);renderAdmin()}}))),
    rp.preset==='custom'?el('div',{class:'form2'},
      el('label',{class:'f',for:'rp-f'},'From',el('input',{id:'rp-f',type:'date',value:rp.from,max:todayStr,onchange:e=>{rp.from=e.target.value;renderAdmin()}})),
      el('label',{class:'f',for:'rp-t'},'To',el('input',{id:'rp-t',type:'date',value:rp.to,max:todayStr,onchange:e=>{rp.to=e.target.value;renderAdmin()}}))):null,
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Download PDF',disabled:!ready,onclick:()=>rpPdf(R)}),
      el('button',{class:'btn',type:'button',text:'Download Excel',disabled:!ready,onclick:()=>rpXlsx(R)})));
  if(D.tooLong)return[head,el('div',{class:'empty',text:'Pick up to 12 months at a time.'})];
  if(!ready)return[head,el('div',{class:'empty',text:'Loading the report…'})];
  const stat=(v,l)=>el('div',{},el('b',{class:'mono',text:String(v)}),el('span',{text:l}));
  const summary=el('div',{class:'panel'},el('h3',{text:'Summary'}),el('div',{class:'stats'},stat(R.sum.orders,'Orders'),stat(rs(R.sum.amount),'Sales'),stat(R.sum.premium,'Premium'),stat(R.sum.affordable,'Affordable'),can('sales')?stat(R.sum.leads,'Leads'):null),
    R.sum.noAmt?el('p',{class:'hint',text:R.sum.noAmt+' orders have no amount written, so sales ₹ is lower than real.'}):null);
  const tbl=(cols,rows,foot)=>el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...cols.map(c=>el('th',{text:c})))),
    el('tbody',{},...rows.map(r=>el('tr',{},...r.map((c,i)=>i?el('td',{class:typeof c==='number'?'mono':'',text:String(c)}):el('th',{text:String(c)}))))),
    foot?el('tfoot',{},el('tr',{},...foot.map((c,i)=>i?el('td',{class:'mono',text:String(c)}):el('th',{text:String(c)})))):null));
  const amt0=o=>+o.amount||0;
  const multi=R.days.length>1;
  const workPanels=R.work.map(w=>{const shown=w.totals.filter(x=>x.total);
    const dayCols=w.list.filter(t=>t.kind!=='text');
    return el('div',{class:'panel'},el('h3',{text:w.s.name+' · '+catOf(w.s)}),
      el('p',{class:'hint',text:w.dates.length?(multi?'Work saved on '+w.dates.length+' day'+(w.dates.length>1?'s':''):'Work saved'):'No work saved in this period.'}),
      shown.length?tbl(['Work',multi?'Total':'Done','Details'],shown.map(x=>[x.t.name,x.total,workDetail(x)])):null,
      multi&&w.dates.length&&dayCols.length?el('details',{},el('summary',{text:'Day by day'}),tbl(['Date',...dayCols.map(t=>t.name)],
        w.dates.map(ds=>[dm(ds)+' '+DAYS[new Date(ds+'T12:00:00').getDay()].slice(0,3),...dayCols.map(t=>{const x=w.mine.find(m=>m.date===ds&&m.taskId===t.id);return x?fmtWork(t,x.value):''})]))):null,
      w.missing.length?el('p',{class:'hint',style:'color:var(--accent)',text:'Came but did not fill work on: '+w.missing.map(dm).join(', ')}):null)});
  const salesP=el('div',{class:'panel'},el('h3',{text:'Sales staff'}),R.sales.length?tbl(xL(['Name','Leads','Premium','Affordable','Orders','Sales'],1),
    R.sales.map(r=>xL([r.s.name,r.leads,r.p,r.a,r.n,rs(r.amt)],1)),xL(['Total',R.sum.leads,R.sum.premium,R.sum.affordable,R.sum.orders,rs(R.sum.amount)],1)):el('div',{class:'empty',text:'No sales staff.'}),
    ...R.sales.filter(r=>r.n).map(r=>el('details',{},el('summary',{text:r.s.name+' · '+r.n+' orders · '+rs(r.amt)}),
      el('p',{class:'hint',text:'Products: '+r.prods.map(x=>(CODE_NAMES[x.c]||x.c).toLowerCase()+' '+x.q).join(', ')}),
      tbl(['Date','No.','Customer','Phone','District','Product','Type','Amount'],r.os.map(o=>[dm(o.date),o.orderNo||'',o.customer||'—',o.phone||'',o.district||'',o.product||'—',o.type==='affordable'?'Affordable':'Premium',amt0(o)?rs(amt0(o)):'—'])))));
  const prodP=el('div',{class:'panel'},el('h3',{text:'Products sold'}),R.products.length?tbl(['Product','Premium','Affordable','Total','Sales'],
    R.products.map(r=>[CODE_NAMES[r.c]||r.c,r.p,r.a,r.q,r.amt?rs(r.amt):'—'])):el('div',{class:'empty',text:'No orders with a product in this period.'}));
  const attP=el('div',{class:'panel'},el('h3',{text:'Attendance'}),tbl(['Name','Came','WFH','Leave','Late','Left early','No OUT','Overtime'],R.att.map(r=>[r.s.name,r.present,r.wfh,r.leave,r.late,r.early,r.noOut,r.ot?fmtMin(r.ot):'—'])));
  return[head,summary,el('h2',{class:'sect',text:'Production & work'}),...workPanels,salesP,prodP,attP];
}
const pdfTxt=v=>String(v==null?'':v).replace(/₹/g,'Rs. ').replace(/[✓✗]/g,'').replace(/[–—]/g,'-').replace(/[^\x20-\x7E\xA0-\xFF\n]/g,'').trim();
function rpPdf(R){
  const J=window.jspdf&&window.jspdf.jsPDF;if(!J){toast('PDF tool did not load. Check the internet and reload.');return}
  const doc=new J({unit:'pt',format:'a4'});const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=32,TW=W-2*M;let y=0;
  const header=()=>{doc.setFillColor(81,31,82);doc.rect(0,0,W,62,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('COUPLO DESIGN STUDIO',M,29);
    doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text('Work & sales report  |  '+rpLabel(R.f,R.t),M,46);doc.setTextColor(30);y=86};
  const newPage=()=>{doc.addPage();header()};
  const title=t=>{if(y>100)y+=8;if(y+46>H-40)newPage();doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(81,31,82);doc.text(pdfTxt(t),M,y);doc.setTextColor(30);y+=14};
  const note=(t,red)=>{doc.setFont('helvetica','normal');doc.setFontSize(8.5);const ls=doc.splitTextToSize(pdfTxt(t),TW);if(y+ls.length*11>H-40)newPage();
    if(red)doc.setTextColor(170,30,60);doc.text(ls,M,y+4);doc.setTextColor(30);y+=ls.length*11+6};
  const table=(cols,rows,widths,foot)=>{const ws=widths||cols.map(()=>1/cols.length);const xs=[];let x=M;ws.forEach(w=>{xs.push(x);x+=w*TW});
    const row=(cells,bold,fill)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.5);
      const lines=cells.map((c,i)=>doc.splitTextToSize(pdfTxt(c),ws[i]*TW-8));const h=Math.max(1,...lines.map(l=>l.length))*10.5+7;
      if(y+h>H-40){newPage();if(!bold)row(cols,true,[243,235,243]);doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(8.5)}
      if(fill){doc.setFillColor(...fill);doc.rect(M,y,TW,h,'F')}
      lines.forEach((l,i)=>doc.text(l,xs[i]+4,y+11.5));doc.setDrawColor(222);doc.line(M,y+h,M+TW,y+h);y+=h};
    if(y+40>H-40)newPage();row(cols,true,[243,235,243]);rows.forEach(r=>row(r,false));if(foot)row(foot,true,[248,244,248]);y+=14};
  header();
  title('Summary');table(xL(['Orders','Premium','Affordable','Sales','Leads'],4),[xL([R.sum.orders,R.sum.premium,R.sum.affordable,rsPlain(R.sum.amount),R.sum.leads],4)]);
  if(R.sum.noAmt)note(R.sum.noAmt+' orders have no amount written, so sales is lower than real.');
  const multi=R.days.length>1;
  title('Production & work');y+=2;
  R.work.forEach(w=>{title(w.s.name+'  |  '+catOf(w.s)+(multi?'  |  work saved on '+w.dates.length+' day(s)':''));
    const shown=w.totals.filter(x=>x.total);
    if(!shown.length)note('No work saved in this period.');
    else table(['Work',multi?'Total':'Done','Details'],shown.map(x=>[x.t.name,x.total,workDetail(x)]),[.3,.14,.56]);
    const dayCols=w.list.filter(t=>t.kind!=='text');
    if(multi&&w.dates.length&&dayCols.length){const n=dayCols.length;table(['Date',...dayCols.map(t=>t.name)],w.dates.map(ds=>[dm(ds),...dayCols.map(t=>{const x=w.mine.find(m=>m.date===ds&&m.taskId===t.id);return x?(t.kind==='yesno'?(x.value==='TRUE'?'Done':'Not done'):(t.kind==='colours'||t.kind==='items')?colTotal(x.value):x.value):''})]),[.1,...dayCols.map(()=>.9/n)])}
    if(w.missing.length)note('Came but did not fill work on: '+w.missing.map(dm).join(', '),true)});
  title('Sales staff');table(xL(['Name','Leads','Premium','Affordable','Orders','Sales'],1),R.sales.map(r=>xL([r.s.name,r.leads,r.p,r.a,r.n,rsPlain(r.amt)],1)),can('sales')?[.26,.12,.14,.16,.12,.2]:[.3,.16,.18,.14,.22],xL(['Total',R.sum.leads,R.sum.premium,R.sum.affordable,R.sum.orders,rsPlain(R.sum.amount)],1));
  R.sales.filter(r=>r.n).forEach(r=>{title(r.s.name+'  |  '+r.n+' orders  |  '+rsPlain(r.amt));
    table(['Product','Pieces','Sales'],r.prods.map(x=>[CODE_NAMES[x.c]||x.c,x.q,x.amt?rsPlain(x.amt):'-']),[.5,.2,.3]);
    table(['Date','No.','Customer','District','Product','Type','Amount'],r.os.map(o=>[dm(o.date),o.orderNo||'',o.customer||'-',o.district||'',o.product||'-',o.type==='affordable'?'Affordable':'Premium',+o.amount?rsPlain(+o.amount):'-']),[.09,.11,.2,.17,.2,.11,.12])});
  if(R.products.length){title('Products sold');table(['Product','Premium','Affordable','Total','Sales'],R.products.map(r=>[CODE_NAMES[r.c]||r.c,r.p,r.a,r.q,r.amt?rsPlain(r.amt):'-']),[.36,.14,.16,.14,.2])}
  title('Attendance');table(['Name','Came','WFH','Leave','Late','Left early','No OUT','Overtime'],R.att.map(r=>[r.s.name,r.present,r.wfh,r.leave,r.late,r.early,r.noOut,r.ot?fmtMin(r.ot):'-']),[.24,.1,.1,.1,.1,.12,.1,.14]);
  const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(140);doc.text('Page '+i+' of '+pages,W-M,H-18,{align:'right'})}
  saveFile('COUPLO_REPORT_'+R.f+(R.f===R.t?'':'_to_'+R.t)+'.pdf',doc.output('arraybuffer'),'application/pdf');
}
function rpXlsx(R){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const wb=XLSX.utils.book_new(),add=(name,rows,w)=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=(w||rows[1]||rows[0]).map((_,i)=>({wch:i?14:22}));XLSX.utils.book_append_sheet(wb,ws,name)};
  add('SUMMARY',[['COUPLO REPORT '+rpLabel(R.f,R.t)],xL(['ORDERS','PREMIUM','AFFORDABLE','SALES','LEADS'],4),xL([R.sum.orders,R.sum.premium,R.sum.affordable,R.sum.amount,R.sum.leads],4)]);
  const wt=[['STAFF','CATEGORY','WORK','TOTAL','DETAILS']];R.work.forEach(w=>w.totals.filter(x=>x.total).forEach(x=>wt.push([w.s.name,catOf(w.s),x.t.name,x.total,workDetail(x)])));add('WORK TOTALS',wt);
  const wd=[['DATE','STAFF','WORK','VALUE']];R.work.forEach(w=>w.mine.slice().sort((a,b)=>a.date.localeCompare(b.date)).forEach(m=>{const t=w.list.find(x=>x.id===m.taskId)||{name:m.taskId,kind:'count'};wd.push([m.date,w.s.name,t.name,pdfTxt(fmtWork(t,m.value))])}));add('WORK DAY BY DAY',wd);
  add('SALES',[xL(['NAME','LEADS','PREMIUM','AFFORDABLE','ORDERS','SALES'],1),...R.sales.map(r=>xL([r.s.name,r.leads,r.p,r.a,r.n,r.amt],1))]);
  add('ORDERS BY STAFF',[['STAFF','DATE','ORDER NO','CUSTOMER','PHONE','DISTRICT','PINCODE','PRODUCT','TYPE','QTY','AMOUNT','DISPATCHED'],...R.sales.flatMap(r=>r.os.map(o=>[r.s.name,o.date,o.orderNo||'',o.customer||'',o.phone||'',o.district||'',o.pincode||'',o.product||'',o.type==='affordable'?'AFFORDABLE':'PREMIUM',+o.qty||1,+o.amount||0,o.dispatched==='TRUE'?'YES':'NO']))]);
  add('PRODUCTS BY STAFF',[['STAFF','PRODUCT','PIECES','SALES'],...R.sales.flatMap(r=>r.prods.map(x=>[r.s.name,CODE_NAMES[x.c]||x.c,x.q,x.amt]))]);
  add('PRODUCTS',[['PRODUCT','PREMIUM','AFFORDABLE','TOTAL','SALES'],...R.products.map(r=>[CODE_NAMES[r.c]||r.c,r.p,r.a,r.q,r.amt])]);
  add('ATTENDANCE',[['NAME','CAME','WFH','LEAVE','LATE','LEFT EARLY','NO OUT','OVERTIME (H:MM)'],...R.att.map(r=>[r.s.name,r.present,r.wfh,r.leave,r.late,r.early,r.noOut,r.ot?Math.floor(r.ot/60)+':'+pad2(r.ot%60):''])]);
  saveFile('COUPLO_REPORT_'+R.f+(R.f===R.t?'':'_to_'+R.t)+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT);
}

/* ---------- admin: dashboard (filters: today / dates / month / year) ---------- */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const WEEKS=[[1,7,'1st week'],[8,14,'2nd week'],[15,21,'3rd week'],[22,31,'4th week']];
const wkOf=ds=>{const d=+ds.slice(8);return d<=7?0:d<=14?1:d<=21?2:3};
let dsh={preset:'month',from:'',to:''};
function svgBox(html,label){const d=el('div',{class:'chart',role:'img','aria-label':label});d.innerHTML=html;return d}
function niceMax(v){if(v<=5)return 5;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return(n<=1?1:n<=2?2:n<=5?5:10)*p}
/* stacked columns: cols = [{k,label,p,a,sun,tip}] (a may be 0 for single-colour charts) */
function colChart(cols,one){
  const n=cols.length,cw=n>16?26:40,L=30,T=14,ch=150,W=L+n*cw+6,H=T+ch+26;
  const mx=niceMax(Math.max(1,...cols.map(c=>c.p+c.a)));
  let s='';for(let i=0;i<=4;i++){const v=mx*i/4,y=T+ch-ch*i/4;s+=`<line x1="${L}" x2="${W-4}" y1="${y}" y2="${y}" class="gl"/><text x="${L-5}" y="${y+3.5}" text-anchor="end" class="ax">${Math.round(v)}</text>`}
  cols.forEach((c,i)=>{const x=L+i*cw+4,w=cw-8,hp=ch*c.p/mx,ha=ch*c.a/mx;
    s+=`<g><title>${esc(c.tip)}</title>`;
    if(c.a)s+=`<rect x="${x}" y="${T+ch-ha}" width="${w}" height="${ha}" class="c-aff" rx="2"/>`;
    if(c.p)s+=`<rect x="${x}" y="${T+ch-ha-hp}" width="${w}" height="${hp}" class="${one?'c-one':'c-prem'}" rx="2"/>`;
    if(c.p+c.a)s+=`<text x="${x+w/2}" y="${T+ch-ha-hp-3}" text-anchor="middle" class="vl">${c.p+c.a}</text>`;
    s+=`<text x="${x+w/2}" y="${T+ch+14}" text-anchor="middle" class="ax${c.sun?' sun':''}">${esc(c.label)}</text></g>`});
  return svgBox(`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${s}</svg>`,'Column chart')}
/* horizontal bars: rows of [label, premium, affordable] (stacked) or [label, value] */
function hBars(rows,stacked){
  if(!rows.length)return el('div',{class:'empty',text:'Nothing in this period.'});
  const LW=stacked?96:190,BW=stacked?280:240,RH=30,W=LW+BW+56,H=rows.length*RH+4;
  const mx=Math.max(1,...rows.map(r=>stacked?r[1]+r[2]:r[1]));let s='';
  rows.forEach((r,i)=>{const y=i*RH+4,tot=stacked?r[1]+r[2]:r[1],wp=BW*r[1]/mx,wa=stacked?BW*r[2]/mx:0;
    s+=`<g><title>${esc(r[0])}: ${stacked?r[1]+' premium, '+r[2]+' affordable':tot}</title><text x="${LW-8}" y="${y+15}" text-anchor="end" class="lb">${esc(String(r[0]).slice(0,stacked?12:24))}</text>`;
    if(wp)s+=`<rect x="${LW}" y="${y+3}" width="${wp}" height="18" class="${stacked?'c-prem':'c-one'}" rx="3"/>`;
    if(wa)s+=`<rect x="${LW+wp}" y="${y+3}" width="${wa}" height="18" class="c-aff" rx="3"/>`;
    s+=`<text x="${LW+wp+wa+6}" y="${y+16}" class="vl">${tot}</text></g>`});
  return svgBox(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${s}</svg>`,'Bar chart')}
const legend=(a,b)=>el('div',{class:'legend'},el('span',{},el('i',{class:'sw c-prem'}),a||'Premium'),el('span',{},el('i',{class:'sw c-aff'}),b||'Affordable'));
const orderNos=v=>String(v||'').split(/[,\n]+/).map(x=>x.trim()).filter(Boolean);
const monLabel=m=>MON[+m.slice(5)-1]+' '+m.slice(2,4);
function dashData(R){
  const os=R.orders, days=R.days, oneMonth=R.f.slice(0,7)===R.t.slice(0,7), byMonth=days.length>62;
  const people=[...staff].filter(s=>s.sales||os.some(o=>o.staffId===s.id)).sort(byOrder);
  const isP=o=>o.type!=='affordable', amt=o=>+o.amount||0, sent=o=>o.dispatched==='TRUE'||o.dispatched===true;
  /* buckets: weeks inside one month, months for longer ranges */
  const bucketKeys=oneMonth?WEEKS.map((_,i)=>i):rpMonths(R.f,R.t);
  const bOf=ds=>oneMonth?wkOf(ds):ds.slice(0,7);
  const mLen=monthDates(R.f.slice(0,7)).length, bLabel=k=>oneMonth?WEEKS[k][2]+' ('+WEEKS[k][0]+'–'+Math.min(WEEKS[k][1],mLen)+')':monLabel(k);
  const byDay={},grid={},bk={};
  os.forEach(o=>{const d=byDay[o.date]=byDay[o.date]||{p:0,a:0};isP(o)?d.p++:d.a++;
    const g=grid[o.staffId+'|'+o.date]=grid[o.staffId+'|'+o.date]||{p:0,a:0};isP(o)?g.p++:g.a++;
    const k=o.staffId+'|'+bOf(o.date),w=bk[k]=bk[k]||{p:0,a:0};isP(o)?w.p++:w.a++});
  const per=people.map(s=>{const mine=os.filter(o=>o.staffId===s.id);return{s,p:mine.filter(isP).length,a:mine.filter(o=>!isP(o)).length,amt:mine.reduce((x,o)=>x+amt(o),0),sent:mine.filter(sent).length,leads:R.sales.filter(r=>r.staffId===s.id).reduce((t,r)=>t+(+r.leads||0),0)}});
  /* printing — from Jaseera's daily work */
  const W=R.work.filter(w=>w.value!==''&&w.value!=null), wOf=id=>W.filter(w=>w.taskId===id);
  const pItems={},pDay={};wOf('printed-items').forEach(w=>Object.entries(colParse(w.value)).forEach(([c,q])=>{q=+q||0;pItems[c]=(pItems[c]||0)+q;pDay[w.date]=(pDay[w.date]||0)+q}));
  const pOrders=wOf('printed-orders').reduce((t,w)=>t+orderNos(w.value).length,0);
  const reprints=wOf('reprint').flatMap(w=>orderNos(w.value).map(no=>({date:w.date,no})));
  const num=id=>wOf(id).reduce((t,w)=>t+(+w.value||0),0);
  const bal=wOf('balance-printing').sort((a,b)=>b.date.localeCompare(a.date))[0];
  const remarks=wOf('print-remarks').sort((a,b)=>a.date.localeCompare(b.date));
  const print={items:Object.entries(pItems).sort((a,b)=>b[1]-a[1]),pieces:Object.values(pItems).reduce((a,b)=>a+b,0),pDay,orders:pOrders,reprints,
    received:num('orders-received'),washing:num('washing'),damage:num('damage'),bal,remarks,any:W.some(w=>['printed-items','printed-orders','reprint','damage','washing','orders-received','balance-printing'].includes(w.taskId))};
  return{...R,os,people,byDay,grid,bk,bucketKeys,bLabel,oneMonth,byMonth,per,isP,amt,sent,print,
    total:os.length,p:os.filter(isP).length,a:os.filter(o=>!isP(o)).length,sales:os.reduce((x,o)=>x+amt(o),0),
    dispatched:os.filter(sent).length,leads:R.sales.reduce((t,r)=>t+(+r.leads||0),0)};
}
/* ---------- this week: which week we are in, holidays, what was missed ---------- */
let holidays={}, wkSel=null, hasHolidayApi=null, dspF={staff:'',show:'pending',q:''};
const isHoliday=ds=>new Date(ds+'T12:00:00').getDay()===0||!!holidays[ds];
const holName=ds=>holidays[ds]||(new Date(ds+'T12:00:00').getDay()===0?'Sunday':'');
function weekRange(m,i){const n=monthDates(m).length,[a,b]=WEEKS[i];const out=[];for(let d=a;d<=Math.min(b,n);d++)out.push(m+'-'+pad2(d));return out}
function weekStep(dir){let{m,i}=wkSel;i+=dir;if(i<0){const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()-1);m=ymOf(d);i=3}else if(i>3){const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()+1);m=ymOf(d);i=0}
  if(m>todayStr.slice(0,7))return;wkSel={m,i};renderAdmin()}
function weekMissed(days,J){
  const past=days.filter(ds=>ds<todayStr&&!isHoliday(ds)), att=J.att||[], os=J.orders||[], work=(J.work||[]).filter(w=>w.value!==''&&w.value!=null), sales=J.sales||[];
  const A=(sid,ds)=>att.find(r=>r.staffId===sid&&r.date===ds);
  const out=[];
  [...staff].filter(s=>s.active!==false).sort(byOrder).forEach(s=>{const items=[];
    past.forEach(ds=>{const r=A(s.id,ds);
      if(!r){items.push([ds,'Absent — no check-in, leave not marked','bad']);return}
      if(r.status==='leave'){items.push([ds,'Leave','lv']);return}
      if(r.in&&!r.out&&r.status!=='wfh')items.push([ds,'OUT not tapped','bad']);
      if(s.sales&&!os.some(o=>o.staffId===s.id&&o.date===ds))items.push([ds,'No orders entered','bad']);
      if(tasksFor(s).length&&!work.some(w=>w.staffId===s.id&&w.date===ds))items.push([ds,'Daily work not filled','bad'])});
    if(items.length)out.push({s,items})});
  const noLeads=past.filter(ds=>!sales.some(r=>r.date===ds&&+r.leads>0));
  const oldPend=os.filter(o=>o.dispatched!=='TRUE'&&o.date<=addDays(todayStr,-3)&&days.includes(o.date));
  return{out,noLeads,oldPend,past};
}
function holidaySheet(){
  const d=el('input',{id:'hd-d',type:'date',value:todayStr}),nm=el('input',{id:'hd-n',type:'text',placeholder:'e.g. Onam, Office closed'});
  const list=()=>{const ks=Object.keys(holidays).sort().reverse();return ks.length?el('div',{},...ks.slice(0,40).map(k=>el('div',{class:'staffrow'},el('div',{},el('b',{text:dm(k)+'/'+k.slice(0,4)+' · '+DAYS[new Date(k+'T12:00:00').getDay()].slice(0,3)}),el('div',{class:'meta',text:holidays[k]})),
    el('button',{class:'btn danger',type:'button',text:'Remove',onclick:()=>save(k,'')})))):el('p',{text:'No holidays added yet. Sundays are always holidays.'})};
  const box=el('div',{},list());
  const save=async(date,name)=>{try{const j=await call('saveHoliday',{adminPin,date,name});holidays=j.holidays||{};hasHolidayApi=true;box.replaceChildren(list());toast(name?'Holiday added':'Holiday removed');renderAdmin()}
    catch(e){toast(/action|Unknown|Admin PIN needed/i.test(e.message)?'Update the Apps Script first (see note).':'Could not save: '+e.message)}};
  openOv(el('h2',{text:'Holidays'}),el('p',{text:'Days the office is closed. They are not counted as missed days. Sundays are holidays automatically.'}),
    el('div',{class:'form2'},el('label',{class:'f',for:'hd-d'},'Date',d),el('label',{class:'f',for:'hd-n'},'Name',nm)),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Add holiday',onclick:()=>{if(!nm.value.trim()){toast('Type a name for the holiday.');nm.focus();return}save(d.value,nm.value.trim()).then(()=>{nm.value=''})}})),
    box,el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv})));$('#sheet').style.maxWidth='480px'}
function viewWeek(){
  if(!wkSel)wkSel={m:todayStr.slice(0,7),i:wkOf(todayStr)};
  const{m,i}=wkSel, J=rpCache[m];
  if(!J){if(!rpLoading)rpLoad([m]);return el('div',{class:'panel'},el('div',{class:'empty',text:'Loading the week…'}))}
  if(J.holidays)holidays={...J.holidays,...holidays};
  const days=weekRange(m,i), isNow=m===todayStr.slice(0,7)&&i===wkOf(todayStr);
  const work=days.filter(ds=>!isHoliday(ds)), passed=work.filter(ds=>ds<todayStr).length, left=work.filter(ds=>ds>todayStr).length+(work.includes(todayStr)?1:0);
  const hol=days.filter(isHoliday);
  const os=(J.orders||[]).filter(o=>days.includes(o.date)), isP=o=>o.type!=='affordable';
  const label=WEEKS[i][2]+' of '+MON[+m.slice(5)-1]+' · '+(+days[0].slice(8))+'–'+(+days[days.length-1].slice(8))+' '+MON[+m.slice(5)-1];
  /* last week, same number of days, for comparison */
  const prevKey=i?{m,i:i-1}:(()=>{const d=new Date(m+'-01T12:00:00');d.setMonth(d.getMonth()-1);return{m:ymOf(d),i:3}})();
  const PJ=rpCache[prevKey.m];const pDays=weekRange(prevKey.m,prevKey.i);const pn=PJ?(PJ.orders||[]).filter(o=>pDays.includes(o.date)).length:null;
  const strip=el('div',{class:'daystrip'},...days.map(ds=>{const dt=new Date(ds+'T12:00:00'),n=os.filter(o=>o.date===ds).length,h=isHoliday(ds);
    const cls='day'+(h?' hol':'')+(ds===todayStr?' now':ds>todayStr?' later':'');
    return el('div',{class:cls,title:h?holName(ds):n+' orders'},el('span',{class:'dw',text:DAYS[dt.getDay()].slice(0,3)}),el('b',{class:'mono',text:String(+ds.slice(8))}),
      el('span',{class:'dn',text:h?holName(ds):ds>todayStr?'':n+' ord'}))}));
  const stat=(v,l,sub)=>el('div',{class:'kpi'},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
  const kp=el('div',{class:'kpis'},stat(os.length,'Orders this week',pn!=null?(pn?((os.length>=pn?'▲ ':'▼ ')+Math.abs(Math.round((os.length-pn)/pn*100))+'% vs last week'):'last week 0'):''),
    stat(os.filter(isP).length+' · '+os.filter(o=>!isP(o)).length,'Premium · Affordable'),
    stat(work.length,'Working days',passed+' done · '+left+' left'),stat(hol.length,'Holidays',hol.map(ds=>holName(ds)+' '+(+ds.slice(8))).join(', ')));
  const M=weekMissed(days,J);
  const mi=M.out.length||(can('sales')&&M.noLeads.length)||M.oldPend.length;
  const missP=el('div',{class:'missbox'},el('h3',{class:'sub',text:M.past.length?'Missed this week (till yesterday)':'Nothing to check yet — the week has just started'}),
    M.past.length&&!mi?el('p',{class:'hint',style:'color:var(--ok)',text:'✓ Nothing missed. Everyone checked in, orders and work are filled.'}):null,
    ...M.out.map(r=>el('div',{class:'missrow'},el('b',{text:r.s.name}),el('div',{class:'misslist'},...r.items.map(([ds,t,c])=>el('span',{class:'chip '+(c==='lv'?'leave':'miss'),text:dm(ds)+' · '+t}))))),
    M.noLeads.length&&can('sales')?el('div',{class:'missrow'},el('b',{text:'Leads (HR)'}),el('div',{class:'misslist'},...M.noLeads.map(ds=>el('span',{class:'chip miss',text:dm(ds)+' · Leads not entered'})))):null,
    M.oldPend.length?el('div',{class:'missrow'},el('b',{text:'Dispatch'}),el('div',{class:'misslist'},el('span',{class:'chip miss',text:M.oldPend.length+' orders older than 3 days not dispatched'}))):null);
  const nav=el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'◀ Previous week',onclick:()=>weekStep(-1)}),
    isNow?null:el('button',{class:'btn',type:'button',text:'This week',onclick:()=>{wkSel=null;renderAdmin()}}),
    isNow?null:el('button',{class:'btn',type:'button',text:'Next week ▶',onclick:()=>weekStep(1)}),
    el('button',{class:'btn',type:'button',text:'Holidays',onclick:holidaySheet}));
  if(!PJ&&!rpLoading)rpLoad([prevKey.m]);
  return el('div',{class:'panel weekp'},el('div',{class:'toolbar'},el('h3',{text:(isNow?'This week · ':'')+label}),el('span',{class:'wkbadge w'+i,text:WEEKS[i][2].toUpperCase()})),
    strip,kp,missP,nav);
}

/* A wide table in its own box: scrolls up/down and sideways inside the box (not the whole page).
   Header row and first column stay visible; ‹ › buttons appear when there is more to the side; drag with the mouse to scroll. */
function scrollBox(table){
  const sc=el('div',{class:'scroll'},table);
  const L=el('button',{type:'button',class:'sbtn l','aria-label':'Scroll left',text:'‹',onclick:()=>sc.scrollBy({left:-sc.clientWidth*.7,behavior:'smooth'})});
  const R=el('button',{type:'button',class:'sbtn r','aria-label':'Scroll right',text:'›',onclick:()=>sc.scrollBy({left:sc.clientWidth*.7,behavior:'smooth'})});
  const box=el('div',{class:'tbx'},sc,L,R);
  const upd=()=>{box.classList.toggle('can-l',sc.scrollLeft>4);box.classList.toggle('can-r',sc.scrollLeft+sc.clientWidth<sc.scrollWidth-4)};
  sc.addEventListener('scroll',upd,{passive:true});
  try{new ResizeObserver(upd).observe(sc)}catch(e){}setTimeout(upd,0);
  let d=null,moved=false;
  sc.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0||e.target===sc||!e.target.closest('table'))return; /* not on the scrollbars */d={x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop};moved=false});
  window.addEventListener('pointermove',e=>{if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(!moved&&Math.abs(dx)+Math.abs(dy)<6)return;moved=true;sc.classList.add('drag');sc.scrollLeft=d.l-dx;sc.scrollTop=d.t-dy});
  window.addEventListener('pointerup',()=>{if(!d)return;d=null;setTimeout(()=>sc.classList.remove('drag'),0)});
  sc.addEventListener('click',e=>{if(moved){e.stopPropagation();e.preventDefault();moved=false}},true); // a drag is not a tap on a row
  return box}
/* Dispatch tab: courier + tracking no. for every order (prepaid too). Customers see it on track.html by their phone number.
   COD always goes by India Post; prepaid picks the courier. Saving a tracking no. also marks the order dispatched. */
const TRACK_COURIERS=['Speed and Safe','ST Courier','DTDC','India Post'];
function trackCell(o,onSent){
  const cod=o.payment==='cod';
  const cr=cod?el('span',{class:'hint',style:'margin:0;white-space:nowrap',text:'India Post'}):el('select',{'aria-label':'Courier '+(o.orderNo||'')},el('option',{value:'',text:'Courier…'}),...TRACK_COURIERS.map(c=>el('option',{value:c,text:c,selected:(o.courier||'')===c})));
  const aw=el('input',{type:'text',value:o.awb||'',placeholder:'Tracking no.','aria-label':'Tracking '+(o.orderNo||''),style:'min-width:120px;text-transform:uppercase'});
  pasteScan(aw);
  const scb=el('button',{class:'btn',type:'button',text:'📷','aria-label':'Scan tracking '+(o.orderNo||''),onclick:()=>scanCode(t=>{aw.value=t;toast('Scanned: '+t)})});
  const sv=el('button',{class:'btn primary',type:'button',text:'Save',onclick:async()=>{
    const courier=cod?'India Post':cr.value;
    if(aw.value.trim()&&!courier){toast('Pick the courier.');cr.focus();return}
    sv.disabled=true;try{const j=await call('setTrack',{adminPin,id:o.id,courier,awb:aw.value});Object.assign(o,j.order||{});toast((o.orderNo||'Order')+(o.awb?' · tracking saved':' saved'));if(o.awb&&onSent)onSent()}
    catch(e){toast(/Unknown action|No access/i.test(e.message)?'Update the sheet script (Code.gs) first.':'Could not save: '+e.message)}sv.disabled=false}});
  const by=o.trackBy?el('span',{class:'hint',style:'margin:0;font-size:11px;white-space:nowrap',text:'by '+o.trackBy+(o.trackAt?' · '+String(o.trackAt).slice(8,10)+'/'+String(o.trackAt).slice(5,7)+' '+String(o.trackAt).slice(11):'')}):null;
  return el('div',{style:'display:flex;gap:6px;align-items:center;flex-wrap:wrap'},cr,aw,scb,sv,...(by?[by]:[]),...[ipBadge(o),ipCheckBtn(o)].filter(Boolean))}
/* COD — only cash-on-delivery orders: courier, tracking no., shipped → delivered → cash received (or returned) */
let codF={preset:'w8',from:'',to:'',show:'open',q:''};
const COD_ST=[['','Not shipped'],['shipped','Shipped'],['delivered','Delivered (cash pending)'],['paid','Cash received'],['returned','Returned (RTO)']];
const codSt=o=>o.codStatus||(String(o.dispatched).toUpperCase()==='TRUE'?'shipped':'');
function viewCod(){
  const R0=rpData(codF);
  const presets=[['week','Last 7 days'],['w8','Last 8 weeks'],['month','This month'],['lastmonth','Last month'],['year','This year'],['custom','Pick dates']];
  const ps=el('select',{id:'cod-p','aria-label':'Period',onchange:e=>{codF.preset=e.target.value;if(codF.preset==='custom'&&!codF.from){codF.from=R0.f;codF.to=R0.t}renderAdmin()}},...presets.map(([v,t])=>el('option',{value:v,text:t,selected:codF.preset===v})));
  const head=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'COD dashboard · '+rpLabel(R0.f,R0.t)}),el('div',{class:'row'},ps,
      el('button',{class:'btn',type:'button',text:'Reload',onclick:()=>{rpMonths(R0.f,R0.t).forEach(m=>delete rpCache[m]);renderAdmin()}}))),
    codF.preset==='custom'?el('div',{class:'form2'},
      el('label',{class:'f',for:'cod-f'},'From',el('input',{id:'cod-f',type:'date',value:codF.from,max:todayStr,onchange:e=>{codF.from=e.target.value;renderAdmin()}})),
      el('label',{class:'f',for:'cod-t'},'To',el('input',{id:'cod-t',type:'date',value:codF.to,max:todayStr,onchange:e=>{codF.to=e.target.value;renderAdmin()}}))):null);
  if(R0.tooLong)return[head,el('div',{class:'empty',text:'Pick up to 12 months at a time.'})];
  if(R0.loading)return[head,el('div',{class:'empty',text:'Loading…'})];
  const all=(R0.orders||[]).filter(o=>o.payment==='cod'), amt=o=>+o.amount||0, sum=a=>a.reduce((t,o)=>t+amt(o),0);
  const by=st=>all.filter(o=>codSt(o)===st);
  const nm=id=>(staff.find(s=>s.id===id)||{name:id||'—'}).name;
  const stat=(v,l,sub,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
  const pendCash=all.filter(o=>['','shipped','delivered'].includes(codSt(o)));
  /* money flow: total COD − cash received − returned = still to come (with courier + at post office) */
  const T=sum(all),P=sum(by('paid')),Rt=sum(by('returned')),toDeliver=by('').concat(by('shipped')),atPO=by('delivered');
  const line=(l,v,n,cls)=>el('div',{class:'codline'+(cls?' '+cls:'')},el('span',{text:l}),el('small',{text:n}),el('b',{class:'mono',text:v}));
  const flow=el('div',{class:'panel'},el('h3',{text:'COD money'}),
    line('Total COD orders',rs(T),all.length+' orders'),
    line('− Cash received (ticket 2 ✓)','− '+rs(P),by('paid').length+' orders','minus'),
    line('− Returned (RTO)','− '+rs(Rt),by('returned').length+' orders','minus'),
    line('= Still to come',rs(T-P-Rt),pendCash.length+' orders','total'),
    el('div',{class:'kpis',style:'margin-top:12px'},
      stat(toDeliver.length,'📦 To be delivered',rs(sum(toDeliver))+' · '+by('').length+' not shipped'),
      stat(atPO.length,'🏤 Collect from post office',rs(sum(atPO))+' · delivered, cash not with us',atPO.length?'warnk':''),
      stat(by('paid').length,'✅ Cash with us',rs(P))),
    !all.length?el('p',{class:'hint',text:'Orders show here once staff pick "COD" in the order form.'}):null);
  /* COD share of sales + week by week */
  const os=R0.orders||[],sumA=a=>a.reduce((t,o)=>t+amt(o),0),pct=(x,y)=>y?Math.round(x*100/y)+'%':'—';
  const share=el('div',{class:'panel'},el('h3',{text:'How much of our sales is COD'}),el('div',{class:'kpis'},
    stat(pct(all.length,os.length),'COD share (orders)',all.length+' of '+os.length+' orders'),
    stat(pct(T,sumA(os)),'COD share (amount)',rs(T)+' of '+rs(sumA(os))),
    stat(pct(by('returned').length,all.length),'COD return rate',by('returned').length+' returned',by('returned').length?'warnk':''),
    stat(all.length?rs(T/all.length):'—','Average COD order')));
  const wkOf=d=>{const x=new Date(d+'T12:00:00');x.setDate(x.getDate()-((x.getDay()+6)%7));return ymd(x)};
  const wk={};os.forEach(o=>{const k=wkOf(o.date);const w=wk[k]=wk[k]||{n:0,c:0,ca:0,dl:0,pd:0,rt:0};w.n++;if(o.payment==='cod'){w.c++;w.ca+=amt(o);const st=codSt(o);if(st==='delivered'||st==='paid')w.dl++;if(st==='paid')w.pd++;if(st==='returned')w.rt++}});
  const wks=Object.keys(wk).sort().reverse(),maxP=Math.max(1,...wks.map(k=>wk[k].n?wk[k].c/wk[k].n:0));
  const weekly=wks.length?el('div',{class:'panel'},el('h3',{text:'COD orders week by week'}),el('p',{class:'hint',text:'Week starts Monday. Delivered and Cash received count the COD orders placed that week.'}),el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Week','All orders','COD','COD %','','COD amount','Delivered','Cash received','Returned'].map(t=>el('th',{text:t})))),
    el('tbody',{},...wks.map(k=>{const w=wk[k],p=w.n?w.c/w.n:0;return el('tr',{},el('td',{class:'mono',text:dm(k)+' – '+dm(addDays(k,6))}),el('td',{class:'mono',text:String(w.n)}),el('td',{class:'mono',style:'font-weight:700',text:String(w.c)}),
      el('td',{class:'mono',text:pct(w.c,w.n)}),el('td',{style:'min-width:90px'},el('div',{class:'codbar'},el('i',{style:'width:'+Math.round(p*100/maxP)+'%'}))),el('td',{class:'mono',text:rs(w.ca)}),
      el('td',{class:'mono',text:String(w.dl)}),el('td',{class:'mono',text:String(w.pd)}),el('td',{class:'mono',text:String(w.rt)}))}))))):null;
  const kpis=el('div',{},flow,share,weekly);const courP=null;
  /* list */
  const box=el('div');
  const draw=()=>{
    const q=codF.q.trim().toUpperCase();
    const base=all.filter(o=>!q||[o.orderNo,o.customer,o.phone,o.district,o.pincode,o.awb,o.courier].some(v=>String(v||'').toUpperCase().includes(q)));
    const groups={open:o=>['','shipped','delivered'].includes(codSt(o)),'':o=>codSt(o)==='',shipped:o=>codSt(o)==='shipped',delivered:o=>codSt(o)==='delivered',paid:o=>codSt(o)==='paid',returned:o=>codSt(o)==='returned',all:()=>true};
    const rows=base.filter(groups[codF.show]).sort((a,b)=>a.date.localeCompare(b.date));
    const chip=(k,t)=>el('button',{type:'button',class:'fchip'+(codF.show===k?' on':''),text:t+' ('+base.filter(groups[k]).length+')',onclick:()=>{codF.show=k;draw()}});
    const chips=el('div',{class:'fchips'},chip('open','All open'),chip('','Not shipped'),chip('shipped','On the way'),chip('delivered','At post office'),chip('paid','Cash received'),chip('returned','Returned'),chip('all','All'));
    const qI=el('input',{id:'cod-q',type:'search',placeholder:'Search order no, customer, phone, tracking…',value:codF.q,oninput:e=>{codF.q=e.target.value;clearTimeout(draw._t);draw._t=setTimeout(()=>{draw();const i=$('#cod-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},250)}});
    const xl=el('button',{class:'btn',type:'button',text:'Download Excel ('+rows.length+')',disabled:!rows.length,onclick:()=>{
      const aoa=[['DATE','ORDER NO','CUSTOMER','PHONE','DISTRICT','PINCODE','PRODUCT','QTY','COD AMOUNT','STAFF','COURIER','TRACKING NO','STATUS']].concat(rows.map(o=>[o.date,o.orderNo||'',o.customer||'',o.phone||'',o.district||'',o.pincode||'',o.product||'',+o.qty||1,amt(o),nm(o.staffId),COD_COURIER,o.awb||'',(COD_ST.find(x=>x[0]===codSt(o))||['',''])[1]]));
      const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=aoa[0].map(()=>({wch:16}));XLSX.utils.book_append_sheet(wb,ws,'COD');
      saveFile('COUPLO_COD_'+R0.f+'_to_'+R0.t+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT)}});
    const tbl=rows.length?el('div',{class:'scroll'},el('table',{class:'disptbl'},
      el('thead',{},el('tr',{},...['Date','No.','Customer','Phone','Place','Staff','Amount','Courier','Tracking no.','① Delivered','② Cash received',''].map(t=>el('th',{text:t})))),
      el('tbody',{},...rows.slice(0,400).map(o=>{
        const cr=el('input',{type:'text',value:COD_COURIER,readonly:true,title:'COD orders always go by India Post','aria-label':'Courier '+(o.orderNo||''),style:'min-width:110px;background:#f3f0f7'});
        const aw=el('input',{type:'text',value:o.awb||'',placeholder:'Tracking no.','aria-label':'Tracking '+(o.orderNo||''),style:'min-width:120px;text-transform:uppercase'});
        pasteScan(aw);
        const scb=el('button',{class:'btn',type:'button',text:'📷','aria-label':'Scan tracking '+(o.orderNo||''),onclick:()=>scanCode(t=>{aw.value=t;toast('Scanned: '+t)})});
        const put=async(cs,btns)=>{btns.forEach(x=>x.disabled=true);try{const j=await call('setCod',{adminPin,id:o.id,codStatus:cs,courier:COD_COURIER,awb:aw.value});Object.assign(o,j.order||{codStatus:cs,courier:COD_COURIER,awb:aw.value.trim().toUpperCase()});toast((o.orderNo||'Order')+' · '+(COD_ST.find(x=>x[0]===cs)||['',''])[1]);renderAdmin()}
          catch(e){toast(/Unknown action|No access/i.test(e.message)?'Update the sheet script (Code.gs) first.':'Could not save: '+e.message);btns.forEach(x=>x.disabled=false)}};
        const cs0=codSt(o),dOn=cs0==='delivered'||cs0==='paid',pOn=cs0==='paid',rt=cs0==='returned';
        const tick=(on,t,fn)=>el('button',{type:'button',class:'codtick'+(on?' on':''),role:'checkbox','aria-checked':String(on),text:(on?'✓ ':'')+t,disabled:rt,onclick:fn});
        let t1,t2,rb;
        t1=tick(dOn,'Delivered',()=>put(dOn?(o.awb||aw.value.trim()?'shipped':''):'delivered',[t1,t2,rb]));
        t2=tick(pOn,'Cash received',()=>put(pOn?'delivered':'paid',[t1,t2,rb]));
        rb=el('button',{type:'button',class:'btn',style:'font-size:12px;padding:6px 8px;min-height:32px',text:rt?'Undo RTO':'↩ RTO',title:'Parcel came back (returned)',onclick:()=>put(rt?(o.awb||aw.value.trim()?'shipped':''):'returned',[t1,t2,rb])});
        const sv=el('button',{class:'btn primary',type:'button',text:'Save',title:'Save tracking no.',onclick:async()=>{
          sv.disabled=true;try{const cs=aw.value.trim()&&!codSt(o)?'shipped':(o.codStatus||'');const j=await call('setCod',{adminPin,id:o.id,codStatus:cs,courier:COD_COURIER,awb:aw.value});Object.assign(o,j.order||{codStatus:cs,courier:COD_COURIER,awb:aw.value.trim().toUpperCase()});toast((o.orderNo||'Order')+' saved');draw()}
          catch(e){toast(/Unknown action|No access/i.test(e.message)?'Update the sheet script (Code.gs) first.':'Could not save: '+e.message);sv.disabled=false}}});
        return el('tr',{class:codSt(o)==='paid'?'sent':''},el('td',{class:'mono',text:dm(o.date)}),el('td',{class:'mono',text:o.orderNo||''}),el('td',{text:o.customer||'—'}),el('td',{class:'mono',text:o.phone||''}),
          el('td',{text:[o.district,o.pincode].filter(Boolean).join(' ')}),el('td',{text:nm(o.staffId)}),el('td',{class:'mono',style:'font-weight:700',text:amt(o)?rs(amt(o)):'—'}),
          el('td',{},cr),el('td',{style:'white-space:nowrap'},aw,scb,sv),el('td',{},t1),el('td',{},t2),el('td',{style:'white-space:nowrap'},rb,trackBtns(o),ipBadge(o),ipCheckBtn(o,draw)))})))):el('div',{class:'empty',text:'No COD orders here.'});
    const cours=[...new Set(COURIERS.concat(all.map(o=>o.courier).filter(Boolean)))];
    box.replaceChildren(...[el('datalist',{id:'dl-cour'},...cours.map(c=>el('option',{value:c}))),chips,el('div',{class:'row'},qI,xl),tbl,rows.length>400?el('p',{class:'hint',text:'Showing first 400. Search to narrow.'}):null].filter(Boolean))};
  draw();
  const list=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'COD orders'}),el('div',{class:'row'},ipSyncBtn(),el('button',{class:'btn',type:'button',text:'📮 Shipping charge',onclick:()=>ipTariffSheet()}),el('button',{class:'btn primary',type:'button',text:'📄 Read slip photos',onclick:slipReader}))),el('p',{class:'hint',text:'All COD orders go by India Post. Scan or type the tracking no. and Save. Then tick ① Delivered when the customer gets the parcel (cash is now with the post office), and ② Cash received when the post office pays the money to us.'}),box);
  return[head,kpis,courP,list].filter(Boolean);
}
/* Daily sold — which products were sold on a day and by whom (for Mashida's daily count; admin sees it too) */
let dslDay=null;
function viewDailySold(){
  if(!dslDay)dslDay=todayStr;
  const day=dslDay, R0=rpData({preset:'custom',from:day,to:day});
  const go=d=>{if(d>todayStr)return;dslDay=d;renderAdmin()};
  const head=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Daily sold · '+dm(day)}),
    el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'◀ Prev day',onclick:()=>go(addDays(day,-1))}),
      el('input',{id:'dsl-d',type:'date','aria-label':'Day',value:day,max:todayStr,onchange:e=>e.target.value&&go(e.target.value)}),
      el('button',{class:'btn',type:'button',text:'Next day ▶',disabled:day>=todayStr,onclick:()=>go(addDays(day,1))}),
      day!==todayStr?el('button',{class:'btn',type:'button',text:'Today',onclick:()=>go(todayStr)}):null,
      el('button',{class:'btn',type:'button',text:'Reload',onclick:()=>{delete rpCache[day.slice(0,7)];renderAdmin()}}))));
  if(R0.loading)return[head,el('div',{class:'empty',text:'Loading…'})];
  const os=(R0.orders||[]).filter(o=>o.date===day), lines=orderLines(os);
  if(!os.length)return[head,el('div',{class:'empty',text:'No orders saved for '+dm(day)+'.'})];
  const nm=id=>(staff.find(s=>s.id===id)||{name:id||'—'}).name;
  const sids=[...new Set(os.map(o=>o.staffId))].sort((a,b)=>nm(a).localeCompare(nm(b)));
  const pname=o=>(pkey(o.product)||'(NO PRODUCT)')+(o.type==='affordable'?' (A)':' (P)');
  const g={};lines.forEach(o=>{const k=pname(o);g[k]=g[k]||{};g[k][o.staffId]=(g[k][o.staffId]||0)+(+o.qty||1)});
  const prods=Object.keys(g).sort((a,b)=>{const ta=Object.values(g[a]).reduce((x,y)=>x+y,0),tb=Object.values(g[b]).reduce((x,y)=>x+y,0);return tb-ta||a.localeCompare(b)});
  const rowT=k=>sids.reduce((t,id)=>t+(g[k][id]||0),0), colT=id=>prods.reduce((t,k)=>t+(g[k][id]||0),0), all=prods.reduce((t,k)=>t+rowT(k),0);
  const prem=os.filter(o=>o.type!=='affordable').length;
  const stat=(v,l)=>el('div',{class:'kpi'},el('span',{text:l}),el('b',{class:'mono',text:String(v)}));
  const kpis=el('div',{class:'panel'},el('div',{class:'kpis'},stat(os.length,'Orders'),stat(all,'Pieces sold'),stat(prem,'Premium orders'),stat(os.length-prem,'Affordable orders'),stat(os.filter(o=>o.payment==='prepaid').length,'Prepaid'),stat(os.filter(o=>o.payment==='cod').length,'COD'),stat(sids.length,'Staff who sold')));
  const ordN=id=>os.filter(o=>o.staffId===id).length;
  const grid=el('div',{class:'panel'},el('h3',{text:'Products × staff'}),el('p',{class:'hint',text:'Pieces sold of each product, by who sold it. (P) = Premium, (A) = Affordable.'}),
    el('div',{class:'scroll'},el('table',{},
      el('thead',{},el('tr',{},el('th',{text:'Product'}),...sids.map(id=>el('th',{text:nm(id)})),el('th',{text:'Total'}))),
      el('tbody',{},...prods.map(k=>el('tr',{},el('th',{text:k}),...sids.map(id=>el('td',{class:'mono',text:g[k][id]?String(g[k][id]):'—'})),el('td',{class:'mono',style:'font-weight:700',text:String(rowT(k))})))),
      el('tfoot',{},el('tr',{},el('th',{text:'Total pieces'}),...sids.map(id=>el('td',{class:'mono',text:String(colT(id))})),el('td',{class:'mono',text:String(all)})),
        el('tr',{},el('th',{text:'Orders'}),...sids.map(id=>el('td',{class:'mono',text:String(ordN(id))})),el('td',{class:'mono',text:String(os.length)}))))));
  const txt=()=>['DAILY SOLD · '+dm(day),'Orders: '+os.length+' · Pieces: '+all,'Prepaid: '+os.filter(o=>o.payment==='prepaid').length+' · COD: '+os.filter(o=>o.payment==='cod').length,'',...prods.map(k=>k+': '+rowT(k)+'  ('+sids.filter(id=>g[k][id]).map(id=>nm(id)+' '+g[k][id]).join(', ')+')'),'',
    'BY STAFF',...sids.map(id=>nm(id)+': '+ordN(id)+' orders, '+colT(id)+' pieces')].join('\n');
  const copyB=el('button',{class:'btn primary',type:'button',text:'Copy count (for WhatsApp)',onclick:async()=>{try{await navigator.clipboard.writeText(txt());toast('Copied')}catch(e){prompt('Copy this:',txt())}}});
  const list=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Orders of the day · '+os.length}),copyB),
    el('div',{class:'scroll'},el('table',{},
      el('thead',{},el('tr',{},...['No.','Staff','Customer','Product','Qty','Type','Payment','District'].map(t=>el('th',{text:t})))),
      el('tbody',{},...lines.slice().sort((a,b)=>nm(a.staffId).localeCompare(nm(b.staffId))||String(a.orderNo||'').localeCompare(String(b.orderNo||''))).map(o=>el('tr',{},
        el('td',{class:'mono',text:o.orderNo||''}),el('td',{text:nm(o.staffId)}),el('td',{text:o.customer||'—'}),el('td',{text:o.product||'—'}),
        el('td',{class:'mono',text:String(+o.qty||1)}),el('td',{text:o.type==='affordable'?'Affordable':'Premium'}),el('td',{text:payTxt(o)}),el('td',{text:o.district||''})))))));
  return[head,kpis,grid,list];
}
function viewDashboard(onlyDisp){
  const R0=rpData(dsh);
  const presets=[['today','Today'],['yesterday','Yesterday'],['week','Last 7 days'],['month','This month'],['lastmonth','Last month'],['year','This year'],['lastyear','Last year'],['custom','Pick dates']];
  const ps=el('select',{id:'ds-p','aria-label':'Period',onchange:e=>{dsh.preset=e.target.value;if(dsh.preset==='custom'&&!dsh.from){dsh.from=R0.f;dsh.to=R0.t}renderAdmin()}},...presets.map(([v,t])=>el('option',{value:v,text:t,selected:dsh.preset===v})));
  const ready=!R0.loading&&!R0.tooLong, D=ready?dashData(R0):null;
  const head=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:(onlyDisp?'Dispatch · ':'Dashboard · ')+rpLabel(R0.f,R0.t)}),el('div',{class:'row'},ps,
      el('button',{class:'btn',type:'button',text:'Reload',onclick:()=>{rpMonths(R0.f,R0.t).forEach(m=>delete rpCache[m]);renderAdmin()}}))),
    dsh.preset==='custom'?el('div',{class:'form2'},
      el('label',{class:'f',for:'ds-f'},'From',el('input',{id:'ds-f',type:'date',value:dsh.from,max:todayStr,onchange:e=>{dsh.from=e.target.value;renderAdmin()}})),
      el('label',{class:'f',for:'ds-t'},'To',el('input',{id:'ds-t',type:'date',value:dsh.to,max:todayStr,onchange:e=>{dsh.to=e.target.value;renderAdmin()}}))):null,
    onlyDisp?null:el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Download Excel',disabled:!ready,onclick:()=>dashXlsx(D)})));
  if(R0.tooLong)return[head,el('div',{class:'empty',text:'Pick up to 12 months at a time.'})];
  if(!ready)return[head,el('div',{class:'empty',text:'Loading…'})];
  const pc=(a,b)=>b?Math.round(a/b*100)+'%':'';
  const stat=(v,l,sub,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
  const elapsed=D.days.filter(ds=>ds<=todayStr).length||1;
  const kpis=el('div',{class:'kpis'},
    stat(D.total,'Orders placed',D.days.length>1?(D.total/elapsed).toFixed(1)+' per day':''),
    stat(rs(D.sales),'Sales',D.total?'avg '+rs(D.sales/D.total)+' / order':''),
    stat(D.p,'Premium',pc(D.p,D.total)),stat(D.a,'Affordable',pc(D.a,D.total)),
    stat(D.dispatched,'Dispatched',pc(D.dispatched,D.total)+' of orders'),
    stat(D.total-D.dispatched,'Not dispatched','waiting',D.total-D.dispatched?'warnk':''),
    stat(D.print.pieces,'Printed pieces',D.print.orders?D.print.orders+' order nos':''),
    stat(D.print.reprints.length,'Reprints',D.print.damage?D.print.damage+' damage':'',D.print.reprints.length?'warnk':''),
    D.leads?stat(pc(D.total,D.leads),'Conversion',D.leads+' leads'):null);
  const head2=el('div',{class:'panel'},kpis,
    D.os.some(o=>!+o.amount)?el('p',{class:'hint',text:D.os.filter(o=>!+o.amount).length+' orders have no amount written, so sales ₹ is lower than real.'}):null);
  /* sales staff */
  const staffP=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Orders placed by each sales person'}),legend()),
    D.total?hBars(D.per.map(r=>[r.s.name,r.p,r.a]),true):el('div',{class:'empty',text:'No orders in this period.'}),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Staff','Leads','Premium','Affordable','Orders','Share','Dispatched','Sales'].map(t=>el('th',{text:t})))),
      el('tbody',{},...D.per.map(r=>el('tr',{},el('th',{text:r.s.name}),...[r.leads||'—',r.p,r.a,r.p+r.a].map(v=>el('td',{class:'mono',text:String(v)})),
        el('td',{class:'mono',text:pc(r.p+r.a,D.total)||'—'}),el('td',{class:'mono',text:r.sent+' / '+(r.p+r.a)}),el('td',{class:'mono',text:rs(r.amt)})))),
      el('tfoot',{},el('tr',{},el('th',{text:'Total'}),...[D.leads||'—',D.p,D.a,D.total,'100%',D.dispatched+' / '+D.total,rs(D.sales)].map(v=>el('td',{class:'mono',text:String(v)})))))));
  /* week-by-week (one month) or month-by-month (longer) — same layout as the order sheet */
  const ks=D.bucketKeys, sub=['P','A','Total'];
  const brow=(name,get)=>{const cells=[];let mp=0,ma=0;ks.forEach(k=>{const x=get(k);mp+=x.p;ma+=x.a;cells.push(x.p,x.a,x.p+x.a)});cells.push(mp,ma,mp+ma);
    return el('tr',{},el('th',{text:name}),...cells.map((v,i)=>el('td',{class:'mono'+(i%3===2?' wt':'')+(i>=ks.length*3?' me':' b'+(Math.floor(i/3)%4)),text:String(v)})))};
  const sumK=k=>D.people.reduce((t,s)=>{const x=D.bk[s.id+'|'+k]||{p:0,a:0};return{p:t.p+x.p,a:t.a+x.a}},{p:0,a:0});
  const bucketP=D.days.length>7?el('div',{class:'panel'},el('h3',{text:D.oneMonth?'Week by week':'Month by month'}),
    el('p',{class:'hint',text:'P = Premium, A = Affordable — same as the monthly order sheet.'}),
    el('div',{class:'scroll'},el('table',{class:'wk'},
      el('thead',{},el('tr',{},el('th',{rowspan:'2',text:'Staff'}),...ks.map((k,j)=>el('th',{colspan:'3',class:'wh h'+(j%4),text:D.bLabel(k)})),el('th',{colspan:'3',class:'wh me-h',text:'Total'})),
        el('tr',{},...[...ks,'t'].flatMap((k,i)=>sub.map(s=>el('th',{class:i===ks.length?'me-h':'h'+(i%4),text:s}))))),
      el('tbody',{},...D.people.map(s=>brow(s.name,k=>D.bk[s.id+'|'+k]||{p:0,a:0}))),
      el('tfoot',{},brow('Total',sumK)))),
    hBars(ks.map(k=>{const x=sumK(k);return[D.oneMonth?WEEKS[k][2]:monLabel(k),x.p,x.a]}),true)):null;
  /* orders over time */
  const cols=D.byMonth?rpMonths(D.f,D.t).map(m=>{const x=D.os.filter(o=>o.date.slice(0,7)===m);const p=x.filter(D.isP).length;return{label:MON[+m.slice(5)-1],p,a:x.length-p,tip:monLabel(m)+': '+p+' premium, '+(x.length-p)+' affordable'}})
    :D.days.map(ds=>{const b=D.byDay[ds]||{p:0,a:0},dt=new Date(ds+'T12:00:00');return{label:String(+ds.slice(8)),p:b.p,a:b.a,sun:dt.getDay()===0,tip:dm(ds)+': '+b.p+' premium, '+b.a+' affordable'}});
  const timeP=D.days.length>1?el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:D.byMonth?'Orders per month':'Orders per day'}),legend()),el('div',{class:'scroll chartscroll'},colChart(cols))):null;
  /* dispatch — filter by staff / status / search, tick right here */
  const nm=id=>(staff.find(s=>s.id===id)||{name:id}).name;
  const dispList=el('div',{class:'displist'});
  const drawDisp=()=>{
    const F=dspF, q=F.q.trim().toUpperCase();
    const base=D.os.filter(o=>(!F.staff||o.staffId===F.staff)&&(!q||[o.orderNo,o.customer,o.phone,o.district,o.product].some(v=>String(v||'').toUpperCase().includes(q))));
    const pendN=base.filter(o=>!D.sent(o)).length, doneN=base.length-pendN;
    const rows=base.filter(o=>F.show==='all'||(F.show==='pending')===!D.sent(o)).sort((a,b)=>F.show==='done'?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
    const chip=(on,txt,fn)=>el('button',{type:'button',class:'fchip'+(on?' on':''),text:txt,onclick:fn});
    const staffChips=el('div',{class:'fchips'},chip(!F.staff,'All staff ('+D.os.filter(o=>!D.sent(o)).length+' left)',()=>{F.staff='';drawDisp()}),
      ...D.per.filter(r=>r.p+r.a).map(r=>{const left=r.p+r.a-r.sent;return chip(F.staff===r.s.id,r.s.name+' ('+left+' left)',()=>{F.staff=r.s.id;drawDisp()})}));
    const showChips=el('div',{class:'fchips'},chip(F.show==='pending','Not dispatched ('+pendN+')',()=>{F.show='pending';drawDisp()}),chip(F.show==='done','Dispatched ('+doneN+')',()=>{F.show='done';drawDisp()}),chip(F.show==='all','All ('+base.length+')',()=>{F.show='all';drawDisp()}));
    const qI=el('input',{id:'dsp-q',type:'search',placeholder:'Search order no, customer, phone…',value:F.q,oninput:e=>{F.q=e.target.value;clearTimeout(drawDisp._t);drawDisp._t=setTimeout(()=>{drawDisp();const i=$('#dsp-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},250)}});
    const tickAll=rows.length&&F.show==='pending'?el('button',{class:'btn',type:'button',text:'Tick all '+rows.length+' shown as dispatched',onclick:async e=>{
      if(!confirm('Mark these '+rows.length+' orders as dispatched?'))return;e.target.disabled=true;let ok=0;
      for(const o of rows){try{await call('setDispatched',{adminPin,id:o.id,value:true});o.dispatched='TRUE';ok++}catch(x){}}
      toast(ok+' marked dispatched');renderAdmin()}}):null;
    const tbl=rows.length?el('div',{class:'scroll'},el('table',{class:'disptbl'},
      el('thead',{},el('tr',{},...['Dispatched','Date','No.','Customer','Phone','Staff','Product','District','Amount','Payment','Courier · Tracking no.'].map(t=>el('th',{text:t})))),
      el('tbody',{},...rows.slice(0,400).map(o=>{const cb=el('input',{type:'checkbox',class:'bigcb','aria-label':'Dispatched '+(o.orderNo||'')});cb.checked=D.sent(o);
        const tr=el('tr',{class:D.sent(o)?'sent':''},el('td',{},el('label',{class:'cbwrap'},cb,el('span',{text:D.sent(o)?'Sent':'Tick'}))),el('td',{class:'mono',text:dm(o.date)}),el('td',{class:'mono',text:o.orderNo||''}),el('td',{text:o.customer||'—'}),el('td',{class:'mono',text:o.phone||''}),
          el('td',{text:nm(o.staffId)}),el('td',{text:(o.product||'—')+(o.type==='affordable'?' (A)':'')}),el('td',{text:o.district||''}),el('td',{class:'mono',text:+o.amount?rs(+o.amount):'—'}),el('td',{style:o.payment==='cod'?'font-weight:700':'',text:payTxt(o)}),el('td',{},trackCell(o,()=>{cb.checked=true;tr.classList.add('sent');cb.nextSibling.textContent='Sent'})));
        cb.onchange=async()=>{cb.disabled=true;try{await call('setDispatched',{adminPin,id:o.id,value:cb.checked});o.dispatched=cb.checked?'TRUE':'FALSE';tr.classList.toggle('sent',cb.checked);cb.nextSibling.textContent=cb.checked?'Sent':'Tick';toast(cb.checked?(o.orderNo||'Order')+' dispatched':(o.orderNo||'Order')+' marked not sent')}catch(e){cb.checked=!cb.checked;toast('Could not save.')}cb.disabled=false};
        return tr})))):el('div',{class:'empty',text:F.show==='pending'?'Nothing left to dispatch here. ✓':'No orders match.'});
    dispList.replaceChildren(...[staffChips,showChips,el('div',{class:'row'},qI,tickAll),tbl,rows.length>400?el('p',{class:'hint',text:'Showing first 400. Pick a staff or search to narrow.'}):null].filter(Boolean))};
  drawDisp();
  const dispP=el('div',{class:'panel',id:'dispatch'},el('div',{class:'toolbar'},el('h3',{text:'Dispatch'}),legend('Dispatched','Not dispatched')),
    D.total?hBars(D.per.filter(r=>r.p+r.a).map(r=>[r.s.name,r.sent,r.p+r.a-r.sent]),true):el('div',{class:'empty',text:'No orders in this period.'}),
    D.total?dispList:null);
  /* printing (Jaseera's daily work) */
  const P=D.print;
  const printP=el('div',{class:'panel'},el('h3',{text:'Printing'}),
    P.any?el('div',{class:'kpis'},stat(P.pieces,'Pieces printed'),stat(P.orders,'Order nos printed'),stat(P.received,'Orders received'),stat(P.reprints.length,'Reprints','',P.reprints.length?'warnk':''),stat(P.damage,'Damage'),stat(P.washing,'Washing'),
      P.bal?stat(+P.bal.value||0,'Balance to print','on '+dm(P.bal.date)):null):el('div',{class:'empty',text:'No printing work saved in this period.'}),
    P.items.length?el('h3',{class:'sub',text:'Printed by product'}):null,P.items.length?hBars(P.items.map(([c,q])=>[CODE_NAMES[c]||c,q]),false):null,
    D.days.length>1&&Object.keys(P.pDay).length&&!D.byMonth?el('div',{class:'scroll chartscroll'},colChart(D.days.map(ds=>({label:String(+ds.slice(8)),p:P.pDay[ds]||0,a:0,sun:new Date(ds+'T12:00:00').getDay()===0,tip:dm(ds)+': '+(P.pDay[ds]||0)+' printed'})),true)):null,
    P.reprints.length?el('details',{},el('summary',{text:'Reprint order numbers ('+P.reprints.length+')'}),el('p',{class:'hint',text:P.reprints.map(r=>dm(r.date)+' '+r.no).join(' · ')})):null,
    P.remarks.length?el('details',{},el('summary',{text:'Printing remarks ('+P.remarks.length+')'}),el('p',{class:'hint',text:P.remarks.map(r=>dm(r.date)+': '+r.value).join(' · ')})):null);
  const cnt=(key,src)=>{const g={};(src||D.os).forEach(o=>{const k=key(o);if(k)g[k]=(g[k]||0)+(+o.qty||1)});return Object.entries(g).sort((a,b)=>b[1]-a[1]).slice(0,8)};
  const prodP=el('div',{class:'panel'},el('h3',{text:'Top products sold'}),hBars(cnt(o=>{const c=prodCode(o);return c?(CODE_NAMES[c]||c):''},orderLines(D.os)),false));
  const distP=el('div',{class:'panel'},el('h3',{text:'Top districts'}),hBars(cnt(o=>String(o.district||'').trim().toUpperCase()),false));
  const ph={};D.os.forEach(o=>{const k=String(o.phone||'').replace(/\D/g,'').slice(-10);if(k.length>=10)(ph[k]=ph[k]||[]).push(o)});
  const rep=Object.values(ph).filter(l=>l.length>1);
  const repP=rep.length?el('div',{class:'panel'},el('h3',{text:'Repeat customers ('+rep.length+')'}),el('details',{},el('summary',{text:'Show list'}),el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Customer','Phone','Orders','Sales'].map(t=>el('th',{text:t})))),
    el('tbody',{},...rep.sort((a,b)=>b.length-a.length).map(l=>el('tr',{},el('th',{text:l[0].customer||'—'}),el('td',{class:'mono',text:l[0].phone||''}),
      el('td',{class:'mono',text:String(l.length)}),el('td',{class:'mono',text:rs(l.reduce((t,o)=>t+(+o.amount||0),0))})))))))):null;
  /* day grid in the same layout as the MONTH-ODERS sheet: dates across, PREMIUM / AFFORDABLE under each date, staff down */
  const gDays=D.days.length<=62?D.days:[];
  const gc=(v,cls)=>el('td',{class:'mono '+cls,text:v?String(v):''});
  const gridP=gDays.length>1&&D.total?el('div',{class:'panel'},el('h3',{text:(D.oneMonth?'MONTH-ODERS-'+MON[+D.f.slice(5,7)-1].toUpperCase()+'-'+D.f.slice(0,4):'Day by day')}),
    el('p',{class:'hint',text:'Same as the order sheet. Blue = Premium, white = Affordable. Scroll sideways to see all dates.'}),
    el('div',{class:'scroll'},el('table',{class:'sheetg'},
      el('thead',{},el('tr',{},el('th',{class:'stk',text:'DATE'}),...gDays.map(ds=>el('th',{colspan:'2',class:'dh'+(isHoliday(ds)?' hd':''),title:holName(ds),text:D.oneMonth?String(+ds.slice(8)):dm(ds)}))),
        el('tr',{},el('th',{class:'stk'}),...gDays.flatMap(()=>[el('th',{class:'vp'},el('span',{text:'PREMIUM'})),el('th',{class:'va'},el('span',{text:'AFFORDOBLE'}))]))),
      el('tbody',{},...D.people.map(s=>el('tr',{},el('th',{class:'stk',text:s.name.toUpperCase()}),...gDays.flatMap(ds=>{const g=D.grid[s.id+'|'+ds]||{};return[gc(g.p,'cp'),gc(g.a,'ca')]})))),
      el('tfoot',{},el('tr',{},el('th',{class:'stk',text:'TOTAL'}),...gDays.flatMap(ds=>{const b=D.byDay[ds]||{};return[gc(b.p,'cp'),gc(b.a,'ca')]}))))),
    el('details',{},el('summary',{text:'Day list with printing'}),el('div',{class:'scroll'},el('table',{},
      el('thead',{},el('tr',{},el('th',{text:'Date'}),el('th',{text:'Orders'}),el('th',{text:'Premium'}),el('th',{text:'Affordable'}),el('th',{text:'Printed'}))),
      el('tbody',{},...gDays.filter(ds=>ds<=todayStr||D.byDay[ds]).map(ds=>{const dt=new Date(ds+'T12:00:00'),b=D.byDay[ds]||{p:0,a:0};
        return el('tr',{class:isHoliday(ds)?'sun':''},el('th',{},el('span',{class:'mono',text:dm(ds)}),' '+DAYS[dt.getDay()].slice(0,3)+(holidays[ds]?' · '+holidays[ds]:'')),
          el('td',{class:'mono',text:String(b.p+b.a)}),el('td',{class:'mono',text:String(b.p)}),el('td',{class:'mono',text:String(b.a)}),el('td',{class:'mono',text:P.pDay[ds]?String(P.pDay[ds]):'—'}))})))))):null;
  if(onlyDisp)return[head,dispP];
  return[head,viewWeek(),head2,staffOne(R0),staffP,bucketP,gridP,timeP,dispP,printP,el('div',{class:'split'},prodP,distP),repP];
}
/* dashboard: one staff at a time — attendance, hours, overtime, orders/leads, work — for the chosen period */
let dshStaff='';
function staffOne(R0){
  const B=rpBuild(R0);
  const people=[...staff].sort(byOrder).filter(s=>s.active!==false||R0.att.some(r=>r.staffId===s.id)||R0.orders.some(o=>o.staffId===s.id)||R0.work.some(w=>w.staffId===s.id));
  if(!people.length)return null;
  if(!people.some(s=>s.id===dshStaff))dshStaff=people[0].id;
  const s=people.find(x=>x.id===dshStaff);
  const chips=el('div',{class:'fchips'},...people.map(x=>el('button',{type:'button',class:'fchip'+(x.id===dshStaff?' on':''),text:x.name,onclick:()=>{dshStaff=x.id;renderAdmin()}})));
  const stat=(v,l,sub,cls)=>el('div',{class:'kpi'+(cls?' '+cls:'')},el('span',{text:l}),el('b',{class:'mono',text:String(v)}),sub?el('small',{text:sub}):null);
  const att=R0.att.filter(r=>r.staffId===s.id), byDay={};att.forEach(r=>byDay[r.date]=r);
  const past=R0.days.filter(ds=>ds<todayStr&&!isHoliday(ds));
  const absent=past.filter(ds=>!byDay[ds]).length;
  let mins=0,ot=0,full=0,half=0;att.forEach(r=>{if(r.status==='leave'||r.status==='wfh')return;const a=inMin(r.in,r.date),b=toMin(r.out);if(a!=null&&b!=null){mins+=b-a;b-a>=360?full++:half++}ot+=otMin(r)});
  const A=B.att.find(x=>x.s.id===s.id)||{present:0,wfh:0,leave:0,late:0,early:0,noOut:0};
  const attK=el('div',{class:'kpis'},stat(A.present,'Came',full+' full · '+half+' half'),stat(A.wfh,'Work from home'),stat(A.leave,'Leave'),stat(absent,'Absent','no IN, not leave',absent?'warnk':''),
    stat(A.late,'Late',A.late?'gave a reason':'',A.late?'warnk':''),stat(A.early,'Left early','',A.early?'warnk':''),stat(fmtMin(mins)||'0h 00m','Hours worked',(full+half)?'avg '+fmtMin(Math.round(mins/(full+half)))+' / day':''),
    stat(ot?fmtMin(ot):'—','Overtime','beyond '+adminMinH+' h a day'),A.noOut?stat(A.noOut,'No OUT','fix in Register','warnk'):null);
  const S=B.sales.find(x=>x.s.id===s.id);
  const os=R0.orders.filter(o=>o.staffId===s.id), sent=os.filter(o=>String(o.dispatched).toUpperCase()==='TRUE').length;
  const salesK=S&&(S.n||S.leads||s.sales)?el('div',{},el('h3',{class:'sub',text:'Sales'}),el('div',{class:'kpis'},stat(S.n,'Orders',S.p+' premium · '+S.a+' affordable'),stat(rs(S.amt),'Sales',S.n?'avg '+rs(S.amt/S.n):''),
    stat(S.leads||'—','Leads'),S.leads?stat(Math.round(S.n/S.leads*100)+'%','Conversion'):null,stat(sent+' / '+S.n,'Dispatched','',S.n-sent?'warnk':''),
    stat(past.length?(S.n/Math.max(1,past.filter(ds=>byDay[ds]&&byDay[ds].status!=='leave').length)).toFixed(1):'—','Orders per working day')),
    S.prods.length?el('p',{class:'hint',text:'Products: '+S.prods.slice(0,10).map(x=>(CODE_NAMES[x.c]||x.c).toLowerCase()+' '+x.q).join(', ')}):null):null;
  const W=B.work.find(x=>x.s.id===s.id);
  const workK=W&&W.totals.some(t=>t.total)?el('div',{},el('h3',{class:'sub',text:'Work done'}),el('div',{class:'kpis'},...W.totals.filter(t=>t.total&&t.t.kind!=='text').map(t=>stat(t.total,t.t.name,t.parts?t.parts.slice(0,4).map(([c,q])=>c.toLowerCase()+' '+q).join(', '):''))),
    W.missing.length?el('p',{class:'hint',text:'Came but saved no work on: '+W.missing.map(dm).join(', ')}):null,
    ...W.totals.filter(t=>t.notes&&t.notes.length).map(t=>el('details',{},el('summary',{text:t.t.name+' ('+t.notes.length+')'}),el('p',{class:'hint',text:t.notes.map(([d,v])=>dm(d)+': '+v).join(' · ')})))):null;
  const wk={};R0.work.filter(w=>w.staffId===s.id&&w.value!=='').forEach(w=>{const t=tasks.find(x=>x.id===w.taskId);if(!t||t.kind==='text')return;const v=t.kind==='yesno'?(w.value==='TRUE'?'✓':''):(t.kind==='colours'||t.kind==='items')?colTotal(w.value):w.value;if(v!==''&&v!==0)(wk[w.date]=wk[w.date]||[]).push(t.name+' '+v)});
  const rows=R0.days.filter(ds=>ds<=todayStr).slice().reverse().map(ds=>{const dt=new Date(ds+'T12:00:00'),r=byDay[ds],n=os.filter(o=>o.date===ds).length;let st,cls='',hrs='',o='';
    if(!r){st=isHoliday(ds)?(holidays[ds]||'Sunday'):ds===todayStr?'Not in yet':'Absent';cls=isHoliday(ds)||ds===todayStr?'c-hrs':'flag'}
    else if(r.status==='leave')st='Leave';else if(r.status==='wfh')st='Work from home';
    else{const a=inMin(r.in,r.date),b=toMin(r.out);st=t12(r.in)+' – '+(r.out?t12(r.out):'no OUT');if(a!=null&&b!=null){hrs=fmtMin(b-a)+(b-a<360?' (half)':'')}else if(ds!==todayStr)cls='flag';const x=otMin(r);if(x)o=fmtMin(x)}
    const why=r?[r.lateReason?'Late: '+r.lateReason:'',r.earlyReason?'Early: '+r.earlyReason:'',r.note||''].filter(Boolean).join(' · '):'';
    return el('tr',{class:isHoliday(ds)?'sun':''},el('th',{},el('span',{class:'mono',text:dm(ds)}),' '+DAYS[dt.getDay()].slice(0,3)),el('td',{class:'mono '+cls,text:st}),el('td',{class:'mono',text:hrs}),
      el('td',{class:'mono',style:o?'color:#0a7a3d;font-weight:600':'',text:o}),el('td',{class:'mono',text:n?String(n):''}),el('td',{class:'c-hrs',text:(wk[ds]||[]).join(', ')}),el('td',{class:'c-hrs',text:why}))});
  const dayT=el('details',{open:R0.days.length<=7},el('summary',{text:'Day by day'}),el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','In – Out','Hours','OT','Orders','Work','Reason / note'].map(t=>el('th',{text:t})))),el('tbody',{},...rows))));
  return el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Each staff · '+s.name}),el('span',{class:'c-hrs',text:catOf(s)+(s.active===false?' · not on check-in':'')})),
    chips,el('h3',{class:'sub',text:'Attendance'}),attK,salesK,workK,dayT);
}
function dashXlsx(D){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const wb=XLSX.utils.book_new(), label=D.oneMonth?MON[+D.f.slice(5,7)-1].toUpperCase()+'-'+D.f.slice(0,4):D.f+'_to_'+D.t;
  const title='MONTH-ODERS-'+label, days=D.days, n=days.length;
  /* sheet 1: same layout as the order sheet */
  const r2=['DATE'],r3=[''];days.forEach(ds=>{r2.push(D.oneMonth?+ds.slice(8):dm(ds),'');r3.push('PREMIUM','AFFORDABLE')});
  const rows=[[title],r2,r3];
  D.people.forEach(s=>{const r=[s.name.toUpperCase()];days.forEach(ds=>{const g=D.grid[s.id+'|'+ds];r.push(g&&g.p?g.p:'',g&&g.a?g.a:'')});rows.push(r)});
  const tr=['TOTAL'];days.forEach(ds=>{const b=D.byDay[ds];tr.push(b&&b.p?b.p:'',b&&b.a?b.a:'')});rows.push(tr);
  rows.push([],[]);const ws0=rows.length,ks=D.bucketKeys;
  rows.push(['',...ks.flatMap(k=>[(D.oneMonth?WEEKS[k][2]:monLabel(k)).toUpperCase(),'','']),'TOTAL','','']);
  rows.push(['',...[...ks,'t'].flatMap(()=>['PREMIUM','AFFORDABLE','TOTAL'])]);
  const wr=(name,get)=>{const r=[name];let mp=0,ma=0;ks.forEach(k=>{const x=get(k);mp+=x.p;ma+=x.a;r.push(x.p,x.a,x.p+x.a)});r.push(mp,ma,mp+ma);return r};
  D.people.forEach(s=>rows.push(wr(s.name.toUpperCase(),k=>D.bk[s.id+'|'+k]||{p:0,a:0})));
  rows.push(wr('TOTAL',k=>D.people.reduce((t,s)=>{const x=D.bk[s.id+'|'+k]||{p:0,a:0};return{p:t.p+x.p,a:t.a+x.a}},{p:0,a:0})));
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:Math.max(1,n*2)}},...days.map((_,i)=>({s:{r:1,c:1+i*2},e:{r:1,c:2+i*2}})),...[...ks,'t'].map((_,i)=>({s:{r:ws0,c:1+i*3},e:{r:ws0,c:3+i*3}}))];
  ws['!cols']=[{wch:12},...Array(n*2).fill({wch:5})];XLSX.utils.book_append_sheet(wb,ws,'ORDERS');
  const add=(name,aoa)=>{const s=XLSX.utils.aoa_to_sheet(aoa);s['!cols']=(aoa[0]||[]).map((_,i)=>({wch:i?14:22}));XLSX.utils.book_append_sheet(wb,s,name)};
  add('SALES STAFF',[['STAFF','LEADS','PREMIUM','AFFORDABLE','ORDERS','DISPATCHED','NOT DISPATCHED','SALES'],...D.per.map(r=>[r.s.name,r.leads,r.p,r.a,r.p+r.a,r.sent,r.p+r.a-r.sent,r.amt]),['TOTAL',D.leads,D.p,D.a,D.total,D.dispatched,D.total-D.dispatched,D.sales]]);
  const nm=id=>(staff.find(s=>s.id===id)||{name:id}).name;
  add('ALL ORDERS',[['DATE','STAFF','ORDER NO','CUSTOMER','PHONE','DISTRICT','PINCODE','PRODUCT','TYPE','QTY','AMOUNT','DISPATCHED'],...D.os.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(o=>[o.date,nm(o.staffId),o.orderNo||'',o.customer||'',o.phone||'',o.district||'',o.pincode||'',o.product||'',o.type==='affordable'?'AFFORDABLE':'PREMIUM',+o.qty||1,+o.amount||0,D.sent(o)?'YES':'NO'])]);
  const P=D.print;
  add('PRINTING',[['ITEM','COUNT'],['PIECES PRINTED',P.pieces],['ORDER NOS PRINTED',P.orders],['ORDERS RECEIVED',P.received],['REPRINTS',P.reprints.length],['DAMAGE',P.damage],['WASHING',P.washing],['BALANCE TO PRINT (LATEST)',P.bal?+P.bal.value||0:''],[],['PRODUCT','PIECES PRINTED'],...P.items.map(([c,q])=>[CODE_NAMES[c]||c,q]),[],['DATE','REPRINT ORDER NO'],...P.reprints.map(r=>[r.date,r.no])]);
  add('PRINTED BY DAY',[['DATE','PIECES PRINTED'],...days.filter(ds=>P.pDay[ds]).map(ds=>[ds,P.pDay[ds]])]);
  saveFile('COUPLO_DASHBOARD_'+(D.f===D.t?D.f:D.f+'_to_'+D.t)+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT);
}

/* ---------- admin: product list ---------- */
function viewProducts(){
  const cnt={};orderLines(adminOrders).forEach(o=>{const k=o.type+'|'+pkey(o.product);cnt[k]=(cnt[k]||0)+1});
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
let portalTab='auto', portalMonth=null, myTasks=[], myWork=[], workDate=null, hrDate=null;

/* ===================== WEEKLY ARENA (Nov 2026) ===================== */
const SEC_LABEL={Sales:'Sales',Design:'Design',Printing:'Production',Media:'Media',Accounts:'Accounts'};
const CONCEPTS=['Customer review','Unboxing','Name printing','Offer','How to order','Styling','Behind the scenes','Other'];
const medal=i=>i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1);
const ptsTxt=p=>(p>0?'+':'')+p;
function ring(pct,big,sub,col){const r=34,C=2*Math.PI*r,p=Math.max(0,Math.min(1,pct||0));
  return svgBox('<svg viewBox="0 0 88 88" width="88" height="88"><circle cx="44" cy="44" r="'+r+'" fill="none" stroke="var(--sunk)" stroke-width="9"/><circle cx="44" cy="44" r="'+r+'" fill="none" stroke="'+(col||'var(--accent)')+'" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+(C*(1-p)).toFixed(1)+'" transform="rotate(-90 44 44)"/><text x="44" y="46" text-anchor="middle" font-size="17" font-weight="700" fill="var(--ink)">'+big+'</text><text x="44" y="61" text-anchor="middle" font-size="9.5" fill="var(--muted)">'+(sub||'')+'</text></svg>',big+' '+(sub||''))}
function bar(n,t,col){const p=t?Math.min(100,Math.round(n/t*100)):0;return el('div',{style:'height:10px;background:var(--sunk);border-radius:6px;overflow:hidden;margin:6px 0'},el('div',{style:'height:100%;width:'+p+'%;background:'+(col||'var(--accent)')+';border-radius:6px'}))}
const wkLabel=w=>dm(w.from)+' – '+dm(w.to);
let arenaPeriod='week';
const perWord=A=>A.period==='month'?'month':'week';
const monFull=m=>MON[+m.slice(5)-1]+" "+m.slice(0,4);
function periodSeg(onChange){return el('div',{class:'seg',role:'group','aria-label':'Week or month'},...[['week','This week'],['month','This month']].map(([v,t])=>el('button',{type:'button',class:'segbtn'+(arenaPeriod===v?' on':''),'aria-pressed':String(arenaPeriod===v),text:t,onclick:()=>{arenaPeriod=v;onChange()}})))}
function arenaTeam(A){const t=A.team;
  const mo=A.period==='month';
  return el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'🏆 Arena · '+(mo?monFull(A.month):wkLabel(A.week))})),
    mo?el('div',{class:'stats'},el('div',{},el('b',{class:'mono',text:t.month+' / '+t.monthTarget}),el('span',{text:'Team orders this month'})),el('div',{},el('b',{class:'mono',text:String(Math.max(0,t.monthTarget-t.month))}),el('span',{text:'Left for the month'})),el('div',{},el('b',{class:'mono',text:String(t.daysLeft)}),el('span',{text:'Working days left'})))
      :el('div',{class:'stats'},el('div',{},el('b',{class:'mono',text:t.week+' / '+t.weekTarget}),el('span',{text:'Team orders this week'})),el('div',{},el('b',{class:'mono',text:t.month+' / '+t.monthTarget}),el('span',{text:'Team orders this month'})),el('div',{},el('b',{class:'mono',text:String(Math.max(0,t.weekTarget-t.week))}),el('span',{text:'Left for the week'}))),
    mo?bar(t.month,t.monthTarget,t.month>=t.monthTarget?'var(--ok)':'var(--c-aff)'):bar(t.week,t.weekTarget,t.week>=t.weekTarget?'var(--ok)':'var(--c-aff)'))}
function arenaBoardList(A,meId,admin){
  const open={};
  const box=el('div',{class:'panel'},el('h3',{text:'Leaderboard · points this '+perWord(A)}));
  const list=el('div');
  const draw=()=>list.replaceChildren(...A.board.map((r,i)=>{
    const mine=r.id===meId, top=A.board[0]&&A.board[0].pts>0?A.board[0].pts:1;
    const head=el('button',{type:'button',class:'staffrow',style:'width:100%;display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line);border-radius:10px;background:'+(mine?'var(--accent-soft)':'var(--surface)')+';margin-bottom:6px;text-align:left;cursor:pointer;color:var(--ink)',onclick:()=>{open[r.id]=!open[r.id];draw()}},
      el('span',{style:'font-size:20px;width:30px;text-align:center',text:r.pts>0?medal(i):String(i+1)}),
      el('div',{style:'flex:1;min-width:0'},el('div',{style:'font-weight:600',text:r.name+(mine?' (you)':'')}),el('div',{class:'hint',style:'margin:0',text:SEC_LABEL[r.section]+(r.section==='Sales'?' · '+r.month+'/'+r.target+' orders this month':'')}),
        el('div',{style:'height:6px;background:var(--sunk);border-radius:4px;margin-top:4px;overflow:hidden'},el('div',{style:'height:100%;width:'+Math.max(0,Math.round(r.pts/top*100))+'%;background:var(--accent)'}))),
      el('b',{class:'mono',style:'font-size:18px',text:String(r.pts)}));
    const lines=(open[r.id]&&(admin||mine||true))?el('div',{style:'margin:-2px 0 10px 40px'},...(r.lines.length?r.lines.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(l=>el('div',{class:'hint',style:'margin:2px 0;display:flex;gap:8px'},el('span',{class:'mono',text:dm(l.date)}),el('span',{style:'flex:1',text:l.why}),el('b',{class:'mono',style:'color:'+(l.pts<0?'#B3261E':'var(--ok)'),text:ptsTxt(l.pts)}))):[el('div',{class:'hint',text:'No points yet this '+perWord(A)+'. Normal work = 0; points come for work above normal.'})])):null;
    return el('div',{},head,lines)}));
  draw();box.append(list);return box}
function arenaMine(A,meId){
  const r=A.board.find(x=>x.id===meId);if(!r)return el('div',{class:'panel'},el('p',{class:'hint',text:'You are not in the Arena yet. Ask admin to set your section.'}));
  const rank=A.board.indexOf(r);
  const kids=[el('div',{style:'display:flex;gap:16px;align-items:center;flex-wrap:wrap'},
    el('div',{},el('div',{class:'hint',style:'margin:0',text:'My points this '+perWord(A)}),el('div',{style:'font:700 34px var(--f-display)',text:String(r.pts)}),el('div',{class:'hint',style:'margin:0',text:'Rank '+medal(rank)+' of '+A.board.length})),
    r.section==='Sales'?ring(r.month/r.target,String(r.month),'of '+r.target,r.month>=r.target?'var(--ok)':'var(--accent)'):null,
    r.section==='Sales'?el('div',{},el('div',{style:'font-weight:600',text:r.left?r.left+' orders left this month':'🔥 Incentive zone: '+r.incentive+' above target'}),el('div',{class:'hint',style:'margin:2px 0',text:r.left?'Need ~'+r.perDay+' orders a day ('+A.team.daysLeft+' working days left)':'Every order now counts for incentive.'}),el('div',{class:'hint',style:'margin:0',text:'This week: '+r.week+' orders'+(r.conv!=null?' · conversion '+r.conv+'%':'')})):null)];
  return el('div',{class:'panel'},...kids)}

/* ---- staff: media (Rahila) ---- */
function arenaMedia(d,reload){
  const td=ymd(new Date());
  const ds=el('select',{id:'md-d','aria-label':'Date'},...[0,1,2].map(i=>{const x=addDays(td,-i);return el('option',{value:x,text:(i?i===1?'Yesterday':'2 days ago':'Today')+' · '+dm(x)})}));
  const pr=el('select',{id:'md-p'},el('option',{value:'',text:'— Product —'}),...(products||[]).filter(p=>p.active!==false).map(p=>el('option',{value:p.name,text:p.name})));
  const cp=el('select',{id:'md-c'},...CONCEPTS.map(c=>el('option',{value:c,text:c})));
  const tt=el('input',{id:'md-t',type:'text',placeholder:'Short name (optional)',autocomplete:'off'});
  const save=el('button',{class:'btn primary',type:'button',text:'+ Video done',onclick:async()=>{save.disabled=true;try{await call('mediaAdd',{staffId:me.id,pin:me.pin,date:ds.value,product:pr.value,concept:cp.value,title:tt.value});toast('Saved — waiting for admin approval');reload()}catch(e){toast(e.message);save.disabled=false}}});
  const today=(d.media||[]).filter(m=>m.date===td);
  const st={pending:['Pending','chip none'],approved:['Approved','chip in'],reedit:['Re-edit','chip miss']};
  const rows=(d.media||[]).map(m=>{const li=el('input',{type:'url',placeholder:'Instagram link (after posting)',value:m.igLink||'',style:'flex:1;min-width:0'});
    return el('div',{style:'border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px'},
      el('div',{style:'display:flex;justify-content:space-between;gap:8px;align-items:center'},el('div',{},el('b',{text:dm(m.date)+' · '+[m.product,m.concept].filter(Boolean).join(' · ')}),m.title?el('div',{class:'hint',style:'margin:0',text:m.title}):null),el('span',{class:(st[m.status]||st.pending)[1],text:(st[m.status]||st.pending)[0]+(+m.reedits?' · re-edit ×'+m.reedits:'')})),
      el('div',{style:'display:flex;gap:6px;margin-top:8px'},li,el('button',{class:'btn',type:'button',text:'Save link',onclick:async()=>{try{await call('mediaLink',{staffId:me.id,pin:me.pin,id:m.id,igLink:li.value});toast('Link saved')}catch(e){toast(e.message)}}})))});
  return[el('div',{class:'panel'},el('h3',{text:'🎬 My videos · today '+today.filter(m=>m.status==='approved').length+' approved / '+today.length+' added (minimum 2)'}),
      el('div',{class:'form2'},el('label',{class:'f',for:'md-d'},'Date',ds),el('label',{class:'f',for:'md-p'},'Product',pr),el('label',{class:'f',for:'md-c'},'Concept',cp),el('label',{class:'f',for:'md-t'},'Name',tt)),
      el('p',{class:'hint',text:'Post the video in the WhatsApp group with the same name. Admin marks Approved or Re-edit here. Only approved videos count. After posting a reel or post on Instagram, paste its link. Stories are not needed.'}),save),
    el('div',{class:'panel'},el('h3',{text:'Last 30 days'}),rows.length?el('div',{},...rows):el('div',{class:'empty',text:'No videos yet.'}))]}

/* ---- staff: design (Hiba) & production (Jaseera) ---- */
function arenaQueue(d,reload){
  const out=[], nm=id=>{const s=(d.staffNames||[]).find(x=>x.id===id);return s?s.name:id};
  const q=(d.queue||[]).slice().sort((a,b)=>a.date.localeCompare(b.date));
  const rowOf=(o,btn)=>el('tr',{},el('td',{},btn),el('td',{class:'mono',text:dm(o.date)}),el('td',{class:'mono',text:o.orderNo}),el('td',{text:o.product+(o.type==='affordable'?' (A)':'')}),el('td',{text:(o.customer||'')}),el('td',{text:nm(o.staffId)}));
  const tbl=(rows,head)=>rows.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...[head,'Date','No.','Product','Customer','Sales'].map(t=>el('th',{text:t})))),el('tbody',{},...rows))):el('div',{class:'empty',text:'Nothing pending 🎉'});
  if(d.cats.includes('Design')){const todo=q.filter(o=>!o.designDoneAt),notStarted=todo.filter(o=>!o.designStartAt);
    const hm=t=>String(t||'').slice(11,16);
    const startBtn=ids=>async e=>{e.target.disabled=true;try{await call('designStart',{staffId:me.id,pin:me.pin,orderIds:ids});toast(ids.length>1?ids.length+' orders started':'Design started');reload()}catch(x){toast(/Unknown action/i.test(x.message)?'Update the sheet script (Code.gs) first.':x.message);e.target.disabled=false}};
    const doneBtn=o=>el('button',{class:'btn primary',type:'button',text:'Design done',onclick:async e=>{e.target.disabled=true;try{await call('designDone',{staffId:me.id,pin:me.pin,orderId:o.id});toast(o.orderNo+' sent to printing');reload()}catch(x){toast(x.message);e.target.disabled=false}}});
    const cell=o=>o.designStartAt?el('div',{style:'display:flex;gap:6px;align-items:center;white-space:nowrap'},el('span',{class:'chip in',text:'Started '+hm(o.designStartAt)}),doneBtn(o))
      :el('button',{class:'btn',type:'button',text:'▶ Start',onclick:startBtn([o.id])});
    out.push(el('div',{class:'panel'},el('h3',{text:'🎨 Design pending · '+todo.length}),
      el('p',{class:'hint',text:'Work only from this list. Tap ▶ Start when you actually begin a design, and Design done when it goes to printing. Design the same day or next day; late design = −5.'}),
      notStarted.length>1?el('button',{class:'btn',type:'button',style:'margin-bottom:8px',text:'▶ Start all '+notStarted.length,onclick:startBtn(notStarted.map(o=>o.id))}):null,
      tbl(todo.map(o=>rowOf(o,cell(o))),'')))}
  if(d.cats.includes('Printing')){const ready=q.filter(o=>o.designDoneAt),waiting=q.filter(o=>!o.designDoneAt).length;
    out.push(el('div',{class:'panel'},el('h3',{text:'🖨️ Ready to print / dispatch · '+ready.length}),el('p',{class:'hint',text:waiting+' more orders are still with design. Dispatch on the day the design arrives = +2 each.'}),
      tbl(ready.map(o=>rowOf(o,el('button',{class:'btn primary',type:'button',text:'Dispatched',onclick:async e=>{e.target.disabled=true;try{await call('dispatchDone',{staffId:me.id,pin:me.pin,orderId:o.id});toast(o.orderNo+' dispatched');reload()}catch(x){toast(x.message);e.target.disabled=false}}}))),'')))}
  return out}
function arenaIssueForm(d,reload){
  const no=el('input',{id:'is-no',type:'text',placeholder:'Order no.',autocomplete:'off'});
  const kd=el('select',{id:'is-k'},el('option',{value:'reprint',text:'Reprint'}),el('option',{value:'damage',text:'Damaged product'}),el('option',{value:'rework',text:'Rework'}));
  const bl=el('select',{id:'is-b'},el('option',{value:'',text:'Whose mistake? (admin decides)'}),...(d.staffNames||[]).filter(s=>s.section).map(s=>el('option',{value:s.id,text:s.name+' · '+SEC_LABEL[s.section]})));
  const nt=el('input',{id:'is-n',type:'text',placeholder:'What exactly went wrong and why',autocomplete:'off'});
  const go=el('button',{class:'btn',type:'button',text:'Report',onclick:async()=>{if(nt.value.trim().length<10){toast('Write the full reason (at least 10 letters)');nt.focus();return}
    go.disabled=true;try{await call('issueAdd',{staffId:me.id,pin:me.pin,orderNo:no.value,kind:kd.value,blame:bl.value,note:nt.value});toast('Reported — admin will check');reload()}catch(e){toast(e.message);go.disabled=false}}});
  const list=(d.issues||[]).slice(0,10).map(x=>el('div',{class:'hint',style:'margin:2px 0',text:dm(x.date)+' · '+x.orderNo+' · '+x.kind+' · '+(x.note||'')+' · '+x.status}));
  return el('div',{class:'panel'},el('h3',{text:'⚠️ Report reprint / damage / rework'}),el('div',{class:'form2'},el('label',{class:'f',for:'is-no'},'Order',no),el('label',{class:'f',for:'is-k'},'Type',kd),el('label',{class:'f',for:'is-b'},'Mistake by',bl),el('label',{class:'f',for:'is-n'},'Reason',nt)),go,...list)}

/* ---- staff: accounts (Mashida) ---- */
function arenaAccounts(d,reload){
  const td=ymd(new Date()), last=(d.accounts||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
  const ds=el('select',{id:'ac-d'},...[0,1,2].map(i=>{const x=addDays(td,-i);return el('option',{value:x,text:(i?i===1?'Yesterday':'2 days ago':'Today')+' · '+dm(x)})}));
  let banks=[];try{banks=JSON.parse((last[0]||{}).banks||'[]')}catch(e){}if(!banks.length)banks=[{name:'Bank 1',amount:''}];
  const bankBox=el('div');
  const drawBanks=()=>bankBox.replaceChildren(...banks.map((b,i)=>el('div',{style:'display:flex;gap:6px;margin-bottom:6px'},el('input',{type:'text',value:b.name,'aria-label':'Bank name',style:'flex:1;min-width:0',oninput:e=>b.name=e.target.value}),el('input',{type:'number',inputmode:'decimal',value:b.amount,placeholder:'Balance ₹','aria-label':'Balance',style:'width:130px',oninput:e=>b.amount=e.target.value}),el('button',{class:'btn',type:'button',text:'✕','aria-label':'Remove bank',onclick:()=>{banks.splice(i,1);drawBanks()}}))),el('button',{class:'btn',type:'button',text:'+ Bank',onclick:()=>{banks.push({name:'',amount:''});drawBanks()}}));
  const fill=()=>{const r=(d.accounts||[]).find(x=>x.date===ds.value);if(r){try{banks=JSON.parse(r.banks||'[]')}catch(e){}cash.value=r.cash;exp.value=r.expenses;mm.checked=r.mismatch==='TRUE';fx.checked=r.fixed==='TRUE';vd.checked=r.vendors==='TRUE';nt.value=r.note}else{banks.forEach(b=>b.amount='');cash.value='';exp.value='';mm.checked=fx.checked=vd.checked=false;nt.value=''}drawBanks()};
  const cash=el('input',{id:'ac-c',type:'number',inputmode:'decimal'}),exp=el('input',{id:'ac-e',type:'number',inputmode:'decimal'}),nt=el('input',{id:'ac-n',type:'text'});
  const cb=(id,t)=>{const c=el('input',{type:'checkbox',id});return[c,el('label',{for:id,style:'display:flex;gap:8px;align-items:center;margin:6px 0'},c,t)]};
  const [mm,lmm]=cb('ac-m','Mismatch found (bank / cash vs Vyapar)'),[fx,lfx]=cb('ac-f','Mismatch fixed today'),[vd,lvd]=cb('ac-v','Weekly vendor balance checked and reported');
  ds.onchange=fill;
  const save=el('button',{class:'btn primary',type:'button',text:'Submit report',onclick:async()=>{save.disabled=true;try{await call('accountsSave',{staffId:me.id,pin:me.pin,date:ds.value,banks:banks.filter(b=>b.name||b.amount),cash:cash.value,expenses:exp.value,mismatch:mm.checked,fixed:fx.checked,vendors:vd.checked,note:nt.value});toast('Report saved');reload()}catch(e){toast(e.message);save.disabled=false}}});
  fill();
  /* happy customer moments — same layout as the sheet: date × sales staff */
  const hs=(d.salesStaff||[]).filter(s=>s.active!==false||s.id==='fida').sort(byOrder);
  const hd=el('select',{id:'hp-d'},...[0,1,2,3].map(i=>{const x=addDays(td,-i);return el('option',{value:x,text:(i?i+' day'+(i>1?'s':'')+' ago':'Today')+' · '+dm(x)})}));
  const cnt={};const grid=el('div');
  const drawH=()=>{hs.forEach(s=>{const h=(d.happy||[]).find(x=>x.date===hd.value&&x.staffId===s.id);cnt[s.id]=h?+h.count:0});
    grid.replaceChildren(...hs.map(s=>{const v=el('b',{class:'mono',style:'min-width:28px;text-align:center',text:String(cnt[s.id])});const set=k=>{cnt[s.id]=Math.max(0,cnt[s.id]+k);v.textContent=cnt[s.id]};
      return el('div',{style:'display:flex;align-items:center;gap:8px;margin-bottom:6px'},el('span',{style:'flex:1',text:s.name}),el('button',{class:'btn',type:'button',text:'−','aria-label':'Less',onclick:()=>set(-1)}),v,el('button',{class:'btn',type:'button',text:'+','aria-label':'More',onclick:()=>set(1)}))}))};
  hd.onchange=drawH;drawH();
  const hsave=el('button',{class:'btn primary',type:'button',text:'Save happy moments',onclick:async()=>{hsave.disabled=true;try{const j=await call('happySave',{staffId:me.id,pin:me.pin,date:hd.value,counts:cnt});d.happy=j.happy;toast('Saved');hsave.disabled=false}catch(e){toast(e.message);hsave.disabled=false}}});
  const mon=td.slice(0,7),tot={};(d.happy||[]).filter(h=>h.date.indexOf(mon)===0).forEach(h=>tot[h.staffId]=(tot[h.staffId]||0)+(+h.count||0));
  return[el('div',{class:'panel'},el('h3',{text:'🏦 Daily balance report'}),el('label',{class:'f',for:'ac-d'},'Date',ds),el('div',{class:'hint',text:'Bank balances'}),bankBox,
      el('div',{class:'form2'},el('label',{class:'f',for:'ac-c'},'Cash balance ₹',cash),el('label',{class:'f',for:'ac-e'},'Today\'s expenses ₹',exp)),lmm,lfx,lvd,el('label',{class:'f',for:'ac-n'},'Note',nt),
      el('p',{class:'hint',text:'Submit before 5:30 PM every working day. Once submitted, the time is kept even if you correct it later.'}),save),
    el('div',{class:'panel'},el('h3',{text:'😊 Happy customer moments'}),el('label',{class:'f',for:'hp-d'},'Date',hd),grid,hsave,
      el('p',{class:'hint',text:'This month: '+hs.map(s=>s.name+' '+(tot[s.id]||0)).join(' · ')}))]}

/* ---- staff portal tab ---- */
/* ---- sales staff: first screen after login — today and this month against target, in plain words ----
   Today's target = what is still needed for the month ÷ working days left (so it goes up when behind).
   Uses the Arena month numbers (orders, target, leads) and the person's own orders for the day-by-day strip. */
function myDayView(d){
  const box=el('div',{style:'display:flex;flex-direction:column;gap:14px'},el('div',{class:'empty',text:'Loading your day…'}));
  (async()=>{try{
    const a=await call('arenaMe',{staffId:me.id,pin:me.pin,period:'month'}),A=a.arena,td=A.today||d.today;
    const r=A.board.find(x=>x.id===a.me);
    if(!r||r.section!=='Sales'){box.replaceChildren(el('div',{class:'empty',text:'No sales target set for you yet.'}));return}
    const mine=d.month===td.slice(0,7)?d.orders:[];
    const cnt={};mine.forEach(o=>cnt[o.date]=(cnt[o.date]||0)+1);
    const todayN=cnt[td]||0, daysLeft=Math.max(1,A.team.daysLeft||1);
    const mDates=monthDates(td.slice(0,7)), work=mDates.filter(x=>x.getDay()!==0), totalW=work.length||1;
    const base=Math.max(1,Math.ceil(r.target/totalW));                       /* normal day */
    const needToday=r.month>=r.target?base:Math.max(base,Math.ceil((r.left+todayN)/daysLeft)); /* goes up when behind */
    const doneW=work.filter(x=>ymd(x)<td).length, expected=Math.round(r.target*doneW/totalW);
    const sales=A.board.filter(x=>x.section==='Sales').sort((x,y)=>y.month-x.month), rank=sales.findIndex(x=>x.id===r.id)+1;
    const teamL=sales.reduce((t,x)=>t+(x.leads||0),0), teamO=sales.reduce((t,x)=>t+(x.leads?x.month:0),0), teamConv=teamL?Math.round(teamO/teamL*1000)/10:null;
    const card=(tone,big,line,sub)=>el('div',{class:'panel',style:'border-width:2px;border-color:'+(tone==='ok'?'var(--ok)':tone==='warn'?'var(--c-aff)':'var(--line)')+';background:'+(tone==='ok'?'var(--ok-soft)':tone==='warn'?'var(--warn-soft)':'var(--surface)')},
      el('div',{style:'font:700 26px var(--f-display);line-height:1.2',text:big}),el('div',{style:'font-weight:600;font-size:16px',text:line}),sub?el('div',{class:'hint',style:'margin:0',text:sub}):null);
    const hi=['Hi '+r.name.split(' ')[0]+' 👋'];
    /* today */
    const todayCard=todayN>=needToday+3?card('ok','🔥 Outstanding day!',todayN+' orders today, target was '+needToday+'.','You are way above today\'s target. Superb work!')
      :todayN>=needToday?card('ok','🎉 Today\'s target done!',todayN+' of '+needToday+' orders today.','Excellent performance today. Every extra order is a bonus.')
      :card(todayN?'':'warn','Today: '+todayN+' of '+needToday+' orders',(needToday-todayN)+' more order'+(needToday-todayN>1?'s':'')+' to hit today\'s target 💪',needToday>base?'Today\'s target is higher because the month is behind.':'You can do it!');
    /* month */
    const monthMsg=r.month>=r.target?card('ok','🏆 Monthly target crossed!',r.month+' orders this month (target '+r.target+').','+'+r.incentive+' orders in the incentive zone. Amazing work, keep going!')
      :r.month>=expected?card('ok','✅ On track this month',r.month+' of '+r.target+' orders · '+r.left+' left.',(r.month>expected?'Ahead of plan by '+(r.month-expected)+'. ':'')+'Keep ~'+Math.ceil(r.left/daysLeft)+' a day for '+daysLeft+' working days.')
      :card('warn','⚠️ Behind your target',r.month+' of '+r.target+' orders · '+(expected-r.month)+' behind plan.','You need ~'+Math.ceil(r.left/daysLeft)+' orders a day for the next '+daysLeft+' working days to finish the target.');
    const ringRow=el('div',{class:'panel'},el('div',{style:'display:flex;gap:18px;align-items:center;flex-wrap:wrap'},
      ring(r.month/r.target,String(r.month),'of '+r.target,r.month>=r.target?'var(--ok)':'var(--accent)'),
      el('div',{style:'display:flex;flex-direction:column;gap:4px'},
        el('div',{style:'font-weight:600',text:'#'+rank+' in the sales team this month'+(rank===1?' 🥇':rank===2?' 🥈':rank===3?' 🥉':'')}),
        el('div',{class:'hint',style:'margin:0',text:'This week: '+r.week+' orders'}),
        r.conv!=null?el('div',{class:'hint',style:'margin:0',text:'Conversion: '+r.conv+'% of '+r.leads+' leads'+(teamConv!=null?' (team '+teamConv+'%)':'')+(teamConv!=null&&r.conv>=teamConv?' 👍':'')}):null)));
    /* leads: per day this month (from the Leads tab — HR / CRM sync), with orders and conversion */
    const L={},hasL=!!d.myLeads;(d.myLeads||[]).forEach(x=>L[x.date]=(L[x.date]||0)+x.leads);
    const t=new Date(td+'T12:00:00'),mon=new Date(t);mon.setDate(t.getDate()-((t.getDay()+6)%7));const wFrom=ymd(mon),m0=td.slice(0,7);
    const sumL=f=>Object.keys(L).filter(f).reduce((a,k)=>a+L[k],0);
    const lT=L[td]||0,lW=sumL(k=>k>=wFrom&&k<=td),lM=sumL(k=>k.slice(0,7)===m0&&k<=td);
    const cv=(o,l)=>l?Math.round(o/l*1000)/10:null, cvT=(o,l)=>l?cv(o,l)+'%':'—';
    const myConv=cv(r.month,lM);
    let leadsP=null,chartP=null;
    if(hasL){
      const big=(n,lbl,o)=>el('div',{class:'kpi',style:'border-color:var(--accent);background:var(--accent-soft)'},el('span',{text:lbl}),
        el('b',{class:'mono',style:'font-size:34px',text:String(n)}),el('small',{style:'color:var(--ink);font-size:13px',text:'leads'}),
        el('small',{text:o+' order'+(o===1?'':'s')+' · '+cvT(o,n)+' conversion'}));
      const vsTeam=myConv==null||teamConv==null?null:myConv>=teamConv
        ?el('div',{class:'chip',style:'background:var(--ok-soft);color:var(--ok)',text:'✅ Your conversion '+myConv+'% is above the team ('+teamConv+'%)'})
        :el('div',{class:'chip',style:'background:var(--warn-soft);color:var(--warn)',text:'⚠️ Your conversion '+myConv+'% is below the team ('+teamConv+'%)'});
      const tip=myConv!=null&&teamConv!=null&&myConv<teamConv?'Tip: reply to every new lead within 5 minutes, send photos and price quickly, and follow up the same evening.'
        :lT===0?'No leads counted for you yet today.':'';
      leadsP=el('div',{class:'panel',style:'border:2px solid var(--accent)'},el('h3',{text:'📞 My leads'}),
        el('div',{class:'kpis'},big(lT,'Today',todayN),big(lW,'This week',r.week),big(lM,'This month',r.month)),vsTeam,
        tip?el('p',{class:'hint',style:'margin:0',text:tip}):null);
      const mdays=mDates.filter(x=>ymd(x)<=td);
      chartP=el('div',{class:'panel'},el('h3',{text:'Leads per day · '+monFull(m0)}),
        el('div',{class:'scroll chartscroll'},colChart(mdays.map(x=>{const ds=ymd(x);return{label:String(x.getDate()),sun:x.getDay()===0,p:L[ds]||0,a:0,tip:ds+': '+(L[ds]||0)+' leads, '+(cnt[ds]||0)+' orders'}}),true)))}
    /* day by day: leads, orders, conversion, target ✓ — newest first */
    const rowsD=mDates.filter(x=>{const ds=ymd(x);return ds<=td&&(x.getDay()!==0||L[ds]||cnt[ds])}).reverse();
    let streak=0;for(const x of rowsD){const ds=ymd(x);if(x.getDay()===0)continue;if(ds===td&&(cnt[ds]||0)<base)continue;if((cnt[ds]||0)>=base)streak++;else break}
    let best=null;rowsD.forEach(x=>{const ds=ymd(x),l=L[ds]||0,c=cv(cnt[ds]||0,l);if(l>=5&&c!=null&&(!best||c>best.c))best={ds,c}});
    const tbl=el('div',{class:'panel'},el('h3',{text:'Day by day'}),el('div',{class:'scroll'},el('table',{},
      el('thead',{},el('tr',{},...['Day'].concat(hasL?['Leads']:[],['Orders'],hasL?['Conv.']:[],['✓']).map(x=>el('th',{text:x})))),
      el('tbody',{},...rowsD.map(x=>{const ds=ymd(x),l=L[ds]||0,o=cnt[ds]||0,c=cv(o,l),ok=o>=base,isT=ds===td;
        return el('tr',{style:isT?'background:var(--accent-soft)':''},el('th',{},el('span',{class:'mono',text:pad2(x.getDate())}),' '+DAYS[x.getDay()].slice(0,3)),
          ...(hasL?[el('td',{class:'mono',style:'font-weight:700',text:String(l)})]:[]),el('td',{class:'mono',text:String(o)}),
          ...(hasL?[el('td',{class:'mono',style:c!=null&&myConv!=null&&c>=myConv?'color:var(--ok);font-weight:600':'',text:(c!=null?c+'%':'—')+(best&&best.ds===ds?' ⭐':'')})]:[]),
          el('td',{text:x.getDay()===0?'':ok?'✓':isT?'…':'—',style:ok?'color:var(--ok);font-weight:700':''}))})),
      el('tfoot',{},el('tr',{},el('th',{text:'Month'}),...(hasL?[el('td',{class:'mono',text:String(lM)})]:[]),el('td',{class:'mono',text:String(r.month)}),...(hasL?[el('td',{class:'mono',text:cvT(r.month,lM)})]:[]),el('td',{text:''}))))),
      el('div',{class:'hint',style:'margin:0',text:'✓ = '+base+' or more orders. '+(best?'⭐ = your best conversion day. ':'')+(streak>=2?'🔥 '+streak+' good days in a row!':'')}));
    box.replaceChildren(el('div',{style:'font:600 18px var(--f-display);margin:2px 0',text:hi[0]}),todayCard,leadsP,monthMsg,chartP,tbl,ringRow);
  }catch(e){box.replaceChildren(el('div',{class:'empty',text:e.message||'Cannot load'}))}})();
  return[box]}
/* Design / printing staff: their order queue on its own tab (Start → Design done → Dispatched) */
function myDesignView(){
  const box=el('div',{},el('div',{class:'empty',text:'Loading orders…'}));
  const load=async()=>{try{const d=await call('arenaMe',{staffId:me.id,pin:me.pin,period:arenaPeriod});
    box.replaceChildren(...(d.queue?arenaQueue(d,load):[el('div',{class:'empty',text:'No orders.'})]),arenaIssueForm(d,load))}catch(e){box.replaceChildren(el('div',{class:'empty',text:e.message||'Cannot load orders'}))}};
  load();return[box]}
function myArenaView(){
  const box=el('div',{},el('div',{class:'empty',text:'Loading Arena…'}));
  const load=async()=>{try{const d=await call('arenaMe',{staffId:me.id,pin:me.pin,period:arenaPeriod});const A=d.arena;
    const parts=[periodSeg(load),arenaMine(A,d.me),arenaTeam(A)];
    if(d.media)parts.push(...arenaMedia(d,load));
    if(d.accounts)parts.push(...arenaAccounts(d,load));
    parts.push(arenaBoardList(A,d.me,false));
    box.replaceChildren(...parts)}catch(e){box.replaceChildren(el('div',{class:'empty',text:e.message||'Cannot load Arena'}))}};
  load();return[box]}

/* ---- admin tab ---- */
let arenaDay=null;
function viewArena(){
  const box=el('div',{},el('div',{class:'empty',text:'Loading Arena…'}));
  arenaDay=arenaDay||ymd(new Date());
  const load=async()=>{let A;try{A=await call('arenaAdmin',{adminPin,day:arenaDay,period:arenaPeriod})}catch(e){box.replaceChildren(el('div',{class:'empty',text:e.message}));return}
    const nm=id=>{const s=A.staffNames.find(x=>x.id===id);return s?s.name:id||'—'};
    const mo=A.period==='month',mStep=k=>{const d=new Date(A.month+'-01T12:00:00');d.setMonth(d.getMonth()+k);return ymd(d)};
    const nav=el('div',{class:'row'},periodSeg(load),el('button',{class:'btn',type:'button',text:mo?'← Month':'← Week',onclick:()=>{arenaDay=mo?mStep(-1):addDays(A.week.from,-7);load()}}),el('b',{text:mo?monFull(A.month):wkLabel(A.week)}),el('button',{class:'btn',type:'button',text:mo?'Month →':'Week →',onclick:()=>{arenaDay=mo?mStep(1):addDays(A.week.from,7);load()}}));
    const sales=A.board.filter(r=>r.section==='Sales');
    const tbl=el('div',{class:'panel'},el('h3',{text:'Sales targets · '+monFull(A.month)}),el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Staff','Month','Target','Left','Per day','This week','Leads','Conv.','Incentive'].map(t=>el('th',{text:t})))),
      el('tbody',{},...sales.map(r=>el('tr',{},el('td',{text:r.name}),el('td',{class:'mono',text:String(r.month)}),el('td',{class:'mono',text:String(r.target)}),el('td',{class:'mono',text:String(r.left)}),el('td',{class:'mono',text:r.left?String(r.perDay):'✓'}),el('td',{class:'mono',text:String(r.week)}),el('td',{class:'mono',text:r.leads?String(r.leads):r.id==='fida'?'organic':'0'}),el('td',{class:'mono',text:r.conv!=null?r.conv+'%':'—'}),el('td',{class:'mono',text:r.incentive?'+'+r.incentive:''})))))),
      el('p',{class:'hint',text:'Fida works organic customers (no CRM leads), so she has no conversion.'}));
    /* approvals */
    const pm=A.pendingMedia.map(m=>el('div',{style:'display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--line);padding:8px 0;flex-wrap:wrap'},el('div',{style:'flex:1;min-width:180px'},el('b',{text:nm(m.staffId)+' · '+dm(m.date)}),el('div',{class:'hint',style:'margin:0',text:[m.product,m.concept,m.title].filter(Boolean).join(' · ')+(+m.reedits?' · re-edited ×'+m.reedits:'')})),
      el('button',{class:'btn primary',type:'button',text:'✅ Approved',onclick:async()=>{await call('mediaDecide',{adminPin,id:m.id,status:'approved'}).catch(e=>toast(e.message));load()}}),el('button',{class:'btn',type:'button',text:'🔁 Re-edit (−5)',onclick:async()=>{await call('mediaDecide',{adminPin,id:m.id,status:'reedit'}).catch(e=>toast(e.message));load()}})));
    const pi=A.pendingIssues.map(x=>{const bl=el('select',{'aria-label':'Mistake by'},el('option',{value:'',text:'— whose mistake —'}),...A.staffNames.filter(s=>s.section).map(s=>el('option',{value:s.id,selected:s.id===x.blame,text:s.name+' · '+SEC_LABEL[s.section]})));
      return el('div',{style:'display:flex;gap:8px;align-items:center;border-bottom:1px solid var(--line);padding:8px 0;flex-wrap:wrap'},el('div',{style:'flex:1;min-width:180px'},el('b',{text:x.kind.toUpperCase()+' · '+x.orderNo}),el('div',{class:'hint',style:'margin:0',text:dm(x.date)+' · reported by '+nm(x.by)+(x.note?' · '+x.note:'')})),bl,
        el('button',{class:'btn primary',type:'button',text:'Confirm (−10)',onclick:async()=>{if(!bl.value){toast('Pick whose mistake');return}await call('issueDecide',{adminPin,id:x.id,status:'approved',blame:bl.value}).catch(e=>toast(e.message));load()}}),el('button',{class:'btn',type:'button',text:'Reject',onclick:async()=>{await call('issueDecide',{adminPin,id:x.id,status:'rejected'}).catch(e=>toast(e.message));load()}}))});
    const appr=el('div',{class:'panel'},el('h3',{text:'Waiting for you · '+(pm.length+pi.length)}),pm.length||pi.length?el('div',{},...pm,...pi):el('div',{class:'empty',text:'Nothing to approve.'}));
    /* bonus */
    const bs=el('select',{id:'bn-s'},...A.board.map(r=>el('option',{value:r.id,text:r.name}))),bp=el('input',{id:'bn-p',type:'number',value:'20',style:'width:90px'}),bnote=el('input',{id:'bn-n',type:'text',placeholder:'e.g. Top reel of the week'});
    const bonus=el('div',{class:'panel'},el('h3',{text:'Bonus / minus points'}),el('div',{class:'form2'},el('label',{class:'f',for:'bn-s'},'Staff',bs),el('label',{class:'f',for:'bn-p'},'Points (minus allowed)',bp),el('label',{class:'f',for:'bn-n'},'Reason',bnote)),
      el('button',{class:'btn primary',type:'button',text:'Add',onclick:async()=>{try{await call('bonusAdd',{adminPin,staffId:bs.value,points:bp.value,note:bnote.value,date:todayStr<=A.range.to&&todayStr>=A.range.from?todayStr:A.range.to});toast('Added');load()}catch(e){toast(e.message)}}}),
      ...A.bonus.map(x=>el('div',{class:'hint',style:'display:flex;gap:8px;align-items:center'},el('span',{style:'flex:1',text:dm(x.date)+' · '+nm(x.staffId)+' · '+ptsTxt(+x.points)+' · '+(x.note||'')}),el('button',{class:'btn',type:'button',text:'Delete',onclick:async()=>{await call('bonusDelete',{adminPin,id:x.id});load()}}))));
    /* media log + accounts */
    const media=el('div',{class:'panel'},el('h3',{text:'Videos · last 14 days'}),A.recentMedia.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','Staff','Video','Status','Instagram'].map(t=>el('th',{text:t})))),el('tbody',{},...A.recentMedia.map(m=>el('tr',{},el('td',{class:'mono',text:dm(m.date)}),el('td',{text:nm(m.staffId)}),el('td',{text:[m.product,m.concept,m.title].filter(Boolean).join(' · ')}),el('td',{text:m.status+(+m.reedits?' ×'+m.reedits:'')}),el('td',{},m.igLink?el('a',{href:m.igLink,target:'_blank',rel:'noopener',text:'Open'}):'')))))):el('div',{class:'empty',text:'No videos yet.'}));
    const acc=el('div',{class:'panel'},el('h3',{text:'Daily balance reports'}),A.accounts.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','Banks','Cash','Expenses','Mismatch','Sent at'].map(t=>el('th',{text:t})))),el('tbody',{},...A.accounts.map(r=>{let b=[];try{b=JSON.parse(r.banks||'[]')}catch(e){}
      return el('tr',{},el('td',{class:'mono',text:dm(r.date)}),el('td',{text:b.map(x=>x.name+' '+rs(x.amount)).join(' · ')}),el('td',{class:'mono',text:rs(r.cash)}),el('td',{class:'mono',text:rs(r.expenses)}),el('td',{text:r.mismatch==='TRUE'?(r.fixed==='TRUE'?'Fixed':'⚠️ Open'):'—'}),el('td',{class:'mono',text:(r.submittedAt||'').slice(5)}))})))):el('div',{class:'empty',text:'No reports yet.'}));
    /* settings */
    const S=A.settings,inp={};const lbl={salesDailyMin:'Sales: normal orders a day',salesMonthTarget:'Sales: orders a month (target)',teamWeekTarget:'Team: orders a week',premiumPts:'Points per premium order',mediaDailyMin:'Media: approved videos a day',accountsBy:'Accounts report by (HH:MM)'};
    const set=el('div',{class:'panel'},el('h3',{text:'Arena rules'}),el('div',{class:'form2'},...Object.keys(lbl).map(k=>{inp[k]=el('input',{id:'ar-'+k,type:'text',value:S[k]});return el('label',{class:'f',for:'ar-'+k},lbl[k],inp[k])})),
      el('button',{class:'btn',type:'button',text:'Save rules',onclick:async()=>{const s={};Object.keys(inp).forEach(k=>s[k]=inp[k].value);try{await call('arenaSettings',{adminPin,settings:s});toast('Rules saved');load()}catch(e){toast(e.message)}}}));
    box.replaceChildren(el('div',{class:'toolbar'},el('h3',{text:'Weekly Arena'}),nav),arenaTeam(A),appr,arenaBoardList(A,null,true),tbl,bonus,media,acc,set)};
  load();return[box]}

function portalOut(){goHome()}
async function ordersBoot(){show('orders');if(!me){goHome();return}ordersHome()}
let myOrders=[];
function openMgr(access,tab){adminPin='m:'+me.id+':'+me.pin;mgrAccess=access.slice();adminView=tab||(ADMIN_TABS.find(([v])=>can(v))||['orders'])[0];openAdmin();adminPin='m:'+me.id+':'+me.pin;mgrAccess=access.slice();document.querySelector('.brand h1').textContent=me.name}
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
  const isProd=/Design|Printing/.test(d.category||'');
  const tabList=(isProd?[['design',/Design/.test(d.category)?'🎨 Design work':'🖨️ Printing work']]:[]).concat(me.sales?[['day','⭐ My day']]:[]).concat(me.sales&&d.callList?[['call','📞 Call first']]:[]).concat([['arena','🏆 Arena'],['att','My attendance']]).concat(me.sales?[['orders','My orders'],['cust','👥 My customers']]:[]).concat(myTasks.length?[['work','My work']]:[]).concat(d.hr?[['leads','Daily leads']]:[]);
  if(portalTab==='auto')portalTab=isProd?'design':me.sales?'day':myTasks.length?'work':'att';
  if(!tabList.some(t=>t[0]===portalTab))portalTab='att';
  me.portalTabs=tabList;const given=ADMIN_TABS.filter(([v])=>hasTab(d.access,v));
  const tabs=el('nav',{class:'tabs',role:'tablist'},...tabList.map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':String(portalTab===v),text:t,onclick:()=>{portalTab=v;ordersHome()}})),
    ...given.map(([v,t])=>el('button',{role:'tab',type:'button','aria-selected':'false',text:t,onclick:()=>openMgr(d.access,v)})));
  const body=portalTab==='design'?myDesignView():portalTab==='day'?myDayView(d):portalTab==='call'?myCallView():portalTab==='arena'?myArenaView():portalTab==='att'?myAttendance(d):portalTab==='work'?myWorkView(d):portalTab==='leads'?hrLeadsView(d):portalTab==='cust'?myCustomersView():myOrdersView(edit,d);
  const warn=me.pin==='1234'?el('div',{class:'banner'},'You are using the default PIN 1234. ',el('button',{class:'btn',type:'button',text:'Change PIN now',onclick:changeMyPin})):null;
  box.replaceChildren(...[head,warn,tabs,...body].filter(Boolean));
}
function changeMyPin(){let first=null;
  const ask=()=>pinSheet({title:first?'Repeat new PIN':'New PIN',onDone:async v=>{
    if(!first){first=v;setTimeout(ask,150);return}
    if(v!==first){first=null;toast('PINs did not match.');setTimeout(ask,150);return}
    try{await call('changeMyPin',{staffId:me.id,pin:me.pin,newPin:v});me.pin=v;LS.set('couplo_me',JSON.stringify(me));closeOv();toast('PIN changed')}catch(e){closeOv();toast(e.message)}}});
  ask()}
function myAttendance(d){
  const recs={};d.att.forEach(r=>recs[r.date]=r);
  if(Number(d.minHours)>0)adminMinH=Number(d.minHours);
  const dates=monthDates(d.month).filter(x=>ymd(x)<=d.today);
  let full=0,half=0,leave=0,wfh=0,late=0,early=0,absent=0,mins=0,otT=0;
  const rows=dates.slice().reverse().map(x=>{const ds=ymd(x),sun=x.getDay()===0,r=recs[ds];let st,cls='',hrs='',ot=0;
    if(!r){if(sun){st='Sunday';cls='c-hrs'}else if(ds===d.today){st='Not checked in yet';cls='c-hrs'}else{st='Absent';cls='flag';absent++}}
    else if(r.status==='leave'){st='Leave';leave++}
    else if(r.status==='wfh'){st='Work from home';wfh++}
    else{const a=inMin(r.in,r.date),b=toMin(r.out);st=t12(r.in)+' – '+(r.out?t12(r.out):'no OUT');if(a!=null&&b!=null){const h=b-a;mins+=h;hrs=fmtMin(h);if(h>=360)full++;else half++;ot=otMin(r);otT+=ot}else if(ds!==d.today){cls='flag'}else full+=0;if(r.lateReason)late++;if(r.earlyReason)early++}
    return el('tr',{class:sun?'sun':''},el('th',{},el('span',{class:'mono',text:pad2(x.getDate())}),' '+DAYS[x.getDay()].slice(0,3)),el('td',{class:'mono '+cls,text:st}),el('td',{class:'mono c-hrs',text:hrs}),el('td',{class:'mono',style:ot?'color:#0a7a3d;font-weight:600':'',text:ot?fmtMin(ot):''}),
      el('td',{class:'c-hrs',text:r?[r.lateReason?'Late: '+r.lateReason:'',r.earlyReason?'Early: '+r.earlyReason:'',r.note||''].filter(Boolean).join(' · '):''}))});
  const stat=(n,l)=>el('div',{},el('b',{class:'mono',text:String(n)}),el('span',{text:l}));
  return[el('div',{class:'panel'},el('h3',{text:'Summary'}),el('div',{class:'stats'},stat(full,'Full days'),stat(half,'Half days'),stat(leave,'Leave'),stat(absent,'Absent'),stat(wfh,'WFH'),stat(late,'Late'),stat(early,'Left early'),stat(fmtMin(mins),'Total hours'),stat(otT?fmtMin(otT):'0h 00m','Overtime')),
      el('p',{class:'hint',text:'Office rule: in by '+t12(d.lateAfter)+', at least '+d.minHours+' hours a day. From 14 Nov, hours count from 9:30 AM even if you come earlier. Under 6 hours counts as a half day. Overtime = time worked beyond '+d.minHours+' hours a day. If something is wrong, tell HR.'})),
    el('div',{class:'panel'},el('h3',{text:'Day by day'}),el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','In – Out','Hours','OT','Reason / note'].map(t=>el('th',{text:t})))),el('tbody',{},...rows))))];
}
function myOrdersView(edit,d){
  const td=ymd(new Date());const today=myOrders.filter(o=>o.date===td);
  const sum=a=>a.reduce((t,o)=>t+(+o.amount||0),0);
  const thisMonth=d.month===ymOf(new Date());
  const info=el('p',{class:'hint',text:'Today: '+today.length+' orders · '+rs(sum(today))+'  ·  '+MON[+d.month.slice(5)-1]+': '+myOrders.length+' orders · '+rs(sum(myOrders))});
  /* order date: today or yesterday; when admin unlocks dates for today, up to 4 days back */
  const backDays=(d.unlocked?[0,1,2,3,4]:[0,1]).map(i=>addDays(td,-i)), minD=backDays[backDays.length-1];
  const lockD=!!(edit&&edit.date<minD);
  const dLabel=(ds,i)=>(i===0?'Today':i===1?'Yesterday':i+' days ago')+' · '+ds.slice(8)+'/'+ds.slice(5,7);
  const odt=el('select',{id:'o-sdt','aria-label':'Order date'},...(lockD?[el('option',{value:edit.date,text:edit.date.slice(8)+'/'+edit.date.slice(5,7)})]:backDays.map((ds,i)=>el('option',{value:ds,selected:ds===(edit?edit.date:td),text:dLabel(ds,i)}))));
  if(lockD)odt.disabled=true;
  const why=el('input',{id:'o-why',type:'text',placeholder:'Which orders / why late (optional)',autocomplete:'off',style:'flex:1;min-width:0'});
  const ask=d.unlocked?null:d.unlockAsked?el('p',{class:'hint',style:'font-weight:600',text:'⏳ Asked admin to unlock older dates — waiting. Tap Refresh after admin approves.'})
    :el('div',{class:'row',style:'flex-wrap:nowrap'},why,el('button',{class:'btn',type:'button',text:'🔓 Ask admin',onclick:async e=>{e.target.disabled=true;try{const j=await call('askUnlock',{staffId:me.id,pin:me.pin,note:why.value});toast(j.unlocked?'Already unlocked':'Sent to admin');ordersHome()}catch(x){toast(/Unknown action|Not a sales/i.test(x.message)?'Ask admin directly (app update pending).':x.message);e.target.disabled=false}}}));
  const dateBox=thisMonth?el('div',{class:'panel'},el('label',{class:'f',for:'o-sdt'},'Order date (which day did the customer order?)',odt),el('p',{class:'hint',text:d.unlocked?'Admin has opened older dates for you today only (up to 4 days back).':'Enter every order the same day. Forgot one from yesterday? Pick Yesterday. Older than that — ask admin to unlock.'}),ask):null;
  const form=thisMonth?orderForm(edit,async data=>{
    const want=lockD?edit.date:(odt.value||td);data.date=want;
    let j;
    if(data.id){j=await call('editOrder',{staffId:me.id,pin:me.pin,order:data});toast('Order updated')}
    else{j=await call('addOrder',{staffId:me.id,pin:me.pin,order:data});toast('Saved · '+j.order.orderNo+(want!==td?' · '+want.slice(8)+'/'+want.slice(5,7):''))}
    if(j&&j.order&&j.order.date!==want)toast('Saved with date '+j.order.date+' — the sheet script (Code.gs) needs the new version. Tell Murshid.');
    ordersHome()},myOrders.map(o=>o.product)):null;
  /* tracking + COD status of my own orders, so sales can answer "where is my parcel?" and send the tracking link */
  const cods=myOrders.filter(o=>o.payment==='cod'),stName=o=>(COD_ST.find(x=>x[0]===codSt(o))||['',''])[1];
  const trk=o=>o.awb?el('div',{},el('div',{class:'hint',style:'font-size:12px;margin:0',text:(courOf(o)?courOf(o)+' · ':'')+o.awb}),trackBtns(o)):el('span',{class:'hint',text:o.dispatched==='TRUE'?'Sent · no tracking yet':'Not sent'});
  const mq={v:''},tb=el('tbody',{});
  const drawMy=()=>{const q=mq.v.trim().toUpperCase();tb.replaceChildren(...myOrders.filter(o=>!q||[o.orderNo,o.customer,o.phone,o.awb,o.district].some(v=>String(v||'').toUpperCase().includes(q))).map(o=>el('tr',{},el('td',{class:'mono',text:o.date.slice(8)+'/'+o.date.slice(5,7)}),el('td',{class:'mono',text:o.orderNo}),el('td',{text:(o.customer||'—')+(o.phone?' · '+o.phone:'')}),el('td',{text:o.district}),el('td',{text:o.product+(o.type==='affordable'?' (A)':'')}),el('td',{class:'mono',text:o.amount?rs(o.amount):'—'}),
      el('td',{},el('div',{text:payTxt(o)}),o.payment==='cod'?el('div',{class:'hint',style:'font-size:12px;margin:0;font-weight:600',text:stName(o)}):null),el('td',{},trk(o)),
      el('td',{},thisMonth?el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>{ordersHome(o);window.scrollTo(0,0)}}):null))))};
  drawMy();
  const codLine=cods.length?el('p',{class:'hint',style:'font-weight:600',text:'COD: '+cods.length+' orders · on the way '+cods.filter(o=>codSt(o)==='shipped').length+' · delivered, cash pending '+cods.filter(o=>codSt(o)==='delivered').length+' · cash received '+cods.filter(o=>codSt(o)==='paid').length+' · returned '+cods.filter(o=>codSt(o)==='returned').length}):null;
  const list=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'My orders'}),el('input',{type:'search',placeholder:'Search no., customer, phone, tracking…',oninput:e=>{mq.v=e.target.value;drawMy()}})),codLine,
    el('p',{class:'hint',text:'Tracking shows here once dispatch adds it. Use Send on WhatsApp to give the customer the tracking details.'}),
    myOrders.length?el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Date','No.','Customer','District','Product','₹','Pay','Tracking',''].map(t=>el('th',{text:t})))),tb)):el('div',{class:'empty',text:'No orders in this month.'}));
  return[info,dateBox,form,list];
}

/* Sales staff: their own customers only (built from their own orders, all time). Tap a customer to call / WhatsApp,
   see their orders, or fix name / phone / district / pincode — the fix goes to all of this staff's orders for that customer. */
let myCustQ='',myCustMiss=false;
function myCustomersView(){
  const box=el('div',{class:'panel'},el('h3',{text:'My customers'}),el('div',{class:'empty',text:'Loading your customers…'}));
  (async()=>{
    let j;try{j=await call('myCustomers',{staffId:me.id,pin:me.pin})}
    catch(e){box.replaceChildren(el('h3',{text:'My customers'}),el('div',{class:'empty',text:/Unknown action/i.test(e.message)?'Update the sheet script (Code.gs) first.':e.message}));return}
    const by={};j.orders.forEach(o=>{const k=custKey(o)||'id:'+o.id;(by[k]=by[k]||[]).push(o)});
    const list=Object.entries(by).map(([k,os])=>{os.sort((a,b)=>String(a.date).localeCompare(String(b.date)));const l=os[os.length-1];
      const fp=String(l.phone||'').replace(/\D/g,'').slice(-10);return{key:k,os,fm:(j.firstMsg||{})[fp]||null,name:l.customer||'—',phone:l.phone||'',district:l.district||'',pincode:l.pincode||'',n:os.length,amt:os.reduce((t,o)=>t+(+o.amount||0),0),first:os[0].date,last:l.date}})
      .sort((a,b)=>b.last.localeCompare(a.last));
    const rep=list.filter(c=>c.n>1).length;
    const tb=el('tbody',{}),cnt=el('span',{class:'hint',style:'margin:0'}),cards=el('div',{class:'ccards'}),phone=matchMedia('(max-width:640px)').matches;
    const draw=()=>{const q=myCustQ.trim().toUpperCase();const rows=list.filter(c=>(!myCustMiss||!c.fm)&&(!q||[c.name,c.phone,c.district,c.pincode,...c.os.map(o=>o.orderNo)].some(v=>String(v||'').toUpperCase().includes(q))));
      cnt.textContent=rows.length+' of '+list.length;
      if(phone){cards.replaceChildren(...rows.slice(0,300).map(c=>{const wa=waLink(c.phone);return el('div',{class:'ccard'+(c.fm?'':' miss'),onclick:()=>myCustSheet(c)},
        el('div',{class:'who'},el('b',{text:c.name+(c.n>1?' ⟳':'')}),el('small',{text:[c.phone,c.district].filter(Boolean).join(' · ')}),el('small',{text:c.n+' order'+(c.n>1?'s':'')+' · '+(c.amt?rs(c.amt):'—')+' · last '+dm(c.last)+'/'+c.last.slice(2,4)}),el('small',{style:c.fm?'':'color:var(--warn);font-weight:600',text:c.fm?'First message '+dm(c.fm[0])+'/'+c.fm[0].slice(2,4):'⚠ First message date missing'})),
        c.phone?el('a',{class:'ic',href:'tel:'+String(c.phone).replace(/[^\d+]/g,''),'aria-label':'Call '+c.name,text:'📞',onclick:e=>e.stopPropagation()}):null,
        wa?el('a',{class:'ic',href:wa,target:'_blank',rel:'noopener','aria-label':'WhatsApp '+c.name,text:'💬',onclick:e=>e.stopPropagation()}):null)}));return}
      tb.replaceChildren(...rows.slice(0,300).map(c=>el('tr',{class:c.fm?'':'miss',style:'cursor:pointer',onclick:()=>myCustSheet(c)},el('th',{text:c.name+(c.n>1?' ⟳':'')}),el('td',{class:'mono',text:c.phone}),el('td',{text:c.district}),el('td',{class:'mono',text:c.pincode}),
        el('td',{class:'mono',text:String(c.n)}),el('td',{class:'mono',text:c.amt?rs(c.amt):'—'}),el('td',{style:c.fm?'':'color:var(--warn);font-weight:600',text:c.fm?dm(c.fm[0])+'/'+c.fm[0].slice(2,4):'Missing'}),el('td',{text:dm(c.first)+'/'+c.first.slice(2,4)}),el('td',{text:dm(c.last)+'/'+c.last.slice(2,4)}))))};
    const qI=el('input',{id:'mc-q',type:'search',placeholder:'Search name, phone, place, order no…',value:myCustQ,oninput:e=>{myCustQ=e.target.value;draw()}});
    const chA=el('button',{type:'button',class:'fchip',text:'All ('+list.length+')'}),chM=el('button',{type:'button',class:'fchip warnchip',text:'⚠ First message missing ('+list.filter(c=>!c.fm).length+')'});
    const setMiss=v=>{myCustMiss=v;chA.classList.toggle('on',!v);chM.classList.toggle('on',v);draw()};chA.onclick=()=>setMiss(false);chM.onclick=()=>setMiss(true);
    setMiss(myCustMiss);
    box.replaceChildren(el('div',{class:'toolbar'},el('h3',{text:'My customers ('+list.length+')'}),cnt),
      el('div',{class:'stats'},el('div',{},el('b',{class:'mono',text:String(list.length)}),el('span',{text:'Customers'})),el('div',{},el('b',{class:'mono',text:String(rep)}),el('span',{text:'Repeat ⟳'})),el('div',{},el('b',{class:'mono',text:String(j.orders.length)}),el('span',{text:'Orders'}))),
      qI,
      el('div',{class:'fchips'},chA,chM),
      !list.length?el('div',{class:'empty',text:'No customers yet.'}):phone?cards:scrollBox(el('table',{},el('thead',{},el('tr',{},...['Customer','Phone','District','Pincode','Orders','Total','First message','First order','Last order'].map(h=>el('th',{text:h})))),tb)),
      el('p',{class:'hint',text:'Only your own customers. Tap a customer to call, WhatsApp, see their orders or fix their details. ⟳ = ordered more than once.'}))})();
  return[box]}
function myFmRow(c){
  const fp=String(c.phone||'').replace(/\D/g,'').slice(-10);
  if(c.fm&&c.fm[1]==='crm')return el('p',{class:'hint',style:'margin:0'},'First message: ',el('b',{text:dm(c.fm[0])+'/'+c.fm[0].slice(2,4)}),' (from CRM)');
  if(!fp)return null;
  const save=async v=>{await call('setFirstMsg',{staffId:me.id,pin:me.pin,phone:c.phone,date:v});c.fm=v?[v,'manual']:null};
  return el('div',{class:'row',style:'align-items:center;gap:8px'},
    c.fm?el('span',{},'First message: ',el('b',{text:dm(c.fm[0])+'/'+c.fm[0].slice(2,4)})):el('span',{style:'color:var(--warn);font-weight:600',text:'⚠ First message date missing'}),
    el('button',{class:'btn',type:'button',text:c.fm?'Change':'+ Add date',onclick:()=>fmDateSheet(c.name,c.phone,c.fm?c.fm[0]:'',c.first,async v=>{await save(v);setTimeout(()=>{myCustSheet(c);ordersHome()},50)})}))}
function myCustSheet(c){
  const wa=waLink(c.phone);
  const f=(id,label,val,attrs)=>el('label',{class:'f',for:id},label,el('input',Object.assign({id,type:'text',value:val||'',autocomplete:'off'},attrs||{})));
  const save=el('button',{class:'btn primary',type:'button',text:'Save changes',onclick:async()=>{
    const nc={customer:$('#mc-n').value,phone:$('#mc-p').value,district:$('#mc-d').value,pincode:$('#mc-pc').value};
    if(!nc.customer.trim()){toast('Enter the customer name.');return}
    save.disabled=true;try{const r=await call('editCustomer',{staffId:me.id,pin:me.pin,key:c.key,c:nc});closeOv();toast('Saved · updated in '+r.changed+' order'+(r.changed>1?'s':''));ordersHome()}
    catch(e){toast(/Unknown action/i.test(e.message)?'Update the sheet script (Code.gs) first.':e.message);save.disabled=false}}});
  openOv(el('h3',{text:c.name}),
    el('div',{class:'row'},c.phone?el('a',{class:'btn',href:'tel:'+String(c.phone).replace(/[^\d+]/g,''),text:'📞 Call'}):null,wa?el('a',{class:'btn',href:wa,target:'_blank',rel:'noopener',text:'WhatsApp'}):null),
    el('p',{class:'hint',style:'margin:0'},c.n+' order'+(c.n>1?'s':'')+' · '+(c.amt?rs(c.amt):'—')+' · first '+dm(c.first)+'/'+c.first.slice(2,4)+' · last '+dm(c.last)+'/'+c.last.slice(2,4)),
    myFmRow(c),
    el('details',{},el('summary',{text:'✏️ Edit customer details'}),
      el('div',{class:matchMedia('(max-width:640px)').matches?'form1':'form2',style:'margin-top:10px'},f('mc-n','Name',c.name==='—'?'':c.name,{style:'text-transform:uppercase'}),f('mc-p','Phone',c.phone,{type:'tel',inputmode:'tel'}),
        f('mc-d','District',c.district,{style:'text-transform:uppercase'}),f('mc-pc','Pincode',c.pincode,{inputmode:'numeric',maxlength:'6'})),
      el('p',{class:'hint',text:'Saving changes these details in all '+c.n+' of your order'+(c.n>1?'s':'')+' for this customer. Changes are logged.'}),save),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','No.','Product','₹','Pay','Status'].map(h=>el('th',{text:h})))),
      el('tbody',{},...c.os.slice().reverse().map(o=>el('tr',{},el('th',{text:dm(o.date)+'/'+o.date.slice(2,4)}),el('td',{class:'mono',text:o.orderNo||''}),el('td',{text:o.product||'—'}),el('td',{class:'mono',text:+o.amount?rs(+o.amount):'—'}),
        el('td',{text:o.payment==='cod'?'COD':o.payment==='prepaid'?'Prepaid':'—'}),el('td',{text:/delivered|paid/.test(o.codStatus||'')?'Delivered':o.awb?'Shipped · '+o.awb:o.dispatched==='TRUE'?'Sent':'Not sent'})))))),
    el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv})))}

/* ---------- admin: orders & reports ---------- */
let adminOrders=[], allOrdersCache=null, orderScope='month', orderSearch='', of={staff:'',type:'',district:'',product:'',sent:'',pay:'',from:'',to:''};
/* which printing code an order belongs to: PHR, PFR, PPR, AFR, AHR, T SHIRT… (others keep their own name) */
function prodCode(o){const p=pkey(o.product),a=o.type==='affordable'?'A':'P';
  if(!p)return'';if(/T.?SHIRT/.test(p))return'T SHIRT';if(/TURKEY|TARKY/.test(p))return'TURKEY';if(/\bCAP\b/.test(p))return'CAP';
  if(/PANT/.test(p))return a+'PR';if(/HALF/.test(p))return a+'HR';if(/FULL/.test(p))return a+'FR';return p}
const CODE_NAMES={PHR:'PREMIUM HALF ROMBER',PFR:'PREMIUM FULL ROMBER',PPR:'PREMIUM PANT ROMBER',AHR:'AFFORDABLE HALF ROMBER',AFR:'AFFORDABLE FULL ROMBER',APR:'AFFORDABLE PANT ROMBER'};
function productReport(src,m,showPrinted){
  const g={};orderLines(src).forEach(o=>{const c=prodCode(o);if(!c)return;const r=g[c]=g[c]||{c,n:0,q:0,a:0,p:0,af:0};r.n++;r.q+=(+o.qty||1);r.a+=(+o.amount||0);o.type==='affordable'?r.af+=(+o.qty||1):r.p+=(+o.qty||1)});
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
/* ---------- courier tracking ---------- */
const COURIERS=['Speed and Safe','ST Courier','DTDC','India Post'];
/* All COD orders go by India Post — courier is fixed for them */
const COD_COURIER='India Post';
const courOf=o=>o&&o.payment==='cod'?COD_COURIER:((o&&o.courier)||'');
/* Each courier's own tracking site. Official sites ask for the number (some with a captcha), so Track copies the number to paste.
   Speed and Safe = Sree Gokulam Speed & Safe. Any other courier keeps 17TRACK with the number filled in. */
const IP_SITE='https://www.indiapost.gov.in/';
const COURIER_SITES=[[/india\s*post|speed\s*post|\bems\b/i,'India Post',IP_SITE],[/dtdc/i,'DTDC','https://www.dtdc.com/track-your-shipment/'],[/\bst\b|st\s*courier/i,'ST Courier','https://stcourier.com/'],[/speed\s*(and|&)\s*safe|gokulam/i,'Speed and Safe','https://www.gokulamspeedandsafe.com/speedandsafe-tracking/']];
const isPost=o=>/^[A-Z]{2}\d{9}IN$/i.test(String(o&&o.awb||'').trim())||/india\s*post|speed\s*post/i.test(String(o&&o.courier||''))||(o&&o.payment==='cod');
function courierSite(o){if(isPost(o))return['India Post',IP_SITE];const c=String(o&&o.courier||'');const hit=COURIER_SITES.find(([re])=>re.test(c));return hit?[hit[1],hit[2]]:null}
const t17=awb=>'https://t.17track.net/en#nums='+encodeURIComponent(String(awb||'').trim());
const trackUrl=(awb,o)=>{const cs=o?courierSite(o):(/^[A-Z]{2}\d{9}IN$/i.test(String(awb||'').trim())?['India Post',IP_SITE]:null);return cs?cs[1]:t17(awb)};
function trackMsg(o){return 'Hi '+(o.customer?String(o.customer).split(' ')[0]:'')+', your Couplo order'+(o.orderNo?' '+o.orderNo:'')+' has been shipped'+(o.courier?' via '+o.courier:'')+'.\nTracking no: '+o.awb+(courierSite(o)?'\nTrack on '+courierSite(o)[0]+': '+courierSite(o)[1]+' (type the tracking no. in the Track box)':'\nTrack here: '+trackUrl(o.awb,o))+'\nOrder status anytime: https://couplobabyset-max.github.io/couplo-app/track.html'+'\n\nThank you for choosing Couplo Design Studio 💜'}
/* ---- India Post API (Nov 2026): pincode check, live tracking, shipping charge. Server: ip* actions in Code.gs ---- */
const ipCache={};
function ipSyncBtn(){return el('button',{class:'btn',type:'button',text:'📮 Update all India Post',title:'Checks every open India Post parcel now (it also runs by itself every hour)',onclick:async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Checking…';
  try{const j=await call('ipSync',{adminPin});toast(j.checked?j.checked+' checked · '+j.delivered+' delivered · '+j.returned+' returned'+(j.error?' · '+j.error:''):'No open India Post parcels');Object.keys(rpCache).forEach(k=>delete rpCache[k]);renderAdmin()}
  catch(er){toast(/not set/i.test(er.message)?'India Post login is not set in Apps Script yet.':/Unknown action|No access/i.test(er.message)?'Update the sheet script (Code.gs) first.':'India Post: '+er.message)}b.disabled=false;b.textContent='📮 Update all India Post'}})}
const ipAuth=()=>adminOpen&&adminPin?{adminPin}:me?{staffId:me.id,pin:me.pin}:{adminPin};
async function ipPincode(pc){if(ipCache[pc])return ipCache[pc];const j=await call('ipPincode',{...ipAuth(),pincode:pc});return ipCache[pc]=j}
const isIP=o=>!!o.awb&&(o.payment==='cod'||/india\s*post/i.test(o.courier||'')||/^[A-Z]{2}\d{9}IN$/.test(o.awb));
function ipBadge(o){if(!isIP(o)||!o.ipStatus)return null;const st=o.ipStatus,c=/^delivered$/i.test(st)?'#1e7e4a':/^returned$/i.test(st)?'#c0392b':'#7b3fa0';
  return el('span',{title:(o.ipLast||'')+(o.ipAt?'\nChecked '+o.ipAt:''),style:'display:inline-block;font-size:11px;font-weight:700;color:#fff;background:'+c+';border-radius:10px;padding:2px 8px;white-space:nowrap',text:'📮 '+st})}
function ipCheckBtn(o,after){if(!isIP(o)||!adminOpen)return null;
  return el('button',{class:'btn',type:'button',text:'📮 Check',title:'Live status from India Post',onclick:async e=>{const b=e.currentTarget;b.disabled=true;
    try{const j=await call('ipTrack',{adminPin,id:o.id});if(j.order)Object.assign(o,j.order);ipShow(o,j);if(after)after()}
    catch(er){toast(/not set/i.test(er.message)?'India Post login is not set in Apps Script yet.':/Unknown action|No access/i.test(er.message)?'Update the sheet script (Code.gs) first.':'India Post: '+er.message)}b.disabled=false}})}
function ipShow(o,j){
  const t=j.tracking,box=el('div',{class:'panel'},el('h3',{text:'📮 India Post · '+(o.awb||'')}),
    !j.found?el('p',{class:'hint',text:'India Post has no record of this number yet. It shows after the parcel is booked at the post office.'}):
    el('div',{},el('p',{style:'font-size:17px;font-weight:700;margin:4px 0',text:t.status||'—'}),
      t.eta?el('p',{class:'hint',text:'Expected: '+t.eta}):null,
      el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['When','Where','What'].map(x=>el('th',{text:x})))),
        el('tbody',{},...t.history.slice().reverse().map(h=>el('tr',{},el('td',{class:'mono',text:String(h.time).slice(0,16).replace('T',' ')}),el('td',{text:h.place}),el('td',{text:h.status}))))))),
    o.payment==='cod'&&o.codStatus?el('p',{class:'hint',text:'COD status now: '+((COD_ST.find(x=>x[0]===o.codStatus)||['',''])[1])}):null,
    el('button',{class:'btn primary',type:'button',text:'Close',onclick:()=>closeOv()}));
  openOv(box)}
/* shipping charge calculator (Business Parcel / Speed Post from our pincode) */
function ipTariffSheet(o){o=o||{};
  const f=(id,l,a)=>{const i=el('input',{id,...a});return[i,el('label',{class:'f',for:id},l,i)]};
  const [pc,lpc]=f('ipt-pc','To pincode',{inputmode:'numeric',maxlength:'6',value:o.pincode||''}),[g,lg]=f('ipt-g','Weight (grams)',{inputmode:'numeric',value:'500'}),
    [ca,lca]=f('ipt-c','COD amount (₹, empty = prepaid)',{inputmode:'numeric',value:o.payment==='cod'?String(+o.amount||''):''});
  const sv=el('select',{id:'ipt-s'},el('option',{value:'bp',text:'Business Parcel'}),el('option',{value:'speed',text:'Speed Post'}));
  const outB=el('div',{style:'margin-top:10px'});
  const go=el('button',{class:'btn primary',type:'button',text:'Get charge',onclick:async()=>{go.disabled=true;outB.textContent='Asking India Post…';
    try{const j=await call('ipTariff',{adminPin,pincode:pc.value,grams:g.value,codAmount:ca.value,service:sv.value});
      outB.replaceChildren(el('p',{style:'font-size:22px;font-weight:800;margin:4px 0',class:'mono',text:rs(j.total)}),
        el('p',{class:'hint',text:j.service+' · '+j.from+' → '+j.to+' · '+j.chargeable+' g'+(j.deliveryType?' · '+j.deliveryType:'')}),
        el('p',{class:'hint',text:'Postage '+rs(j.base)+(j.cod?' · COD charge '+rs(j.cod):'')+' · GST '+rs(j.tax)}))}
    catch(e){outB.textContent=/not set/i.test(e.message)?'India Post login is not set in Apps Script yet.':'India Post: '+e.message}go.disabled=false}});
  openOv(el('div',{class:'panel'},el('h3',{text:'📮 India Post shipping charge'}),el('div',{class:'form2'},lpc,lg,lca,el('label',{class:'f',for:'ipt-s'},'Service',sv)),
    el('div',{class:'row'},go,el('button',{class:'btn',type:'button',text:'Close',onclick:()=>closeOv()})),outB))}
function trackBtns(o){if(!o.awb)return null;const wa=waLink(o.phone);
  return el('span',{style:'display:inline-flex;gap:6px;flex-wrap:wrap'},el('a',{class:'btn',href:trackUrl(o.awb,o),target:'_blank',rel:'noopener',text:courierSite(o)?'Track ('+courierSite(o)[0]+')':'Track',onclick:()=>{const cs=courierSite(o);if(cs){try{navigator.clipboard.writeText(o.awb);toast(o.awb+' copied — paste it in the '+cs[0]+' Track box')}catch(e){}}}}),
    wa?el('a',{class:'btn',href:wa+'?text='+encodeURIComponent(trackMsg(o)),target:'_blank',rel:'noopener',text:'Send on WhatsApp'}):null,
    el('button',{class:'btn',type:'button',text:'Copy',onclick:()=>{try{navigator.clipboard.writeText(trackMsg(o));toast('Tracking message copied')}catch(e){toast('Could not copy')}}}))}
/* Scan a barcode / QR from the courier receipt with the phone camera. Uses the phone's own barcode reader
   (Android Chrome); on iPhone / other browsers it loads a small scanner library the first time. */
function awbFrom(t){t=String(t||'').trim();const ip=t.match(/[A-Z]{2}\d{9}IN/i);if(ip)return ip[0].toUpperCase();
  if(/^https?:/i.test(t)){const runs=(t.split(/[?#]/).slice(1).join('&').match(/[A-Z0-9]{7,16}/gi)||[]).concat(t.split('?')[0].split('/').filter(x=>/^[A-Z0-9]{7,16}$/i.test(x)));return(runs.sort((a,b)=>/\d/.test(b)-/\d/.test(a)||b.length-a.length)[0]||t).toUpperCase()}
  return t.replace(/\s+/g,'').toUpperCase()}
let scanLib=null;
function loadScanLib(){return scanLib=scanLib||new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';sc.onload=()=>ok(window.Html5Qrcode);sc.onerror=()=>{scanLib=null;no(new Error('Scanner did not load. Check the internet.'))};document.head.append(sc)})}
async function scanCode(onDone){
  const box=el('div',{id:'scanbox',style:'width:100%;max-width:420px;aspect-ratio:3/4;background:#000;border-radius:14px;overflow:hidden;position:relative'});
  const msg=el('p',{style:'color:#fff;margin:0;text-align:center',text:'Point the camera at the barcode or QR on the courier slip'});
  let stop=()=>{};const close=()=>{try{stop()}catch(e){}wrap.remove()};
  const wrap=el('div',{style:'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px'},
    box,msg,el('button',{class:'btn',type:'button',text:'Cancel',onclick:close}));
  document.body.append(wrap);
  let done=false;const hit=t=>{if(done||!t)return;done=true;try{navigator.vibrate&&navigator.vibrate(80)}catch(e){}close();onDone(awbFrom(t))};
  try{
    if('BarcodeDetector' in window){
      const fm=await BarcodeDetector.getSupportedFormats();const det=new BarcodeDetector({formats:fm});
      const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const v=el('video',{playsinline:true,muted:true,autoplay:true,style:'width:100%;height:100%;object-fit:cover'});v.srcObject=st;box.append(v);await v.play();
      let alive=true;stop=()=>{alive=false;st.getTracks().forEach(t=>t.stop())};
      const loop=async()=>{if(!alive||done)return;try{const r=await det.detect(v);if(r&&r.length){hit(r[0].rawValue);return}}catch(e){}setTimeout(loop,200)};loop();
    }else{
      const H=await loadScanLib();const q=new H('scanbox');stop=()=>{q.stop().catch(()=>{})};
      await q.start({facingMode:'environment'},{fps:10,qrbox:(w,h)=>({width:Math.floor(w*.85),height:Math.floor(h*.4)})},t=>hit(t),()=>{});
    }
  }catch(e){msg.textContent=/Permission|NotAllowed/i.test(e.name+e.message)?'Camera permission was refused. Allow the camera for this site in the browser settings.':'Could not start the camera: '+e.message}
}
/* read a barcode / QR from a photo (file, or an image pasted with Ctrl+V) */
async function scanImage(file){
  if('BarcodeDetector' in window){try{const fm=await BarcodeDetector.getSupportedFormats();const r=await new BarcodeDetector({formats:fm}).detect(await createImageBitmap(file));if(r&&r.length)return awbFrom(r[0].rawValue)}catch(e){}}
  const H=await loadScanLib();let d=document.getElementById('scanfile');if(!d){d=el('div',{id:'scanfile',style:'display:none'});document.body.append(d)}
  const q=new H('scanfile');try{return awbFrom(await q.scanFile(file,false))}catch(e){throw new Error('No barcode or QR found in this photo. Try a clearer, straight photo.')}finally{try{q.clear()}catch(e){}}
}
function photoBtn(onDone,label){const inp=el('input',{type:'file',accept:'image/*',style:'display:none',onchange:async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;toast('Reading the photo…');try{const t=await scanImage(f);onDone(t);toast('Read: '+t)}catch(er){toast(er.message)}}});
  return el('span',{},inp,el('button',{class:'btn',type:'button',text:label||'🖼 From photo',onclick:()=>inp.click()}))}
/* Ctrl+V a receipt photo into a tracking box */
function pasteScan(input){input.addEventListener('paste',async e=>{const it=[...(e.clipboardData||{}).items||[]].find(x=>x.type&&x.type.startsWith('image/'));if(!it)return;e.preventDefault();toast('Reading the pasted photo…');
  try{input.value=await scanImage(it.getAsFile());input.dispatchEvent(new Event('input'));toast('Read: '+input.value)}catch(er){toast(er.message)}})}
/* ---------- Read courier slip photos (OCR) ----------
   A barcode in a WhatsApp photo is usually too small to scan, but the printed text can be read.
   Reads the tracking no. (India Post EL…IN etc.), the customer's phone numbers and the COD amount,
   then finds the order by phone so it can be saved in one tap. Several photos at once are fine. */
const OWN_PHONES=['8590288151','7994288151','9778452249','7736370175'];
let ocrLib=null,ocrWorker=null;
function loadOcr(){return ocrLib=ocrLib||new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';sc.onload=()=>ok(window.Tesseract);sc.onerror=()=>{ocrLib=null;no(new Error('Text reader did not load. Check the internet.'))};document.head.append(sc)})}
async function getOcr(){if(ocrWorker)return ocrWorker;const T=await loadOcr();ocrWorker=await T.createWorker('eng');return ocrWorker}
const TRK_RE=/\b([A-Z]{2})\s?(\d{9})\s?(IN)\b/i;
function slipFacts(t){t=String(t||'');const m=t.match(TRK_RE);const awb=m?(m[1]+m[2]+m[3]).toUpperCase():'';
  const phones=[...new Set((t.replace(/(\d)[ -](\d)/g,'$1$2').match(/(?<!\d)[6-9]\d{9}(?!\d)/g)||[]))].filter(p=>!OWN_PHONES.includes(p));
  const c=t.match(/COD[^0-9\n]{0,20}(\d[\d,]{1,7})/i);return{awb,phones,cod:c?+c[1].replace(/,/g,''):0}}
async function imgOf(file){const b=await createImageBitmap(file);return b}
function tileCanvas(bm,x,y,w,h,scale){const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const g=c.getContext('2d');g.filter='grayscale(1) contrast(1.4)';g.imageSmoothingQuality='high';g.drawImage(bm,x,y,w,h,0,0,c.width,c.height);return c}
async function readSlip(file,progress){
  let bar='';try{if('BarcodeDetector' in window){const fm=await BarcodeDetector.getSupportedFormats();const r=await new BarcodeDetector({formats:fm}).detect(await createImageBitmap(file));if(r&&r.length)bar=r[0].rawValue}}catch(e){}
  const w=await getOcr(),bm=await imgOf(file);
  const full=tileCanvas(bm,0,0,bm.width,bm.height,Math.min(2,1800/bm.width));
  await w.setParameters({tessedit_pageseg_mode:'3'});progress&&progress('Reading text…');
  let text=(await w.recognize(full)).data.text, f=slipFacts(text+'\n'+bar);
  if(!f.awb&&bar&&!TRK_RE.test(bar))f.awb=awbFrom(bar);
  if(!f.awb){ /* small print next to the barcode: read the photo in overlapping pieces */
    await w.setParameters({tessedit_pageseg_mode:'11'});const n=14,th=bm.height/n,tw=bm.width/2,sc=Math.min(2.5,1400/tw);let k=0,tot=(n*2-1)*3;
    outer:for(let i=0;i<n*2-1;i++)for(let j=0;j<3;j++){k++;progress&&progress('Looking for the tracking no… '+Math.round(100*k/tot)+'%');
      const t=(await w.recognize(tileCanvas(bm,j*bm.width/4,i*th/2,tw,th,sc))).data.text;text+='\n'+t;const g=slipFacts(t);if(g.awb){f.awb=g.awb;break outer}}
    const g=slipFacts(text);f.phones=[...new Set(f.phones.concat(g.phones))];if(!f.cod)f.cod=g.cod}
  return f}
function slipReader(){
  if(!allOrdersCache)call('allOrders',{adminPin}).then(j=>{allOrdersCache=j.orders||[]}).catch(()=>{});
  const pool=()=>{const m={};(allOrdersCache||[]).concat(adminOrders||[]).forEach(o=>m[o.id]=o);return Object.values(m)};
  const last10=v=>String(v||'').replace(/\D/g,'').slice(-10);
  const rows=el('div',{});let busy=Promise.resolve(),n=0;
  const addFile=file=>{n++;const st=el('div',{class:'hint',text:'Waiting…'}),body=el('div',{});
    const card=el('div',{style:'border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px'},el('b',{text:'Photo '+n}),st,body);rows.prepend(card);
    busy=busy.then(async()=>{try{const f=await readSlip(file,t=>st.textContent=t);
      const hits=pool().filter(o=>f.phones.includes(last10(o.phone))).sort((a,b)=>b.date.localeCompare(a.date));
      st.textContent='Tracking: '+(f.awb||'not found')+' · Phones: '+(f.phones.join(', ')||'—')+(f.cod?' · COD amount ₹'+f.cod:'');
      const aw=el('input',{type:'text',value:f.awb,placeholder:'Tracking no.',style:'text-transform:uppercase;min-width:150px'});
      const cs=el('select',{'aria-label':'Courier'},...COURIERS.map(c=>el('option',{value:c,text:c,selected:/IN$/i.test(f.awb)?c==='India Post':(hits[0]&&hits[0].courier===c)})));
      const sel=el('select',{},...hits.map(o=>el('option',{value:o.id,text:(o.orderNo||'')+' · '+dm(o.date)+' · '+(o.customer||'')+' · '+rs(+o.amount||0)+(o.payment==='cod'?' · COD':'')+(o.awb?' · has '+o.awb:'')})),el('option',{value:'',text:'— Type order no. instead —'}));
      const on=el('input',{type:'text',placeholder:'Order no.',style:'text-transform:uppercase;width:110px;display:'+(hits.length?'none':'')});sel.onchange=()=>{on.style.display=sel.value?'none':''};
      const sv=el('button',{class:'btn primary',type:'button',text:'Save',onclick:async()=>{
        const awb=awbFrom(aw.value);if(!awb){toast('Type the tracking no.');aw.focus();return}
        const o=sel.value?pool().find(x=>x.id===sel.value):pool().find(x=>String(x.orderNo||'').replace(/\s/g,'').toUpperCase()===on.value.replace(/\s/g,'').toUpperCase());
        if(!o){toast('Order not found — pick or type the order no.');return}
        const cv=o.payment==='cod'?COD_COURIER:cs.value;
        sv.disabled=true;try{const j=await call('setCod',{adminPin,id:o.id,codStatus:o.codStatus||(o.payment==='cod'?'shipped':''),courier:cv,awb});Object.assign(o,j.order||{courier:cv,awb});
          if(o.dispatched!=='TRUE'){try{await call('setDispatched',{adminPin,id:o.id,value:true});o.dispatched='TRUE'}catch(e){}}
          body.replaceChildren(el('p',{style:'margin:6px 0;font-weight:600',text:'✅ Saved: '+(o.orderNo||'')+' · '+awb+(cv?' · '+cv:'')}),trackBtns(o))}catch(e){toast('Could not save: '+e.message);sv.disabled=false}}});
      body.replaceChildren(hits.length?null:el('p',{class:'hint',style:'margin:4px 0',text:'No order with these phone numbers — pick it by order no. (ask in the dispatch group).'}),
        el('div',{class:'row',style:'align-items:center'},aw,cs,hits.length?sel:null,on,sv))}
      catch(e){st.textContent='Could not read: '+e.message}})};
  const inp=el('input',{type:'file',accept:'image/*',multiple:true,style:'display:none',onchange:e=>{[...e.target.files].forEach(addFile);e.target.value=''}});
  const drop=el('div',{tabindex:'0',style:'border:2px dashed var(--line);border-radius:12px;padding:18px;text-align:center;cursor:pointer',onclick:()=>inp.click(),
    text:'Tap to pick courier slip photos (several at once is fine) — or click here and press Ctrl+V to paste a photo'});
  drop.addEventListener('paste',e=>{[...(e.clipboardData||{}).items||[]].filter(x=>x.type&&x.type.startsWith('image/')).forEach(x=>addFile(x.getAsFile()))});
  openOv(el('h3',{text:'📄 Read courier slip photos'}),
    el('p',{class:'hint',text:'Reads the tracking no., the customer phone and the COD amount from the slip photo, then finds the order by phone. Check the number, then Save. The first photo takes a little longer (the reader loads once).'}),
    inp,drop,rows,el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:()=>{closeOv();renderAdmin()}})));
  $('#sheet').style.maxWidth='760px';
}
/* Quick tracking: order no. (or phone) → tracking no. → saved, next. Built for a USB barcode scanner (it types + Enter). */
function quickTrack(){
  const pool=()=>{const m={};(allOrdersCache||[]).concat(adminOrders||[]).forEach(o=>m[o.id]=o);return Object.values(m)};
  if(!allOrdersCache)call('allOrders',{adminPin}).then(j=>{allOrdersCache=j.orders||[]}).catch(()=>{});
  const norm=v=>String(v||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  const cr=el('select',{id:'qt-c'},...COURIERS.map(c=>el('option',{value:c,text:c,selected:(LS.get('qt_courier')||COURIERS[0])===c})));cr.onchange=()=>LS.set('qt_courier',cr.value);
  const oi=el('input',{id:'qt-o',type:'text',placeholder:'Order no. or customer phone, then Enter',autocomplete:'off',style:'text-transform:uppercase'});
  const ai=el('input',{id:'qt-a',type:'text',placeholder:'Scan or type tracking no., then Enter',autocomplete:'off',disabled:true,style:'text-transform:uppercase'});pasteScan(ai);
  const info=el('div',{class:'hint',text:'Click the order box, then scan or type. Ctrl+V pastes a receipt photo into the tracking box.'});
  const doneT=el('tbody',{});let cur=null,n=0;
  const pick=o=>{cur=o;info.replaceChildren(el('b',{text:(o.orderNo||'')+' · '+(o.customer||'')+' · '+(o.phone||'')}),' · '+(o.product||'')+' · '+(o.district||'')+(o.payment==='cod'?' · COD → India Post':'')+(o.awb?' · already has '+o.awb+' (will be replaced)':''));ai.disabled=false;ai.value='';ai.focus()};
  oi.onkeydown=e=>{if(e.key!=='Enter')return;e.preventDefault();const q=norm(oi.value);if(!q)return;const all=pool();
    let hits=all.filter(o=>norm(o.orderNo)===q);if(!hits.length&&q.length>=7&&/^\d+$/.test(q))hits=all.filter(o=>norm(o.phone).slice(-10)===q.slice(-10));
    if(!hits.length&&q.length>=3)hits=all.filter(o=>norm(o.orderNo).includes(q));
    hits.sort((a,b)=>(!!a.awb-!!b.awb)||b.date.localeCompare(a.date));
    if(!hits.length){info.textContent='No order found for "'+oi.value+'".'+(allOrdersCache?'':' (Older orders are still loading — try again in a moment.)');cur=null;ai.disabled=true;return}
    if(hits.length===1){pick(hits[0]);return}
    cur=null;ai.disabled=true;info.replaceChildren('Several orders match — pick one: ',...hits.slice(0,8).map(o=>el('button',{class:'btn',type:'button',style:'margin:4px',text:(o.orderNo||'')+' · '+dm(o.date)+' · '+(o.customer||'')+(o.awb?' ✓':''),onclick:()=>pick(o)})))};
  const save=async()=>{const awb=awbFrom(ai.value);if(!cur||!awb)return;ai.disabled=true;const cv=cur.payment==='cod'?COD_COURIER:cr.value;
    try{const j=await call('setCod',{adminPin,id:cur.id,codStatus:cur.codStatus||'',courier:cv,awb});Object.assign(cur,j.order||{courier:cv,awb});
      if(cur.dispatched!=='TRUE'){try{await call('setDispatched',{adminPin,id:cur.id,value:true});cur.dispatched='TRUE'}catch(e){}}
      n++;doneT.prepend(el('tr',{},el('td',{class:'mono',text:cur.orderNo||''}),el('td',{text:cur.customer||''}),el('td',{text:cv}),el('td',{class:'mono',text:awb}),el('td',{},trackBtns(cur))));
      cnt.textContent='Saved this session: '+n;toast((cur.orderNo||'Order')+' saved');cur=null;oi.value='';ai.value='';info.textContent='Next order…';oi.focus()}
    catch(e){toast('Could not save: '+e.message);ai.disabled=false;ai.focus()}};
  ai.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save()}};
  const cnt=el('b',{text:'Saved this session: 0'});
  openOv(el('h3',{text:'Quick tracking'}),el('label',{class:'f',for:'qt-c'},'Courier (stays the same until you change it — COD orders always go by India Post)',cr),
    el('label',{class:'f',for:'qt-o'},'1. Order',oi),info,
    el('label',{class:'f',for:'qt-a'},'2. Tracking number',el('div',{class:'row',style:'flex-wrap:nowrap'},ai,photoBtn(t=>{ai.value=t;if(cur)save()}),el('button',{class:'btn',type:'button',text:'📷',onclick:()=>scanCode(t=>{ai.value=t;if(cur)save()})}),el('button',{class:'btn primary',type:'button',text:'Save',onclick:save}))),
    cnt,el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['No.','Customer','Courier','Tracking',''].map(h=>el('th',{text:h})))),doneT)),
    el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:()=>{closeOv();renderAdmin()}})));
  $('#sheet').style.maxWidth='760px';setTimeout(()=>oi.focus(),50);
}
function trackSheet(o){
  const known=[...new Set(COURIERS.concat((allOrdersCache||adminOrders||[]).map(x=>x.courier).filter(Boolean)))];
  const isCod=o.payment==='cod';
  const cr=el('select',{id:'tk-c',disabled:isCod},el('option',{value:'',text:'Pick courier'}),...known.map(c=>el('option',{value:c,text:c,selected:courOf(o)===c})));
  const aw=el('input',{id:'tk-a',type:'text',value:o.awb||'',placeholder:'Tracking / AWB no.',style:'text-transform:uppercase',autocomplete:'off'});pasteScan(aw);
  const sv=el('button',{class:'btn primary',type:'button',text:'Save',onclick:async()=>{
    if(!cr.value){toast('Pick the courier.');return}if(!aw.value.trim()){toast('Type the tracking number.');aw.focus();return}
    sv.disabled=true;try{const j=await call('setCod',{adminPin,id:o.id,codStatus:o.codStatus||'',courier:cr.value,awb:aw.value});Object.assign(o,j.order||{courier:cr.value,awb:aw.value.trim().toUpperCase()});
      if(o.dispatched!=='TRUE'){try{await call('setDispatched',{adminPin,id:o.id,value:true});o.dispatched='TRUE'}catch(e){}}
      closeOv();toast('Tracking saved');renderAdmin()}catch(e){toast('Could not save: '+e.message);sv.disabled=false}}});
  openOv(el('h3',{text:'Tracking · '+(o.orderNo||'')+' · '+(o.customer||'')}),
    el('label',{class:'f',for:'tk-c'},isCod?'Courier (COD — always India Post)':'Courier',cr),el('label',{class:'f',for:'tk-a'},'Tracking number',el('div',{class:'row',style:'flex-wrap:nowrap'},aw,
      el('button',{class:'btn primary',type:'button',text:'📷 Scan',onclick:()=>scanCode(t=>{aw.value=t;toast('Scanned: '+t)})}),photoBtn(t=>{aw.value=t}))),
    el('p',{class:'hint',text:'On a computer: use a USB barcode scanner (click the box, scan), pick a photo of the receipt, or copy a photo and press Ctrl+V in the box.'}),
    el('p',{class:'hint',text:'Saving also ticks the order as dispatched. Then use Track to see where it is, or Send on WhatsApp to give the customer the tracking link.'}),
    el('div',{class:'row'},sv,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})),trackBtns(o));
}
function viewOrders(){
  const m=adminMonth, byId=Object.fromEntries(staff.map(s=>[s.id,s.name]));
  const base=orderScope==='all'?(allOrdersCache||[]):adminOrders;
  const src=base.filter(o=>(!of.staff||o.staffId===of.staff)&&(!of.type||o.type===of.type)&&(!of.district||o.district===of.district)&&(!of.product||linesOf(o).some(l=>pkey(l.product)===of.product))&&(!of.sent||(of.sent==='yes')===(o.dispatched==='TRUE'))&&(!of.pay||(of.pay==='none'?!(o.payment==='cod'||o.payment==='prepaid'):o.payment===of.pay))&&(!of.from||o.date>=of.from)&&(!of.to||o.date<=of.to));
  if(orderScope==='all'&&!allOrdersCache){call('allOrders',{adminPin}).then(j=>{allOrdersCache=j.orders;renderAdmin()}).catch(e=>toast(e.message));return[el('div',{class:'empty',text:'Loading all orders…'})]}
  const amt=o=>+o.amount||0, qty=o=>+o.qty||1;
  const group=(key,from)=>{const g={};(from||src).forEach(o=>{const k=(key(o)||'—');g[k]=g[k]||{k,n:0,q:0,a:0};g[k].n++;g[k].q+=qty(o);g[k].a+=amt(o)});return Object.values(g).sort((a,b)=>b.n-a.n||b.a-a.a)};
  const top=(title,rows,label)=>el('div',{class:'panel'},el('h3',{text:title}),rows.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},el('th',{text:label}),el('th',{text:'Orders'}),el('th',{text:'Qty'}),el('th',{text:'Amount'}))),
    el('tbody',{},...rows.slice(0,10).map(r=>el('tr',{},el('th',{text:r.k}),el('td',{class:'mono',text:String(r.n)}),el('td',{class:'mono',text:String(r.q)}),el('td',{class:'mono',text:r.a?rs(r.a):'—'})))))):el('div',{class:'empty',text:'No orders.'}));
  const total=src.reduce((t,o)=>t+amt(o),0), withAmt=src.filter(o=>amt(o)).length;
  const custs={};src.forEach(o=>{const k=o.phone||o.customer;if(!k)return;const c=custs[k]=custs[k]||{name:'',phone:o.phone,n:0,a:0,prods:new Set(),dist:o.district};c.n++;c.a+=amt(o);if(o.customer)c.name=o.customer;linesOf(o).forEach(l=>{if(l.product)c.prods.add(pkey(l.product))})});
  const repeat=Object.values(custs).filter(c=>c.n>1).sort((a,b)=>b.n-a.n||b.a-a.a);
  const scopeSel=el('select',{id:'oscope','aria-label':'Report period',onchange:e=>{orderScope=e.target.value;renderAdmin()}},el('option',{value:'month',text:'Selected month',selected:orderScope==='month'}),el('option',{value:'all',text:'All time',selected:orderScope==='all'}));
  const uniq=k=>[...new Set(base.map(o=>o[k]).filter(Boolean))].sort();
  const fsel=(key,label,opts)=>el('label',{class:'f',for:'of-'+key},label,el('select',{id:'of-'+key,onchange:e=>{of[key]=e.target.value;renderAdmin()}},el('option',{value:'',text:'All'}),...opts.map(([v,t])=>el('option',{value:v,text:t,selected:of[key]===v}))));
  const fdate=(key,label)=>el('label',{class:'f',for:'of-'+key},label,el('input',{id:'of-'+key,type:'date',value:of[key],onchange:e=>{of[key]=e.target.value;renderAdmin()}}));
  const active=Object.values(of).some(Boolean);
  const filters=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Filter sales'}),active?el('button',{class:'btn',type:'button',text:'Clear filters',onclick:()=>{of={staff:'',type:'',district:'',product:'',sent:'',pay:'',from:'',to:''};renderAdmin()}}):null),
    el('div',{class:'form2'},fsel('staff','Staff',salesStaff().concat(staff.filter(s=>!s.sales&&base.some(o=>o.staffId===s.id))).map(s=>[s.id,s.name])),fsel('type','Type',[['premium','Premium'],['affordable','Affordable']]),
      fsel('district','District',uniq('district').map(v=>[v,v])),fsel('product','Product',[...new Set(orderLines(base).map(o=>pkey(o.product)).filter(Boolean))].sort().map(v=>[v,v])),fsel('sent','Dispatched',[['yes','Sent'],['no','Not sent']]),fsel('pay','Payment',[['prepaid','Prepaid'],['cod','COD'],['none','Not marked']]),fdate('from','From date'),fdate('to','To date')));
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
  const list=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'All orders ('+rows.length+')'}),el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'⚡ Quick tracking',onclick:quickTrack}),el('button',{class:'btn',type:'button',text:'📄 Slip photos',onclick:slipReader}),search)),el('div',{class:'scroll'},el('table',{},
    el('thead',{},el('tr',{},...['Date','No.','Staff','Customer','Phone','District','Pincode','Product','Type','₹','Pay','Sent','Tracking',''].map(t=>el('th',{text:t})))),
    el('tbody',{},...rows.slice(0,300).map(o=>{const cb=el('input',{type:'checkbox','aria-label':'Dispatched'});cb.checked=o.dispatched==='TRUE';cb.onchange=async()=>{try{await call('setDispatched',{adminPin,id:o.id,value:cb.checked});o.dispatched=cb.checked?'TRUE':'FALSE'}catch(e){cb.checked=!cb.checked;toast('Could not save.')}};
      return el('tr',{},el('td',{class:'mono',text:o.date}),el('td',{class:'mono',text:o.orderNo||''}),el('td',{text:byId[o.staffId]||o.staffId}),el('td',{text:o.customer||'—'}),el('td',{class:'mono',text:o.phone||''}),el('td',{text:o.district||''}),el('td',{class:'mono',text:o.pincode||''}),el('td',{text:o.product||''}),el('td',{text:o.type==='affordable'?'Affordable':'Premium'}),el('td',{class:'mono',text:amt(o)?rs(amt(o)):'—'}),el('td',{text:payTxt(o)}),el('td',{},cb),
        el('td',{},o.awb?el('div',{},el('div',{class:'hint',style:'font-size:12px',text:courOf(o)+' · '+o.awb}),trackBtns(o)):null,el('button',{class:'btn',type:'button',text:o.awb?'Change':'Add tracking',onclick:()=>trackSheet(o)})),
        el('td',{},el('button',{class:'btn',type:'button',text:'Edit',onclick:()=>adminOrderSheet(o)})))})))),
    rows.length>300?el('p',{class:'hint',text:'Showing the newest 300. Use search to find older ones.'}):null);
  return[filters,summary,productReport(src,m,orderScope==='month'),el('div',{class:'split'},top('Best products',group(o=>o.product?pkey(o.product)+(o.type==='affordable'?' (A)':' (P)'):'',orderLines(src)),'Product'),top('Top districts',group(o=>o.district),'District')),el('div',{class:'split'},top('Top pincodes',group(o=>o.pincode),'Pincode'),top('By staff',group(o=>(staff.find(s=>s.id===o.staffId)||{}).name||o.staffId),'Staff')),rep,list];
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
/* phones (and the home-screen app) often ignore a plain download link, so there the file goes to the share sheet
   (Save to Files / Drive / WhatsApp); computers download it directly */
async function saveFile(filename,data,type){
  const blob=new Blob([data],{type});
  const phone=window.matchMedia&&matchMedia('(pointer:coarse)').matches;
  if(phone&&navigator.canShare){try{const f=new File([blob],filename,{type});if(navigator.canShare({files:[f]})){await navigator.share({files:[f],title:filename});return}}catch(e){if(e&&e.name==='AbortError')return}}
  const url=URL.createObjectURL(blob);
  const a=el('a',{href:url,download:filename,target:'_blank',rel:'noopener'});document.body.append(a);a.click();a.remove();
  toast('Downloaded '+filename);setTimeout(()=>URL.revokeObjectURL(url),60000);
}
const XLSXT='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function exportXlsx(m){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const list=activeStaff(), dates=monthDates(m);const[y,mo]=m.split('-').map(Number);
  const r2=['DATE','DAY'],r3=['',''];
  list.forEach(s=>{r2.push(s.name,'','','','','');r3.push('CHECK IN','CHECK OUT','HOURS','OT','STATUS','REASON')});
  const rows=[['ATTENDANCE REGISTER '+MON[mo-1].toUpperCase()+' '+y],r2,r3];
  dates.forEach(d=>{const ds=ymd(d);const row=[ds,DAYS[d.getDay()]];
    list.forEach(s=>{const r=adminRecs[ds+'__'+s.id];
      if(!r){row.push('','','','','','');return}
      if(r.status==='leave'){row.push('LEAVE','LEAVE','','','LEAVE',r.note||'');return}
      if(r.status==='wfh'){row.push('WFH','WFH','','','WFH',r.note||'');return}
      const a=inMin(r.in,r.date),b=toMin(r.out);const h=(a!=null&&b!=null)?b-a:null;
      const ot=otMin(r);row.push(r.in||'',r.out||'',h!=null?Math.floor(h/60)+':'+pad2(h%60):'',ot?Math.floor(ot/60)+':'+pad2(ot%60):'',h==null?'NO OUT':h>=360?'FULL':'HALF',[r.lateReason?'Late: '+r.lateReason:'',r.earlyReason?'Early: '+r.earlyReason:'',r.note||''].filter(Boolean).join(' | '))});
    rows.push(row)});
  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:5}}].concat(list.map((_,i)=>({s:{r:1,c:2+i*6},e:{r:1,c:7+i*6}})));
  ws['!cols']=[{wch:12},{wch:11}].concat(list.flatMap(()=>[{wch:9},{wch:10},{wch:7},{wch:6},{wch:8},{wch:22}]));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'ATTENDANCE');
  saveFile('ATTENDANCE_'+MON[mo-1].toUpperCase()+'_'+y+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT);
}
function exportSalary(m,calc){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const[y,mo]=m.split('-').map(Number);
  const rows=[['SALARY '+MON[mo-1].toUpperCase()+' '+y],['NAME','ROLE','MONTHLY SALARY','FULL DAYS','HALF DAYS','WFH PAID','WFH NO ORDER','LEAVE','ABSENT','SUNDAYS PAID','SUNDAYS CUT','OT HOURS','PAID DAYS','DAYS IN MONTH','PER DAY','EARNED','BONUS','ADVANCE','NET PAY','NOTE']];
  calc.forEach(({s,c})=>rows.push([s.name,roleText(s.role),c.salary,c.full,c.half,c.wfhPaid,c.wfhUnpaid,c.leave,c.absent,c.sunPaid,c.sunCut,c.ot?Math.floor(c.ot/60)+':'+pad2(c.ot%60):'',c.paid,c.nd,Math.round(c.perDay*100)/100,c.earned,c.extra,c.adv,c.net,c.note]));
  rows.push(['TOTAL','',calc.reduce((t,x)=>t+x.c.salary,0),'','','','','','','','',(t=>t?Math.floor(t/60)+':'+pad2(t%60):'')(calc.reduce((t,x)=>t+x.c.ot,0)),'','','',calc.reduce((t,x)=>t+x.c.earned,0),calc.reduce((t,x)=>t+x.c.extra,0),calc.reduce((t,x)=>t+x.c.adv,0),calc.reduce((t,x)=>t+x.c.net,0),'']);
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
/* ---------- admin: customers — one row per customer (by phone), filter by the date they came, plus customer reports ---------- */
let leadCache=null,leadLoading=false,adSpendCache={},adSpendLoading='';
let cu={preset:'month',from:'',to:'',by:'first',q:'',district:'',staff:'',kind:'',ad:'',sort:'new',show:100,quiet:90};
/* same customer = same phone (last 10 digits); orders with no phone are joined by name */
const custKey=o=>{let d=String(o.phone||'').replace(/\D/g,'');if(d.length>10)d=d.slice(-10);if(d.length>=7)return'p:'+d;const n=String(o.customer||'').trim().toLowerCase();return n?'n:'+n:''};
const waLink=p=>{let d=String(p||'').replace(/\D/g,'');if(d.length===10)d='91'+d;return d.length>=11?'https://wa.me/'+d:''};
/* lead rows for a phone: [[ 'yyyy-MM-dd HH:mm', adId ], ...] oldest first (from the Leadvyne CRM sheet) */
const leadsOf=ph=>{if(!leadCache||!leadCache.leads)return[];let d=String(ph||'').replace(/\D/g,'');if(d.length<7)return[];return leadCache.leads[d.slice(-10)]||[]};
const adKeyOf=L=>!L?'~none':L.ad||'~noad';
const adLabel=id=>{if(!id)return'';const a=leadCache&&leadCache.ads&&leadCache.ads[id];if(a)return a.name;for(const k in adSpendCache){const x=adSpendCache[k][id];if(x&&x.name)return x.name}return'Ad '+id};
const adCamp=id=>{if(!id)return'';const a=leadCache&&leadCache.ads&&leadCache.ads[id];if(a&&a.campaign)return a.campaign;for(const k in adSpendCache){const x=adSpendCache[k][id];if(x&&x.campaign)return x.campaign}return''};
/* the message that led to an order = the newest lead on or before the order day; its ad, or failing that
   the newest ad seen on this number in the 30 days before the order */
function leadFor(rows,ds){if(!rows.length)return null;let r=null;for(const x of rows){if(x[0].slice(0,10)<=ds)r=x;else break}
  if(!r)return null;let ad=r[1];if(!ad){const lim=addDays(ds,-30);for(let i=rows.length-1;i>=0;i--){const x=rows[i];if(x[0].slice(0,10)>ds)continue;if(x[0].slice(0,10)<lim)break;if(x[1]){ad=x[1];break}}}
  const day=r[0].slice(0,10);return{at:r[0],day,ad,manual:r[3]==='manual',days:Math.round((new Date(ds+'T12:00:00')-new Date(day+'T12:00:00'))/864e5)}}
function custBuild(all){
  const g={};
  all.forEach(o=>{if(!o.date)return;const k=custKey(o);if(!k)return;(g[k]=g[k]||{k,os:[]}).os.push(o)});
  return Object.values(g).map(c=>{
    const os=c.os.sort((a,b)=>(a.date+(a.createdAt||'')).localeCompare(b.date+(b.createdAt||'')));
    const lastWith=f=>{for(let i=os.length-1;i>=0;i--)if(os[i][f])return os[i][f];return''};
    const lr=leadsOf(lastWith('phone'));os.forEach(o=>{o._lead=leadFor(lr,o.date)});
    return{k:c.k,os,leads:lr,firstMsg:lr.length?lr[0][0]:'',lead1:os[0]._lead,name:lastWith('customer')||'—',phone:lastWith('phone'),district:lastWith('district'),
      first:os[0].date,last:os[os.length-1].date,n:os.length,amt:os.reduce((a,o)=>a+(+o.amount||0),0),
      staffId:os[0].staffId,firstProd:linesOf(os[0]).map(prodCode).filter(Boolean)};
  });
}
function custRange(){
  if(cu.preset==='all'){const f=(allOrdersCache||[]).reduce((m,o)=>o.date&&o.date<m?o.date:m,todayStr);return[f,todayStr]}
  return rpRange({preset:cu.preset==='year'?'year':cu.preset,from:cu.from,to:cu.to});
}
function custData(){
  const[f,t]=custRange(),C=custBuild(allOrdersCache||[]);
  const inR=d=>d>=f&&d<=t, sName=Object.fromEntries(staff.map(s=>[s.id,s.name]));
  const q=cu.q.trim().toLowerCase(),qd=q.replace(/\D/g,'');
  const list=C.filter(c=>(cu.by==='first'?inR(c.first):c.os.some(o=>inR(o.date)))
    &&(!cu.district||c.district===cu.district)&&(!cu.staff||c.staffId===cu.staff)
    &&(!cu.kind||(cu.kind==='repeat')===(c.n>1))
    &&(!cu.ad||adKeyOf(cu.by==='first'?c.lead1:(c.os.filter(o=>inR(o.date)).slice(-1)[0]||{})._lead)===cu.ad)
    &&(!q||c.name.toLowerCase().includes(q)||(qd.length>=3&&String(c.phone).replace(/\D/g,'').includes(qd))))
    .map(c=>{const po=c.os.filter(o=>inR(o.date));return{...c,pn:po.length,pamt:po.reduce((a,o)=>a+(+o.amount||0),0),staffName:sName[c.staffId]||''}});
  const sorts={new:(a,b)=>b.first.localeCompare(a.first),last:(a,b)=>b.last.localeCompare(a.last),sales:(a,b)=>b.amt-a.amt,orders:(a,b)=>b.n-a.n||b.amt-a.amt,name:(a,b)=>a.name.localeCompare(b.name)};
  list.sort(sorts[cu.sort]||sorts.new);
  /* reports */
  const sum={n:list.length,isNew:list.filter(c=>inR(c.first)).length,repeat:list.filter(c=>c.n>1).length,sales:list.reduce((a,c)=>a+c.pamt,0),orders:list.reduce((a,c)=>a+c.pn,0)};
  /* new vs returning, month by month (last 12 months up to the end date) */
  const months=[];{let d=new Date(t.slice(0,7)+'-01T12:00:00');for(let i=0;i<12;i++){months.unshift(ymOf(d));d.setMonth(d.getMonth()-1)}}
  const monthly=months.map(m=>{let nw=0,ret=0,sales=0,ords=0;C.forEach(c=>{const mo=c.os.filter(o=>o.date.startsWith(m));if(!mo.length)return;ords+=mo.length;sales+=mo.reduce((a,o)=>a+(+o.amount||0),0);if(c.first.startsWith(m))nw++;else ret++});
    return{m,nw,ret,ords,sales,rate:nw+ret?Math.round(ret/(nw+ret)*100):0}}).filter(r=>r.ords||r.m>=months[months.length-3]);
  const dg={};list.forEach(c=>{const k=c.district||'Not written';const r=dg[k]=dg[k]||{k,c:0,o:0,a:0,nw:0};r.c++;r.o+=c.pn;r.a+=c.pamt;if(inR(c.first))r.nw++});
  const districts=Object.values(dg).sort((a,b)=>b.c-a.c||b.a-a.a);
  const top=list.slice().sort((a,b)=>b.amt-a.amt||b.n-a.n).slice(0,15);
  const fp={};list.filter(c=>inR(c.first)).forEach(c=>(c.firstProd.length?c.firstProd:['NOT WRITTEN']).forEach(p=>{fp[p]=(fp[p]||0)+1}));
  const firstProds=Object.entries(fp).sort((a,b)=>b[1]-a[1]);
  const sg={};C.forEach(c=>{c.os.forEach((o,i)=>{if(!inR(o.date))return;const r=sg[o.staffId]=sg[o.staffId]||{id:o.staffId,nw:0,rep:0,a:0};if(i===0)r.nw++;else r.rep++;r.a+=(+o.amount||0)})});
  const staffRows=Object.values(sg).map(r=>({...r,name:sName[r.id]||'(removed staff)'})).sort((a,b)=>b.nw-a.nw||b.rep-a.rep);
  /* gone quiet: last order more than N days ago (up to 1 year), biggest buyers first */
  const cut=addDays(todayStr,-cu.quiet),floor=addDays(todayStr,-365);
  const quiet=C.filter(c=>c.last<=cut&&c.last>=floor&&(!cu.district||c.district===cu.district)).sort((a,b)=>b.amt-a.amt||b.n-a.n).map(c=>({...c,staffName:sName[c.staffId]||''}));
  /* which ad / which week of messages brought the orders in these dates (orders of the customers in the list) */
  const pOrders=list.flatMap(c=>c.os.filter(o=>inR(o.date)).map((o,i)=>({o,c,isNew:o===c.os[0]})));
  const ag={};pOrders.forEach(({o,isNew})=>{const L=o._lead,k=!L?'~none':L.ad?L.ad:'~noad';
    const r=ag[k]=ag[k]||{k,name:k==='~none'?'Number not in CRM sheet':k==='~noad'?'In CRM, no ad ID (status ad / direct / old lead)':adLabel(k),camp:'',o:0,nw:0,a:0,days:[],first:'',last:''};
    if(k[0]!=='~')r.camp=adCamp(k);
    r.o++;r.a+=(+o.amount||0);if(isNew)r.nw++;if(L){r.days.push(L.days);if(!r.first||L.day<r.first)r.first=L.day;if(!r.last||L.day>r.last)r.last=L.day}});
  const med=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return b[Math.floor((b.length-1)/2)]};
  const adRows=Object.values(ag).map(r=>({...r,med:med(r.days)})).sort((a,b)=>(a.k[0]==='~')-(b.k[0]==='~')||b.o-a.o||b.a-a.a);
  const wkStart=ds=>{const d=new Date(ds+'T12:00:00');const w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return ymd(d)};
  const wg={};pOrders.forEach(({o})=>{const L=o._lead;const k=L?wkStart(L.day):'~';const r=wg[k]=wg[k]||{k,o:0,a:0,ads:{}};r.o++;r.a+=(+o.amount||0);if(L&&L.ad)r.ads[L.ad]=(r.ads[L.ad]||0)+1});
  const weekRows=Object.values(wg).sort((a,b)=>b.k.localeCompare(a.k)).map(r=>({...r,topAd:Object.entries(r.ads).sort((a,b)=>b[1]-a[1]).map(([id,n])=>adLabel(id)+' ('+n+')').slice(0,2).join(', ')}));
  const BK=[[0,0,'Same day'],[1,3,'1–3 days'],[4,7,'4–7 days'],[8,14,'8–14 days'],[15,30,'15–30 days'],[31,99999,'More than 30 days']];
  const lagRows=BK.map(([a,b,l])=>{const os=pOrders.filter(x=>x.o._lead&&x.o._lead.days>=a&&x.o._lead.days<=b);return{l,o:os.length,a:os.reduce((t,x)=>t+(+x.o.amount||0),0)}});
  const noLead=pOrders.filter(x=>!x.o._lead).length;
  const byPhone={};C.forEach(c=>{if(c.k.startsWith('p:'))byPhone[c.k.slice(2)]=c});
  const cg={};if(leadCache&&leadCache.leads)Object.entries(leadCache.leads).forEach(([p,rows])=>{const first=rows[0];if(!first||!inR(first[0].slice(0,10)))return;
    const ad=(rows.find(x=>x[1])||[])[1]||'';const k=ad||'~noad';if(cu.ad&&cu.ad!==k)return;const r=cg[k]=cg[k]||{k,name:ad?adLabel(ad):'No ad ID (status ad / direct)',leads:0,ord:0,a:0,days:[],st:{}};r.leads++;const sid=first[2]||'';const ss=r.st[sid]=r.st[sid]||{l:0,o:0};ss.l++;
    const c=byPhone[p];if(!c)return;const os=c.os.filter(o=>o.date>=first[0].slice(0,10));if(!os.length)return;r.ord++;ss.o++;r.a+=os.reduce((t,o)=>t+(+o.amount||0),0);
    r.days.push(Math.round((new Date(os[0].date+'T12:00:00')-new Date(first[0].slice(0,10)+'T12:00:00'))/864e5))});
  const convRows=Object.values(cg).map(r=>({...r,pct:r.leads?Math.round(r.ord/r.leads*1000)/10:0,med:med(r.days)})).sort((a,b)=>(a.k[0]==='~')-(b.k[0]==='~')||b.leads-a.leads);
  const adOpts=[...new Set(C.map(c=>adKeyOf(c.lead1)).concat(Object.keys(leadCache&&leadCache.ads||{})))].filter(k=>k[0]!=='~').map(k=>[k,adLabel(k)]).sort((a,b)=>a[1].localeCompare(b[1]));
  /* ad × product, ad × district (orders in these dates) and ad × staff (leads in these dates) */
  const adName=k=>k==='~none'?'Not in CRM':k==='~noad'?'No ad ID':adLabel(k);
  const mix={};pOrders.forEach(({o})=>{const k=adKeyOf(o._lead);const r=mix[k]=mix[k]||{k,o:0,p:0,af:0,prod:{},dist:{}};r.o++;o.type==='affordable'?r.af++:r.p++;
    linesOf(o).forEach(l=>{const c=prodCode(l)||'NOT WRITTEN';r.prod[c]=(r.prod[c]||0)+(+l.qty||1)});const d=o.district||'Not written';r.dist[d]=(r.dist[d]||0)+1});
  const topOf=(m,n)=>Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([c,q])=>(CODE_NAMES[c]||c).toLowerCase()+' '+q).join(', ');
  const mixRows=Object.values(mix).sort((a,b)=>(a.k[0]==='~')-(b.k[0]==='~')||b.o-a.o).map(r=>({...r,name:adName(r.k),prods:topOf(r.prod,4),dists:topOf(r.dist,4)}));
  const sName2=Object.fromEntries(staff.map(x=>[x.id,x.name]));
  const staffConv=convRows.flatMap(r=>Object.entries(r.st).map(([sid,v])=>({ad:r.name,k:r.k,staff:sName2[sid]||'Not assigned',l:v.l,o:v.o,pct:v.l?Math.round(v.o/v.l*1000)/10:0}))).filter(x=>x.l).sort((a,b)=>(a.k[0]==='~')-(b.k[0]==='~')||a.ad.localeCompare(b.ad)||b.l-a.l);
  return{f,t,list,sum,monthly,districts,top,firstProds,staffRows,quiet,all:C,adRows,convRows,adOpts,mixRows,staffConv,weekRows,lagRows,noLead,pOrders:pOrders.length};
}
function custSheet(c){
  const sName=Object.fromEntries(staff.map(s=>[s.id,s.name])),wa=waLink(c.phone);
  openOv(el('h3',{text:c.name}),
    el('p',{class:'hint',text:[c.phone,c.district].filter(Boolean).join(' · ')}),
    el('div',{class:'row'},c.phone?el('a',{class:'btn',href:'tel:'+String(c.phone).replace(/[^\d+]/g,''),text:'Call'}):null,wa?el('a',{class:'btn',href:wa,target:'_blank',rel:'noopener',text:'WhatsApp'}):null),
    el('div',{class:'stats'},...[[c.n,'Orders'],[rs(c.amt),'Total'],[dm(c.first)+'/'+c.first.slice(2,4),'First order'],[dm(c.last)+'/'+c.last.slice(2,4),'Last order']].map(([v,l])=>el('div',{},el('b',{class:'mono',text:String(v)}),el('span',{text:l})))),
    c.leads&&c.leads.length?el('details',{open:true},el('summary',{text:'Messages in CRM ('+c.leads.length+')'}),el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},el('th',{text:'When'}),el('th',{text:'Ad'}),el('th',{text:'Campaign'}))),
      el('tbody',{},...c.leads.map(([at,ad])=>el('tr',{},el('th',{text:dm(at.slice(0,10))+'/'+at.slice(2,4)+' '+t12(at.slice(11))}),el('td',{text:ad?adLabel(ad):'—'}),el('td',{text:ad&&leadCache.ads&&leadCache.ads[ad]?leadCache.ads[ad].campaign:''}))))))):
      el('p',{class:'hint',text:leadCache?'This number is not in the CRM sheet.':'Loading messages…'}),
    el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Date','No.','Product','Type','Amount','Staff','Sent','Came from'].map(h=>el('th',{text:h})))),
      el('tbody',{},...c.os.slice().reverse().map(o=>el('tr',{},el('th',{text:dm(o.date)+'/'+o.date.slice(2,4)}),el('td',{text:o.orderNo||''}),el('td',{text:linesOf(o).map(l=>(l.product||'—')+((+l.qty||1)>1?' ×'+l.qty:'')).join(', ')}),
        el('td',{text:o.type==='affordable'?'Affordable':'Premium'}),el('td',{class:'mono',text:+o.amount?rs(+o.amount):'—'}),el('td',{text:sName[o.staffId]||''}),el('td',{text:o.dispatched==='TRUE'?'✓':''}),el('td',{text:o._lead?(o._lead.ad?adLabel(o._lead.ad)+' · ':'')+o._lead.days+'d after message':''})))))),
    el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Close',onclick:closeOv})));
}
function viewCustomers(){
  if(!allOrdersCache){call('allOrders',{adminPin}).then(j=>{allOrdersCache=j.orders||[];renderAdmin()}).catch(e=>toast('Could not load: '+e.message));return[el('div',{class:'empty',text:'Loading customers…'})]}
  if(!leadCache&&!leadLoading){leadLoading=true;call('leadMatch',{adminPin}).then(j=>{leadCache=j}).catch(e=>{leadCache={leads:{},ads:{},err:e.message}}).finally(()=>{leadLoading=false;renderAdmin()})}
  const R=custData(), set=(k,v)=>{cu[k]=v;cu.show=100;renderAdmin()};
  const spKey=R.f+'_'+R.t, owner=!mgrAccess;
  if(owner&&!adSpendCache[spKey]&&adSpendLoading!==spKey){adSpendLoading=spKey;call('adSpendByAd',{adminPin,from:R.f,to:R.t}).then(j=>{adSpendCache[spKey]=j.ads||{}}).catch(e=>{adSpendCache[spKey]={__err:e.message}}).finally(()=>{adSpendLoading='';renderAdmin()})}
  const presets=[['today','Today'],['yesterday','Yesterday'],['week','Last 7 days'],['month','This month'],['lastmonth','Last month'],['year','This year'],['all','All time'],['custom','Pick dates']];
  const sel=(id,label,key,opts,all)=>el('label',{class:'f',for:id},label,el('select',{id,onchange:e=>{if(key==='preset'&&e.target.value==='custom'&&!cu.from){cu.from=R.f;cu.to=R.t}set(key,e.target.value)}},
    ...(all?[el('option',{value:'',text:all})]:[]),...opts.map(([v,t])=>el('option',{value:v,text:t,selected:String(cu[key])===String(v)}))));
  const dists=[...new Set(R.all.map(c=>c.district).filter(Boolean))].sort();
  const stIds=[...new Set(R.all.map(c=>c.staffId).filter(Boolean))];
  const stOpts=staff.filter(s=>stIds.includes(s.id)).sort(byOrder).map(s=>[s.id,s.name]);
  const active=cu.q||cu.district||cu.staff||cu.kind||cu.ad;
  const head=el('div',{class:'panel'},
    el('div',{class:'toolbar'},el('h3',{text:'Customers · '+rpLabel(R.f,R.t)}),el('div',{class:'row'},
      el('button',{class:'btn',type:'button',text:'Reload',onclick:()=>{allOrdersCache=null;leadCache=null;renderAdmin()}}),
      el('button',{class:'btn primary',type:'button',text:'Download Excel',onclick:()=>custXlsx(R)}))),
    el('div',{class:'form2'},
      sel('cu-p','Came',  'preset',presets),
      sel('cu-by','Date means','by',[['first','First order (new customers)'],['any','Any order in these dates']]),
      cu.preset==='custom'?el('label',{class:'f',for:'cu-f'},'From',el('input',{id:'cu-f',type:'date',value:cu.from,max:todayStr,onchange:e=>set('from',e.target.value)})):null,
      cu.preset==='custom'?el('label',{class:'f',for:'cu-t'},'To',el('input',{id:'cu-t',type:'date',value:cu.to,max:todayStr,onchange:e=>set('to',e.target.value)})):null,
      el('label',{class:'f',for:'cu-q'},'Search name / phone',el('input',{id:'cu-q',type:'search',value:cu.q,placeholder:'Name or number',onchange:e=>set('q',e.target.value)})),
      sel('cu-d','District','district',dists.map(v=>[v,v]),'All'),
      sel('cu-s','Staff (first order)','staff',stOpts,'All'),
      sel('cu-a','Ad','ad',[...R.adOpts,['~noad','In CRM, no ad ID'],['~none','Number not in CRM']],'All ads'),
      sel('cu-k','Customer','kind',[['new','Ordered once'],['repeat','Repeat (2+ orders)']],'All'),
      sel('cu-o','Sort','sort',[['new','Newest customer first'],['last','Last order first'],['sales','Most spent'],['orders','Most orders'],['name','Name A–Z']])),
    active?el('div',{class:'row'},el('button',{class:'btn',type:'button',text:'Clear filters',onclick:()=>{Object.assign(cu,{q:'',district:'',staff:'',kind:'',ad:''});renderAdmin()}})):null);
  const stat=(v,l)=>el('div',{},el('b',{class:'mono',text:String(v)}),el('span',{text:l}));
  const S=R.sum;
  const summary=el('div',{class:'panel'},el('div',{class:'stats'},stat(S.n,'Customers'),stat(S.isNew,'New'),stat(S.repeat,'Repeat (2+ orders)'),stat(S.orders,'Orders in dates'),stat(rs(S.sales),'Sales in dates'),stat(S.n?rs(S.sales/S.n):'—','Per customer')),
    el('p',{class:'hint',text:'One row per customer, matched by phone number. "New" = first ever order falls in these dates. "Repeat" counts all their orders, any date.'}));
  const tbl=(cols,rows)=>el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...cols.map(c=>el('th',{text:c})))),
    el('tbody',{},...rows.map(r=>el('tr',{},...r.map((c,i)=>i?el('td',{class:typeof c==='number'?'mono':'',text:String(c)}):el('th',{text:String(c)})))))));
  const shown=R.list.slice(0,cu.show);
  const listP=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Customer list ('+R.list.length+')'}),R.list.length?el('div',{class:'row'},
      el('button',{class:'btn',type:'button',text:'📊 Excel',title:'This list (with your filters) as an Excel sheet',onclick:()=>custListXlsx(R)}),
      el('button',{class:'btn',type:'button',text:'📄 PDF',title:'This list (with your filters) as a PDF',onclick:()=>custListPdf(R)})):null),
    R.list.length?scrollBox(el('table',{},el('thead',{},el('tr',{},...['Customer','Phone','District','First message','First order','Days','Ad','Campaign','Last order','Orders','Total spent','Staff'].map(h=>el('th',{text:h})))),
      el('tbody',{},...shown.map(c=>el('tr',{class:leadCache&&!c.lead1&&String(c.phone||'').replace(/\D/g,'').length>=7?'miss':'',style:'cursor:pointer',onclick:()=>custSheet(c)},el('th',{text:c.name+(c.n>1?' ⟳':'')}),el('td',{class:'mono',text:c.phone||''}),el('td',{text:c.district||''}),
        fmCell(c),el('td',{text:dm(c.first)+'/'+c.first.slice(2,4)}),el('td',{class:'mono',text:c.lead1?String(c.lead1.days):''}),el('td',{text:c.lead1&&c.lead1.ad?adLabel(c.lead1.ad):''}),el('td',{text:c.lead1&&c.lead1.ad?adCamp(c.lead1.ad):''}),el('td',{text:dm(c.last)+'/'+c.last.slice(2,4)}),el('td',{class:'mono',text:String(c.n)}),el('td',{class:'mono',text:c.amt?rs(c.amt):'—'}),el('td',{text:c.staffName})))))):
      el('div',{class:'empty',text:'No customers for these dates and filters.'}),
    R.list.length>cu.show?el('button',{class:'btn',type:'button',text:'Show more ('+(R.list.length-cu.show)+' left)',onclick:()=>{cu.show+=200;renderAdmin()}}):null,
    R.list.length?el('p',{class:'hint',text:'Tap a customer to see all their orders and messages, call or WhatsApp. ⟳ = repeat customer. First message / Ad / Campaign = the CRM lead (by phone) that led to their first order; Days = days from that message to the order.'}):null);
  const monthP=el('div',{class:'panel'},el('h3',{text:'New vs repeat customers · by month'}),
    tbl(['Month','New','Came back','Repeat %','Orders','Sales'],R.monthly.slice().reverse().map(r=>[MON[+r.m.slice(5)-1]+' '+r.m.slice(0,4),r.nw,r.ret,r.rate+'%',r.ords,rs(r.sales)])),
    el('p',{class:'hint',text:'"Came back" = ordered that month but their first order was in an earlier month. Not affected by the filters above.'}));
  const distP=el('div',{class:'panel'},el('h3',{text:'Districts'}),R.districts.length?tbl(['District','Customers','New','Orders in dates','Sales in dates'],R.districts.slice(0,25).map(r=>[r.k,r.c,r.nw,r.o,rs(r.a)])):el('div',{class:'empty',text:'No customers.'}));
  const topP=el('div',{class:'panel'},el('h3',{text:'Top customers (all-time spend)'}),R.top.length?tbl(['Customer','Phone','District','Orders','Total spent','Last order'],R.top.map(c=>[c.name,c.phone||'',c.district||'',c.n,rs(c.amt),dm(c.last)+'/'+c.last.slice(2,4)])):el('div',{class:'empty',text:'No customers.'}));
  const fpP=el('div',{class:'panel'},el('h3',{text:'What new customers buy first'}),R.firstProds.length?tbl(['Product','New customers'],R.firstProds.map(([p,n])=>[CODE_NAMES[p]||p,n])):el('div',{class:'empty',text:'No new customers in these dates.'}));
  const stP=el('div',{class:'panel'},el('h3',{text:'Staff · new and repeat customers'}),R.staffRows.length?tbl(['Staff','New customers','Repeat orders','Sales'],R.staffRows.map(r=>[r.name,r.nw,r.rep,rs(r.a)])):el('div',{class:'empty',text:'No orders in these dates.'}),
    el('p',{class:'hint',text:'New customers = their first ever order was taken by this person in these dates. Repeat orders = orders from customers who had ordered before.'}));
  const qShown=R.quiet.slice(0,50);
  const quietP=el('div',{class:'panel'},el('div',{class:'toolbar'},el('h3',{text:'Gone quiet — follow up ('+R.quiet.length+')'}),
      el('select',{id:'cu-qt','aria-label':'No order for',onchange:e=>{cu.quiet=+e.target.value;renderAdmin()}},...[[30,'No order 30+ days'],[60,'No order 60+ days'],[90,'No order 90+ days'],[180,'No order 180+ days']].map(([v,t])=>el('option',{value:v,text:t,selected:cu.quiet===v})))),
    R.quiet.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Customer','Phone','District','Last order','Orders','Total spent','Staff'].map(h=>el('th',{text:h})))),
      el('tbody',{},...qShown.map(c=>el('tr',{style:'cursor:pointer',onclick:()=>custSheet(c)},el('th',{text:c.name}),el('td',{class:'mono',text:c.phone||''}),el('td',{text:c.district||''}),el('td',{text:dm(c.last)+'/'+c.last.slice(2,4)}),el('td',{class:'mono',text:String(c.n)}),el('td',{class:'mono',text:c.amt?rs(c.amt):'—'}),el('td',{text:c.staffName})))))):
      el('div',{class:'empty',text:'Nobody in this list.'}),
    el('p',{class:'hint',text:'Customers whose last order was within the past year but not in the chosen days — biggest buyers first'+(R.quiet.length>50?'; the first 50 are shown, Excel has all':'')+'. Good list for WhatsApp offers and calls.'}));
  const leadNote=!leadCache?el('p',{class:'hint',text:'Matching phone numbers with the Leadvyne CRM sheet…'}):leadCache.err?el('p',{class:'hint',style:'color:var(--accent)',text:/unknown action/i.test(leadCache.err)?'Message dates and ads will show once the new Code.gs is put in Apps Script and deployed.':'Could not read the CRM sheet: '+leadCache.err}):
    el('p',{class:'hint',text:'From the Leadvyne CRM sheet'+(leadCache.synced?' (lead sync '+leadCache.synced+')':'')+'. Ad ID comes only for click-to-WhatsApp ads, and only from when the CRM started filling it.'+(leadCache.note?' Ad names: '+leadCache.note:'')});
  const adP=el('div',{class:'panel'},el('h3',{text:'Which ad brought these orders'}),leadNote,
    R.adRows.length?tbl(['Ad','Campaign','Orders','New customers','Sales','Messages from','Usual days to order'],R.adRows.map(r=>[r.name,r.camp,r.o,r.nw,rs(r.a),r.first?dm(r.first)+' – '+dm(r.last):'',r.med==null?'':r.med+' days'])):el('div',{class:'empty',text:'No orders in these dates.'}),
    el('p',{class:'hint',text:'Orders in these dates, each joined to the message that started it. "Messages from" = when those customers first wrote. Usual days = the middle value, so one slow customer does not skew it.'}));
  const convP=el('div',{class:'panel'},el('h3',{text:'Leads → orders, by ad'}),R.convRows.length?tbl(['Ad','Leads','Ordered','Conversion','Sales','Usual days to order'],R.convRows.map(r=>[r.name,r.leads,r.ord,r.pct+'%',rs(r.a),r.med==null?'':r.med+' days'])):el('div',{class:'empty',text:leadCache?'No new leads in these dates.':'Loading…'}),
    el('p',{class:'hint',text:'People who first messaged in these dates (from the CRM sheet), grouped by the ad they came from, and how many of them have ordered so far. Recent dates look low because many have not ordered yet.'}));
  let spendP=null;
  if(owner){const SP=adSpendCache[spKey];
    if(!SP)spendP=el('div',{class:'panel'},el('h3',{text:'Ad spend & cost per order'}),el('p',{class:'hint',text:'Loading spend from Meta…'}));
    else if(SP.__err)spendP=el('div',{class:'panel'},el('h3',{text:'Ad spend & cost per order'}),el('p',{class:'hint',style:'color:var(--accent)',text:/unknown action/i.test(SP.__err)?'Needs the new Code.gs deployed.':'Could not read spend: '+SP.__err}));
    else{const ids=[...new Set(Object.keys(SP).concat(R.adRows.map(r=>r.k)).concat(R.convRows.map(r=>r.k)))].filter(k=>k[0]!=='~'&&(!cu.ad||cu.ad===k));
      const rows=ids.map(k=>{const sp=SP[k]||{},o=R.adRows.find(r=>r.k===k)||{},c=R.convRows.find(r=>r.k===k)||{};const spend=sp.spend||0,leads=c.leads||0,ord=o.o||0,sales=o.a||0;
        return{name:sp.name||adLabel(k),camp:sp.campaign||(leadCache&&leadCache.ads&&leadCache.ads[k]||{}).campaign||'',spend,leads,ord,sales,cpl:leads?spend/leads:null,cpo:ord?spend/ord:null,roas:spend?sales/spend:null}}).filter(r=>r.spend||r.ord||r.leads).sort((a,b)=>b.spend-a.spend||b.ord-a.ord);
      const T=rows.reduce((t,r)=>({spend:t.spend+r.spend,leads:t.leads+r.leads,ord:t.ord+r.ord,sales:t.sales+r.sales}),{spend:0,leads:0,ord:0,sales:0});
      const f2=v=>v==null?'—':rs(v),rx=v=>v==null?'—':(Math.round(v*10)/10)+'x';
      spendP=el('div',{class:'panel'},el('h3',{text:'Ad spend & cost per order (admin only)'}),rows.length?el('div',{class:'scroll'},el('table',{},el('thead',{},el('tr',{},...['Ad','Campaign','Spend','Leads','Cost / lead','Orders','Cost / order','Sales','ROAS'].map(h=>el('th',{text:h})))),
        el('tbody',{},...rows.map(r=>el('tr',{},el('th',{text:r.name}),el('td',{text:r.camp}),el('td',{class:'mono',text:rs(r.spend)}),el('td',{class:'mono',text:String(r.leads)}),el('td',{class:'mono',text:f2(r.cpl)}),el('td',{class:'mono',text:String(r.ord)}),el('td',{class:'mono',text:f2(r.cpo)}),el('td',{class:'mono',text:rs(r.sales)}),el('td',{class:'mono',text:rx(r.roas)})))),
        el('tfoot',{},el('tr',{},el('th',{text:'Total'}),el('td',{text:''}),el('td',{class:'mono',text:rs(T.spend)}),el('td',{class:'mono',text:String(T.leads)}),el('td',{class:'mono',text:f2(T.leads?T.spend/T.leads:null)}),el('td',{class:'mono',text:String(T.ord)}),el('td',{class:'mono',text:f2(T.ord?T.spend/T.ord:null)}),el('td',{class:'mono',text:rs(T.sales)}),el('td',{class:'mono',text:rx(T.spend?T.sales/T.spend:null)}))))):el('div',{class:'empty',text:'No ad spend or ad orders in these dates.'}),
        el('p',{class:'hint',text:'Spend = Meta spend on each ad in these dates. Leads = people who first messaged from that ad in these dates. Orders and sales = orders placed in these dates whose message came from that ad (some messaged before these dates). Orders without an ad ID are not counted here, so real cost per order is lower.'}));
      R.spendRows=rows}}
  const mixP=el('div',{class:'panel'},el('h3',{text:'Ad × product & district'}),R.mixRows.length?tbl(['Ad','Orders','Premium','Affordable','Top products','Top districts'],R.mixRows.map(r=>[r.name,r.o,r.p,r.af,r.prods,r.dists])):el('div',{class:'empty',text:'No orders in these dates.'}));
  const scP=el('div',{class:'panel'},el('h3',{text:'Ad × staff · leads to orders'}),R.staffConv.length?tbl(['Ad','Staff','Leads','Ordered','Conversion'],R.staffConv.map(r=>[r.ad,r.staff,r.l,r.o,r.pct+'%'])):el('div',{class:'empty',text:leadCache?'No new leads in these dates.':'Loading…'}),
    el('p',{class:'hint',text:'Leads assigned to each person in Leadvyne (first message in these dates), and how many have ordered so far.'}));
  const wkP=el('div',{class:'panel'},el('h3',{text:'Week the customer messaged'}),R.weekRows.length?tbl(['Week (Mon–Sun)','Orders','Sales','Ads (orders)'],R.weekRows.map(r=>[r.k==='~'?'Not in CRM':dm(r.k)+'/'+r.k.slice(2,4)+' – '+dm(addDays(r.k,6)),r.o,rs(r.a),r.topAd])):el('div',{class:'empty',text:'No orders in these dates.'}),
    el('p',{class:'hint',text:'The orders placed in these dates, grouped by the week their message came in — so you can see which week\'s ads are paying off now.'}));
  const lagP=el('div',{class:'panel'},el('h3',{text:'Days from message to order'}),tbl(['Time taken','Orders','Sales'],R.lagRows.map(r=>[r.l,r.o,rs(r.a)]).concat(R.noLead?[['Number not in CRM',R.noLead,'']]:[])));
  return[head,summary,listP,el('h2',{class:'sect',text:'Ads & messages'}),spendP,adP,convP,mixP,scP,wkP,lagP,el('h2',{class:'sect',text:'Customer reports'}),monthP,distP,topP,fpP,stP,quietP];
}
/* First message date for customers who are not in the CRM sheet: staff check the WhatsApp chat and type the date.
   (CRM dates can't be changed here.) */
function fmDateSheet(name,phone,cur,maxD,save){
  const inp=el('input',{id:'fm-d',type:'date',value:cur||'',max:maxD||ymd(new Date()),style:'font-size:17px'});
  const wa=waLink(phone);
  const go=async v=>{if(v&&maxD&&v>maxD){toast('First message must be on or before the first order ('+dm(maxD)+').');return}
    try{await save(v);closeOv();toast(v?'First message date saved':'Date removed')}catch(e){toast(/Unknown action/i.test(e.message)?'Update the sheet script (Code.gs) first.':e.message)}};
  openOv(el('h3',{text:'First message · '+name}),
    el('p',{class:'hint',text:'Open the WhatsApp chat, scroll to the very first message from this customer and pick that date.'}),
    wa?el('a',{class:'btn',href:wa,target:'_blank',rel:'noopener',text:'💬 Open WhatsApp chat'}):null,
    el('label',{class:'f',for:'fm-d'},'First message date',inp),
    el('div',{class:'row'},el('button',{class:'btn primary',type:'button',text:'Save',onclick:()=>{if(!inp.value){toast('Pick the date.');return}go(inp.value)}}),
      cur?el('button',{class:'btn',type:'button',text:'Remove',onclick:()=>go('')}):null,el('button',{class:'btn',type:'button',text:'Cancel',onclick:closeOv})))}
function fmCell(c){
  if(!leadCache)return el('td',{text:'…'});
  const L=c.lead1,p=String(c.phone||'').replace(/\D/g,'').slice(-10);
  const save=async v=>{await call('saveFirstMsg',{adminPin,phone:c.phone,date:v});if(leadCache.leads){if(v)leadCache.leads[p]=[[v+' 00:00','','','manual']];else delete leadCache.leads[p]}renderAdmin()};
  const open=e=>{e.stopPropagation();fmDateSheet(c.name,c.phone,L&&L.manual?L.day:'',c.first,save)};
  if(L&&!L.manual)return el('td',{text:dm(L.day)+'/'+L.day.slice(2,4)});
  if(L)return el('td',{style:'white-space:nowrap'},el('span',{title:'Typed by staff after checking WhatsApp',text:dm(L.day)+'/'+L.day.slice(2,4)+' ✎'}),' ',el('button',{class:'btn',type:'button',style:'padding:2px 8px;font-size:12px',text:'Edit',onclick:open}));
  if(!p)return el('td',{text:'—'});
  return el('td',{style:'white-space:nowrap'},el('a',{class:'btn',href:waLink(c.phone),target:'_blank',rel:'noopener',style:'padding:3px 8px;font-size:12px',title:'Open the WhatsApp chat',text:'💬',onclick:e=>e.stopPropagation()}),' ',
    el('button',{class:'btn',type:'button',style:'padding:3px 8px;font-size:12px',text:'+ Date',onclick:open}))}
/* Customer list only (same filters and order as on screen) — Excel or PDF */
const custRow=c=>[c.name+(c.n>1?' (repeat)':''),c.phone||'',c.district||'',c.lead1?dm(c.lead1.day)+'/'+c.lead1.day.slice(2,4):'',dm(c.first)+'/'+c.first.slice(2,4),c.lead1?c.lead1.days:'',c.lead1&&c.lead1.ad?adLabel(c.lead1.ad):'',c.lead1&&c.lead1.ad?adCamp(c.lead1.ad):'',dm(c.last)+'/'+c.last.slice(2,4),c.n,c.amt||0,c.staffName||''];
const CUST_COLS=['Customer','Phone','District','First message','First order','Days','Ad','Campaign','Last order','Orders','Total spent','Staff'];
function custListXlsx(R){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const aoa=[CUST_COLS.map(c=>c.toUpperCase())].concat(R.list.map(custRow));
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(aoa);ws['!cols']=[24,13,16,12,12,6,30,34,12,7,11,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'CUSTOMERS');
  saveFile('COUPLO_CUSTOMERS_'+R.f+(R.f===R.t?'':'_to_'+R.t)+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT)}
function custListPdf(R){
  const J=window.jspdf&&window.jspdf.jsPDF;if(!J){toast('PDF tool did not load. Check the internet and reload.');return}
  const doc=new J({unit:'pt',format:'a4',orientation:'landscape'});const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=24,TW=W-2*M;let y=0,pg=0;
  const ws=[.12,.075,.09,.06,.06,.035,.17,.17,.06,.04,.06,.06];const xs=[];let x=M;ws.forEach(w=>{xs.push(x);x+=w*TW});
  const header=()=>{pg++;doc.setFillColor(81,31,82);doc.rect(0,0,W,50,'F');doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('COUPLO DESIGN STUDIO',M,24);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Customer list  |  '+rpLabel(R.f,R.t)+'  |  '+R.list.length+' customers',M,39);doc.text('Page '+pg,W-M,39,{align:'right'});doc.setTextColor(30);y=66};
  const row=(cells,bold,fill)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(7.5);
    const lines=cells.map((c,i)=>doc.splitTextToSize(pdfTxt(c),ws[i]*TW-6));const h=Math.max(1,...lines.map(l=>l.length))*9+6;
    if(y+h>H-24){doc.addPage();header();if(!bold)row(CUST_COLS,true,[243,235,243]);doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(7.5)}
    if(fill){doc.setFillColor(...fill);doc.rect(M,y,TW,h,'F')}
    lines.forEach((l,i)=>doc.text(l,xs[i]+3,y+10));doc.setDrawColor(222);doc.line(M,y+h,M+TW,y+h);y+=h};
  header();row(CUST_COLS,true,[243,235,243]);
  R.list.forEach(c=>{const r=custRow(c);r[10]=r[10]?rsPlain(r[10]):'-';row(r,false)});
  const tot=R.list.reduce((a,c)=>a+(+c.amt||0),0),ords=R.list.reduce((a,c)=>a+(+c.n||0),0);
  row(['Total ('+R.list.length+')','','','','','','','','',ords,rsPlain(tot),''],true,[248,244,248]);
  saveFile('COUPLO_CUSTOMERS_'+R.f+(R.f===R.t?'':'_to_'+R.t)+'.pdf',doc.output('arraybuffer'),'application/pdf')}
function custXlsx(R){
  if(typeof XLSX==='undefined'){toast('Excel tool did not load. Check the internet and reload.');return}
  const wb=XLSX.utils.book_new(),add=(name,rows)=>{const ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=(rows[1]||rows[0]).map((_,i)=>({wch:i?14:24}));XLSX.utils.book_append_sheet(wb,ws,name)};
  add('CUSTOMERS',[['CUSTOMER','PHONE','DISTRICT','FIRST MESSAGE','DAYS TO ORDER','AD','CAMPAIGN','FIRST ORDER','LAST ORDER','ORDERS (ALL TIME)','TOTAL SPENT','ORDERS IN DATES','SALES IN DATES','REPEAT','STAFF (FIRST ORDER)','FIRST PRODUCT'],
    ...R.list.map(c=>[c.name,c.phone||'',c.district||'',c.lead1?c.lead1.at:'',c.lead1?c.lead1.days:'',c.lead1&&c.lead1.ad?adLabel(c.lead1.ad):'',c.lead1&&c.lead1.ad?adCamp(c.lead1.ad):'',c.first,c.last,c.n,c.amt,c.pn,c.pamt,c.n>1?'YES':'NO',c.staffName,c.firstProd.join(', ')])]);
  add('ADS',[['AD','CAMPAIGN','AD ID','ORDERS','NEW CUSTOMERS','SALES','MESSAGES FROM','MESSAGES TO','USUAL DAYS TO ORDER'],...R.adRows.map(r=>[r.name,r.camp,r.k[0]==='~'?'':r.k,r.o,r.nw,r.a,r.first,r.last,r.med==null?'':r.med])]);
  add('LEADS TO ORDERS',[['AD','LEADS','ORDERED','CONVERSION %','SALES','USUAL DAYS TO ORDER'],...R.convRows.map(r=>[r.name,r.leads,r.ord,r.pct,r.a,r.med==null?'':r.med])]);
  if(R.spendRows)add('AD SPEND',[['AD','CAMPAIGN','SPEND','LEADS','COST PER LEAD','ORDERS','COST PER ORDER','SALES','ROAS'],...R.spendRows.map(r=>[r.name,r.camp,Math.round(r.spend),r.leads,r.cpl==null?'':Math.round(r.cpl),r.ord,r.cpo==null?'':Math.round(r.cpo),r.sales,r.roas==null?'':Math.round(r.roas*10)/10])]);
  add('AD X PRODUCT',[['AD','ORDERS','PREMIUM','AFFORDABLE','TOP PRODUCTS','TOP DISTRICTS'],...R.mixRows.map(r=>[r.name,r.o,r.p,r.af,r.prods,r.dists])]);
  add('AD X STAFF',[['AD','STAFF','LEADS','ORDERED','CONVERSION %'],...R.staffConv.map(r=>[r.ad,r.staff,r.l,r.o,r.pct])]);
  add('MESSAGE WEEK',[['WEEK STARTING','ORDERS','SALES','ADS'],...R.weekRows.map(r=>[r.k==='~'?'NOT IN CRM':r.k,r.o,r.a,r.topAd])]);
  add('DAYS TO ORDER',[['TIME TAKEN','ORDERS','SALES'],...R.lagRows.map(r=>[r.l,r.o,r.a])]);
  add('NEW VS REPEAT',[['MONTH','NEW','CAME BACK','REPEAT %','ORDERS','SALES'],...R.monthly.map(r=>[r.m,r.nw,r.ret,r.rate,r.ords,r.sales])]);
  add('DISTRICTS',[['DISTRICT','CUSTOMERS','NEW','ORDERS IN DATES','SALES IN DATES'],...R.districts.map(r=>[r.k,r.c,r.nw,r.o,r.a])]);
  add('TOP CUSTOMERS',[['CUSTOMER','PHONE','DISTRICT','ORDERS','TOTAL SPENT','LAST ORDER'],...R.top.map(c=>[c.name,c.phone||'',c.district||'',c.n,c.amt,c.last])]);
  add('FIRST PRODUCT',[['PRODUCT','NEW CUSTOMERS'],...R.firstProds.map(([p,n])=>[CODE_NAMES[p]||p,n])]);
  add('STAFF',[['STAFF','NEW CUSTOMERS','REPEAT ORDERS','SALES'],...R.staffRows.map(r=>[r.name,r.nw,r.rep,r.a])]);
  add('FOLLOW UP',[['CUSTOMER','PHONE','DISTRICT','LAST ORDER','ORDERS','TOTAL SPENT','STAFF'],...R.quiet.map(c=>[c.name,c.phone||'',c.district||'',c.last,c.n,c.amt,c.staffName])]);
  saveFile('COUPLO_CUSTOMERS_'+R.f+(R.f===R.t?'':'_to_'+R.t)+'.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}),XLSXT);
}

function boot(){
  applyTheme(LS.get('theme'));
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
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(()=>{});
/* ---- AI Assistant (Nov 2026): ask questions about the app's data. Server: aiAsk in Code.gs (Google Gemini). ----
   The chat stays while you move between tabs; it clears on log out. Read only — it never changes data. */
let aiChat=[],aiBusy=false;
function aiFmt(t){/* tiny safe markdown: **bold**, - lists, line breaks */
  const box=el('div',{class:'aitext'});
  String(t||'').split('\n').forEach(line=>{
    const li=/^\s*[-*•]\s+/.test(line), num=/^\s*\d+[.)]\s+/.test(line);
    const row=el('div',{style:(li||num)?'padding-left:14px;text-indent:-10px;margin:2px 0':'margin:2px 0;min-height:6px'});
    const txt=li?'• '+line.replace(/^\s*[-*•]\s+/,''):line;
    txt.split(/(\*\*[^*]+\*\*)/).forEach(seg=>{if(/^\*\*[^*]+\*\*$/.test(seg))row.append(el('b',{text:seg.slice(2,-2)}));else if(seg)row.append(document.createTextNode(seg.replace(/^#+\s*/,'')))});
    box.append(row)});
  return box}
function viewAi(){
  const log=el('div',{style:'display:flex;flex-direction:column;gap:10px;margin:10px 0'});
  const bubble=(m)=>el('div',{style:'max-width:92%;padding:10px 12px;border-radius:14px;line-height:1.45;white-space:normal;word-break:break-word;'+(m.role==='user'?'align-self:flex-end;background:#511F52;color:#fff':'align-self:flex-start;background:var(--card,#f4eef6);border:1px solid rgba(81,31,82,.18)')+(m.err?';border-color:#b3261e;color:#b3261e':'')},m.role==='user'?m.text:aiFmt(m.text));
  const draw=()=>{log.replaceChildren(...aiChat.map(bubble));if(aiBusy)log.append(el('div',{class:'meta',style:'align-self:flex-start',text:'Thinking…'}));setTimeout(()=>{const last=log.lastElementChild;if(last)last.scrollIntoView({block:'nearest'})},0)};
  const ta=el('textarea',{rows:'2',placeholder:'Ask anything about orders, staff, attendance… (Malayalam / English)',style:'width:100%;box-sizing:border-box;font:inherit;font-size:16px;padding:10px;border-radius:10px;border:1px solid #bbb;resize:vertical'});
  const sendB=el('button',{class:'btn primary',type:'button',text:'Ask'});
  const ask=async(q)=>{q=String(q||ta.value).trim();if(!q||aiBusy)return;ta.value='';
    const history=aiChat.filter(m=>!m.err).slice(-8).map(m=>({role:m.role,text:m.text}));
    aiChat.push({role:'user',text:q});aiBusy=true;sendB.disabled=true;draw();
    try{const r=await call('aiAsk',{adminPin,question:q,history});aiChat.push({role:'model',text:r.answer})}
    catch(e){aiChat.push({role:'model',text:/Unknown action|No access for/i.test(e.message)&&!mgrAccess?'Update the sheet script (Code.gs) first.':e.message,err:true})}
    aiBusy=false;sendB.disabled=false;draw()};
  sendB.onclick=()=>ask();
  ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&window.innerWidth>700){e.preventDefault();ask()}});
  const ideas=['How many orders today, by staff?','Top 5 products this month','Which district gave the most orders this month?','Who came late this week?','Orders not dispatched yet','Compare this month with last month'];
  const chips=el('div',{class:'row',style:'flex-wrap:wrap;gap:6px'},...ideas.map(t=>el('button',{class:'btn',type:'button',style:'font-size:13px;padding:6px 10px',text:t,onclick:()=>ask(t)})));
  draw();
  return [el('div',{class:'panel'},el('h3',{text:'✨ AI Assistant'}),
    el('p',{class:'hint',text:'Ask in Malayalam, Manglish or English. It reads the last 60 days of orders'+(can('register')?', attendance':'')+(can('work')?', work':'')+(can('sales')?', leads':'')+(!mgrAccess?', ad spend':'')+' and monthly totals. It cannot change anything. Customer names and phone numbers are not sent to the AI.'}),
    aiChat.length?null:chips,log,ta,
    el('div',{class:'row',style:'margin-top:8px'},sendB,aiChat.length?el('button',{class:'btn',type:'button',text:'New chat',onclick:()=>{aiChat=[];renderAdmin()}}):null))]}
boot();
})();
