function readRoute() {
    const params = new URLSearchParams(location.search);
    const audio = params.get("mode") === "audio";
    const background = params.get("mode") === "background";
    const media = audio || background;
    const mode = audio ? "audio" : background ? "background" : "classic";
    const level = ["easy", "hard"].includes(params.get("difficulty")) ? params.get("difficulty") : "medium";
    const path = media ? "/api/" + mode : "/api";
    const query = media ? "?difficulty=" + level : "";
    return {
        mode, media, audio, background, level, path, query,
        gameUrl: path + "/game" + query + (media ? "&" : "?") + "include_backgrounds=false",
        limit: audio ? 6 : 10,
        label: tr(audio ? "Audio" : background ? "Background" : "Classic"),
        storageKey: media ? "catchdle_" + mode + "_" + level + "_game" : "catchdle_daily_game"
    };
}

let route = readRoute();
let navigation;
const pendingGuesses = new Map();
const SEARCH_URL = "/api/search";

const CLUE_STATS_ATTEMPT = 3;
const CLUE_DIFFICULTY_ATTEMPT = 5;
const CLUE_BACKGROUND_ATTEMPT = 9;

const STAR_CLOSE_RANGE = 0.50;
const BPM_CLOSE_RANGE = 20;
const LENGTH_CLOSE_RANGE = 15;

let secretMap = null; // Only populated after the server marks the game finished.
let selectedMap = null;
let gameState = null;
let currentUser = null;
let messageTimeout = null;
let countdownInterval = null;

const mapInput = document.getElementById("mapInput");
const suggestions = document.getElementById("suggestions");
const guessButton = document.getElementById("guessButton");
const attemptsContainer = document.getElementById("attempts");
const attemptCount = document.getElementById("attemptCount");
const message = document.getElementById("message");
const winScreen = document.getElementById("winScreen");
const backgroundCollage = document.getElementById("backgroundCollage");

