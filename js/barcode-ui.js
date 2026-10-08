// Barcode scanning for the meal form: camera (Chrome's BarcodeDetector) or a typed number.
// Only the number is sent to Open Food Facts. A food saved before with this barcode is used first, with no internet.
import { cleanBarcode, offUrl, fromOff, findByBarcode, scanMessage } from './barcode.js';

export function createBarcodeUI(ctx) {
  const { h, state, render, useFood, setScan } = ctx;
  let stream = null, timer = 0, overlay = null, returnFocus = null;

  const supported = () => 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

  function stop() {
    clearInterval(timer); timer = 0;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  }
  function close() {
    stop();
    overlay?.remove(); overlay = null;
    document.body.classList.remove('scan-open');
    returnFocus?.focus?.();
  }

  async function lookup(raw) {
    const code = cleanBarcode(raw);
    if (!code) return { kind: 'badcode' };
    const saved = findByBarcode(state.events, code);
    if (saved) return { kind: 'saved', code, food: saved };
    if (navigator.onLine === false) return { kind: 'offline', code };
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(offUrl(code), { signal: ctl.signal, headers: { Accept: 'application/json' } });
      if (res.status === 404) return { kind: 'notfound', code };
      if (!res.ok) return { kind: 'busy', code };
      const r = fromOff(await res.json());
      return r.found ? { kind: 'off', code, r } : { kind: 'notfound', code };
    } catch (err) {
      return { kind: err?.name === 'AbortError' ? 'busy' : 'offline', code };
    } finally { clearTimeout(to); }
  }

  /** Put the answer into the meal form. The values can still be edited before saving. */
  function apply(res) {
    if (res.kind === 'saved') {
      useFood(res.food);
      setScan({ barcode: res.code, scanned: { ...(res.food.nutrition ?? {}) }, message: 'Found in saved foods. Please check the numbers before saving.', tone: 'ok' });
      return;
    }
    if (res.kind === 'off') {
      const r = res.r;
      const shown = new Set(ctx.shownKeys());
      const vals = {}, carried = {};
      for (const [k, v] of Object.entries(r.nutrition)) (shown.has(k) ? vals : carried)[k] = String(v);
      const empty = !Object.keys(r.nutrition).length;
      setScan({
        barcode: res.code, scanned: { ...r.nutrition }, name: r.name, vals, carried,
        message: scanMessage(empty ? (r.basis === 'none' ? 'per100' : 'nonumbers') : 'found') + (r.servingText && !empty ? ` Numbers are for ${r.servingText}.` : ''),
        tone: empty ? 'warn' : 'ok',
      });
      return;
    }
    setScan({ barcode: res.kind === 'notfound' || res.kind === 'offline' || res.kind === 'busy' ? res.code : '', scanned: {}, message: scanMessage(res.kind), tone: 'warn', keep: true });
  }

  async function finish(raw, note) {
    const msg = overlay?.querySelector('#scan-msg');
    if (msg) msg.textContent = 'Looking it up…';
    stop();
    const res = await lookup(raw);
    if (res.kind === 'badcode' && overlay) {
      if (msg) msg.textContent = scanMessage('badcode');
      return;
    }
    close();
    apply(res);
    render();
    if (note) document.getElementById('scan-note')?.focus();
  }

  async function startCamera(video, msg) {
    if (!supported()) { msg.textContent = scanMessage('nocamera'); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (err) {
      msg.textContent = scanMessage(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'nocamera');
      return;
    }
    if (!overlay) { stop(); return; }
    video.srcObject = stream;
    try { await video.play(); } catch { /* the preview is only a help */ }
    let det;
    try { det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); } catch { msg.textContent = scanMessage('nocamera'); return; }
    msg.textContent = 'Hold the barcode inside the box.';
    let busy = false;
    timer = setInterval(async () => {
      if (busy || !stream) return;
      busy = true;
      try {
        const hits = await det.detect(video);
        const good = hits.map((x) => cleanBarcode(x.rawValue)).find(Boolean);
        if (good) finish(good, true);
      } catch { /* try again on the next tick */ } finally { busy = false; }
    }, 300);
  }

  function open() {
    returnFocus = document.activeElement;
    const msg = h('p', { id: 'scan-msg', class: 'meta', role: 'status', 'aria-live': 'polite' }, supported() ? 'Starting the camera…' : scanMessage('nocamera'));
    const video = h('video', { class: 'scan-video', playsinline: '', muted: '', 'aria-label': 'Camera view' });
    const input = h('input', { id: 'scan-type', type: 'text', inputmode: 'numeric', class: 'text', autocomplete: 'off', placeholder: 'e.g. 9310645467023', 'aria-label': 'Barcode number' });
    const go = () => finish(input.value, false);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go(); });
    overlay = h('div', { class: 'scan-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'scan-h' },
      h('div', { class: 'scan-box panel' },
        h('h2', { id: 'scan-h' }, 'Scan a barcode'),
        supported() ? h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-aim', 'aria-hidden': 'true' })) : null,
        msg,
        h('div', { class: 'num-field' },
          h('label', { for: 'scan-type' }, 'Or type the number under the barcode'),
          h('div', { class: 'custom' }, input, h('button', { class: 'btn primary', id: 'scan-go', onclick: go }, 'Look up'))),
        h('button', { class: 'btn quiet', id: 'scan-cancel', onclick: close }, 'Cancel')));
    overlay.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') close(); });
    document.body.append(overlay);
    document.body.classList.add('scan-open');
    startCamera(video, msg);
    if (!supported()) input.focus({ preventScroll: true });
  }

  /** The button and the result line inside the meal form's name panel. */
  function control(scan) {
    return h('div', { class: 'scan-row' },
      h('button', { class: 'btn', id: 'scan-open', type: 'button', onclick: open }, 'Scan a barcode'),
      scan?.message ? h('p', { id: 'scan-note', tabindex: '-1', class: 'scan-note ' + (scan.tone === 'ok' ? 'ok' : 'warn'), role: 'status' },
        h('span', { 'aria-hidden': 'true' }, scan.tone === 'ok' ? '✓ ' : '! '), scan.message) : null);
  }

  return { control, close };
}
