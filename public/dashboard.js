// public/dashboard.js

console.log('dashboard.js loaded');

let authToken = null;
let autoRefreshInterval = null;
let isPaused = false;

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const registerBtn = document.getElementById('register-btn');
const loginBtn = document.getElementById('login-btn');
const authMessage = document.getElementById('auth-message');

const authSection = document.getElementById('auth-section');
const postAuthSection = document.getElementById('post-auth-section');

const navQueueBtn = document.getElementById('nav-queue-btn');
const navToolsBtn = document.getElementById('nav-tools-btn');

const queueSection = document.getElementById('queue-section');
const toolsSection = document.getElementById('tools-section');

const queueList = document.getElementById('queue-list');
const refreshBtn = document.getElementById('refresh-btn');

const downloadQrsBtnTools = document.getElementById('download-qrs-btn-tools');

const pauseBtn = document.getElementById('pause-btn');
const pauseStatus = document.getElementById('pause-status');

function showQueueView() {
  queueSection.classList.remove('hidden');
  toolsSection.classList.add('hidden');
}

function showToolsView() {
  toolsSection.classList.remove('hidden');
  queueSection.classList.add('hidden');
}

function startAutoRefresh() {
  if (autoRefreshInterval) return;
  autoRefreshInterval = setInterval(() => {
    if (authToken) {
      loadQueue();
    }
  }, 30000); // 30 seconds
}

function updatePauseUI() {
  if (!pauseBtn || !pauseStatus) return;
  if (isPaused) {
    pauseBtn.textContent = 'Resume queue';
    pauseStatus.textContent =
      'Queue is paused. Guests see a break message when they scan.';
  } else {
    pauseBtn.textContent = 'Pause queue';
    pauseStatus.textContent = 'Queue is live.';
  }
}

registerBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMessage.textContent = 'Enter email and password.';
    return;
  }

  registerBtn.disabled = true;
  loginBtn.disabled = true;
  authMessage.textContent = 'Registering...';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      authMessage.textContent = data.error || 'Registration failed.';
      return;
    }

    authToken = data.token;
    authMessage.textContent = 'Registered and logged in.';
    authSection.classList.add('hidden');
    postAuthSection.classList.remove('hidden');

    showQueueView();
    await loadQueue();
    startAutoRefresh();
  } catch (err) {
    console.error(err);
    authMessage.textContent = 'Network error.';
  } finally {
    registerBtn.disabled = false;
    loginBtn.disabled = false;
  }
});

loginBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    authMessage.textContent = 'Enter email and password.';
    return;
  }

  loginBtn.disabled = true;
  registerBtn.disabled = true;
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
    authMessage.textContent = 'Logged in.';
    authSection.classList.add('hidden');
    postAuthSection.classList.remove('hidden');

    showQueueView();
    await loadQueue();
    startAutoRefresh();
  } catch (err) {
    console.error(err);
    authMessage.textContent = 'Network error.';
  } finally {
    loginBtn.disabled = false;
    registerBtn.disabled = false;
  }
});

refreshBtn.addEventListener('click', async () => {
  await loadQueue();
});

navQueueBtn.addEventListener('click', () => {
  showQueueView();
});

navToolsBtn.addEventListener('click', () => {
  showToolsView();
});

// Pause / resume queue
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

// Download QR ZIP from tools page
downloadQrsBtnTools.addEventListener('click', async () => {
  await downloadQrs();
});

async function loadQueue() {
  if (!authToken) return;

  queueList.innerHTML = '<li>Loading...</li>';

  try {
    const res = await fetch('/api/queue', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (!res.ok) {
      queueList.innerHTML = `<li>Error: ${data.error || 'Failed to load'}</li>`;
      return;
    }

    isPaused = !!data.paused;
    updatePauseUI();

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
    queueList.innerHTML = '<li>Network error.</li>';
  }
}

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
    a.download = 'magic-queue-qrs.zip';
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
