const canvas = document.getElementById("pad");
const clearBtn = document.getElementById("clear");
const dlBtn = document.getElementById("download");

const ctx = canvas.getContext("2d");
let drawing = false;
let last = null;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#e9f0f7";
}

function pos(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
  return { x, y };
}

function start(e) {
  drawing = true;
  last = pos(e);
}
function move(e) {
  if (!drawing) return;
  e.preventDefault();
  const p = pos(e);
  ctx.beginPath();
  ctx.moveTo(last.x, last.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  last = p;
}
function end() {
  drawing = false;
  last = null;
}

function clear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function download() {
  // export at device pixel ratio resolution
  const a = document.createElement("a");
  a.download = "signature.png";
  a.href = canvas.toDataURL("image/png");
  a.click();
}

window.addEventListener("resize", () => {
  // keep existing drawing? simplest: do not preserve
  resizeCanvas();
});
resizeCanvas();

canvas.addEventListener("mousedown", start);
canvas.addEventListener("mousemove", move);
window.addEventListener("mouseup", end);

canvas.addEventListener("touchstart", start, { passive: false });
canvas.addEventListener("touchmove", move, { passive: false });
canvas.addEventListener("touchend", end);

clearBtn.addEventListener("click", clear);
dlBtn.addEventListener("click", download);
