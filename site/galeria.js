(() => {
  const toolbar = document.querySelector(".gallery-toolbar");
  const cards = [...document.querySelectorAll("[data-gallery-category]")];
  const dialog = document.getElementById("gallery-lightbox");
  if (!toolbar || !dialog) return;

  let opener;
  toolbar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gallery-filter]");
    if (!button) return;
    const filter = button.dataset.galleryFilter;
    toolbar.querySelectorAll("button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    cards.forEach((card) => {
      const categories = card.dataset.galleryCategory.split(" ");
      card.hidden = filter !== "todos" && !categories.includes(filter);
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-gallery-open]");
    if (!button) return;
    const card = button.closest(".project-card");
    const source = button.querySelector("img");
    opener = button;
    document.getElementById("gallery-lightbox-image").src = source.currentSrc || source.src;
    document.getElementById("gallery-lightbox-image").alt = source.alt;
    document.getElementById("gallery-lightbox-title").textContent = card.querySelector("h3").textContent;
    document.getElementById("gallery-lightbox-description").textContent = card.querySelector("p").textContent;
    dialog.showModal();
    document.body.classList.add("gallery-open");
  });

  document.getElementById("gallery-lightbox-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener("close", () => {
    document.body.classList.remove("gallery-open");
    opener?.focus({ preventScroll: true });
  });
})();
