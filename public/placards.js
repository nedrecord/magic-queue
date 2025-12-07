// public/placards.js
console.log('placards.js loaded');

const nameInput = document.getElementById('magician-name');
const tipLineInput = document.getElementById('tip-line');
const tableCountInput = document.getElementById('table-count');
const tipQrFileInput = document.getElementById('tip-qr-file');
const generateBtn = document.getElementById('generate-placards-btn');
const statusSpan = document.getElementById('status');

generateBtn.addEventListener('click', () => {
  generatePlacards();
});

function setStatus(msg) {
  statusSpan.textContent = msg || '';
}

function generatePlacards() {
  const tableCount = parseInt(tableCountInput.value, 10);
  if (!tableCount || tableCount < 1 || tableCount > 40) {
    alert('Table count must be between 1 and 40.');
    return;
  }

  const file = tipQrFileInput.files[0];
  if (!file) {
    alert('Please upload your tip QR image first.');
    return;
  }

  generateBtn.disabled = true;
  const originalText = generateBtn.textContent;
  generateBtn.textContent = 'Generating…';
  setStatus('Reading QR image…');

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      buildZipWithImage(img, tableCount, originalText);
    };
    img.onerror = () => {
      alert('Could not load QR image. Try a different file.');
      generateBtn.disabled = false;
      generateBtn.textContent = originalText;
      setStatus('');
    };
    img.src = reader.result;
  };
  reader.onerror = () => {
    alert('Could not read QR image file.');
    generateBtn.disabled = false;
    generateBtn.textContent = originalText;
    setStatus('');
  };
  reader.readAsDataURL(file);
}

function buildZipWithImage(tipQrImage, tableCount, originalText) {
  const jszip = new JSZip();
  const name = nameInput.value.trim();
  const tipLine = tipLineInput.value.trim() || 'Buy the magician a drink';

  // Canvas dimensions for each placard (pixels)
  const width = 900;
  const height = 600;

  setStatus('Generating placards…');

  for (let table = 1; table <= tableCount; table++) {
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
    ctx.font = 'bold 40px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scan to summon the magician', width / 2, 90);

    // Table number
    ctx.font = 'bold 54px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`Table ${table}`, width / 2, 160);

    // Optional name
    if (name) {
      ctx.font = '28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(name, width / 2, 210);
    }

    // Summon QR placeholder box
    const summonBoxX = 80;
    const summonBoxY = 250;
    const summonBoxSize = 220;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(summonBoxX, summonBoxY, summonBoxSize, summonBoxSize);

    ctx.font = '18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Place summon QR',
      summonBoxX + summonBoxSize / 2,
      summonBoxY + summonBoxSize / 2 - 10
    );
    ctx.fillText(
      'for this table here',
      summonBoxX + summonBoxSize / 2,
      summonBoxY + summonBoxSize / 2 + 15
    );

    // Tip QR image on the right
    const tipBoxSize = 220;
    const tipBoxX = width - 80 - tipBoxSize;
    const tipBoxY = 250;

    // Draw QR image scaled to fit in tip box
    const qrAspect = tipQrImage.width / tipQrImage.height;
    let drawWidth = tipBoxSize;
    let drawHeight = tipBoxSize;

    if (qrAspect > 1) {
      drawHeight = tipBoxSize / qrAspect;
    } else if (qrAspect < 1) {
      drawWidth = tipBoxSize * qrAspect;
    }

    const drawX = tipBoxX + (tipBoxSize - drawWidth) / 2;
    const drawY = tipBoxY + (tipBoxSize - drawHeight) / 2;

    ctx.drawImage(tipQrImage, drawX, drawY, drawWidth, drawHeight);

    // Tip text
    ctx.font = '22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tipLine, tipBoxX + tipBoxSize / 2, tipBoxY + tipBoxSize + 40);

    // Footer notice
    ctx.font = '16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Summon QR generated from your dashboard.',
      width / 2,
      height - 40
    );

    // Convert canvas to PNG data and add to ZIP
    const dataUrl = canvas.toDataURL('image/png');
    const base64Data = dataUrl.split(',')[1];

    const filename = `placard-table-${String(table).padStart(2, '0')}.png`;
    jszip.file(filename, base64Data, { base64: true });
  }

  setStatus('Creating ZIP…');

  jszip
    .generateAsync({ type: 'blob' })
    .then((zipBlob) => {
      saveAs(zipBlob, 'magic-queue-placards.zip');
      setStatus('Done. ZIP downloaded.');
    })
    .catch((err) => {
      console.error(err);
      alert('Failed to generate ZIP.');
      setStatus('');
    })
    .finally(() => {
      generateBtn.disabled = false;
      generateBtn.textContent = originalText;
    });
}
