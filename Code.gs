/**
 * Couplo Attendance — Google Sheet server
 * Paste this whole file into Extensions → Apps Script of a new Google Sheet,
 * run setup() once, then Deploy → New deployment → Web app
 * (Execute as: Me, Who has access: Anyone).
 */
var TZ = 'Asia/Kolkata';
var SHEETS = {
  Staff:      ['id','name','role','salary','pin','sales','active','order','email'],
  Attendance: ['key','date','staffId','status','in','out','note','lateReason','earlyReason'],
  Sales:      ['key','date','staffId','leads','premium','affordable','amount','calls','answered','missed','called'],
  Pay:        ['key','month','staffId','advance','extra','note'],
  Orders:     ['id','orderNo','date','staffId','type','customer','phone','district','pincode','product','qty','amount','dispatched','note','createdAt','items','designDoneAt','dispatchedAt'],  // items = JSON list when one order has several products; designDoneAt / dispatchedAt = when Hiba / Jaseera finished it
  Products:   ['id','name','type','price','active','order'],
  Tasks:      ['id','category','name','kind','order','active','options'],
  Work:       ['key','date','staffId','taskId','value','updatedAt'],
  Settings:   ['key','value'],
  Capi:       ['id','status','sentAt','orderNo','value','note'],   // Meta Conversions API log — one row per order sent
  EditLog:    ['time','action','staff','date','before','after'],   // every admin change to attendance / attendance settings (cannot be changed from the app)
  /* ---- Weekly Arena (Nov 2026) ---- */
  Media:      ['id','date','staffId','product','concept','title','status','reedits','igLink','createdAt','decidedAt'], // one video / post; status pending | approved | reedit
  Happy:      ['key','date','staffId','count','by','updatedAt'],   // happy customer moments per sales person per day (Mashida enters)
  Accounts:   ['key','date','staffId','banks','cash','expenses','mismatch','fixed','vendors','note','submittedAt'], // Mashida's daily balance report
  Issues:     ['id','date','orderNo','kind','blame','note','by','status','createdAt'],  // reprint / damage / rework; blame = staff id; status pending | approved | rejected
  Bonus:      ['id','date','staffId','points','note','createdAt']   // admin +/- points (top reel, mistakes…)
};
/* daily work items. category = a staff category (Media, Production, Office) OR one staff id (e.g. jaseera).
   kind: count = a number, yesno = done / not done, colours = colour + how many, items = fixed list + how many, text = short note */
var TASK_SEED = [
  // Jaseera — printing production
  ['orders-received','Printing','ORDERS RECEIVED TODAY','count',''],
  ['printed-items','Printing','PRINTED (BY PRODUCT)','items','PHR:PREMIUM HALF ROMBER,PFR:PREMIUM FULL ROMBER,PPR:PREMIUM PANT ROMBER,AFR:AFFORDABLE FULL ROMBER,AHR:AFFORDABLE HALF ROMBER,T SHIRT,TURKEY,CAP'],
  ['printed-orders','Printing','PRINTED ORDER NOs','text',''],
  ['reprint','Printing','REPRINT (ORDER NOs)','text',''],
  ['washing','Printing','WASHING','count',''],
  ['balance-printing','Printing','BALANCE ORDERS FOR PRINTING','count',''],
  ['damage','Printing','DAMAGE','count',''],
  ['print-remarks','Printing','REMARKS','text',''],
  // Rahila — accessories (add-ons) and design (taken over from Hiba, Oct 2026)
  ['bows','rahila','BOWS','colours',''],['leg-socks','rahila','LEG SOCKS','count',''],['hair-bows','rahila','HAIR BOWS','count',''],
  ['boots','rahila','BOOTS','count',''],['mittens','rahila','MITTENS','count',''],['designs','rahila','DESIGNS DONE','count',''],
  // Media
  ['video-editing','Media','VIDEO EDITING','count',''],['reels','Media','REELS UPLOADING','count',''],['stories','Media','STORIES UPLOADING','yesno',''],
  ['shooting','Media','SHOOTING','count',''],['printing','Media','PRINTING','count',''],['ch-couplo','Media','COUPLO CHANNEL','yesno',''],
  ['ch-print-trend','Media','PRINT AND TREND CHANNEL','yesno',''],['ch-photos','Media','PHOTOS CHANNEL','yesno','']
];
var KINDS = ['count', 'yesno', 'colours', 'items', 'text'];
/* starter product list (admin can edit in the app: Admin → Products) */
var PRODUCT_SEED = [
  ['FULL ROMBER','premium',''],['HALF ROMBER','premium',''],['PANT TYPE ROMBER','premium',''],
  ['SKIRTS','premium',''],['CODSET','premium',''],['T SHIRT','premium',''],
  ['FULL ROMBER','affordable',''],['HALF ROMBER','affordable',''],['CODSET','affordable','']
];

