/**
 * ゴルフ振り返りアプリ（児玉・古河）の共有保存先
 * Googleスプレッドシートの「拡張機能 → Apps Script」に貼り付けて、
 * 「デプロイ → 新しいデプロイ → ウェブアプリ」で公開する。
 *   次のユーザーとして実行：自分
 *   アクセスできるユーザー：全員
 */
const SHEET = "rounds";
const CLUBS = ["kodama", "furukawa"];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(["保存日時", "ゴルフ場", "プレーヤーID", "ラウンドID", "日付", "OUT", "IN", "ホールデータ"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function num_(x) { return typeof x === "number" && isFinite(x) ? x : null; }
function str_(x) { return typeof x === "string" ? x.slice(0, 8) : null; }

// 読み込み：?club=kodama のように指定
function doGet(e) {
  const club = (e && e.parameter && e.parameter.club) || "";
  if (CLUBS.indexOf(club) < 0) return json_({ ok: false, error: "club" });
  const rows = sheet_().getDataRange().getValues().slice(1);
  const rounds = [], players = {};
  rows.forEach(function (r) {
    if (r[1] !== club) return;
    try {
      rounds.push({ id: String(r[3]), out: String(r[5]), inn: String(r[6]), holes: JSON.parse(r[7]) });
      players[r[2]] = true;
    } catch (err) {}
  });
  return json_({ ok: true, rounds: rounds, players: Object.keys(players).length });
}

// 保存：同じプレーヤーの同じラウンドは上書き
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const b = JSON.parse(e.postData.contents);
    if (CLUBS.indexOf(b.club) < 0) return json_({ ok: false, error: "club" });
    const r = b.round || {};
    const holes = (r.holes || []).slice(0, 18).map(function (h) {
      return { par: num_(h.par), score: num_(h.score), putts: num_(h.putts), pin: str_(h.pin), ball: str_(h.ball), slope: str_(h.slope) };
    });
    const pid = String(b.player || "").slice(0, 40), rid = String(r.id || "").slice(0, 40);
    if (!pid || !rid || holes.length !== 18) return json_({ ok: false, error: "bad" });
    const row = [new Date(), b.club, pid, rid, "'" + String(r.date || "").slice(0, 10), str_(r.out), str_(r.inn), JSON.stringify(holes)];
    const sh = sheet_();
    const v = sh.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) {
      if (v[i][1] === b.club && v[i][2] === pid && String(v[i][3]) === rid) {
        sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
        return json_({ ok: true, updated: true });
      }
    }
    sh.appendRow(row);
    return json_({ ok: true, updated: false });
  } finally {
    lock.releaseLock();
  }
}
