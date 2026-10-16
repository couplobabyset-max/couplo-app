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
  Sales:      ['key','date','staffId','leads','premium','affordable','amount'],
  Pay:        ['key','month','staffId','advance','extra','note'],
  Orders:     ['id','orderNo','date','staffId','type','customer','phone','district','pincode','product','qty','amount','dispatched','note','createdAt'],
  Products:   ['id','name','type','price','active','order'],
  Tasks:      ['id','category','name','kind','order','active','options'],
  Work:       ['key','date','staffId','taskId','value','updatedAt'],
  Settings:   ['key','value']
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
  var topOf = function (key) { var g = {}; today.forEach(function (o) { var k = o[key] || '—'; g[k] = (g[k] || 0) + 1; }); return Object.keys(g).sort(function (a, b) { return g[b] - g[a]; }).slice(0, 8).map(function (k) { return [esc(k), g[k]]; }); };
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
    '<h3 style="color:#511F52">Attendance</h3>' + (notIn.length ? '<p style="color:#9a5b00"><b>No attendance:</b> ' + notIn.join(', ') + '</p>' : '') + table(['Staff', 'In – Out', 'Reasons / notes'], attRows) +
    '<p style="color:#888;font-size:12px">Sent automatically by the Couplo Attendance app. Change the time or turn this off in Admin → Staff → Daily report.</p></div></div>';
  MailApp.sendEmail({ to: to, subject: 'Couplo daily report · ' + day + ' · ' + today.length + ' orders · ' + rs(tot), htmlBody: html, name: 'Couplo Attendance' });
  return { ok: true, to: to };
}

