/* global pdfjsLib, JSZip */
(() => {
  const fileInput = document.getElementById('file');
  const extractBtn = document.getElementById('extract');
  const clearBtn = document.getElementById('clear');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const scaleEl = document.getElementById('scale');
  const formatEl = document.getElementById('format');

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js';

  let currentFile = null;

  function setStatus(msg) {
    statusEl.textContent = msg || '';
  }

  function reset() {
    currentFile = null;
    fileInput.value = '';
    extractBtn.disabled = true;
    clearBtn.disabled = true;
    setStatus('');
    resultEl.innerHTML = '';
  }

  fileInput.addEventListener('change', () => {
    currentFile = fileInput.files[0] || null;
    extractBtn.disabled = !currentFile;
    clearBtn.disabled = !currentFile;
    setStatus(currentFile ? `Selected: ${currentFile.name}` : '');
  });

  clearBtn.addEventListener('click', reset);

  extractBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    extractBtn.disabled = true;
    clearBtn.disabled = true;

    try {
      setStatus('Loading PDF…');

      const pdf = await pdfjsLib.getDocument(
        await currentFile.arrayBuffer()
      ).promise;

      const zip = new JSZip();
      const scale = parseFloat(scaleEl.value);
      const format = formatEl.value;
      const ext = format === 'jpg' ? 'jpg' : 'png';

      for (let i = 1; i <= pdf.numPages; i++) {
        setStatus(`Rendering page ${i}/${pdf.numPages}`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const blob = await new Promise(res =>
          canvas.toBlob(res, `image/${ext}`, 0.9)
        );

        zip.file(`page-${i}.${ext}`, blob);
      }

      setStatus('Creating ZIP…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      const a = document.createElement('a');
      a.href = URL.createObjectURL(zipBlob);
      a.download = 'pdf-images.zip';
      a.click();

      setStatus('Done.');
      resultEl.innerHTML = '✅ Downloaded ZIP file.';
    } catch (e) {
      setStatus('Error: ' + e.message);
    }
  });

  reset();
})();
