// public/dashboard.js

console.log('dashboard.js loaded');

let authToken = null;
let autoRefreshInterval = null;

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const registerBtn = document.getElementById('register-btn');
const loginBtn = document.getElementById('login-btn');
const authMessage = document.getElementById('auth-message');

const authSection = document.getElementById('auth-section');
const queueSection = document.getElementById('queue-section');
const queueList = document.getElementById('queue-list');
const refreshBtn = document.getElementById('refresh-btn');
const downloadQrsBtn = document.getElementById('download-qrs-btn');
const autoRefreshCheckbox = document.getElementById('auto-refresh-checkbox');

function startAutoRefresh() {
  stopAutoRefresh();
  if (!authToken) return;
  if (!autoRefreshCheckbox.checked) return;

  autoRefreshInterval = setInterval(() => {
    loadQueue();
  }, 5000); // 5 seconds
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
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
    queueSection.classList.remove('hidden');

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
    queueSection.classList.remove('hidden');

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

// Toggle auto refresh on checkbox change
autoRefreshCheckbox.addEventListener('change', () => {
  if (autoRefreshCheckbox.checked) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
});

// Download QR ZIP
downloadQrsBtn.addEventListener('click', async () => {
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

  downloadQrsBtn.disabled = true;
  const originalText = downloadQrsBtn.textContent;
  downloadQrsBtn.textContent = 'Preparing...';

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
    downloadQrsBtn.disabled = false;
    downloadQrsBtn.textContent = originalText;
  }
}
