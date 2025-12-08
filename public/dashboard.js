// public/dashboard.js

console.log('dashboard.js loaded');

const TOKEN_KEY = 'magicQueueToken';

let authToken = null;
let autoRefreshInterval = null;
let isPaused = false;

// Auth elements
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginBtn = document.getElementById('login-btn');
const authMessage = document.getElementById('auth-message');

const authSection = document.getElementById('auth-section');
const postAuthSection = document.getElementById('post-auth-section');

// Menu elements
const menuBtn = document.getElementById('menu-btn');
const menuPanel = document.getElementById('menu-panel');
const menuItems = document.querySelectorAll('.menu-item');

// Sections
const queueSection = document.getElementById('queue-section');
const toolsSection = document.getElementById('tools-section');
const accountSection = document.getElementById('account-section');

// Queue elements
const queueList = document.getElementById('queue-list');
const pauseBtn = document.getElementById('pause-btn');
const pauseStatus = document.getElementById('pause-status');

// Tools elements
const downloadQrsBtnTools = document.getElementById('download-qrs-btn-tools');

// Account elements
const accountEmail = document.getElementById('account-email');
const accountSubscription = document.getElementById('account-subscription');
const logoutBtn = document.getElementById('logout-btn');

// ---------- Section helper ----------

function setActiveSection(name) {
  if (queueSection) queueSection.classList.add('hidden');
  if (toolsSection) toolsSection.classList.add('hidden');
  if (accountSection) accountSection.classList.add('hidden');

  if (name === 'queue' && queueSection) queueSection.classList.remove('hidden');
  if (name === 'tools' && toolsSection) toolsSection.classList.remove('hidden');
  if (name === 'account' && accountSection) accountSection.classList.remove('hidden');
}

// ---------- Auto-refresh ----------

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(() => {
    if (authToken) {
      loadQueue();
    }
  }, 30000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ---------- Pause UI ----------

function updatePauseUI() {
  if (!pauseBtn || !pauseStatus) return;
  if (isPaused) {
    pauseBtn.textContent = 'Resume queue';
    pauseStatus.textContent =
      'Queue is paused. Guests see a brief pause message when they scan.';
  } else {
    pauseBtn.textContent = 'Pause queue';
    pauseStatus.textContent = 'Queue is live.';
  }
}

// ---------- Session init ----------

async function initFromStorage() {
  const stored = localStorage.getItem(TOKEN_KEY);
  if (!stored) return;

  authToken = stored;
  authSection.classList.add('hidden');
  postAuthSection.classList.remove('hidden');
  menuBtn.classList.remove('hidden');

  setActiveSection('queue');
  startAutoRefresh();

  try {
    await Promise.all([loadQueue(), loadAccountInfo()]);
  } catch (err) {
    console.error('Failed to restore session, clearing token', err);
    performLogout(true);
  }
}

// ---------- Login ----------

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMessage.textContent = 'Enter email and password.';
    return;
  }

  loginBtn.disabled = true;
  authMessage.textContent = 'Logging in...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      authMessage.textContent = data.error || 'Login failed.';
      return;
    }

    authToken = data.token;
    localStorage.setItem(TOKEN_KEY, authToken);

    authMessage.textContent = 'Logged in.';
    authSection.classList.add('hidden');
    postAuthSection.classList.remove('hidden');
    menuBtn.classList.remove('hidden');

    setActiveSection('queue');
    startAutoRefresh();

    await Promise.all([loadQueue(), loadAccountInfo()]);
  } catch (err) {
    console.error(err);
    authMessage.textContent = 'Network error.';
  } finally {
    loginBtn.disabled = false;
  }
});

// ---------- Menu behaviour ----------

menuBtn.addEventListener('click', () => {
  if (!menuPanel) return;
  const isHidden = menuPanel.classList.contains('hidden');
  if (isHidden) {
    menuPanel.classList.remove('hidden');
  } else {
    menuPanel.classList.add('hidden');
  }
});

menuItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.getAttribute('data-target') || 'queue';
    setActiveSection(target);
    if (menuPanel) menuPanel.classList.add('hidden');
  });
});

// ---------- Pause queue ----------

pauseBtn.addEventListener('click', async () => {
  if (!authToken) return;
  const newPaused = !isPaused;

  try {
    const res = await fetch('/api/pause', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ paused: newPaused })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update pause state');
      return;
    }

    isPaused = !!data.paused;
    updatePauseUI();
    await loadQueue();
  } catch (err) {
    console.error(err);
    alert('Network error while updating pause state.');
  }
});

// ---------- Download QR ZIP ----------

downloadQrsBtnTools.addEventListener('click', async () => {
  await downloadQrs();
});

// ---------- Logout ----------

function performLogout(silent = false) {
  authToken = null;
  localStorage.removeItem(TOKEN_KEY);
  stopAutoRefresh();

  postAuthSection.classList.add('hidden');
  authSection.classList.remove('hidden');

  if (!silent) {
    authMessage.textContent = '';
    emailInput.value = '';
    passwordInput.value = '';
  }

  if (menuPanel) menuPanel.classList.add('hidden');
  menuBtn.classList.add('hidden');
}

logoutBtn.addEventListener('click', () => {
  performLogout(false);
});

// ---------- Load queue ----------

async function loadQueue() {
  if (!authToken) return;

  if (queueList) {
    queueList.innerHTML = '<li>Loading...</li>';
  }

  try {
    const res = await fetch('/api/queue', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!res.ok) {
      if (queueList) {
        queueList.innerHTML = `<li>Error: ${data.error || 'Failed to load'}</li>`;
      }
      return;
    }

    isPaused = !!data.paused;
    updatePauseUI();

    if (!queueList) return;
    queueList.innerHTML = '';

    if (!data.summons || data.summons.length === 0) {
      queueList.innerHTML = '<li>No active summons.</li>';
      return;
    }

    data.summons.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'queue-item';

      const label = document.createElement('span');
      label.textContent = `Table ${item.table_number}`;

      const btn = document.createElement('button');
      btn.textContent = 'Done';
      btn.addEventListener('click', () => clearTable(item.table_number));

      li.appendChild(label);
      li.appendChild(btn);

      queueList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    if (queueList) {
      queueList.innerHTML = '<li>Network error.</li>';
    }
  }
}

// ---------- Clear table ----------

async function clearTable(tableNumber) {
  if (!authToken) return;

  try {
    const res = await fetch('/api/queue/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`
      },
      body: JSON.stringify({ table_number: tableNumber })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to clear table');
      return;
    }
    await loadQueue();
  } catch (err) {
    console.error(err);
    alert('Network error.');
  }
}

// ---------- Download raw QR ZIP ----------

async function downloadQrs() {
  if (!authToken) {
    alert('Log in first.');
    return;
  }

  downloadQrsBtnTools.disabled = true;
  const originalText = downloadQrsBtnTools.textContent;
  downloadQrsBtnTools.textContent = 'Preparing...';

  try {
    const res = await fetch('/api/qrs/raw', {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    if (!res.ok) {
      const text = await res.text();
      alert('Failed to download QR codes: ' + text);
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Summon-QRs.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert('Network error while downloading QR codes.');
  } finally {
    downloadQrsBtnTools.disabled = false;
    downloadQrsBtnTools.textContent = originalText;
  }
}

// ---------- Account info ----------

async function loadAccountInfo() {
  if (!authToken) return;
  try {
    const res = await fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('Failed to load account info', data);
      return;
    }

    if (accountEmail) {
      accountEmail.textContent = data.email || '(unknown)';
    }

    if (accountSubscription) {
      accountSubscription.textContent =
        'Early access beta – subscription billing not active yet.';
    }
  } catch (err) {
    console.error('Account info error', err);
  }
}

// ---------- Boot ----------

initFromStorage();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch(err => console.error('SW registration failed', err));
  });
}