/* ---------- one-time setup ---------- */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS[name].length).setNumberFormat('@'); // keep times/dates as text
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var def = ss.getSheetByName('Sheet1'); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  var set = ss.getSheetByName('Settings'), have = {};
  if (set.getLastRow() >= 2) set.getRange(2, 1, set.getLastRow() - 1, 1).getValues().forEach(function (r) { have[r[0]] = 1; });
  [['lateAfter', '09:40'], ['minHours', '8'], ['reportOn', 'TRUE'], ['reportHour', '19'], ['reportEmail', Session.getEffectiveUser().getEmail()]].forEach(function (kv) { if (!have[kv[0]]) set.appendRow(kv); });
  var staff = ss.getSheetByName('Staff');
  if (staff.getLastRow() < 2) {
    staff.getRange(2, 1, 6, 8).setValues([
      ['vinaya','VINAYA','Sales','12000','','TRUE','TRUE','1'],
      ['rahila','RAHILA','Media','9000','','FALSE','TRUE','2'],
      ['hiba','HIBA','Production','8000','','FALSE','TRUE','3'],
      ['reshma','RESHMA','Sales','7000','','TRUE','TRUE','4'],
      ['jaseera','JASEERA','Production','9000','','FALSE','TRUE','5'],
      ['mashida','MASHIDA','Office','7000','','FALSE','TRUE','6']
    ]);
  }
  // Fida (sales) — added once if missing
  if (!rows_('Staff').some(function (r) { return r.id === 'fida'; }))
    staff.getRange(staff.getLastRow() + 1, 1, 1, 9).setNumberFormat('@').setValues([['fida', 'FIDA', 'Sales', '', '1234', 'TRUE', 'TRUE', '7', 'couplodesign@gmail.com']]);
  forget_('Staff');
  // fill staff emails the owner gave (only where empty)
  var EMAILS = { VINAYA: 'vinayacouplo@gmail.com', RESHMA: 'reshmacouplo@gmail.com', RAHILA: 'rahilacouplo@gmail.com',
                 JASEERA: 'jaseeracouplo@gmail.com', FIDA: 'couplodesign@gmail.com' };
  rows_('Staff').forEach(function (r) {
    var e = EMAILS[String(r.name).trim().toUpperCase()];
    if (e && !r.email) staff.getRange(r._row, 9).setValue(e);
    var fix = { RAHILA: 'Media', HIBA: 'Regular', JASEERA: 'Printing' }[String(r.name).trim().toUpperCase()];
    if (fix && !bool_(r.sales) && ['', 'office', 'tele caller'].indexOf(String(r.role).trim().toLowerCase()) >= 0) r.role = fix; // owner's categories
    staff.getRange(r._row, 3).setValue(cats_(r.role, bool_(r.sales)).join(',')); // fixed categories: Sales / Office / Media / Printing / Add-ons / Regular
    if (!r.pin) staff.getRange(r._row, 5).setNumberFormat('@').setValue('1234'); // default PIN, staff can change it
  });
  var prod = ss.getSheetByName('Products');
  if (prod.getLastRow() < 2) PRODUCT_SEED.forEach(function (x, i) {
    upsert_('Products', { id: (x[1] === 'affordable' ? 'a-' : 'p-') + x[0].toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: x[0], type: x[1], price: x[2], active: 'TRUE', order: i + 1 });
  });
  // work list — version 2 (printing for Jaseera, accessories for Hiba). Runs once; later changes in the app are kept.
  if (setting_('tasksVersion') !== '3') {
    TASK_SEED.forEach(function (x, i) { upsert_('Tasks', { id: x[0], category: x[1], name: x[2], kind: x[3], order: i + 1, active: 'TRUE', options: x[4] }); });
    upsert_('Settings', { key: 'tasksVersion', value: '3' });
  }
  // old daily work from the media and printing sheets (Sep 1 – Oct 8) — only rows not already in the sheet
  if (setting_('workSeed') !== '2') {
    var WORK_SEED = [["2026-10-01","hiba","bows","{\"NAVY BLUE\":6,\"RED\":2,\"BLUE\":7,\"GOLD\":1}"],["2026-10-01","rahila","video-editing","1"],["2026-10-01","rahila","stories","TRUE"],["2026-10-01","rahila","reels","1"],["2026-10-01","rahila","printing","3"],["2026-10-01","rahila","ch-couplo","TRUE"],["2026-10-01","rahila","ch-print-trend","TRUE"],["2026-10-01","rahila","ch-photos","TRUE"],["2026-10-02","hiba","bows","{\"NAVY BLUE\":1,\"GOLD\":6}"],["2026-10-02","rahila","video-editing","4"],["2026-10-02","rahila","stories","TRUE"],["2026-10-02","rahila","reels","1"],["2026-10-02","rahila","printing","3"],["2026-10-02","rahila","ch-couplo","TRUE"],["2026-10-02","rahila","ch-print-trend","TRUE"],["2026-10-02","rahila","ch-photos","TRUE"],["2026-10-03","hiba","bows","{\"RED\":1,\"GOLD\":1,\"PINK\":6}"],["2026-10-03","rahila","video-editing","4"],["2026-10-03","rahila","stories","TRUE"],["2026-10-03","rahila","reels","1"],["2026-10-03","rahila","printing","3"],["2026-10-03","rahila","ch-couplo","TRUE"],["2026-10-03","rahila","ch-print-trend","TRUE"],["2026-10-03","rahila","ch-photos","TRUE"],["2026-10-05","hiba","leg-socks","1"],["2026-10-05","hiba","hair-bows","2"],["2026-10-05","hiba","bows","{\"RED\":7,\"BROWN\":4,\"PEPSI BLUE\":7}"],["2026-10-05","rahila","stories","TRUE"],["2026-10-05","rahila","printing","3"],["2026-10-05","rahila","ch-couplo","TRUE"],["2026-10-05","rahila","ch-print-trend","TRUE"],["2026-10-05","rahila","ch-photos","TRUE"],["2026-10-06","hiba","bows","{\"PEPSI BLUE\":1,\"BLUE\":4,\"CARBON\":1,\"RED\":4,\"BROWN\":3}"],["2026-10-06","rahila","video-editing","1"],["2026-10-06","rahila","stories","TRUE"],["2026-10-06","rahila","reels","1"],["2026-10-06","rahila","printing","2"],["2026-10-06","rahila","ch-couplo","TRUE"],["2026-10-06","rahila","ch-print-trend","TRUE"],["2026-10-06","rahila","ch-photos","TRUE"],["2026-10-07","hiba","leg-socks","3"],["2026-10-07","hiba","bows","{\"RED\":6,\"CARBON\":10,\"GOLD\":5,\"PINK\":10}"],["2026-10-07","rahila","video-editing","2"],["2026-10-07","rahila","stories","TRUE"],["2026-10-07","rahila","reels","1"],["2026-10-07","rahila","printing","2"],["2026-10-07","rahila","ch-couplo","TRUE"],["2026-10-07","rahila","ch-print-trend","TRUE"],["2026-10-07","rahila","ch-photos","TRUE"],["2026-10-08","hiba","leg-socks","2"],["2026-10-08","hiba","bows","{\"BLACK\":6,\"BLUE\":4,\"GREEN\":1,\"GOLD\":22,\"PINK\":3}"],["2026-10-08","rahila","video-editing","2"],["2026-10-08","rahila","stories","TRUE"],["2026-10-08","rahila","reels","1"],["2026-10-08","rahila","printing","1"],["2026-10-08","rahila","ch-couplo","TRUE"],["2026-10-08","rahila","ch-print-trend","TRUE"],["2026-10-08","rahila","ch-photos","TRUE"],["2026-09-01","jaseera","printed-items","{\"PHR\":2,\"PFR\":3,\"PPR\":2,\"AFR\":4}"],["2026-09-01","jaseera","printed-orders","VAG91, VAG90, VAG92, SP1A, SP1B, PSEP 1, AAG 25, BSEP1, VSEP1, VSEP 2, VSEP3"],["2026-09-02","jaseera","printed-items","{\"PHR\":1,\"PFR\":1,\"AFR\":2}"],["2026-09-02","jaseera","printed-orders","SP2, RSE1, VSEP4, BAG 23"],["2026-09-03","jaseera","printed-items","{\"PHR\":4,\"PFR\":2,\"PPR\":2,\"AFR\":2,\"AHR\":2}"],["2026-09-03","jaseera","printed-orders","VSEP6, NSP1, SP3, SP4, VSEP5, PSEP 2, VSEP 8, VSEP 12, BSP 3, VSEP7, PSEP3, VSEP13"],["2026-09-04","jaseera","printed-items","{\"PHR\":1,\"PFR\":2,\"AFR\":1,\"AHR\":2}"],["2026-09-04","jaseera","printed-orders","VSEP15, VSEP16, PSEP4, VSEP14, SP5, PSEP5"],["2026-09-05","jaseera","printed-items","{\"PHR\":3,\"PFR\":4,\"PPR\":3,\"AFR\":2,\"AHR\":2,\"CAP\":1}"],["2026-09-05","jaseera","printed-orders","VSEP18, VSEP9, VSEP21, SP6, VSEP10, BSP2, VSEP20, PSEP6, BSP4, PSEP7, VSEP19, VSEP23, VSEP22, BSP5, BSP6"],["2026-09-07","jaseera","printed-items","{\"PHR\":1,\"PFR\":2,\"PPR\":3,\"AFR\":6,\"T SHIRT\":2}"],["2026-09-07","jaseera","printed-orders","PSEP9, SP7, VSEP26, VSEP25, PSEP8, BSP7, RSP2, VSEP27, VSEP28, VSEP30, VSEP31, PSEP 11, PSEP10"],["2026-09-08","jaseera","printed-items","{\"PHR\":2,\"PFR\":3,\"PPR\":4,\"AFR\":1,\"AHR\":1,\"T SHIRT\":1}"],["2026-09-08","jaseera","printed-orders","VSEP11, VSEP35, VSEP32, VSEP33, VSEP37, BSP8, VSEP34, VSEP 36, PSEP 12, BSP9, RSP3A, RSP3 B"],["2026-09-09","jaseera","printed-items","{\"PPR\":3,\"AFR\":4,\"AHR\":2}"],["2026-09-09","jaseera","printed-orders","PSEP13, VSEP24, VSEP39, RSP4 A, RSP 4B, PSEP14, PSEP15, VSEP38A, VSEP38B"],["2026-09-10","jaseera","printed-items","{\"PHR\":3,\"PPR\":1,\"AHR\":1}"],["2026-09-10","jaseera","printed-orders","VSEP40, PSEP16, VSEP 42, BSP10, VSEP41"],["2026-09-11","jaseera","printed-items","{\"PHR\":1,\"PFR\":2,\"T SHIRT\":1}"],["2026-09-11","jaseera","printed-orders","VSEP45, VSEP46 A, VSEP46 B, VSE P47"],["2026-09-12","jaseera","printed-items","{\"PHR\":2,\"PFR\":1,\"PPR\":3,\"AHR\":1}"],["2026-09-12","jaseera","printed-orders","RSP5, VSEP49, VSEP48, BSP13, VSEP51, BSP14, BSP11"],["2026-09-14","jaseera","printed-items","{\"PFR\":4,\"PPR\":2,\"AHR\":1}"],["2026-09-14","jaseera","printed-orders","BSP15, RSP7, VSEP44, VSEP50, BSP17, VSEP52, BSP16"],["2026-09-15","jaseera","printed-items","{\"PFR\":3,\"AFR\":2,\"T SHIRT\":1}"],["2026-09-15","jaseera","printed-orders","VSEP 54 A, VSEP 54 B, VSEP55, BSP12, PSEP A, PSEP B"],["2026-09-16","jaseera","printed-items","{\"PHR\":4,\"PFR\":3,\"PPR\":1,\"AFR\":3,\"AHR\":2}"],["2026-09-16","jaseera","printed-orders","VSEP 59, SP8, RSP 8, VSEP 56, RSP9, BSP19, SBSP20, VSEP57, BSP18, PSEP18, VSEP61, VSEP60, PSEP19"],["2026-09-17","jaseera","printed-items","{\"PHR\":2,\"PFR\":2,\"AFR\":2,\"AHR\":2,\"T SHIRT\":1}"],["2026-09-17","jaseera","printed-orders","SP10, VSEP64, SP9, VSEP63, SP11, VSEP58, VSEP62, NSP2, SP12"],["2026-09-18","jaseera","printed-items","{\"PHR\":1,\"PPR\":1,\"AHR\":2}"],["2026-09-18","jaseera","printed-orders","PSEP20, BSP21, BSP22, SP13"],["2026-09-21","jaseera","printed-orders","RSP10A, RSP10B, BSP23, BSP24, VSEP65, PSEP23, PSEP22"],["2026-09-22","jaseera","printed-orders","SP15, SP14, VSEP66, RSP11, BSP30, VSEP67, BSP26, BSP35"],["2026-09-23","jaseera","printed-orders","VSP69, VSEP68, BSP31, PSEP25, PSEP70"],["2026-09-24","jaseera","printed-items","{\"PFR\":2,\"PPR\":4,\"AFR\":2,\"AHR\":1}"],["2026-09-24","jaseera","printed-orders","SP16, BSP 34, RSP 12, RSP 13, BSP 33, VSEP75, VDEP71, VSEP73, VSEP72"],["2026-09-25","jaseera","printed-items","{\"PHR\":2,\"PPR\":4,\"AFR\":2,\"AHR\":1}"],["2026-09-25","jaseera","printed-orders","VSEP 74, BSP35, BSP 28, PSEP27, BSP29, RSP14, BSP 37, VSEP76, BSP 38"],["2026-09-26","jaseera","printed-items","{\"PFR\":2,\"PPR\":1,\"AFR\":3}"],["2026-09-26","jaseera","printed-orders","BSP40, VSEP80, PSEP28, NSP5, RSP15, PSEP26"],["2026-09-28","jaseera","printed-items","{\"PHR\":4,\"PFR\":1,\"AHR\":1}"],["2026-09-28","jaseera","printed-orders","BSP41, BSP42, VSEP81, VSEP78, VSEP82, PSEP29"],["2026-09-29","jaseera","printed-items","{\"PHR\":3,\"PFR\":1,\"PPR\":4,\"T SHIRT\":2}"],["2026-09-29","jaseera","printed-orders","VSEP 79, BSP45, VSEP 84, BSP47, BSP43, VSEP86, VSEP77, VSEP88 A, VSEP88 B, VSEP87"],["2026-09-30","jaseera","printed-orders","SP18, SP19, VSEP90, VSEP92, PVSEP32"],["2026-10-01","jaseera","printed-items","{\"PHR\":2,\"PFR\":2,\"AFR\":3}"],["2026-10-01","jaseera","printed-orders","SP17, PSEP31, VSEP 91, BOC 1, BOC 2, PSEP30, VOC 1"],["2026-10-02","jaseera","printed-items","{\"PFR\":1,\"PPR\":1,\"AHR\":2,\"T SHIRT\":3}"],["2026-10-02","jaseera","printed-orders","VSEP83, PSEP33, BOC 3, AOC 01 A, AOC 01 B, AOC 01 C, AOC 01 D"],["2026-10-03","jaseera","printed-items","{\"PHR\":2,\"PFR\":2,\"PPR\":1,\"AFR\":2}"],["2026-10-03","jaseera","printed-orders","POC01, NOC1, NSP8, POC 2, BOC 4, BOC 5, NSP6, POC 2"],["2026-10-03","jaseera","print-remarks","OVER PRINTED  CAP"],["2026-10-05","jaseera","printed-orders","BOC8, VOC 6, ROC 3, VSEP83"],["2026-10-05","jaseera","reprint","VSEP91"],["2026-10-06","jaseera","printed-items","{\"PHR\":1,\"PFR\":3,\"PPR\":2,\"AFR\":4}"],["2026-10-06","jaseera","printed-orders","ROC 3, ROC2, POC4, VOC 5, NSP7, OC3, VOC4, BOC9, SP20, VOC 7, POC5"],["2026-10-06","jaseera","print-remarks","CHANGE IN PRODUCT"],["2026-10-07","jaseera","printed-items","{\"PHR\":3,\"PFR\":2,\"PPR\":3,\"AFR\":1,\"AHR\":2,\"T SHIRT\":2}"],["2026-10-07","jaseera","printed-orders","POC4, VOC9, VOC 8A, VOC8B, VOC8C, BOC7, PVOC 7, BOC12, POC6, BOC11, VOC12, BOC10, VOC10"],["2026-10-07","jaseera","print-remarks","CHANGE IN PRODUCT"],["2026-10-08","jaseera","printed-items","{\"PFR\":2,\"PPR\":3,\"AFR\":1,\"AHR\":2,\"T SHIRT\":1}"],["2026-10-08","jaseera","printed-orders","OC4, BOC13, POC8, BOC14, BOC15, VOC13, OC2, OLD OREDER HAJARA, VOC14"],["2026-10-08","jaseera","print-remarks","CHANGE IN PRODUCT"]];
    var wk = ss.getSheetByName('Work'), haveW = {};
    rows_('Work').forEach(function (r) { haveW[r.key] = 1; });
    var add = WORK_SEED.filter(function (r) { return !haveW[r[0] + '__' + r[1] + '__' + r[2]]; })
      .map(function (r) { return [r[0] + '__' + r[1] + '__' + r[2], r[0], r[1], r[2], r[3], r[0] + ' 18:00']; });
    if (add.length) wk.getRange(wk.getLastRow() + 1, 1, add.length, 6).setNumberFormat('@').setValues(add);
    upsert_('Settings', { key: 'workSeed', value: '2' });
  }
  // prices are not used any more
  var pr2 = ss.getSheetByName('Products'); if (pr2.getLastRow() >= 2) pr2.getRange(2, 4, pr2.getLastRow() - 1, 1).clearContent();
  MEMO_ = {}; // setup wrote straight into the sheets above
  migrate_();
  MailApp.getRemainingDailyQuota(); // asks for e-mail permission once, so slips can be e-mailed
  scheduleReport_();
}

