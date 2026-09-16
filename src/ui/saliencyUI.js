// Feature Attribution, Saliency & Blackbox Telemetry UI

import { FEATURE_NAMES } from '../ml/blackboxAgent.js';

export class SaliencyUI {
  constructor(containerElement, blackboxAgent, regimeDetector, onToggleAutonomous, onTrainBatch, onResetWeights) {
    this.container = containerElement;
    this.agent = blackboxAgent;
    this.regimeDetector = regimeDetector;
    this.onToggleAutonomous = onToggleAutonomous;
    this.onTrainBatch = onTrainBatch;
    this.onResetWeights = onResetWeights;

    this.renderSkeleton();
    this.bindEvents();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="bbg-pane-header">
        <span class="bbg-amber">BLACKBOX ML ENGINE TELEMETRY</span>
        <span id="bbx-status-badge" class="bbg-badge bbg-badge-idle">IDLE</span>
      </div>

      <div class="bbx-metrics-strip">
        <div class="bbx-stat-box">
          <span class="bbx-stat-lbl">REGIME</span>
          <span id="bbx-regime-val" class="bbx-stat-num bbg-cyan">DETECTING</span>
        </div>
        <div class="bbx-stat-box">
          <span class="bbx-stat-lbl">BELLMAN LOSS</span>
          <span id="bbx-loss-val" class="bbx-stat-num bbg-amber">0.000000</span>
        </div>
        <div class="bbx-stat-box">
          <span class="bbx-stat-lbl">EPSILON (EXPL)</span>
          <span id="bbx-eps-val" class="bbx-stat-num bbg-yellow">30.0%</span>
        </div>
        <div class="bbx-stat-box">
          <span class="bbx-stat-lbl">REPLAY BUFF</span>
          <span id="bbx-buff-val" class="bbx-stat-num bbg-dim">0 / 4000</span>
        </div>
      </div>

      <!-- Feature Saliency Contribution Bars -->
      <div class="bbx-saliency-section">
        <div class="bbx-subhead">FEATURE SALIENCY ATTRIBUTION (GRADIENT WEIGHT)</div>
        <div id="bbx-saliency-bars" class="bbx-saliency-list"></div>
      </div>

      <!-- Q-Values & Action Confidence -->
      <div class="bbx-actions-section">
        <div class="bbx-subhead">Q-VALUE LOGITS & DECISION PROBABILITY</div>
        <div class="bbx-q-row">
          <div class="bbx-q-box" id="q-box-buy">
            <span class="bbx-q-lbl bbg-green">BUY (+1)</span>
            <span class="bbx-q-val" id="q-val-buy">0.00</span>
          </div>
          <div class="bbx-q-box" id="q-box-hold">
            <span class="bbx-q-lbl bbg-cyan">HOLD (0)</span>
            <span class="bbx-q-val" id="q-val-hold">0.00</span>
          </div>
          <div class="bbx-q-box" id="q-box-sell">
            <span class="bbx-q-lbl bbg-red">SELL (-1)</span>
            <span class="bbx-q-val" id="q-val-sell">0.00</span>
          </div>
        </div>
      </div>

      <!-- Controls & Interactive Hyperparameters -->
      <div class="bbx-controls-strip">
        <button id="btn-toggle-bbx" class="bbg-btn bbg-btn-primary">ENGAGE BLACKBOX</button>
        <button id="btn-train-bbx" class="bbg-btn bbg-btn-sec">RUN BATCH BACKPROP</button>
        <button id="btn-reset-bbx" class="bbg-btn bbg-btn-danger">RESET SYNAPSES</button>
        <div class="bbx-slider-wrap">
          <span class="bbx-slider-lbl">LR: <span id="lr-val">0.005</span></span>
          <input type="range" id="slider-lr" min="0.001" max="0.05" step="0.001" value="0.005">
        </div>
      </div>
    `;

    this.statusBadge = this.container.querySelector('#bbx-status-badge');
    this.regimeVal = this.container.querySelector('#bbx-regime-val');
    this.lossVal = this.container.querySelector('#bbx-loss-val');
    this.epsVal = this.container.querySelector('#bbx-eps-val');
    this.buffVal = this.container.querySelector('#bbx-buff-val');
    this.saliencyBars = this.container.querySelector('#bbx-saliency-bars');

    this.qValBuy = this.container.querySelector('#q-val-buy');
    this.qValHold = this.container.querySelector('#q-val-hold');
    this.qValSell = this.container.querySelector('#q-val-sell');
    this.qBoxBuy = this.container.querySelector('#q-box-buy');
    this.qBoxHold = this.container.querySelector('#q-box-hold');
    this.qBoxSell = this.container.querySelector('#q-box-sell');

    this.btnToggle = this.container.querySelector('#btn-toggle-bbx');
    this.btnTrain = this.container.querySelector('#btn-train-bbx');
    this.btnReset = this.container.querySelector('#btn-reset-bbx');
    this.sliderLr = this.container.querySelector('#slider-lr');
    this.lrDisplay = this.container.querySelector('#lr-val');

    // Build static saliency bars
    let barsHtml = '';
    for (let i = 0; i < FEATURE_NAMES.length; i++) {
      barsHtml += `
        <div class="bbx-bar-item">
          <span class="bbx-bar-label">${FEATURE_NAMES[i]}</span>
          <div class="bbx-bar-track">
            <div id="saliency-fill-${i}" class="bbx-bar-fill" style="width: 12%;"></div>
          </div>
          <span id="saliency-pct-${i}" class="bbx-bar-pct">12%</span>
        </div>
      `;
    }
    this.saliencyBars.innerHTML = barsHtml;
  }

  bindEvents() {
    this.btnToggle.addEventListener('click', () => {
      this.onToggleAutonomous();
    });

    this.btnTrain.addEventListener('click', () => {
      this.onTrainBatch();
    });

    this.btnReset.addEventListener('click', () => {
      if (confirm('REINITIALIZE BLACKBOX SYNAPTIC WEIGHTS TO RANDOM GAUSSIAN?')) {
        this.onResetWeights();
      }
    });

    this.sliderLr.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.agent.setLearningRate(val);
      this.lrDisplay.textContent = val.toFixed(3);
    });
  }

  update() {
    // 1. Status badge
    if (this.agent.autoExecute) {
      this.statusBadge.textContent = 'AUTONOMOUS ACTIVE';
      this.statusBadge.className = 'bbg-badge bbg-badge-active';
      this.btnToggle.textContent = 'DISENGAGE BLACKBOX';
      this.btnToggle.classList.add('bbg-btn-active');
    } else {
      this.statusBadge.textContent = 'IDLE / MONITOR';
      this.statusBadge.className = 'bbg-badge bbg-badge-idle';
      this.btnToggle.textContent = 'ENGAGE BLACKBOX';
      this.btnToggle.classList.remove('bbg-btn-active');
    }

    // 2. Regime
    const reg = this.regimeDetector.currentRegime;
    this.regimeVal.textContent = reg.replace('_', ' ');
    if (reg.includes('BULL')) this.regimeVal.className = 'bbx-stat-num bbg-green';
    else if (reg.includes('BEAR')) this.regimeVal.className = 'bbx-stat-num bbg-red';
    else if (reg.includes('VOLATILITY')) this.regimeVal.className = 'bbx-stat-num bbg-yellow';
    else this.regimeVal.className = 'bbx-stat-num bbg-cyan';

    // 3. Telemetry numbers
    this.lossVal.textContent = this.agent.lastLoss.toFixed(6);
    this.epsVal.textContent = `${(this.agent.epsilon * 100).toFixed(1)}%`;
    this.buffVal.textContent = `${this.agent.replay.size()} / ${this.agent.replay.capacity}`;

    // 4. Saliency bars
    const saliency = this.agent.saliency;
    for (let i = 0; i < saliency.length; i++) {
      const fillEl = this.container.querySelector(`#saliency-fill-${i}`);
      const pctEl = this.container.querySelector(`#saliency-pct-${i}`);
      if (fillEl && pctEl) {
        const pct = Math.round((saliency[i] || 0) * 100);
        fillEl.style.width = `${Math.max(2, pct)}%`;
        pctEl.textContent = `${pct}%`;
      }
    }

    // 5. Q-Values
    const q = this.agent.qValues;
    if (q && q.length === 3) {
      this.qValBuy.textContent = q[0].toFixed(3);
      this.qValHold.textContent = q[1].toFixed(3);
      this.qValSell.textContent = q[2].toFixed(3);

      this.qBoxBuy.classList.toggle('q-chosen', this.agent.chosenAction === 0);
      this.qBoxHold.classList.toggle('q-chosen', this.agent.chosenAction === 1);
      this.qBoxSell.classList.toggle('q-chosen', this.agent.chosenAction === 2);
    }
  }
}
