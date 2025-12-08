// public/placards.js

console.log('placards.js loaded');

const TOKEN_KEY = 'magicQueueToken';

const headerInput = document.getElementById('placard-header');
const tableSelect = document.getElementById('placard-table');
const generateBtn = document.getElementById('placard-generate-btn');
const statusEl = document.getElementById('placard-status');
const canvas = document.getElementById('placard-canvas');
const ctx = canvas.getContext('2d');

// Build table dropdown 1–50
(function initTableOptions() {
  for (let i = 1; i <= 50; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Table ${i}`;
    tableSelect.appendChild(opt);
  }
})();

// Grab token from same storage as dashboard
function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    return null;
  }
  return token;
}

// Centered text helper
function drawCenteredText(text, y, fontSizePx, weight = 'normal') {
  ctx.font = `${weight} ${fontSizePx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, canvas.width / 2, y);
}

async function generatePlacard() {
  statusEl.textContent = '';
  const token = getToken();
  if (!token) {
    statusEl.textContent = 'Not logged in. Open the main app and log in first.';
    return;
  }

  const headerText = headerInput.value.trim() || 'Scan to have a magician visit your table';
  const table = parseInt(tableSelect.value, 10) || 1;

  generateBtn.disabled = true;
  const originalLabel = generateBtn.textContent;
  generateBtn.textContent = 'Generating...';
  statusEl.textContent = '';

  try {
    // 1) Fetch QR PNG for this table
    const res = await fetch(`/api/qrs/table/${table}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`QR fetch failed: ${txt}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    // 2) Load QR image
    const img = new Image();
    img.src = url;

    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
    });

    // 3) Draw card: 1200 x 1800 (rough 4x6 portrait)
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header text at top, centered
    drawCenteredText(headerText, 200, 60, '600');

    // QR in the middle
    const qrSize = 900; // large and clean
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 450;
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

    // Table number small at bottom center
    const tableLabel = `Table ${table}`;
    drawCenteredText(tableLabel, 1700, 36, '500');

    URL.revokeObjectURL(url);

    // 4) Download PNG
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `placard-table-${String(table).padStart(2, '0')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    statusEl.textContent = `Placard downloaded for Table ${table}.`;
  } catch (err) {
    console.error('Placard generation error:', err);
    statusEl.textContent = 'Error generating placard. Try again.';
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = originalLabel;
  }
}

generateBtn.addEventListener('click', (e) => {
  e.preventDefault();
  generatePlacard();
});
