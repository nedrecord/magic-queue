// public/placards.js

(function () {
  const TOKEN_KEY = 'magicQueueToken';

  let authToken = null;
  let magicianId = null;

  const headerInput = document.getElementById('placard-header');
  const generateBtn = document.getElementById('generate-placards-btn');
  const statusEl = document.getElementById('placard-status');
  const gridEl = document.getElementById('placard-grid');

  async function init() {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      statusEl.textContent = 'You must log in on the dashboard first.';
      if (generateBtn) generateBtn.disabled = true;
      return;
    }

    authToken = stored;

    // Ask backend who we are so we get the right magician ID
    try {
      const res = await fetch('/api/me', {
        headers: { Authorization: 'Bearer ' + authToken }
      });
      const data = await res.json();
      if (!res.ok) {
        statusEl.textContent = data.error || 'Failed to load magician info.';
        if (generateBtn) generateBtn.disabled = true;
        return;
      }

      magicianId = data.id;
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Network error while loading magician info.';
      if (generateBtn) generateBtn.disabled = true;
    }
  }

  async function handleGenerate() {
    if (!magicianId) {
      statusEl.textContent = 'Magician info not loaded. Refresh this page after logging in.';
      return;
    }

    const headerText =
      (headerInput.value && headerInput.value.trim()) ||
      'Scan to have a magician visit your table.';

    gridEl.innerHTML = '';
    statusEl.textContent = 'Generating cards...';
    generateBtn.disabled = true;

    const origin = window.location.origin;

    try {
      for (let table = 1; table <= 50; table++) {
        const card = document.createElement('div');
        card.className = 'placard-card';

        // Top: header text
        const header = document.createElement('div');
        header.className = 'placard-header-text';
        header.textContent = headerText;

        // Middle: QR
        const qrWrapper = document.createElement('div');
        qrWrapper.className = 'placard-qr-wrapper';

        const canvas = document.createElement('canvas');
        qrWrapper.appendChild(canvas);

        // Bottom: table label
        const tableLabel = document.createElement('div');
        tableLabel.className = 'placard-table-label';
        tableLabel.textContent = 'Table ' + table;

        card.appendChild(header);
        card.appendChild(qrWrapper);
        card.appendChild(tableLabel);

        gridEl.appendChild(card);

        const url = `${origin}/summon?m=${magicianId}&t=${table}`;

        // Render QR into the canvas
        await new Promise((resolve, reject) => {
          QRCode.toCanvas(
            canvas,
            url,
            { width: 180, margin: 1 },
            (err) => {
              if (err) {
                console.error('QR error for table', table, err);
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
      }

      statusEl.textContent =
        'Placards generated. Print this page to create 4"x6" cards.';
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error generating one or more QR codes.';
    } finally {
      generateBtn.disabled = false;
    }
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', () => {
      handleGenerate();
    });
  }

  init();
})();
