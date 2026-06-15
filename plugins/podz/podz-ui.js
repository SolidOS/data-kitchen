export class UIManager {
  constructor(elements) {
    this.elements = elements;
    this._toastTimer = null;
  }

  /**
   * Show a status toast. `actions` (optional) is an array of
   * { label, onClick } — rendered as small buttons inline with the
   * message. Buttons auto-dismiss the toast after click unless onClick
   * returns false.
   */
  setStatus(message, type = '', actions = []) {
    const cls = type === true ? 'error' : (type || '');

    let toast = document.getElementById('status-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'status-toast';
      const msgSpan = document.createElement('span');
      msgSpan.className = 'status-toast-msg';
      const actionsWrap = document.createElement('span');
      actionsWrap.className = 'status-toast-actions';
      const close = document.createElement('button');
      close.className = 'status-toast-close';
      close.textContent = '×';
      close.title = 'Dismiss';
      close.onclick = () => this._hideStatusToast();
      toast.appendChild(msgSpan);
      toast.appendChild(actionsWrap);
      toast.appendChild(close);
      document.body.appendChild(toast);
    }

    clearTimeout(this._toastTimer);

    if (!message) { this._hideStatusToast(); return; }

    toast.className = `status-toast${cls ? ' ' + cls : ''}`;
    toast.style.opacity = '1';
    toast.style.display = 'flex';
    toast.querySelector('.status-toast-msg').textContent = message;

    const wrap = toast.querySelector('.status-toast-actions');
    wrap.innerHTML = '';
    for (const { label, onClick } of actions || []) {
      const btn = document.createElement('button');
      btn.className = 'status-toast-action';
      btn.textContent = label;
      btn.onclick = async () => {
        const keep = await onClick?.();
        if (keep !== false) this._hideStatusToast();
      };
      wrap.appendChild(btn);
    }

    // Toasts with actions, or error toasts, stay until dismissed.
    if (cls !== 'error' && (!actions || actions.length === 0)) {
      this._toastTimer = setTimeout(() => this._hideStatusToast(), 3500);
    }
  }

  _hideStatusToast() {
    const toast = document.getElementById('status-toast');
    if (!toast) return;
    clearTimeout(this._toastTimer);
    toast.style.opacity = '0';
    this._toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 420);
  }

  _wirePrefs(body, prefs, onChange) {
    body.querySelectorAll('.prefs-theme-row[data-pref]').forEach(row => {
      const key = row.dataset.pref;
      const current = prefs[key] || 'default';
      row.querySelectorAll('.prefs-theme-btn').forEach(btn => {
        if (btn.dataset.value === current) btn.classList.add('active');
        btn.addEventListener('click', () => {
          row.querySelectorAll('.prefs-theme-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          prefs[key] = btn.dataset.value;
          onChange(prefs);
        });
      });
    });

    body.querySelectorAll('input[type="checkbox"][data-pref]').forEach(cb => {
      const key = cb.dataset.pref;
      cb.checked = !!prefs[key];
      cb.addEventListener('change', () => {
        prefs[key] = cb.checked;
        onChange(prefs);
      });
    });
  }
}
