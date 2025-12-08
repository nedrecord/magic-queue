// public/placards.js

(function () {
  const zipInput = document.getElementById('zip-input');
  const headerInput = document.getElementById('placard-header');
  const generateBtn = document.getElementById('generate-placards-btn');
  const statusEl = document.getElementById('placard-status');
  const gridEl = document.getElementById('placard-grid');

  async function handleGenerate() {
    const file = zipInput.files && zipInput.files[0];
    if (!file) {
      statusEl.textContent = 'Select the QR ZIP file first.';
      return;
    }

    const headerText =
      (headerInput.value && headerInput.value.trim()) ||
      'Scan to have a magician visit your table.';

    statusEl.textContent = 'Reading ZIP...';
    gridEl.innerHTML = '';
    generateBtn.disabled = true;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);

      // We expect files named table-01.png, table-02.png, ... table-50.png
      const cards = [];

      for (let table = 1; table <= 50; table++) {
        const filename = `table-${String(table).padStart(2, '0')}.png`;
        const entry = zip.file(filename);

        if (!entry) {
          console.warn('Missing file in ZIP:', filename);
          // We’ll create a blank card with no QR but keep the slot
        }

        cards.push({ table, entry });
      }

      statusEl.textContent = 'Generating cards...';

      for (const cardInfo of cards) {
        const { table, entry } = cardInfo;

        const card = document.createElement('div');
        card.className = 'placard-card';

        // Header text at top
        const header = document.createElement('div');
        header.className = 'placard-header-text';
        header.textContent = headerText;

        // Middle: QR image (if present)
        const qrWrapper = document.createElement('div');
        qrWrapper.className = 'placard-qr-wrapper';

        if (entry) {
          const blob = await entry.async('blob');
          const url = URL.createObjectURL(blob);

          const img = document.createElement('img');
          img.className = 'placard-qr-img';
          img.alt = `QR for table ${table}`;
          img.src = url;

          qrWrapper.appendChild(img);
        } else {
          const missing = document.createElement('div');
          missing.textContent = 'QR missing';
          missing.style.fontSize = '0.8rem';
          qrWrapper.appendChild(missing);
        }

        // Bottom: table number
        const tableLabel = document.createElement('div');
        tableLabel.className = 'placard-table-label';
        tableLabel.textContent = 'Table ' + table;

        card.appendChild(header);
        card.appendChild(qrWrapper);
        card.appendChild(tableLabel);

        gridEl.appendChild(card);
      }

      statusEl.textContent =
        'Placards generated. Print this page (or save as PDF) on 4"x6" card stock.';
    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error reading ZIP or generating cards.';
    } finally {
      generateBtn.disabled = false;
    }
  }

  if (generateBtn) {
    generateBtn.addEventListener('click', handleGenerate);
  }
})();
