console.log("placards.js loaded");

const fileInput = document.getElementById("qr-zip");
const headerInput = document.getElementById("header-text");
const generateBtn = document.getElementById("generate-placards-btn");
const statusEl = document.getElementById("placard-status");

// Main handler --------------------------------------------------

generateBtn.addEventListener("click", async () => {
  statusEl.textContent = "";

  if (!fileInput.files || fileInput.files.length === 0) {
    statusEl.textContent = "Choose a QR ZIP file first.";
    return;
  }

  const zipFile = fileInput.files[0];

  try {
    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(zipFile);

    // Extract QR PNGs
    const qrMap = {};

    for (const filename of Object.keys(loadedZip.files)) {
      if (filename.toLowerCase().endsWith(".png")) {
        const match = filename.match(/table-(\d+)\.png/i);
        if (!match) continue;

        const tableNum = parseInt(match[1], 10);
        qrMap[tableNum] = await loadedZip.file(filename).async("base64");
      }
    }

    if (Object.keys(qrMap).length === 0) {
      statusEl.textContent = "No valid QR PNGs found in the ZIP.";
      return;
    }

    const headerText = headerInput.value.trim() || 
      "Scan to have a magician visit your table";

    const outZip = new JSZip();

    // Create each placard using a simple white background and centered QR
    for (let table = 1; table <= 50; table++) {
      if (!qrMap[table]) continue;

      const base64QR = qrMap[table];
      const pngData = await createPlacardPNG(table, headerText, base64QR);

      outZip.file(`table-${String(table).padStart(2, "0")}.png`, pngData, {
        base64: true
      });
    }

    const blob = await outZip.generateAsync({ type: "blob" });

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Summon-Placards.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();

    statusEl.textContent = "Placards generated!";
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error generating placards.";
  }
});

// Canvas renderer --------------------------------------------------

async function createPlacardPNG(tableNum, headerText, qrBase64) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;   // Print resolution base
  canvas.height = 1800;

  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header text
  ctx.fillStyle = "#000000";
  ctx.font = "bold 64px serif";
  ctx.textAlign = "center";
  ctx.fillText(headerText, canvas.width / 2, 200);

  // QR Image
  const qrImg = new Image();
  qrImg.src = "data:image/png;base64," + qrBase64;

  await qrImg.decode();

  const qrSize = 700;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = 350;

  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // Table label
  ctx.font = "48px serif";
  ctx.fillText(`Table ${tableNum}`, canvas.width / 2, 1200);

  return canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
}
