'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pageTools } = require('../client');
const key = 'test-key-not-a-real-credential';
const extract = { ok: true, httpStatus: 200, truncated: false, markdown: 'Hello 🌍', title: 'Example', wordCount: 2 };
const meta = { ok: true, httpStatus: 200, truncated: false, openGraph: {}, twitter: {}, jsonLd: [] };

function mockFetch(t, response) {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return response; });
    return calls;
}

for (const operation of ['extract', 'meta']) test(operation + ' uses the fixed gateway and preserves the full response', async t => {
    const data = operation === 'extract' ? extract : meta;
    const calls = mockFetch(t, Response.json(data));
    const source = 'https://example.com/?a=1&b=%23hello';
    assert.deepEqual(await pageTools(operation, source, key), data);
    assert.equal(calls.length, 1);
    const [url, options] = calls[0];
    assert.equal(url.origin, 'https://prod.api.market');
    assert.equal(url.pathname, '/api/v1/circadian/page-tools/api/' + operation);
    assert.equal(url.searchParams.get('url'), source);
    assert.equal(options.headers['x-api-market-key'], key);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET');
    assert.equal(url.href.includes(key), false);
});

for (const url of ['', 'relative/path', null, {}, 'file:///etc/passwd', 'javascript:alert(1)', 'https://u:p@example.com/', 'x'.repeat(8193)]) {
    test('invalid URL rejected before network: ' + String(url).slice(0, 35), async t => {
        const calls = mockFetch(t, Response.json(extract));
        await assert.rejects(pageTools('extract', url, key), /No request sent/);
        assert.equal(calls.length, 0);
    });
}
for (const value of [undefined, '', '  ', 'bad\r\nkey']) test('missing or unsafe key rejected: ' + String(value), async t => {
    const calls = mockFetch(t, Response.json(extract));
    await assert.rejects(pageTools('extract', 'https://example.com/', value), /No request sent/);
    assert.equal(calls.length, 0);
});
test('operation cannot change authenticated destination', async t => {
    const calls = mockFetch(t, Response.json(extract));
    await assert.rejects(pageTools('//evil.example', 'https://example.com/', key), /No request sent/);
    assert.equal(calls.length, 0);
});
for (const status of [401, 402, 403, 429, 500]) test('HTTP ' + status + ' is sanitized and never retried', async t => {
    const response = new Response(key + ' https://private.example/?token=secret', { status });
    const calls = mockFetch(t, response);
    await assert.rejects(pageTools('extract', 'https://example.com/', key), error => {
        assert.match(error.message, new RegExp('HTTP ' + status));
        assert.equal(error.message.includes(key), false);
        assert.equal(error.message.includes('private.example'), false);
        return true;
    });
    assert.equal(response.bodyUsed, true);
    assert.equal(calls.length, 1);
});
for (const body of ['not json', 'null', '[]', '{}', JSON.stringify({ ...extract, ok: false }), JSON.stringify({ ...extract, httpStatus: 999 }), JSON.stringify({ ...extract, truncated: 'false' }), JSON.stringify({ ...extract, markdown: undefined })]) {
    test('malformed response rejected: ' + body.slice(0, 45), async t => {
        mockFetch(t, new Response(body));
        await assert.rejects(pageTools('extract', 'https://example.com/', key), /Unexpected Page Tools response/);
    });
}
test('metadata must contain an object', async t => {
    mockFetch(t, Response.json({ ...meta, openGraph: [] }));
    await assert.rejects(pageTools('meta', 'https://example.com/', key), /Unexpected/);
});
test('source failures and truncation remain visible', async t => {
    const data = { ...extract, httpStatus: 404, truncated: true };
    mockFetch(t, Response.json(data));
    assert.deepEqual(await pageTools('extract', 'https://example.com/', key), data);
});
test('oversized streamed response is cancelled', async t => {
    let cancelled = false;
    const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled = true; } });
    const calls = mockFetch(t, new Response(body));
    await assert.rejects(pageTools('extract', 'https://example.com/', key), /response size/);
    assert.equal(cancelled, true);
    assert.equal(calls[0][1].signal.aborted, true);
});
test('network errors cannot disclose provider text or key', async t => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error(key); });
    await assert.rejects(pageTools('extract', 'https://example.com/', key), error => !error.message.includes(key) && /No automatic retry/.test(error.message));
});
test('caller cancellation reaches request signal', async t => {
    const controller = new AbortController();
    t.mock.method(globalThis, 'fetch', async (_url, options) => new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('abort')), { once: true });
    }));
    const pending = pageTools('extract', 'https://example.com/', key, controller.signal);
    controller.abort();
    await assert.rejects(pending, /cancellation/);
});
test('25 second timeout covers stalled response body', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    t.mock.method(globalThis, 'fetch', async (_url, options) => new Response(new ReadableStream({
        start(controller) { options.signal.addEventListener('abort', () => controller.error(new Error('timeout'))); }
    })));
    const pending = pageTools('extract', 'https://example.com/', key);
    await Promise.resolve();
    t.mock.timers.tick(25000);
    await assert.rejects(pending, /timeout/);
});

if (process.env.PAGE_TOOLS_REPLAY) {
    const fixture = JSON.parse(require('node:fs').readFileSync(process.env.PAGE_TOOLS_REPLAY, 'utf8'));
    for (const row of fixture.results.filter(x => x.httpStatus === 200 && x.data)) {
        test('saved gateway response replay, no live call: ' + row.endpoint, async t => {
            mockFetch(t, Response.json(row.data));
            const operation = row.endpoint.includes('extract') ? 'extract' : 'meta';
            assert.deepEqual(await pageTools(operation, 'https://example.com/', key), row.data);
        });
    }
}
