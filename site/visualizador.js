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
  let model, opener, previousGesture;
  let zoom = 1, rotationX = -4, rotationY = 0, paused = false, warmLight = false;

  function paint() {
    scene.style.transform = `scale(${zoom})`;
    if (model?.style.animationName === "none") model.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`;
    slider.value = String(Math.round(zoom * 100));
    output.value = `${Math.round(zoom * 100)}%`;
    minus.disabled = zoom <= 1;
    plus.disabled = zoom >= 3;
  }
  function setZoom(value) { zoom = Math.max(1, Math.min(3, value)); paint(); }
  function manualRotation() {
    if (!model) return;
    model.style.animation = "none";
    paused = true;
    motion.textContent = "Retomar rotação";
    paint();
  }
  function setPaused(value) {
    paused = value;
    if (model) model.style.animationPlayState = paused ? "paused" : "running";
    motion.disabled = reducedMotion.matches;
    motion.textContent = reducedMotion.matches ? "Movimento reduzido" : paused ? "Retomar rotação" : "Pausar rotação";
  }
  function reset() {
    zoom = 1; rotationX = -4; rotationY = 0; warmLight = false;
    viewport.classList.remove("warm-light");
    document.getElementById("viewer-light").textContent = "Luz quente";
    scene.style.transform = "";
    if (model) { model.style.animation = ""; model.style.transform = ""; setPaused(reducedMotion.matches); }
    paint();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".visual-open");
    if (!button || dialog.open) return;
    const figure = button.closest(".quote-visual");
    const originalModel = figure.querySelector(".configured-door-wrap, .configured-product-wrap");
    const backdrop = figure.querySelector(".realistic-backdrop");
    if (!originalModel) return;
    opener = button;
    model = originalModel.cloneNode(true);
    model.classList.add("viewer-model");
    model.removeAttribute("aria-hidden");
    scene.replaceChildren(model);
    viewport.style.setProperty("--viewer-backdrop", backdrop ? `url("${backdrop.src}")` : "none");
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
    pointers.clear(); previousGesture = null; scene.replaceChildren(); model = null;
    viewport.style.removeProperty("--viewer-backdrop");
    document.body.classList.remove("viewer-is-open"); opener?.focus({ preventScroll: true });
  });
  plus.addEventListener("click", () => setZoom(zoom + .2));
  minus.addEventListener("click", () => setZoom(zoom - .2));
  slider.addEventListener("input", () => setZoom(Number(slider.value) / 100));
  motion.addEventListener("click", () => {
    if (!model) return;
    if (model.style.animationName === "none") { model.style.animation = ""; model.style.transform = ""; setPaused(false); }
    else setPaused(!paused);
  });
  front.addEventListener("click", () => { rotationX = 0; rotationY = 0; manualRotation(); });
  document.getElementById("viewer-left").addEventListener("click", () => { rotationY -= 20; manualRotation(); });
  document.getElementById("viewer-right").addEventListener("click", () => { rotationY += 20; manualRotation(); });
  document.getElementById("viewer-light").addEventListener("click", (event) => {
    warmLight = !warmLight; viewport.classList.toggle("warm-light", warmLight);
    event.currentTarget.textContent = warmLight ? "Luz neutra" : "Luz quente";
  });
  document.getElementById("viewer-reset").addEventListener("click", reset);
  viewport.addEventListener("wheel", (event) => { event.preventDefault(); setZoom(zoom + (event.deltaY < 0 ? .1 : -.1)); }, { passive: false });
  viewport.addEventListener("keydown", (event) => {
    if (!["+", "=", "-", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "+" || event.key === "=") return setZoom(zoom + .2);
    if (event.key === "-") return setZoom(zoom - .2);
    if (event.key === "ArrowLeft") rotationY -= 8;
    if (event.key === "ArrowRight") rotationY += 8;
    if (event.key === "ArrowUp") rotationX = Math.max(-60, rotationX - 6);
    if (event.key === "ArrowDown") rotationX = Math.min(60, rotationX + 6);
    manualRotation();
  });
  function gesture() {
    const points = [...pointers.values()]; if (!points.length) return null;
    const a = points[0], b = points[1] || a;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y), count: points.length };
  }
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId); pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    previousGesture = gesture(); manualRotation();
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const next = gesture();
    if (next.count > 1 && previousGesture.distance > 0) zoom = Math.max(1, Math.min(3, zoom * next.distance / previousGesture.distance));
    else { rotationY += (next.x - previousGesture.x) * .45; rotationX = Math.max(-60, Math.min(60, rotationX - (next.y - previousGesture.y) * .32)); }
    previousGesture = next; manualRotation();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(type, (event) => { pointers.delete(event.pointerId); previousGesture = gesture(); });
  reducedMotion.addEventListener("change", () => { if (dialog.open) setPaused(reducedMotion.matches); });
})();
