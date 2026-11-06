const REPO = "Stroke-Works/Painty";
const API_BASE = `https://api.github.com/repos/${REPO}`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

const CACHE_KEY = "painty-releases-cache";
const CACHE_TTL_MS = 60 * 60 * 1000;
const HISTORY_LIMIT = 5;
const THEME_KEY = "painty-theme";

const downloadButton = document.getElementById("download-button");
const downloadInfo = document.getElementById("download-info");
const downloadError = document.getElementById("download-error");
const versionsList = document.getElementById("versions-list");
const themeToggle = document.getElementById("theme-toggle");

// --------------------------------------------------
// Storage helpers (private mode / quota safe)
// --------------------------------------------------

function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function storageRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// --------------------------------------------------
// DOM helpers
// --------------------------------------------------

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function setLink(anchor, href, external = false) {
    anchor.href = href;
    if (external) {
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
    } else {
        anchor.removeAttribute("target");
        anchor.removeAttribute("rel");
    }
}

function revealOnScroll(elements, threshold = 0.15) {
    if (!("IntersectionObserver" in window)) {
        elements.forEach(node => node.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                obs.unobserve(entry.target);
            }
        }
    }, { threshold });

    elements.forEach(node => observer.observe(node));
}

// --------------------------------------------------
// Theme
// --------------------------------------------------

// kind: "ink" (arrow on dark button), "paper" (arrow on card), "bg" (arrow on page background)
function iconSrc(kind) {
    const isDark = document.documentElement.dataset.theme === "dark";
    const useLight = kind === "ink" ? !isDark : isDark;
    return `assets/${useLight ? "down_l" : "down_d"}.svg`;
}

function applyTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = theme;

    document.querySelectorAll("[data-theme-icon]").forEach(icon => {
        icon.src = iconSrc(icon.dataset.themeIcon);
    });

    if (themeToggle) {
        const label = isDark ? "Switch to light mode" : "Switch to dark mode";
        themeToggle.setAttribute("aria-label", label);
        themeToggle.title = label;
    }
}

function initTheme() {
    applyTheme(storageGet(THEME_KEY) === "dark" ? "dark" : "light");

    themeToggle?.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        storageSet(THEME_KEY, next);
    });
}

// --------------------------------------------------
// Release helpers
// --------------------------------------------------

function getInstaller(release) {
    const exes = (release.assets || []).filter(asset => {
        const name = asset.name.toLowerCase();
        return name.endsWith(".exe") && !/debug|symbols|sha256|checksum/.test(name);
    });

    return (
        exes.find(a => /setup|installer|install/i.test(a.name) && !/portable/i.test(a.name)) ||
        exes[0] ||
        null
    );
}

function formatDate(value) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "Unknown date";

    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function externalIcon() {
    const icon = el("img", "theme-icon");
    icon.dataset.themeIcon = "paper";
    icon.src = iconSrc("paper");
    icon.alt = "";
    icon.setAttribute("aria-hidden", "true");
    return icon;
}

// --------------------------------------------------
// Rendering
// --------------------------------------------------

function renderLatest(latest) {
    const installer = getInstaller(latest);

    if (installer) {
        setLink(downloadButton, installer.browser_download_url);
        downloadInfo.textContent = `Windows · Free · ${latest.tag_name}`;
        downloadError.hidden = true;
    } else {
        setLink(downloadButton, latest.html_url || RELEASES_URL, true);
        downloadInfo.textContent = `Installer unavailable · ${latest.tag_name}`;
        downloadError.hidden = false;
    }
}

function buildVersionCard(release, index) {
    const card = el("article", "version-card");
    card.style.transitionDelay = `${index * 0.08}s`;

    const installer = getInstaller(release);

    const info = el("div");
    info.append(
        el("h3", "version-name", release.name || release.tag_name || "Untitled release"),
        el("p", "version-date", formatDate(release.published_at))
    );

    const link = el("a", "version-download");
    link.href = installer ? installer.browser_download_url : (release.html_url || RELEASES_URL);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(installer ? "Download " : "View release ", externalIcon());

    card.append(info, link);
    return card;
}

function renderVersions(stable, latest) {
    const previous = stable
        .filter(release => release.id !== latest.id)
        .slice(0, HISTORY_LIMIT);

    if (previous.length === 0) {
        versionsList.replaceChildren(el("div", "empty-state", "No previous versions available yet."));
        return;
    }

    const cards = previous.map(buildVersionCard);
    versionsList.replaceChildren(...cards);
    revealOnScroll(cards, 0.3);
}

function renderFailure(error) {
    const rateLimited = error.status === 403;

    setLink(downloadButton, RELEASES_URL, true);
    downloadInfo.textContent = rateLimited
        ? "Rate limited · Browse on GitHub"
        : "Browse releases on GitHub";
    downloadError.hidden = false;

    versionsList.replaceChildren(
        el(
            "div",
            "empty-state",
            rateLimited
                ? "GitHub rate limit reached. Please try again in a few minutes or browse the releases page."
                : "Unable to load releases. Please try again later."
        )
    );
}

// --------------------------------------------------
// Data: GitHub API + cache
// --------------------------------------------------

async function getJSON(url) {
    const response = await fetch(url, {
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
    });

    if (!response.ok) {
        const error = new Error(`GitHub API error: ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

function readCache() {
    try {
        const raw = storageGet(CACHE_KEY);
        if (!raw) return null;

        const { timestamp, data } = JSON.parse(raw);

        if (Date.now() - timestamp > CACHE_TTL_MS || !data?.latest || !Array.isArray(data.stable)) {
            storageRemove(CACHE_KEY);
            return null;
        }

        return data;
    } catch {
        return null;
    }
}

function writeCache(data) {
    storageSet(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
}

async function fetchReleases() {
    const [latest, all] = await Promise.all([
        getJSON(`${API_BASE}/releases/latest`),
        getJSON(`${API_BASE}/releases?per_page=100`)
    ]);

    const stable = all.filter(release => !release.draft && !release.prerelease);

    if (!stable.some(release => release.id === latest.id)) {
        stable.push(latest);
    }

    stable.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

    const data = { latest, stable };
    writeCache(data);
    return data;
}

async function loadReleases() {
    try {
        const { latest, stable } = readCache() ?? await fetchReleases();
        renderLatest(latest);
        renderVersions(stable, latest);
    } catch (error) {
        console.error("Failed to load Painty releases:", error);
        renderFailure(error);
    }
}

// --------------------------------------------------
// Init
// --------------------------------------------------

initTheme();
revealOnScroll(document.querySelectorAll(".reveal"));
loadReleases();