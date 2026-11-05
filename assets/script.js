const API_URL =
    "https://api.github.com/repos/Stroke-Works/Painty/releases";

const RELEASES_URL =
    "https://github.com/Stroke-Works/Painty/releases";

const downloadButton = document.getElementById("download-button");
const downloadInfo = document.getElementById("download-info");
const downloadError = document.getElementById("download-error");
const versionsList = document.getElementById("versions-list");
const themeToggle = document.getElementById("theme-toggle");

// Theme

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    const isDark = theme === "dark";

    themeToggle.setAttribute(
        "aria-label",
        isDark ? "Switch to light mode" : "Switch to dark mode"
    );

    themeToggle.title = isDark
        ? "Switch to light mode"
        : "Switch to dark mode";
}

const savedTheme = localStorage.getItem("painty-theme");
applyTheme(savedTheme === "dark" ? "dark" : "light");

themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.dataset.theme;
    const nextTheme = currentTheme === "dark" ? "light" : "dark";

    applyTheme(nextTheme);
    localStorage.setItem("painty-theme", nextTheme);
});

// Scroll reveal

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

// Release helpers

function getInstaller(release) {
    const assets = release.assets || [];

    const executables = assets.filter(asset => {
        const name = asset.name.toLowerCase();

        return name.endsWith(".exe") &&
            !/debug|symbols|portable/i.test(name);
    });

    return executables.find(asset =>
        /setup|installer|install|windows/i.test(asset.name)
    ) || executables[0] || null;
}

function formatDate(value) {
    if (!value) return "Unknown date";

    return new Intl.DateTimeFormat("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(new Date(value));
}

function createElement(tag, className, content) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = content;

    return element;
}

// Download button

function setDownloadLink(release) {
    const installer = getInstaller(release);

    if (!installer) {
        downloadButton.href = release.html_url || RELEASES_URL;
        downloadButton.target = "_blank";
        downloadButton.rel = "noopener noreferrer";

        downloadInfo.textContent =
            `Installer unavailable · ${release.tag_name}`;

        downloadError.hidden = false;
        return;
    }

    downloadButton.href = installer.browser_download_url;
    downloadButton.removeAttribute("target");
    downloadButton.removeAttribute("rel");

    downloadInfo.textContent =
        `Windows · Free · ${release.tag_name}`;

    downloadError.hidden = true;
}

// Previous versions

function displayVersions(releases, latest) {
    versionsList.replaceChildren();

    const previousReleases = releases.filter(release =>
        release.id !== latest.id
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
        card.style.transitionDelay = `${index * 0.08}s`;

        const information = document.createElement("div");

        const name = createElement(
            "h3",
            "version-name",
            release.name || release.tag_name || "Untitled release"
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
    const cards = document.querySelectorAll(".version-card");

    if (!("IntersectionObserver" in window)) {
        cards.forEach(card => card.classList.add("is-visible"));
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

// Load GitHub releases

async function loadReleases() {
    try {
        const response = await fetch(API_URL, {
            headers: {
                Accept: "application/vnd.github+json"
            }
        });

        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }

        const releases = await response.json();

        const stableReleases = releases
            .filter(release =>
                !release.draft && !release.prerelease
            )
            .sort((a, b) =>
                new Date(b.published_at) - new Date(a.published_at)
            );

        if (stableReleases.length === 0) {
            throw new Error("No stable releases found.");
        }

        const latest = stableReleases[0];

        setDownloadLink(latest);
        displayVersions(stableReleases, latest);

    } catch (error) {
        console.error("Failed to load Painty releases:", error);

        downloadButton.href = RELEASES_URL;
        downloadButton.target = "_blank";
        downloadButton.rel = "noopener noreferrer";

        downloadInfo.textContent = "Browse releases on GitHub";
        downloadError.hidden = false;

        versionsList.replaceChildren();

        versionsList.appendChild(
            createElement(
                "div",
                "empty-state",
                "Unable to load releases. Please try again later."
            )
        );
    }
}

setupReveal();
loadReleases();