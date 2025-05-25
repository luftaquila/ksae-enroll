import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import express from 'express'
import pinoHttp from 'pino-http';
import Database from 'better-sqlite3';

const queues = {
  formula: { name: 'Formula', short: 'FSK', length: 0 },
  baja: { name: 'Baja', short: 'BSK', length: 0 },
};

// init db
const db = new Database('./data/enroll.db');

db.transaction(() => {
  db.exec(`CREATE TABLE IF NOT EXISTS queue (
    phone TEXT PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`);

  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`).run('sms', '0');

  if (!process.env.NAVER_CLOUD_ACCESS_KEY ||
    !process.env.NAVER_CLOUD_SECRET_KEY ||
    !process.env.NAVER_CLOUD_SMS_SERVICE_ID ||
    !process.env.PHONE_NUMBER_SMS_SENDER) {
    db.prepare(`UPDATE settings SET value = ? WHERE key = ?`).run('0', 'sms');
  }
})();

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

const app = express();
app.use(express.json());
app.use(express.static('./web'));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.headers.authuser = req.headers.authorization ? Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('utf-8').split(':')[0] : undefined;
  next();
});
app.use(pinoHttp({ stream: fs.createWriteStream('./data/enroll.log', { flags: 'a' }) }));

app.listen(8000);

// return queue list
app.get('/queue', (req, res) => {
  res.json(queues);
});

// return rank in queue
app.get('/queue/:phone', async (req, res) => {
  try {
    const rank = db.prepare(`
      SELECT type, rank FROM (
        SELECT phone, type, ROW_NUMBER()
        OVER (PARTITION BY type ORDER BY timestamp) AS rank FROM queue) AS ranked
      WHERE phone = ?
    `).get(req.params.phone);

    if (!rank) {
      return res.status(404).send('등록 대기중인 대회가 없습니다.');
    }

    res.json({ rank: rank ? rank.rank : -1, type: rank.type });
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// return whole queue
app.get('/admin/:type', (req, res) => {
  try {
    res.json(db.prepare(`SELECT * FROM queue WHERE type = ? ORDER BY timestamp ASC`).all(req.params.type));
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// register new waiter
app.post('/register/:type', async (req, res) => {
  if (!/^010\d{8}$/.test(req.body.phone)) {
    return res.status(400).send('전화번호가 올바르지 않습니다.');
  }

  if (!queues.hasOwnProperty(req.params.type)) {
    return res.status(400).send('대기열이 유효하지 않습니다.');
  }

  try {
    db.prepare('INSERT INTO queue (phone, timestamp, type) VALUES (?, ?, ?)').run(req.body.phone, Date.now(), req.params.type);
    queues[req.params.type].length++;
    res.status(201).send();
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return res.status(400).send('이미 등록된 전화번호입니다.');
    }

    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// delete waiter
app.delete('/admin/:type', (req, res) => {
  if (!/^010\d{8}$/.test(req.body.phone)) {
    return res.status(400).send('전화번호가 올바르지 않습니다.');
  }

  if (!queues.hasOwnProperty(req.params.type)) {
    return res.status(400).send('대기열이 유효하지 않습니다.');
  }

  try {
    const result = db.prepare('DELETE FROM queue WHERE phone = ? AND type = ?').run(req.body.phone, req.params.type);
    queues[req.params.type].length--; 

    if (result.changes === 0) {
      return res.status(404).send('해당 전화번호의 대기자가 없습니다.');
    }

    res.status(200).send('삭제되었습니다.');
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }

  // send SMS to next waiter
  let order = 0;
  let target = undefined;

  try {
    order = Number(db.prepare(`SELECT value FROM settings WHERE key = 'sms'`).get().value);

    if (order < 1) {
      return;
    }

    target = db.prepare(`SELECT * FROM queue WHERE type = ? ORDER BY timestamp ASC LIMIT 1 OFFSET ?`).get(req.params.type, order - 1);
  } catch (e) {
    return console.error(`DB 오류: ${e}`);
  }

  if (target) {
    let payload = {
      hostname: 'sens.apigw.ntruss.com',
      port: 443,
      path: `/sms/v2/services/${process.env.NAVER_CLOUD_SMS_SERVICE_ID}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': Date.now(),
        'x-ncp-iam-access-key': process.env.NAVER_CLOUD_ACCESS_KEY,
        'x-ncp-apigw-signature-v2': ''
      }
    };

    payload.headers['x-ncp-apigw-signature-v2'] = crypto.createHmac('sha256', process.env.NAVER_CLOUD_SECRET_KEY)
      .update(`${payload.method} ${payload.path}\n${payload.headers['x-ncp-apigw-timestamp']}\n${process.env.NAVER_CLOUD_ACCESS_KEY}`)
      .digest('base64');

    const sms = https.request(payload, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => console.log(data));
    });

    sms.on('error', e => console.error(e));
    sms.write(JSON.stringify({
      type: 'SMS',
      from: process.env.PHONE_NUMBER_SMS_SENDER,
      content: `[${queues[target.type].short} ${new Date().getFullYear()}]\n등록 대기 순서 ${order}번입니다. 등록 부스로 오세요.`,
      messages: [{ to: target.phone }]
    }));
    sms.end();
  }
});

// get sms configuration
app.get('/settings/sms', (req, res) => {
  try {
    const sms = db.prepare('SELECT value FROM settings WHERE key = ?').get('sms');
    res.json({ value: Math.floor(sms.value) });
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});

// update sms configuration
app.patch('/admin/settings/sms', (req, res) => {
  const value = Number(req.body.value);

  if (Number.isNaN(value) || value < 0) {
    return res.status(400).send('잘못된 설정값입니다.');
  }

  try {
    if (value) {
      if (!process.env.NAVER_CLOUD_ACCESS_KEY ||
        !process.env.NAVER_CLOUD_SECRET_KEY ||
        !process.env.NAVER_CLOUD_SMS_SERVICE_ID ||
        !process.env.PHONE_NUMBER_SMS_SENDER) {
        return res.status(400).send('SMS 환경 변수가 설정되지 않았습니다.');
      }
    }

    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(Number(req.body.value), 'sms');
    res.status(200).send();
  } catch (e) {
    return res.status(500).send(`DB 오류: ${e}`);
  }
});
