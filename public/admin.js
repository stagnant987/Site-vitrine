'use strict';

// Bouton afficher/masquer mot de passe
document.getElementById('btnTogglePass').addEventListener('click', () => {
  const input   = document.getElementById('passwordInput');
  const eyeShow = document.getElementById('eyeShow');
  const eyeHide = document.getElementById('eyeHide');
  const visible = input.type === 'text';
  input.type        = visible ? 'password' : 'text';
  eyeShow.style.display = visible ? '' : 'none';
  eyeHide.style.display = visible ? 'none' : '';
});

const loginScreen   = document.getElementById('loginScreen');
const app           = document.getElementById('app');
const loginForm     = document.getElementById('loginForm');
const loginError    = document.getElementById('loginError');
const passwordInput = document.getElementById('passwordInput');
const btnLogout     = document.getElementById('btnLogout');
const btnRefresh    = document.getElementById('btnRefresh');
const videosGrid    = document.getElementById('videosGrid');
const emptyState    = document.getElementById('emptyState');
const statTotal     = document.getElementById('statTotal');
const statSize      = document.getElementById('statSize');
const statDevices   = document.getElementById('statDevices');
const statLast      = document.getElementById('statLast');
const toast         = document.getElementById('toast');

let knownFiles  = new Set();
let pollInterval = null;

// ── Login ─────────────────────────────────────────────────────────
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  const btn = document.getElementById('btnLogin');
  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    const res = await fetch('/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value })
    });
    if (res.ok) {
      showApp();
    } else {
      loginError.textContent = 'Mot de passe incorrect.';
    }
  } catch {
    loginError.textContent = 'Impossible de contacter le serveur.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Se connecter`;
  }
});

// ── Logout ────────────────────────────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await fetch('/admin/logout', { method: 'POST' });
  clearInterval(pollInterval);
  app.style.display = 'none';
  loginScreen.style.display = '';
  passwordInput.value = '';
  knownFiles.clear();
  videosGrid.innerHTML = '';
});

// ── Vérifier session existante ────────────────────────────────────
(async () => {
  try {
    const res  = await fetch('/admin/check');
    const data = await res.json();
    if (data.logged) showApp();
  } catch (_) {}
})();

function showApp() {
  loginScreen.style.display = 'none';
  app.style.display = 'grid';
  loadVideos();
  pollInterval = setInterval(loadVideos, 10000);
}

// ── Actualiser ────────────────────────────────────────────────────
btnRefresh.addEventListener('click', loadVideos);

// ── Charger les vidéos ────────────────────────────────────────────
async function loadVideos() {
  btnRefresh.classList.add('spinning');
  try {
    const res = await fetch('/admin/videos');
    if (!res.ok) return;
    const videos = await res.json();

    updateStats(videos);

    if (videos.length === 0) {
      emptyState.style.display = '';
      videosGrid.innerHTML = '';
      knownFiles.clear();
      return;
    }

    emptyState.style.display = 'none';

    // Détecter nouvelles vidéos
    const newOnes = videos.filter(v => !knownFiles.has(v.name));

    if (newOnes.length > 0 && knownFiles.size > 0) {
      showToast(`${newOnes.length} nouvelle${newOnes.length > 1 ? 's' : ''} vidéo${newOnes.length > 1 ? 's' : ''} reçue${newOnes.length > 1 ? 's' : ''} !`);
    }

    // Si des fichiers ont été supprimés côté serveur, reconstruire la grille
    const serverNames = new Set(videos.map(v => v.name));
    const localCards  = [...videosGrid.querySelectorAll('.video-card')];
    localCards.forEach(card => {
      if (!serverNames.has(card.dataset.name)) card.remove();
    });

    // Ajouter les nouvelles cartes en haut
    newOnes.reverse().forEach(video => {
      knownFiles.add(video.name);
      const card = buildCard(video, true);
      videosGrid.prepend(card);
    });

    // Premier chargement
    if (knownFiles.size === 0) {
      videos.forEach(v => {
        knownFiles.add(v.name);
        videosGrid.appendChild(buildCard(v, false));
      });
    }

    videos.forEach(v => knownFiles.add(v.name));

  } catch (_) {} finally {
    btnRefresh.classList.remove('spinning');
  }
}

// ── Construire une carte ──────────────────────────────────────────
function buildCard(video, isNew) {
  const ext     = video.name.split('.').pop().toLowerCase();
  const isVideo = ['webm', 'mp4'].includes(ext);
  const url     = `/admin/video/${encodeURIComponent(video.name)}`;
  const date    = new Date(video.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const sizeMb  = (video.size / 1024 / 1024).toFixed(1);
  const device  = parseDevice(video.userAgent);

  const card = document.createElement('div');
  card.className = 'video-card' + (isNew ? ' new-card' : '');
  card.dataset.name = video.name;

  const mediaEl = isVideo
    ? `<video src="${url}" controls playsinline preload="metadata"></video>`
    : `<audio src="${url}" controls preload="metadata"></audio>`;

  card.innerHTML = `
    <div class="card-media">
      ${mediaEl}
      <span class="card-type-badge">${isVideo ? 'Vidéo' : 'Audio'}</span>
    </div>
    <div class="card-body">
      <div class="card-top">
        <div class="card-title">Enregistrement utilisateur</div>
        <div class="card-date">${date}</div>
      </div>
      <div class="card-tags">
        <span class="tag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
          ${device}
        </span>
        <span class="tag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${sizeMb} Mo
        </span>
        <span class="tag">${ext.toUpperCase()}</span>
      </div>
      <div class="card-actions">
        <a class="btn-dl" href="${url}" download="${video.name}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Télécharger
        </a>
        <button class="btn-del" title="Supprimer cette vidéo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  card.querySelector('.btn-del').addEventListener('click', async () => {
    if (!confirm('Supprimer cette vidéo définitivement ?')) return;
    await fetch(`/admin/video/${encodeURIComponent(video.name)}`, { method: 'DELETE' });
    knownFiles.delete(video.name);
    card.style.transition = 'opacity 0.3s';
    card.style.opacity = '0';
    setTimeout(() => {
      card.remove();
      if (videosGrid.children.length === 0) emptyState.style.display = '';
      updateStatsFromGrid();
    }, 300);
  });

  return card;
}

// ── Stats ─────────────────────────────────────────────────────────
function updateStats(videos) {
  statTotal.textContent = videos.length;
  const totalMb = videos.reduce((s, v) => s + v.size, 0) / 1024 / 1024;
  statSize.textContent = totalMb < 1024
    ? totalMb.toFixed(1) + ' Mo'
    : (totalMb / 1024).toFixed(2) + ' Go';

  if (videos.length > 0) {
    statDevices.textContent = parseDevice(videos[0].userAgent);
    const last = new Date(videos[0].date);
    statLast.textContent = last.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}

function updateStatsFromGrid() {
  statTotal.textContent = videosGrid.children.length;
}

// ── Toast notification ────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.style.display = '';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ── Détecter l'appareil depuis le User-Agent ──────────────────────
function parseDevice(ua) {
  if (!ua) return 'Inconnu';
  if (/iPhone/i.test(ua))  return 'iPhone';
  if (/iPad/i.test(ua))    return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua))   return 'Linux';
  return 'Autre';
}
