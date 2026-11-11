const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      loading: $('loading'), menu: $('menu'), paused: $('paused'), hud: $('hud'), prompt: $('prompt'), objective: $('objective'),
      flash: $('flash-status'), toast: $('toast'), saved: $('saved'), subtitle: $('subtitle'),
      terminal: $('terminal'), termTitle: $('term-title'), termBody: $('term-body'), termActions: $('term-actions'),
      panel: $('panel'), panelTitle: $('panel-title'), panelBody: $('panel-body'),
      clickResume: $('click-resume'), btnContinue: $('btn-continue'),
    };
    this.queue = [];
    this.current = null;
    this.subTime = 0;
    this.toastTime = 0;
    this.savedTime = 0;
    this._lastPrompt = null;
    this.onTerminalAction = null;
    this.onClose = null;
    this.onLine = null;      // called when a subtitle line starts
    this.onQueueEnd = null;  // called when the queue empties

    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.onClose && this.onClose()));
    this.el.termActions.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (btn && !btn.disabled && this.onTerminalAction) this.onTerminalAction(btn.dataset.action);
    });
  }

  ready() { this.el.loading.classList.add('hidden'); }

  showScreen(name) {
    this.el.menu.classList.toggle('hidden', name !== 'menu');
    this.el.paused.classList.toggle('hidden', name !== 'paused');
  }
  showHUD(on) { this.el.hud.classList.toggle('hidden', !on); }
  showClickResume(on) { this.el.clickResume.classList.toggle('hidden', !on); }
  setContinueEnabled(on) { this.el.btnContinue.disabled = !on; }

  setPrompt(p) {
    const key = p ? `${p.kind}|${p.text}` : '';
    if (key === this._lastPrompt) return;
    this._lastPrompt = key;
    const el = this.el.prompt;
    if (!p) { el.className = 'hidden'; return; }
    el.textContent = p.text;
    el.className = `kind-${p.kind || 'ok'}`;
  }

  setObjective(text) {
    const el = this.el.objective;
    if (!text) { el.innerHTML = ''; return; }
    el.innerHTML = '<span class="obj-label">OBJECTIVE</span>';
    el.appendChild(document.createTextNode(text));
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  setFlashlight(on) { this.el.flash.textContent = `FLASHLIGHT · ${on ? 'ON' : 'OFF'}`; }

  toast(text, sec = 3) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    this.toastTime = sec;
  }

  flashSaved() {
    this.el.saved.classList.remove('hidden');
    this.savedTime = 1.6;
  }

  // ---- subtitles ----
  // line: { speaker, text, dur? }
  say(lines) {
    for (const l of lines) this.queue.push(l);
    if (!this.current) this._next();
  }

  get speaking() { return !!this.current; }

  clearSubtitles() {
    this.queue = [];
    this.current = null;
    this.el.subtitle.className = 'hidden';
  }

  _next() {
    this.current = this.queue.shift() || null;
    const el = this.el.subtitle;
    if (!this.current) {
      el.className = 'hidden';
      if (this.onQueueEnd) this.onQueueEnd();
      return;
    }
    el.querySelector('.speaker').textContent = this.current.speaker;
    el.querySelector('.line').textContent = this.current.text;
    el.className = `sp-${this.current.speaker.toLowerCase()}`;
    this.subTime = this.current.dur || Math.max(2.2, this.current.text.split(/\s+/).length * 0.36 + 1.0);
    this.waitCap = 16;
    this.waiting = false;
    const line = this.current;
    const p = this.onLine ? this.onLine(line) : null;
    if (p && typeof p.then === 'function') {
      this.waiting = true;
      p.then(() => { if (this.current === line) { this.waiting = false; this.subTime = Math.max(this.subTime, 0.25); } });
    }
  }

  update(dt) {
    if (this.current) {
      this.subTime -= dt;
      this.waitCap -= dt;
      // advance once the line has been on screen long enough AND its voice has finished
      if (this.subTime <= 0 && (!this.waiting || this.waitCap <= 0)) this._next();
    }
    if (this.toastTime > 0) {
      this.toastTime -= dt;
      if (this.toastTime <= 0) this.el.toast.classList.add('hidden');
    }
    if (this.savedTime > 0) {
      this.savedTime -= dt;
      if (this.savedTime <= 0) this.el.saved.classList.add('hidden');
    }
  }

  // ---- terminal / panels ----
  openTerminal(def) {
    this.el.termTitle.textContent = def.title;
    this.el.termBody.innerHTML = def.body;
    this.el.termActions.innerHTML = (def.actions || [])
      .map((a) => `<button data-action="${a.id}" ${a.disabled ? 'disabled' : ''}>${a.label}</button>`).join('');
    this.el.termActions.classList.toggle('hidden', !(def.actions && def.actions.length));
    this.el.terminal.classList.remove('hidden');
  }
  closeTerminal() { this.el.terminal.classList.add('hidden'); }

  openPanel(title, html) {
    this.el.panelTitle.textContent = title;
    this.el.panelBody.innerHTML = html;
    this.el.panel.classList.remove('hidden');
  }
  closePanel() { this.el.panel.classList.add('hidden'); }
}