/* ---------- daily report e-mail ---------- */
function scheduleReport_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyReport') ScriptApp.deleteTrigger(t); });
  if (String(setting_('reportOn')).toUpperCase() !== 'FALSE')
    ScriptApp.newTrigger('dailyReport').timeBased().atHour(Number(setting_('reportHour') || 19)).everyDays(1).inTimezone(TZ).create();
}
function dailyReport(forceDate) {
  var n = now_(), day = typeof forceDate === 'string' ? forceDate : n.date, month = day.slice(0, 7);
  var to = setting_('reportEmail'); if (!to) return { ok: false, error: 'No report e-mail set' };
  var staff = staffList_(), byId = {}; staff.forEach(function (s) { byId[s.id] = s; });
  var att = rows_('Attendance').filter(function (r) { return r.date === day; });
  var attBy = {}; att.forEach(function (r) { attBy[r.staffId] = r; });
  var orders = rows_('Orders'), today = orders.filter(function (o) { return o.date === day; }),
      mtd = orders.filter(function (o) { return o.date.indexOf(month) === 0 && o.date <= day; });
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); };
  var rs = function (v) { return 'Rs. ' + Math.round(v || 0).toLocaleString('en-IN'); };
  var td = 'style="padding:6px 10px;border-bottom:1px solid #eee"', th = 'style="padding:6px 10px;background:#f3ebf3;color:#511F52;text-align:left"';
  var table = function (head, rows) { return '<table style="border-collapse:collapse;font-size:13px;margin:6px 0 18px">' + '<tr>' + head.map(function (h) { return '<th ' + th + '>' + h + '</th>'; }).join('') + '</tr>' +
    (rows.length ? rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td ' + td + '>' + c + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td ' + td + ' colspan="' + head.length + '">None</td></tr>') + '</table>'; };
  // attendance
  var active = staff.filter(function (s) { return s.active; }), attRows = [], notIn = [];
  active.forEach(function (s) {
    var r = attBy[s.id];
    if (!r) { notIn.push(esc(s.name)); return; }
    var st = r.status === 'leave' ? 'Leave' : r.status === 'wfh' ? 'Work from home' : (r.in || '?') + ' – ' + (r.out || 'no OUT');
    var why = [r.lateReason ? 'Late: ' + esc(r.lateReason) : '', r.earlyReason ? 'Early: ' + esc(r.earlyReason) : '', esc(r.note)].filter(String).join('<br>');
    attRows.push([esc(s.name), st, why]);
  });
  // orders by staff
  var sumBy = function (list) { var g = {}; list.forEach(function (o) { var k = o.staffId; g[k] = g[k] || { n: 0, p: 0, a: 0, amt: 0 }; g[k].n++; o.type === 'affordable' ? g[k].a++ : g[k].p++; g[k].amt += Number(o.amount) || 0; }); return g; };
  var gT = sumBy(today), gM = sumBy(mtd);
  var salesRows = staff.filter(function (s) { return s.sales || gT[s.id] || gM[s.id]; }).map(function (s) {
    var t = gT[s.id] || { n: 0, p: 0, a: 0, amt: 0 }, m = gM[s.id] || { n: 0, amt: 0 };
    return [esc(s.name), t.n, t.p, t.a, rs(t.amt), m.n, rs(m.amt)]; });
  var tot = today.reduce(function (t, o) { return t + (Number(o.amount) || 0); }, 0), totM = mtd.reduce(function (t, o) { return t + (Number(o.amount) || 0); }, 0);
  var topOf = function (key) { var g = {}; var src = key === 'product' ? [].concat.apply([], today.map(orderItems_)) : today;
    src.forEach(function (o) { var k = o[key] || '—'; g[k] = (g[k] || 0) + (key === 'product' ? (Number(o.qty) || 1) : 1); }); return Object.keys(g).sort(function (a, b) { return g[b] - g[a]; }).slice(0, 8).map(function (k) { return [esc(k), g[k]]; }); };
  // daily work (media / production)
  var tasks = {}; taskList_().forEach(function (t) { tasks[t.id] = t; });
  var wb = {}; workRows_(day.slice(0, 7)).filter(function (w) { return w.date === day; }).forEach(function (w) { (wb[w.staffId] = wb[w.staffId] || []).push(w); });
  var workRows = Object.keys(wb).map(function (sid) {
    var txt = wb[sid].map(function (w) { var t = tasks[w.taskId] || { name: w.taskId, kind: 'count' };
      if (t.kind === 'yesno') return esc(t.name) + ': ' + (w.value === 'TRUE' ? 'Done' : 'Not done');
      if (t.kind === 'text') return esc(t.name) + ': ' + esc(w.value);
      var lab = {}; String(t.options || '').split(',').forEach(function (x) { var q = x.split(':'); lab[q[0].trim().toUpperCase()] = (q[1] || q[0]).trim(); });
      if (t.kind === 'colours' || t.kind === 'items') { var o = JSON.parse(w.value || '{}'), tot = 0, parts = Object.keys(o).map(function (c) { tot += o[c]; return esc(lab[c] || c) + ' ' + o[c]; }); return '<b>' + esc(t.name) + ' ' + tot + '</b> (' + parts.join(', ') + ')'; }
      return esc(t.name) + ': <b>' + esc(w.value) + '</b>'; }).join('<br>');
    return [esc((byId[sid] || {}).name || sid), txt]; });
  var html = '<div style="font-family:Arial,sans-serif;color:#1c2630;max-width:720px">' +
    '<div style="background:#511F52;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0"><b style="font-size:18px">COUPLO DESIGN STUDIO</b><br>Daily report · ' + day + '</div><div style="padding:16px 4px">' +
    '<p style="font-size:15px"><b>' + today.length + '</b> orders today · <b>' + rs(tot) + '</b> &nbsp;|&nbsp; This month: <b>' + mtd.length + '</b> orders · <b>' + rs(totM) + '</b></p>' +
    '<h3 style="color:#511F52">Sales staff</h3>' + table(['Staff', 'Orders today', 'Premium', 'Affordable', 'Sales today', 'Orders this month', 'Sales this month'], salesRows) +
    '<h3 style="color:#511F52">Today\'s products</h3>' + table(['Product', 'Orders'], topOf('product')) +
    '<h3 style="color:#511F52">Today\'s districts</h3>' + table(['District', 'Orders'], topOf('district')) +
    '<h3 style="color:#511F52">Daily work (printing, accessories, media)</h3>' + table(['Staff', 'Work done'], workRows) +
    editLogHtml_(day, esc, table) +
    '<h3 style="color:#511F52">Attendance</h3>' + (notIn.length ? '<p style="color:#9a5b00"><b>No attendance:</b> ' + notIn.join(', ') + '</p>' : '') + table(['Staff', 'In – Out', 'Reasons / notes'], attRows) +
    '<p style="color:#888;font-size:12px">Sent automatically by the Couplo Attendance app. Change the time or turn this off in Admin → Staff → Daily report.</p></div></div>';
  MailApp.sendEmail({ to: to, subject: 'Couplo daily report · ' + day + ' · ' + today.length + ' orders · ' + rs(tot), htmlBody: html, name: 'Couplo Attendance' });
  return { ok: true, to: to };
}

/* ---------- edit log: every admin change to attendance is written to the EditLog sheet and e-mailed
   straight away to the owner (the Google account this script runs as — it cannot be changed from the app) ---------- */
function attText_(r) {
  if (!r) return 'nothing';
  if (r.status === 'leave') return 'Leave' + (r.note ? ' (' + r.note + ')' : '');
  if (r.status === 'wfh') return 'Work from home' + (r.note ? ' (' + r.note + ')' : '');
  return 'IN ' + (r.in || '?') + ' – OUT ' + (r.out || 'none') + [r.lateReason ? ' · late: ' + r.lateReason : '', r.earlyReason ? ' · early: ' + r.earlyReason : '', r.note ? ' · note: ' + r.note : ''].join('');
}
function logEdit_(action, staffId, date, before, after) {
  if (before === after && action.indexOf('changed') > 0) return; // saved without changing anything
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('EditLog');
    if (!sh) { sh = ss.insertSheet('EditLog'); sh.getRange(1, 1, 1, SHEETS.EditLog.length).setValues([SHEETS.EditLog]).setFontWeight('bold'); sh.setFrozenRows(1); }
    var who = staffId ? ((staffList_().filter(function (x) { return x.id === staffId; })[0] || {}).name || staffId) : '';
    var t = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    sh.getRange(sh.getLastRow() + 1, 1, 1, 6).setNumberFormat('@').setValues([[t, action, who, date || '', before || '', after || '']]);
    var owner = Session.getEffectiveUser().getEmail();
    if (owner) MailApp.sendEmail({ to: owner, name: 'Couplo Attendance', subject: 'Attendance edit: ' + action + (who ? ' · ' + who : '') + (date ? ' · ' + date : ''),
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c2630"><b>' + action + '</b> in the admin panel at ' + t + '<br><br>' +
        (who ? 'Staff: <b>' + who + '</b><br>' : '') + (date ? 'Day: <b>' + date + '</b><br>' : '') +
        (before ? 'Before: ' + before + '<br>' : '') + (after ? 'After: <b>' + after + '</b><br>' : '') +
        '<br><span style="color:#888;font-size:12px">Every attendance change is also kept in the EditLog sheet of the attendance Google Sheet.</span></div>' });
  } catch (e) { /* never block the save because of the log */ }
}
function editLogHtml_(day, esc, table) {
  var sh = sh_('EditLog'); if (!sh || sh.getLastRow() < 2) return '';
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues().filter(function (r) { return String(r[0]).indexOf(day) === 0; });
  if (!rows.length) return '';
  return '<h3 style="color:#b42318">Changes made in the admin panel today (' + rows.length + ')</h3>' +
    table(['Time', 'Change', 'Staff', 'Day', 'Before', 'After'], rows.map(function (r) { return [esc(r[0].slice(11)), esc(r[1]), esc(r[2]), esc(r[3]), esc(r[4]), '<b>' + esc(r[5]) + '</b>']; }));
}

/* ---------- helpers ---------- */
function sh_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, v.getFullYear() < 1900 ? 'HH:mm' : 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}
/* SPEED: each sheet is read at most once per request (MEMO_), and writes keep that copy up to date,
   so a request never reads the same sheet again and again. */
