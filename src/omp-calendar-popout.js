// <omp-calendar-popout> — a 📅 chrome button that opens a dropdown panel
// holding a <sol-calendar>. The trigger + empty panel template live in
// assets/omp-calendar-popout.html; this only wires open/close + mounts the
// calendar. Ported from data-kitchen's dk-calendar-popout.
//
// The <sol-calendar> is mounted (hidden) on first connect so its ICS feeds
// start fetching at page load even when the user never opens the popout. The
// panel stays hidden until clicked, so any "Loading…" status is invisible
// until then — by which point the fetch is usually already done.

class OmpCalendarPopout extends HTMLElement {
  static get template() { return 'assets/omp-calendar-popout.html'; }

  async connectedCallback() {
    if (this._rendered) return;
    this._rendered = true;

    const tpl = await fetch(new URL(this.constructor.template, document.baseURI));
    this.innerHTML = await tpl.text();

    this._trigger = this.querySelector('.omp-popout-trigger');
    this._panel   = this.querySelector('.omp-popout-panel');

    this._trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggle();
    });

    this._onDocClick = (e) => { if (!this.contains(e.target)) this._close(); };
    this._onKeydown = (e) => {
      if (e.key === 'Escape' && !this._panel.hidden) { this._close(); this._trigger.focus(); }
    };
    document.addEventListener('click', this._onDocClick);
    document.addEventListener('keydown', this._onKeydown);

    this._mountCalendar();
  }

  _mountCalendar() {
    const tpl = this._panel.querySelector('template.omp-calendar-tpl');
    if (!tpl) return;
    const frag = tpl.content.cloneNode(true);
    const cal = frag.querySelector('sol-calendar');
    // Forward the host's config to the inner calendar. proxy also falls back to
    // <sol-default> inside sol-calendar, so it's optional here.
    if (cal) for (const a of ['source', 'view', 'proxy']) {
      const v = this.getAttribute(a);
      if (v != null) cal.setAttribute(a, v);
    }
    this._panel.appendChild(frag);
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
    document.removeEventListener('keydown', this._onKeydown);
  }

  _toggle() { this._panel.hidden ? this._open() : this._close(); }
  _close()  { this._panel.hidden = true;  this._trigger.setAttribute('aria-expanded', 'false'); }
  _open() {
    // The panel is position:fixed (to escape the tab bar's overflow clip), so
    // anchor it under the trigger, flush to its right edge.
    const r = this._trigger.getBoundingClientRect();
    this._panel.style.top = `${Math.round(r.bottom + 6)}px`;
    this._panel.style.right = `${Math.round(Math.max(8, window.innerWidth - r.right))}px`;
    this._panel.hidden = false;
    this._trigger.setAttribute('aria-expanded', 'true');
  }
}

customElements.define('omp-calendar-popout', OmpCalendarPopout);
