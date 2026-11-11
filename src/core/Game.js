import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { InputManager } from './InputManager.js';
import { GameState } from './GameState.js';
import { Settings } from './Settings.js';
import { PlayerController } from '../player/PlayerController.js';
import { Flashlight } from '../player/Flashlight.js';
import { Station } from '../world/Station.js';
import { InteractionManager } from '../interaction/InteractionManager.js';
import { AudioManager } from '../systems/AudioManager.js';
import { EvaClient } from '../systems/EvaClient.js';
import { UI } from '../ui/UI.js';
import { Menus } from '../ui/Menus.js';
import { ITEMS, EVIDENCE, OBJECTIVES, LINES, CATEGORIES, PHASE1_REQUIRED } from '../story/content.js';

const QUALITY = {
  low: { dpr: 1, bloom: false, points: 4, spots: 1, shadows: false },
  medium: { dpr: 1.25, bloom: true, points: 5, spots: 2, shadows: false },
  high: { dpr: 1.5, bloom: true, points: 6, spots: 3, shadows: true },
};

// Flags EVA's backend may see (story progress only; no hidden canon)
const EVA_FLAGS = new Set([
  'airlock_cycled', 'cargo_seen', 'security_granted', 'footage_seen', 'release_authorised', 'lockdown_released',
  'zone_cargo', 'zone_security', 'zone_hub', 'zone_mess', 'intercom_used', 'recording_played', 'phase1_done',
]);

export class Game {
  constructor() {
    this.settings = new Settings();
    this.state = new GameState();
    this.mode = 'menu'; // menu | playing | paused | ui | resuming
    this.uiKind = null;
    this.terminalId = null;
    this.airlock = { chamber: 68.2, cycling: false };
    this.useBloom = true;
    this.room = null;
    this.quality = null;
    this.recording = false;

    this._initRenderer();
    this._initWorld();
    this._initUI();
    this._initInteractions();
    this._initEva();
    this.applySettings();
    this.settings.onChange((key) => this.applySettings(key));
    this.applyFresh();
    this.player.spawn(this.station.spawnPoint, this.station.spawnYaw);

    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.loop = this.loop.bind(this);
    this.renderer.compile(this.scene, this.camera);
    this.ui.ready();
    this.ui.showScreen('menu');
    requestAnimationFrame(this.loop);
  }

  // ---------- setup ----------
  _initRenderer() {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.setSize(window.innerWidth, window.innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.9;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.FogExp2(0x0a0c0c, 0.018);

    // Approximate reflections: a pre-filtered generic room environment at low intensity.
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.09;

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 1200);
    this.scene.add(this.camera);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.32, 0.4, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _initWorld() {
    this.station = new Station(this.scene, {
      getPressure: () => ({
        chamber: this.airlock.chamber,
        station: 101.3,
        status: this.state.has('airlock_cycled') ? 'done' : this.airlock.cycling ? 'cycling' : 'unequal',
      }),
      getCargo: () => ({ granted: this.state.has('security_granted') }),
      getSecurity: () => ({ authorised: this.state.has('release_authorised'), released: this.state.has('lockdown_released') }),
      getDirectory: () => this.directoryRows(),
    });
    this.input = new InputManager(this.renderer.domElement);
    this.player = new PlayerController(this.camera, this.input, this.station.colliders);
    this.flashlight = new Flashlight(this.camera);
    this.audio = new AudioManager();
    this.player.onStep = () => this.audio.step(this.station.floorAt(this.player.position.x, this.player.position.z));
    this.interact = new InteractionManager(this.camera);
    this.interact.setBlockers(this.station.blockers);

    // Positional sounds; faulty lights buzz in step with their flicker
    for (const em of this.station.emitters) {
      const e = this.audio.addEmitter(em.pos, em.type);
      if (em.lightIndex != null) {
        const v = this.station.b.lights.virtual[em.lightIndex];
        if (v) v.onFlicker = (k) => this.audio.setEmitterLevel(e, k < 0.5 ? 2.2 : 0.5);
      }
    }
  }

  _initUI() {
    const ui = (this.ui = new UI());
    this.menus = new Menus(this.settings);
    ui.onTerminalAction = (id) => this.terminalAction(id);
    ui.onClose = () => this.closeUI();
    ui.onLine = (line) => (line.noVoice ? null : this.audio.speak(line));

    const $ = (id) => document.getElementById(id);
    $('btn-new').addEventListener('click', () => {
      if (GameState.hasSave()) this.menus.confirm('Start a new game? Your current save will be replaced.', () => this.newGame());
      else this.newGame();
    });
    $('btn-continue').addEventListener('click', () => this.continueGame());
    $('btn-settings').addEventListener('click', () => this.menus.openSettings());
    $('btn-credits').addEventListener('click', () => this.menus.openCredits());
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-psettings').addEventListener('click', () => this.menus.openSettings());
    $('btn-mainmenu').addEventListener('click', () => this.toMenu());
    $('btn-restart').addEventListener('click', () => {
      this.menus.confirm('Restart from the beginning? Your current save will be replaced.', () => this.newGame());
    });
    $('click-resume').addEventListener('click', () => this.input.lock().catch(() => {}));

    ui.setContinueEnabled(GameState.hasSave());
    this.input.onLockChange = (locked) => this._onLock(locked);
    this.evaEl = $('eva-status');
    this.evaChat = $('eva-chat');
    this.evaLog = $('eva-log');
    this.evaInput = $('eva-input');
    $('eva-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.evaInput.value.trim();
      if (!text) return;
      this.evaInput.value = '';
      this.eva.send(text, 'text');
    });
    $('eva-close').addEventListener('click', () => this.closeUI());
  }

