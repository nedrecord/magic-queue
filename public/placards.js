// public/placards.js
console.log('placards.js loaded');

const nameInput = document.getElementById('magician-name');
const tipLineInput = document.getElementById('tip-line');
const tableCountInput = document.getElementById('table-count');
const summonZipInput = document.getElementById('summon-zip-file');
const tipQrFileInput = document.getElementById('tip-qr-file');
const generateBtn = document.getElementById('generate-placards-btn');
const statusSpan = document.getElementById('status');

generateBtn.addEventListener('click', () => {
  generatePlacards();
});

function setStatus(msg) {
  statusSpan.textContent = msg || '';
}

// Helpers to wrap FileReader / Image in Promises
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function generatePlacards() {
  const tableCount = parseInt(tableCountInput.value, 10);
  if (!tableCount || tableCount < 1 || tableCount > 40) {
    alert('Table count must be between 1 and 40.');
    return;
  }

  const zipFile = summonZipInput.files[0];
  if (!zipFile) {
    alert('Please upload the summon QR ZIP (magic-queue-qrs.zip) from the dashboard.');
    return;
  }

  const tipFile = tipQrFileInput.files[0] || null;

  generateBtn.disabled = true;
  const originalText = generateBtn.textContent;
  generateBtn.textContent = 'Generating…';
  setStatus('Reading summon QR ZIP…');

  try {
    // Load summon QR ZIP
    const zipData = await readFileAsArrayBuffer(zipFile);
    const summonZip = await JSZip.loadAsync(zipData);

    setStatus('Preloading summon QR images…');

    // Preload summon QR images per table
    const summonImages = {};
    for (let table = 1; table <= tableCount; table++) {
      const filename = `table-${String(table).padStart(2, '0')}.png`;
      const file = summonZip.file(filename);
      if (!file) {
        console.warn(`Missing ${filename} in ZIP`);
        continue;
      }
      const base64 = await file.async('base64');
      const dataUrl = 'data:image/png;base64,' + base64;
      const img = await loadImageFromDataUrl(dataUrl);
      summonImages[table] = img;
    }

    // Load tip QR image if provided
    let tipQrImage = null;
    if (tipFile) {
      setStatus('Reading tip QR image…');
      const tipDataUrl = await readFileAsDataURL(tipFile);
      tipQrImage = await loadImageFromDataUrl(tipDataUrl);
    }

    // Build placard ZIP
    setStatus('Generating placards…');
    const placardZip = new JSZip();

    // Canvas dimensions approximating 4" x 6" at a reasonable resolution (portrait)
    const width = 1200;   // 4" * 300dpi-ish
    const height = 1800;  // 6" * 300dpi-ish

    const name = nameInput.value.trim();
    const tipLine = tipLineInput.value.trim();

    for (let table = 1; table <= tableCount; table++) {
      const summonImg = summonImages[table];
      if (!summonImg) {
        console.warn(`No summon QR for table ${table}, skipping placard.`);
        continue;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, width - 40, height - 40);

      // Header text
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';

      ctx.font = 'bold 48px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('Scan to summon the magician', width / 2, 140);

      // Optional name
      if (name) {
        ctx.font = '32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(name, width / 2, 200);
      }

      // Summon QR in center-ish
      const summonSize = 600;
      const summonX = (width - summonSize) / 2;
      const summonY = 260;

      ctx.drawImage(summonImg, summonX, summonY, summonSize, summonSize);

      // Tip QR and text (optional) below the summon QR
      if (tipQrImage && tipLine) {
        const tipSize = 280;
        const tipY = summonY + summonSize + 80;

        // Place tip QR centered
        const tipX = (width - tipSize) / 2;
        ctx.drawImage(tipQrImage, tipX, tipY, tipSize, tipSize);

        ctx.font = '28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.fillText(tipLine, width / 2, tipY + tipSize + 40);
      }

      // Footer: small table number at bottom
      ctx.font = '24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Table ${table}`, width / 2, height - 70);

      ctx.font = '18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText('Summon QR generated from your Magic Queue dashboard.', width / 2, height - 40);

      // Convert to PNG and add to ZIP
      const dataUrl = canvas.toDataURL('image/png');
      const base64Data = dataUrl.split(',')[1];
      const filename = `placard-table-${String(table).padStart(2, '0')}.png`;
      placardZip.file(filename, base64Data, { base64: true });
    }

    setStatus('Creating ZIP…');

    const zipBlob = await placardZip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, 'magic-queue-placards.zip');
    setStatus('Done. ZIP downloaded.');
  } catch (err) {
    console.error(err);
    alert('Failed to generate placards. Check the ZIP file and try again.');
    setStatus('');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = originalText;
  }
}
