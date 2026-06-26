// _shared/js/navbar.js
(function () {
  const host = document.getElementById("aps-navbar");
  const frame = document.getElementById("aps-view");
  if (!host || !frame) return;

  const nav = document.createElement("nav");
  nav.className = "aps-navbar";

  const logo = document.createElement("img");
  logo.src = "_shared/assets/logo.png";
  logo.className = "aps-navbar-logo";
  logo.title = "Askida Platform Studio";
  logo.onclick = () => { frame.src = "studio/studio.html"; setActive("studio"); };

  const links = document.createElement("div");
  links.className = "aps-navbar-links";

  function btn(label, key, href) {
    const b = document.createElement("button");
    b.textContent = label;
    b.className = "dbc-nav-btn";

    b.onclick = () => {
      frame.src = href;
      setActive(key);
    };

    b.dataset.key = key;
    return b;
  }

  function setActive(key) {
    links.querySelectorAll("button").forEach(b => {
      const isActive = b.dataset.key === key;
      b.disabled = isActive;
      b.classList.toggle("active", isActive);
    });
  }

  links.append(
    btn("Studio",   "studio",   "studio/studio.html"),
    btn("Scénarios","scenario", "scenario/overview/overview.html"),
    btn("Viewer",   "viewer",   "viewer/aps/aps.html")
  );

  nav.append(logo, links);
  host.appendChild(nav);

  // état initial
  setActive("studio");
})();