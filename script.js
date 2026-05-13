'use strict';

// ── État global ──────────────────────────────────────────────────
const state = {
  stream: null,
  recorder: null,
  chunks: [],
  recording: false,
  camOn: false,
  micOn: false,
  mode: 'video',          // 'video' | 'audio'
  facingMode: 'user',     // 'user' | 'environment'
  timerInterval: null,
  timerSeconds: 0,
  analyser: null,
  animFrame: null,
  recordingCount: 0,
};

// ── Éléments DOM ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const liveVideo    = $('liveVideo');
const previewWrap  = $('previewWrapper');
const overlay      = $('previewOverlay');
const badge        = $('recordingBadge');
const timerEl      = $('timer');
const btnCam       = $('btnCam');
const btnMic       = $('btnMic');
const btnRecord    = $('btnRecord');
const btnSwitch    = $('btnSwitch');
const btnRecordLbl = $('btnRecordLabel');
const iconRecord   = $('iconRecord');
const iconStop     = $('iconStop');
const iconCamOn    = $('iconCamOn');
const iconCamOff   = $('iconCamOff');
const iconMicOn    = $('iconMicOn');
const iconMicOff   = $('iconMicOff');
const statusEl     = $('status');
const audioMeter   = $('audioMeterWrap');
const audioBar     = $('audioBar');
const modeVideo    = $('modeVideo');
const modeAudio    = $('modeAudio');
const recordingsSec = $('recordingsSection');
const recordingsList = $('recordingsList');

// ── Détecter si mobile (pour afficher le bouton flip) ────────────
function isMobile() {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
}

// ── Choisir le meilleur format d'enregistrement supporté ─────────
function getSupportedMime(isVideo) {
  const types = isVideo
    ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function getExtension(mime) {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

// ── Statut ───────────────────────────────────────────────────────
function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

// ── Demander accès caméra/micro ──────────────────────────────────
async function startStream() {
  // Arrêter l'ancien stream d'abord
  stopStream();

  const isVideo = state.mode === 'video';
  const constraints = {
    video: (state.camOn && isVideo)
      ? { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      : false,
    audio: state.micOn ? { echoCancellation: true, noiseSuppression: true } : false,
  };

  if (!constraints.video && !constraints.audio) {
    stopStream();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.stream = stream;

    if (constraints.video) {
      liveVideo.srcObject = stream;
      overlay.classList.add('hidden');
      previewWrap.classList.remove('audio-only');
    } else {
      liveVideo.srcObject = null;
      overlay.classList.remove('hidden');
      previewWrap.classList.add('audio-only');
    }

    if (constraints.audio) {
      startAudioMeter(stream);
    }

    btnRecord.disabled = false;
    setStatus('Prêt à enregistrer', 'ok');
  } catch (err) {
    handlePermissionError(err);
  }
}

function stopStream() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  liveVideo.srcObject = null;
  stopAudioMeter();
  if (!state.recording) {
    overlay.classList.remove('hidden');
    btnRecord.disabled = true;
  }
}

function handlePermissionError(err) {
  let msg = 'Erreur d\'accès aux périphériques.';
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    msg = 'Permission refusée. Autorisez la caméra/micro dans les paramètres du navigateur.';
  } else if (err.name === 'NotFoundError') {
    msg = 'Aucun périphérique trouvé. Vérifiez votre caméra/micro.';
  } else if (err.name === 'NotReadableError') {
    msg = 'Périphérique déjà utilisé par une autre application.';
  }
  setStatus(msg, 'error');
  state.camOn = false;
  state.micOn = false;
  updateCamIcon();
  updateMicIcon();
}

// ── Analyse audio (visualisation niveau) ─────────────────────────
function startAudioMeter(stream) {
  stopAudioMeter();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    state.analyser = analyser;
    audioMeter.classList.add('visible');
    animateMeter();
  } catch (_) {}
}

function animateMeter() {
  if (!state.analyser) return;
  const data = new Uint8Array(state.analyser.frequencyBinCount);
  state.analyser.getByteFrequencyData(data);
  const avg = data.reduce((a, b) => a + b, 0) / data.length;
  const pct = Math.min(100, (avg / 128) * 100 * 2.5);
  audioBar.style.width = pct + '%';
  state.animFrame = requestAnimationFrame(animateMeter);
}

function stopAudioMeter() {
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  state.analyser = null;
  audioMeter.classList.remove('visible');
  audioBar.style.width = '0%';
}

