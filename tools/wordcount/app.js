const el = document.getElementById("text");
const wordsEl = document.getElementById("words");
const charsEl = document.getElementById("chars");
const charsNoSpaceEl = document.getElementById("charsNoSpace");
const clearBtn = document.getElementById("clearBtn");

function update() {
  const v = el.value || "";
  const words = v.trim() ? v.trim().split(/\s+/).length : 0;
  const chars = v.length;
  const charsNoSpace = v.replace(/\s/g, "").length;

  wordsEl.textContent = `Words: ${words}`;
  charsEl.textContent = `Chars: ${chars}`;
  charsNoSpaceEl.textContent = `Chars (no spaces): ${charsNoSpace}`;
}

el.addEventListener("input", update);
clearBtn.addEventListener("click", () => {
  el.value = "";
  update();
});
update();
