const fileInput = document.getElementById("fileInput");
const clearBtn = document.getElementById("clearBtn");
const convertBtn = document.getElementById("convertBtn");
const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");

const pageSizeEl = document.getElementById("pageSize");
const orientationEl = document.getElementById("orientation");
const fitEl = document.getElementById("fit");
const marginEl = document.getElementById("margin");
const qualityEl = document.getElementById("quality");
const qualityLabel = document.getElementById("qualityLabel");
const autoRotateEl = document.getElementById("autoRotate");

qualityEl.addEventListener("input", () => (qualityLabel.textContent = qualityEl.value));

/** @type {{id:string,file:File,url:string,width?:number,height?:number}[]} */
let items = [];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function enableActions() {
  const has = items.length > 0;
  clearBtn.disabled = !has;
  convertBtn.disabled = !has;
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function render() {
  listEl.innerHTML = "";
  items.forEach((it, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.gridColumn = "span 6";

    card.innerHTML = `
      <h2 style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 10px">
        <span>Page ${idx + 1}</span>
        <span class="pill">${formatBytes(it.file.size)}</span>
      </h2>
      <div style="border:1px solid var(--line); border-radius:14px; overflow:hidden; background:rgba(255,255,255,.02)">
        <img src="${it.url}" alt="preview" style="width:100%; height:220px; object-fit:contain; display:block" />
      </div>
      <div class="row" style="margin-top:12px">
        <button class="btn" data-act="up" ${idx === 0 ? "disabled" : ""}>↑</button>
        <button class="btn" data-act="down" ${idx === items.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn" data-act="remove">Remove</button>
      </div>
      <div class="small" style="margin-top:10px; color:var(--muted)">${it.file.name}</div>
    `;

    card.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "remove") {
        URL.revokeObjectURL(it.url);
        items = items.filter((x) => x.id !== it.id);
      } else if (act === "up" && idx > 0) {
        const tmp = items[idx - 1];
        items[idx - 1] = items[idx];
        items[idx] = tmp;
      } else if (act === "down" && idx < items.length - 1) {
        const tmp = items[idx + 1];
        items[idx + 1] = items[idx];
        items[idx] = tmp;
      }
      render();
      enableActions();
      setStatus(items.length ? `${items.length} image(s) ready.` : "Add images to start.");
    });

    listEl.appendChild(card);
  });

  enableActions();
}

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  if (!files.length) return;

  // add in selection order
  for (const f of files) {
    const url = URL.createObjectURL(f);
    items.push({ id: uid(), file: f, url });
  }

  render();
  setStatus(`${items.length} image(s) ready.`);
  fileInput.value = "";
});

clearBtn.addEventListener("click", () => {
  for (const it of items) URL.revokeObjectURL(it.url);
  items = [];
  render();
  setStatus("Cleared. Add images to start.");
});

function loadImageFromBlobURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function drawToCanvas(img, targetW, targetH, mode) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(targetW));
  canvas.height = Math.max(1, Math.floor(targetH));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // contain/cover
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const sx = 0, sy = 0, sw = iw, sh = ih;

  // calculate scale
  const scaleContain = Math.min(targetW / iw, targetH / ih);
  const scaleCover = Math.max(targetW / iw, targetH / ih);
  const scale = mode === "cover" ? scaleCover : scaleContain;

  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (targetW - dw) / 2;
  const dy = (targetH - dh) / 2;

  // white background not needed; keep transparent
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);

  return canvas;
}

function mmToPt(mm) {
  // 1 inch = 25.4 mm, 1 pt = 1/72 inch
  return (mm / 25.4) * 72;
}

function getPageDims(size, orientation) {
  // in mm
  let w, h;
  if (size === "letter") {
    w = 215.9; h = 279.4;
  } else {
    w = 210; h = 297; // a4
  }
  if (orientation === "landscape") [w, h] = [h, w];
  return { w, h };
}

convertBtn.addEventListener("click", async () => {
  if (!items.length) return;

  convertBtn.disabled = true;
  clearBtn.disabled = true;
  fileInput.disabled = true;

  try {
    const { jsPDF } = window.jspdf;
    const pageSize = pageSizeEl.value;
    const orientation = orientationEl.value;
    const fitMode = fitEl.value; // contain / cover
    const marginMm = Math.max(0, Math.min(30, Number(marginEl.value || 0)));
    const quality = Math.max(0.5, Math.min(0.95, Number(qualityEl.value) / 100));
    const autoRotate = !!autoRotateEl.checked;

    const baseDims = getPageDims(pageSize, orientation);
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format: pageSize,
      compress: true,
    });

    const pageW = baseDims.w;
    const pageH = baseDims.h;
    const contentW = pageW - marginMm * 2;
    const contentH = pageH - marginMm * 2;

    for (let i = 0; i < items.length; i++) {
      setStatus(`Converting ${i + 1} / ${items.length}...`);

      const it = items[i];
      const img = await loadImageFromBlobURL(it.url);

      // auto-rotate per image based on aspect ratio (optional)
      let drawW = contentW;
      let drawH = contentH;

      // If autoRotate: swap orientation for this page if image is landscape vs portrait mismatch
      // We'll handle by rotating the canvas content via jsPDF rotation
      // Simpler: if mismatch is big, rotate 90 degrees
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const imgLandscape = iw >= ih;
      const pageLandscape = contentW >= contentH;

      const shouldRotate90 = autoRotate && (imgLandscape !== pageLandscape);

      // Create a canvas that matches content box in pixels (scaled)
      // Use a reasonable multiplier to keep memory low
      const scalePx = 4; // ~ (mm -> px) multiplier-ish
      const targetPxW = Math.floor(drawW * scalePx * 10);
      const targetPxH = Math.floor(drawH * scalePx * 10);

      // If rotating, swap target canvas dims for drawing image
      const canvas = drawToCanvas(
        img,
        shouldRotate90 ? targetPxH : targetPxW,
        shouldRotate90 ? targetPxW : targetPxH,
        fitMode
      );

      const dataUrl = canvas.toDataURL("image/jpeg", quality);

      if (i > 0) pdf.addPage(pageSize, orientation);

      if (shouldRotate90) {
        // Place rotated: use jsPDF's rotate around top-left, then translate
        // We'll draw into a landscape/portrait content box by rotating the image.
        // Rotation is applied in degrees at a given point.
        // Strategy:
        // 1) translate to where we want the image after rotation
        // 2) rotate 90
        // 3) draw with swapped dims
        pdf.saveGraphicsState();
        // rotate around top-left corner of content area
        pdf.rotate(90, { origin: [marginMm, marginMm] });
        // after 90deg rotation, x/y axes swap; draw at (margin, -margin - contentW)
        pdf.addImage(
          dataUrl,
          "JPEG",
          marginMm,
          -marginMm - contentW,
          contentH,
          contentW
        );
        pdf.restoreGraphicsState();
      } else {
        pdf.addImage(dataUrl, "JPEG", marginMm, marginMm, contentW, contentH);
      }
    }

    setStatus("Generating file...");
    pdf.save(`images-to-pdf-${Date.now()}.pdf`);
    setStatus("Done! Download should start.");
  } catch (err) {
    console.error(err);
    setStatus("Error: conversion failed. Try fewer/smaller images or lower quality.");
    alert("Conversion failed. Try fewer/smaller images or lower quality.");
  } finally {
    convertBtn.disabled = items.length === 0;
    clearBtn.disabled = items.length === 0;
    fileInput.disabled = false;
  }
});

enableActions();
