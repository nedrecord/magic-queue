// public/placards.js

console.log('placards.js loaded');

const zipInput = document.getElementById('placard-zip-file');
const headerInput = document.getElementById('placard-header');
const generateBatchBtn = document.getElementById('placard-generate-batch-btn');
const statusEl = document.getElementById('placard-status');
const canvas = document.getElementById('placard-canvas');
const ctx = canvas.getContext('2d');

// Centered text helper
function drawCenteredText(text, y, fontSizePx, weight = 'normal') {
  ctx.font = `${weight} ${fontSizePx}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000000';
  ctx.fillText(text, canvas.width / 2, y);
}

// Draw a single placard (4x6 layout) for one table, given a loaded QR Image
async function drawPlacardForTable(headerText, tableNumber, qrImage) {
  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header at top
  drawCenteredText(headerText, 200, 60, '600');

  // Smaller QR centered in middle
  const qrSize = 650; // was 900
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 520;    // pushed slightly down
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  // Table number near bottom
  const label = `Table ${tableNumber}`;
  drawCenteredText(label, 1700, 36, '500');

  // Canvas to PNG blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob from canvas'));
        } else {
          resolve(blob);
        }
      },
      'image/png'
    );
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

  if (typeof JSZip === 'undefined') {
    statusEl.textContent = 'JSZip failed to load in this browser.';
    return;
  }

  generateBatchBtn.disabled = true;
  const originalLabel = generateBatchBtn.textContent;
  generateBatchBtn.textContent = 'Generating...';
  statusEl.textContent = 'Reading QR ZIP...';

  try {
    // 1) Load ZIP via JSZip
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // 2) Collect entries "table-XX.png" (any folder depth)
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
      statusEl.textContent = 'No files named like table-01.png found in ZIP.';
      generateBatchBtn.disabled = false;
      generateBatchBtn.textContent = originalLabel;
      return;
    }

    // Sort numerically
    qrEntries.sort((a, b) => a.table - b.table);

    statusEl.textContent = `Found ${qrEntries.length} QR codes. Building placards...`;

    // New ZIP for finished placards
    const outZip = new JSZip();

    // Sequential loop so memory doesn’t explode
    for (let i = 0; i < qrEntries.length; i++) {
      const { table, entry } = qrEntries[i];
      statusEl.textContent = `Building placard for table ${table} (${i + 1}/${qrEntries.length})...`;

      // Load QR as base64 -> Image
      const base64Data = await entry.async('base64');
      const img = new Image();
      img.src = 'data:image/png;base64,' + base64Data;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(new Error('Failed to load QR image for table ' + table));
      });

      // Draw placard & get PNG blob
      const placardBlob = await drawPlacardForTable(headerText, table, img);

      // Add to ZIP as placard-table-XX.png
      const outName = `placard-table-${String(table).padStart(2, '0')}.png`;
      outZip.file(outName, placardBlob);
    }

    statusEl.textContent = 'Packaging placards ZIP...';

    // 4) Generate final ZIP blob and trigger download
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
    statusEl.textContent =
      'Error generating placards: ' + (err && err.message ? err.message : 'Unknown error');
  } finally {
    generateBatchBtn.disabled = false;
    generateBatchBtn.textContent = originalLabel;
  }
}

generateBatchBtn.addEventListener('click', (e) => {
  e.preventDefault();
  generateBatchPlacards();
});