var MEMO_ = {};
function forget_(name) { delete MEMO_[name]; }
function rowObj_(cols, r, row) { var o = { _row: row }; cols.forEach(function (c, j) { o[c] = str_(r[j]); }); return o; }
function rows_(name) {
  if (MEMO_[name]) return MEMO_[name];
  var sh = sh_(name), cols = SHEETS[name], n = sh.getLastRow();
  if (n < 2) return (MEMO_[name] = []);
  return (MEMO_[name] = sh.getRange(2, 1, n - 1, cols.length).getValues().map(function (r, i) { return rowObj_(cols, r, i + 2); }));
}
/* only the last `count` rows — enough for "today" on the check-in screen without reading the whole year */
function rowsTail_(name, count) {
  if (MEMO_[name]) return MEMO_[name].slice(-count);
  var sh = sh_(name), cols = SHEETS[name], n = sh.getLastRow();
  if (n < 2) return [];
  var from = Math.max(2, n - count + 1);
  return sh.getRange(from, 1, n - from + 1, cols.length).getValues().map(function (r, i) { return rowObj_(cols, r, from + i); });
}
/* finds one row by its key (first column) without reading the whole sheet */
function findRow_(name, key) {
  var cols = SHEETS[name], list = MEMO_[name], i;
  if (list) { for (i = 0; i < list.length; i++) if (list[i][cols[0]] === key) return list[i]; return null; }
  var sh = sh_(name), n = sh.getLastRow();
  if (n < 2 || key === '' || key == null) return null;
  var cells = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(key)).matchEntireCell(true).matchCase(true).findAll();
  for (i = 0; i < cells.length; i++) {
    var row = cells[i].getRow(), o = rowObj_(cols, sh.getRange(row, 1, 1, cols.length).getValues()[0], row);
    if (o[cols[0]] === String(key)) return o;
  }
  return null;
}
function upsert_(name, obj) {
  var sh = sh_(name), cols = SHEETS[name], key = String(obj[cols[0]]);
  var found = findRow_(name, key);
  var vals = [cols.map(function (c) { return obj[c] == null ? '' : String(obj[c]); })];
  var row = found ? found._row : sh.getLastRow() + 1;
  if (found) sh.getRange(row, 1, 1, cols.length).setValues(vals);
  else sh.getRange(row, 1, 1, cols.length).setNumberFormat('@').setValues(vals);
  var list = MEMO_[name];
  if (list) { var o = rowObj_(cols, vals[0], row), at = found ? list.indexOf(found) : -1; if (at >= 0) list[at] = o; else list.push(o); }
}
function remove_(name, key) {
  var found = findRow_(name, key);
  if (found) { sh_(name).deleteRow(found._row); forget_(name); }
}
function holidays_() { try { return JSON.parse(setting_('holidays') || '{}') || {}; } catch (e) { return {}; } }
function setting_(k) { var r = rows_('Settings').filter(function (x) { return x.key === k; })[0]; return r ? r.value : ''; }
function bool_(v) { return String(v).toUpperCase() === 'TRUE'; }
function staffList_() {
  return rows_('Staff').map(function (s) {
    return { id: s.id, name: s.name, role: s.role, salary: Number(s.salary) || 0, pin: s.pin,
             sales: bool_(s.sales), active: s.active === '' ? true : bool_(s.active), order: s.order === '' ? null : Number(s.order), email: s.email || '' };
  });
}
/* Printing = printing production, Add-ons = bows / socks / boots…, HR = enters daily leads for sales staff, Regular = does every kind of work (attendance only, no work list) */
var CATS = ['Sales', 'Office', 'Media', 'Printing', 'Add-ons', 'HR', 'Design', 'Accounts', 'Regular'];
function cat_(role, sales) {
  if (sales) return 'Sales';
  var r = String(role || '').trim().toLowerCase();
  if (r === 'production') return 'Printing'; // old name
  for (var i = 1; i < CATS.length; i++) if (CATS[i].toLowerCase() === r) return CATS[i];
  return 'Office';
}
/* one person can have several categories, saved as "Media,Add-ons". Regular stands alone (attendance only). */
function cats_(role, sales) {
  var out = [];
  if (sales) out.push('Sales');
  String(role || '').split(',').forEach(function (x) { if (!String(x).trim() || String(x).trim().toLowerCase() === 'sales') return; var c = cat_(x, false); if (out.indexOf(c) < 0) out.push(c); });
  if (!out.length) out.push('Office');
  if (out.indexOf('Regular') >= 0) out = sales ? ['Sales'] : ['Regular'];
  return out;
}
function taskList_() {
  if (!sh_('Tasks')) return [];
  return rows_('Tasks').map(function (t) {
    return { id: t.id, category: t.category, name: t.name, kind: KINDS.indexOf(t.kind) >= 0 ? t.kind : 'count', options: t.options || '',
             order: t.order === '' ? 999 : Number(t.order), active: t.active === '' ? true : bool_(t.active) };
  }).sort(function (a, b) { return a.order - b.order; });
}
function workRows_(month, staffId) {
  if (!sh_('Work')) return [];
  return rows_('Work').filter(function (w) { return w.date.indexOf(month) === 0 && (!staffId || w.staffId === staffId); });
}
function cleanWorkValue_(kind, v) {
  if (kind === 'yesno') return v === true || v === 'TRUE' ? 'TRUE' : (v === false || v === 'FALSE' ? 'FALSE' : '');
  if (kind === 'text') return String(v == null ? '' : v).trim().slice(0, 500);
  if (kind === 'colours' || kind === 'items') {
    var o = {}, src = typeof v === 'string' ? (v ? JSON.parse(v) : {}) : (v || {});
    Object.keys(src).forEach(function (k) { var c = String(k).trim().toUpperCase(), q = Number(src[k]) || 0; if (c && q > 0) o[c] = (o[c] || 0) + q; });
    return Object.keys(o).length ? JSON.stringify(o) : '';
  }
  return v === '' || v == null || isNaN(Number(v)) ? '' : String(Number(v));
}
function saveWork_(staffId, date, items, n) {
  var tasks = {}; taskList_().forEach(function (t) { tasks[t.id] = t; });
  (items || []).forEach(function (it) {
    var t = tasks[it.taskId]; if (!t) return;
    var key = date + '__' + staffId + '__' + t.id, val = cleanWorkValue_(t.kind, it.value);
    if (val === '') remove_('Work', key);
    else upsert_('Work', { key: key, date: date, staffId: staffId, taskId: t.id, value: val, updatedAt: n.date + ' ' + n.time });
  });
}
function hrLeadsData_(month) { // sales staff + this month's lead rows + order counts, for the HR leads box
  var st = staffList_().filter(function (s) { return s.sales && s.active; })
    .sort(function (a, b) { return (a.order == null ? 999 : a.order) - (b.order == null ? 999 : b.order); })
    .map(function (s) { return { id: s.id, name: s.name }; });
  var orders = {}; rows_('Orders').forEach(function (o) { if (o.date.indexOf(month) === 0) { var k = o.date + '__' + o.staffId; orders[k] = (orders[k] || 0) + 1; } });
  return { staff: st, leads: rows_('Sales').filter(function (r) { return r.date.indexOf(month) === 0; }).map(function (r) { return { date: r.date, staffId: r.staffId, leads: Number(r.leads) || 0 }; }), orders: orders };
}
function productList_() {
  if (!sh_('Products')) return [];
  return rows_('Products').map(function (p) {
    return { id: p.id, name: p.name, type: p.type === 'affordable' ? 'affordable' : 'premium', price: Number(p.price) || 0,
             active: p.active === '' ? true : bool_(p.active), order: p.order === '' ? 999 : Number(p.order) };
  }).sort(function (a, b) { return a.order - b.order; });
}
function cleanOrder_(o) {
  o = o || {};
  var t = function (v) { return String(v == null ? '' : v).trim(); };
  var r = { type: t(o.type) === 'affordable' ? 'affordable' : 'premium', customer: t(o.customer).toUpperCase(),
    phone: phoneNorm_(o.phone), district: t(o.district).toUpperCase(), pincode: t(o.pincode).replace(/\D/g, '').slice(0, 6),
    product: t(o.product).toUpperCase(), qty: Number(o.qty) || 1, amount: Number(o.amount) || 0, note: t(o.note), items: '' };
  /* several products in one order: keep the list, and product / qty / amount become the joined name and the totals */
  var it = Array.isArray(o.items) ? o.items : [];
  if (typeof o.items === 'string') { try { it = JSON.parse(o.items || '[]'); } catch (e) { it = []; } }
  it = it.map(function (x) { return { product: t(x && x.product).toUpperCase(), qty: Math.max(1, Number(x && x.qty) || 1), amount: Number(x && x.amount) || 0 }; })
    .filter(function (x) { return x.product; });
  if (it.length > 1) {
    r.items = JSON.stringify(it);
    r.product = it.map(function (x) { return x.product; }).join(' + ');
    r.qty = it.reduce(function (a, x) { return a + x.qty; }, 0);
    r.amount = it.reduce(function (a, x) { return a + x.amount; }, 0);
  }
  ordersHeader_();
  return r;
}
/* one product line per entry — old orders have no items, so they give themselves back */
function orderItems_(o) {
  var it = []; try { it = JSON.parse(o.items || '[]'); } catch (e) {}
  if (!it || !it.length) return [{ product: o.product, qty: Number(o.qty) || 1, amount: Number(o.amount) || 0 }];
  return it;
}
/* adds the "items" heading to the Orders sheet the first time it is needed */
function ordersHeader_() {
  var sh = sh_('Orders'), col = SHEETS.Orders.length;
  if (sh && !sh.getRange(1, col).getValue()) sh.getRange(1, col).setValue('items');
}
/* delete every row of a sheet that matches — bottom first so row numbers stay right */
function deleteWhere_(name, fn) {
  if (!sh_(name)) return 0;
  var sh = sh_(name), hit = rows_(name).filter(fn).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  hit.forEach(function (row) { sh.deleteRow(row); });
  forget_(name);
  return hit.length;
}
/* one-time change (Oct 2026): Production split into Printing + Add-ons, Hiba becomes Regular, Hiba's work goes to Rahila */
function migrate_() {
  if (setting_('catVersion') === '1') return;
  var st = sh_('Staff');
  rows_('Staff').forEach(function (r) {
    if (r.id === 'hiba') st.getRange(r._row, 3).setValue('Regular'); // Hiba does every kind of work → attendance only
    else if (String(r.role).trim().toLowerCase() === 'production') st.getRange(r._row, 3).setValue('Printing');
  });
  var tk = sh_('Tasks');
  if (tk) rows_('Tasks').forEach(function (t) {
    if (t.category === 'hiba') tk.getRange(t._row, 2).setValue('rahila');
    else if (t.category === 'jaseera') tk.getRange(t._row, 2).setValue('Printing');
  });
  forget_('Staff'); forget_('Tasks');
  upsert_('Settings', { key: 'catVersion', value: '1' });
}
function now_() { var d = new Date(); return { date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: Utilities.formatDate(d, TZ, 'HH:mm') }; }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- API ---------- */
function doGet() { return out_({ ok: true, app: 'couplo-attendance' }); }

/* actions that only read: they never wait in the queue, so the check-in screen refresh
   and reports don't slow down people who are saving */
