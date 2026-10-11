(() => {
  const dialog = document.getElementById("visual-viewer");
  const viewport = document.getElementById("viewer-viewport");
  const scene = document.getElementById("viewer-scene");
  const slider = document.getElementById("viewer-zoom");
  const output = document.getElementById("viewer-zoom-value");
  const motion = document.getElementById("viewer-motion");
  const front = document.getElementById("viewer-front");
  const minus = document.getElementById("viewer-minus");
  const plus = document.getElementById("viewer-plus");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pointers = new Map();
  let photo, opener;
  let zoom = 1, x = 0, y = 0, paused = false, previousGesture;

  function paint() {
    const limitX = viewport.clientWidth * zoom / 2;
    const limitY = viewport.clientHeight * zoom / 2;
    x = Math.max(-limitX, Math.min(limitX, x));
    y = Math.max(-limitY, Math.min(limitY, y));
    scene.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    slider.value = String(Math.round(zoom * 100));
    output.value = `${Math.round(zoom * 100)}%`;
    minus.disabled = zoom <= 1;
    plus.disabled = zoom >= 3;
  }

  function setZoom(value) {
    zoom = Math.max(1, Math.min(3, value));
    paint();
  }

  function setPaused(value) {
    paused = value;
    if (photo) photo.style.animationPlayState = paused ? "paused" : "running";
    motion.disabled = reducedMotion.matches;
    motion.textContent = paused ? "Retomar rotação" : "Pausar rotação";
    if (reducedMotion.matches) motion.textContent = "Movimento reduzido";
  }

  function reset() {
    zoom = 1;
    x = y = 0;
    scene.style.transform = "";
    if (photo) {
      photo.style.animation = "";
      photo.style.transform = "";
      setPaused(reducedMotion.matches);
    }
    paint();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".visual-open");
    if (!button || dialog.open) return;
    const figure = button.closest(".quote-visual");
    const originalPhoto = figure.querySelector(".realistic-visual");
    if (!originalPhoto) return;
    opener = button;
    photo = originalPhoto.cloneNode(true);
    photo.classList.add("viewer-photo");
    photo.removeAttribute("loading");
    photo.draggable = false;
    scene.replaceChildren(photo);
    document.getElementById("viewer-title").textContent = figure.querySelector("figcaption strong").textContent;
    document.getElementById("viewer-description").textContent = figure.querySelector("figcaption span").textContent;
    dialog.showModal();
    document.body.classList.add("viewer-is-open");
    reset();
  });

  document.getElementById("viewer-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    pointers.clear();
    previousGesture = null;
    scene.replaceChildren();
    photo = null;
    document.body.classList.remove("viewer-is-open");
    opener?.focus({ preventScroll: true });
  });
  plus.addEventListener("click", () => setZoom(zoom + .2));
  minus.addEventListener("click", () => setZoom(zoom - .2));
  slider.addEventListener("input", () => setZoom(Number(slider.value) / 100));
  motion.addEventListener("click", () => {
    if (!photo) return;
    if (photo.style.animationName === "none") {
      photo.style.animation = "";
      photo.style.transform = "";
    }
    setPaused(!paused);
  });
  front.addEventListener("click", () => {
    if (!photo) return;
    photo.style.animation = "none";
    photo.style.transform = "rotateY(0deg)";
    setPaused(true);
  });
  document.getElementById("viewer-reset").addEventListener("click", reset);
  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? .1 : -.1));
  }, { passive: false });
  viewport.addEventListener("keydown", (event) => {
    if (!["+", "=", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "+" || event.key === "=") setZoom(zoom + .2);
    if (event.key === "-") setZoom(zoom - .2);
    if (event.key === "ArrowLeft") x -= 24;
    if (event.key === "ArrowRight") x += 24;
    if (event.key === "ArrowUp") y -= 24;
    if (event.key === "ArrowDown") y += 24;
    paint();
  });

  function gesture() {
    const points = [...pointers.values()];
    if (!points.length) return null;
    const a = points[0], b = points[1] || a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousGesture = gesture();
    setPaused(true);
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = gesture();
    x += next.x - previousGesture.x;
    y += next.y - previousGesture.y;
    if (previousGesture.distance > 0 && next.distance > 0) zoom = Math.max(1, Math.min(3, zoom * next.distance / previousGesture.distance));
    previousGesture = next;
    paint();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    viewport.addEventListener(type, (event) => {
      pointers.delete(event.pointerId);
      previousGesture = gesture();
    });
  }
  reducedMotion.addEventListener("change", () => {
    if (!dialog.open) return;
    setPaused(reducedMotion.matches);
  });
  window.addEventListener("resize", () => { if (dialog.open) paint(); });
})();
