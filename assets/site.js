(() => {
  const $search = document.getElementById('toolSearch');
  const $filter = document.getElementById('toolFilter');
  const $grid = document.getElementById('toolsGrid');
  const $recentWrap = document.getElementById('recentWrap');
  const $recentTools = document.getElementById('recentTools');

  if (!$grid) return;

  const cards = Array.from($grid.querySelectorAll('a.card'));

  function norm(s) { return (s || '').toLowerCase().trim(); }

  function apply() {
    const q = norm($search?.value);
    const cat = $filter?.value || 'all';

    cards.forEach((el) => {
      const name = norm(el.getAttribute('data-name'));
      const c = el.getAttribute('data-cat') || '';
      const okCat = (cat === 'all') || (c === cat);
      const okQ = !q || name.includes(q) || (el.textContent || '').toLowerCase().includes(q);
      el.style.display = (okCat && okQ) ? '' : 'none';
    });
  }

  function saveRecent(href, title) {
    try {
      const key = 'mini_tools_recent';
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      const next = [{ href, title, t: Date.now() }, ...arr.filter(x => x.href !== href)].slice(0, 5);
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  function renderRecent() {
    try {
      const key = 'mini_tools_recent';
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      if (!arr.length) {
        $recentWrap.style.display = 'none';
        return;
      }
      $recentWrap.style.display = 'block';
      $recentTools.innerHTML = '';
      arr.forEach((x) => {
        const a = document.createElement('a');
        a.className = 'badge';
        a.href = x.href;
        a.textContent = x.title;
        $recentTools.appendChild(a);
      });
    } catch {
      $recentWrap.style.display = 'none';
    }
  }

  cards.forEach((el) => {
    el.addEventListener('click', () => {
      const title = (el.querySelector('h3')?.textContent || 'Tool').trim();
      saveRecent(el.getAttribute('href'), title);
    });
  });

  $search?.addEventListener('input', apply);
  $filter?.addEventListener('change', apply);

  renderRecent();
  apply();
})();
