// Drag-drop move/copy guards: the drop target is read live from the pod
// component (not the cached path), same-folder drops are refused, and a
// per-item self-drop is skipped — never copied-onto-itself then deleted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

// 'sol-components/sol-modal.js' is an importmap specifier — map it for node.
register('../helpers/browser-specifier-hook.mjs', import.meta.url);

// podz.js imports sol-modal.js, which needs a DOM at module load.
globalThis.HTMLElement ??= class {};
globalThis.customElements ??= { define() {}, get() {} };
globalThis.window ??= globalThis;
globalThis.document ??= {
  createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }),
  getElementById: () => null,
  body: { appendChild() {} },
  addEventListener() {},
};

const { SolidFileBrowser } = await import('../../plugins/podz/podz.js');

const POD = 'http://localhost:8010/dk-pod/';

function makeApp({ leftPath, rightPath, cachedLeft, cachedRight, mode = 'move' }) {
  const calls = { copies: [], deletes: [], statuses: [], loads: [] };
  const pod = (path, name) => ({
    currentPath: path,
    name,
    loadContainer: async (url) => { calls.loads.push([name, url]); },
  });
  const app = Object.create(SolidFileBrowser.prototype);
  Object.assign(app, {
    draggedItems: [],
    draggedSourceSide: 'left',
    currentPaths: { left: cachedLeft ?? leftPath, right: cachedRight ?? rightPath },
    elements: { leftPod: pod(leftPath, 'left'), rightPod: pod(rightPath, 'right') },
    uiManager: { setStatus: (msg, type) => { calls.statuses.push([msg, type]); } },
    podManager: {
      copyFile: async (srcUrl, targetUrl, fileName) => { calls.copies.push([srcUrl, targetUrl, fileName]); return { success: true }; },
      copyFolder: async (srcUrl, targetUrl, name) => { calls.copies.push([srcUrl, targetUrl, name]); return { success: true }; },
      deleteResource: async (url) => { calls.deletes.push(url); return { success: true }; },
    },
    _promptMoveOrCopy: async () => mode,
    _undoLedger: [],
    pendingCopy: null,
    saveState() {},
  });
  return { app, calls };
}

const fileItem = (container, name) => ({ url: container + name, name, isContainer: false });

test('same-folder drop is refused — no copy, no delete', async () => {
  const { app, calls } = makeApp({ leftPath: POD, rightPath: POD });
  app.draggedItems = [fileItem(POD, 'link-test.html'), fileItem(POD, 'link-target.html')];
  await app.handleDrop('right');
  assert.equal(calls.copies.length, 0);
  assert.equal(calls.deletes.length, 0);
  assert.match(calls.statuses.at(-1)[0], /same folder/);
});

test('target comes from the live pod path, not the stale cache', async () => {
  const target = POD + 'public/';
  const { app, calls } = makeApp({ leftPath: POD, rightPath: target, cachedRight: POD });
  app.draggedItems = [fileItem(POD, 'a.html')];
  await app.handleDrop('right');
  assert.deepEqual(calls.copies, [[POD + 'a.html', target, 'a.html']]);
  assert.deepEqual(calls.deletes, [POD + 'a.html']);
});

test('per-item self-drop is skipped, others proceed', async () => {
  const target = POD + 'public/';
  const { app, calls } = makeApp({ leftPath: POD, rightPath: target });
  app.draggedItems = [fileItem(target, 'same.html'), fileItem(POD, 'other.html')];
  await app.handleDrop('right');
  assert.deepEqual(calls.copies, [[POD + 'other.html', target, 'other.html']]);
  assert.deepEqual(calls.deletes, [POD + 'other.html']);
  assert.match(calls.statuses.at(-1)[0], /already at destination.*same\.html/);
});

test('copy mode: same-folder drop still refused', async () => {
  const { app, calls } = makeApp({ leftPath: POD, rightPath: POD, mode: 'copy' });
  app.draggedItems = [fileItem(POD, 'x.ttl')];
  await app.handleDrop('right');
  assert.equal(calls.copies.length, 0);
  assert.equal(calls.deletes.length, 0);
});
