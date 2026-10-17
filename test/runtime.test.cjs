'use strict';
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const helper = require('node-red-node-test-helper');
const register = require('../page-tools');
const example = require('../examples/one-page.json');
const key = 'runtime-test-credential-not-real';
helper.init(require.resolve('node-red'));
before(() => new Promise(resolve => helper.startServer(resolve)));
afterEach(() => helper.unload());
after(() => new Promise(resolve => helper.stopServer(resolve)));
const response = { ok: true, httpStatus: 200, truncated: false, markdown: 'Runtime result' };

async function load(operation = 'extract', credentials = { n: { apiKey: key } }) {
    await helper.load(register, [
        { id: 'tab', type: 'tab' },
        { id: 'n', z: 'tab', x: 100, y: 100, type: 'circadian-page-tools', operation, wires: [['out']] },
        { id: 'out', z: 'tab', x: 200, y: 100, type: 'helper' },
        { id: 'c', z: 'tab', x: 100, y: 200, type: 'catch', scope: ['n'], wires: [['err']] },
        { id: 'err', z: 'tab', x: 200, y: 200, type: 'helper' }
    ], credentials);
}
const next = id => once(helper.getNode(id), 'input', { signal: AbortSignal.timeout(3000) });

test('real runtime passes result and correlation fields without exposing credential', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return Response.json(response); });
    await load();
    assert.equal(calls.length, 0, 'Deploy must not call the API');
    const pending = next('out');
    helper.getNode('n').receive({ payload: 'https://example.com/', topic: 'correlation-1', extra: 42 });
    const [msg] = await pending;
    assert.deepEqual(msg.payload, response);
    assert.equal(msg.topic, 'correlation-1');
    assert.equal(msg.extra, 42);
    assert.equal(JSON.stringify(msg).includes(key), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers['x-api-market-key'], key);
    assert.equal(JSON.stringify(helper._redNodes.getFlows().flows).includes(key), false, 'Credential must not be in exported flows');
});
test('real runtime metadata operation keeps source status and metadata', async t => {
    const meta = { ok: true, httpStatus: 404, truncated: true, openGraph: {}, jsonLd: [] };
    t.mock.method(globalThis, 'fetch', async () => Response.json(meta));
    await load('meta');
    const pending = next('out');
    helper.getNode('n').receive({ payload: 'https://example.com/' });
    const [msg] = await pending;
    assert.deepEqual(msg.payload, meta);
    assert.match(helper.getNode('n').status.lastCall.args[0].text, /404, truncated/);
});
test('missing credentials reach a real Catch node without network', async t => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('unexpected'); });
    await load('extract', {});
    const pending = next('err');
    helper.getNode('n').receive({ payload: 'https://example.com/' });
    const [msg] = await pending;
    assert.match(msg.error.message, /Set your API.market key/);
    assert.equal(requests, 0);
    assert.equal(helper.getNode('n').send.getCalls().filter(c => c.thisValue.id === 'n').length, 0);
});
test('gateway 429 reaches Catch without raw response, key or retry', async t => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(key, { status: 429 }); });
    await load();
    const pending = next('err');
    helper.getNode('n').receive({ payload: 'https://example.com/' });
    const [msg] = await pending;
    assert.match(msg.error.message, /HTTP 429/);
    assert.equal(JSON.stringify(msg).includes(key), false);
    assert.equal(requests, 1);
    assert.equal(helper.getNode('n').send.getCalls().filter(c => c.thisValue.id === 'n').length, 0);
});
test('overlapping messages are rejected instead of silently queued', async t => {
    let resolve;
    let requests = 0;
    t.mock.method(globalThis, 'fetch', () => { requests++; return new Promise(r => { resolve = r; }); });
    await load();
    const output = next('out');
    const error = next('err');
    helper.getNode('n').receive({ payload: 'https://example.com/', topic: 'first' });
    helper.getNode('n').receive({ payload: 'https://example.com/', topic: 'second' });
    const [msg] = await error;
    assert.match(msg.error.message, /already running/);
    assert.equal(msg.topic, 'second');
    resolve(Response.json(response));
    assert.equal((await output)[0].topic, 'first');
    assert.equal(requests, 1);
});
test('flow unload cancels an in-flight request', async t => {
    let signal;
    t.mock.method(globalThis, 'fetch', (_url, options) => {
        signal = options.signal;
        return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled'))));
    });
    await load();
    const node = helper.getNode('n');
    node.receive({ payload: 'https://example.com/' });
    await helper._redNodes.stopFlows();
    assert.equal(signal.aborted, true);
    assert.equal(node.send.callCount, 0);
});
test('bundled example loads and manual Inject runs once through the core runtime', async t => {
    let requests = 0;
    t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json(response); });
    const flow = structuredClone(example);
    flow.find(n => n.id === 'pt-result').type = 'helper';
    flow.find(n => n.id === 'pt-error').type = 'helper';
    await helper.load([register, require('@node-red/nodes/core/common/20-inject.js'), require('@node-red/nodes/core/common/90-comment.js')], flow, { 'pt-api': { apiKey: key } });
    assert.equal(requests, 0);
    const inject = example.find(n => n.type === 'inject');
    assert.equal(inject.once, false);
    assert.equal(inject.repeat, '');
    assert.equal(inject.crontab, '');
    assert.equal(JSON.stringify(example).includes(key), false);
    const pending = next('pt-result');
    helper.getNode('pt-input').receive();
    const [msg] = await pending;
    assert.deepEqual(msg.payload, response);
    assert.equal(msg.topic, 'page-tools-example');
    assert.equal(requests, 1);
});
