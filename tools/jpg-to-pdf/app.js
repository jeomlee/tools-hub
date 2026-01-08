/* global PDFLib */
(() => {
  const $files = document.getElementById('files');
  const $make = document.getElementById('make');
  const $clear = document.getElementById('clear');
  const $status = document.getElementById('status');
  const $result = document.getElementById('result');
  const $listWrap = document.getElementById('listWrap');
  const $list = document.getElementById('list');

  const $pageSize = document.getElementById('pageSize');
  const $fit = document.getElementById('fit');
  const $margin = document.getElementById('margin');
  const $downscale = document.getElementById('downscale');

  /** @type {{id:string,file:File, url:string}[]} */
  let items = [];

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function setStatus(msg) { $status.textContent = msg || ''; }
  function setResult(html) { $result.innerHTML = html || ''; }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function enableUI() {
    const has = items.length > 0;
    $make.disabled = !has;
    $clear.disabled = !has;
    $listWrap.style.display = has ? 'block' : 'none';
  }

  function cleanupUrls() {
    for (const it of items) URL.revokeObjectURL(it.url);
  }

  function reset() {
    cleanupUrls();
    items = [];
    $files.value = '';
    $list.innerHTML = '';
    setStatus('');
    setResult('');
    enableUI();
  }

  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function getPageBox(mode, imgW, imgH) {
    // points (1pt = 1/72 inch)
    if (mode === 'letter') return { w: 612, h: 792 };
    if (mode === 'a4') return { w: 595.28, h: 841.89 };
    // auto: map px -> pt by assuming 96dpi => pt = px * 72/96 = px*0.75
    const scale = 0.75;
    return { w: Math.max(72, imgW * scale), h: Math.max(72, imgH * scale) };
  }

  function fitRect(imgW, imgH, boxW, boxH, mode) {
    const imgRatio = imgW / imgH;
    const boxRatio = boxW / boxH;

    let w, h;
    if (mode === 'cover') {
      // fill box
      if (imgRatio > boxRatio) {
        h = boxH;
        w = h * imgRatio;
      } else {
        w = boxW;
        h = w / imgRatio;
      }
    } else {
      // contain
      if (imgRatio > boxRatio) {
        w = boxW;
        h = w / imgRatio;
      } else {
        h = boxH;
        w = h * imgRatio;
      }
    }
    const x = (boxW - w) / 2;
    const y = (boxH - h) / 2;
    return { x, y, w, h };
  }

  async function loadImageDims(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight, img };
    } finally {
      // caller can reuse object url separately; this one is temp
      URL.revokeObjectURL(url);
    }
  }

  async function maybeDownscaleToBytes(file, maxSide = 2000) {
    // Downscale big images to reduce memory / "Conversion failed"
    // Returns { bytes: Uint8Array, mime: string, w: number, h: number }
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';

    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();

      let w = img.naturalWidth;
      let h = img.naturalHeight;

      const max = Math.max(w, h);
      if (!$downscale?.checked || max <= maxSide) {
        // no downscale: return original bytes
        const ab = await file.arrayBuffer();
        return { bytes: new Uint8Array(ab), mime, w, h };
      }

      const ratio = maxSide / max;
      const tw = Math.round(w * ratio);
      const th = Math.round(h * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, tw, th);

      const outBlob = await new Promise((resolve) => {
        if (mime === 'image/png') {
          canvas.toBlob(resolve, 'image/png');
        } else {
          canvas.toBlob(resolve, 'image/jpeg', 0.9);
        }
      });

      if (!outBlob) {
        const ab = await file.arrayBuffer();
        return { bytes: new Uint8Array(ab), mime, w, h };
      }

      const outAb = await outBlob.arrayBuffer();
      return { bytes: new Uint8Array(outAb), mime, w: tw, h: th };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function renderList() {
    $list.innerHTML = '';

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.gap = '10px';
      row.style.alignItems = 'center';
      row.style.margin = '10px 0';
      row.style.flexWrap = 'wrap';
      row.draggable = true;
      row.dataset.id = it.id;

      const thumb = document.createElement('img');
      thumb.src = it.url;
      thumb.alt = it.file.name;
      thumb.style.width = '64px';
      thumb.style.height = '64px';
      thumb.style.objectFit = 'cover';
      thumb.style.borderRadius = '10px';
      thumb.style.border = '1px solid rgba(255,255,255,.12)';

      const name = document.createElement('div');
      name.className = 'small';
      name.style.flex = '1';
      name.style.minWidth = '220px';
      name.innerHTML = `<b>${idx + 1}.</b> ${esc(it.file.name)}`;

      const remove = document.createElement('button');
      remove.className = 'btn';
      remove.textContent = 'Remove';
      remove.onclick = () => {
        URL.revokeObjectURL(it.url);
        items = items.filter(x => x.id !== it.id);
        renderList();
        enableUI();
        setStatus(items.length ? `Selected ${items.length} image(s).` : '');
      };

      // drag reorder
      row.addEventListener('dragstart', (e) => {
        row.style.opacity = '0.6';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', it.id);
      });
      row.addEventListener('dragend', () => { row.style.opacity = '1'; });
      row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromId = e.dataTransfer.getData('text/plain');
        const toId = it.id;
        if (!fromId || fromId === toId) return;

        const fromIdx = items.findIndex(x => x.id === fromId);
        const toIdx = items.findIndex(x => x.id === toId);
        if (fromIdx < 0 || toIdx < 0) return;

        const [moved] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, moved);
        renderList();
      });

      row.appendChild(thumb);
      row.appendChild(name);
      row.appendChild(remove);
      $list.appendChild(row);
    });
  }

  $files.addEventListener('change', () => {
    const selected = Array.from($files.files || []);
    if (!selected.length) return;

    const next = selected.map(file => ({ id: uid(), file, url: URL.createObjectURL(file) }));
    items = items.concat(next);

    setStatus(`Selected ${items.length} image(s). Drag to reorder.`);
    setResult('');
    enableUI();
    renderList();

    // allow selecting same files again
    $files.value = '';
  });

  $clear.addEventListener('click', reset);

  $make.addEventListener('click', async () => {
    if (!items.length) return;

    $make.disabled = true;
    $clear.disabled = true;
    setResult('');
    setStatus('Creating PDF…');

    try {
      const pdfDoc = await PDFLib.PDFDocument.create();
      const margin = parseFloat($margin?.value || '12');
      const fitMode = ($fit?.value || 'contain');
      const pageMode = ($pageSize?.value || 'a4');

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        setStatus(`Processing ${i + 1}/${items.length}: ${it.file.name}`);

        // downscale (reduces memory errors)
        const { bytes, mime, w: imgW, h: imgH } = await maybeDownscaleToBytes(it.file, 2000);

        let embedded;
        if (mime === 'image/png') {
          embedded = await pdfDoc.embedPng(bytes);
        } else {
          embedded = await pdfDoc.embedJpg(bytes);
        }

        const box = getPageBox(pageMode, imgW, imgH);

        // create page
        const page = pdfDoc.addPage([box.w, box.h]);

        // drawable area (margin)
        const dw = Math.max(1, box.w - margin * 2);
        const dh = Math.max(1, box.h - margin * 2);

        const rect = fitRect(imgW, imgH, dw, dh, fitMode);

        page.drawImage(embedded, {
          x: margin + rect.x,
          y: margin + rect.y,
          width: rect.w,
          height: rect.h,
        });
      }

      setStatus('Saving…');
      const pdfBytes = await pdfDoc.save();
      const name = `images-${Date.now()}.pdf`;
      downloadBytes(pdfBytes, name);

      setStatus('Done.');
      setResult(`✅ Downloaded: <b>${esc(name)}</b>`);
    } catch (e) {
      const msg = e?.message || String(e);
      setStatus('Stopped.');
      setResult(`❌ ${esc(msg)}<br/><span style="opacity:.75;">Tip: try enabling Auto downscale, using fewer images, or smaller images.</span>`);
    } finally {
      enableUI();
    }
  });

  // init
  enableUI();
})();
