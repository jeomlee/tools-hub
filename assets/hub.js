(() => {
  const badge = document.getElementById("statusBadge");
  const now = new Date();
  badge.textContent = `● Ready · ${now.toLocaleString()}`;
})();
