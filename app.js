// Configurações Padrão
const DEFAULT_SETTINGS = {
    resetDay: 5, // Sexta-feira
    resetTime: "08:00",
    workStart: "08:00",
    workEnd: "20:00",
    usage: 0,
    darkMode: false,
    history: [], // { date: 'YYYY-MM-DD', value: 0 }
    lastResetTimestamp: null
};

class ClaudeTracker {
    constructor() {
        const stored = JSON.parse(localStorage.getItem('claude_settings')) || {};
        this.settings = { ...DEFAULT_SETTINGS, ...stored };
        this.initElements();
        this.stats = this.calculateStats();
        this.initChart();
        this.addEventListeners();
        this.update();
        this.applyTheme(this.settings.darkMode);

        // Atualiza a cada minuto
        setInterval(() => this.update(), 60000);
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
        
        // Modal
        this.modal = document.getElementById('modal-settings');
        this.btnSettings = document.getElementById('btn-settings');
        this.btnCloseModal = document.getElementById('close-modal');
        this.btnSaveSettings = document.getElementById('save-settings');
        
        // Inputs Settings
        this.inResetDay = document.getElementById('reset-day');
        this.inResetTime = document.getElementById('reset-time');
        this.inWorkStart = document.getElementById('work-start');
        this.inWorkEnd = document.getElementById('work-end');

        // Dark mode toggle
        this.btnToggleDark = document.getElementById('toggle-dark-mode');
        this.toggleThumb = document.getElementById('toggle-dark-mode-thumb');

        // Carregar valores iniciais nos inputs
        this.inResetDay.value = this.settings.resetDay;
        this.inResetTime.value = this.settings.resetTime;
        this.inWorkStart.value = this.settings.workStart;
        this.inWorkEnd.value = this.settings.workEnd;
        this.slider.value = this.settings.usage;
        this.sliderVal.innerText = `${this.settings.usage}%`;
        this._syncToggleVisual(this.settings.darkMode);
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
                        label: 'Semana Passada (%)',
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
            this.renderHistoryEditor();
            this.modal.classList.remove('hidden');
        });
        this.btnCloseModal.addEventListener('click', () => this.modal.classList.add('hidden'));
        this.btnSaveSettings.addEventListener('click', () => this.saveSettings());

        document.getElementById('history-edit-list').addEventListener('change', (e) => {
            if (!e.target.matches('.history-edit-input')) return;
            const date = e.target.dataset.date;
            let value = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
            e.target.value = value;
            const today = new Date().toISOString().split('T')[0];
            if (date === today) {
                this.settings.usage = value;
                this.slider.value = value;
                this.sliderVal.innerText = `${value}%`;
                localStorage.setItem('claude_settings', JSON.stringify(this.settings));
            }
            this.updateHistory(date, value);
            this.update();
        });

        this.btnToggleDark.addEventListener('click', () => {
            const isDark = !this.settings.darkMode;
            this.settings.darkMode = isDark;
            this._syncToggleVisual(isDark);
            this.applyTheme(isDark);
        });
    }

    saveUsage() {
        localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        this.updateHistory();
    }

    updateHistory(date, value) {
        const targetDate = date ?? new Date().toISOString().split('T')[0];
        const targetValue = value ?? this.settings.usage;
        const historyIndex = this.settings.history.findIndex(h => h.date === targetDate);
        if (historyIndex > -1) {
            this.settings.history[historyIndex].value = targetValue;
        } else {
            this.settings.history.push({ date: targetDate, value: targetValue });
            if (this.settings.history.length > 30) this.settings.history.shift();
        }
        localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        this.updateChart();
    }

    renderHistoryEditor() {
        const container = document.getElementById('history-edit-list');
        container.innerHTML = '';
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const entry = this.settings.history.find(h => h.date === dateStr);
            const val = entry ? entry.value : 0;
            const label = d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
            const row = document.createElement('div');
            row.className = 'flex items-center gap-3';
            row.innerHTML = `
                <span class="text-xs text-slate-500 dark:text-slate-400 w-20 shrink-0">${label}</span>
                <input type="number" min="0" max="100" value="${val}" data-date="${dateStr}"
                       class="history-edit-input w-20 p-1 text-sm rounded-lg border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-right">
                <span class="text-xs text-slate-400">%</span>`;
            container.appendChild(row);
        }
    }

    saveSettings() {
        this.settings.resetDay = parseInt(this.inResetDay.value);
        this.settings.resetTime = this.inResetTime.value;
        this.settings.workStart = this.inWorkStart.value;
        this.settings.workEnd = this.inWorkEnd.value;
        
        localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        this.modal.classList.add('hidden');
        this.update();
    }

    update() {
        const stats = this.calculateStats();
        this.stats = stats;
        this._checkAndApplyReset(stats.lastReset);
        this.updateUI();
        this.updateChart();
    }

    _checkAndApplyReset(lastReset) {
        const lastResetISO = lastReset.toISOString();
        const stored = this.settings.lastResetTimestamp;
        if (!stored || lastResetISO > stored) {
            this.settings.usage = 0;
            this.settings.lastResetTimestamp = lastResetISO;
            this.slider.value = 0;
            this.sliderVal.innerText = '0%';
            localStorage.setItem('claude_settings', JSON.stringify(this.settings));
        }
    }

    calculateStats() {
        const now = new Date();
        
        // Encontrar o último reset
        let lastReset = new Date(now);
        const [resetH, resetM] = this.settings.resetTime.split(':').map(Number);
        lastReset.setHours(resetH, resetM, 0, 0);
        
        while (lastReset.getDay() !== this.settings.resetDay || lastReset > now) {
            lastReset.setDate(lastReset.getDate() - 1);
        }

        // Próximo reset
        let nextReset = new Date(lastReset);
        nextReset.setDate(nextReset.getDate() + 7);

        // Horas úteis diárias
        const [startH, startM] = this.settings.workStart.split(':').map(Number);
        const [endH, endM] = this.settings.workEnd.split(':').map(Number);
        const dailyWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        const totalCycleWorkMinutes = dailyWorkMinutes * 7;

        // Calcular minutos úteis passados desde o reset
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
            checkDate.setHours(0,0,0,0);
        }

        const idealUsage = (passedWorkMinutes / totalCycleWorkMinutes) * 100;

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
        
        // Progress Ring
        const offset = 263.89 - (currentUsage / 100 * 263.89);
        this.progressCircle.style.strokeDashoffset = offset;

        // Colors & Status
        let colorClass = 'text-green-500';
        let status = 'Dentro do limite';
        
        const diff = currentUsage - idealUsage;
        
        // Reset classes do círculo
        this.progressCircle.classList.remove('text-blue-500', 'text-yellow-500', 'text-red-500');

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

        // Time Info
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
        for (let i = 0; i < 7; i++) {
            const d = new Date(this.stats.lastReset);
            d.setDate(d.getDate() + i);
            labels.push(d.toLocaleDateString('pt-BR', { weekday: 'short' }));
        }
        return labels;
    }

    getCycleHistoryData() {
        const data = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(this.stats.lastReset);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const item = this.settings.history.find(h => h.date === dateStr);
            data.push(item ? item.value : null);
        }
        return data;
    }

    getPreviousCycleData() {
        const data = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(this.stats.lastReset);
            d.setDate(d.getDate() + i - 7);
            const dateStr = d.toISOString().split('T')[0];
            const item = this.settings.history.find(h => h.date === dateStr);
            data.push(item ? item.value : null);
        }
        return data;
    }

    getCycleIdealData() {
        const now = new Date();
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);

        const [startH, startM] = this.settings.workStart.split(':').map(Number);
        const [endH, endM] = this.settings.workEnd.split(':').map(Number);
        const dailyWorkMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        const totalCycleWorkMinutes = dailyWorkMinutes * 7;

        const data = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(this.stats.lastReset);
            d.setDate(d.getDate() + i);
            d.setHours(0, 0, 0, 0);

            if (d > today) { data.push(null); continue; }

            let cutoff;
            if (d.getTime() === today.getTime()) {
                cutoff = now;
            } else {
                cutoff = new Date(d);
                cutoff.setHours(endH, endM, 0, 0);
            }

            let passed = 0;
            let check = new Date(this.stats.lastReset);
            while (check < cutoff) {
                const ws = new Date(check); ws.setHours(startH, startM, 0, 0);
                const we = new Date(check); we.setHours(endH, endM, 0, 0);
                if (cutoff > ws) {
                    const es = check > ws ? check : ws;
                    const ee = cutoff < we ? cutoff : we;
                    if (ee > es) passed += (ee - es) / 60000;
                }
                check.setDate(check.getDate() + 1);
                check.setHours(0, 0, 0, 0);
            }

            data.push(Math.min(100, Math.max(0, (passed / totalCycleWorkMinutes) * 100)));
        }
        return data;
    }
}

// Inicializar
window.addEventListener('DOMContentLoaded', () => {
    new ClaudeTracker();
});
