'use strict';

// Automated tests for POST /api/ai (T-013). Zero dependencies: runs the
// Express app in-process on an ephemeral port and monkeypatches global.fetch
// so no real OpenRouter calls are made (deterministic and offline).

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Point the todos store at a temp file BEFORE requiring server.js (it reads
// TODOS_FILE at module load) so tests do not touch the repo's data file.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-api-'));
process.env.TODOS_FILE = path.join(tmpDir, 'todos.json');

const { app } = require('./server.js');

const realFetch = global.fetch;

function fakeFetchOk(content) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
}

const VALID_AI_JSON = JSON.stringify({
  tasks: [
    { text: 'write report', priority: 8, reason: 'Deadline is close.' },
    { text: 'water plants', priority: 3, reason: 'Low urgency routine task.' },
  ],
  message: 'Every task you finish grows your skills - keep going!',
});

function request(port, method, urlPath, { body, headers, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const payload = rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload !== undefined && !(headers && headers['transfer-encoding'])
            ? { 'Content-Length': Buffer.byteLength(payload) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// Sends a >1 MB body in chunks WITHOUT a Content-Length header (chunked
// transfer encoding), to exercise the stream-accumulation limit check.
function chunkedOversizedRequest(port) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path: '/api/ai', method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    // The server may respond 413 mid-upload; write errors after that are expected.
    req.on('error', (err) => reject(err));
    const chunk = 'x'.repeat(64 * 1024);
    for (let i = 0; i < 20; i++) req.write(chunk); // ~1.25 MB total
    req.end();
  });
}

const results = [];
function assert(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
    results.push({ name, ok: true });
  } else {
    console.log(`fail ${name}${detail ? ': ' + detail : ''}`);
    results.push({ name, ok: false });
  }
}