/* ---------- helpers ---------- */
function sh_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function str_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, v.getFullYear() < 1900 ? 'HH:mm' : 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}
function rows_(name) {
  var sh = sh_(name), cols = SHEETS[name], n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, cols.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 }; cols.forEach(function (c, j) { o[c] = str_(r[j]); }); return o;
  });
}
function upsert_(name, obj) {
  var sh = sh_(name), cols = SHEETS[name], key = obj[cols[0]];
  var found = rows_(name).filter(function (r) { return r[cols[0]] === key; })[0];
  var vals = [cols.map(function (c) { return obj[c] == null ? '' : String(obj[c]); })];
  if (found) sh.getRange(found._row, 1, 1, cols.length).setValues(vals);
  else { var r = sh.getLastRow() + 1; sh.getRange(r, 1, 1, cols.length).setNumberFormat('@').setValues(vals); }
}
function remove_(name, key) {
  var sh = sh_(name), col = SHEETS[name][0];
  var found = rows_(name).filter(function (r) { return r[col] === key; })[0];
  if (found) sh.deleteRow(found._row);
}
function setting_(k) { var r = rows_('Settings').filter(function (x) { return x.key === k; })[0]; return r ? r.value : ''; }
function bool_(v) { return String(v).toUpperCase() === 'TRUE'; }
function staffList_() {
  return rows_('Staff').map(function (s) {
    return { id: s.id, name: s.name, role: s.role, salary: Number(s.salary) || 0, pin: s.pin,
             sales: bool_(s.sales), active: s.active === '' ? true : bool_(s.active), order: s.order === '' ? null : Number(s.order), email: s.email || '' };
  });
}
/* Printing = printing production, Add-ons = bows / socks / boots…, Regular = does every kind of work (attendance only, no work list) */
var CATS = ['Sales', 'Office', 'Media', 'Printing', 'Add-ons', 'Regular'];
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
  return { type: t(o.type) === 'affordable' ? 'affordable' : 'premium', customer: t(o.customer).toUpperCase(),
    phone: t(o.phone).replace(/\D/g, '').slice(-10), district: t(o.district).toUpperCase(), pincode: t(o.pincode).replace(/\D/g, '').slice(0, 6),
    product: t(o.product).toUpperCase(), qty: Number(o.qty) || 1, amount: Number(o.amount) || 0, note: t(o.note) };
}
/* delete every row of a sheet that matches — bottom first so row numbers stay right */
function deleteWhere_(name, fn) {
  if (!sh_(name)) return 0;
  var sh = sh_(name), hit = rows_(name).filter(fn).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; });
  hit.forEach(function (row) { sh.deleteRow(row); });
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
  upsert_('Settings', { key: 'catVersion', value: '1' });
}
function now_() { var d = new Date(); return { date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: Utilities.formatDate(d, TZ, 'HH:mm') }; }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ---------- API ---------- */
function doGet() { return out_({ ok: true, app: 'couplo-attendance' }); }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse(e.postData.contents || '{}');
    return out_(handle_(b));
  } catch (err) {
    return out_({ ok: false, error: String(err && err.message || err) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

function handle_(b) {
  migrate_();
  var n = now_();
  switch (b.action) {
    case 'kiosk': {
      var att = {};
      rows_('Attendance').forEach(function (r) { if (r.date === n.date) att[r.staffId] = r; });
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
      var rec = rows_('Attendance').filter(function (r) { return r.key === key; })[0];
      if (rec && (rec.status === 'leave' || rec.status === 'wfh')) return { ok: false, error: 'Today is marked as ' + rec.status };
      var kind, reason = String(b.reason || '').trim();
      var toMin = function (t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1]); };
      if (!rec || !rec.in) {
        if (toMin(n.time) > toMin(setting_('lateAfter') || '09:40') && !reason) return { ok: false, needReason: 'late', time: n.time };
        rec = { key: key, date: n.date, staffId: s.id, status: 'present', in: n.time, out: '', note: '', lateReason: reason, earlyReason: '' }; kind = 'in';
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
      sh_('Staff').getRange(row._row, 5).setNumberFormat('@').setValue(String(b.newPin));
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
        category: myCat, tasks: myCat === 'Regular' ? [] : taskList_().filter(function (t) { return t.active && (myCats.indexOf(t.category) >= 0 || t.category === p.id); }), work: workRows_(mm, p.id) };
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
      if (b.action === 'addOrder') {
        var mine = rows_('Orders').filter(function (x) { return x.staffId === me.id && x.date === n.date; }).length;
        o.id = 'o' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
        o.orderNo = String(b.order.orderNo || '').trim().toUpperCase() || (me.name.charAt(0) + (o.type === 'affordable' ? 'A' : 'P') + n.date.slice(5, 7) + n.date.slice(8, 10) + '-' + (mine + 1));
        o.date = n.date; o.staffId = me.id; o.dispatched = b.order.dispatched ? 'TRUE' : 'FALSE'; o.createdAt = n.date + ' ' + n.time;
        upsert_('Orders', o);
        return { ok: true, order: o };
      }
      var old = rows_('Orders').filter(function (x) { return x.id === b.order.id; })[0];
      if (!old || old.staffId !== me.id) return { ok: false, error: 'Order not found' };
      if (old.date.indexOf(month) !== 0) return { ok: false, error: 'Only this month\'s orders can be changed' };
      o.id = old.id; o.orderNo = String(b.order.orderNo || '').trim().toUpperCase() || old.orderNo; o.date = old.date; o.staffId = old.staffId; o.dispatched = b.order.dispatched ? 'TRUE' : 'FALSE'; o.createdAt = old.createdAt;
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
      return { ok: true };
    }
  }
  /* everything below needs the admin PIN */
  var pin = setting_('adminPin');
  if (!pin || String(b.adminPin) !== pin) return { ok: false, error: 'Admin PIN needed' };
  switch (b.action) {
    case 'month': {
      var m = String(b.month); // yyyy-MM
      return { ok: true, today: n.date, staff: staffList_(), products: productList_(), tasks: taskList_(), work: workRows_(m),
        att: rows_('Attendance').filter(function (r) { return r.date.indexOf(m) === 0; }),
        sales: rows_('Sales').filter(function (r) { return r.date.indexOf(m) === 0; }),
        pay: rows_('Pay').filter(function (r) { return r.month === m; }),
        orders: rows_('Orders').filter(function (r) { return r.date.indexOf(m) === 0; }) };
    }
    case 'allOrders': return { ok: true, orders: rows_('Orders') };
    case 'saveOrder': {
      var so = cleanOrder_(b.order); so.id = b.order.id || ('o' + new Date().getTime().toString(36));
      ['orderNo','date','staffId','createdAt'].forEach(function (k) { so[k] = String(b.order[k] || ''); });
      so.dispatched = (b.order.dispatched === true || b.order.dispatched === 'TRUE') ? 'TRUE' : 'FALSE';
      if (!so.date) so.date = n.date;
      upsert_('Orders', so); return { ok: true, order: so };
    }
    case 'deleteOrder': remove_('Orders', b.id); return { ok: true };
    case 'setDispatched': {
      var od = rows_('Orders').filter(function (x) { return x.id === b.id; })[0];
      if (!od) return { ok: false, error: 'Order not found' };
      od.dispatched = b.value ? 'TRUE' : 'FALSE'; upsert_('Orders', od); return { ok: true };
    }
    case 'saveAtt': { var a = b.rec; a.key = a.date + '__' + a.staffId; upsert_('Attendance', a); return { ok: true }; }
    case 'deleteAtt': remove_('Attendance', b.date + '__' + b.staffId); return { ok: true };
    case 'saveSales':
      (b.rows || []).forEach(function (r) { r.key = r.date + '__' + r.staffId; upsert_('Sales', r); });
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
