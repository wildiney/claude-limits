const DEFAULT_SETTINGS = {
    cycleStart: null,
    workStart: "08:00",
    workEnd: "20:00",
    usage: 0,
    darkMode: false,
    history: [] // { cycleStart: ISO, dayIndex: 0-6, value: 0-100 }
};

class ClaudeTracker {
    constructor() {
        let stored = JSON.parse(localStorage.getItem('claude_settings')) || {};
        stored = this._migrate(stored);
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
        this.initElements();
        this.stats = this.calculateStats();
        this.initChart();
        this.addEventListeners();
        this.update();
        this.applyTheme(this.settings.darkMode);
        setInterval(() => this.update(), 60000);
    }

    _fixUtcMidnightCycleStart(stored) {
        if (!stored.cycleStart || !stored.cycleStart.endsWith('T00:00:00.000Z')) return stored;
        const datePart = stored.cycleStart.substring(0, 10);
        const [year, month, day] = datePart.split('-').map(Number);
        const localMidnight = new Date(year, month - 1, day);
        const newISO = localMidnight.toISOString();
        if (newISO === stored.cycleStart) return stored; // UTC+0, no fix needed
        const oldISO = stored.cycleStart;
        stored.cycleStart = newISO;
        if (stored.history) {
            stored.history = stored.history.map(h =>
                h.cycleStart === oldISO ? { ...h, cycleStart: newISO } : h
            );
        }
        localStorage.setItem('claude_settings', JSON.stringify(stored));
        return stored;
    }

    _migrate(stored) {
        if (!stored.history || stored.history.length === 0 || stored.history[0].cycleStart !== undefined) {
            delete stored.resetDay;
            delete stored.resetTime;
            delete stored.lastResetTimestamp;
            return this._fixUtcMidnightCycleStart(stored);
        }

        // Old format: { date: "YYYY-MM-DD", value }
        const oldHistory = stored.history;
        let cycleStartISO = stored.lastResetTimestamp || null;

        if (!cycleStartISO && stored.resetDay !== undefined && stored.resetTime) {
            const now = new Date();
            let d = new Date(now);
            const [rH, rM] = stored.resetTime.split(':').map(Number);
            d.setHours(rH, rM, 0, 0);
            while (d.getDay() !== stored.resetDay || d > now) d.setDate(d.getDate() - 1);
            cycleStartISO = d.toISOString();
        }

        const newHistory = [];
        if (cycleStartISO) {
            const cycleStart = new Date(cycleStartISO);
            const prevCycleStart = new Date(cycleStart);
            prevCycleStart.setDate(prevCycleStart.getDate() - 7);
            const prevISO = prevCycleStart.toISOString();

            for (const entry of oldHistory) {
                const entryDate = new Date(`${entry.date}T12:00:00`);
                const daysSince = Math.round((entryDate - cycleStart) / 86400000);

                if (daysSince >= 0 && daysSince <= 6) {
                    newHistory.push({ cycleStart: cycleStartISO, dayIndex: daysSince, value: entry.value });
                } else {
                    const daysSincePrev = Math.round((entryDate - prevCycleStart) / 86400000);
                    if (daysSincePrev >= 0 && daysSincePrev <= 6) {
                        newHistory.push({ cycleStart: prevISO, dayIndex: daysSincePrev, value: entry.value });
                    }
                }
            }
        }

        stored.history = newHistory;
        stored.cycleStart = cycleStartISO;
        delete stored.resetDay;
        delete stored.resetTime;
        delete stored.lastResetTimestamp;
        return this._fixUtcMidnightCycleStart(stored);
    }

    initElements() {
        this.slider = document.getElementById('usage-slider');
        this.sliderVal = document.getElementById('slider-val');
        this.currentUsageVal = document.getElementById('current-usage-val');
        this.idealUsageVal = document.getElementById('ideal-usage-val');
        this.progressCircle = document.getElementById('progress-circle');
        this.statusText = document.getElementById('current-status-text');
        this.diffText = document.getElementById('diff-text');
        this.nextResetText = document.getElementById('next-reset-time');
        this.timeRemainingText = document.getElementById('time-remaining');

        this.modal = document.getElementById('modal-settings');
        this.btnSettings = document.getElementById('btn-settings');
        this.btnCloseModal = document.getElementById('close-modal');
        this.btnSaveSettings = document.getElementById('save-settings');

        this.inCycleStart = document.getElementById('cycle-start');
        this.inWorkStart = document.getElementById('work-start');
        this.inWorkEnd = document.getElementById('work-end');
        this.btnRegisterReset = document.getElementById('btn-register-reset');

        this.btnToggleDark = document.getElementById('toggle-dark-mode');
        this.toggleThumb = document.getElementById('toggle-dark-mode-thumb');

        this._syncCycleStartInput();
        this.inWorkStart.value = this.settings.workStart;
        this.inWorkEnd.value = this.settings.workEnd;
        this.slider.value = this.settings.usage;
        this.sliderVal.innerText = `${this.settings.usage}%`;
        this._syncToggleVisual(this.settings.darkMode);
    }

