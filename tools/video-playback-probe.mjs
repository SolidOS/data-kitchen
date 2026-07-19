// Video playback diagnostic — written for the "videos do not play on macOS"
// reports (2026-07-16). Connects to a running dk instance over CDP and:
//   A. reports the renderer's codec support matrix (canPlayType) — tells a
//      missing-ffmpeg / proprietary-codec problem apart from a render one,
//   B. plays a known-good archive.org h.264 mp4 in a synthetic muted <video>
//      and asserts currentTime advances AND videoWidth > 0 (frames decoded),
//   C. (DRIVE_MOVIES=1) drives the real Movies room: clicks a film row and
//      measures the app's own .ia-video element the same way.
// Platform-neutral: run on Linux for a baseline, on the mac-smoke runner for
// the real answer. Exit 0 = video pipeline works, 1 = something failed.
//
// Usage: node tools/video-playback-probe.mjs
//   env CDP_PORT=9222 (default)  DRIVE_MOVIES=1 (optional section C)
//   The app must be running with --remote-debugging-port=$CDP_PORT.
//   Run standalone against any live instance, or via packaged-smoke.mjs
//   SMOKE_VIDEO=1 (how the mac-smoke workflow runs it). Lives in tools/
//   because claude/ is gitignored and CI needs this file in the checkout.
//   Needs node ≥22 (global WebSocket/fetch) — locally use
//   `ELECTRON_RUN_AS_NODE=1 npx electron tools/video-playback-probe.mjs`.