function normalize(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getColombiaDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function saveGameState() {
    try {
        localStorage.setItem(
            route.storageKey,
            JSON.stringify(gameState)
        );
    } catch (error) {
        console.error(
            "Error guardando partida:",
            error
        );
    }
}

function createGameState(serverState = {}) {
    gameState = {
        date: serverState.date || getColombiaDate(),
        attempts: Array.isArray(serverState.attempts) ? serverState.attempts : [],
        won: Boolean(serverState.won),
        clues: serverState.clues || { stats: false, difficulty: false, background: false }
    };
    saveGameState();
    return gameState;
}

function getCover(map) {
    if (!map) {
        return "";
    }

    return (
        map.cover_url ||
        `https://assets.ppy.sh/beatmaps/${map.beatmapset_id}/covers/cover.jpg`
    );
}

function getBackground(map) {
    if (!map) {
        return "";
    }

    return (
        map.background_url ||
        map.bg_url ||
        getCover(map)
    );
}

function formatDuration(seconds) {
    const total =
        Math.max(
            0,
            Math.round(Number(seconds) || 0)
        );

    const minutes =
        Math.floor(total / 60);

    const secs =
        total % 60;

    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getDuration(map) {
    return map
        ? Number(map.duration) || 0
        : 0;
}

function getStars(map) {
    return Number(map?.stars ?? 0);
}

function getBPM(map) {
    return Number(map?.bpm ?? 0);
}

function getLength(map) {
    return getDuration(map);
}

function compareText(a, b) {
    return normalize(a) === normalize(b)
        ? "correct"
        : "wrong";
}

function compareNumber(
    value,
    correct,
    closeRange
) {
    const guess = Number(value);

    if (
        Math.abs(guess - correct) < 0.001
    ) {
        return {
            status: "correct",
            arrow: ""
        };
    }

    if (
        Math.abs(guess - correct) <= closeRange
    ) {
        return {
            status: "close",
            arrow:
                guess < correct
                    ? "↑"
                    : "↓"
        };
    }

    return {
        status: "wrong",
        arrow:
            guess < correct
                ? "↑"
                : "↓"
    };
}

function createCell(
    value,
    status,
    arrow = ""
) {
    const cell =
        document.createElement("div");

    cell.className =
        `result-cell ${status}`;

    cell.innerHTML =
        `<span>${escapeHTML(value)}</span>` +
        (
            arrow
                ? `<span class="arrow">${arrow}</span>`
                : ""
        );

    return cell;
}
function renderAttempt(attempt) {
    const map = attempt?.map;
    if (!map || !attemptsContainer) return;
    const comparison = attempt.comparison || {};
    const row = document.createElement("div");
    row.className = "attempt-row";

    const mapCell = document.createElement("div");
    mapCell.className = "attempt-map";
    const image = document.createElement("img");
    image.className = "attempt-cover";
    image.src = getCover(map);
    image.alt = map.title || tr("Beatmap");
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.onerror = function () { this.style.display = "none"; };

    const mapInfo = document.createElement("div");
    mapInfo.className = "attempt-map-info";
    const title = document.createElement("div");
    title.className = "attempt-title";
    title.textContent = map.title || tr("Unknown");
    const mapper = document.createElement("div");
    mapper.className = "attempt-map-mapper";
    mapper.textContent = map.mapper || tr("Unknown");
    mapInfo.append(title, mapper);
    mapCell.append(image, mapInfo);
    row.appendChild(mapCell);

    if (route.media) {
        const matched = route.audio ? attempt.correct : map.beatmapset_id === secretMap?.beatmapset_id;
        row.appendChild(createCell(tr(matched ? "Correct" : "Incorrect"), matched ? "correct" : "wrong"));
        attemptsContainer.prepend(row);
        return;
    }
    row.appendChild(createCell(map.artist || "-", comparison.artist || "wrong"));
    row.appendChild(createCell(map.mapper || "-", comparison.mapper || "wrong"));
    row.appendChild(createCell(twoDecimals.format(map.stars || 0), comparison.stars?.status || "wrong", comparison.stars?.arrow || ""));
    row.appendChild(createCell(twoDecimals.format(map.bpm || 0), comparison.bpm?.status || "wrong", comparison.bpm?.arrow || ""));
    row.appendChild(createCell(formatDuration(map.duration), comparison.length?.status || "wrong", comparison.length?.arrow || ""));
    row.appendChild(createCell(map.ranked_year ?? "—", comparison.year?.status || "", comparison.year?.arrow || ""));
    attemptsContainer.prepend(row);
}

const summaryFields = [
    ["Artist", "artist"], ["Mapper", "mapper"], ["Stars", "stars"],
    ["BPM", "bpm"], ["Length", "length", "duration"], ["Year", "year", "ranked_year"]
];

function summarizeField(attempts, field, mapKey) {
    let lower = null;
    let upper = null;
    for (const attempt of attempts) {
        const value = attempt.map?.[mapKey];
        const hint = attempt.comparison?.[field];
        if (value == null || !hint) continue;
        if (hint === "correct" || hint.status === "correct") {
            return { exact: value };
        }
        if (hint.arrow === "↑" && (lower === null || value > lower.value)) lower = { value, status: hint.status };
        if (hint.arrow === "↓" && (upper === null || value < upper.value)) upper = { value, status: hint.status };
    }
    return { lower, upper };
}

function renderGuessSummary() {
    if (route.media) return;
    const panel = document.getElementById("classicSummary");
    const attempts = gameState?.attempts || [];
    panel.hidden = attempts.length === 0;
    const list = document.getElementById("summaryValues");
    list.replaceChildren();
    if (panel.hidden) return;
    for (const [label, field, mapKey = field] of summaryFields) {
        const result = summarizeField(attempts, field, mapKey);
        const format = value => {
            if (field === "length") return formatDuration(value);
            if (field === "stars" || field === "bpm") return twoDecimals.format(value);
            return String(value);
        };
        const group = document.createElement("div");
        const title = document.createElement("dt");
        title.textContent = tr(label);
        const data = document.createElement("dd");
        if (result.exact !== undefined) {
            data.className = "exact";
            data.textContent = "✓ " + format(result.exact);
        } else {
            for (const [bound, arrow] of [[result.lower, "↑"], [result.upper, "↓"]]) {
                if (!bound) continue;
                const span = document.createElement("span");
                span.textContent = format(bound.value) + " " + arrow;
                if (bound.status === "close") span.className = "near";
                data.append(span);
            }
            if (!data.childElementCount) data.textContent = "—";
        }
        group.append(title, data);
        list.append(group);
    }
}

function renderHistory() {
    renderGuessSummary();

    if (!attemptsContainer) {
        return;
    }

    attemptsContainer.innerHTML = "";


    if (!gameState) {
        return;
    }


    if (!Array.isArray(gameState.attempts)) {

        gameState.attempts = [];

        saveGameState();

    }


    gameState.attempts.forEach(
        attempt => {

            if (
                attempt &&
                attempt.map
            ) {

                renderAttempt(attempt);

            }

        }
    );

}


/* =========================================================
   CLUE BUTTONS
   ========================================================= */

const clueButtons = [
    { key: "stats", id: "clueStats", threshold: CLUE_STATS_ATTEMPT },
    { key: "difficulty", id: "clueDifficulty", threshold: CLUE_DIFFICULTY_ATTEMPT },
    { key: "background", id: "clueBackground", threshold: CLUE_BACKGROUND_ATTEMPT }
];

function updateClueButtons() {
    for (const { key, id, threshold } of clueButtons) {
        const button = document.getElementById(id);
        const panel = document.getElementById(button.getAttribute("aria-controls"));
        const available = Boolean(gameState?.clues?.[key]);
        if (!available) panel.classList.add("hidden");
        const expanded = !panel.classList.contains("hidden");
        button.disabled = !available;
        button.classList.toggle("locked", !available);
        button.classList.toggle("available", available);
        button.setAttribute("aria-expanded", String(expanded));
        document.getElementById(id + "Status").textContent = available
            ? tr(expanded ? "Hide clue" : "Show clue")
            : tr("After {n} guesses", {n: threshold});
    }
}

function applyServerClues(clueData = {}, clues = {}) {
    if (clues.stats) {
        [["clueCS", clueData.cs], ["clueAR", clueData.ar], ["clueOD", clueData.od], ["clueHP", clueData.hp]].forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el && value !== undefined) el.textContent = twoDecimals.format(value);
        });
    }
    if (clues.difficulty && clueData.difficulty_name !== undefined) {
        const el = document.getElementById("clueDifficultyValue");
        if (el) el.textContent = clueData.difficulty_name || tr("Unknown");
    }
    if (clues.background && clueData.background_url) {
        const el = document.getElementById("clueBackgroundImage");
        if (el) el.src = clueData.background_url;
    }
}

