// Scripted, deterministic story content for Phase One.
// Canon reference (kept out of the conversational AI context unless discovered):
// see server/evaKnowledge.js for what EVA may say at each stage.

export const ITEMS = {
  investigator_id: {
    name: 'Asterion Investigator ID',
    desc: 'Commander Mara Voss · Orbital Recovery Division. Clearance for ECHO-9 recovery operations.',
  },
};

export const CATEGORIES = ['Crew Records', 'Research Files', 'System Logs', 'Personal Recordings', 'Unknown Signals'];

export const EVIDENCE = {
  suit_locker: {
    title: 'Suit Locker 3',
    category: 'System Logs',
    location: 'Arrival Airlock',
    text: 'Locker 3 is open and empty. The nameplate reads VOSS, M.\nCheck-out log: 2189-03-14 04:09.\nYou have never been issued equipment on ECHO-9.',
  },
  docking_log: {
    title: 'Docking Register',
    category: 'System Logs',
    location: 'Cargo Bay',
    text: 'Two arrivals are registered to your credential.\n2189-03-14 04:12 — VOSS, M. — CLEARED — no vessel recorded.\n2189-03-22 09:41 — VOSS, M. — CLEARED — ARV-112 (your shuttle).\nThe first entry is eight days old.',
  },
  security_footage: {
    title: 'Camera 02 — Cargo Bay',
    category: 'Unknown Signals',
    location: 'Security Office',
    text: '2189-03-14 04:15. A figure in an Asterion recovery suit crosses the cargo bay and stops beneath the camera.\nIt raises one open hand and holds it there for eleven seconds.\nThe suit carries your service number.',
  },
  jonah_note: {
    title: 'Datapad Note — J. Reyes',
    category: 'Crew Records',
    location: 'Crew Hub',
    text: 'To all crew: Engineering access cards stay in your bunk locker, not in your pockets.\nLocker numbers follow the duty roster. No exceptions.\n— J. Reyes, Chief Engineer',
  },
  duty_roster: {
    title: 'Duty Roster — Week 10',
    category: 'Crew Records',
    location: 'Mess Hall',
    text: 'SEN, M. — Lead research — Bunk 1\nREYES, J. — Chief engineer — Bunk 2\nANAND, P. — Communications — Bunk 3\nKELLER, T. — Medical — Bunk 4\nHARGREAVE, L. — Signal analyst — Bunk 5\nOKAFOR, D. — Systems — Bunk 6\n\n"Bunk lockers match bunk numbers." — J.R.\nHandwritten, 12 March: "Hearing yourself on ch.4? Log it with Priya. Do NOT answer." — M.S.',
  },
  priya_recording: {
    title: 'Personal Log — P. Anand',
    category: 'Personal Recordings',
    location: 'Mess Hall',
    text: '2189-03-09, 22:14.\n"Channel four opened by itself at twenty-one forty. It was my voice, reading tomorrow\'s relay schedule. I haven\'t written tomorrow\'s schedule.\nJonah says it\'s an echo in the relay buffer. Maya just wrote it down and said nothing.\nI\'m logging it anyway."',
  },
  crew_photo: {
    title: 'Crew Photograph',
    category: 'Crew Records',
    location: 'Mess Hall',
    text: 'Six people at an observation window, Earth behind them.\nWritten on the border: "ECHO-9 · year three · all six of us".',
  },
  galley_log: {
    title: 'Galley Dispenser 2',
    category: 'System Logs',
    location: 'Mess Hall',
    text: 'Last order: 2189-03-13 19:42, ANAND, P.\nStatus: not collected.\nService hold E-17 raised at 19:43 and never cleared.',
  },
};

