const lower = document.getElementById("lower");
const upper = document.getElementById("upper");
const nums  = document.getElementById("nums");
const syms  = document.getElementById("syms");
const lenEl = document.getElementById("len");
const out   = document.getElementById("out");
const msg   = document.getElementById("msg");
const genBtn = document.getElementById("genBtn");
const copyBtn = document.getElementById("copyBtn");

const sets = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  nums:  "0123456789",
  syms:  "!@#$%^&*()-_=+[]{};:,.?/<>~"
};

function randInt(max){
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % max;
}

function generate(){
  let chars = "";
  const picks = [];
  if (lower.checked) { chars += sets.lower; picks.push(sets.lower); }
  if (upper.checked) { chars += sets.upper; picks.push(sets.upper); }
  if (nums.checked)  { chars += sets.nums;  picks.push(sets.nums); }
  if (syms.checked)  { chars += sets.syms;  picks.push(sets.syms); }

  const L = Math.max(6, Math.min(64, Number(lenEl.value || 16)));

  if (!chars) {
    msg.textContent = "Select at least one character set.";
    out.value = "";
    return;
  }

  // ensure at least one from each selected set
  const arr = [];
  for (const s of picks) arr.push(s[randInt(s.length)]);
  while (arr.length < L) arr.push(chars[randInt(chars.length)]);

  // shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  out.value = arr.join("");
  msg.textContent = "Done.";
}

async function copy(){
  if (!out.value) return;
  await navigator.clipboard.writeText(out.value);
  msg.textContent = "Copied to clipboard.";
}

genBtn.addEventListener("click", generate);
copyBtn.addEventListener("click", copy);
generate();