const PORT = process.env.CDP_PORT || 9222;
const DRIVE = process.env.DRIVE_MOVIES === '1';
// h.264 + AAC, public item, streams via range requests (we need ~3s of it).
const TEST_MP4 = 'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4';

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find(t => t.type === 'page' && /index\.html/.test(t.url)) || targets.find(t => t.type === 'page');
if (!page) { console.error('no page target on CDP port', PORT); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id; pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
ws.onmessage = m => { const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id);
    d.error ? rej(new Error(d.error.message)) : res(d.result); } };
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function evalJS(expr) {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
let fails = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? '✔' : '✘'} ${label}${detail ? ' — ' + detail : ''}`); if (!ok) fails++; };

const ver = await send('Browser.getVersion').catch(() => null);
console.log('BROWSER:', ver ? `${ver.product} on ${ver.userAgent.match(/\((.*?)\)/)?.[1]}` : 'unknown');

// ---- A. codec support matrix -------------------------------------------
const codecs = await evalJS(`
  const v = document.createElement('video');
  const t = s => v.canPlayType(s) || '(no)';
  return {
    'mp4 h.264+aac': t('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
    'mp4 h.264 high': t('video/mp4; codecs="avc1.64001F"'),
    'mp4 mpeg4-part2': t('video/mp4; codecs="mp4v.20.240"'),
    'ogg theora': t('video/ogg; codecs="theora"'),
    'webm vp8': t('video/webm; codecs="vp8, vorbis"'),
    'webm vp9': t('video/webm; codecs="vp9"'),
    'audio mp3': t('audio/mpeg'),
    'audio aac': t('audio/mp4; codecs="mp4a.40.2"'),
  };
`);
console.log('CODECS:', JSON.stringify(codecs, null, 1));
check('h.264 mp4 decodable (proprietary codecs present)', /probably|maybe/.test(codecs['mp4 h.264+aac']), codecs['mp4 h.264+aac']);
check('mp3 decodable', /probably|maybe/.test(codecs['audio mp3']), codecs['audio mp3']);

// ---- B. synthetic playback of a known-good h.264 mp4 --------------------
// archive.org's /download/ endpoint 500s transiently — retry once before
// calling the pipeline broken.
console.log('SYNTHETIC PLAY:', TEST_MP4);
const playOnce = () => evalJS(`
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:180px;opacity:0.01;pointer-events:none;z-index:-1';
  v.src = ${JSON.stringify(TEST_MP4)};
  document.body.appendChild(v);
  const errInfo = () => v.error ? { code: v.error.code, message: v.error.message } : null;
  try {
    // wait for enough data or an error (network on CI can be slow)
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('timeout waiting for canplay (45s)')), 45000);
      v.addEventListener('canplay', () => { clearTimeout(to); res(); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(to); rej(new Error('media error')); }, { once: true });
    });
    await v.play();
    await new Promise(r => setTimeout(r, 3000));
    const t1 = v.currentTime;
    await new Promise(r => setTimeout(r, 2000));
    const t2 = v.currentTime;
    return { ok: true, t1, t2, advanced: t2 > t1, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
             readyState: v.readyState, decodedFrames: (v.getVideoPlaybackQuality?.() || {}).totalVideoFrames ?? null,
             droppedFrames: (v.getVideoPlaybackQuality?.() || {}).droppedVideoFrames ?? null, error: errInfo() };
  } catch (e) {
    return { ok: false, why: String(e && e.message || e), readyState: v.readyState,
             networkState: v.networkState, error: errInfo() };
  } finally { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
`);
let play = await playOnce();
if (!play.ok) {
  console.log('  first attempt failed, retrying in 5s…', JSON.stringify(play));
  await sleep(5000);
  play = await playOnce();
}
console.log('RESULT:', JSON.stringify(play, null, 1));
check('media loaded + play() resolved', play.ok === true, play.ok ? '' : `${play.why} mediaError=${JSON.stringify(play.error)} networkState=${play.networkState}`);
if (play.ok) {
  check('currentTime advances', play.advanced, `t1=${play.t1?.toFixed(2)} t2=${play.t2?.toFixed(2)}`);
  check('frames decoded (videoWidth > 0)', play.videoWidth > 0, `${play.videoWidth}x${play.videoHeight}`);
  check('decoder produced frames', play.decodedFrames === null || play.decodedFrames > 0, `decoded=${play.decodedFrames} dropped=${play.droppedFrames}`);
}

// ---- C. optional: drive the real Movies room ----------------------------
if (DRIVE) {
  console.log('DRIVING the Movies room…');
  const nav = await evalJS(`
    function deepQueryAll(sel, root = document) {
      const hits = [...root.querySelectorAll(sel)];
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) hits.push(...deepQueryAll(sel, el.shadowRoot));
      return hits;
    }
    // desktop tab strip lives in sol-tabs' shadow root
    const tabs = deepQueryAll('[role="tab"], .sol-tab, button');
    const movies = tabs.find(t => /movies/i.test(t.textContent || ''));
    if (!movies) return 'no-movies-tab';
    movies.click();
    return 'clicked:' + movies.textContent.trim().slice(0, 30);
  `);
  console.log('  nav:', nav);
  // lazy module (schema:url) mount + cold-cache library load — poll up to 90s for a
  // visible room, re-clicking the Movies trigger every 20s (a click that
  // landed before the menu tree finished wiring selects nothing).
  let mounted = false;
  const t0 = Date.now();
  for (let i = 0; i < 45 && !mounted; i++) {
    await sleep(2000);
    const st = await evalJS(`
      function deepQueryAll(sel, root = document) {
        const hits = [...root.querySelectorAll(sel)];
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) hits.push(...deepQueryAll(sel, el.shadowRoot));
        return hits;
      }
      const apps = deepQueryAll('.ia-player-app.media-video');
      return { visible: apps.some(a => a.offsetParent !== null), present: apps.length };
    `);
    mounted = st.visible;
    if (!mounted && i > 0 && i % 10 === 0) {
      const re = await evalJS(`
        function deepQueryAll(sel, root = document) {
          const hits = [...root.querySelectorAll(sel)];
          for (const el of root.querySelectorAll('*')) if (el.shadowRoot) hits.push(...deepQueryAll(sel, el.shadowRoot));
          return hits;
        }
        const tabs = deepQueryAll('[role="tab"], .sol-tab, button');
        const movies = tabs.find(t => /movies/i.test(t.textContent || ''));
        if (movies) movies.click();
        return movies ? 're-clicked' : 'no-trigger';
      `);
      console.log(`  …not mounted after ${Math.round((Date.now() - t0) / 1000)}s (present=${st.present}) — ${re}`);
    }
  }
  check('movies room mounted', mounted, `after ${Math.round((Date.now() - t0) / 1000)}s`);
  if (mounted) {
    // Drive the browse cascade: (All film types) → first collection → first
    // film. In movies each film (album row) plays on click — loaded paused
    // behind the film-intro overlay; we then call play() directly.
    const room = await evalJS(`
      function deepQueryAll(sel, root = document) {
        const hits = [...root.querySelectorAll(sel)];
        for (const el of root.querySelectorAll('*')) if (el.shadowRoot) hits.push(...deepQueryAll(sel, el.shadowRoot));
        return hits;
      }
      const app = deepQueryAll('.ia-player-app.media-video').find(a => a.offsetParent !== null);
      const rowsIn = col => [...app.querySelectorAll('[data-column="' + col + '"] .ia-listbox-item')]
        .filter(li => !li.classList.contains('ia-listbox-all') && li.offsetParent !== null);
      const firstArtist = rowsIn('artist')[0];
      if (firstArtist) { firstArtist.click(); await new Promise(r => setTimeout(r, 8000)); }
      const films = rowsIn('album');
      if (!films.length) return { films: 0, artistClicked: firstArtist?.textContent.trim().slice(0, 50) || null };
      films[0].click();
      // wait for the app to fetch item metadata and set the video src
      const v = app.querySelector('.ia-video');
      for (let i = 0; i < 20 && !(v && v.src); i++) await new Promise(r => setTimeout(r, 1000));
      if (!v || !v.src) return { films: films.length, clicked: films[0].textContent.trim().slice(0, 60), loaded: false };
      v.muted = true;
      try { await v.play(); } catch (e) { return { loaded: true, src: v.src.slice(0, 110), playRejected: String(e) }; }
      await new Promise(r => setTimeout(r, 5000));
      return { films: films.length, clicked: films[0].textContent.trim().slice(0, 60), loaded: true,
               src: v.src.slice(0, 110), t: v.currentTime, videoWidth: v.videoWidth, readyState: v.readyState,
               error: v.error ? { code: v.error.code, message: v.error.message } : null };
    `);
    console.log('  room:', JSON.stringify(room, null, 1));
    if (room.loaded) {
      check('film plays (currentTime > 0)', room.t > 0 && !room.error && !room.playRejected,
        `t=${room.t?.toFixed?.(2)} err=${JSON.stringify(room.error)} rejected=${room.playRejected || 'no'}`);
      check('film frames decoded', room.videoWidth > 0, `videoWidth=${room.videoWidth}`);
    } else {
      check('film loaded a src', false, JSON.stringify(room));
    }
  }
}

console.log(fails ? `FAILED: ${fails} check(s)` : 'ALL CHECKS PASSED');
ws.close();
process.exit(fails ? 1 : 0);
