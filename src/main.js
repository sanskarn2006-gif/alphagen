// Master Application Entry Point - Alpha Gen Algo Terminal

import { MarketEngine, INSTRUMENTS } from './core/marketEngine.js';
import { Portfolio } from './core/portfolio.js';
import { CommandParser } from './core/commandParser.js';
import { BlackboxAgent, ACTIONS } from './ml/blackboxAgent.js';
import { RegimeDetector } from './ml/regimeDetector.js';

import { ChartCanvas } from './ui/chartCanvas.js';
import { NeuralCanvas } from './ui/neuralCanvas.js';
import { OrderBookUI } from './ui/orderBookUI.js';
import { SaliencyUI } from './ui/saliencyUI.js';
import { BlotterUI } from './ui/blotterUI.js';

// Sound Synthesizer for Authentic Alpha Gen Audio Chimes
class TerminalAudio {
  constructor() {
    this.enabled = true;
    this.audioCtx = null;
  }

  ensureContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
  }

  playBeep(freq = 880, duration = 0.08, type = 'sine') {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  orderFill() {
    this.playBeep(980, 0.06);
  }

  panicAlert() {
    this.playBeep(440, 0.12, 'square');
    setTimeout(() => this.playBeep(330, 0.15, 'square'), 120);
  }
}

class AlphaGenApp {
  constructor() {
    this.sound = new TerminalAudio();

    // 1. Instantiate Core Models
    this.market = new MarketEngine('NIFTY', { speed: 1 });
    this.portfolio = new Portfolio(100000.00);
    this.regimeDetector = new RegimeDetector(30);
    this.blackbox = new BlackboxAgent({ learningRate: 0.005, epsilon: 0.30 });

    // State caching for RL transitions
    this.lastState = null;
    this.lastAction = ACTIONS.HOLD;
    this.lastEquity = 100000.00;

    // 2. Command Dispatcher Context
    this.cmdParser = new CommandParser({
      marketEngine: this.market,
      portfolio: this.portfolio,
      blackboxAgent: this.blackbox,
      terminalLog: (msg, type) => this.log(msg, type),
      clearTerminal: () => this.clearLog(),
      ui: this
    });

    // 3. Mount UI Components
    this.initDOM();
    this.initChart();
    this.initNeural();
    this.initOrderBook();
    this.initSaliency();
    this.initBlotter();
    this.initTickerRibbon();
    this.initCommandBar();
    this.initEvents();

    // 4. Start Event & Simulation Loop
    this.startTelemetryClock();
    this.startAnimationLoop();

    this.log('ALPHA GEN NETWORK ESTABLISHED: SESSION 491-B', 'highlight');
    this.log('AUTONOMOUS DEEP Q-LEARNING BLACKBOX INITIALIZED (8x16x12x3)', 'info');
    this.log('MARKET SIMULATION ENGINE ENGAGED ON NIFTY (SPEED: 1X)', 'info');
    this.log('TYPE "HELP <GO>" IN COMMAND BAR FOR FULL SYNTAX DIRECTORY', 'info');
    
    // Fetch real market quotes in the background
    this.fetchRealQuotes();
  }