  _initInteractions() {
    const S = this.station, H = S.hooks, I = this.interact;
    for (const d of S.doors.values()) {
      I.add(d.hit, { enabled: () => d.state !== 'open', prompt: () => d.prompt(), onInteract: () => this.useDoor(d) });
    }
    I.add(H.cycle, {
      prompt: () => this.state.has('airlock_cycled') ? { text: 'Pressure equalised', kind: 'dim' }
        : this.airlock.cycling ? { text: 'Cycling…', kind: 'dim' } : { text: 'E — Cycle airlock pressure', kind: 'ok' },
      onInteract: () => this.cycleAirlock(),
    });
    I.add(H.locker, { prompt: () => ({ text: 'E — Inspect suit lockers', kind: 'ok' }), onInteract: () => this.showDocument('suit_locker', 'lockers') });
    I.add(H.cargoTerminal, { prompt: () => ({ text: 'E — Use cargo terminal', kind: 'ok' }), onInteract: () => this.openTerminal('cargo') });
    I.add(H.securityTerminal, { prompt: () => ({ text: 'E — Use security console', kind: 'ok' }), onInteract: () => this.openTerminal('security') });
    I.add(H.lever, { prompt: () => this.leverPrompt(), onInteract: () => this.pullLever() });
    I.add(H.directory, { prompt: () => ({ text: 'E — Station directory', kind: 'ok' }), onInteract: () => this.openTerminal('directory') });
    I.add(H.intercom, { prompt: () => ({ text: 'E — Use intercom', kind: 'ok' }), onInteract: () => this.useIntercom() });
    I.add(H.datapad, { prompt: () => ({ text: 'E — Read datapad', kind: 'ok' }), onInteract: () => this.showDocument('jonah_note') });
    I.add(H.roster, { prompt: () => ({ text: 'E — Read duty roster', kind: 'ok' }), onInteract: () => this.showDocument('duty_roster', 'roster') });
    I.add(H.photo, { prompt: () => ({ text: 'E — Look at photograph', kind: 'ok' }), onInteract: () => this.showDocument('crew_photo', 'photo') });
    I.add(H.galley, { prompt: () => ({ text: 'E — Check galley dispenser', kind: 'ok' }), onInteract: () => this.openTerminal('galley') });
    I.add(H.recorder, {
      prompt: () => this.recording ? { text: 'Playing…', kind: 'dim' }
        : { text: this.state.has('recording_played') ? 'E — Replay personal recorder' : 'E — Play personal recorder', kind: 'ok' },
      onInteract: () => this.playRecording(),
    });
  }

