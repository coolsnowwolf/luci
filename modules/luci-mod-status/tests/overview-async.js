const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../htdocs/luci-static/resources/view/status/index.js'), 'utf8');
const view = new Function('view', 'network', 'L', source)(
 {extend: o => o}, {flushCache: () => Promise.resolve()},
 {bind: (fn, ctx, ...args) => fn.bind(ctx, ...args)});
(async () => {
 let release, queries = 0;
 const results = [];
 const slow = {deferFirstLoad: true, load: () => { queries++; return new Promise(r => {release = r;}); }};
 const fast = {load: () => Promise.resolve('system ready')};
 const container = {hasAttribute: () => true};
 view.applyIncludeResult = (include, el, result) => results.push(result);
 await view.poll_status([slow, fast], [container, container], false);
 assert.deepEqual(results, ['system ready'], 'slow wireless must not block system rendering');
 await view.poll_status([slow, fast], [container, container], false);
 assert.equal(queries, 1, 'polls must not duplicate an outstanding wireless query');
 assert.equal(results.length, 2, 'system must continue refreshing while wireless is pending');
 release('wireless ready');
 await slow._pendingLoad;
 assert.equal(results[2], 'wireless ready');
 assert.equal(slow._pendingLoad, null);
 slow.load = () => Promise.reject(new Error('radio not ready'));
 await view.poll_status([slow, fast], [container, container], false);
 await slow._pendingLoad;
 assert.equal(slow._pendingLoad, null, 'failed wireless query must be retried on a later poll');
 console.log('Overview asynchronous rendering, in-flight coalescing and failure retry passed');
})().catch(e => {console.error(e); process.exit(1);});