    _isoToDatetimeLocal(iso) {
        const d = new Date(iso);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    _syncCycleStartInput() {
        this.inCycleStart.value = this.settings.cycleStart
            ? this._isoToDatetimeLocal(this.settings.cycleStart)
            : '';
    }

    initChart() {
        const ctx = document.getElementById('historyChart').getContext('2d');
        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: this.getCycleLabels(),
                datasets: [
                    {
                        label: 'Uso Real (%)',
                        data: this.getCycleHistoryData(),
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Ideal (%)',
                        data: this.getCycleIdealData(),
                        borderColor: '#10b981',
                        borderDash: [5, 5],
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.4,
                        pointRadius: 3
                    },
                    {
                        label: 'Ciclo Anterior (%)',
                        data: this.getPreviousCycleData(),
                        borderColor: 'rgba(148, 163, 184, 0.7)',
                        borderDash: [4, 4],
                        borderWidth: 1.5,
                        backgroundColor: 'transparent',
                        fill: false,
                        tension: 0.4,
                        pointRadius: 2,
                        pointBackgroundColor: 'rgba(148, 163, 184, 0.7)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100 }
                },
                plugins: {
                    legend: { display: true }
                }
            }
        });
    }

    addEventListeners() {
        this.slider.addEventListener('input', (e) => {
            const val = e.target.value;
            this.sliderVal.innerText = `${val}%`;
            this.settings.usage = parseInt(val);
            this.saveUsage();
            this.updateUI();
        });

        this.btnSettings.addEventListener('click', () => {
            this._syncCycleStartInput();
            this.renderHistoryEditor();
            this.modal.classList.remove('hidden');
        });
        this.btnCloseModal.addEventListener('click', () => this.modal.classList.add('hidden'));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());

        this.btnRegisterReset.addEventListener('click', () => {
            this.inCycleStart.value = this._isoToDatetimeLocal(new Date().toISOString());
        });

        document.getElementById('history-edit-list').addEventListener('change', (e) => {
            if (!e.target.matches('.history-edit-input')) return;
            const cycleStart = e.target.dataset.cycleStart;
            const dayIndex = parseInt(e.target.dataset.dayIndex, 10);
            let value = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
            e.target.value = value;

            const currentDayIndex = this._getCurrentDayIndex();
            if (cycleStart === this.settings.cycleStart && dayIndex === currentDayIndex) {
                this.settings.usage = value;
                this.slider.value = value;
                this.sliderVal.innerText = `${value}%`;
                localStorage.setItem('claude_settings', JSON.stringify(this.settings));
            }
            this.updateHistory(cycleStart, dayIndex, value);
            this.update();
        });

        this.btnToggleDark.addEventListener('click', () => {
            const isDark = !this.settings.darkMode;
            this.settings.darkMode = isDark;
            this._syncToggleVisual(isDark);
            this.applyTheme(isDark);
        });
    }

    _localMidnight(d) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }

    _getCurrentDayIndex() {
        if (!this.settings.cycleStart) return 0;
        const nowDay = this._localMidnight(new Date());
        const resetDay = this._localMidnight(new Date(this.settings.cycleStart));
        return Math.max(0, Math.min(6, Math.floor((nowDay - resetDay) / 86400000)));
    }

    saveUsage() {
        localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        const cycleStart = this.settings.cycleStart;
        if (cycleStart) {
            this.updateHistory(cycleStart, this._getCurrentDayIndex(), this.settings.usage);
        }
    }

    updateHistory(cycleStart, dayIndex, value) {
        const existing = this.settings.history.findIndex(
            h => h.cycleStart === cycleStart && h.dayIndex === dayIndex
        );
        if (existing > -1) {
            this.settings.history[existing].value = value;
        } else {
            this.settings.history.push({ cycleStart, dayIndex, value });
            if (this.settings.history.length > 70) this.settings.history.shift();
        }
        localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        this.updateChart();
    }

    renderHistoryEditor() {
        const container = document.getElementById('history-edit-list');
        container.innerHTML = '';

        const cycleStart = this.settings.cycleStart;
        if (!cycleStart) {
            container.innerHTML = '<p class="text-xs text-slate-400">Configure o início do ciclo para editar o histórico.</p>';
            return;
        }

        const cycleStartBase = this._localMidnight(new Date(cycleStart));
        const currentDayIndex = this._getCurrentDayIndex();

        for (let i = 0; i < 7; i++) {
            const d = new Date(cycleStartBase);
            d.setDate(d.getDate() + i);
            const entry = this.settings.history.find(h => h.cycleStart === cycleStart && h.dayIndex === i);
            const val = entry ? entry.value : 0;
            const dateLabel = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
            const isToday = i === currentDayIndex;
            const isFuture = i > currentDayIndex;

            const row = document.createElement('div');
            row.className = 'flex items-center gap-3';
            row.innerHTML = `
                <span class="text-xs ${isToday ? 'text-blue-500 font-semibold' : 'text-slate-500 dark:text-slate-400'} w-32 shrink-0">D${i + 1} · ${dateLabel}${isToday ? ' ◀' : ''}</span>
                <input type="number" min="0" max="100" value="${val}"
                       data-cycle-start="${cycleStart}" data-day-index="${i}"
                       class="history-edit-input w-20 p-1 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right disabled:opacity-40"
                       ${isFuture ? 'disabled' : ''}>
                <span class="text-xs text-slate-400">%</span>`;
            container.appendChild(row);
        }
    }

    saveSettings() {
        const cycleStartInput = this.inCycleStart.value;
        const newCycleStart = cycleStartInput
            ? this._localMidnight(new Date(cycleStartInput)).toISOString()
            : null;
        const cycleChanged = newCycleStart && newCycleStart !== this.settings.cycleStart;

        if (cycleChanged) {
            this.settings.usage = 0;
            this.slider.value = 0;
            this.sliderVal.innerText = '0%';
        }

        if (newCycleStart) this.settings.cycleStart = newCycleStart;
        this.settings.workStart = this.inWorkStart.value;
        this.settings.workEnd = this.inWorkEnd.value;

        localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        this.modal.classList.add('hidden');
        this.update();
    }

    update() {
        this.stats = this.calculateStats();
        this.updateUI();
        this.updateChart();
    }

    calculateStats() {
        const now = new Date();

        let lastReset;
        if (this.settings.cycleStart) {
            lastReset = new Date(this.settings.cycleStart);
            if (lastReset > now) lastReset = new Date(now.getTime() - 7 * 86400000);
        } else {
            lastReset = new Date(now);
            lastReset.setHours(8, 0, 0, 0);
            if (lastReset > now) lastReset.setDate(lastReset.getDate() - 1);
        }

        const nextReset = new Date(lastReset);
        nextReset.setDate(nextReset.getDate() + 7);

        const [startH, startM] = this.settings.workStart.split(':').map(Number);
        const [endH, endM] = this.settings.workEnd.split(':').map(Number);
        const dailyWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        const totalCycleWorkMinutes = dailyWorkMinutes * 7;

        let passedWorkMinutes = 0;
        let checkDate = new Date(lastReset);

        while (checkDate < now) {
            const dayStart = new Date(checkDate);
            dayStart.setHours(startH, startM, 0, 0);
            const dayEnd = new Date(checkDate);
            dayEnd.setHours(endH, endM, 0, 0);

            if (now > dayStart) {
                const effectiveStart = checkDate > dayStart ? checkDate : dayStart;
                const effectiveEnd = now < dayEnd ? now : dayEnd;
                if (effectiveEnd > effectiveStart) {
                    passedWorkMinutes += (effectiveEnd - effectiveStart) / 60000;
                }
            }

            checkDate.setDate(checkDate.getDate() + 1);
            checkDate.setHours(0, 0, 0, 0);
        }

        const idealUsage = totalCycleWorkMinutes > 0
            ? (passedWorkMinutes / totalCycleWorkMinutes) * 100
            : 0;

        return {
            idealUsage: Math.min(100, Math.max(0, idealUsage)),
            lastReset,
            nextReset,
            timeRemaining: nextReset - now
        };
    }

    updateUI() {
        const { idealUsage, nextReset, timeRemaining } = this.stats;
        const currentUsage = this.settings.usage;

        this.currentUsageVal.innerText = `${currentUsage}%`;
        this.idealUsageVal.innerText = `${idealUsage.toFixed(1)}%`;

        const offset = 263.89 - (currentUsage / 100 * 263.89);
        this.progressCircle.style.strokeDashoffset = offset;

        const diff = currentUsage - idealUsage;
        this.progressCircle.classList.remove('text-blue-500', 'text-yellow-500', 'text-red-500');

        let colorClass = 'text-green-500';
        let status = 'Dentro do limite';

        if (diff > 10) {
            colorClass = 'text-red-500';
            status = 'Excedendo Limite!';
            this.progressCircle.classList.add('text-red-500');
        } else if (diff > 0) {
            colorClass = 'text-yellow-500';
            status = 'Atenção: Uso elevado';
            this.progressCircle.classList.add('text-yellow-500');
        } else {
            this.progressCircle.classList.add('text-blue-500');
        }

        this.diffText.innerText = status;
        this.diffText.className = `text-xs font-semibold mt-1 ${colorClass}`;
        this.statusText.innerText = `Você está ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? 'acima' : 'abaixo'} da meta ideal.`;

        this.nextResetText.innerText = nextReset.toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

        const days = Math.floor(timeRemaining / 86400000);
        const hours = Math.floor((timeRemaining % 86400000) / 3600000);
        this.timeRemainingText.innerText = `${days}d ${hours}h`;
    }

    _syncToggleVisual(isDark) {
        this.btnToggleDark.setAttribute('aria-checked', String(isDark));
        if (isDark) {
            this.btnToggleDark.classList.replace('bg-slate-200', 'bg-blue-600');
            this.toggleThumb.classList.replace('translate-x-1', 'translate-x-6');
        } else {
            this.btnToggleDark.classList.replace('bg-blue-600', 'bg-slate-200');
            this.toggleThumb.classList.replace('translate-x-6', 'translate-x-1');
        }
    }

    applyTheme(isDark) {
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        document.querySelector('meta[name="theme-color"]')
            .setAttribute('content', isDark ? '#1e293b' : '#3b82f6');
        this.updateChartColors(isDark);
    }

    updateChartColors(isDark) {
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(0, 0, 0, 0.1)';
        const tickColor = isDark ? '#94a3b8' : '#666';
        const legendColor = isDark ? '#94a3b8' : '#666';

        this.chart.data.datasets[0].backgroundColor = isDark
            ? 'rgba(59, 130, 246, 0.15)'
            : 'rgba(59, 130, 246, 0.1)';
        this.chart.options.scales.y.grid = { color: gridColor };
        this.chart.options.scales.y.ticks = { color: tickColor };
        this.chart.options.scales.x = { grid: { color: gridColor }, ticks: { color: tickColor } };
        this.chart.options.plugins.legend.labels = { color: legendColor };
        this.chart.update();
    }

    updateChart() {
        this.chart.data.labels = this.getCycleLabels();
        this.chart.data.datasets[0].data = this.getCycleHistoryData();
        this.chart.data.datasets[1].data = this.getCycleIdealData();
        this.chart.data.datasets[2].data = this.getPreviousCycleData();
        this.chart.update();
    }

    getCycleLabels() {
        const labels = [];
        const base = this._localMidnight(this.stats.lastReset);
        for (let i = 0; i < 7; i++) {
            const d = new Date(base);
            d.setDate(d.getDate() + i);
            const dateLabel = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            labels.push(`D${i + 1} · ${dateLabel}`);
        }
        return labels;
    }

    getCycleHistoryData() {
        const cycleStart = this.settings.cycleStart;
        if (!cycleStart) return new Array(7).fill(null);
        return Array.from({ length: 7 }, (_, i) => {
            const entry = this.settings.history.find(h => h.cycleStart === cycleStart && h.dayIndex === i);
            return entry ? entry.value : null;
        });
    }

    _getPrevCycleStart() {
        const currentCycleStart = this.settings.cycleStart;
        const allCycles = [...new Set(this.settings.history.map(h => h.cycleStart))]
            .filter(Boolean)
            .sort();
        const idx = allCycles.indexOf(currentCycleStart);
        if (idx > 0) return allCycles[idx - 1];
        if (currentCycleStart) {
            const d = new Date(currentCycleStart);
            d.setDate(d.getDate() - 7);
            return d.toISOString();
        }
        return null;
    }

    getPreviousCycleData() {
        const prevCycleStart = this._getPrevCycleStart();
        if (!prevCycleStart) return new Array(7).fill(null);
        return Array.from({ length: 7 }, (_, i) => {
            const entry = this.settings.history.find(h => h.cycleStart === prevCycleStart && h.dayIndex === i);
            return entry ? entry.value : null;
        });
    }

    getCycleIdealData() {
        const [endH, endM] = this.settings.workEnd.split(':').map(Number);
        const totalCycleMs = this.stats.nextReset - this.stats.lastReset;

        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(this.stats.lastReset);
            d.setDate(d.getDate() + i);
            d.setHours(endH, endM, 0, 0);
            const elapsed = d - this.stats.lastReset;
            return Math.min(100, Math.max(0, (elapsed / totalCycleMs) * 100));
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new ClaudeTracker();
});
