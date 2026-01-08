/* global PDFLib, JSZip */
(() => {
  const $file = document.getElementById('file');
  const $mode = document.getElementById('mode');
  const $ranges = document.getElementById('ranges');
  const $rangesWrap = document.getElementById('rangesWrap');
  const $split = document.getElementById('split');
  const $clear = document.getElementById('clear');
  const $status = document.getElementById('status');
  const $info = document.getElementById('info');
  const $result = document.getElementById('result');

  let currentFile = null;
  let pdfBytes = null;
  let pageCount = 0;

  function setStatus(msg) { $status.textContent = msg || ''; }
  function setInfo(msg) { $info.textContent = msg || ''; }
  function setResult(html) { $result.innerHTML = html || ''; }

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

  function enableUI(hasFile) {
    $split.disabled = !hasFile;
    $clear.disabled = !hasFile;
  }

  function parseRanges(input, totalPages) {
    // Accept:
    // - "1-3" "4-" "-2" "6" "1,3,5"
    // - groups separated by ';' => each group becomes one output PDF
    const raw = (input || '').trim();
    if (!raw) throw new Error('Please enter ranges. Example: 1-2; 3-5; 6');

    const groups = raw
      .split(';')
      .map(s => s.trim())
      .filter(Boolean);

    if (!groups.length) throw new Error('Invalid ranges.');

    const out = groups.map((g) => {
      // normalize commas/spaces
      // allow "1,3,5" => [1,3,5]
      if (g.includes(',')) {
        const pages = g.split(',').map(x => x.trim()).filter(Boolean).map(n => parseInt(n, 10));
        if (pages.some(n => !Number.isFinite(n))) throw new Error(`Invalid page list: ${g}`);
        const uniq = Array.from(new Set(pages));
        return uniq.map(n => clampPage(n, totalPages));
      }

      // range form "a-b" or "a-" or "-b" or "a"
      if (g.includes('-')) {
        const [aRaw, bRaw] = g.split('-').map(x => x.trim());
        const a = aRaw ? parseInt(aRaw, 10) : 1;
        const b = bRaw ? parseInt(bRaw, 10) : totalPages;
        if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`Invalid range: ${g}`);
        const start = clampPage(a, totalPages);
        const end = clampPage(b, totalPages);
        if (start > end) throw new Error(`Range start > end: ${g}`);
        const pages = [];
        for (let i = start; i <= end; i++) pages.push(i);
        return pages;
      }

      // single page
      const n = parseInt(g, 10);
      if (!Number.isFinite(n)) throw new Error(`Invalid page: ${g}`);
      return [clampPage(n, totalPages)];
    });

    // convert to 0-based indices
    return out.map(group => group.map(n => n - 1));
  }

  function clampPage(n, total) {
    if (n < 1) return 1;
    if (n > total) return total;
    return n;
  }

  function updateModeUI() {
    const mode = $mode.value;
    $rangesWrap.style.display = (mode === 'ranges') ? 'inline-block' : 'none';
  }

  $mode.addEventListener('change', updateModeUI);
  updateModeUI();

  $file.addEventListener('change', async () => {
    currentFile = ($file.files && $file.files[0]) ? $file.files[0] : null;
    pdfBytes = null;
    pageCount = 0;
    setResult('');
    setInfo('');

    if (!currentFile) {
      setStatus('');
      enableUI(false);
      return;
    }

    try {
      setStatus('Loading PDF…');
      pdfBytes = await currentFile.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(pdfBytes);
      pageCount = doc.getPageCount();
      setStatus(`Loaded: ${currentFile.name}`);
      setInfo(`Pages: ${pageCount}`);
      enableUI(true);
    } catch (e) {
      setStatus('Failed to load PDF.');
      setResult(`❌ ${esc(e?.message || 'Error')}`);
      enableUI(false);
    }
  });

  $clear.addEventListener('click', () => {
    currentFile = null;
    pdfBytes = null;
    pageCount = 0;
    $file.value = '';
    $ranges.value = '';
    setStatus('');
    setInfo('');
    setResult('');
    enableUI(false);
  });

  $split.addEventListener('click', async () => {
    if (!currentFile || !pdfBytes) return;

    $split.disabled = true;
    $clear.disabled = true;
    setResult('');

    try {
      const base = stripExt(currentFile.name);
      const mode = $mode.value;

      setStatus('Preparing…');
      const srcDoc = await PDFLib.PDFDocument.load(pdfBytes);

      const zip = new JSZip();

      if (mode === 'each') {
        setStatus(`Splitting ${pageCount} pages…`);
        for (let i = 0; i < pageCount; i++) {
          const outDoc = await PDFLib.PDFDocument.create();
          const [p] = await outDoc.copyPages(srcDoc, [i]);
          outDoc.addPage(p);
          const bytes = await outDoc.save();
          zip.file(`${base}-p${String(i + 1).padStart(3, '0')}.pdf`, bytes);
        }
      } else {
        const groups = parseRanges($ranges.value, pageCount);
        setStatus(`Creating ${groups.length} file(s)…`);

        for (let g = 0; g < groups.length; g++) {
          const idxs = groups[g];
          const outDoc = await PDFLib.PDFDocument.create();
          const pages = await outDoc.copyPages(srcDoc, idxs);
          pages.forEach(p => outDoc.addPage(p));
          const bytes = await outDoc.save();

          // name: base-r01.pdf, base-r02.pdf ...
          zip.file(`${base}-part${String(g + 1).padStart(2, '0')}.pdf`, bytes);
        }
      }

      setStatus('Creating ZIP…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipName = `${stripExt(currentFile.name)}-split.zip`;
      downloadBlob(zipBlob, zipName);

      setStatus('Done.');
      setResult(`✅ Downloaded ZIP: <b>${esc(zipName)}</b>`);
    } catch (e) {
      setStatus('Stopped.');
      setResult(`❌ ${esc(e?.message || 'Error')}`);
    } finally {
      enableUI(!!currentFile);
    }
  });

  enableUI(false);
})();