async function run() {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;

  const validBody = { tasks: ['write report', 'water plants'], thoughts: 'busy week ahead' };

  try {
    // T1: valid request, AI returns plain JSON -> 200 with expected shape
    global.fetch = fakeFetchOk(VALID_AI_JSON);
    const t1 = await request(port, 'POST', '/api/ai', { body: validBody });
    assert('T1 valid request returns 200', t1.status === 200, `status=${t1.status}`);
    assert(
      'T1 response has tasks[{text,priority,reason}] and message',
      t1.body &&
        Array.isArray(t1.body.tasks) &&
        t1.body.tasks.length === 2 &&
        t1.body.tasks.every(
          (t) => typeof t.text === 'string' && typeof t.priority === 'number' && typeof t.reason === 'string'
        ) &&
        typeof t1.body.message === 'string',
      JSON.stringify(t1.body)
    );

    // T2-T6: input validation -> 422
    const t2 = await request(port, 'POST', '/api/ai', { body: { thoughts: 'no tasks key' } });
    assert('T2 missing tasks returns 422', t2.status === 422, `status=${t2.status}`);

    const t3 = await request(port, 'POST', '/api/ai', { body: { tasks: 'not-an-array', thoughts: 'x' } });
    assert('T3 tasks not array returns 422', t3.status === 422, `status=${t3.status}`);

    const t4 = await request(port, 'POST', '/api/ai', { body: { tasks: [], thoughts: 'x' } });
    assert('T4 empty tasks returns 422', t4.status === 422, `status=${t4.status}`);

    const t5 = await request(port, 'POST', '/api/ai', { body: { tasks: ['ok', 42], thoughts: 'x' } });
    assert('T5 non-string task returns 422', t5.status === 422, `status=${t5.status}`);

    const t6 = await request(port, 'POST', '/api/ai', { body: { tasks: ['ok'] } });
    assert('T6 missing thoughts returns 422', t6.status === 422, `status=${t6.status}`);

    // T7: invalid JSON -> 400
    const t7 = await request(port, 'POST', '/api/ai', { rawBody: '{not json' });
    assert('T7 invalid JSON returns 400', t7.status === 400, `status=${t7.status}`);

    // T8: Content-Length header > 1 MB -> 413 (header pre-check)
    const bigBody = JSON.stringify({ tasks: ['t'], thoughts: 'y'.repeat(2 * 1024 * 1024) });
    const t8 = await request(port, 'POST', '/api/ai', { rawBody: bigBody });
    assert('T8 2MB content-length returns 413', t8.status === 413, `status=${t8.status}`);

    // T9: chunked stream exceeding 1 MB (no content-length) -> 413
    const t9 = await chunkedOversizedRequest(port);
    assert('T9 oversized chunked stream returns 413', t9.status === 413, `status=${t9.status}`);

    // T10: GET /api/ai -> 405
    const t10 = await request(port, 'GET', '/api/ai');
    assert('T10 GET /api/ai returns 405', t10.status === 405, `status=${t10.status}`);

    // T11: unknown API path -> 404
    const t11 = await request(port, 'GET', '/api/nonexistent');
    assert('T11 unknown path returns 404', t11.status === 404, `status=${t11.status}`);

    // T12: AI responds with markdown-fenced JSON -> stripped and parsed, 200
    global.fetch = fakeFetchOk('```json\n' + VALID_AI_JSON + '\n```');
    const t12 = await request(port, 'POST', '/api/ai', { body: validBody });
    assert('T12 markdown-fenced AI JSON returns 200', t12.status === 200, `status=${t12.status}`);
    assert(
      'T12 fenced JSON parsed correctly',
      t12.body && typeof t12.body.message === 'string' && Array.isArray(t12.body.tasks),
      JSON.stringify(t12.body)
    );

    // T13: AI returns unparseable content -> 500 parse error
    global.fetch = fakeFetchOk('Sorry, I cannot help with that.');
    const t13 = await request(port, 'POST', '/api/ai', { body: validBody });
    assert('T13 non-JSON AI content returns 500', t13.status === 500, `status=${t13.status}`);
    assert('T13 error is parse error', t13.body && t13.body.error === 'AI response parse error', JSON.stringify(t13.body));

    // T14: fetch network failure -> 500
    global.fetch = async () => { throw new Error('network down'); };
    const t14 = await request(port, 'POST', '/api/ai', { body: validBody });
    assert('T14 fetch failure returns 500', t14.status === 500, `status=${t14.status}`);
    assert('T14 friendly error message', t14.body && t14.body.error === 'AI service unavailable', JSON.stringify(t14.body));

    // T15: upstream non-2xx -> 500
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    const t15 = await request(port, 'POST', '/api/ai', { body: validBody });
    assert('T15 upstream non-2xx returns 500', t15.status === 500, `status=${t15.status}`);

    // T16: concurrent requests - 10 parallel POST /api/ai all succeed
    global.fetch = fakeFetchOk(VALID_AI_JSON);
    const t16 = await Promise.all(
      Array.from({ length: 10 }, () => request(port, 'POST', '/api/ai', { body: validBody }))
    );
    assert(
      'T16 concurrent requests - 10 parallel POST /api/ai all return 200',
      t16.every((r) => r.status === 200),
      `statuses=${t16.map((r) => r.status).join(',')}`
    );
    assert(
      'T16 all concurrent responses have tasks matching input length and non-empty message',
      t16.every(
        (r) =>
          r.body &&
          Array.isArray(r.body.tasks) &&
          r.body.tasks.length === validBody.tasks.length &&
          typeof r.body.message === 'string' &&
          r.body.message.length > 0
      ),
      JSON.stringify(t16.map((r) => r.body))
    );
    assert(
      'T16 no concurrent response is a 5xx error',
      t16.every((r) => r.status < 500),
      `statuses=${t16.map((r) => r.status).join(',')}`
    );
  } finally {
    global.fetch = realFetch;
    server.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }

  const failures = results.filter((r) => !r.ok);
  if (failures.length === 0) {
    console.log(`\ntest-api (ai): PASS (${results.length}/${results.length})`);
    process.exit(0);
  } else {
    console.log(`\ntest-api (ai): FAIL (${failures.length} of ${results.length} failed)`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('test-api (ai): ERROR', err);
  process.exit(1);
});
