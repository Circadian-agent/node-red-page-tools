'use strict';

const { pageTools } = require('./client');

module.exports = function (RED) {
    function PageToolsNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        let active;
        let closed = false;
        node.on('input', async function (msg, send, done) {
            if (closed) { done(new Error('Node is stopping. No request sent.')); return; }
            if (active) { done(new Error('Request already running. Send one page at a time. No request sent.')); return; }
            active = new AbortController();
            node.status({ fill: 'blue', shape: 'dot', text: 'requesting' });
            try {
                const data = await pageTools(config.operation, msg.payload, node.credentials.apiKey, active.signal);
                if (!closed) {
                    msg.payload = data;
                    node.status({ fill: data.httpStatus >= 400 || data.truncated ? 'yellow' : 'green', shape: 'dot', text: 'source ' + data.httpStatus + (data.truncated ? ', truncated' : '') });
                    send(msg);
                }
                done();
            } catch (error) {
                if (!closed) node.status({ fill: 'red', shape: 'ring', text: 'request failed' });
                done(error);
            } finally {
                active = undefined;
            }
        });
        node.on('close', function () {
            closed = true;
            active?.abort();
        });
    }
    RED.nodes.registerType('circadian-page-tools', PageToolsNode, { credentials: { apiKey: { type: 'password' } } });
};