/* =========================================================
   SEARCH MAPS
   ========================================================= */

let searchTimer = null;

function searchMaps(query) {
    const normalized = normalize(query);
    const searchRoute = route;
    if (searchTimer) clearTimeout(searchTimer);
    if (normalized.length < 2) {
        if (suggestions) { suggestions.innerHTML = ""; suggestions.classList.add("hidden"); }
        return;
    }
    searchTimer = setTimeout(async () => {
        try {
            const response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(normalized)}`, { credentials: "include", cache: "no-store" });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || "Search failed");
            if (!suggestions || searchRoute !== route || normalize(mapInput.value) !== normalized) return;
            suggestions.replaceChildren();
            const results = Array.isArray(data.results) ? data.results : [];
            if (!results.length) { suggestions.classList.add("hidden"); return; }
            results.forEach(map => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "suggestion";
                const img = document.createElement("img");
                img.className = "suggestion-cover";
                img.src = getCover(map);
                img.alt = "";
                img.loading = "lazy";
                img.referrerPolicy = "no-referrer";
                const info = document.createElement("div");
                info.className = "suggestion-info";
                const title = document.createElement("div");
                title.className = "suggestion-title";
                title.textContent = map.title || "-";
                const details = document.createElement("div");
                details.className = "suggestion-details";
                details.textContent = `${map.artist || "-"} · ${map.mapper || "-"}`;
                info.append(title, details);
                item.append(img, info);
                item.addEventListener("click", () => selectMap(map));
                suggestions.appendChild(item);
            });
            suggestions.classList.remove("hidden");
        } catch (error) {
            if (searchRoute !== route) return;
            console.error("Search error:", error);
            suggestions?.classList.add("hidden");
        }
    }, 180);
}

/* =========================================================
   SELECT MAP
   ========================================================= */

function selectMap(map) {

    selectedMap =
        map;


    if (mapInput) {

        mapInput.value =
            `${map.title} — ${map.artist}`;

    }


    if (suggestions) {

        suggestions.innerHTML =
            "";

        suggestions.classList.add(
            "hidden"
        );

    }


    if (guessButton) {

        guessButton.disabled =
            false;

    }

}
/* =========================================================
   MAKE GUESS
   ========================================================= */

async function makeGuess() {
    if (pendingGuesses.has(route.gameUrl) || !selectedMap || !gameState || gameState.won || gameState.attempts.length >= route.limit) return;
    const guessedMap = selectedMap;
    const submittedRoute = route;
    guessButton.disabled = true;
    mapInput.disabled = true;
    try {
        const request = fetch(route.path + "/guess" + route.query, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ beatmapset_id: guessedMap.beatmapset_id, date: gameState.date })
        });
        pendingGuesses.set(route.gameUrl, request);
        const response = await request;
        const data = await response.json();
        if (submittedRoute !== route) return;
        if (!response.ok || !data.success) throw new Error(data.error || data.detail || "Could not process guess.");
        if (route.media) {
            applyGameState(data);
            if (!data.finished) showMessage("Incorrect guess.", "normal");
            return;
        }
        if (data.attempt) gameState.attempts.push(data.attempt);
        gameState.clues = data.clues || gameState.clues;
        gameState.won = Boolean(data.won);
        if (data.answer) secretMap = data.answer;
        saveGameState();
        if (data.attempt) {
            renderAttempt(data.attempt);
            renderGuessSummary();
        }
        updateAttemptCounter();
        updateClueButtons();
        applyServerClues(data.clue_data || {}, gameState.clues);
        if (data.correct) showWinScreen();
        else if (data.finished || data.attempts >= route.limit) showLoseScreen();
        else showMessage("Incorrect guess.", "normal");
    } catch (error) {
        if (submittedRoute !== route) return;
        console.error("Error processing guess:", error);
        showMessage(error.message || "Could not process guess.", "error");
    } finally {
        pendingGuesses.delete(submittedRoute.gameUrl);
        if (submittedRoute !== route) return;
        selectedMap = null;
        mapInput.disabled = gameState.won || gameState.attempts.length >= route.limit;
        mapInput.value = "";
        suggestions?.replaceChildren();
        suggestions?.classList.add("hidden");
        guessButton.disabled = true;
    }
}

/* =========================================================
   BACKGROUND COLLAGE
   ========================================================= */

function createBackgroundCollage(backgrounds = [], container = backgroundCollage, limit = 30) {
    if (!container) return;
    container.replaceChildren();
    (Array.isArray(backgrounds) ? backgrounds : []).slice(0, limit).forEach((url, index) => {
        if (typeof url !== "string" || !/^https:\/\/(assets\.ppy\.sh|osu\.ppy\.sh)\//.test(url)) return;
        const tile = document.createElement("div");
        tile.className = "background-tile";
        tile.style.setProperty("--tile-index", index);
        const image = document.createElement("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.draggable = false;
        image.referrerPolicy = "no-referrer";
        image.onerror = function () { this.style.display = "none"; };
        tile.appendChild(image);
        container.appendChild(tile);
    });
}

/* =========================================================
   LOAD CURRENT USER
   ========================================================= */

async function loadCurrentUser() {
    const response = await fetch("/api/me", { credentials: "include", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    currentUser = data.logged_in ? data.user : null;
    if (!currentUser) {
        document.body.classList.replace("session-pending", "at-login");
        return;
    }

    const avatar = document.getElementById("userAvatar");
    const fallbackAvatar = "https://osu.ppy.sh/images/layout/avatar-guest.png";
    avatar.onerror = () => {
        avatar.onerror = null;
        avatar.src = fallbackAvatar;
    };
    avatar.src = currentUser.avatar_url || fallbackAvatar;
    avatar.alt = currentUser.username || tr("Avatar");
    document.getElementById("username").textContent = currentUser.username || tr("User");
    document.getElementById("loggedUser").classList.remove("hidden");
    document.body.classList.remove("session-pending");
}

/* =========================================================
   LEADERBOARD
   ========================================================= */

async function loadLeaderboard() {
    const openedRoute = route;

    const body =
        document.getElementById(
            "leaderboardBody"
        );


    if (!body) {
        return;
    }


    body.innerHTML = `
        <tr>
            <td
                colspan="${route.media ? 5 : 6}"
                class="leaderboard-loading"
            >
                ${tr("Loading leaderboard...")}
            </td>
        </tr>
    `;


    try {

        const response =
            await fetch(
                "/api/leaderboard?mode=" + route.mode,
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );


        const data =
            await response.json();
        if (openedRoute !== route) return;


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.detail ||
                "Could not load leaderboard."
            );

        }


        const leaderboard =
            Array.isArray(
                data.leaderboard
            )
                ? data.leaderboard
                : [];


        if (
            leaderboard.length === 0
        ) {

            body.innerHTML = `
                <tr>
                    <td
                        colspan="${route.media ? 5 : 6}"
                        class="leaderboard-empty"
                    >
                        ${tr("No players yet.")}
                    </td>
                </tr>
            `;

            return;

        }


        body.innerHTML =
            leaderboard
                .map(
                    player => {

                        const rank =
                            Number(
                                player.rank
                            ) || 0;


                        const rankClass =
                            rank <= 3
                                ? `rank-${rank}`
                                : "";


                        const avatar =
                            escapeHTML(
                                player.avatar_url ||
                                "https://osu.ppy.sh/images/layout/avatar-guest.png"
                            );


                        const username =
                            escapeHTML(
                                player.username ||
                                tr("Unknown")
                            );


                        const country =
                            escapeHTML(
                                player.country ||
                                ""
                            );


                        const points =
                            Number(
                                player.total_points
                            ) || 0;


                        const wins =
                            Number(
                                player.wins
                            ) || 0;


                        const games =
                            Number(
                                player.games
                            ) || 0;


                        const winRate =
                            Number(
                                player.win_rate
                            ) || 0;


                        return `
                            <tr>

                                <td
                                    class="rank-cell ${rankClass}"
                                >
                                    ${rank}
                                </td>

                                <td>

                                    <div class="player-cell">

                                        <img
                                            class="player-avatar"
                                            src="${avatar}"
                                            alt=""
                                        >

                                        <div
                                            class="player-info"
                                        >

                                            <div
                                                class="player-name"
                                            >
                                                ${Number(player.osu_id) === Number(currentUser?.id)
                                                    ? `<button type="button" class="ranking-profile" data-open-profile>${username}</button>`
                                                    : username}
                                            </div>

                                            <div
                                                class="player-country"
                                            >
                                                ${country}
                                            </div>

                                        </div>

                                    </div>

                                </td>

                                ${route.media ? "" : `<td class="points-cell">${points}</td>`}

                                <td>
                                    ${wins}
                                </td>

                                <td>
                                    ${games}
                                </td>

                                <td>
                                    ${percent.format(winRate / 100)}
                                </td>

                            </tr>
                        `;

                    }
                )
                .join("");


    } catch (error) {
        if (openedRoute !== route) return;

        console.error(
            "Error loading leaderboard:",
            error
        );


        body.innerHTML = `
            <tr>
                <td
                    colspan="${route.media ? 5 : 6}"
                    class="leaderboard-error"
                >
                    ${tr("Could not load leaderboard.")}
                </td>
            </tr>
        `;

    }

}
/* =========================================================
   OPEN / CLOSE LEADERBOARD
   ========================================================= */

function openLeaderboard() {

    const modal =
        document.getElementById(
            "leaderboardModal"
        );


    if (!modal) {
        return;
    }


    modal.querySelector("h2").textContent = tr("{mode} leaderboard", {mode: route.label});
    modal.querySelector("th:nth-child(3)").classList.toggle("hidden", route.media);
    modal.classList.remove(
        "hidden"
    );


    loadLeaderboard();

}


function closeLeaderboard() {

    const modal =
        document.getElementById(
            "leaderboardModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.add(
        "hidden"
    );

}


/* =========================================================
   PROFILE / STATISTICS
   ========================================================= */

async function loadStats() {
    const openedRoute = route;

    const statsMessage =
        document.getElementById(
            "statsMessage"
        );


    if (!currentUser) {

        if (statsMessage) {

            statsMessage.textContent =
                tr("You must be logged in.");

        }

        return;

    }


    try {

        const response =
            await fetch(
                "/api/stats?mode=" + route.mode,
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );


        const data =
            await response.json();
        if (openedRoute !== route) return;


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.detail ||
                data.error ||
                "Could not load statistics."
            );

        }


        const user =
            data.user || {};


        const stats =
            data.stats || {};


        const statsAvatar =
            document.getElementById(
                "statsAvatar"
            );


        const statsUsername =
            document.getElementById(
                "statsUsername"
            );


        const statPoints =
            document.getElementById(
                "statPoints"
            );


        const statWins =
            document.getElementById(
                "statWins"
            );


        const statGames =
            document.getElementById(
                "statGames"
            );


        const statWinRate =
            document.getElementById(
                "statWinRate"
            );


        const statAverageAttempts =
            document.getElementById(
                "statAverageAttempts"
            );


        const statLosses =
            document.getElementById(
                "statLosses"
            );


        const statCurrentStreak =
            document.getElementById(
                "statCurrentStreak"
            );


        const statBestStreak =
            document.getElementById(
                "statBestStreak"
            );


        if (statsAvatar) {
            statsAvatar.onerror = () => {
                statsAvatar.onerror = null;
                statsAvatar.src = "https://osu.ppy.sh/images/layout/avatar-guest.png";
            };
            statsAvatar.src = user.avatar_url || currentUser.avatar_url || "https://osu.ppy.sh/images/layout/avatar-guest.png";
        }


        if (statsUsername) {

            statsUsername.textContent =
                user.username ||
                currentUser.username ||
                tr("Player");

        }


        if (statPoints) {

            statPoints.textContent =
                Number(
                    stats.total_points
                ) || 0;

        }


        if (statWins) {

            statWins.textContent =
                Number(
                    stats.wins
                ) || 0;

        }


        if (statGames) {

            statGames.textContent =
                Number(
                    stats.games
                ) || 0;

        }


        if (statWinRate) {

            statWinRate.textContent = percent.format((Number(stats.win_rate) || 0) / 100);

        }


        if (statAverageAttempts) {

            statAverageAttempts.textContent = twoDecimals.format(Number(stats.average_attempts) || 0);

        }


        if (statLosses) {

            statLosses.textContent =
                Number(
                    stats.losses
                ) || 0;

        }


        if (statCurrentStreak) {

            statCurrentStreak.textContent =
                Number(
                    stats.current_streak
                ) || 0;

        }


        if (statBestStreak) {

            statBestStreak.textContent =
                Number(
                    stats.best_streak
                ) || 0;

        }


        if (statsMessage) {

            statsMessage.textContent =
                "";

        }


    } catch (error) {
        if (openedRoute !== route) return;

        console.error(
            "Error loading statistics:",
            error
        );


        if (statsMessage) {

            statsMessage.textContent =
                tr("Could not load statistics.");

        }

    }

}


/* =========================================================
   OPEN / CLOSE STATISTICS
   ========================================================= */

async function openStats() {

    const modal =
        document.getElementById(
            "statsModal"
        );


    if (!modal) {
        return;
    }


    document.getElementById("statsTitle").textContent = tr("{mode} statistics", {mode: route.label});
    document.getElementById("statPoints").parentElement.classList.toggle("hidden", route.media);
    modal.classList.remove(
        "hidden"
    );


    await loadStats();

}


function closeStats() {

    const modal =
        document.getElementById(
            "statsModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.add(
        "hidden"
    );

}


/* =========================================================
   PROFILE BUTTON
   ========================================================= */

document.getElementById("profileButton").addEventListener("click", openStats);
document.getElementById("leaderboardBody").addEventListener("click", event => {
    if (event.target.closest("[data-open-profile]")) {
        closeLeaderboard();
        openStats();
    }
});

const closeStatsButton =
    document.getElementById(
        "closeStats"
    );


const closeStatsBottom =
    document.getElementById(
        "closeStatsBottom"
    );


const statsModal =
    document.getElementById(
        "statsModal"
    );


if (closeStatsButton) {

    closeStatsButton.addEventListener(
        "click",
        closeStats
    );

}


if (closeStatsBottom) {

    closeStatsBottom.addEventListener(
        "click",
        closeStats
    );

}


if (statsModal) {

    statsModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                statsModal
            ) {

                closeStats();

            }

        }
    );

}


/* =========================================================
   GAME UI HELPERS
   ========================================================= */

function updateAttemptCounter() {
    const current = Array.isArray(gameState?.attempts)
        ? gameState.attempts.length
        : 0;
    if (route.media) {
        if (attemptCount) attemptCount.textContent = current;
    } else {
        const number = gameState?.won ? current : Math.min(current + 1, route.limit);
        attemptCount.textContent = tr("Guess {n}/{max}", { n: number, max: route.limit });
    }
}

function showMessage(text, type = "normal") {
    if (!message) return;
    const key = String(text ?? "");
    const fallback = /new daily|new song/i.test(key) ? "A new challenge is ready. Refresh to play." : "Try again in a moment.";
    message.textContent = tr(dictionary.has(key) ? key : fallback);
    message.className = "message";
    if (type) message.classList.add(type);
    message.classList.remove("hidden");
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => message.classList.add("hidden"), 2500);
}

function endGameUI() {
    if (guessButton) guessButton.disabled = true;
    if (mapInput) mapInput.disabled = true;
    if (suggestions) {
        suggestions.replaceChildren();
        suggestions.classList.add("hidden");
    }
    selectedMap = null;
}

function getFinishedAnswer() {
    return secretMap || null;
}

function showWinScreen() {
    endGameUI();
    const screen = document.getElementById("winScreen");
    const answer = getFinishedAnswer();
    if (!screen || !answer) return;

    const cover = document.getElementById("winCover");
    const title = document.getElementById("winMapTitle");
    const artist = document.getElementById("winArtist");
    const mapper = document.getElementById("winMapper");
    const osuLink = document.getElementById("winOsuLink");

    if (cover) {
        cover.src = getCover(answer);
        cover.alt = answer.title || tr("Beatmap cover");
    }
    if (title) title.textContent = answer.title || "-";
    if (artist) artist.textContent = answer.artist || "-";
    if (mapper) mapper.textContent = tr("Mapped by {mapper}", {mapper: answer.mapper || "-"});
    if (osuLink) {
        osuLink.href = answer.url || (answer.beatmapset_id
            ? `https://osu.ppy.sh/beatmapsets/${answer.beatmapset_id}`
            : "#");
    }

    const heading = screen.querySelector(".win-title");
    const attemptsText = screen.querySelector(".win-attempts");
    if (heading) heading.textContent = tr("Got it!");
    if (attemptsText) attemptsText.textContent = tr("Solved on guess {n}.", {n: gameState.attempts.length});

    screen.classList.remove("hidden");
    startCountdown();
}

