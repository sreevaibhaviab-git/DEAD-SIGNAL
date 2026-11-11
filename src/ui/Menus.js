const $ = (id) => document.getElementById(id);

export class Menus {
  constructor(settings) {
    this.settings = settings;
    this.stack = [];
    this._yes = null;

    document.querySelectorAll('[data-setting]').forEach((el) => {
      const key = el.dataset.setting;
      const v = settings.get(key);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v;
      this._label(el);
      el.addEventListener('input', () => {
        const val = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
        settings.set(key, val);
        this._label(el);
      });
    });

    $('settings-back').addEventListener('click', () => this.close());
    $('credits-back').addEventListener('click', () => this.close());
    $('confirm-no').addEventListener('click', () => this.close());
    $('confirm-yes').addEventListener('click', () => {
      const fn = this._yes;
      this.close();
      if (fn) fn();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.stack.length) { e.preventDefault(); this.close(); }
    });
  }

  get isOpen() { return this.stack.length > 0; }

  _label(el) {
    const out = document.querySelector(`[data-out="${el.dataset.setting}"]`);
    if (!out || el.type !== 'range') return;
    out.textContent = el.dataset.setting === 'sensitivity'
      ? `${Number(el.value).toFixed(1)}×`
      : `${Math.round(el.value * 100)}%`;
  }

  _open(id) {
    $(id).classList.remove('hidden');
    this.stack.push(id);
  }

  close() {
    const id = this.stack.pop();
    if (id) $(id).classList.add('hidden');
  }

  closeAll() { while (this.stack.length) this.close(); }

  openSettings() { this._open('settings'); }
  openCredits() { this._open('credits'); }

  confirm(text, onYes) {
    $('confirm-text').textContent = text;
    this._yes = onYes;
    this._open('confirm');
  }
}
