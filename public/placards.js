// public/placards.js

console.log('placards.js loaded');

const zipInput = document.getElementById('placard-zip-file');
const headerInput = document.getElementById('placard-header');
const generateBatchBtn = document.getElementById('placard-generate-batch-btn');
const statusEl = document.getElementById('placard-status');
const canvas = document.getElementById('placard-canvas');
const ctx = canvas.getContext('2d');

// Helper: centered text
function drawCenteredText(text, y, fontSizePx, weight = 'normal') {
  ctx.font = `${weight} ${fontSizePx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, canvas.width / 2, y);
}

// Draw a single placard for one table, given a QR Image object
async function drawPlacardForTable(headerText, tableNumber, qrImage) {
  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header at top
  drawCenteredText(headerText, 200, 60, '600');

  // QR in the middle
  const qrSize = 900;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 450;
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  // Table number near bottom
  const label = `Table ${tableNumber}`;
  drawCenteredText(label, 1700, 36, '500');

  // Convert canvas to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create PNG blob.'));
      } else {
        resolve(blob);
      }
    }, 'image/png');
  });
}

async function generateBatchPlacards() {
  statusEl.textContent = '';

  const file = zipInput.files && zipInput.files[0];
  if (!file) {
    statusEl.textContent = 'Choose the QR ZIP file first.';
    return;
  }

  const headerText =
    headerInput.value.trim() || 'Scan to have a magician visit your table';

  generateBatchBtn.disabled = true;
  const originalLabel = generateBatchBtn.textContent;
  generateBatchBtn.textContent = 'Generating...';
  statusEl.textContent = 'Reading QR ZIP...';

  try {
    // 1) Load ZIP with JSZip
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 2) Collect entries that look like table-XX.png
    const qrEntries = [];
    zip.forEach((relativePath, entry) => {
      const match = relativePath.match(/table-(\d+)\.png$/i);
      if (match) {
        const tableNum = parseInt(match[1], 10);
        if (!isNaN(tableNum)) {
          qrEntries.push({ table: tableNum, entry });
        }
      }
    });

    if (qrEntries.length === 0) {
      statusEl.textContent = 'No QR files named like table-01.png found in ZIP.';
      generateBatchBtn.disabled = false;
      generateBatchBtn.textContent = originalLabel;
      return;
    }

    // Sort by table number
    qrEntries.sort((a, b) => a.table - b.table);

    statusEl.textContent = `Found ${qrEntries.length} QR images. Building placards...`;

    // 3) Create new ZIP for placards
    const outZip = new JSZip();

    // Process sequentially to keep memory under control
    for (let i = 0; i < qrEntries.length; i++) {
      const { table, entry } = qrEntries[i];
      statusEl.textContent = `Building placard for table ${table} (${i + 1}/${qrEntries.length})...`;

      // Load QR as an Image
      const qrBlob = await entry.async('blob');
      const qrUrl = URL.createObjectURL(qrBlob);
      const img = new Image();
      img.src = qrUrl;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });

      // Draw placard + get PNG blob
      const placardBlob = await drawPlacardForTable(headerText, table, img);

      URL.revokeObjectURL(qrUrl);

      // Add to new ZIP
      const outName = `placard-table-${String(table).padStart(2, '0')}.png`;
      outZip.file(outName, placardBlob);
    }

    statusEl.textContent = 'Packaging placards ZIP...';

    // 4) Generate final ZIP and trigger download
    const placardZipBlob = await outZip.generateAsync({ type: 'blob' });
    const downloadUrl = URL.createObjectURL(placardZipBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'summon-placards.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    statusEl.textContent = 'Placard ZIP downloaded.';
  } catch (err) {
    console.error('Placard batch error:', err);
    statusEl.textContent = 'Error generating placards. Check the ZIP format and try again.';
  } finally {
    generateBatchBtn.disabled = false;
    generateBatchBtn.textContent = originalLabel;
  }
}

generateBatchBtn.addEventListener('click', (e) => {
  e.preventDefault();
  generateBatchPlacards();
});
