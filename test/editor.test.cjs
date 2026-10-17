'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../page-tools.html'), 'utf8');

test('editor registers a node compatible with runtime and stores the key as a password credential', () => {
    let ui, runtime;
    vm.runInNewContext(html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1], {
        RED: { nodes: { registerType(name, options) { ui = { name, options }; } } }
    });
    require('../page-tools')({ nodes: { registerType(name, constructor, options) { runtime = { name, options }; } } });
    assert.equal(ui.name, runtime.name);
    assert.equal(ui.options.credentials.apiKey.type, 'password');
    assert.equal(runtime.options.credentials.apiKey.type, 'password');
    assert.equal('apiKey' in ui.options.defaults, false);
    assert.match(html, /type="password" id="node-input-apiKey"/);
    assert.equal(ui.options.defaults.operation.value, 'extract');
    assert.equal(ui.options.defaults.operation.validate('meta'), true);
    assert.equal(ui.options.defaults.operation.validate('../redirect'), false);
    assert.equal(ui.options.inputs, 1);
    assert.equal(ui.options.outputs, 1);
    assert.match(html, new RegExp('data-template-name="' + runtime.name + '"'));
    assert.match(html, new RegExp('data-help-name="' + runtime.name + '"'));
});
