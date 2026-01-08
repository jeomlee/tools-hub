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
  const $progressWrap = document.getElementById('progressWrap');
  const $progressBar = document.getElementById('progressBar');

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
  function resetUI() {
    currentFile = null;
    cancelled = false;
    $file.value = '';
    $result.innerHTML = '';
    setStatus('');
    setProgress(null);
    enableButtons(false);
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

  async function renderPage(pdf, pageNumber, scale, format) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const isJpg = format === 'jpg';
    const mime = isJpg ? 'image/jpeg' : 'image/png';
    const quality = isJpg ? 0.85 : 1.0;

    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), mime, quality);
    });

    canvas.width = 1;
    canvas.height = 1;

    if (!blob) throw new Error('Image generation failed.');
    return blob;
  }

  $file.addEventListener('change', () => {
    currentFile = $file.files[0] || null;
    cancelled = false;
    $result.innerHTML = '';
    setStatus(currentFile ? `Selected: ${currentFile.name}` : '');
    enableButtons(!!currentFile);
  });

  $clear.addEventListener('click', resetUI);
  $cancel.addEventListener('click', () => {
    cancelled = true;
    setStatus('Cancelling…');
  });

  $extract.addEventListener('click', async () => {
    if (!currentFile) return;

    cancelled = false;
    $cancel.disabled = false;
    $extract.disabled = true;
    $clear.disabled = true;

    const scale = parseFloat($scale.value || '1.5');
    const format = ($format.value || 'png').toLowerCase();

    try {
      setStatus('Loading PDF…');
      setProgress(5);

      const pdf = await pdfjsLib.getDocument({
        data: await currentFile.arrayBuffer()
      }).promise;

      const total = pdf.numPages;
      setStatus(`Pages: ${total}`);
      setProgress(10);

      const ext = format === 'jpg' ? 'jpg' : 'png';

      if (total === 1) {
        const blob = await renderPage(pdf, 1, scale, format);
        downloadBlob(blob, `${stripExt(currentFile.name)}.${ext}`);
        setProgress(100);
        setStatus('Done.');
        return finalize();
      }

      const zip = new JSZip();
      for (let i = 1; i <= total; i++) {
        if (cancelled) throw new Error('Cancelled.');
        setStatus(`Rendering page ${i}/${total}`);
        setProgress(10 + Math.floor((i / total) * 80));

        const blob = await renderPage(pdf, i, scale, format);
        zip.file(
          `${stripExt(currentFile.name)}-p${String(i).padStart(3, '0')}.${ext}`,
          blob
        );
      }

      setStatus('Creating ZIP…');
      setProgress(92);

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, `${stripExt(currentFile.name)}-images.zip`);

      setProgress(100);
      setStatus('Done.');
      finalize();
    } catch (e) {
      setStatus(e.message || 'Error occurred.');
      finalize(true);
    }
  });

  function finalize() {
    $cancel.disabled = true;
    $extract.disabled = !currentFile;
    $clear.disabled = !currentFile;
    setProgress(null);
  }

  function stripExt(name) {
    return name.replace(/\.[^.]+$/, '');
  }

  resetUI();
})();