var READ_ONLY = { kiosk: 1, portalStaff: 1, salesStaff: 1, portalLogin: 1, myData: 1, staffLogin: 1, myOrders: 1, adminCheck: 1, month: 1, allOrders: 1, arenaMe: 1, arenaAdmin: 1 };
function doPost(e) {
  var lock = null;
  try {
    var b = JSON.parse(e.postData.contents || '{}');
    if (!READ_ONLY[b.action]) { lock = LockService.getScriptLock(); lock.waitLock(25000); }
    return out_(handle_(b));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally { try { if (lock) lock.releaseLock(); } catch (x) {} }
}

function handle_(b) {
  migrate_();
  arenaSetup_();
  var n = now_();
  switch (b.action) {
    case 'kiosk': {
      var att = {};
      rowsTail_('Attendance', 400).forEach(function (r) { if (r.date === n.date) att[r.staffId] = r; });
      return { ok: true, today: n.date, time: n.time, lateAfter: setting_('lateAfter') || '09:40', minHours: Number(setting_('minHours') || 8),
        staff: staffList_().filter(function (s) { return s.active; })
          .map(function (s) { return { id: s.id, name: s.name, role: s.role, order: s.order, hasPin: !!s.pin }; }),
        att: att };
    }
    case 'punch': {
      var s = staffList_().filter(function (x) { return x.id === b.staffId; })[0];
      if (!s) return { ok: false, error: 'Staff not found' };
      if (s.pin && String(s.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
      var key = n.date + '__' + s.id;
      var rec = findRow_('Attendance', key);
      if (rec && (rec.status === 'leave' || rec.status === 'wfh')) return { ok: false, error: 'Today is marked as ' + rec.status };
      var kind, reason = String(b.reason || '').trim();
      var toMin = function (t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
      if (!rec || !rec.in) {
        if (toMin(n.time) > toMin(setting_('lateAfter') || '09:40') && !reason) return { ok: false, needReason: 'late', time: n.time };
        rec = { key: key, date: n.date, staffId: s.id, status: 'present', in: n.time, out: '', note: '', lateReason: reason, earlyReason: '' }; kind = 'in';
      } else if (rec.out) {
        return { ok: false, error: 'OUT already marked at ' + rec.out + '. Only admin can change it.' };
      } else {
        if (toMin(n.time) - toMin(rec.in) < Number(setting_('minHours') || 8) * 60 && !reason) return { ok: false, needReason: 'early', time: n.time, in: rec.in };
        rec.out = n.time; rec.earlyReason = reason; kind = 'out';
      }
      upsert_('Attendance', rec);
      return { ok: true, kind: kind, time: n.time, rec: rec };
    }
    case 'portalStaff':
      return { ok: true, staff: staffList_().filter(function (s) { return s.active || s.sales; })
        .map(function (s) { return { id: s.id, name: s.name, order: s.order, hasPin: !!s.pin, sales: s.sales }; }) };
    case 'setMyPin': case 'changeMyPin': {
      var q = staffList_().filter(function (x) { return x.id === b.staffId; })[0];
      if (!q) return { ok: false, error: 'Staff ID not found' };
      if (!/^\d{4}$/.test(String(b.newPin))) return { ok: false, error: 'PIN must be 4 digits' };
      if (b.action === 'setMyPin' && q.pin) return { ok: false, error: 'PIN already set. Ask HR to reset it.' };
      if (b.action === 'changeMyPin' && String(q.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
      var row = rows_('Staff').filter(function (r) { return r.id === q.id; })[0];
      sh_('Staff').getRange(row._row, 5).setNumberFormat('@').setValue(String(b.newPin)); forget_('Staff');
      return { ok: true, staffId: q.id, name: q.name, sales: q.sales };
    }
    case 'portalLogin': case 'myData': {
      var key = String(b.staffId || '').trim().toLowerCase();
      var p = staffList_().filter(function (x) { return x.id.toLowerCase() === key || String(x.name).trim().toLowerCase() === key; })[0];
      if (!p) return { ok: false, error: 'Staff ID not found' };
      if (!p.pin) return { ok: false, needPin: true, staffId: p.id, name: p.name };
      if (String(p.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
      if (b.action === 'portalLogin') return { ok: true, staffId: p.id, name: p.name, sales: p.sales };
      var myCats = cats_(p.role, p.sales), myCat = myCats.join(' + ');
      var mm = /^\d{4}-\d{2}$/.test(String(b.month)) ? String(b.month) : n.date.slice(0, 7);
      return { ok: true, today: n.date, month: mm, name: p.name, sales: p.sales, products: productList_().filter(function (x) { return x.active; }), lateAfter: setting_('lateAfter') || '09:40', minHours: Number(setting_('minHours') || 8),
        att: rows_('Attendance').filter(function (r) { return r.staffId === p.id && r.date.indexOf(mm) === 0; }),
        orders: p.sales ? rows_('Orders').filter(function (o) { return o.staffId === p.id && o.date.indexOf(mm) === 0; }) : [],
        category: myCat, tasks: myCat === 'Regular' ? [] : taskList_().filter(function (t) { return t.active && (myCats.indexOf(t.category) >= 0 || t.category === p.id); }), work: workRows_(mm, p.id),
        hr: myCats.indexOf('HR') >= 0 ? hrLeadsData_(mm) : null };
    }
    case 'hrSaveLeads': { // HR staff type the daily lead count for each sales person (same rows the admin Leads tab saves)
      var hr = staffList_().filter(function (x) { return x.id === b.staffId; })[0];
      if (!hr || !hr.pin || String(hr.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
      if (cats_(hr.role, hr.sales).indexOf('HR') < 0) return { ok: false, error: 'Only HR can enter leads' };
      var ld = String(b.date || ''), oldestL = Utilities.formatDate(new Date(new Date().getTime() - 45 * 864e5), TZ, 'yyyy-MM-dd');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ld) || ld > n.date || ld < oldestL) return { ok: false, error: 'Pick today or a day in the last 45 days' };
      var salesIds = {}; staffList_().forEach(function (x) { if (x.sales) salesIds[x.id] = 1; });
      var haveL = {}; rows_('Sales').forEach(function (x) { haveL[x.key] = x; });
      (b.rows || []).forEach(function (r) {
        if (!salesIds[r.staffId]) return;
        var v = Math.max(0, Math.round(Number(r.leads) || 0)), k = ld + '__' + r.staffId, was = haveL[k] || {};
        upsert_('Sales', { key: k, date: ld, staffId: r.staffId, leads: v, premium: '', affordable: '', amount: '',
          calls: was.calls || '', answered: was.answered || '', missed: was.missed || '', called: was.called || '' });
      });
      return { ok: true, hr: hrLeadsData_(ld.slice(0, 7)) };
    }
    case 'saveMyWork': {
      var w = staffList_().filter(function (x) { return x.id === b.staffId; })[0];
      if (!w || String(w.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
      var wd = String(b.date || '');
      var oldest = Utilities.formatDate(new Date(new Date().getTime() - 3 * 864e5), TZ, 'yyyy-MM-dd');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wd) || wd > n.date || wd < oldest) return { ok: false, error: 'You can only fill today or the last 3 days. Ask HR for older days.' };
      saveWork_(w.id, wd, b.items, n);
      return { ok: true, work: workRows_(wd.slice(0, 7), w.id) };
    }
    case 'salesStaff':
      return { ok: true, staff: staffList_().filter(function (s) { return s.sales; })
        .map(function (s) { return { id: s.id, name: s.name, order: s.order, hasPin: !!s.pin }; }) };
    case 'staffLogin': case 'addOrder': case 'myOrders': case 'editOrder': {
      var me = staffList_().filter(function (x) { return x.id === b.staffId && x.sales; })[0];
      if (!me) return { ok: false, error: 'Not a sales staff' };
      if (me.pin && String(me.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
      var month = n.date.slice(0, 7);
      if (b.action === 'staffLogin') return { ok: true, name: me.name };
      if (b.action === 'myOrders')
        return { ok: true, today: n.date, orders: rows_('Orders').filter(function (o) { return o.staffId === me.id && o.date.indexOf(month) === 0; }) };
      var o = cleanOrder_(b.order);
      if (!o.phone && !o.customer) return { ok: false, error: 'Enter customer name or phone' };
      // staff may pick today or the last 3 days as the order date; anything else falls back to today
      var oldestOd = Utilities.formatDate(new Date(new Date().getTime() - 3 * 864e5), TZ, 'yyyy-MM-dd');
      var pickD = String(b.order.date || '');
      var okD = /^\d{4}-\d{2}-\d{2}$/.test(pickD) && pickD <= n.date && pickD >= oldestOd;
      if (b.action === 'addOrder') {
        var od = okD ? pickD : n.date;
        var mine = rows_('Orders').filter(function (x) { return x.staffId === me.id && x.date === od; }).length;
        o.id = 'o' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        o.orderNo = String(b.order.orderNo || '').trim().toUpperCase() || (me.name.charAt(0) + (o.type === 'affordable' ? 'A' : 'P') + od.slice(5, 7) + od.slice(8, 10) + '-' + (mine + 1));
        o.date = od; o.staffId = me.id; o.dispatched = b.order.dispatched ? 'TRUE' : 'FALSE'; o.createdAt = n.date + ' ' + n.time;
        o.designDoneAt = ''; o.dispatchedAt = o.dispatched === 'TRUE' ? n.date + ' ' + n.time : '';
        upsert_('Orders', o);
        return { ok: true, order: o };
      }
      var old = rows_('Orders').filter(function (x) { return x.id === b.order.id; })[0];
      if (!old || old.staffId !== me.id) return { ok: false, error: 'Order not found' };
      if (old.date.indexOf(month) !== 0) return { ok: false, error: 'Only this month\'s orders can be changed' };
      o.id = old.id; o.orderNo = String(b.order.orderNo || '').trim().toUpperCase() || old.orderNo; o.date = okD ? pickD : old.date; o.staffId = old.staffId; o.dispatched = b.order.dispatched ? 'TRUE' : 'FALSE'; o.createdAt = old.createdAt;
      keepStages_(o, old, n);
      upsert_('Orders', o);
      return { ok: true, order: o };
    }
    case 'adminCheck':
      return { ok: true, needSetup: !setting_('adminPin'), valid: !!setting_('adminPin') && String(b.adminPin) === setting_('adminPin') };
    case 'setAdminPin': {
      var cur = setting_('adminPin');
      if (cur && String(b.adminPin) !== cur) return { ok: false, error: 'Wrong admin PIN' };
      if (!/^\d{4}$/.test(String(b.newPin))) return { ok: false, error: 'PIN must be 4 digits' };
      upsert_('Settings', { key: 'adminPin', value: String(b.newPin) });
      if (cur) logEdit_('Admin PIN changed', '', '', '', '');
      return { ok: true };
    }
  }
  var ar = arenaStaffAction_(b, n); if (ar) return ar;
  /* everything below needs the admin PIN */
  var pin = setting_('adminPin');
  if (!pin || String(b.adminPin) !== pin) return { ok: false, error: 'Admin PIN needed' };
  var aa = arenaAdminAction_(b, n); if (aa) return aa;
  switch (b.action) {
    case 'month': {
      var m = String(b.month); // yyyy-MM
      return { ok: true, today: n.date, staff: staffList_(), products: productList_(), tasks: taskList_(), work: workRows_(m),
        att: rows_('Attendance').filter(function (r) { return r.date.indexOf(m) === 0; }),
        sales: rows_('Sales').filter(function (r) { return r.date.indexOf(m) === 0; }),
        pay: rows_('Pay').filter(function (r) { return r.month === m; }),
        orders: rows_('Orders').filter(function (r) { return r.date.indexOf(m) === 0; }), holidays: holidays_() };
    }
    case 'saveHoliday': { // office holidays: { 'yyyy-MM-dd': 'name' } — Sundays are holidays anyway
      var h = holidays_(), d = String(b.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: 'Pick a date' };
      if (b.name) h[d] = String(b.name).trim().slice(0, 60); else delete h[d];
      upsert_('Settings', { key: 'holidays', value: JSON.stringify(h) });
      return { ok: true, holidays: h };
    }
    case 'allOrders': return { ok: true, orders: rows_('Orders') };
    case 'saveOrder': {
      var so = cleanOrder_(b.order); so.id = b.order.id || ('o' + new Date().getTime().toString(36));
      ['orderNo','date','staffId','createdAt'].forEach(function (k) { so[k] = String(b.order[k] || ''); });
      so.dispatched = (b.order.dispatched === true || b.order.dispatched === 'TRUE') ? 'TRUE' : 'FALSE';
      if (!so.date) so.date = n.date;
      var isNew = !b.order.id;
      if (isNew && !so.createdAt) so.createdAt = n.date + ' ' + n.time;
      keepStages_(so, isNew ? null : rows_('Orders').filter(function (x) { return x.id === so.id; })[0], n);
      upsert_('Orders', so);
      return { ok: true, order: so };
    }
    case 'deleteOrder': remove_('Orders', b.id); return { ok: true };
    case 'setDispatched': {
      var od = rows_('Orders').filter(function (x) { return x.id === b.id; })[0];
      if (!od) return { ok: false, error: 'Order not found' };
      od.dispatched = b.value ? 'TRUE' : 'FALSE'; od.dispatchedAt = b.value ? (od.dispatchedAt || n.date + ' ' + n.time) : ''; upsert_('Orders', od); return { ok: true };
    }
    case 'saveAtt': { var a = b.rec; a.key = a.date + '__' + a.staffId; var was = findRow_('Attendance', a.key); was = was ? JSON.parse(JSON.stringify(was)) : null;
      upsert_('Attendance', a); logEdit_(was ? 'Attendance changed' : 'Attendance added', a.staffId, a.date, attText_(was), attText_(a)); return { ok: true }; }
    case 'deleteAtt': { var dk = b.date + '__' + b.staffId, dw = findRow_('Attendance', dk); dw = dw ? JSON.parse(JSON.stringify(dw)) : null;
      remove_('Attendance', dk); if (dw) logEdit_('Attendance deleted', b.staffId, b.date, attText_(dw), 'nothing'); return { ok: true }; }
    case 'saveSales':
      var haveS = {}; rows_('Sales').forEach(function (x) { haveS[x.key] = x; });
      (b.rows || []).forEach(function (r) { r.key = r.date + '__' + r.staffId; var was = haveS[r.key] || {};
        ['calls', 'answered', 'missed', 'called'].forEach(function (c) { if (r[c] == null) r[c] = was[c] || ''; }); upsert_('Sales', r); });
      return { ok: true };
    case 'savePay': { var p = b.pay; p.key = p.month + '__' + p.staffId; upsert_('Pay', p); return { ok: true }; }
    case 'saveStaff': {
      var st = b.staff;
      upsert_('Staff', { id: st.id, name: st.name, role: cats_(st.role, st.sales).join(','), salary: st.salary, pin: st.pin || '',
        sales: st.sales ? 'TRUE' : 'FALSE', active: st.active ? 'TRUE' : 'FALSE', order: st.order == null ? '' : st.order,
        email: String(st.email || '').trim() });
      return { ok: true };
    }
    case 'deleteStaff': {
      var did = String(b.id || ''), ds = staffList_().filter(function (x) { return x.id === did; })[0];
      if (!ds) return { ok: false, error: 'Staff not found' };
      var mineOf = function (r) { return r.staffId === did; };
      var has = { att: rows_('Attendance').filter(mineOf).length, orders: rows_('Orders').filter(mineOf).length,
        work: sh_('Work') ? rows_('Work').filter(mineOf).length : 0, sales: rows_('Sales').filter(mineOf).length, pay: rows_('Pay').filter(mineOf).length };
      if (!b.withData && (has.att + has.orders + has.work + has.sales + has.pay) > 0) return { ok: false, error: 'This staff has saved data', hasData: has };
      if (has.att) logEdit_('Staff deleted with all data', did, '', has.att + ' attendance days, ' + has.orders + ' orders', 'deleted');
      ['Attendance', 'Orders', 'Work', 'Sales', 'Pay'].forEach(function (nm) { deleteWhere_(nm, mineOf); });
      deleteWhere_('Tasks', function (t) { return t.category === did; }); // work items only for this person
      remove_('Staff', did);
      return { ok: true };
    }
    case 'saveProduct': {
      var pr = b.product || {}, nm = String(pr.name || '').trim().toUpperCase();
      if (!nm) return { ok: false, error: 'Enter the product name' };
      var ty = pr.type === 'affordable' ? 'affordable' : 'premium';
      upsert_('Products', { id: pr.id || ((ty === 'affordable' ? 'a-' : 'p-') + nm.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + new Date().getTime().toString(36).slice(-3)),
        name: nm, type: ty, price: Number(pr.price) || '', active: pr.active === false ? 'FALSE' : 'TRUE', order: pr.order == null || pr.order === '' ? 999 : Number(pr.order) });
      return { ok: true, products: productList_() };
    }
    case 'saveWork': saveWork_(b.staffId, b.date, b.items, n); return { ok: true, work: workRows_(String(b.date).slice(0, 7)) };
    case 'saveTask': {
      var tt = b.task || {}, tn = String(tt.name || '').trim().toUpperCase();
      if (!tn) return { ok: false, error: 'Enter the work name' };
      upsert_('Tasks', { id: tt.id || (tn.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + new Date().getTime().toString(36).slice(-3)),
        category: CATS.indexOf(tt.category) >= 0 || staffList_().some(function (x) { return x.id === tt.category; }) ? tt.category : 'Office', name: tn, kind: KINDS.indexOf(tt.kind) >= 0 ? tt.kind : 'count',
        options: String(tt.options || '').split(',').map(function (x) { return x.split(':').map(function (y) { return y.trim(); }).filter(String).join(':').toUpperCase(); }).filter(String).join(','),
        order: tt.order === '' || tt.order == null ? 999 : Number(tt.order), active: tt.active === false ? 'FALSE' : 'TRUE' });
      return { ok: true, tasks: taskList_() };
    }
    case 'deleteTask': remove_('Tasks', b.id); return { ok: true, tasks: taskList_() };
    case 'deleteProduct': remove_('Products', b.id); return { ok: true, products: productList_() };
    case 'reportSettings': {
      if (b.set) {
        var old = { on: String(setting_('reportOn')).toUpperCase() !== 'FALSE' ? 'on' : 'off', email: setting_('reportEmail'), lateAfter: setting_('lateAfter') || '09:40', minHours: String(setting_('minHours') || 8) };
        var neu = { on: b.set.on ? 'on' : 'off', email: String(b.set.email || '').trim(), lateAfter: b.set.lateAfter ? String(b.set.lateAfter) : old.lateAfter, minHours: b.set.minHours ? String(b.set.minHours) : old.minHours };
        var chg = Object.keys(old).filter(function (k) { return old[k] !== neu[k]; });
        if (chg.length) logEdit_('Settings changed', '', '', chg.map(function (k) { return k + ': ' + old[k]; }).join(', '), chg.map(function (k) { return k + ': ' + neu[k]; }).join(', '));
        upsert_('Settings', { key: 'reportOn', value: b.set.on ? 'TRUE' : 'FALSE' });
        upsert_('Settings', { key: 'reportHour', value: String(Math.max(0, Math.min(23, Number(b.set.hour) || 19))) });
        upsert_('Settings', { key: 'reportEmail', value: String(b.set.email || '').trim() });
        if (b.set.lateAfter) upsert_('Settings', { key: 'lateAfter', value: String(b.set.lateAfter) });
        if (b.set.minHours) upsert_('Settings', { key: 'minHours', value: String(b.set.minHours) });
        scheduleReport_();
      }
      return { ok: true, on: String(setting_('reportOn')).toUpperCase() !== 'FALSE', hour: Number(setting_('reportHour') || 19), email: setting_('reportEmail'),
        lateAfter: setting_('lateAfter') || '09:40', minHours: Number(setting_('minHours') || 8) };
    }
    case 'sendReportNow': return dailyReport(n.date);
    case 'emailSlips': {
      var list = staffList_(), sent = [], skipped = [];
      (b.items || []).forEach(function (it) {
        var s2 = list.filter(function (x) { return x.id === it.staffId; })[0];
        if (!s2 || !s2.email) { skipped.push(s2 ? s2.name : it.staffId); return; }
        MailApp.sendEmail({ to: s2.email, subject: 'Salary slip ' + it.monthLabel + ' - Couplo Design Studio',
          htmlBody: 'Hi ' + s2.name + ',<br><br>Your salary slip for <b>' + it.monthLabel + '</b> is attached.<br>Net salary: <b>Rs. ' + it.net + '</b><br><br>Couplo Design Studio, Vengara',
          name: 'Couplo Design Studio',
          attachments: [Utilities.newBlob(Utilities.base64Decode(it.pdf), 'application/pdf', it.filename)] });
        sent.push(s2.name);
      });
      return { ok: true, sent: sent, skipped: skipped };
    }
  }
  return { ok: false, error: 'Unknown action' };
}


/* ---------- Leadvyne CRM → app leads (auto) ----------
   Reads the "COUPLO LEADS CRM" sheet (Leadvyne export), counts leads per sales person per day (IST)
   and writes them into the Sales sheet's "leads" column — the same numbers HR used to type by hand.
   All CRM dates from Settings "leadSyncFrom" (default 2026-09-01 = full CRM history) are written; this replaces HR's manual numbers for those days.
   Run setupLeadSync() once: it syncs now and then every hour. */
var LEAD_CRM_ID = '1eCcse_bsNzvCC0fNAmdKHaH5pZ_I3mkfNAqfW0_ev0k';
function leadName_(s) { return String(s || '').trim().toLowerCase().replace(/[^a-z]/g, '').replace(/(.)\1+$/, '$1'); } // "reshmaa" → "reshma"
function syncLeadvyneLeads() {
  /* the big CRM sheet is read BEFORE taking the lock, so check-ins don't wait for it */
  var data = SpreadsheetApp.openById(LEAD_CRM_ID).getSheetByName('Sheet1').getDataRange().getValues();
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var from = setting_('leadSyncFrom') || '2026-09-01';
    var head = data.shift().map(function (h) { return String(h).trim().toLowerCase(); });
    var cDate = head.indexOf('date'), cWho = head.indexOf('assigned to');
    if (cDate < 0 || cWho < 0) throw new Error('CRM sheet: Date / Assigned To column not found');
    var byName = {}; staffList_().forEach(function (s) { byName[leadName_(s.name)] = s.id; byName[leadName_(s.id.split('-')[0])] = s.id; });
    var count = {}, unknown = {};
    data.forEach(function (r) {
      var d = r[cDate]; if (!d) return;
      if (!(d instanceof Date)) d = new Date(String(d).trim().replace(' ', 'T'));
      if (isNaN(d)) return;
      var day = Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); if (day < from) return;
      var id = byName[leadName_(r[cWho])];
      if (!id) { unknown[String(r[cWho])] = (unknown[String(r[cWho])] || 0) + 1; return; }
      var k = day + '__' + id; count[k] = (count[k] || 0) + 1;
    });
    var have = {}; rows_('Sales').forEach(function (r) { have[r.key] = r; });
    Object.keys(count).forEach(function (k) {
      var old = have[k] || {}, p = k.split('__');
      if (String(old.leads) === String(count[k])) return;
      upsert_('Sales', { key: k, date: p[0], staffId: p[1], leads: count[k], premium: old.premium || '', affordable: old.affordable || '', amount: old.amount || '',
        calls: old.calls || '', answered: old.answered || '', missed: old.missed || '', called: old.called || '' });
    });
    upsert_('Settings', { key: 'leadSyncLast', value: now_().date + ' ' + now_().time });
    return { ok: true, days: Object.keys(count).length, notMatched: unknown };
  } finally { lock.releaseLock(); }
}
function setupLeadSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'syncLeadvyneLeads') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncLeadvyneLeads').timeBased().everyHours(1).create();
  var res = syncLeadvyneLeads(); Logger.log(JSON.stringify(res)); return res;
}

/* ---------- Meta Conversions API (CAPI) ----------
   Every order saved in the app is sent to Meta as a "Purchase" event, so Meta Ads can
   see real sales (the Leadvyne CRM order data is not used).
   Orders are sent only CAPI_DELAY_HOURS after they were entered, so a wrong or duplicate order
   deleted (or an amount corrected) within that time never reaches Meta — Meta cannot delete events.
   One-time setup — Apps Script editor → Project Settings (gear) → Script properties → add:
     META_PIXEL_ID     = 1396011689261359  (dataset "couplo design studio" — the one Leadvyne also uses)
     META_CAPI_TOKEN   = Events Manager → that pixel → Settings → Conversions API → Generate access token
     META_TEST_CODE    = (optional) test code from Events Manager → Test events; delete it when testing is done
   Then run capiSetup() once from the editor. The token is kept only in Script properties —
   never paste it into this file (this file is in the GitHub repo).
   Every order sent is logged in the "Capi" sheet (status sent / error). capiSweep() runs every hour,
   sends orders older than CAPI_DELAY_HOURS and retries failures (Meta accepts events up to 7 days old). */
var CAPI_VERSION = 'v23.0';
var CAPI_DELAY_HOURS = 2;

function capiProps_() {
  var p = PropertiesService.getScriptProperties();
  return { pixel: String(p.getProperty('META_PIXEL_ID') || '').trim(), token: String(p.getProperty('META_CAPI_TOKEN') || '').trim(),
           test: String(p.getProperty('META_TEST_CODE') || '').trim(), version: String(p.getProperty('META_API_VERSION') || CAPI_VERSION).trim() };
}
function capiSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('Capi');
  if (!sh) {
    sh = ss.insertSheet('Capi');
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS.Capi.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, SHEETS.Capi.length).setValues([SHEETS.Capi]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
/* Phone numbers: India is kept as 10 digits (as before); GCC numbers are kept with their country code,
   e.g. 971501234567. Works out the country so Meta gets the right code. */
var GCC_CODES = { '971': ['ae', 9], '966': ['sa', 9], '974': ['qa', 8], '968': ['om', 8], '965': ['kw', 8], '973': ['bh', 8] };
function phoneInfo_(v) {
  var d = String(v || '').replace(/\D/g, '').replace(/^0+/, '');
  for (var cc in GCC_CODES) {
    var g = GCC_CODES[cc];
    if (d.indexOf(cc) === 0 && d.length === cc.length + g[1]) return { stored: d, full: d, country: g[0] };
  }
  var in10 = d.slice(-10);
  return { stored: in10, full: in10.length === 10 ? '91' + in10 : '', country: 'in' };
}
var KERALA_DISTRICTS = ['malappuram','kozhikode','palakkad','thrissur','ernakulam','kannur','kasaragod','wayanad','kollam','thiruvananthapuram','alappuzha','kottayam','idukki','pathanamthitta'];
var TN_DISTRICTS = ['chennai','coimbatore','madurai','tiruchirappalli','salem','tirunelveli','kanyakumari','thanjavur','dindigul','nilgiris','tamilnadu'];
/* state from the district picked in the app (Meta wants lowercase, no spaces); unknown → not sent */
function stateOf_(district) {
  var d = String(district || '').toLowerCase().replace(/[^a-z]/g, '');
  if (KERALA_DISTRICTS.indexOf(d) >= 0) return 'kerala';
  if (TN_DISTRICTS.indexOf(d) >= 0) return 'tamilnadu';
  if (d === 'karnataka') return 'karnataka';
  if (d === 'puducherry') return 'puducherry';
  return '';
}
function phoneNorm_(v) { return phoneInfo_(v).stored; }
function sha256_(v) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
/* 'yyyy-MM-dd HH:mm' (India time) → unix seconds; falls back to now */
function capiTime_(o) {
  var m = String(o.createdAt || '').match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/) ||
          String(o.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/); // old rows without createdAt: order date, noon
  var now = Math.floor(Date.now() / 1000);
  if (!m) return now;
  var t = Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 12), +(m[5] || 0)) / 1000) - 330 * 60; // IST = UTC+5:30
  return t > now ? now : t;
}
function capiEvent_(o) {
  var pi = phoneInfo_(o.phone);
  var ud = { country: [sha256_(pi.country)] };
  var st = pi.country === 'in' ? stateOf_(o.district) : '';
  if (st) ud.st = [sha256_(st)];
  if (pi.full) { ud.ph = [sha256_(pi.full)]; ud.external_id = [sha256_(pi.full)]; }
  var first = String(o.customer || '').trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, '');
  if (first) ud.fn = [sha256_(first)];
  var city = String(o.district || '').toLowerCase().replace(/[^a-z]/g, '');
  if (city && !/^(karnataka|tamilnadu|otherstate)$/.test(city)) ud.ct = [sha256_(city)];
  var pin = String(o.pincode || '').replace(/\D/g, '');
  if (pin.length === 6) ud.zp = [sha256_(pin)];
  var qty = Number(o.qty) || 1, value = Number(o.amount) || 0;
  return {
    event_name: 'Purchase', event_time: capiTime_(o), event_id: 'order_' + o.id, action_source: 'chat', user_data: ud,
    custom_data: { currency: 'INR', value: value, order_id: String(o.orderNo || o.id), content_type: 'product',
      content_name: String(o.product || ''), content_category: o.type === 'affordable' ? 'affordable' : 'premium',
      contents: orderItems_(o).map(function (x) { var q = Number(x.qty) || 1; return { id: String(x.product || 'order').toLowerCase().replace(/[^a-z0-9]+/g, '-'), quantity: q, item_price: Math.round((Number(x.amount) || 0) / q) }; }),
      num_items: qty }
  };
}
/* sends orders to Meta; returns { sent, failed, error } */
function capiPost_(orders) {
  var c = capiProps_();
  if (!c.pixel || !c.token) return { sent: 0, failed: orders.length, error: 'META_PIXEL_ID / META_CAPI_TOKEN not set in Script properties' };
  var payload = { data: orders.map(capiEvent_), access_token: c.token };
  if (c.test) payload.test_event_code = c.test;
  var res = UrlFetchApp.fetch('https://graph.facebook.com/' + c.version + '/' + c.pixel + '/events',
    { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  var code = res.getResponseCode(), body = res.getContentText();
  if (code === 200) return { sent: orders.length, failed: 0, test: !!c.test };
  var msg = body; try { msg = JSON.parse(body).error.message; } catch (e) {}
  return { sent: 0, failed: orders.length, error: 'HTTP ' + code + ': ' + msg };
}
function capiLog_(o, r) {
  var n = now_();
  upsert_('Capi', { id: o.id, status: r.error ? 'error' : (r.test ? 'test' : 'sent'), sentAt: n.date + ' ' + n.time,
    orderNo: o.orderNo, value: o.amount, note: r.error ? String(r.error).slice(0, 300) : '' });
}
/* hourly: send orders entered 2+ hours ago (and within 7 days) that are not yet "sent" in the Capi sheet */
function capiSweep() {
  if (!capiProps_().token) return { ok: false, error: 'CAPI not set up' };
  capiSheet_();
  var done = {}; rows_('Capi').forEach(function (r) { if (r.status === 'sent') done[r.id] = 1; });
  var nowS = Math.floor(Date.now() / 1000), oldest = nowS - 7 * 86400 + 3600, newest = nowS - CAPI_DELAY_HOURS * 3600;
  var todo = rows_('Orders').filter(function (o) { var t = capiTime_(o); return !done[o.id] && Number(o.amount) > 0 && t > oldest && t <= newest; });
  var sent = 0, errors = [];
  for (var i = 0; i < todo.length; i += 50) {
    var batch = todo.slice(i, i + 50), r = capiPost_(batch);
    batch.forEach(function (o) { capiLog_(o, r); });
    sent += r.sent; if (r.error) errors.push(r.error);
  }
  Logger.log('CAPI sweep: ' + sent + ' sent of ' + todo.length + (errors.length ? ' — ' + errors[0] : ''));
  return { ok: !errors.length, sent: sent, total: todo.length, error: errors[0] };
}
/* run once from the editor after adding the Script properties: checks the settings,
   sends the last 7 days of orders, and turns on the hourly retry */
function capiSetup() {
  var c = capiProps_();
  if (!c.pixel || !c.token) throw new Error('Add META_PIXEL_ID and META_CAPI_TOKEN in Project Settings → Script properties first.');
  capiSheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'capiSweep') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('capiSweep').timeBased().everyHours(1).create();
  var r = capiSweep();
  Logger.log(JSON.stringify(r));
  if (r.error) throw new Error('Meta said: ' + r.error);
  return r;
}

/* =====================================================================
   WEEKLY ARENA (Nov 2026)
   Points only for work ABOVE normal; minus only for mistakes that cost money.
   Week = Monday to Sunday. Everything is worked out live from the sheets,
   so changing a rule here changes the whole board at once.
   ===================================================================== */
var ARENA_DEFAULTS = { salesDailyMin: '5', salesMonthTarget: '100', teamWeekTarget: '100', premiumPts: '5', mediaDailyMin: '2', accountsBy: '17:30' };
function arenaSet_(k) { var v = setting_('arena_' + k); return v === '' ? ARENA_DEFAULTS[k] : v; }
function arenaNum_(k) { return Number(arenaSet_(k)) || 0; }

/* one-time: new sheets, the two new Orders columns, and Hiba → Design, Mashida → Accounts */
function arenaSetup_() {
  if (setting_('arenaVersion') === '1') return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ['Media', 'Happy', 'Accounts', 'Issues', 'Bonus'].forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, sh.getMaxRows(), SHEETS[name].length).setNumberFormat('@');
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  var oc = SHEETS.Orders, os = sh_('Orders');
  os.getRange(1, 1, 1, oc.length).setValues([oc]).setFontWeight('bold');
  os.getRange(2, oc.length - 1, Math.max(1, os.getMaxRows() - 1), 2).setNumberFormat('@');
  var st = sh_('Staff');
  rows_('Staff').forEach(function (r) {
    if (r.id === 'hiba') st.getRange(r._row, 3).setValue('Design');
    else if (r.id === 'mashida') st.getRange(r._row, 3).setValue('Accounts');
  });
  forget_('Staff'); forget_('Orders');
  upsert_('Settings', { key: 'arenaVersion', value: '1' });
  if (!setting_('arenaStart')) upsert_('Settings', { key: 'arenaStart', value: now_().date }); // minus points only count from this day
}

/* when an order is edited, keep the design / dispatch times it already had */
function keepStages_(o, old, n) {
  o.designDoneAt = old ? (old.designDoneAt || '') : '';
  var was = old ? old.dispatchedAt || '' : '';
  o.dispatchedAt = o.dispatched === 'TRUE' ? (was || n.date + ' ' + n.time) : '';
}

/* ---- dates ---- */
function ad_(ds, k) { var d = new Date(ds + 'T12:00:00'); d.setDate(d.getDate() + k); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function weekOf_(ds) { var d = new Date(ds + 'T12:00:00'), dow = (d.getDay() + 6) % 7; var from = ad_(ds, -dow); return { from: from, to: ad_(from, 6) }; }
function inRange_(ds, r) { ds = String(ds || '').slice(0, 10); return ds >= r.from && ds <= r.to; }
/* Mon–Sat that are not office holidays */
function workDays_(from, to) {
  var h = holidays_(), out = [];
  for (var d = from; d <= to; d = ad_(d, 1)) { if (new Date(d + 'T12:00:00').getDay() !== 0 && !h[d]) out.push(d); }
  return out;
}

/* ---- who is in which arena section ---- */
function arenaSection_(s) {
  var c = cats_(s.role, s.sales);
  if (c.indexOf('Sales') >= 0) return 'Sales';
  if (c.indexOf('Design') >= 0) return 'Design';
  if (c.indexOf('Printing') >= 0) return 'Printing';
  if (c.indexOf('Media') >= 0) return 'Media';
  if (c.indexOf('Accounts') >= 0) return 'Accounts';
  return '';
}
function arenaStaff_() {
  return staffList_().filter(function (s) { return s.active; }).map(function (s) {
    return { id: s.id, name: s.name, order: s.order, section: arenaSection_(s), cats: cats_(s.role, s.sales) };
  }).filter(function (s) { return s.section; });
}

/* ---- the scoring ---- returns { staffId: { pts, lines:[{date,why,pts}] } } */
function arenaScore_(wk, today) {
  var people = arenaStaff_(), res = {}, add = function (id, date, why, p) { if (!res[id] || !p) return; res[id].pts += p; res[id].lines.push({ date: date, why: why, pts: p }); };
  people.forEach(function (s) { res[s.id] = { pts: 0, lines: [] }; });
  var orders = rows_('Orders'), wkOrders = orders.filter(function (o) { return inRange_(o.date, wk); });
  var issues = rows_('Issues').filter(function (x) { return x.status === 'approved' && inRange_(x.date, wk); });
  var blamed = {}; issues.forEach(function (x) { (blamed[x.blame] = blamed[x.blame] || []).push(x); });
  var dmin = arenaNum_('salesDailyMin'), prem = arenaNum_('premiumPts');
  var leads = {}; rows_('Sales').forEach(function (r) { if (inRange_(r.date, wk)) leads[r.staffId] = (leads[r.staffId] || 0) + (Number(r.leads) || 0); });
  var best = null, start = setting_('arenaStart') || '2000-01-01';
  people.forEach(function (s) {
    var mine = blamed[s.id] || [];
    mine.forEach(function (x) { add(s.id, x.date, (x.kind || 'reprint').toUpperCase() + ' · ' + x.orderNo, -10); });
    if (s.section === 'Sales') {
      var my = wkOrders.filter(function (o) { return o.staffId === s.id; }), byDay = {}, late = 0;
      my.forEach(function (o) {
        byDay[o.date] = (byDay[o.date] || 0) + 1;
        if (o.type === 'premium') add(s.id, o.date, 'Premium order ' + o.orderNo, prem);
        if (o.date >= start && o.createdAt && o.createdAt.slice(0, 10) > o.date) { late++; add(s.id, o.date, 'Entered late ' + o.orderNo, -10); }
      });
      Object.keys(byDay).forEach(function (d) { if (byDay[d] > dmin) add(s.id, d, (byDay[d] - dmin) + ' orders above ' + dmin, (byDay[d] - dmin) * 10); });
      if (my.length && !late) add(s.id, wk.to, 'All orders entered on time', 10);
      var L = leads[s.id] || 0;
      if (L >= 20) { var conv = my.length / L; if (!best || conv > best.conv) best = { id: s.id, conv: conv }; }
    }
    if (s.section === 'Design') {
      var due = wkOrders.filter(function (o) { return o.date < today && o.date >= start; }), lateD = 0;
      due.forEach(function (o) {
        var dd = String(o.designDoneAt || '').slice(0, 10);
        if (!dd || dd > ad_(o.date, 1)) { lateD++; add(s.id, o.date, 'Design late ' + o.orderNo, -5); }
      });
      if (due.length && !lateD) add(s.id, wk.to, 'No pending design all week', 15);
      if (due.length && !mine.length) add(s.id, wk.to, 'Zero design mistakes', 20);
    }
    if (s.section === 'Printing') {
      var sent = orders.filter(function (o) { return inRange_(o.dispatchedAt, wk); });
      sent.forEach(function (o) { if (o.designDoneAt && o.dispatchedAt.slice(0, 10) === o.designDoneAt.slice(0, 10)) add(s.id, o.dispatchedAt.slice(0, 10), 'Same-day dispatch ' + o.orderNo, 2); });
      if (sent.length && !mine.length) add(s.id, wk.to, 'Zero print mistakes', 20);
    }
    if (s.section === 'Media' || s.cats.indexOf('Media') >= 0) {
      var media = rows_('Media').filter(function (m) { return m.staffId === s.id && inRange_(m.date, wk); }), ap = {};
      media.forEach(function (m) {
        var re = Number(m.reedits) || 0;
        if (re) add(s.id, m.date, 'Re-edit × ' + re + ' · ' + m.title, -5 * re);
        if (m.status === 'approved') { ap[m.date] = (ap[m.date] || 0) + 1; if (!re) add(s.id, m.date, 'Approved first time · ' + m.title, 3); }
      });
      var mmin = arenaNum_('mediaDailyMin');
      Object.keys(ap).forEach(function (d) { if (ap[d] > mmin) add(s.id, d, (ap[d] - mmin) + ' videos above ' + mmin, (ap[d] - mmin) * 10); });
    }
    if (s.section === 'Accounts') {
      var reps = {}; rows_('Accounts').forEach(function (r) { if (inRange_(r.date, wk)) reps[r.date] = r; });
      var by = arenaSet_('accountsBy'), days = workDays_(wk.from > start ? wk.from : start, today < wk.to ? ad_(today, -1) : wk.to), miss = 0, onTime = 0, vend = false;
      days.forEach(function (d) {
        var r = reps[d];
        if (!r) { miss++; add(s.id, d, 'Daily balance report missing', -5); return; }
        if (r.submittedAt.slice(0, 10) === d && r.submittedAt.slice(11, 16) <= by) onTime++;
      });
      Object.keys(reps).forEach(function (d) { var r = reps[d]; if (r.mismatch === 'TRUE' && r.fixed === 'TRUE') add(s.id, d, 'Mismatch found and fixed', 10); if (r.vendors === 'TRUE') vend = true; });
      if (days.length && !miss && onTime === days.length) add(s.id, wk.to, 'All reports before ' + by, 10);
      if (vend) add(s.id, wk.to, 'Vendor balance report', 10);
    }
  });
  if (best) add(best.id, wk.to, 'Best conversion of the week (' + Math.round(best.conv * 1000) / 10 + '%)', 20);
  rows_('Happy').forEach(function (h) { if (inRange_(h.date, wk) && Number(h.count)) add(h.staffId, h.date, h.count + ' happy customer moment(s)', 5 * Number(h.count)); });
  rows_('Bonus').forEach(function (x) { if (inRange_(x.date, wk)) add(x.staffId, x.date, x.note || 'Admin', Number(x.points) || 0); });
  return res;
}

/* the whole board for one week + order targets for the month */
function arenaBoard_(day, today) {
  var wk = weekOf_(day), sc = arenaScore_(wk, today), people = arenaStaff_();
  var month = day.slice(0, 7), orders = rows_('Orders');
  var mt = arenaNum_('salesMonthTarget'), wt = arenaNum_('teamWeekTarget');
  var mEnd = Utilities.formatDate(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0), TZ, 'yyyy-MM-dd');
  var left = workDays_(today > month + '-01' ? today : month + '-01', mEnd).length || 1;
  var leads = {}; rows_('Sales').forEach(function (r) { if (r.date.indexOf(month) === 0) leads[r.staffId] = (leads[r.staffId] || 0) + (Number(r.leads) || 0); });
  var board = people.map(function (s) {
    var r = { id: s.id, name: s.name, section: s.section, pts: sc[s.id].pts, lines: sc[s.id].lines };
    if (s.section === 'Sales') {
      var mo = orders.filter(function (o) { return o.staffId === s.id && o.date.indexOf(month) === 0; }).length;
      r.month = mo; r.target = mt; r.left = Math.max(0, mt - mo); r.perDay = Math.round(r.left / left * 10) / 10;
      r.week = orders.filter(function (o) { return o.staffId === s.id && inRange_(o.date, wk); }).length;
      r.leads = leads[s.id] || 0; r.conv = r.leads ? Math.round(mo / r.leads * 1000) / 10 : null;
      r.incentive = Math.max(0, mo - mt);
    }
    return r;
  }).sort(function (a, b) { return b.pts - a.pts; });
  var teamWeek = orders.filter(function (o) { return inRange_(o.date, wk); }).length;
  var teamMonth = orders.filter(function (o) { return o.date.indexOf(month) === 0; }).length;
  var nSales = people.filter(function (s) { return s.section === 'Sales'; }).length;
  return { week: wk, today: today, board: board, team: { week: teamWeek, weekTarget: wt, month: teamMonth, monthTarget: mt * nSales, daysLeft: left } };
}

/* actions any logged-in staff can do (staffId + PIN) */
function arenaStaffAction_(b, n) {
  var A = { arenaMe: 1, mediaAdd: 1, mediaLink: 1, designDone: 1, dispatchDone: 1, issueAdd: 1, happySave: 1, accountsSave: 1 };
  if (!A[b.action]) return null;
  var me = staffList_().filter(function (x) { return x.id === b.staffId; })[0];
  if (!me) return { ok: false, error: 'Staff not found' };
  if (me.pin && String(me.pin) !== String(b.pin)) return { ok: false, error: 'Wrong PIN' };
  var cats = cats_(me.role, me.sales), sec = arenaSection_(me), stamp = n.date + ' ' + n.time;
  var can = function (c) { return cats.indexOf(c) >= 0 || (c === 'Accounts' && sec === 'Accounts'); };
  var order = function () { return rows_('Orders').filter(function (o) { return o.id === b.orderId; })[0]; };
  switch (b.action) {
    case 'arenaMe': {
      var bd = arenaBoard_(/^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) ? String(b.day) : n.date, n.date), out = { ok: true, me: me.id, section: sec, cats: cats, arena: bd };
      var recent = ad_(n.date, -30);
      if (can('Media')) out.media = rows_('Media').filter(function (m) { return m.staffId === me.id && m.date >= recent; }).reverse();
      if (can('Design') || can('Printing')) {
        out.queue = rows_('Orders').filter(function (o) { return o.date >= recent && o.dispatched !== 'TRUE'; })
          .map(function (o) { return { id: o.id, orderNo: o.orderNo, date: o.date, staffId: o.staffId, customer: o.customer, product: o.product, type: o.type, designDoneAt: o.designDoneAt || '' }; });
      }
      if (can('Printing') || can('Design')) out.issues = rows_('Issues').filter(function (x) { return x.date >= recent; }).reverse();
      if (can('Accounts')) {
        out.accounts = rows_('Accounts').filter(function (r) { return r.date >= recent; });
        out.happy = rows_('Happy').filter(function (h) { return h.date >= ad_(n.date, -40); });
        out.salesStaff = staffList_().filter(function (s) { return s.sales || s.id === 'foumidha'; }).map(function (s) { return { id: s.id, name: s.name, order: s.order, active: s.active }; });
      }
      out.staffNames = staffList_().map(function (s) { return { id: s.id, name: s.name, sales: s.sales, section: arenaSection_(s) }; });
      return out;
    }
    case 'mediaAdd': {
      if (!can('Media')) return { ok: false, error: 'Only media staff' };
      var m = { id: 'm' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e6).toString(36), date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) && b.date <= n.date && b.date >= ad_(n.date, -3) ? b.date : n.date, staffId: me.id,
        product: String(b.product || '').trim(), concept: String(b.concept || '').trim(), title: String(b.title || '').trim(), status: 'pending', reedits: '0', igLink: '', createdAt: stamp, decidedAt: '' };
      if (!m.product && !m.title) return { ok: false, error: 'Enter product or a name' };
      upsert_('Media', m); return { ok: true, item: m };
    }
    case 'mediaLink': {
      var mi = findRow_('Media', b.id);
      if (!mi || mi.staffId !== me.id) return { ok: false, error: 'Video not found' };
      var link = String(b.igLink || '').trim();
      if (link && !/^https?:\/\/(www\.)?instagram\.com\//i.test(link)) return { ok: false, error: 'Paste the Instagram post link' };
      mi.igLink = link; if (mi.status === 'reedit') mi.status = 'pending'; upsert_('Media', mi); return { ok: true, item: mi };
    }
    case 'designDone': {
      if (!can('Design')) return { ok: false, error: 'Only design staff' };
      var o = order(); if (!o) return { ok: false, error: 'Order not found' };
      o.designDoneAt = b.undo ? '' : (o.designDoneAt || stamp); upsert_('Orders', o); return { ok: true, order: o };
    }
    case 'dispatchDone': {
      if (!can('Printing')) return { ok: false, error: 'Only printing staff' };
      var p = order(); if (!p) return { ok: false, error: 'Order not found' };
      p.dispatched = 'TRUE'; p.dispatchedAt = p.dispatchedAt || stamp; upsert_('Orders', p); return { ok: true, order: p };
    }
    case 'issueAdd': {
      var kinds = ['reprint', 'damage', 'rework'];
      if (kinds.indexOf(b.kind) < 0) return { ok: false, error: 'Pick reprint, damage or rework' };
      if (!String(b.orderNo || '').trim()) return { ok: false, error: 'Enter the order number' };
      var x = { id: 'i' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e6).toString(36), date: n.date, orderNo: String(b.orderNo).trim().toUpperCase(), kind: b.kind, blame: String(b.blame || ''), note: String(b.note || '').trim(), by: me.id, status: 'pending', createdAt: stamp };
      upsert_('Issues', x); return { ok: true, issue: x };
    }
    case 'happySave': {
      if (!can('Accounts') && !can('HR')) return { ok: false, error: 'Only accounts staff' };
      var hd = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) && b.date <= n.date ? b.date : n.date, counts = b.counts || {};
      Object.keys(counts).forEach(function (sid) {
        var c = Math.max(0, Math.floor(Number(counts[sid]) || 0)), k = hd + '__' + sid, was = findRow_('Happy', k);
        if (!c && !was) return;
        upsert_('Happy', { key: k, date: hd, staffId: sid, count: String(c), by: me.id, updatedAt: stamp });
      });
      return { ok: true, happy: rows_('Happy').filter(function (h) { return h.date >= ad_(n.date, -40); }) };
    }
    case 'accountsSave': {
      if (!can('Accounts')) return { ok: false, error: 'Only accounts staff' };
      var ad = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) && b.date <= n.date ? b.date : n.date, k2 = ad + '__' + me.id, old = findRow_('Accounts', k2);
      var r = { key: k2, date: ad, staffId: me.id, banks: JSON.stringify(b.banks || []), cash: String(Number(b.cash) || 0), expenses: String(Number(b.expenses) || 0),
        mismatch: b.mismatch ? 'TRUE' : 'FALSE', fixed: b.fixed ? 'TRUE' : 'FALSE', vendors: b.vendors ? 'TRUE' : 'FALSE', note: String(b.note || '').trim(), submittedAt: old ? old.submittedAt : stamp };
      upsert_('Accounts', r); return { ok: true, report: r };
    }
  }
  return null;
}

