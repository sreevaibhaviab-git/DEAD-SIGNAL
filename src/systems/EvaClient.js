// Live EVA conversation (browser side).
// - Hold V: browser speech recognition (only while held; never records in the background).
// - T: typed messages.
// - Replies come from the local backend (/api/eva/*), which holds all API keys.
// - Actions EVA suggests are validated again here against live game state before anything happens.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export class EvaClient {
  constructor({ audio, setState, getContext, onReply, onPlayerLine, onNotice }) {
    this.audio = audio;
    this.setState = setState;
    this.getContext = getContext;
    this.onReply = onReply;           // (text, action) -> void
    this.onPlayerLine = onPlayerLine; // (text, via) -> void
    this.onNotice = onNotice;         // (message) -> void
    this.status = { ai: false, tts: 'browser', reason: 'Checking…' };
    this.sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) + '';
    this.busy = false;
    this.rec = null;
    this.listening = false;
    this.transcript = '';
    this.voiceEnabled = false;
    this.history = [];
  }

  get canTalk() { return this.status.ai; }
  get speechSupported() { return !!SR; }

  async checkStatus() {
    this.setState('connecting');
    try {
      const r = await fetch('/api/eva/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      this.status = await r.json();
    } catch {
      this.status = { ai: false, tts: 'browser', reason: 'EVA backend not reachable. Start the game with "npm run dev" (or "npm start").' };
    }
    this.setState(this.status.ai ? 'idle' : 'unavailable');
    return this.status;
  }

  // Called when the player enables voice in Settings. Asks for the microphone once,
  // then releases it immediately; it is reopened only while V is held.
  async enableVoice() {
    if (!SR) return { ok: false, reason: 'This browser has no speech recognition. Use Chrome, or press T to type.' };
    if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'Microphone access is not available in this browser.' };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.voiceEnabled = true;
      return { ok: true };
    } catch (e) {
      this.voiceEnabled = false;
      const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      return { ok: false, reason: denied ? 'Microphone permission was denied. Allow it in the browser address bar, or press T to type.' : `Microphone unavailable: ${e.message || e.name}` };
    }
  }

  disableVoice() {
    this.voiceEnabled = false;
    this.stopListening(true);
  }

  startListening() {
    if (this.listening || this.busy) return;
    if (!this.status.ai) { this.onNotice(this.status.reason || 'EVA conversation is unavailable.'); return; }
    if (!this.voiceEnabled) { this.onNotice('Voice is off. Enable "Voice (hold V)" in Settings, or press T to type.'); return; }
    if (!SR) { this.onNotice('Speech recognition is not supported here. Press T to type.'); return; }
    this.audio.stopSpeech();
    const rec = new SR();
    rec.lang = 'en-GB';
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    this.transcript = '';
    rec.onresult = (ev) => {
      let text = '';
      for (let i = 0; i < ev.results.length; i++) text += ev.results[i][0].transcript;
      this.transcript = text.trim();
    };
    rec.onerror = (ev) => {
      const map = {
        'not-allowed': 'Microphone permission was denied. Press T to type instead.',
        'service-not-allowed': 'Speech recognition is blocked in this browser. Press T to type instead.',
        network: 'Speech recognition needs an internet connection. Press T to type instead.',
        'audio-capture': 'No microphone found.',
      };
      if (ev.error !== 'no-speech' && ev.error !== 'aborted') this.onNotice(map[ev.error] || `Speech recognition error: ${ev.error}`);
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') this.voiceEnabled = false;
    };
    rec.onend = () => {
      const wasListening = this.listening;
      this.listening = false;
      this.rec = null;
      if (this._discard) { this._discard = false; this.setState('idle'); return; }
      if (wasListening || this._stopping) {
        this._stopping = false;
        const text = this.transcript;
        if (text) this.send(text, 'voice');
        else { this.setState('idle'); this.onNotice('EVA did not hear anything.'); }
      }
    };
    try {
      rec.start();
      this.rec = rec;
      this.listening = true;
      this.setState('listening');
    } catch (e) {
      this.onNotice(`Could not start listening: ${e.message}`);
    }
  }

  stopListening(discard = false) {
    if (!this.rec) return;
    this._discard = discard;
    this._stopping = true;
    this.listening = false;
    try { this.rec.stop(); } catch { /* already stopped */ }
  }

  async send(text, via = 'text') {
    text = String(text || '').trim();
    if (!text || this.busy) return;
    if (!this.status.ai) { this.onNotice(this.status.reason || 'EVA conversation is unavailable.'); return; }
    this.busy = true;
    this.onPlayerLine(text, via);
    this.setState('thinking');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    let data;
    try {
      const r = await fetch('/api/eva/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId, message: text, context: this.getContext() }),
        signal: ctrl.signal,
      });
      data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    } catch (e) {
      clearTimeout(timer);
      this.busy = false;
      this.setState('error');
      this.onNotice(e.name === 'AbortError' ? 'EVA took too long to answer. Try again.' : `EVA link error: ${e.message}`);
      setTimeout(() => this.setState(this.status.ai ? 'idle' : 'unavailable'), 2500);
      return;
    }
    clearTimeout(timer);
    const reply = String(data.reply || '').trim();
    this.onReply(reply, data.action || { type: 'none' });
    this.setState('speaking');
    try {
      if (this.status.tts === 'elevenlabs') {
        const r = await fetch('/api/eva/tts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: this.sessionId, text: reply }),
        });
        if (r.ok) await this.audio.playVoiceBlob(await r.blob());
        else await this.audio.speak({ speaker: 'EVA', text: reply });
      } else {
        await this.audio.speak({ speaker: 'EVA', text: reply });
      }
    } catch {
      await this.audio.speak({ speaker: 'EVA', text: reply });
    }
    this.busy = false;
    this.setState('idle');
  }
}
