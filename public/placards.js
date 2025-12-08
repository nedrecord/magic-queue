let qrImages = {};

document.getElementById('qr-zip-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  qrImages = {};
  const zip = new JSZip();
  const contents = await zip.loadAsync(file);

  const entries = Object.keys(contents.files);

  for (const name of entries) {
    if (name.endsWith('.png')) {
      const blob = await contents.files[name].async('blob');
      qrImages[name] = URL.createObjectURL(blob);
    }
  }

  alert('QR images loaded. Ready to generate placards.');
});

document.getElementById('generate-placards-btn').addEventListener('click', async () => {
  if (Object.keys(qrImages).length === 0) {
    alert('Upload QR ZIP first.');
    return;
  }

  const header = document.getElementById('header-text').value.trim() || '';

  for (let table = 1; table <= 50; table++) {
    const key = `table-${String(table).padStart(2, '0')}.png`;
    const qrUrl = qrImages[key];
    if (!qrUrl) continue;

    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 48px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(header, canvas.width / 2, 120);

    // QR image
    const img = new Image();
    img.src = qrUrl;

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    const qrSize = 500;
    ctx.drawImage(
      img,
      (canvas.width - qrSize) / 2,
      250,
      qrSize,
      qrSize
    );

    // Table number
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 40px system-ui';
    ctx.fillText(`Table ${table}`, canvas.width / 2, 1250);

    // Download PNG
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `placard-${table}.png`;
    a.click();
  }

  alert('All placards generated.');
});