/* admin-only arena actions (admin PIN already checked) */
function arenaAdminAction_(b, n) {
  switch (b.action) {
    case 'arenaAdmin': {
      var day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) ? String(b.day) : n.date;
      var out = arenaBoard_(day, n.date);
      out.ok = true;
      out.pendingMedia = rows_('Media').filter(function (m) { return m.status === 'pending'; });
      out.recentMedia = rows_('Media').filter(function (m) { return m.date >= ad_(n.date, -14); }).reverse();
      out.pendingIssues = rows_('Issues').filter(function (x) { return x.status === 'pending'; });
      out.accounts = rows_('Accounts').filter(function (r) { return r.date >= ad_(n.date, -14); }).reverse();
      out.bonus = rows_('Bonus').filter(function (x) { return inRange_(x.date, out.week); });
      out.settings = {}; Object.keys(ARENA_DEFAULTS).forEach(function (k) { out.settings[k] = arenaSet_(k); });
      out.staffNames = staffList_().map(function (s) { return { id: s.id, name: s.name, sales: s.sales, section: arenaSection_(s) }; });
      return out;
    }
    case 'mediaDecide': {
      var m = findRow_('Media', b.id); if (!m) return { ok: false, error: 'Video not found' };
      if (b.status === 'approved') m.status = 'approved';
      else if (b.status === 'reedit') { m.status = 'reedit'; m.reedits = String((Number(m.reedits) || 0) + 1); }
      else return { ok: false, error: 'Pick Approved or Re-edit' };
      m.decidedAt = n.date + ' ' + n.time; upsert_('Media', m); return { ok: true, item: m };
    }
    case 'issueDecide': {
      var x = findRow_('Issues', b.id); if (!x) return { ok: false, error: 'Not found' };
      if (['approved', 'rejected'].indexOf(b.status) < 0) return { ok: false, error: 'Pick approve or reject' };
      x.status = b.status; if (b.blame != null) x.blame = String(b.blame); upsert_('Issues', x); return { ok: true, issue: x };
    }
    case 'bonusAdd': {
      var pts = Math.round(Number(b.points) || 0);
      if (!b.staffId || !pts) return { ok: false, error: 'Pick staff and points' };
      var bo = { id: 'b' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e6).toString(36), date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? b.date : n.date, staffId: String(b.staffId), points: String(pts), note: String(b.note || '').trim(), createdAt: n.date + ' ' + n.time };
      upsert_('Bonus', bo); return { ok: true, bonus: bo };
    }
    case 'bonusDelete': remove_('Bonus', b.id); return { ok: true };
    case 'arenaSettings': {
      var s = b.settings || {};
      Object.keys(ARENA_DEFAULTS).forEach(function (k) { if (s[k] != null && String(s[k]).trim() !== '') upsert_('Settings', { key: 'arena_' + k, value: String(s[k]).trim() }); });
      return { ok: true };
    }
  }
  return null;
}
