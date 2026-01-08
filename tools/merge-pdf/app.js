/* global PDFLib */
(() => {
  const $files = document.getElementById('files');
  const $merge = document.getElementById('merge');
  const $clear = document.getElementById('clear');
  const $status = document.getElementById('status');
  const $result = document.getElementById('result');
  const $listWrap = document.getElementById('listWrap');
  const $fileList = document.getElementById('fileList');

  /** @type {{id:string, file:File}[]} */
  let items = [];

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function setStatus(msg) {
    $status.textContent = msg || '';
  }

  function setResult(html) {
    $result.innerHTML = html || '';
  }

  function enableUI() {
    const has = items.length > 0;
    $merge.disabled = !has;
    $clear.disabled = !has;
    $listWrap.style.display = has ? 'block' : 'none';
  }

  function formatBytes(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
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

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  function renderList() {
    $fileList.innerHTML = '';

    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.style.gap = '10px';
      row.style.alignItems = 'center';
      row.style.margin = '10px 0';
      row.style.flexWrap = 'wrap';
      row.draggable = true;
      row.dataset.id = it.id;

      const name = document.createElement('div');
      name.className = 'small';
      name.style.flex = '1';
      name.style.minWidth = '220px';
      name.innerHTML = `<b>${idx + 1}.</b> ${escapeHtml(it.file.name)} <span style="opacity:.7;">(${formatBytes(it.file.size)})</span>`;

      const up = document.createElement('button');
      up.className = 'btn';
      up.textContent = '↑';
      up.title = 'Move up';
      up.disabled = idx === 0;
      up.onclick = () => {
        if (idx === 0) return;
        [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
        renderList();
      };

      const down = document.createElement('button');
      down.className = 'btn';
      down.textContent = '↓';
      down.title = 'Move down';
      down.disabled = idx === items.length - 1;
      down.onclick = () => {
        if (idx === items.length - 1) return;
        [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
        renderList();
      };

      const remove = document.createElement('button');
      remove.className = 'btn';
      remove.textContent = 'Remove';
      remove.onclick = () => {
        items = items.filter(x => x.id !== it.id);
        renderList();
        enableUI();
        setStatus(items.length ? `Selected ${items.length} file(s).` : '');
      };

      // Drag & drop reorder
      row.addEventListener('dragstart', (e) => {
        row.style.opacity = '0.6';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', it.id);
      });
      row.addEventListener('dragend', () => {
        row.style.opacity = '1';
      });
      row.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });
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

      row.appendChild(name);
      row.appendChild(up);
      row.appendChild(down);
      row.appendChild(remove);

      $fileList.appendChild(row);
    });
  }

  $files.addEventListener('change', () => {
    const selected = Array.from($files.files || []);
    if (!selected.length) return;

    // Append new files (don’t wipe existing unless user hits Clear)
    const next = selected.map(file => ({ id: uid(), file }));
    items = items.concat(next);

    setStatus(`Selected ${items.length} file(s). Drag to reorder.`);
    setResult('');
    enableUI();
    renderList();

    // reset input so selecting same file again works
    $files.value = '';
  });

  $clear.addEventListener('click', () => {
    items = [];
    $files.value = '';
    $fileList.innerHTML = '';
    setStatus('');
    setResult('');
    enableUI();
  });

  $merge.addEventListener('click', async () => {
    if (!items.length) return;

    $merge.disabled = true;
    $clear.disabled = true;
    setResult('');
    setStatus('Merging…');

    try {
      const mergedPdf = await PDFLib.PDFDocument.create();

      for (let i = 0; i < items.length; i++) {
        const { file } = items[i];
        setStatus(`Reading ${i + 1}/${items.length}: ${file.name}`);

        const bytes = await file.arrayBuffer();
        const srcPdf = await PDFLib.PDFDocument.load(bytes);

        const copiedPages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach(p => mergedPdf.addPage(p));
      }

      setStatus('Generating output…');
      const outBytes = await mergedPdf.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });

      const filename = `merged-${Date.now()}.pdf`;
      downloadBlob(blob, filename);

      setStatus('Done.');
      setResult(`✅ Downloaded: <b>${escapeHtml(filename)}</b>`);
    } catch (err) {
      const msg = err?.message || String(err);
      setStatus('Stopped.');
      setResult(`❌ ${escapeHtml(msg)}`);
    } finally {
      // restore
      enableUI();
    }
  });

  // init
  enableUI();
})();