  _initEva() {
    this.eva = new EvaClient({
      audio: this.audio,
      setState: (s) => this.setEvaState(s),
      getContext: () => this.evaContext(),
      onReply: (text, action) => this.onEvaReply(text, action),
      onPlayerLine: (text) => {
        this.evaAppend('mara', text);
        this.ui.say([{ speaker: 'MARA', text, noVoice: true, dur: 2 }]);
      },
      onNotice: (msg) => { this.ui.toast(msg, 4); this.evaAppend('system', msg); },
    });
    const toggle = document.getElementById('eva-voice-toggle');
    const note = document.getElementById('eva-service-note');
    this.eva.checkStatus().then((st) => {
      note.textContent = st.ai
        ? `EVA conversation is live (${st.model}${st.tts === 'elevenlabs' ? ', ElevenLabs voice' : ', browser voice'}). Press T to type${this.eva.speechSupported ? ' or hold V to talk' : ''}.`
        : `Live conversation unavailable: ${st.reason} Scripted EVA dialogue still works.`;
      toggle.disabled = !st.ai || !this.eva.speechSupported;
      if (st.ai && this.settings.get('evaVoice') && this.eva.speechSupported) this.eva.voiceEnabled = true;
      toggle.checked = this.eva.voiceEnabled;
    });
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const res = await this.eva.enableVoice();
        if (!res.ok) { toggle.checked = false; note.textContent = res.reason; this.settings.set('evaVoice', false); return; }
        this.settings.set('evaVoice', true);
      } else {
        this.eva.disableVoice();
        this.settings.set('evaVoice', false);
      }
    });
  }

  // ---------- settings ----------
  applySettings(key) {
    const s = this.settings.values;
    this.player.sensitivity = 0.0022 * s.sensitivity;
    this.player.invertY = !!s.invertY;
    this.player.bobScale = s.headBob ? 1 : 0;
    this.audio.applySettings(s);
    if (!key || key === 'quality') {
      const q = QUALITY[s.quality] || QUALITY.medium;
      const pr = Math.min(window.devicePixelRatio || 1, q.dpr);
      this.renderer.setPixelRatio(pr);
      this.composer.setPixelRatio(pr);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.useBloom = q.bloom;
      if (this.quality !== s.quality) {
        this.station.b.lights.setSize(q.points, q.spots);
        this.flashlight.setShadows(q.shadows);
        this.quality = s.quality;
      }
    }
  }

  setEvaState(state) {
    const ai = this.eva && this.eva.status.ai;
    const labels = {
      unavailable: 'EVA LINK · SCRIPTED ONLY',
      connecting: 'EVA LINK · CONNECTING',
      idle: this.eva && this.eva.voiceEnabled ? 'EVA · HOLD V / PRESS T' : 'EVA · PRESS T',
      listening: 'EVA · LISTENING',
      thinking: 'EVA · THINKING',
      speaking: 'EVA · SPEAKING',
      error: 'EVA · LINK ERROR',
    };
    const st = state === 'idle' && !ai ? 'unavailable' : state;
    this.evaEl.className = `eva-${st}`;
    this.evaEl.querySelector('.txt').textContent = labels[st] || labels.unavailable;
  }

  // ---------- EVA conversation ----------
  evaContext() {
    const doorStates = {};
    for (const [id, d] of this.station.doors) doorStates[id] = d.state;
    const p = this.player.position;
    const near = [...this.station.doors.values()]
      .filter((d) => Math.hypot(d.x - p.x, d.z - p.z) < 6)
      .map((d) => d.id);
    return {
      room: this.room || this.station.roomAt(p.x, p.z),
      objective: this.state.objective,
      chapter: this.state.chapter,
      flags: [...this.state.flags].filter((f) => EVA_FLAGS.has(f)),
      evidence: [...this.state.evidence],
      doors: doorStates,
      nearDoors: near,
    };
  }

  // Validate any action EVA proposes against live game state before applying it.
  onEvaReply(text, action) {
    if (text) {
      this.evaAppend('eva', text);
      this.ui.say([{ speaker: 'EVA', text, noVoice: true }]);
    }
    if (!action || action.type === 'none') return;
    if (action.type === 'open_door') {
      const d = this.station.doors.get(action.door);
      const p = this.player.position;
      if (d && d.state === 'ready' && Math.hypot(d.x - p.x, d.z - p.z) < 6) {
        d.open();
        this.audio.door();
        this.ui.toast(`EVA opened the door: ${d.id.replace(/_/g, ' ')}`, 3);
        this.save();
      }
    } else if (action.type === 'show_objective') {
      this.ui.setObjective(OBJECTIVES[this.state.objective]);
    }
  }

  evaAppend(who, text) {
    const div = document.createElement('p');
    div.className = `eva-msg from-${who}`;
    if (who !== 'system') {
      const w = document.createElement('span');
      w.className = 'who';
      w.textContent = who === 'eva' ? 'EVA' : 'MARA';
      div.appendChild(w);
    }
    div.appendChild(document.createTextNode(text));
    this.evaLog.appendChild(div);
    while (this.evaLog.children.length > 40) this.evaLog.removeChild(this.evaLog.firstChild);
    this.evaLog.scrollTop = this.evaLog.scrollHeight;
  }

  openEvaChat() {
    this._openUI('eva');
    if (!this.evaLog.children.length) {
      this.evaAppend('system', this.eva.status.ai
        ? 'Station link open. Ask EVA where you are, what to do next, or about the station.'
        : `Live conversation unavailable: ${this.eva.status.reason}`);
    }
    this.evaChat.classList.remove('hidden');
    setTimeout(() => this.evaInput.focus(), 30);
  }

  // ---------- flow ----------
  newGame() {
    this.audio.init();
    this.menus.closeAll();
    this.state.reset();
    this.applyFresh();
    this.player.spawn(this.station.spawnPoint, this.station.spawnYaw);
    this.room = null;
    this._begin();
    this.say('intro');
    this.save();
  }

  continueGame() {
    this.audio.init();
    this.menus.closeAll();
    if (!this.state.load()) { this.newGame(); return; }
    this.applyFresh();
    this.applyLoaded();
    const p = this.state.player;
    this.player.spawn(p ? { x: p.x, z: p.z } : this.station.spawnPoint, p ? p.yaw : this.station.spawnYaw);
    this.room = null;
    this._begin();
  }

  _begin() {
    this.ui.showScreen(null);
    this.ui.showHUD(true);
    this.audio.setPaused(false);
    this.mode = 'resuming';
    this.lockPointer();
  }

  resume() {
    this.ui.showScreen(null);
    this.audio.setPaused(false);
    this.mode = 'resuming';
    this.lockPointer();
  }

  toMenu() {
    this.mode = 'menu';
    this.menus.closeAll();
    this.input.unlock();
    this.eva.stopListening(true);
    this.ui.showClickResume(false);
    this.ui.showScreen('menu');
    this.ui.showHUD(false);
    this.ui.setPrompt(null);
    this.ui.clearSubtitles();
    this.audio.stopSpeech();
    this.audio.setPaused(true);
    this.ui.setContinueEnabled(GameState.hasSave());
  }

  lockPointer() {
    this.ui.showClickResume(false);
    this.input.lock().catch(() => { if (this.mode === 'resuming') this.ui.showClickResume(true); });
    setTimeout(() => { if (this.mode === 'resuming' && !this.input.locked) this.ui.showClickResume(true); }, 450);
  }

  _onLock(locked) {
    if (locked) {
      this.mode = 'playing';
      this.ui.showScreen(null);
      this.ui.showHUD(true);
      this.ui.showClickResume(false);
      this.audio.setPaused(false);
    } else if (this.mode === 'playing') {
      this.mode = 'paused';
      this.eva.stopListening(true);
      this.ui.setPrompt(null);
      this.ui.showScreen('paused');
      this.audio.setPaused(true);
    }
  }

  applyFresh() {
    this.station.reset();
    this.airlock = { chamber: 68.2, cycling: false };
    this.recording = false;
    this._run = (this._run || 0) + 1;
    this._echoPending = false;
    this._pendingComplete = false;
    this.ui.onQueueEnd = null;
    this.ui.clearSubtitles();
    this.audio.stopSpeech();
    this._applyFlagVisuals();
    this.ui.setObjective(OBJECTIVES[this.state.objective] || '');
  }

  applyLoaded() {
    for (const [id, st] of Object.entries(this.state.doors)) {
      const d = this.station.doors.get(id);
      if (!d) continue;
      if (st === 'open') d.open(true); else d.setState(st);
    }
    if (this.state.has('airlock_cycled')) this.airlock.chamber = 101.3;
    this._applyFlagVisuals();
    this.ui.setObjective(OBJECTIVES[this.state.objective] || '');
  }

  _applyFlagVisuals() {
    const s = this.state;
    this.station.setAirlockSafe(s.has('airlock_cycled'));
    this.station.setLever(s.has('lockdown_released') ? 'pulled' : s.has('release_authorised') ? 'ready' : 'locked');
    this.station.setSecurityAlarm(!s.has('lockdown_released'));
    this.station.setRecorder(s.has('recording_played') ? 'done' : 'idle');
  }

  save() {
    this.state.doors = {};
    for (const [id, d] of this.station.doors) this.state.doors[id] = d.state;
    if (this.state.save(this.player.serialize())) {
      this.ui.flashSaved();
      this.ui.setContinueEnabled(true);
    }
  }

  say(key) { if (LINES[key]) this.ui.say(LINES[key]); }

  setObjective(id) {
    if (this.state.objective === id) return;
    this.state.objective = id;
    this.ui.setObjective(OBJECTIVES[id]);
  }

  addEvidence(id) {
    if (!this.state.addEvidence(id)) return false;
    this.audio.evidence();
    this.ui.toast(`Evidence added: ${EVIDENCE[id].title} — press J to review`, 4);
    this._checkMessProgress();
    this.save();
    return true;
  }

  _checkMessProgress() {
    const s = this.state;
    if (s.has('phase1_done')) return;
    const found = PHASE1_REQUIRED.filter((id) => s.evidence.includes(id)).length;
    if (found === PHASE1_REQUIRED.length) {
      // wait for any current dialogue so lines don't overlap
      this._pendingComplete = true;
    } else if (found > 0 && s.objective === 'mess') {
      this.setObjective('mess_more');
    }
  }

  _completePhase1() {
    this._pendingComplete = false;
    if (!this.state.set('phase1_done')) return;
    this.audio.complete();
    this.setObjective('phase1_done');
    this.say('phase1_done');
    this.ui.toast('Phase One complete. Progress saved.', 5);
    this.save();
  }

  // ---------- interactions ----------
  useDoor(d) {
    if (d.state === 'ready') {
      d.open();
      this.audio.door();
      this.save();
    } else {
      this.audio.deny();
      this.ui.toast(d.lockedMsg, 3);
    }
  }

  cycleAirlock() {
    if (this.state.has('airlock_cycled') || this.airlock.cycling) return;
    this.airlock.cycling = true;
    this.audio.relay();
    this.audio.hiss(4.8);
    this.ui.toast('Equalising pressure…', 3);
  }

  _updateAirlock(dt) {
    const a = this.airlock;
    a.chamber = Math.min(101.3, a.chamber + dt * 8.5);
    if (a.chamber >= 101.3) {
      a.cycling = false;
      this.state.set('airlock_cycled');
      this.station.setAirlockSafe(true);
      this.station.doors.get('airlock').open();
      this.audio.door();
      this.say('airlock_done');
      this.setObjective('cargo');
      this.save();
    }
  }

  showDocument(evId, lineKey) {
    const isNew = this.addEvidence(evId);
    const e = EVIDENCE[evId];
    this._openUI('doc');
    this.ui.openPanel(e.title, `<p class="dim">${e.location} · ${e.category}</p><p class="doc"></p>`);
    this.ui.el.panelBody.querySelector('.doc').textContent = e.text;
    if (isNew && lineKey) this.say(lineKey);
  }

  leverPrompt() {
    if (this.state.has('lockdown_released')) return { text: 'Emergency release engaged', kind: 'dim' };
    if (this.state.has('release_authorised')) return { text: 'E — Pull emergency release', kind: 'ok' };
    return { text: 'Emergency release — locked by the security console', kind: 'warn' };
  }

  pullLever() {
    const s = this.state;
    if (s.has('lockdown_released')) return;
    if (!s.has('release_authorised')) { this.audio.deny(); this.ui.toast('The release is locked. Authorise it at the security console.'); return; }
    s.set('lockdown_released');
    this.station.setLever('pulled');
    this.station.setSecurityAlarm(false);
    this.audio.clunk();
    this.station.doors.get('sec_hub').open();
    this.audio.door();
    this.say('release');
    this.setObjective('hub');
    this.save();
  }

  useIntercom() {
    this.audio.staticBurst();
    if (this.state.set('intercom_used')) { this.say('intercom'); this.save(); }
    else this.ui.toast('Static. Nobody answers.', 2.5);
  }

  playRecording() {
    if (this.recording) return;
    this.recording = true;
    this.audio.tapeClick();
    this.station.setRecorder('playing');
    const first = !this.state.has('recording_played');
    this.ui.clearSubtitles();
    this.audio.stopSpeech();
    this.ui.say(LINES.recording);
    this.ui.onQueueEnd = () => {
      this.ui.onQueueEnd = null;
      this.audio.tapeClick();
      this.recording = false;
      this.station.setRecorder('done');
      if (!first) return;
      this.state.set('recording_played');
      this._echoPending = true;
      this.addEvidence('priya_recording');
      const run = this._run;
      setTimeout(() => {
        if (run !== this._run) return; // a new game / load happened meanwhile
        this._echoPending = false;
        this.audio.staticBurst();
        this.ui.say(LINES.recording_echo);
      }, 1600);
    };
  }

  // ---------- terminals & panels ----------
  _openUI(kind) {
    this.uiKind = kind;
    this.mode = 'ui';
    this.eva.stopListening(true);
    this.ui.setPrompt(null);
    this.input.unlock();
  }

  closeUI() {
    if (this.mode !== 'ui') return;
    this.ui.closeTerminal();
    this.ui.closePanel();
    this.evaChat.classList.add('hidden');
    this.evaInput.blur();
    this.uiKind = null;
    this.terminalId = null;
    this.mode = 'resuming';
    this.lockPointer();
  }

  openTerminal(id) {
    this.audio.beep();
    this.terminalId = id;
    this._openUI('terminal');
    this.ui.openTerminal(this.terminalDef(id));
    if (id === 'cargo' && this.state.set('cargo_seen')) {
      this.addEvidence('docking_log');
      this.say('cargo_seen');
    }
    if (id === 'galley' && this.addEvidence('galley_log')) this.say('galley');
  }

  terminalDef(id) {
    const s = this.state;
    if (id === 'cargo') {
      const granted = s.has('security_granted');
      return {
        title: 'CARGO CONTROL · DOCK B',
        body: `
          <div class="t-sec">DOCKING REGISTER</div>
          <table class="t-table">
            <tr><th>DATE</th><th>TIME</th><th>CREDENTIAL</th><th>VESSEL</th><th>STATUS</th></tr>
            <tr><td>2189-03-14</td><td>04:12</td><td>VOSS, M.</td><td class="warn">— NONE —</td><td>CLEARED</td></tr>
            <tr class="hl"><td>2189-03-22</td><td>09:41</td><td>VOSS, M.</td><td>ARV-112</td><td>CLEARED</td></tr>
          </table>
          <p class="warn">DUPLICATE CREDENTIAL DETECTED. RECORD RETAINED ON EVA INSTRUCTION.</p>
          <div class="t-sec">ACCESS CONTROL</div>
          <p>Security Office door: ${granted ? '<span class="ok">UNLOCKED</span>' : '<span class="warn">LOCKED</span> — commander-level credential may authorise access.'}</p>`,
        actions: [{ id: 'cargo_grant', label: granted ? 'Access granted' : 'Authorise Security access', disabled: granted }],
      };
    }
    if (id === 'security') {
      const watched = s.has('footage_seen'), auth = s.has('release_authorised'), rel = s.has('lockdown_released');
      return {
        title: 'SECURITY CONSOLE · S-01',
        body: `
          <div class="t-sec">CAMERA ARCHIVE</div>
          <p>1 flagged recording — CAM 02 · CARGO BAY · 2189-03-14 04:15</p>
          ${watched ? `<p class="t-log">${EVIDENCE.security_footage.text}</p>` : ''}
          <div class="t-sec">CREW CORRIDOR LOCKDOWN</div>
          <p>Status: ${rel ? '<span class="ok">LIFTED</span>' : '<span class="bad">ACTIVE</span>'} · Release lever: ${auth ? '<span class="ok">AUTHORISED</span>' : '<span class="warn">LOCKED</span>'}</p>
          <p class="dim">Lockdown initiated 2189-03-14 04:31 by credential VOSS, M.</p>`,
        actions: [
          { id: 'play_footage', label: watched ? 'Replay CAM 02' : 'Play CAM 02' },
          { id: 'authorise', label: auth ? 'Release authorised' : 'Authorise emergency release', disabled: auth },
        ],
      };
    }
    if (id === 'galley') {
      return {
        title: 'GALLEY · DISPENSER 2',
        body: `
          <div class="t-sec">ORDER QUEUE</div>
          <table class="t-table">
            <tr><th>TIME</th><th>CREW</th><th>ITEM</th><th>STATUS</th></tr>
            <tr><td>03-13 19:31</td><td>KELLER, T.</td><td>RATION B</td><td class="ok">COLLECTED</td></tr>
            <tr><td>03-13 19:36</td><td>REYES, J.</td><td>RATION A</td><td class="ok">COLLECTED</td></tr>
            <tr class="hl"><td>03-13 19:42</td><td>ANAND, P.</td><td>TEA · RATION C</td><td class="warn">NOT COLLECTED</td></tr>
          </table>
          <p class="bad">E-17 SERVICE HOLD · raised 19:43 · not cleared</p>`,
        actions: [],
      };
    }
    const rows = this.directoryRows().map(([n, st, k]) => `<tr><td>${n}</td><td class="${k === 'ok' ? 'ok' : k === 'warn' ? 'warn' : 'bad'}">${st}</td></tr>`).join('');
    return {
      title: 'ECHO-9 · STATION DIRECTORY',
      body: `
        <table class="t-table"><tr><th>SECTION</th><th>STATUS</th></tr>${rows}</table>
        <div class="t-sec">PERSONNEL ABOARD</div>
        <p>Crew: 6 · Location data: <span class="warn">UNAVAILABLE</span></p>
        <p>Visitors: VOSS, M. · <span class="warn">VOSS, M.</span></p>`,
      actions: [],
    };
  }

  terminalAction(id) {
    const s = this.state;
    this.audio.key();
    if (id === 'cargo_grant' && s.set('security_granted')) {
      this.station.doors.get('cargo_sec').setState('ready');
      this.audio.relay();
      this.ui.toast('Security door unlocked.');
      this.setObjective('security');
      this.say('cargo_grant');
      this.save();
    } else if (id === 'play_footage') {
      this.audio.staticBurst();
      if (s.set('footage_seen')) { this.addEvidence('security_footage'); this.say('footage'); }
    } else if (id === 'authorise' && s.set('release_authorised')) {
      this.station.setLever('ready');
      this.audio.relay();
      this.setObjective('lever');
      this.say('authorise');
      this.save();
    }
    if (this.terminalId) this.ui.openTerminal(this.terminalDef(this.terminalId));
  }

  directoryRows() {
    return [
      ['DOCKING', 'OPEN', 'ok'],
      ['SECURITY', this.state.has('security_granted') ? 'OPEN' : 'LOCKED', this.state.has('security_granted') ? 'ok' : 'warn'],
      ['CREW QUARTERS', 'OPEN', 'ok'],
      ['BUNKROOM', 'DOOR FAULT', 'warn'],
      ['ENGINEERING', 'CREDENTIAL REQ.', 'warn'],
      ['RESEARCH', 'NO POWER', 'bad'],
      ['SIGNAL CORE', 'SEALED', 'bad'],
    ];
  }

  openInventory() {
    this._openUI('inventory');
    const html = this.state.inventory.map((id) =>
      `<div class="inv-item"><div class="inv-name">${ITEMS[id].name}</div><div class="inv-desc">${ITEMS[id].desc}</div></div>`).join('')
      || '<p class="dim">Empty.</p>';
    this.ui.openPanel('INVENTORY', html);
  }

  openLog() {
    this._openUI('log');
    const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<p class="dim">${this.state.evidence.length} evidence collected</p>` +
      CATEGORIES.map((cat) => {
        const ents = this.state.evidence.filter((id) => EVIDENCE[id] && EVIDENCE[id].category === cat);
        const body = ents.length
          ? ents.map((id) => { const e = EVIDENCE[id]; return `<details class="log-entry"><summary>${esc(e.title)}<span class="dim"> · ${esc(e.location)}</span></summary><p>${esc(e.text)}</p></details>`; }).join('')
          : '<p class="dim">No entries.</p>';
        return `<div class="log-cat"><div class="log-cat-title">${cat.toUpperCase()}</div>${body}</div>`;
      }).join('');
    this.ui.openPanel('INVESTIGATION LOG', html);
  }

  // ---------- zones ----------
  _checkZones() {
    const p = this.player.position;
    for (const z of this.station.zones) {
      if (p.x > z.minX && p.x < z.maxX && p.z > z.minZ && p.z < z.maxZ && this.state.set('zone_' + z.id)) this.onZone(z.id);
    }
    const room = this.station.roomAt(p.x, p.z);
    if (room !== this.room) {
      this.room = room;
      this.state.room = room;
      this.audio.setRoom(room);
    }
  }

  onZone(id) {
    if (id === 'cargo') this.say('welcome');
    if (id === 'security') {
      this.say('security_enter');
      if (!this.state.has('release_authorised')) this.setObjective('authorise');
    }
    if (id === 'hub') {
      this.say('hub');
      this.setObjective('engineering');
    }
    if (id === 'mess') {
      this.state.chapter = 2;
      this.say('mess_enter');
      if (!this.state.has('phase1_done')) this.setObjective(PHASE1_REQUIRED.some((e) => this.state.evidence.includes(e)) ? 'mess_more' : 'mess');
    }
    this.save();
  }

  // ---------- loop ----------
  loop(ts) {
    requestAnimationFrame(this.loop);
    this.timer.update(ts);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    const t = this.timer.getElapsed();
    const inp = this.input;

    if (this.mode === 'playing') {
      this.player.update(dt);
      const it = this.interact.update();
      this.ui.setPrompt(it ? it.prompt() : null);
      if (it && inp.wasPressed('KeyE')) it.onInteract();
      if (this.mode === 'playing') {
        if (inp.wasPressed('KeyF')) this.ui.setFlashlight(this.flashlight.toggle());
        if (inp.wasPressed('KeyI')) this.openInventory();
        else if (inp.wasPressed('KeyJ')) this.openLog();
        else if (inp.wasPressed('KeyT')) this.openEvaChat();
        if (inp.wasPressed('KeyV')) this.eva.startListening();
        this._checkZones();
      }
      if (inp.wasReleased('KeyV')) this.eva.stopListening();
      if (this._pendingComplete && !this.ui.speaking && !this.recording && !this._echoPending) this._completePhase1();
    } else if (this.mode === 'ui') {
      inp.consumeMouse();
      const k = this.uiKind;
      if (inp.wasPressed('Escape') || (k === 'inventory' && inp.wasPressed('KeyI')) || (k === 'log' && inp.wasPressed('KeyJ'))) this.closeUI();
    }

    if (this.airlock.cycling) this._updateAirlock(dt);
    this.flashlight.update(t);
    this.station.update(dt, t, this.camera.position);
    this.audio.setListener(this.camera);
    this.ui.update(dt);
    inp.endFrame();

    if (this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
