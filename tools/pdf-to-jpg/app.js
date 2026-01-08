/* global pdfjsLib, JSZip */
(() => {
  const $file = document.getElementById('file');
  const $extract = document.getElementById('extract');
  const $clear = document.getElementById('clear');
  const $cancel = document.getElementById('cancel');
  const $status = document.getElementById('status');
  const $result = document.getElementById('result');
  const $scale = document.getElementById('scale');
  const $format = document.getElementById('format');
  const $jpgQuality = document.getElementById('jpgQuality');
  const $jpgQualityWrap = document.getElementById('jpgQualityWrap');
  const $progressWrap = document.getElementById('progressWrap');
  const $progressBar = document.getElementById('progressBar');

  // pdf.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.js';

  let currentFile = null;
  let cancelled = false;

  function setStatus(msg) {
    $status.textContent = msg || '';
  }

  function setProgress(pct) {
    if (pct == null) {
      $progressWrap.style.display = 'none';
      $progressBar.style.width = '0%';
      return;
    }
    $progressWrap.style.display = 'block';
    $progressBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function enableButtons(hasFile) {
    $extract.disabled = !hasFile;
    $clear.disabled = !hasFile;
    $cancel.disabled = true;
  }

  function syncQualityUI() {
    const fmt = ($format?.value || 'jpg').toLowerCase();
    if ($jpgQualityWrap) $jpgQualityWrap.style.display = (fmt === 'jpg') ? 'inline-block' : 'none';
  }

  function resetUI() {
    currentFile = null;
    cancelled = false;
    $file.value = '';
    $result.innerHTML = '';
    setStatus('');
    setProgress(null);
    enableButtons(false);
    syncQualityUI();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function stripExt(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function renderPageToImageBlob(pdf, pageNumber, scale, format, jpgQuality) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const isJpg = format === 'jpg';
    const mime = isJpg ? 'image/jpeg' : 'image/png';
    const quality = isJpg ? jpgQuality : 1.0;

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality);
    });

    // free memory
    canvas.width = 1;
    canvas.height = 1;

    if (!blob) throw new Error('Image generation failed.');
    return blob;
  }

  $format?.addEventListener('change', syncQualityUI);

  $file.addEventListener('change', () => {
    currentFile = ($file.files && $file.files[0]) ? $file.files[0] : null;
    cancelled = false;
    $result.innerHTML = '';
    setStatus(currentFile ? `Selected: ${currentFile.name} (${Math.round(currentFile.size / 1024 / 1024)} MB)` : '');
    enableButtons(!!currentFile);
  });

  $clear.addEventListener('click', resetUI);

  $cancel.addEventListener('click', () => {
    cancelled = true;
    setStatus('Cancelling… (stops after current page)');
  });

  $extract.addEventListener('click', async () => {
    if (!currentFile) return;

    cancelled = false;
    $cancel.disabled = false;
    $extract.disabled = true;
    $clear.disabled = true;
    $result.innerHTML = '';

    const scale = parseFloat($scale.value || '1.5');
    const format = ($format.value || 'jpg').toLowerCase();
    const jpgQuality = format === 'jpg'
      ? Math.max(0.1, Math.min(1.0, parseFloat($jpgQuality?.value || '0.85')))
      : 1.0;

    try {
      setStatus('Loading PDF…');
      setProgress(5);

      const pdf = await pdfjsLib.getDocument({ data: await currentFile.arrayBuffer() }).promise;
      const total = pdf.numPages;

      setStatus(`PDF loaded. Pages: ${total}`);
      setProgress(10);

      const ext = (format === 'jpg') ? 'jpg' : 'png';
      const base = stripExt(currentFile.name);

      // Single-page => direct download
      if (total === 1) {
        setStatus('Rendering page 1/1…');
        setProgress(40);

        const blob = await renderPageToImageBlob(pdf, 1, scale, format, jpgQuality);
        if (cancelled) throw new Error('Cancelled.');

        const outName = `${base}-p1.${ext}`;
        downloadBlob(blob, outName);

        setProgress(100);
        setStatus('Done.');
        $result.innerHTML = `✅ Downloaded: <b>${esc(outName)}</b>`;
        return finalize();
      }

      // Multi-page => ZIP
      const zip = new JSZip();
      for (let i = 1; i <= total; i++) {
        if (cancelled) throw new Error('Cancelled.');
        setStatus(`Rendering page ${i}/${total}…`);
        setProgress(10 + Math.floor((i / total) * 75));

        const blob = await renderPageToImageBlob(pdf, i, scale, format, jpgQuality);
        if (cancelled) throw new Error('Cancelled.');

        const filename = `${base}-p${String(i).padStart(3, '0')}.${ext}`;
        zip.file(filename, blob);
      }

      setStatus('Creating ZIP…');
      setProgress(90);

      const zipBlob = await zip.generateAsync(
        { type: 'blob' },
        (meta) => setProgress(90 + Math.floor(meta.percent * 0.10))
      );

      if (cancelled) throw new Error('Cancelled.');

      const zipName = `${base}-${ext}.zip`;
      downloadBlob(zipBlob, zipName);

      setProgress(100);
      setStatus('Done.');
      $result.innerHTML = `✅ Downloaded ZIP: <b>${esc(zipName)}</b> (${total} images)`;
      finalize();
    } catch (e) {
      const msg = e?.message || 'Error occurred.';
      setStatus('Stopped.');
      $result.innerHTML = `❌ ${esc(msg)}`;
      finalize(true);
    }
  });

  function finalize() {
    $cancel.disabled = true;
    $extract.disabled = !currentFile;
    $clear.disabled = !currentFile;
    setProgress(null);
  }

  resetUI();
})();
