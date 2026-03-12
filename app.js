// ── VISEME MAP ──────────────────────────────────────────────────────────────
const VISEME_MAP = {
  'A':1,'E':1,'I':1,
  'B':2,'M':2,'P':2,
  'F':3,'V':3,
  'C':4,'D':4,'G':4,'K':4,'N':4,'R':4,'S':4,'T':4,'X':4,'Y':4,'Z':4,
  'U':5,
  'J':6,'H':6,
  'L':7,
  'O':8,
  'Q':9,'W':9,
};
const DIGRAPHS = {'CH':6,'SH':6};
const VISEME_COLORS = ['#d3d3d3','#6c47ff','#00d1b2','#ffd600','#ff4d6d','#00b4d8','#ff6b35','#a8e063','#bf5af2','#ff9f1c'];

function charToViseme(ch) {
  return VISEME_MAP[ch.toUpperCase()] ?? 0;
}

function buildVisemeTimeline(chars, startTimes) {
  const events = [];
  let i = 0;
  while (i < chars.length) {
    const pair = (chars[i] + (chars[i+1] || '')).toUpperCase();
    if (DIGRAPHS[pair] !== undefined) {
      events.push({ chars: chars[i]+chars[i+1], viseme: DIGRAPHS[pair], timeMs: Math.round(startTimes[i]*1000), digraph: true });
      i += 2;
    } else {
      const v = charToViseme(chars[i]);
      events.push({ chars: chars[i], viseme: v, timeMs: Math.round(startTimes[i]*1000), digraph: false });
      i++;
    }
  }
  const deduped = [];
  let prev = -1;
  for (const e of events) {
    if (e.viseme !== prev) { deduped.push(e); prev = e.viseme; }
  }
  return deduped;
}

// ── GENERATE ────────────────────────────────────────────────────────────────
let visemeTimeline = [];
let rawJSON = '';
let jsCode = '';

async function generate() {
  const apiKey = document.getElementById('api-key').value.trim();
  const voiceId = document.getElementById('voice-id').value.trim();
  const text = document.getElementById('text-input').value.trim();
  const status = document.getElementById('status-msg');

  if (!apiKey || !voiceId || !text) {
    status.textContent = 'Fill in all fields';
    status.className = 'status-msg error';
    return;
  }

  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  status.textContent = 'Calling ElevenLabs API...';
  status.className = 'status-msg loading';

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const { characters, character_start_times_seconds } = data.alignment;
    const audioBase64 = data.audio_base64;

    visemeTimeline = buildVisemeTimeline(characters, character_start_times_seconds);
    const digraphCount = visemeTimeline.filter(e => e.digraph).length;

    status.textContent = `Done! ${visemeTimeline.length} viseme events, ${digraphCount} digraph${digraphCount !== 1 ? 's' : ''} detected.`;
    status.className = 'status-msg success';

    const audioEl = document.getElementById('audio-player');
    audioEl.src = `data:audio/mp3;base64,${audioBase64}`;
    audioEl.load();
    setupAudio(audioEl);

    buildChips(visemeTimeline);
    buildCode(visemeTimeline);

    document.getElementById('results-section').style.display = 'flex';
    document.getElementById('results-section').style.flexDirection = 'column';
    document.getElementById('results-section').style.gap = '0';

  } catch (err) {
    status.textContent = `Error: ${err.message}`;
    status.className = 'status-msg error';
  } finally {
    btn.disabled = false;
  }
}

// ── CHIPS ────────────────────────────────────────────────────────────────────
function buildChips(timeline) {
  const container = document.getElementById('viseme-chips');
  container.innerHTML = '';
  for (const e of timeline) {
    const color = VISEME_COLORS[e.viseme];
    const chip = document.createElement('div');
    chip.className = 'chip' + (e.digraph ? ' digraph' : '');
    chip.style.borderColor = color;
    chip.style.color = color;
    chip.style.background = `linear-gradient(90deg,rgba(255,255,255,0.78),rgba(255,255,255,0.78)),${color}`;
    chip.innerHTML = `<span class="chip-char">${e.chars}</span><span class="chip-time">${e.timeMs}ms</span>`;
    container.appendChild(chip);
  }
}

// ── CODE ─────────────────────────────────────────────────────────────────────
function buildCode(timeline) {
  const jsonStr = JSON.stringify(timeline.map(({chars,viseme,timeMs}) => ({chars,viseme,timeMs})), null, 2);
  rawJSON = jsonStr;

  jsCode = `// Rive Lip Sync — paste into your JS\n// Make sure the Number input in your State Machine is named "phoneme"\n\nconst visemeTimeline = ${jsonStr};\n\n// Play lip sync\nfunction playLipSync(riveInstance) {\n  const inputs = riveInstance.stateMachineInputs('sm-inputs');\n  const phoneme = inputs.find(i => i.name === 'phoneme');\n  visemeTimeline.forEach(({ viseme, timeMs }) => {\n    setTimeout(() => { phoneme.value = viseme; }, timeMs);\n  });\n}`;

  renderCode('js', jsCode);
  renderCode('json', jsonStr);
}

function renderCode(type, text) {
  const pre = document.getElementById(`code-${type}`);
  const gutter = document.getElementById(`code-gutter-${type}`);
  pre.textContent = text;
  const lines = text.split('\n').length;
  gutter.innerHTML = Array.from({length: lines}, (_,i) => `<span>${i+1}</span>`).join('');
}

// ── COPY ─────────────────────────────────────────────────────────────────────
async function copyCode(type) {
  const text = type === 'js' ? jsCode : rawJSON;
  const btn = document.getElementById(`btn-copy-${type}`);
  await navigator.clipboard.writeText(text).catch(() => {});
  btn.textContent = 'COPIED!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = type === 'js' ? 'COPY CODE' : 'COPY JSON'; btn.classList.remove('copied'); }, 2000);
}

// ── AUDIO ─────────────────────────────────────────────────────────────────────
function setupAudio(audio) {
  audio.ontimeupdate = updateProgress;
  audio.onended = () => {
    document.getElementById('icon-play').style.display = '';
    document.getElementById('icon-pause').style.display = 'none';
  };
}

function formatTime(s) {
  const m = Math.floor(s/60);
  const sec = Math.floor(s%60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function updateProgress() {
  const audio = document.getElementById('audio-player');
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  document.getElementById('audio-fill').style.width = pct + '%';
  document.getElementById('audio-head').style.left = `calc(${pct}% - 4px)`;
  document.getElementById('audio-current').textContent = formatTime(audio.currentTime);
  const rem = audio.duration ? audio.duration - audio.currentTime : 0;
  document.getElementById('audio-remaining').textContent = '-' + formatTime(rem);
}

function togglePlay() {
  const audio = document.getElementById('audio-player');
  if (audio.paused) {
    audio.play();
    document.getElementById('icon-play').style.display = 'none';
    document.getElementById('icon-pause').style.display = '';
  } else {
    audio.pause();
    document.getElementById('icon-play').style.display = '';
    document.getElementById('icon-pause').style.display = 'none';
  }
}

function toggleMute() {
  const audio = document.getElementById('audio-player');
  audio.muted = !audio.muted;
}

function seekAudio(e) {
  const audio = document.getElementById('audio-player');
  if (!audio.duration) return;
  const rect = document.getElementById('audio-slider').getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  audio.currentTime = pct * audio.duration;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.ctrlKey) generate();
});
