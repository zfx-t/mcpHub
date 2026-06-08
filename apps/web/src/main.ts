import "./styles.css";

const yearElement = document.querySelector<HTMLElement>("[data-current-year]");
if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-nav-link]"));
const sections = navLinks
  .map((link) => {
    const id = link.hash.slice(1);
    const section = id ? document.getElementById(id) : null;
    return section ? { link, section } : null;
  })
  .filter((entry): entry is { link: HTMLAnchorElement; section: HTMLElement } => Boolean(entry));

if ("IntersectionObserver" in window && sections.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      for (const { link, section } of sections) {
        const isCurrent = section === visible.target;
        if (isCurrent) {
          link.setAttribute("aria-current", "true");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    },
    {
      rootMargin: "-20% 0px -65% 0px",
      threshold: [0.1, 0.25, 0.5]
    }
  );

  for (const { section } of sections) {
    observer.observe(section);
  }
}

const copyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-copy-target]"));

for (const button of copyButtons) {
  button.addEventListener("click", async () => {
    const targetId = button.dataset.copyTarget;
    const target = targetId ? document.getElementById(targetId) : null;
    const text = target?.textContent?.trim();

    if (!text || !navigator.clipboard) return;

    const originalLabel = button.textContent ?? "Copy";

    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
      button.setAttribute("aria-live", "polite");
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1600);
    } catch {
      button.textContent = "Copy failed";
      window.setTimeout(() => {
        button.textContent = originalLabel;
      }, 1800);
    }
  });
}
