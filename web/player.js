function setupClipControls(audio) {
    const controls = document.getElementById("clipControls");
    const start = document.getElementById("clipStart");
    const play = document.getElementById("clipPlay");
    const end = document.getElementById("clipEnd");
    const seek = document.getElementById("clipSeek");
    const clock = document.getElementById("clipClock");
    const mute = document.getElementById("clipMute");
    const volume = document.getElementById("clipVolume");
    const loop = document.getElementById("clipLoop");

    function setButton(button, label, symbol) {
        button.title = tr(label);
        button.setAttribute("aria-label", button.title);
        if (symbol) button.firstElementChild.textContent = symbol;
    }
    function timestamp(seconds) {
        return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
    }
    function sync() {
        const length = Number.isFinite(audio.duration) ? audio.duration : 0;
        const position = Math.min(audio.currentTime || 0, length);
        start.disabled = end.disabled = seek.disabled = play.disabled = !length || !!audio.error;
        seek.max = length || 1;
        seek.value = position;
        const time = timestamp(position) + " / " + timestamp(length);
        clock.textContent = time;
        seek.setAttribute("aria-valuetext", time);
        seek.style.setProperty("--fill", (length ? position / length * 100 : 0) + "%");
        volume.value = audio.muted ? 0 : audio.volume;
        volume.style.setProperty("--fill", Number(volume.value) * 100 + "%");
        setButton(play, audio.paused ? "Play" : "Pause", audio.paused ? "▶" : "Ⅱ");
        setButton(mute, Number(volume.value) ? "Mute" : "Unmute");
        mute.classList.toggle("silent", Number(volume.value) === 0);
        loop.setAttribute("aria-pressed", String(audio.loop));
    }

    start.onclick = () => { audio.currentTime = 0; };
    end.onclick = () => { audio.pause(); audio.currentTime = audio.duration; };
    play.onclick = async () => {
        if (!audio.paused) { audio.pause(); return; }
        if (audio.ended || audio.currentTime >= audio.duration) audio.currentTime = 0;
        try { await audio.play(); }
        catch (error) {
            if (error.name !== "AbortError") document.getElementById("retryAudio").hidden = false;
        }
    };
    seek.oninput = () => { audio.currentTime = Number(seek.value); };
    volume.oninput = () => { audio.volume = Number(volume.value); audio.muted = false; };
    mute.onclick = () => {
        if (!audio.volume) { audio.volume = 1; audio.muted = false; }
        else audio.muted = !audio.muted;
    };
    loop.onclick = () => { audio.loop = !audio.loop; sync(); };
    for (const event of ["loadedmetadata", "durationchange", "timeupdate", "seeked", "play", "pause", "ended", "volumechange", "emptied", "error"]) {
        audio.addEventListener(event, sync);
    }
    sync();
    audio.controls = false;
    audio.hidden = true;
    controls.hidden = false;
}