// ── Timer ────────────────────────────────────────────────────────
function startTimer() {
  state.timerSeconds = 0;
  timerEl.classList.add('visible');
  timerEl.textContent = '00:00';
  state.timerInterval = setInterval(() => {
    state.timerSeconds++;
    const m = String(Math.floor(state.timerSeconds / 60)).padStart(2, '0');
    const s = String(state.timerSeconds % 60).padStart(2, '0');
    timerEl.textContent = m + ':' + s;
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  timerEl.classList.remove('visible');
}

// ── Enregistrement ───────────────────────────────────────────────
function startRecording() {
  if (!state.stream) return;

  const isVideo = state.mode === 'video';
  const mime = getSupportedMime(isVideo);
  const options = mime ? { mimeType: mime } : {};

  try {
    state.recorder = new MediaRecorder(state.stream, options);
  } catch (e) {
    state.recorder = new MediaRecorder(state.stream);
  }

  state.chunks = [];
  state.recorder.ondataavailable = e => { if (e.data.size > 0) state.chunks.push(e.data); };
  state.recorder.onstop = saveRecording;
  state.recorder.start(200);
  state.recording = true;

  badge.classList.add('visible');
  startTimer();

  btnRecord.classList.add('recording');
  iconRecord.style.display = 'none';
  iconStop.style.display = '';
  btnRecordLbl.textContent = 'Arrêter';

  btnCam.disabled = true;
  btnMic.disabled = true;
  modeVideo.disabled = true;
  modeAudio.disabled = true;
  btnSwitch.disabled = true;

  setStatus('Enregistrement en cours…');
}

function stopRecording() {
  if (!state.recorder || state.recorder.state === 'inactive') return;
  state.recorder.stop();
  state.recording = false;

  badge.classList.remove('visible');
  stopTimer();

  btnRecord.classList.remove('recording');
  iconRecord.style.display = '';
  iconStop.style.display = 'none';
  btnRecordLbl.textContent = 'Enregistrer';

  btnCam.disabled = false;
  btnMic.disabled = false;
  modeVideo.disabled = false;
  modeAudio.disabled = false;
  if (isMobile() && state.camOn) btnSwitch.disabled = false;

  setStatus('Enregistrement sauvegardé', 'ok');
}

function saveRecording() {
  const isVideo = state.mode === 'video';
  const mime = state.recorder.mimeType || getSupportedMime(isVideo);
  const ext = getExtension(mime);
  const blob = new Blob(state.chunks, { type: mime });
  const url = URL.createObjectURL(blob);
  const duration = formatDuration(state.timerSeconds);

  state.recordingCount++;
  const num = state.recordingCount;
  const label = isVideo ? `Vidéo #${num}` : `Audio #${num}`;

  const item = document.createElement('div');
  item.className = 'recording-item';
  item.dataset.url = url;

  const mediaEl = isVideo
    ? `<video src="${url}" controls playsinline></video>`
    : `<audio src="${url}" controls></audio>`;

  item.innerHTML = `
    ${mediaEl}
    <div class="rec-meta">
      <div>
        <div class="rec-label">${label}</div>
        <div class="rec-info">Durée : ${duration} · ${ext.toUpperCase()}</div>
      </div>
      <div class="rec-actions">
        <a class="btn-dl" href="${url}" download="${label.replace(/\s/g,'_')}.${ext}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Télécharger
        </a>
        <button class="btn-del" title="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  item.querySelector('.btn-del').addEventListener('click', () => {
    URL.revokeObjectURL(url);
    item.remove();
    if (recordingsList.children.length === 0) {
      recordingsSec.style.display = 'none';
    }
  });

  recordingsList.prepend(item);
  recordingsSec.style.display = '';
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Icônes caméra / micro ─────────────────────────────────────────
function updateCamIcon() {
  iconCamOn.style.display  = state.camOn ? '' : 'none';
  iconCamOff.style.display = state.camOn ? 'none' : '';
  btnCam.classList.toggle('active', state.camOn);
  btnCam.classList.toggle('off', !state.camOn);
}

function updateMicIcon() {
  iconMicOn.style.display  = state.micOn ? '' : 'none';
  iconMicOff.style.display = state.micOn ? 'none' : '';
  btnMic.classList.toggle('active', state.micOn);
  btnMic.classList.toggle('off', !state.micOn);
}

// ── Événements ───────────────────────────────────────────────────
btnCam.addEventListener('click', async () => {
  if (state.mode === 'audio') return;
  state.camOn = !state.camOn;
  updateCamIcon();
  if (state.camOn || state.micOn) {
    await startStream();
    if (isMobile() && state.camOn) btnSwitch.style.display = '';
    else btnSwitch.style.display = 'none';
  } else {
    stopStream();
    btnSwitch.style.display = 'none';
    setStatus('Appuyez sur "Caméra" ou "Micro" pour démarrer');
  }
});

btnMic.addEventListener('click', async () => {
  state.micOn = !state.micOn;
  updateMicIcon();
  if (state.camOn || state.micOn) {
    await startStream();
  } else {
    stopStream();
    setStatus('Appuyez sur "Caméra" ou "Micro" pour démarrer');
  }
});

btnRecord.addEventListener('click', () => {
  state.recording ? stopRecording() : startRecording();
});

btnSwitch.addEventListener('click', async () => {
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  await startStream();
});

modeVideo.addEventListener('click', async () => {
  if (state.mode === 'video') return;
  state.mode = 'video';
  modeVideo.classList.add('active');
  modeAudio.classList.remove('active');
  btnCam.style.display = '';
  if (isMobile()) btnSwitch.style.display = state.camOn ? '' : 'none';
  previewWrap.classList.remove('audio-only');
  if (state.micOn || state.camOn) await startStream();
});

modeAudio.addEventListener('click', async () => {
  if (state.mode === 'audio') return;
  state.mode = 'audio';
  modeAudio.classList.add('active');
  modeVideo.classList.remove('active');
  // On cache la caméra en mode audio
  state.camOn = false;
  updateCamIcon();
  btnCam.style.display = 'none';
  btnSwitch.style.display = 'none';
  previewWrap.classList.add('audio-only');
  if (state.micOn) await startStream();
  else {
    stopStream();
    setStatus('Activez le micro pour enregistrer l\'audio');
  }
});

// ── Vérifier la disponibilité de getUserMedia ────────────────────
if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  setStatus('Votre navigateur ne supporte pas l\'accès à la caméra/micro. Essayez Chrome ou Firefox.', 'error');
  btnCam.disabled = true;
  btnMic.disabled = true;
  btnRecord.disabled = true;
} else {
  // Afficher le bouton flip uniquement sur mobile
  if (isMobile()) {
    // bouton affiché dynamiquement quand cam activée
  }
  updateCamIcon();
  updateMicIcon();
}