function showLoseScreen() {
    endGameUI();
    const screen = document.getElementById("winScreen");
    const answer = getFinishedAnswer();
    if (!screen || !answer) return;

    const cover = document.getElementById("winCover");
    const title = document.getElementById("winMapTitle");
    const artist = document.getElementById("winArtist");
    const mapper = document.getElementById("winMapper");
    const osuLink = document.getElementById("winOsuLink");

    if (cover) {
        cover.src = getCover(answer);
        cover.alt = answer.title || tr("Beatmap cover");
    }
    if (title) title.textContent = answer.title || "-";
    if (artist) artist.textContent = answer.artist || "-";
    if (mapper) mapper.textContent = tr("Mapped by {mapper}", {mapper: answer.mapper || "-"});
    if (osuLink) {
        osuLink.href = answer.url || (answer.beatmapset_id
            ? `https://osu.ppy.sh/beatmapsets/${answer.beatmapset_id}`
            : "#");
    }

    const heading = screen.querySelector(".win-title");
    const attemptsText = screen.querySelector(".win-attempts");
    if (heading) heading.textContent = tr("Out of guesses");
    if (attemptsText) attemptsText.textContent = tr("The answer was {title}.", {title: answer.title || tr("Unknown")});

    screen.classList.remove("hidden");
    startCountdown();
}

