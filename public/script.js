'use strict';

const state = {
  stream: null, recorder: null, chunks: [],
  recording: false, camOn: false, micOn: false,
  mode: 'video', facingMode: 'user',
  timerInterval: null, timerSeconds: 0,
  analyser: null, animFrame: null,
};

const $ = id => document.getElementById(id);
const liveVideo = $('liveVideo'), previewWrap = $('previewWrapper');
const overlay = $('previewOverlay'), badge = $('recordingBadge'), timerEl = $('timer');
const btnCam = $('btnCam'), btnMic = $('btnMic'), btnRecord = $('btnRecord'), btnSwitch = $('btnSwitch');
const btnRecordLbl = $('btnRecordLabel');
const iconRecord = $('iconRecord'), iconStop = $('iconStop');
const iconCamOn = $('iconCamOn'), iconCamOff = $('iconCamOff');
const iconMicOn = $('iconMicOn'), iconMicOff = $('iconMicOff');
const statusEl = $('status');
const audioMeter = $('audioMeterWrap'), audioBar = $('audioBar');
const modeVideo = $('modeVideo'), modeAudio = $('modeAudio');
const recordingsSec = $('recordingsSection'), recordingsList = $('recordingsList');

function isMobile() { return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent); }

function getSupportedMime(isVideo) {
  const types = isVideo
    ? ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4']
    : ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function getExtension(mime) {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className = 'status' + (type ? ' ' + type : '');
}

async function startStream() {
  stopStream();
  const isVideo = state.mode === 'video';
  const constraints = {
    video: (state.camOn && isVideo) ? { facingMode: state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    audio: state.micOn ? { echoCancellation: true, noiseSuppression: true } : false,
  };
  if (!constraints.video && !constraints.audio) { stopStream(); return; }
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
    if (constraints.audio) startAudioMeter(stream);
    btnRecord.disabled = false;
    setStatus('Prêt à enregistrer', 'ok');
  } catch (err) { handlePermissionError(err); }
}

function stopStream() {
  if (state.stream) { state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
  liveVideo.srcObject = null;
  stopAudioMeter();
  if (!state.recording) { overlay.classList.remove('hidden'); btnRecord.disabled = true; }
}

function handlePermissionError(err) {
  let msg = 'Erreur d\'accès aux périphériques.';
  if (err.name === 'NotAllowedError') msg = 'Permission refusée. Autorisez la caméra/micro dans les paramètres du navigateur.';
  else if (err.name === 'NotFoundError') msg = 'Aucun périphérique trouvé.';
  else if (err.name === 'NotReadableError') msg = 'Périphérique déjà utilisé par une autre application.';
  setStatus(msg, 'error');
  state.camOn = false; state.micOn = false;
  updateCamIcon(); updateMicIcon();
}

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
  audioBar.style.width = Math.min(100, (avg / 128) * 250) + '%';
  state.animFrame = requestAnimationFrame(animateMeter);
}

function stopAudioMeter() {
  if (state.animFrame) cancelAnimationFrame(state.animFrame);
  state.analyser = null;
  audioMeter.classList.remove('visible');
  audioBar.style.width = '0%';
}

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

function stopTimer() { clearInterval(state.timerInterval); timerEl.classList.remove('visible'); }

function startRecording() {
  if (!state.stream) return;
  const isVideo = state.mode === 'video';
  const mime = getSupportedMime(isVideo);
  const options = mime ? { mimeType: mime } : {};
  try { state.recorder = new MediaRecorder(state.stream, options); }
  catch (e) { state.recorder = new MediaRecorder(state.stream); }
  state.chunks = [];
  state.recorder.ondataavailable = e => { if (e.data.size > 0) state.chunks.push(e.data); };
  state.recorder.onstop = saveRecording;
  state.recorder.start(200);
  state.recording = true;
  badge.classList.add('visible');
  startTimer();
  btnRecord.classList.add('recording');
  iconRecord.style.display = 'none'; iconStop.style.display = '';
  btnRecordLbl.textContent = 'Arrêter';
  btnCam.disabled = true; btnMic.disabled = true;
  modeVideo.disabled = true; modeAudio.disabled = true;
  setStatus('Enregistrement en cours…');
}

function stopRecording() {
  if (!state.recorder || state.recorder.state === 'inactive') return;
  state.recorder.stop();
  state.recording = false;
  badge.classList.remove('visible');
  stopTimer();
  btnRecord.classList.remove('recording');
  iconRecord.style.display = ''; iconStop.style.display = 'none';
  btnRecordLbl.textContent = 'Enregistrer';
  btnCam.disabled = false; btnMic.disabled = false;
  modeVideo.disabled = false; modeAudio.disabled = false;
}

function saveRecording() {
  const isVideo = state.mode === 'video';
  const mime = state.recorder.mimeType || getSupportedMime(isVideo);
  const ext = getExtension(mime);
  const blob = new Blob(state.chunks, { type: mime });
  const url = URL.createObjectURL(blob);
  const duration = formatDuration(state.timerSeconds);

  const item = document.createElement('div');
  item.className = 'recording-item';

  const mediaEl = isVideo
    ? `<video src="${url}" controls playsinline></video>`
    : `<audio src="${url}" controls></audio>`;

  item.innerHTML = `
    ${mediaEl}
    <div class="rec-meta">
      <div>
        <div class="rec-label">${isVideo ? 'Vidéo' : 'Audio'} — ${duration}</div>
        <div class="rec-info">${ext.toUpperCase()}</div>
      </div>
      <div class="rec-actions">
        <button class="btn-send" data-ext="${ext}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          Envoyer
        </button>
        <a class="btn-dl" href="${url}" download="enregistrement.${ext}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Garder
        </a>
      </div>
    </div>
    <div class="upload-status" id="uploadStatus"></div>
  `;

  // Bouton envoyer à l'admin
  item.querySelector('.btn-send').addEventListener('click', async function () {
    const btn = this;
    const uploadStatusEl = item.querySelector('.upload-status');
    btn.disabled = true;
    btn.textContent = 'Envoi…';
    uploadStatusEl.textContent = 'Envoi en cours…';
    uploadStatusEl.className = 'upload-status sending';

    const formData = new FormData();
    formData.append('video', blob, `enregistrement.${ext}`);

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      if (res.ok) {
        uploadStatusEl.textContent = 'Envoyé avec succès !';
        uploadStatusEl.className = 'upload-status success';
        btn.textContent = 'Envoyé';
      } else {
        throw new Error('Erreur serveur');
      }
    } catch (e) {
      uploadStatusEl.textContent = 'Échec de l\'envoi. Réessayez.';
      uploadStatusEl.className = 'upload-status error';
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Envoyer`;
    }
  });

  recordingsList.innerHTML = '';
  recordingsList.appendChild(item);
  recordingsSec.style.display = '';
  setStatus('Enregistrement prêt — cliquez "Envoyer" pour l\'envoyer.', 'ok');
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function updateCamIcon() {
  iconCamOn.style.display = state.camOn ? '' : 'none';
  iconCamOff.style.display = state.camOn ? 'none' : '';
  btnCam.classList.toggle('active', state.camOn);
}

function updateMicIcon() {
  iconMicOn.style.display = state.micOn ? '' : 'none';
  iconMicOff.style.display = state.micOn ? 'none' : '';
  btnMic.classList.toggle('active', state.micOn);
}

btnCam.addEventListener('click', async () => {
  if (state.mode === 'audio') return;
  state.camOn = !state.camOn; updateCamIcon();
  if (state.camOn || state.micOn) {
    await startStream();
    if (isMobile() && state.camOn) btnSwitch.style.display = '';
    else btnSwitch.style.display = 'none';
  } else { stopStream(); btnSwitch.style.display = 'none'; setStatus('Appuyez sur "Caméra" ou "Micro" pour démarrer'); }
});

btnMic.addEventListener('click', async () => {
  state.micOn = !state.micOn; updateMicIcon();
  if (state.camOn || state.micOn) await startStream();
  else { stopStream(); setStatus('Appuyez sur "Caméra" ou "Micro" pour démarrer'); }
});

btnRecord.addEventListener('click', () => { state.recording ? stopRecording() : startRecording(); });

btnSwitch.addEventListener('click', async () => {
  state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
  await startStream();
});

modeVideo.addEventListener('click', async () => {
  if (state.mode === 'video') return;
  state.mode = 'video'; modeVideo.classList.add('active'); modeAudio.classList.remove('active');
  btnCam.style.display = '';
  previewWrap.classList.remove('audio-only');
  if (state.micOn || state.camOn) await startStream();
});

modeAudio.addEventListener('click', async () => {
  if (state.mode === 'audio') return;
  state.mode = 'audio'; modeAudio.classList.add('active'); modeVideo.classList.remove('active');
  state.camOn = false; updateCamIcon();
  btnCam.style.display = 'none'; btnSwitch.style.display = 'none';
  previewWrap.classList.add('audio-only');
  if (state.micOn) await startStream();
  else { stopStream(); setStatus('Activez le micro pour enregistrer l\'audio'); }
});

if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
  setStatus('Votre navigateur ne supporte pas la caméra/micro. Essayez Chrome ou Firefox.', 'error');
  btnCam.disabled = true; btnMic.disabled = true; btnRecord.disabled = true;
} else { updateCamIcon(); updateMicIcon(); }
