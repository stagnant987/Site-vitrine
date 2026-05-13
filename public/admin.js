'use strict';

const loginScreen = document.getElementById('loginScreen');
const dashboard   = document.getElementById('dashboard');
const loginForm   = document.getElementById('loginForm');
const loginError  = document.getElementById('loginError');
const passwordInput = document.getElementById('passwordInput');
const btnLogout   = document.getElementById('btnLogout');
const btnRefresh  = document.getElementById('btnRefresh');
const videosGrid  = document.getElementById('videosGrid');
const dashEmpty   = document.getElementById('dashEmpty');
const statTotal   = document.getElementById('statTotal');
const statSize    = document.getElementById('statSize');

let knownFiles = new Set();
let pollInterval = null;

// ── Login ─────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  try {
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value })
    });
    if (res.ok) {
      loginScreen.style.display = 'none';
      dashboard.style.display = '';
      loadVideos();
      startPolling();
    } else {
      loginError.textContent = 'Mot de passe incorrect';
    }
  } catch {
    loginError.textContent = 'Erreur de connexion au serveur';
  }
});

// ── Logout ────────────────────────────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await fetch('/admin/logout', { method: 'POST' });
  clearInterval(pollInterval);
  dashboard.style.display = 'none';
  loginScreen.style.display = '';
  passwordInput.value = '';
  knownFiles.clear();
});

// ── Vérifier la session au chargement ────────────────────────────
(async () => {
  try {
    const res = await fetch('/admin/check');
    const data = await res.json();
    if (data.logged) {
      loginScreen.style.display = 'none';
      dashboard.style.display = '';
      loadVideos();
      startPolling();
    }
  } catch (_) {}
})();

// ── Actualiser ────────────────────────────────────────────────────
btnRefresh.addEventListener('click', () => loadVideos());

// ── Polling (vérifie nouvelles vidéos toutes les 10s) ────────────
function startPolling() {
  pollInterval = setInterval(loadVideos, 10000);
}

// ── Charger les vidéos ────────────────────────────────────────────
async function loadVideos() {
  btnRefresh.classList.add('spinning');
  try {
    const res = await fetch('/admin/videos');
    if (!res.ok) return;
    const videos = await res.json();

    updateStats(videos);

    if (videos.length === 0) {
      dashEmpty.style.display = '';
      videosGrid.innerHTML = '';
      knownFiles.clear();
      return;
    }
    dashEmpty.style.display = 'none';

    // Détecter nouvelles vidéos
    const newOnes = videos.filter(v => !knownFiles.has(v.name));
    if (newOnes.length > 0 && knownFiles.size > 0) {
      showNotif(`${newOnes.length} nouvelle${newOnes.length > 1 ? 's' : ''} vidéo${newOnes.length > 1 ? 's' : ''} reçue${newOnes.length > 1 ? 's' : ''} !`);
    }

    // Ajouter nouvelles cartes en haut
    newOnes.forEach(video => {
      knownFiles.add(video.name);
      const card = buildCard(video);
      videosGrid.prepend(card);
    });

    // Mise à jour complète si la liste change
    if (videosGrid.children.length !== videos.length) {
      videosGrid.innerHTML = '';
      knownFiles.clear();
      videos.forEach(video => {
        knownFiles.add(video.name);
        videosGrid.appendChild(buildCard(video));
      });
    }

    videos.forEach(v => knownFiles.add(v.name));
  } catch (_) {} finally {
    btnRefresh.classList.remove('spinning');
  }
}

// ── Construire une carte vidéo ────────────────────────────────────
function buildCard(video) {
  const ext = video.name.split('.').pop().toLowerCase();
  const isVideo = ['webm', 'mp4'].includes(ext);
  const date = new Date(video.date).toLocaleString('fr-FR');
  const sizeMb = (video.size / 1024 / 1024).toFixed(1);
  const url = `/admin/video/${encodeURIComponent(video.name)}`;

  const card = document.createElement('div');
  card.className = 'video-card';
  card.dataset.name = video.name;

  const mediaEl = isVideo
    ? `<video src="${url}" controls playsinline preload="metadata"></video>`
    : `<audio src="${url}" controls preload="metadata"></audio>`;

  const device = parseDevice(video.userAgent);

  card.innerHTML = `
    ${mediaEl}
    <div class="card-info">
      <div class="card-title">${isVideo ? 'Vidéo' : 'Audio'} — ${date}</div>
      <div class="card-meta">
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          Appareil : <span class="meta-badge">${device}</span>
        </span>
        <span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Reçu le ${date}
        </span>
        <span>Taille : ${sizeMb} Mo · ${ext.toUpperCase()}</span>
      </div>
      <div class="card-actions">
        <a class="btn-card-dl" href="${url}" download="${video.name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Télécharger
        </a>
        <button class="btn-card-del" title="Supprimer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  card.querySelector('.btn-card-del').addEventListener('click', async () => {
    if (!confirm('Supprimer cette vidéo ?')) return;
    await fetch(`/admin/video/${encodeURIComponent(video.name)}`, { method: 'DELETE' });
    knownFiles.delete(video.name);
    card.remove();
    if (videosGrid.children.length === 0) dashEmpty.style.display = '';
    updateStatsFromGrid();
  });

  return card;
}

// ── Stats ─────────────────────────────────────────────────────────
function updateStats(videos) {
  statTotal.textContent = videos.length;
  const totalMb = videos.reduce((sum, v) => sum + v.size, 0) / 1024 / 1024;
  statSize.textContent = totalMb < 1024
    ? totalMb.toFixed(1) + ' Mo'
    : (totalMb / 1024).toFixed(2) + ' Go';
}

function updateStatsFromGrid() {
  statTotal.textContent = videosGrid.children.length;
}

// ── Notif ─────────────────────────────────────────────────────────
function showNotif(msg) {
  const n = document.createElement('div');
  n.className = 'notif';
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 4000);
}

// ── Détecter appareil ─────────────────────────────────────────────
function parseDevice(ua) {
  if (!ua) return 'Inconnu';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Autre';
}
