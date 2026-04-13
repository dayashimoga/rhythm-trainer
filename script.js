(() => {
    'use strict';

    // Theme
    const themeBtn = document.getElementById('themeBtn');
    themeBtn.addEventListener('click', () => {
        const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = t;
        themeBtn.textContent = t === 'dark' ? '🌙' : '☀️';
    });

    // ═══════════════════════════════════════════════════
    // AUDIO CONTEXT — Web Audio API for precise timing
    // ═══════════════════════════════════════════════════
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    function playClick(freq = 880, dur = 0.05, vol = 0.3) {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(); osc.stop(audioCtx.currentTime + dur);
    }

    // ═══════════════════════════════════════════════════
    // GAME STATE
    // ═══════════════════════════════════════════════════
    const canvas = document.getElementById('beatCanvas');
    const ctx = canvas.getContext('2d');
    let bpm = 120;
    let playing = false;
    let beats = [];
    let score = 0, combo = 0, maxCombo = 0;
    let perfectCount = 0, goodCount = 0, missCount = 0;
    let startTime = 0;
    let animFrame;

    const DIFFICULTY = { easy: 150, medium: 80, hard: 40 };
    const HIT_LINE_X = 120;
    const SPEED = 300; // px per second

    // ═══════════════════════════════════════════════════
    // BEAT GENERATION
    // ═══════════════════════════════════════════════════
    function generateBeats() {
        const pattern = document.getElementById('pattern').value;
        const interval = 60 / bpm; // seconds per beat
        beats = [];
        const duration = 60; // 60 seconds of beats

        if (pattern === 'quarter') {
            for (let t = 2; t < duration; t += interval) beats.push({ time: t, hit: false, missed: false, lane: 0 });
        } else if (pattern === 'eighth') {
            for (let t = 2; t < duration; t += interval / 2) beats.push({ time: t, hit: false, missed: false, lane: t % interval < 0.01 ? 0 : 1 });
        } else if (pattern === 'triplet') {
            for (let t = 2; t < duration; t += interval / 3) beats.push({ time: t, hit: false, missed: false, lane: Math.floor((t % interval) / (interval / 3)) % 3 });
        } else if (pattern === 'offbeat') {
            for (let t = 2 + interval / 2; t < duration; t += interval) beats.push({ time: t, hit: false, missed: false, lane: 0 });
        } else if (pattern === 'syncopated') {
            for (let t = 2; t < duration; t += interval) {
                beats.push({ time: t, hit: false, missed: false, lane: 0 });
                if (Math.random() > 0.4) beats.push({ time: t + interval * 0.75, hit: false, missed: false, lane: 1 });
            }
        } else { // random
            for (let t = 2; t < duration; t += interval) {
                beats.push({ time: t, hit: false, missed: false, lane: 0 });
                if (Math.random() > 0.5) beats.push({ time: t + interval * 0.5, hit: false, missed: false, lane: 1 });
                if (Math.random() > 0.7) beats.push({ time: t + interval * 0.25, hit: false, missed: false, lane: 2 });
            }
        }
    }

    // ═══════════════════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════════════════
    function draw() {
        if (!playing) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;

        ctx.clearRect(0, 0, w, h);

        const elapsed = (performance.now() - startTime) / 1000;
        const window_ = DIFFICULTY[document.getElementById('difficulty').value] / 1000;

        // Background pulse on beat
        const beatInterval = 60 / bpm;
        const beatPhase = (elapsed % beatInterval) / beatInterval;
        if (beatPhase < 0.1) {
            ctx.fillStyle = `rgba(244,63,94,${0.05 * (1 - beatPhase / 0.1)})`;
            ctx.fillRect(0, 0, w, h);
        }

        // Hit line
        const grad = ctx.createLinearGradient(HIT_LINE_X, 0, HIT_LINE_X, h);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.3, 'rgba(244,63,94,0.6)');
        grad.addColorStop(0.5, 'rgba(244,63,94,0.8)');
        grad.addColorStop(0.7, 'rgba(244,63,94,0.6)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(HIT_LINE_X - 2, 0, 4, h);

        // Hit zone visualization
        const zoneW = window_ * SPEED;
        ctx.fillStyle = 'rgba(244,63,94,0.05)';
        ctx.fillRect(HIT_LINE_X - zoneW, 0, zoneW * 2, h);

        // Lane dividers
        const laneH = h / 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, laneH); ctx.lineTo(w, laneH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, laneH * 2); ctx.lineTo(w, laneH * 2); ctx.stroke();

        // Draw beats
        for (const beat of beats) {
            const dt = beat.time - elapsed;
            const x = HIT_LINE_X + dt * SPEED;

            if (x < -50 || x > w + 50) continue;
            if (!beat.hit && !beat.missed && dt < -window_) {
                beat.missed = true;
                combo = 0;
                missCount++;
                showFeedback('MISS', 'miss');
            }

            const laneY = laneH * beat.lane + laneH / 2;

            if (beat.hit) {
                // Hit effect — expanding ring
                const age = elapsed - beat.hitTime;
                if (age < 0.3) {
                    ctx.strokeStyle = `rgba(16,185,129,${1 - age / 0.3})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(HIT_LINE_X, laneY, 20 + age * 60, 0, Math.PI * 2); ctx.stroke();
                }
            } else if (beat.missed) {
                ctx.fillStyle = 'rgba(239,68,68,0.2)';
                ctx.beginPath(); ctx.arc(x, laneY, 12, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x - 6, laneY - 6); ctx.lineTo(x + 6, laneY + 6); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x + 6, laneY - 6); ctx.lineTo(x - 6, laneY + 6); ctx.stroke();
            } else {
                // Approaching beat
                const proximity = Math.max(0, 1 - Math.abs(dt) * 2);
                const size = 14 + proximity * 4;

                // Glow
                const glow = ctx.createRadialGradient(x, laneY, 0, x, laneY, size * 2);
                glow.addColorStop(0, `rgba(244,63,94,${0.3 + proximity * 0.3})`);
                glow.addColorStop(1, 'transparent');
                ctx.fillStyle = glow;
                ctx.beginPath(); ctx.arc(x, laneY, size * 2, 0, Math.PI * 2); ctx.fill();

                // Note circle
                const noteGrad = ctx.createRadialGradient(x, laneY, 0, x, laneY, size);
                noteGrad.addColorStop(0, '#fff');
                noteGrad.addColorStop(0.5, '#f43f5e');
                noteGrad.addColorStop(1, '#a21040');
                ctx.fillStyle = noteGrad;
                ctx.beginPath(); ctx.arc(x, laneY, size, 0, Math.PI * 2); ctx.fill();

                // Tail line
                ctx.strokeStyle = 'rgba(244,63,94,0.2)';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x, laneY); ctx.lineTo(x + 40, laneY); ctx.stroke();
            }
        }

        // Metronome click on downbeats
        const currentBeatNum = Math.floor(elapsed / beatInterval);
        if (currentBeatNum > lastClickBeat) {
            lastClickBeat = currentBeatNum;
            playClick(currentBeatNum % 4 === 0 ? 1200 : 800, 0.03, 0.15);
        }

        updateStats();
        animFrame = requestAnimationFrame(draw);
    }

    let lastClickBeat = -1;

    // ═══════════════════════════════════════════════════
    // HIT DETECTION
    // ═══════════════════════════════════════════════════
    function tryHit() {
        if (!playing) return;
        initAudio();
        const elapsed = (performance.now() - startTime) / 1000;
        const window_ = DIFFICULTY[document.getElementById('difficulty').value] / 1000;

        let closestBeat = null;
        let closestDt = Infinity;

        for (const beat of beats) {
            if (beat.hit || beat.missed) continue;
            const dt = Math.abs(beat.time - elapsed);
            if (dt < closestDt) { closestDt = dt; closestBeat = beat; }
        }

        if (closestBeat && closestDt <= window_) {
            closestBeat.hit = true;
            closestBeat.hitTime = elapsed;

            if (closestDt < window_ * 0.3) {
                score += 100 * (1 + combo * 0.1);
                perfectCount++;
                combo++;
                showFeedback('PERFECT!', 'perfect');
                playClick(1400, 0.05, 0.2);
            } else {
                score += 50 * (1 + combo * 0.05);
                goodCount++;
                combo++;
                showFeedback('Good', 'good');
                playClick(1000, 0.05, 0.15);
            }
            if (combo > maxCombo) maxCombo = combo;
        } else {
            playClick(200, 0.1, 0.1);
        }
    }

    function showFeedback(text, cls) {
        const el = document.getElementById('hitFeedback');
        el.textContent = text;
        el.className = 'hit-feedback ' + cls;
        setTimeout(() => { el.className = 'hit-feedback'; }, 400);
    }

    function updateStats() {
        document.getElementById('score').textContent = Math.floor(score);
        document.getElementById('combo').textContent = combo > 1 ? `${combo}x combo` : '';
        document.getElementById('perfectCount').textContent = perfectCount;
        document.getElementById('goodCount').textContent = goodCount;
        document.getElementById('missCount').textContent = missCount;
        document.getElementById('maxCombo').textContent = maxCombo;
        const total = perfectCount + goodCount + missCount;
        document.getElementById('accuracy').textContent = total > 0 ?
            Math.round((perfectCount + goodCount) / total * 100) + '%' : '0%';
    }

    // ═══════════════════════════════════════════════════
    // CONTROLS
    // ═══════════════════════════════════════════════════
    document.getElementById('startBtn').addEventListener('click', () => {
        initAudio();
        playing = true;
        score = 0; combo = 0; maxCombo = 0;
        perfectCount = 0; goodCount = 0; missCount = 0;
        lastClickBeat = -1;
        generateBeats();
        startTime = performance.now();
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        animFrame = requestAnimationFrame(draw);
    });

    document.getElementById('stopBtn').addEventListener('click', () => {
        playing = false;
        cancelAnimationFrame(animFrame);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    });

    // Tempo controls
    const tempoSlider = document.getElementById('tempoSlider');
    const tempoVal = document.getElementById('tempoVal');
    tempoSlider.addEventListener('input', () => { bpm = parseInt(tempoSlider.value); tempoVal.textContent = bpm; });
    document.getElementById('tempoUp').addEventListener('click', () => { bpm = Math.min(240, bpm + 5); tempoSlider.value = bpm; tempoVal.textContent = bpm; });
    document.getElementById('tempoDown').addEventListener('click', () => { bpm = Math.max(40, bpm - 5); tempoSlider.value = bpm; tempoVal.textContent = bpm; });

    // Keyboard input
    document.addEventListener('keydown', e => {
        if (['Space', ' ', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'd', 'f', 'j', 'k'].includes(e.key) || e.code === 'Space') {
            e.preventDefault();
            tryHit();
        }
    });

    // Touch/click on canvas
    canvas.addEventListener('click', tryHit);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); tryHit(); }, { passive: false });

    // Initial canvas draw
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#120e20';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#8a80a0';
    ctx.font = '16px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Press Start to begin', rect.width / 2, rect.height / 2);
})();
