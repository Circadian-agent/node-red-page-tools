'use strict';

const LIMIT = 2 * 1024 * 1024;

async function pageTools(operation, url, key, signal) {
    if (!['extract', 'meta'].includes(operation)) {
        throw new Error('Choose extract or meta. No request sent.');
    }
    let target;
    try {
        if (typeof url !== 'string' || url.length > 8192) throw new Error();
        target = new URL(url.trim());
        if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error();
    } catch {
        throw new Error('Use an absolute HTTP(S) page URL without credentials. No request sent.');
    }
    if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key)) {
        throw new Error('Set your API.market key in the node credentials. No request sent.');
    }
    const endpoint = new URL('https://prod.api.market/api/v1/circadian/page-tools/api/' + operation);
    endpoint.searchParams.set('url', target.href);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let response;
    let text = '';
    try {
        response = await fetch(endpoint, {
            method: 'GET',
            headers: { 'x-api-market-key': key.trim(), accept: 'application/json' },
            redirect: 'error',
            signal: combined
        });
        if (!response.ok) {
            await response.body?.cancel();
        } else {
            if (!response.body) throw new Error();
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let size = 0;
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    size += value.byteLength;
                    if (size > LIMIT) {
                        controller.abort();
                        await reader.cancel();
                        throw new Error();
                    }
                    text += decoder.decode(value, { stream: true });
                }
                text += decoder.decode();
            } finally {
                reader.releaseLock();
            }
        }
    } catch {
        throw new Error('Request failed: network, timeout, redirect, cancellation or response size. Billing may be unknown. No automatic retry.');
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        if (response.status === 429) throw new Error('HTTP 429: check quota, trial expiry and rate limit. No automatic retry.');
        if (response.status === 402) throw new Error('HTTP 402: check selected API.market plan and balance. No automatic payment or retry.');
        throw new Error('Gateway HTTP ' + response.status + ': check key, plan and page URL. No automatic retry.');
    }
    let data;
    try {
        data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data) || data.ok !== true ||
            !Number.isInteger(data.httpStatus) || data.httpStatus < 100 || data.httpStatus > 599 ||
            typeof data.truncated !== 'boolean' ||
            (operation === 'extract' && typeof data.markdown !== 'string') ||
            (operation === 'meta' && (!data.openGraph || typeof data.openGraph !== 'object' || Array.isArray(data.openGraph)))) {
            throw new Error();
        }
    } catch {
        throw new Error('Unexpected Page Tools response. No automatic retry.');
    }
    return data;
}

module.exports = { pageTools };