/* =========================================================
   COUNTDOWN
   ========================================================= */

function getNextMidnight(date) {
    const midnight = new Date(date + "T00:00:00-05:00");
    midnight.setUTCDate(midnight.getUTCDate() + 1);
    return midnight;
}

function updateCountdown() {
    const element = document.getElementById("winCountdown");
    if (!element) return;

    const next = getNextMidnight(gameState?.date || getColombiaDate());
    const difference = Math.max(0, next.getTime() - Date.now());

    const totalSeconds =
        Math.floor(
            difference / 1000
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    element.textContent =
        [
            hours,
            minutes,
            seconds
        ]
            .map(
                value =>
                    String(
                        value
                    ).padStart(
                        2,
                        "0"
                    )
            )
            .join(":");

}


function startCountdown() {

    clearInterval(
        countdownInterval
    );


    updateCountdown();


    countdownInterval =
        setInterval(
            updateCountdown,
            1000
        );

}


/* =========================================================
   SEARCH EVENTS
   ========================================================= */

if (mapInput) {

    mapInput.addEventListener(
        "input",
        event => {

            searchMaps(
                event.target.value
            );

        }
    );


    mapInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();


                if (
                    selectedMap
                ) {

                    makeGuess();

                }

            }

        }
    );

}


/* =========================================================
   GUESS BUTTON
   ========================================================= */

