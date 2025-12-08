// public/placards.js

console.log('placards.js loaded');

const fileInput = document.getElementById('qr-zip-file');
const headerInput = document.getElementById('placard-header');
const styleSelect = document.getElementById('template-style');
const generateBtn = document.getElementById('generate-placards-btn');
const statusEl = document.getElementById('placard-status');

function setStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg || '';
}

function getSelectedStyle() {
  // Fallback to classic if the select doesn't exist for any reason
  if (!styleSelect) return 'classic';
  return styleSelect.value || 'classic';
}

generateBtn.addEventListener('click', async () => {
  const file = fileInput.files[0];
  if (!file) {
    alert('Choose a QR ZIP file first.');
    return;
  }

  setStatus('Generating placards...');
  generateBtn.disabled = true;

  try {
    await generatePlacardsFromZip(file);
    setStatus('Placards generated. Your ZIP should start downloading.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Error generating placards.');
    setStatus('Error generating placards. Check the ZIP format and try again.');
  } finally {
    generateBtn.disabled = false;
  }
});

async function generatePlacardsFromZip(file) {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip failed to load in this browser.');
  }

  const jszip = new JSZip();
  const zip = await jszip.loadAsync(file);

  const outZip = new JSZip();
  const headerText =
    (headerInput.value || 'Scan to have a magician visit your table').trim();

  const style = getSelectedStyle();

  const fileNames = Object.keys(zip.files).filter((name) =>
    /table-\d+\.png$/i.test(name)
  );

  if (!fileNames.length) {
    throw new Error(
      'No QR images found. Expected files named like table-01.png, table-02.png, etc.'
    );
  }

  // Keep stable order: table-01, table-02, ...
  fileNames.sort((a, b) => {
    const ma = a.match(/table-(\d+)\.png/i);
    const mb = b.match(/table-(\d+)\.png/i);
    const na = ma ? parseInt(ma[1], 10) : 0;
    const nb = mb ? parseInt(mb[1], 10) : 0;
    return na - nb;
  });

  for (const name of fileNames) {
    const m = name.match(/table-(\d+)\.png$/i);
    if (!m) continue;
    const tableNum = parseInt(m[1], 10);

    const qrBlob = await zip.files[name].async('blob');
    const qrImg = await loadImageFromBlob(qrBlob);

    const placardBlob = await renderPlacardPng({
      qrImg,
      tableNum,
      headerText,
      style
    });

    const outName = `placard-table-${String(tableNum).padStart(2, '0')}.png`;
    outZip.file(outName, placardBlob);
  }

  const finalBlob = await outZip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(finalBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Summon-Placards.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err || new Error('Failed to load QR image.'));
    };
    img.src = url;
  });
}

// ---- Canvas rendering with style variations ----

async function renderPlacardPng({ qrImg, tableNum, headerText, style }) {
  // 4x6 aspect at decent print resolution
  const width = 1200;  // 6"
  const height = 1800; // 9" (a little taller, still works fine on 4x6 when scaled)
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Base background: white for printing
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Shared layout coordinates
  const headerY = 150;
  const qrSize = 650; // QR size; trimmed smaller than before
  const qrY = (height - qrSize) / 2;
  const tableY = height - 220;

  // Draw different looks
  switch (style) {
    case 'border':
      drawBorderStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY);
      break;
    case 'formal':
      drawFormalStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY);
      break;
    case 'minimal':
      drawMinimalStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY);
      break;
    case 'classic':
    default:
      drawClassicStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY);
      break;
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

// --- individual template drawers ---

function drawClassicStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY) {
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // Header
  ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(headerText, width / 2, headerY);

  // QR
  const qrX = (width - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Table label
  ctx.font = '48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Table ${tableNum}`, width / 2, tableY);
}

function drawBorderStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY) {
  // Light grey border
  ctx.strokeStyle = '#bbbbbb';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, width - 80, height - 80);

  // Divider line above table text
  ctx.beginPath();
  ctx.moveTo(120, tableY - 40);
  ctx.lineTo(width - 120, tableY - 40);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // Header
  ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(headerText, width / 2, headerY);

  // QR
  const qrX = (width - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Table label
  ctx.font = '48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Table ${tableNum}`, width / 2, tableY);
}

function drawFormalStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY) {
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // Header in a more "formal" serif style
  ctx.font = 'italic 70px "Georgia", "Times New Roman", serif';
  ctx.fillText(headerText, width / 2, headerY);

  // Simple flourish under header (black, printable)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const fx = width / 2;
  const fy = headerY + 60;
  ctx.moveTo(fx - 180, fy);
  ctx.quadraticCurveTo(fx - 90, fy + 20, fx, fy);
  ctx.quadraticCurveTo(fx + 90, fy - 20, fx + 180, fy);
  ctx.stroke();

  // QR
  const qrX = (width - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Table label
  ctx.font = '48px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Table ${tableNum}`, width / 2, tableY);
}

function drawMinimalStyle(ctx, width, height, headerText, headerY, qrImg, qrSize, qrY, tableNum, tableY) {
  // No borders, very plain
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // Header smaller and lighter
  ctx.font = '600 60px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(headerText, width / 2, headerY + 20);

  // QR slightly lower
  const qrX = (width - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, qrY + 40, qrSize, qrSize);

  // Table label small
  ctx.font = '42px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Table ${tableNum}`, width / 2, tableY + 10);
}
