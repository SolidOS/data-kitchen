// dk-dokieli is the dokieli plugin: the same isolated, authed SolidOS host as
// dk-solidos (so reads/writes share dk's login + store via the iframe's
// installAuthFetch bridge), but pinned to a dokieli documents folder and with a
// "New dokieli document" button that drives mashlib's bundled dokieli pane.
//
// Why a subclass and not a flag: the tab-shell reads each panel's `source`
// attribute to derive its plugin id (help / settings / ☰ menu), so `source`
// can't double as a "which mode" or landing-subject signal — a distinct element
// keeps that intrinsic, with no new HTML attribute and no change to dk-solidos's
// own behaviour. Creating/opening a dokieli doc rides the shared auth; only the
// dokieli editor runtime (dokieli.js/CSS) loads from the dokie.li CDN.
import { DkSolidos } from './dk-solidos.js';

class DkDokieli extends DkSolidos {
  // Where new dokieli documents live (and the tab's initial landing). The PUT
  // in window.newDokieli auto-creates this container on first use.
  get _folder() { return `${location.origin}/dk-pod/dokieli/`; }

  _landingSubject() { return this._folder; }

  _mountExtras(iframe) {
    const main = this.querySelector('.dk-solidos-main');
    if (!main || main.querySelector('.dk-dokieli-toolbar')) return;

    const bar = document.createElement('div');
    bar.className = 'dk-dokieli-toolbar';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dk-dokieli-new';
    btn.textContent = 'New dokieli document';
    btn.addEventListener('click', async () => {
      const name = prompt('New dokieli document name:', 'note');
      if (!name) return;
      const win = iframe.contentWindow;
      if (win && typeof win.newDokieli === 'function') {
        try { await win.newDokieli(this._folder, name); }
        catch (err) { console.warn('[dk-dokieli] newDokieli failed:', err); }
      }
    });

    bar.appendChild(btn);
    main.insertBefore(bar, main.firstChild);
  }
}

customElements.define('dk-dokieli', DkDokieli);

export { DkDokieli };