  async fetchRealQuotes() {
    try {
      this.log('REQUESTING YAHOO FINANCE BATCH QUOTES...', 'info');
      const symbols = Object.keys(INSTRUMENTS);
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols })
      });
      const quotes = await res.json();
      
      let updatedCount = 0;
      for (const [sym, price] of Object.entries(quotes)) {
        if (price) {
          updatedCount++;
          INSTRUMENTS[sym].basePrice = price; // Update the internal baseline
          const pxEl = document.getElementById(`ticker-px-${sym}`);
          if (pxEl) pxEl.textContent = price.toFixed(2);
          
          // Also update market engine if this is the active symbol
          if (this.market.symbol === sym) {
             this.market.price = price;
          }
        }
      }
      if (updatedCount > 0) {
         this.log(`SYNCHRONIZED ${updatedCount} INSTRUMENTS WITH REAL-TIME MARKET PRICES`, 'buy');
      }
    } catch (e) {
      this.log('FAILED TO FETCH REAL MARKET QUOTES (Backend may be offline)', 'error');
    }
  }

  initDOM() {
    this.sysClock = document.getElementById('sys-clock');
    this.sysFeedRate = document.getElementById('sys-feed-rate');
    this.sysLatency = document.getElementById('sys-latency');
    this.sysLed = document.getElementById('sys-led');
    this.hdrBid = document.getElementById('hdr-bid');
    this.hdrAsk = document.getElementById('hdr-ask');
    this.hdrVol = document.getElementById('hdr-vol');
    this.chartHeaderTitle = document.getElementById('chart-header-title');
    this.cmdInput = document.getElementById('bbg-cmd-input');
    this.cmdGoBtn = document.getElementById('bbg-cmd-go');
    this.cmdCancelBtn = document.getElementById('bbg-cmd-cancel');
    this.stdout = document.getElementById('terminal-stdout');
    this.tickerTabsContainer = document.getElementById('ticker-tabs');

    this.tabBtnNeural = document.getElementById('tab-btn-neural');
    this.tabBtnConsole = document.getElementById('tab-btn-console');
    this.neuralWrapper = document.getElementById('neural-view-wrapper');
    this.consoleWrapper = document.getElementById('console-view-wrapper');
  }

  initChart() {
    const container = document.getElementById('chart-container');
    this.chart = new ChartCanvas(container, this.market, this.portfolio);
  }

  initNeural() {
    const canvas = document.getElementById('neural-canvas');
    this.neural = new NeuralCanvas(canvas, this.blackbox);
  }

  initOrderBook() {
    const container = document.getElementById('orderbook-container');
    this.orderBookUI = new OrderBookUI(container, this.market);
  }

  initSaliency() {
    const container = document.getElementById('saliency-container');
    this.saliencyUI = new SaliencyUI(
      container,
      this.blackbox,
      this.regimeDetector,
      () => {
        this.blackbox.autoExecute = !this.blackbox.autoExecute;
        const msg = this.blackbox.autoExecute
          ? 'BLACKBOX AUTONOMOUS AGENT: [ENGAGED]'
          : 'BLACKBOX AUTONOMOUS AGENT: [DISENGAGED]';
        this.log(msg, this.blackbox.autoExecute ? 'highlight' : 'warn');
        this.saliencyUI.update();
      },
      () => {
        this.log('RUNNING BATCH BACKPROPAGATION OVER REPLAY MEMORY (48 STEPS)...', 'info');
        let loss = 0;
        for (let i = 0; i < 48; i++) {
          loss = this.blackbox.trainBatch(32);
        }
        this.log(`OPTIMIZER CONVERGENCE REACHED. LOSS: ${loss.toFixed(6)}`, 'highlight');
        this.saliencyUI.update();
      },
      () => {
        this.blackbox.reset();
        this.log('BLACKBOX SYNAPTIC WEIGHTS REINITIALIZED', 'warn');
        this.saliencyUI.update();
      }
    );
  }

  initBlotter() {
    const container = document.getElementById('blotter-container');
    this.blotterUI = new BlotterUI(container, this.portfolio, this.market, () => {
      this.sound.panicAlert();
      this.cmdParser.execute('FLATTEN');
    });
  }

  initTickerRibbon() {
    this.tickerTabsContainer.innerHTML = '';
    for (const [sym, info] of Object.entries(INSTRUMENTS)) {
      this.addTickerTab(sym, info.name, info.basePrice);
    }
  }

  addTickerTab(sym, name, basePrice = 1000) {
    // Prevent duplicates
    if (this.tickerTabsContainer.querySelector(`[data-sym="${sym}"]`)) return;

    const tab = document.createElement('div');
    tab.className = `bbg-ticker-tab ${sym === this.market.symbol ? 'active' : ''}`;
    tab.dataset.sym = sym;
    tab.innerHTML = `<span>${sym}</span> <span id="ticker-px-${sym}" class="bbg-ticker-price">${basePrice.toFixed(2)}</span>`;
    tab.addEventListener('click', () => {
      this.cmdParser.execute(sym);
    });
    this.tickerTabsContainer.appendChild(tab);
    
    // Auto-scroll to newly added tab
    this.tickerTabsContainer.scrollLeft = this.tickerTabsContainer.scrollWidth;
  }

  updateTickerRibbonActive() {
    const tabs = this.tickerTabsContainer.querySelectorAll('.bbg-ticker-tab');
    tabs.forEach(t => {
      t.classList.toggle('active', t.dataset.sym === this.market.symbol);
    });
    this.chartHeaderTitle.textContent = `${this.market.symbol} IN Equity // REAL-TIME CANDLESTICK & VWAP`;
  }

  initCommandBar() {
    this.cmdSuggestions = document.getElementById('cmd-suggestions');
    let debounceTimer = null;
    let selectedSuggestionIndex = -1;

    const hideSuggestions = () => {
      this.cmdSuggestions.style.display = 'none';
      this.cmdSuggestions.innerHTML = '';
      selectedSuggestionIndex = -1;
    };

    const submitCmd = () => {
      const val = this.cmdInput.value;
      if (val) {
        this.cmdParser.execute(val);
        if (val.trim().toUpperCase().startsWith('H')) {
          this.tabBtnConsole.click();
        }
        this.cmdInput.value = '';
        hideSuggestions();
      }
    };

    this.cmdGoBtn.addEventListener('click', submitCmd);

    this.cmdInput.addEventListener('input', (e) => {
      const val = e.target.value.trim().toUpperCase();
      clearTimeout(debounceTimer);
      
      // Known fast commands shouldn't trigger search
      if (!val || val.length < 2 || val === 'BUY' || val === 'SELL' || val === 'FLATTEN' || val === 'HELP') {
        hideSuggestions();
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/search/${val}`);
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            this.cmdSuggestions.innerHTML = '';
            data.results.slice(0, 10).forEach((item, index) => {
              const div = document.createElement('div');
              div.className = 'bbg-suggestion-item';
              div.dataset.index = index;
              div.dataset.symbol = item.symbol;
              div.innerHTML = `
                <span class="bbg-suggestion-symbol">${item.symbol}</span>
                <span class="bbg-suggestion-name">${item.shortname || ''}</span>
                <span class="bbg-suggestion-type">${item.quoteType || ''}</span>
                <span class="bbg-suggestion-exch">${item.exchange || ''}</span>
              `;
              div.addEventListener('click', () => {
                this.cmdInput.value = item.symbol;
                submitCmd();
              });
              this.cmdSuggestions.appendChild(div);
            });
            this.cmdSuggestions.style.display = 'flex';
            selectedSuggestionIndex = -1;
          } else {
            hideSuggestions();
          }
        } catch (err) {
          console.error('Search suggestion error:', err);
        }
      }, 300);
    });

    this.cmdInput.addEventListener('keydown', (e) => {
      const isDropdownOpen = this.cmdSuggestions.style.display === 'flex';
      const items = this.cmdSuggestions.querySelectorAll('.bbg-suggestion-item');

      if (e.key === 'Enter') {
        if (isDropdownOpen && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
          this.cmdInput.value = items[selectedSuggestionIndex].dataset.symbol;
          submitCmd();
        } else {
          submitCmd();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (isDropdownOpen) {
          if (selectedSuggestionIndex > 0) {
            items[selectedSuggestionIndex]?.classList.remove('selected');
            selectedSuggestionIndex--;
            items[selectedSuggestionIndex]?.classList.add('selected');
            items[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
          }
        } else {
          this.cmdInput.value = this.cmdParser.getPrevious();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (isDropdownOpen) {
          if (selectedSuggestionIndex < items.length - 1) {
            if (selectedSuggestionIndex >= 0) items[selectedSuggestionIndex]?.classList.remove('selected');
            selectedSuggestionIndex++;
            items[selectedSuggestionIndex]?.classList.add('selected');
            items[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
          }
        } else {
          this.cmdInput.value = this.cmdParser.getNext();
        }
      } else if (e.key === 'Escape') {
        if (isDropdownOpen) {
          hideSuggestions();
        } else {
          this.cmdInput.value = '';
        }
      }
    });

    this.cmdCancelBtn.addEventListener('click', () => {
      this.cmdInput.value = '';
      hideSuggestions();
    });

    // Function keys ribbon click handling
    document.querySelectorAll('.bbg-fkey-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const cmd = btn.dataset.cmd;
        if (cmd) {
          this.cmdParser.execute(cmd);
          if (cmd.startsWith('H')) {
            this.tabBtnConsole.click();
          }
        }
      });
    });

    // Quick toolbar items
    document.getElementById('quick-speed-select').addEventListener('change', (e) => {
      this.cmdParser.execute(`SPEED ${e.target.value}X`);
    });

    document.getElementById('quick-tf-select').addEventListener('change', (e) => {
      this.cmdParser.execute(`TF ${e.target.value}`);
    });

    document.getElementById('btn-quick-buy').addEventListener('click', () => {
      this.cmdParser.execute('BUY 10');
    });

    document.getElementById('btn-quick-sell').addEventListener('click', () => {
      this.cmdParser.execute('SELL 10');
    });

    const soundBtn = document.getElementById('btn-sound-toggle');
    soundBtn.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      soundBtn.textContent = `BEEP: ${this.sound.enabled ? 'ON' : 'OFF'}`;
      soundBtn.style.color = this.sound.enabled ? 'var(--bbg-green)' : 'var(--bbg-red)';
    });

    // View tab switching
    this.tabBtnNeural.addEventListener('click', () => {
      this.tabBtnNeural.className = 'bbg-amber bbg-bold';
      this.tabBtnConsole.className = 'bbg-dim';
      this.neuralWrapper.style.display = 'flex';
      this.consoleWrapper.style.display = 'none';
      this.neural.resize();
    });

    this.tabBtnConsole.addEventListener('click', () => {
      this.tabBtnConsole.className = 'bbg-amber bbg-bold';
      this.tabBtnNeural.className = 'bbg-dim';
      this.neuralWrapper.style.display = 'none';
      this.consoleWrapper.style.display = 'flex';
    });
  }

  initEvents() {
    this.market.subscribe((event, data) => {
      if (event === 'global_tick') {
        const pxEl = document.getElementById(`ticker-px-${data.symbol}`);
        if (pxEl) {
          const oldPrice = parseFloat(pxEl.textContent);
          pxEl.textContent = data.price.toFixed(2);
          if (data.price > oldPrice) {
            pxEl.className = 'bbg-ticker-price bbg-green';
          } else if (data.price < oldPrice) {
            pxEl.className = 'bbg-ticker-price bbg-red';
          }
        }
      } else if (event === 'tick') {
        this.onMarketTick(data);
      } else if (event === 'symbol_change') {
        this.updateTickerRibbonActive();
      } else if (event === 'history_loaded') {
        this.log(`[BLACKBOX] INGESTED ${data.count} REAL MARKET CANDLES FOR PRE-TRAINING`, 'highlight');
        this.saliencyUI.update();
      }
    });

    this.portfolio.subscribe((event, data) => {
      if (event === 'order_filled') {
        this.sound.orderFill();
      }
    });
  }

  onMarketTick(data) {
    // 1. Update Header stats
    this.hdrBid.textContent = data.bid.toFixed(2);
    this.hdrAsk.textContent = data.ask.toFixed(2);
    this.hdrVol.textContent = data.volume;

    // 2. Regime Detection
    this.regimeDetector.update(data.price, data.volume);

    // 3. Blackbox RL Feature Extraction & Decision Cycle
    const pos = this.portfolio.getPosition(data.symbol);
    const invNorm = Math.max(-1.0, Math.min(1.0, pos.size / (this.market.inst.lotSize * 5)));
    const stateFeatures = this.market.getStateFeatures(invNorm);

    // Get action decision from Blackbox
    const decision = this.blackbox.selectAction(stateFeatures, false);

    // Calculate Mark-to-Market Reward from previous transition
    const currentEquity = this.portfolio.getEquity({ [data.symbol]: data.price }).totalEquity;
    const pnlChange = currentEquity - this.lastEquity;
    
    // Reward formulation: PnL delta - inventory risk penalty - transaction friction
    const invPenalty = Math.abs(pos.size) * 0.05;
    const stepReward = pnlChange - invPenalty;

    // Observe step in Blackbox replay memory
    if (this.lastState) {
      this.blackbox.observeStep(this.lastState, this.lastAction, stepReward, stateFeatures, false);
    }

    this.lastState = stateFeatures;
    this.lastAction = decision.action;
    this.lastEquity = currentEquity;

    // 4. Autonomous Execution if enabled
    if (this.blackbox.autoExecute) {
      // Execute when confidence > threshold and action aligns
      const minConfidence = 0.45;
      const lot = this.market.inst.lotSize;

      if (decision.action === ACTIONS.BUY && pos.size <= 0 && decision.confidence >= minConfidence) {
        const order = this.portfolio.executeOrder({
          symbol: data.symbol,
          side: 'BUY',
          size: lot,
          currentPrice: data.ask,
          source: 'BLACKBOX_RL',
          tickSize: this.market.inst.tickSize
        });
        if (order) {
          this.log(`[BLACKBOX AUTO-EXEC] BUY ${lot} ${data.symbol} @ ${order.execPrice.toFixed(2)} (CONF: ${(decision.confidence * 100).toFixed(0)}%)`, 'buy');
        }
      } else if (decision.action === ACTIONS.SELL && pos.size >= 0 && decision.confidence >= minConfidence) {
        const order = this.portfolio.executeOrder({
          symbol: data.symbol,
          side: 'SELL',
          size: lot,
          currentPrice: data.bid,
          source: 'BLACKBOX_RL',
          tickSize: this.market.inst.tickSize
        });
        if (order) {
          this.log(`[BLACKBOX AUTO-EXEC] SELL ${lot} ${data.symbol} @ ${order.execPrice.toFixed(2)} (CONF: ${(decision.confidence * 100).toFixed(0)}%)`, 'sell');
        }
      }
    }

    // 5. Update Saliency & Blotter UI
    this.saliencyUI.update();
    this.blotterUI.update();
  }

  log(message, type = 'info') {
    const line = document.createElement('div');
    line.className = 'bbg-log-line';

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);

    line.innerHTML = `
      <span class="bbg-log-time">[${timeStr}]</span>
      <span class="bbg-log-msg-${type}">${message}</span>
    `;

    this.stdout.appendChild(line);
    if (this.stdout.childNodes.length > 200) {
      this.stdout.removeChild(this.stdout.firstChild);
    }
    this.stdout.scrollTop = this.stdout.scrollHeight;
  }

  clearLog() {
    this.stdout.innerHTML = '';
  }

  startTelemetryClock() {
    setInterval(() => {
      const now = new Date();
      
      // Convert to IST (UTC + 5:30)
      const istOptions = { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
      const istTime = now.toLocaleTimeString('en-US', istOptions);
      
      this.sysClock.textContent = `${istTime} IST`;
      this.sysFeedRate.textContent = `${this.market.ticksPerSecond} TICKS/S`;
      
      // Jitter latency slightly for realism
      const lat = (0.28 + Math.random() * 0.12).toFixed(2);
      this.sysLatency.textContent = `${lat} MS`;
    }, 1000);
  }

  startAnimationLoop() {
    const render = () => {
      this.chart.render();
      if (this.neuralWrapper.style.display !== 'none') {
        this.neural.render();
      }
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }
}

// Bootstrap on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.terminal = new AlphaGenApp();
});
