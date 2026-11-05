const API_BASE =
    "https://api.github.com/repos/Stroke-Works/Painty";

const LATEST_RELEASE_URL =
    `${API_BASE}/releases/latest`;

const RELEASES_URL =
    "https://github.com/Stroke-Works/Painty/releases";

const CACHE_KEY = "painty-releases-cache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const downloadButton = document.getElementById("download-button");
const downloadInfo = document.getElementById("download-info");
const downloadError = document.getElementById("download-error");
const versionsList = document.getElementById("versions-list");
const themeToggle = document.getElementById("theme-toggle");


// --------------------------------------------------
// Theme
// --------------------------------------------------

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    const isDark = theme === "dark";

    themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode"
    );

    themeToggle.title = isDark
        ? "Switch to light mode"
        : "Switch theme";
}

const savedTheme = localStorage.getItem("painty-theme");
applyTheme(savedTheme === "dark" ? "dark" : "light");

themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);
    localStorage.setItem("painty-theme", nextTheme);
});


// --------------------------------------------------
// Scroll reveal
// --------------------------------------------------

function setupReveal() {
    const items = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
        items.forEach(item => item.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        }
    }, { threshold: 0.15 });

    items.forEach(item => observer.observe(item));
}


// --------------------------------------------------
// Release helpers
// --------------------------------------------------

function getInstaller(release) {
    const assets = Array.isArray(release.assets)
        ? release.assets
        : [];

    // 1. Prefer a clearly named installer / setup (e.g. PaintySetup-0.3.0.exe)
    const installer = assets.find(asset => {
        const name = asset.name.toLowerCase();
        return (
            name.endsWith(".exe") &&
            !/debug|symbols|portable|sha256|checksum/i.test(name) &&
            /setup|installer|install/i.test(name)
        );
    });

    if (installer) {
        return installer;
    }

    // 2. Fallback: any .exe that is not a debug/symbols/checksum file
    //    (covers the portable "painty.exe")
    return assets.find(asset => {
        const name = asset.name.toLowerCase();
        return (
            name.endsWith(".exe") &&
            !/debug|symbols|sha256|checksum/i.test(name)
        );
    }) || null;
}

function formatDate(value) {
    if (!value) {
        return "Unknown date";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Unknown date";
    }

    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function createElement(tag, className, content) {
    const element = document.createElement(tag);

    element.className = className;
    element.textContent = content;

    return element;
}


// --------------------------------------------------
// Download button
// --------------------------------------------------

function setDownloadLink(release) {
    const installer = getInstaller(release);

    if (!installer) {
        downloadButton.href =
            release.html_url || RELEASES_URL;

        downloadButton.target = "_blank";
        downloadButton.rel = "noopener noreferrer";

        downloadInfo.textContent =
            `Installer unavailable · ${release.tag_name}`;

        downloadError.hidden = false;

        return;
    }

    downloadButton.href =
        installer.browser_download_url;

    downloadButton.removeAttribute("target");
    downloadButton.removeAttribute("rel");

    downloadInfo.textContent =
        `Windows · Free · ${release.tag_name}`;

    downloadError.hidden = true;
}


// --------------------------------------------------
// Previous versions
// --------------------------------------------------

function displayVersions(releases, latest) {
    versionsList.replaceChildren();

    const previousReleases = releases.filter(
        release => release.id !== latest.id
    );

    if (previousReleases.length === 0) {
        versionsList.appendChild(
            createElement(
                "div",
                "empty-state",
                "No previous versions available yet."
            )
        );

        return;
    }

    previousReleases.forEach((release, index) => {
        const card = document.createElement("article");

        card.className = "version-card";
        card.style.transitionDelay =
            `${index * 0.08}s`;

        const information =
            document.createElement("div");

        const name = createElement(
            "h3",
            "version-name",
            release.name ||
            release.tag_name ||
            "Untitled release"
        );

        const date = createElement(
            "p",
            "version-date",
            formatDate(release.published_at)
        );

        information.append(name, date);

        const installer = getInstaller(release);

        const link = document.createElement("a");

        link.className = "version-download";

        link.href = installer
            ? installer.browser_download_url
            : (release.html_url || RELEASES_URL);

        link.target = "_blank";
        link.rel = "noopener noreferrer";

        link.textContent = installer
            ? "Download ↗"
            : "View release ↗";

        card.append(information, link);
        versionsList.appendChild(card);
    });

    observeVersionCards();
}

function observeVersionCards() {
    const cards =
        document.querySelectorAll(".version-card");

    if (!("IntersectionObserver" in window)) {
        cards.forEach(card =>
            card.classList.add("is-visible")
        );

        return;
    }

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            }
        }
    }, { threshold: 0.3 });

    cards.forEach(card => observer.observe(card));
}


// --------------------------------------------------
// GitHub API + cache
// --------------------------------------------------

async function fetchGitHub(url) {
    const response = await fetch(url, {
        headers: {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        }
    });

    if (!response.ok) {
        const error = new Error(
            `GitHub API error: ${response.status}`
        );
        error.status = response.status;
        throw error;
    }

    return response.json();
}

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const { timestamp, data } = JSON.parse(raw);

        if (Date.now() - timestamp > CACHE_TTL_MS) {
            localStorage.removeItem(CACHE_KEY);
            return null;
        }

        return data;
    } catch {
        return null;
    }
}

function writeCache(data) {
    try {
        localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({
                timestamp: Date.now(),
                data
            })
        );
    } catch {
        // Quota exceeded or private mode – ignore
    }
}


// --------------------------------------------------
// Load GitHub releases
// --------------------------------------------------

async function loadReleases() {
    try {
        // Try cache first (avoids rate-limit & speeds up reloads)
        const cached = readCache();
        if (cached && cached.latest && cached.stableReleases) {
            setDownloadLink(cached.latest);
            displayVersions(cached.stableReleases, cached.latest);
            return;
        }

        // Parallel fetch for speed
        const [latest, releases] = await Promise.all([
            fetchGitHub(LATEST_RELEASE_URL),
            fetchGitHub(`${API_BASE}/releases?per_page=100`)
        ]);

        const stableReleases = releases
            .filter(release =>
                !release.draft &&
                !release.prerelease
            )
            .sort((a, b) =>
                new Date(b.published_at) -
                new Date(a.published_at)
            );

        // Make sure the "latest" release is present
        if (!stableReleases.some(
            release => release.id === latest.id
        )) {
            stableReleases.unshift(latest);
        }

        // Persist for next visits
        writeCache({ latest, stableReleases });

        setDownloadLink(latest);
        displayVersions(stableReleases, latest);

    } catch (error) {
        console.error(
            "Failed to load Painty releases:",
            error
        );

        // Fallback UI
        downloadButton.href = RELEASES_URL;
        downloadButton.target = "_blank";
        downloadButton.rel = "noopener noreferrer";

        if (error.status === 403) {
            downloadInfo.textContent =
                "Rate limited · Browse on GitHub";
        } else {
            downloadInfo.textContent =
                "Browse releases on GitHub";
        }

        downloadError.hidden = false;

        versionsList.replaceChildren();

        versionsList.appendChild(
            createElement(
                "div",
                "empty-state",
                error.status === 403
                    ? "GitHub rate limit reached. Please try again in a few minutes or browse the releases page."
                    : "Unable to load releases. Please try again later."
            )
        );
    }
}


// --------------------------------------------------
// Init
// --------------------------------------------------

setupReveal();
loadReleases();