export const OBJECTIVES = {
  cycle: 'Equalise the airlock pressure.',
  cargo: 'Find out why the station knows you. Check the cargo terminal.',
  security: 'Go to the Security Office.',
  authorise: 'Lift the crew corridor lockdown from the Security Office.',
  lever: 'Pull the emergency release lever.',
  hub: 'Enter the Crew Hub.',
  engineering: 'Find a way into Engineering. Start with the crew quarters.',
  mess: 'Search the Mess Hall for anything the crew left behind.',
  mess_more: 'Keep searching the Mess Hall.',
  phase1_done: 'Phase One complete. The Bunkroom door needs its manual release in Engineering — the next update continues from here.',
};

// speaker: EVA | MARA | PRIYA | INTERCOM | SYSTEM
export const LINES = {
  intro: [
    { speaker: 'MARA', text: 'Docking complete. ECHO-9 still is not answering hails.' },
    { speaker: 'MARA', text: 'Inner door is sealed. I need to equalise the pressure.' },
  ],
  airlock_done: [{ speaker: 'EVA', text: 'Pressure equalised. Inner door released.' }],
  welcome: [
    { speaker: 'EVA', text: 'Welcome back, Commander.' },
    { speaker: 'MARA', text: 'Back? I have never set foot on this station.' },
  ],
  cargo_seen: [{ speaker: 'EVA', text: 'Your credentials are unchanged since your last visit, Commander.' }],
  cargo_grant: [{ speaker: 'EVA', text: 'Security Office access restored. As before.' }],
  lockers: [{ speaker: 'MARA', text: 'That is my name. On a locker I have never opened.' }],
  security_enter: [
    { speaker: 'EVA', text: 'The crew corridor is under emergency lockdown. Your credential authorised it, Commander.' },
    { speaker: 'MARA', text: 'I just got here.' },
  ],
  footage: [{ speaker: 'MARA', text: 'That suit carries my service number.' }],
  authorise: [{ speaker: 'EVA', text: 'Authorisation accepted. It matches your previous authorisation exactly.' }],
  release: [{ speaker: 'EVA', text: 'Lockdown lifted. The crew corridor is open.' }],
  hub: [
    { speaker: 'EVA', text: 'Crew Hub. All personnel are accounted for.' },
    { speaker: 'MARA', text: 'Then where is everyone?' },
  ],
  intercom: [
    { speaker: 'INTERCOM', text: '[static]' },
    { speaker: 'EVA', text: 'That channel has been silent for nine days, Commander.' },
  ],
  mess_enter: [
    { speaker: 'EVA', text: 'Mess Hall. Meal service was suspended on the thirteenth of March.' },
    { speaker: 'MARA', text: 'They left in the middle of eating.' },
  ],
  roster: [{ speaker: 'MARA', text: 'Six crew. Bunk lockers match the bunk numbers.' }],
  photo: [{ speaker: 'MARA', text: 'All six of them. Someone kept this.' }],
  galley: [{ speaker: 'MARA', text: 'Ordered at nineteen forty-two on the thirteenth. Never collected.' }],
  recording: [
    { speaker: 'PRIYA', text: 'Comms log, personal. Ninth of March. Channel four opened by itself at twenty-one forty.' },
    { speaker: 'PRIYA', text: 'It was my voice. Reading tomorrow\'s relay schedule. I haven\'t written tomorrow\'s schedule.' },
    { speaker: 'PRIYA', text: 'Jonah says it\'s an echo in the relay buffer. Maya just wrote it down and said nothing.' },
    { speaker: 'PRIYA', text: 'I\'m logging it anyway.' },
  ],
  recording_echo: [
    { speaker: 'INTERCOM', text: '"I\'m logging it anyway."', dur: 2.8 },
    { speaker: 'MARA', text: 'That came from the intercom. The recorder had already stopped.' },
    { speaker: 'EVA', text: 'Several crew reported messages in their own voices. I logged each one.' },
  ],
  phase1_done: [
    { speaker: 'EVA', text: 'The bunk wing door has a motor fault. Its manual release is in Engineering.' },
    { speaker: 'MARA', text: 'Then I need Engineering.' },
  ],
};

// Mess Hall evidence that completes Phase One (both required).
export const PHASE1_REQUIRED = ['duty_roster', 'priya_recording'];