if (guessButton) {

    guessButton.addEventListener(
        "click",
        makeGuess
    );

}


/* =========================================================
   CLOSE SUGGESTIONS
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        if (
            !mapInput ||
            !suggestions
        ) {
            return;
        }


        const searchArea =
            mapInput.closest(
                ".search-area"
            );


        if (
            searchArea &&
            !searchArea.contains(
                event.target
            )
        ) {

            suggestions.classList.add(
                "hidden"
            );

        }

    }
);


/* =========================================================
   CLUE EVENTS
   ========================================================= */

for (const { id } of clueButtons) {
    const button = document.getElementById(id);
    button.addEventListener("click", () => {
        if (button.disabled) return;
        document.getElementById(button.getAttribute("aria-controls")).classList.toggle("hidden");
        updateClueButtons();
    });
}

/* =========================================================
   LEADERBOARD EVENTS
   ========================================================= */

const leaderboardButton =
    document.getElementById(
        "leaderboardButton"
    );


const closeLeaderboardButton =
    document.getElementById(
        "closeLeaderboard"
    );


const closeLeaderboardBottom =
    document.getElementById(
        "closeLeaderboardBottom"
    );


const leaderboardModal =
    document.getElementById(
        "leaderboardModal"
    );


if (leaderboardButton) {

    leaderboardButton.addEventListener(
        "click",
        openLeaderboard
    );

}


