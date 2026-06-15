// dk-calendar-popout renders a 📅 button in the chrome that opens a
// dropdown panel containing a <sol-calendar>. The trigger + empty
// panel template lives in plugins/calendar/dk-calendar-popout.html; the inline
// gear SVG and panel scaffolding stay HTML, not JS.
//
// sol-calendar is mounted (hidden) on first connect so the ICS feeds
// start fetching at page load even when the user never expands the
// popout. The panel itself stays `hidden=true` until the user clicks,
// so any "Loading…" status from sol-calendar is invisible until then;
// by the time the popout opens the fetch is usually already complete
// and the status is empty.

class DkCalendarPopout extends HTMLElement {
  static get template() { return 'dk-pod/dk/plugins/calendar/dk-calendar-popout.html'; }
  static get manifest() { return 'dk-pod/dk/plugins/calendar/manifest.jsonld'; }

  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const tpl = await fetch(this.constructor.template);
    this.innerHTML = await tpl.text();

    this._trigger = this.querySelector('.dk-popout-trigger');
    this._panel   = this.querySelector('.dk-popout-panel');

    this._trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggle();
    });

    this._onDocClick = (e) => {
      if (!this.contains(e.target)) this._close();
    };
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && !this._panel.hidden) {
        this._close();
        this._trigger.focus();
      }
    };
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onKeydown);

    // Eager-mount the <sol-calendar> while the panel is still hidden,
    // so its ICS fetches start at page load. The status strip (which
    // sol-calendar uses for its "Loading…" message) lives inside the
    // hidden panel so it doesn't render until the user opens the
    // popout — by which point the fetch is usually done.
    this._mountCalendar();
  }

  _mountCalendar() {
    const tpl = this._panel.querySelector('template.dk-calendar-tpl');
    if (!tpl) return;
    const frag = tpl.content.cloneNode(true);
    const cal = frag.querySelector('sol-calendar');
    const src = this.getAttribute('source');
    if (cal && src) cal.setAttribute('source', src);
    this._panel.appendChild(frag);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }

  _toggle() { this._panel.hidden ? this._open() : this._close(); }
  _close()  { this._panel.hidden = true;  this._trigger.setAttribute('aria-expanded', 'false'); }
  _open() {
    // The panel is position:fixed (the actions row lives inside the
    // overflow-clipped sol-tabs bar, so an absolute panel would be cropped
    // there). Anchor it under the trigger, right-aligned, clamped into the
    // viewport.
    const r = this._trigger.getBoundingClientRect();
    this._panel.style.top = `${Math.round(r.bottom + 6)}px`;
    this._panel.style.right = `${Math.round(Math.max(8, window.innerWidth - r.right))}px`;
    this._panel.hidden = false;
    this._trigger.setAttribute('aria-expanded', 'true');
  }
}

customElements.define('dk-calendar-popout', DkCalendarPopout);
