// public/placards.js
console.log("placards.js loaded");

document.getElementById("generate-placards-btn").addEventListener("click", async () => {
  const zipFile = document.getElementById("qr-zip").files[0];
  const headerText = document.getElementById("header-text").value.trim() || "Scan to have a magician visit your table";
  const status = document.getElementById("placard-status");

  if (!zipFile) {
    status.textContent = "Choose a QR ZIP file first.";
    return;
  }

  status.textContent = "Generating...";

  try {
    const jszip = new JSZip();
    const loadedZip = await jszip.loadAsync(zipFile);

    const outZip = new JSZip();

    for (const fileName of Object.keys(loadedZip.files)) {
      if (!fileName.endsWith(".png")) continue;

      const tableMatch = fileName.match(/table-(\d+)\.png/i);
      if (!tableMatch) continue;

      const tableNum = parseInt(tableMatch[1], 10);
      const qrPng = await loadedZip.files[fileName].async("blob");

      const placardBlob = await generatePlacard(qrPng, tableNum, headerText);
      outZip.file(`placard-${tableNum}.png`, placardBlob);
    }

    const finalZipBlob = await outZip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(finalZipBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "Summon-Placards.zip";
    a.click();
    URL.revokeObjectURL(url);

    status.textContent = "Placards generated!";
  } catch (err) {
    console.error(err);
    status.textContent = "Error generating placards.";
  }
});

async function generatePlacard(qrBlob, tableNum, headerText) {
  return new Promise(resolve => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1800;

    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load QR
    const qrImg = new Image();
    qrImg.onload = () => {

      // ---- EXACT YESTERDAY LAYOUT (A) ----
      // Header font slightly larger, positioned exactly like screenshot
      ctx.fillStyle = "#000000";
      ctx.font = "bold 80px Helvetica";
      ctx.textAlign = "center";

      // Header ~200 px from top (visually matching your screenshot)
      ctx.fillText(headerText, 600, 220);

      // QR code ~600px wide (visually matches yesterday)
      const qrSize = 600;
      const qrX = (1200 - qrSize) / 2;
      const qrY = 450; // matches the screenshot proportions

      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // Table number small at the bottom center (unchanged from yesterday)
      ctx.font = "bold 50px Helvetica";
      ctx.fillText(`Table ${tableNum}`, 600, 1700);

      canvas.toBlob(blob => resolve(blob), "image/png");
    };

    qrImg.src = URL.createObjectURL(qrBlob);
  });
}