if (closeLeaderboardButton) {

    closeLeaderboardButton.addEventListener(
        "click",
        closeLeaderboard
    );

}


if (closeLeaderboardBottom) {

    closeLeaderboardBottom.addEventListener(
        "click",
        closeLeaderboard
    );

}


if (leaderboardModal) {

    leaderboardModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                leaderboardModal
            ) {

                closeLeaderboard();

            }

        }
    );

}


/* =========================================================
   ESCAPE KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {

            closeLeaderboard();

            closeStats();

        }

    }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

function applyGameState(data) {
    gameState = createGameState(data);
    secretMap = data.answer || null;
    if (route.audio && data.audio) {
        const player = document.getElementById("songPlayer");
        document.getElementById("clipLength").textContent = tr("{n} s", {n: data.seconds});
        if (player.getAttribute("src") !== data.audio) player.src = data.audio;
    }
    if (route.background && data.image) {
        const image = document.getElementById("bgCrop");
        if (image.getAttribute("src") !== data.image) image.src = data.image;
    }
    applyServerClues(data.clue_data || {}, gameState.clues);
    renderHistory();
    updateAttemptCounter();
    updateClueButtons();
    mapInput.disabled = Boolean(data.finished);
    if (data.finished) {
        if (gameState.won) showWinScreen();
        else showLoseScreen();
    }
    return data;
}

async function loadCovers(container, limit, signal) {
    try {
        const response = await fetch("/api/backgrounds", { cache: "no-store", signal });
        if (response.ok) {
            const data = await response.json();
            if (!signal?.aborted) createBackgroundCollage(data.backgrounds, container, limit);
        }
    } catch (error) {
        if (!signal?.aborted) console.warn("Could not load covers", error);
    }
}

function setupMedia() {
    const player = document.getElementById("songPlayer");
    setupClipControls(player);
    const retryAudio = document.getElementById("retryAudio");
    player.onerror = () => { if (route.audio && player.getAttribute("src")) retryAudio.hidden = false; };
    player.onloadeddata = () => { retryAudio.hidden = true; };
    retryAudio.onclick = () => player.load();
    const crop = document.getElementById("bgCrop");
    const retryCrop = document.getElementById("retryCrop");
    crop.onerror = () => { if (route.background && crop.getAttribute("src")) retryCrop.hidden = false; };
    crop.onload = () => { retryCrop.hidden = true; };
    retryCrop.onclick = () => { crop.src = crop.src; };
    document.getElementById("retryGame").onclick = navigateGame;
}

function prepareGame() {
    gameState = null;
    secretMap = null;
    clearTimeout(searchTimer);
    clearTimeout(messageTimeout);
    clearInterval(countdownInterval);
    endGameUI();
    mapInput.value = "";
    attemptsContainer.replaceChildren();
    winScreen.classList.add("hidden");
    closeStats();
    closeLeaderboard();
    document.getElementById("classicSummary").hidden = true;
    updateClueButtons();
    const player = document.getElementById("songPlayer");
    if (player.hasAttribute("src")) {
        player.pause();
        player.removeAttribute("src");
        player.load();
    }
    document.getElementById("bgCrop").removeAttribute("src");
    for (const id of ["retryGame", "retryAudio", "retryCrop"]) document.getElementById(id).hidden = true;
    document.body.classList.toggle("media-mode", route.media);
    document.getElementById("audioPuzzle").hidden = !route.audio;
    document.getElementById("bgPuzzle").hidden = !route.background;
    document.getElementById("mediaLevels").hidden = !route.media;
    document.getElementById("clipLength").textContent = tr("Loading today’s clip…");
    document.querySelector(".hero .subtitle").textContent = tr(route.audio ? "Which song is playing?" :
        route.background ? "Which beatmapset is this background from?" : "Guess the daily osu!catch beatmapset.");
    const counter = attemptCount.parentElement;
    const searchArea = document.querySelector(".search-area");
    if (route.media) searchArea.after(counter);
    else searchArea.before(counter);
    document.getElementById("attemptSuffix").hidden = !route.media;
    document.getElementById("attemptLimit").textContent = route.limit;
    updateAttemptCounter();
    for (const link of document.querySelectorAll(".game-modes a, #mediaLevels a")) {
        const url = new URL(location.href);
        let active;
        if (link.closest("#mediaLevels")) {
            const level = new URL(link.href).searchParams.get("difficulty");
            url.searchParams.set("difficulty", level);
            active = level === route.level;
        } else {
            const mode = new URL(link.href).searchParams.get("mode");
            url.searchParams.set("mode", mode);
            url.searchParams.delete("difficulty");
            active = mode === route.mode;
        }
        link.href = url.href;
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    }
    message.textContent = tr("Loading…");
    message.className = "message";
}

async function navigateGame() {
    navigation?.abort();
    navigation = new AbortController();
    const { signal } = navigation;
    route = readRoute();
    prepareGame();
    try {
        const previousGuess = pendingGuesses.get(route.gameUrl);
        if (previousGuess) await previousGuess.catch(() => {});
        if (signal.aborted) return;
        const response = await fetch(route.gameUrl, { credentials: "include", cache: "no-store", signal });
        if (signal.aborted) return;
        if (response.status === 401) { location.reload(); return; }
        const data = await response.json();
        if (signal.aborted) return;
        if (!response.ok || !data.success) throw new Error(data.detail || data.error);
        applyGameState(data);
        message.textContent = "";
        loadCovers(backgroundCollage, 30, signal);
    } catch (error) {
        if (signal.aborted) return;
        message.textContent = tr("Try again in a moment.");
        document.getElementById("retryGame").hidden = false;
    }
}

document.addEventListener("click", event => {
    const link = event.target.closest(".game-modes a, #mediaLevels a");
    if (!currentUser || !link || event.defaultPrevented || event.button !== 0 ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (link.href === location.href && gameState) return;
    if (link.href !== location.href) history.pushState(null, "", link.href);
    navigateGame();
});
window.addEventListener("popstate", () => { if (currentUser) navigateGame(); });

async function init() {
    try {
        setupMedia();
        document.getElementById("editionDate").textContent = new Intl.DateTimeFormat(locale, {day:"numeric", month:"short", year:"numeric", timeZone:"America/Bogota"}).format(new Date());
        await loadCurrentUser();
        if (!currentUser) {
            await loadCovers(document.getElementById("loginCovers"), 12);
            return;
        }
        await navigateGame();
        console.log("Catchdle initialized securely.");
    } catch (error) {
        if (route.audio && currentUser) document.getElementById("retryAudio").hidden = false;
        console.error("Error initializing Catchdle:", error);
        if (document.body.classList.contains("session-pending")) {
            document.getElementById("sessionStatusText").textContent = tr("Refresh to check your session.");
            const retry = document.getElementById("retrySession");
            retry.hidden = false;
            retry.onclick = () => location.reload();
        } else {
            showMessage(error.message || "Could not load Catchdle. Check the server.", "error");
        }
    }
}

init();

/* =========================================================
   START
   ========================================================= */



/* =========================================================
   CREDITS MODAL
   ========================================================= */

(function setupCredits() {
    const creditsButton = document.getElementById("creditsButton");
    const creditsModal = document.getElementById("creditsModal");
    const closeCreditsButton = document.getElementById("closeCredits");
    const closeCreditsBottom = document.getElementById("closeCreditsBottom");

    if (!creditsButton || !creditsModal) {
        return;
    }

    function openCredits() {
        creditsModal.classList.remove("hidden");
    }

    function closeCredits() {
        creditsModal.classList.add("hidden");
    }

    creditsButton.addEventListener("click", openCredits);

    if (closeCreditsButton) {
        closeCreditsButton.addEventListener("click", closeCredits);
    }

    if (closeCreditsBottom) {
        closeCreditsBottom.addEventListener("click", closeCredits);
    }

    creditsModal.addEventListener("click", event => {
        if (event.target === creditsModal) {
            closeCredits();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !creditsModal.classList.contains("hidden")) {
            closeCredits();
        }
    });
})();
