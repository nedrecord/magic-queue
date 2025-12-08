// public/placards.js
console.log("placards.js loaded");

document.getElementById("generate-placards-btn").addEventListener("click", async () => {
  const zipFile = document.getElementById("qr-zip").files[0];
  const headerInput = document.getElementById("header-text");
  const status = document.getElementById("placard-status");

  const headerText =
    (headerInput.value || "").trim() ||
    "Scan to have a magician visit your table";

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
      if (!fileName.toLowerCase().endsWith(".png")) continue;

      const match = fileName.match(/table-(\d+)\.png/i);
      if (!match) continue;

      const tableNum = parseInt(match[1], 10);
      const qrPngBlob = await loadedZip.files[fileName].async("blob");

      const placardBlob = await generatePlacard(qrPngBlob, tableNum, headerText);
      outZip.file(`placard-${tableNum}.png`, placardBlob);
    }

    const finalZipBlob = await outZip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(finalZipBlob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "Summon-Placards.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    status.textContent = "Placards generated.";
  } catch (err) {
    console.error(err);
    status.textContent = "Error generating placards.";
  }
});

/**
 * Word-wrap helper for canvas.
 * Returns an array of lines that fit within maxWidth.
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const testLine = currentLine ? currentLine + " " + word : word;
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function generatePlacard(qrBlob, tableNum, headerText) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1800;
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const qrImg = new Image();
    qrImg.onload = () => {
      // ---- HEADER (wrapped, centered) ----
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";

      const headerFontSize = 88;
      ctx.font = `bold ${headerFontSize}px Helvetica`;

      const maxHeaderWidth = 800;
      const headerLines = wrapText(ctx, headerText, maxHeaderWidth);
      const lineHeight = headerFontSize * 1.2;

      // More top margin: move header block down a bit
      const targetCenterY = 260; // was 220
      const totalHeight = (headerLines.length - 1) * lineHeight;
      const firstLineY = targetCenterY - totalHeight / 2;

      headerLines.forEach((line, idx) => {
        const y = firstLineY + idx * lineHeight;
        ctx.fillText(line, canvas.width / 2, y);
      });

      // ---- QR CODE (centered, moved down) ----
      const qrSize = 520;
      const qrX = (canvas.width - qrSize) / 2;
      const qrY = 700; // was 430 – more space under header, less huge gap above table text
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      // ---- TABLE LABEL (smaller, moved up) ----
      ctx.font = "bold 30px Helvetica"; // was 50px
      const tableY = 1700;              // was 1700
      ctx.fillText(`Table ${tableNum}`, canvas.width / 2, tableY);

      canvas.toBlob((blob) => resolve(blob), "image/png");
    };

    qrImg.src = URL.createObjectURL(qrBlob);
  });
}
