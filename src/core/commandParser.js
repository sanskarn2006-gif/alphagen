// Alpha Gen Command Parser & Terminal Dispatcher

export class CommandParser {
  constructor(context) {
    this.ctx = context; // References to marketEngine, portfolio, blackboxAgent, ui
    this.history = [];
    this.historyIndex = -1;
  }

  async execute(rawCommand) {
    if (!rawCommand || !rawCommand.trim()) return null;
    let cmd = rawCommand.trim().toUpperCase();

    // Strip optional trailing <GO> or GO
    cmd = cmd.replace(/<GO>$/i, '').replace(/\s+GO$/i, '').trim();

    this.history.unshift(rawCommand.trim());
    if (this.history.length > 50) this.history.pop();
    this.historyIndex = -1;

    const parts = cmd.split(/\s+/);
    const primary = parts[0];
    const arg1 = parts[1];
    const arg2 = parts[2];

    const log = (msg, type = 'info') => {
      if (this.ctx.terminalLog) {
        this.ctx.terminalLog(msg, type);
      }
    };

    switch (primary) {
      // Note: We used to have a massive switch statement here for symbols (e.g., NIFTY, AAPL).
      // Now, symbol resolution is handled dynamically in the default case.

      // 2. Manual Trade: "BUY 50", "SELL 100"
      case 'BUY':
      case 'B': {
        const size = parseInt(arg1, 10) || this.ctx.marketEngine.inst.lotSize || 10;
        const sym = this.ctx.marketEngine.symbol;
        const p = this.ctx.marketEngine.ask;
        const order = this.ctx.portfolio.executeOrder({
          symbol: sym,
          side: 'BUY',
          size,
          currentPrice: p,
          source: 'MANUAL',
          tickSize: this.ctx.marketEngine.inst.tickSize
        });
        log(`MANUAL ORDER FILLED: BUY ${size} ${sym} @ ${order.execPrice.toFixed(2)}`, 'buy');
        return { success: true, order };
      }

      case 'SELL':
      case 'S': {
        const size = parseInt(arg1, 10) || this.ctx.marketEngine.inst.lotSize || 10;
        const sym = this.ctx.marketEngine.symbol;
        const p = this.ctx.marketEngine.bid;
        const order = this.ctx.portfolio.executeOrder({
          symbol: sym,
          side: 'SELL',
          size,
          currentPrice: p,
          source: 'MANUAL',
          tickSize: this.ctx.marketEngine.inst.tickSize
        });
        log(`MANUAL ORDER FILLED: SELL ${size} ${sym} @ ${order.execPrice.toFixed(2)}`, 'sell');
        return { success: true, order };
      }

      // 3. Blackbox Controls: "BBX ON", "BBX OFF", "BBX TRAIN", "BBX RESET"
      case 'BBX':
      case 'ALGO': {
        if (arg1 === 'ON' || arg1 === 'START') {
          this.ctx.blackboxAgent.autoExecute = true;
          log('SELF-LEARNING BLACKBOX AUTONOMOUS EXECUTION: ENGAGED [ACTIVE]', 'highlight');
          return { success: true, state: true };
        } else if (arg1 === 'OFF' || arg1 === 'STOP') {
          this.ctx.blackboxAgent.autoExecute = false;
          log('SELF-LEARNING BLACKBOX AUTONOMOUS EXECUTION: DISENGAGED [IDLE]', 'warn');
          return { success: true, state: false };
        } else if (arg1 === 'TRAIN') {
          log('TRIGGERING ACCELERATED BACKPROPAGATION BATCH CYCLE (64 STEPS)...', 'info');
          let loss = 0;
          for (let i = 0; i < 64; i++) {
            loss = this.ctx.blackboxAgent.trainBatch(32);
          }
          log(`BATCH CONVERGENCE COMPLETED. BELLMAN LOSS: ${loss.toFixed(6)}`, 'highlight');
          return { success: true, loss };
        } else if (arg1 === 'RESET') {
          this.ctx.blackboxAgent.reset();
          log('BLACKBOX SYNAPTIC WEIGHTS REINITIALIZED TO RANDOM GAUSSIAN DISTRIBUTION', 'warn');
          return { success: true };
        }
        break;
      }

      // 4. Panic Liquidate
      case 'FLATTEN':
      case 'PANIC':
      case 'LIQUIDATE': {
        const prices = { [this.ctx.marketEngine.symbol]: this.ctx.marketEngine.price };
        const orders = this.ctx.portfolio.flattenAll(prices);
        log(`EMERGENCY FLATTEN EXECUTED: ${orders.length} POSITIONS CLOSED TO CASH`, 'warn');
        return { success: true, orders };
      }

      // 5. Simulation Speed: "SPEED 1X", "SPEED 5X", "SPEED 25X"
      case 'SPEED': {
        const factor = parseInt(arg1?.replace('X', ''), 10) || 1;
        this.ctx.marketEngine.setSpeed(factor);
        log(`SIMULATION FEED ACCELERATOR SET TO ${factor}X`, 'info');
        return { success: true, speed: factor };
      }

      // 6. Timeframe: "TF 1S", "TF 5S", "TF 15S", "TF 1M"
      case 'TF':
      case 'TIMEFRAME': {
        const tf = (arg1 || '5S').toLowerCase();
        this.ctx.marketEngine.setTimeframe(tf);
        log(`CHART TIMEFRAME INTERVAL SET TO ${tf}`, 'info');
        return { success: true, timeframe: tf };
      }

      // 7. Pause / Resume
      case 'PAUSE':
      case 'STOP':
      case 'P': {
        const running = this.ctx.marketEngine.togglePause();
        log(running ? 'MARKET TICK ENGINE RESUMED' : 'MARKET TICK ENGINE PAUSED', 'info');
        return { success: true, running };
      }

      // 8. Mode Switch: "MODE LIVE", "MODE SIM"
      case 'MODE': {
        const targetMode = arg1?.toUpperCase() === 'LIVE' ? 'LIVE' : 'SIM';
        
        if (targetMode === 'LIVE') {
          log(`INITIATING LIVE CONNECTION TO KOTAK SECURITIES...`, 'warn');
          // Trigger Backend Login
          fetch('/api/login', { method: 'POST' })
            .then(res => res.json())
            .then(data => {
              if (data.requireOtp) {
                log(`[KOTAK 2FA] OTP sent to your mobile. Type "OTP <CODE> <GO>" to authenticate.`, 'warn');
              } else if (data.success) {
                log(`[KOTAK] Live connection established.`, 'info');
              } else {
                log(`[KOTAK] Auth Error: ${data.error || 'Failed'}`, 'error');
              }
            })
            .catch(err => log(`[KOTAK] Network Error reaching backend.`, 'error'));
        }

        this.ctx.marketEngine.setMode(targetMode);
        this.ctx.portfolio.setMode(targetMode);
        log(`PLATFORM MODE SWITCHED TO: ${targetMode}`, targetMode === 'LIVE' ? 'warn' : 'info');
        return { success: true, mode: targetMode };
      }

      // 9. OTP Command
      case 'OTP': {
        const code = arg1;
        if (!code) {
          log(`PLEASE PROVIDE OTP CODE: "OTP 123456 <GO>"`, 'error');
          return { success: false };
        }
        log(`SUBMITTING 2FA OTP VERIFICATION...`, 'info');
        
        fetch('/api/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: code })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            log(`[KOTAK 2FA SUCCESS] Live Trading Session Authenticated and Active!`, 'buy');
            if (this.ctx.marketEngine.mode === 'LIVE') {
               this.ctx.marketEngine.connectLiveWebSocket();
            }
            // Fetch live limits
            fetch('/api/limits')
              .then(res => res.json())
              .then(limitData => {
                 if (limitData && limitData.success && limitData.data) {
                    let realCash = 0;
                    if (limitData.data && typeof limitData.data === 'object') {
                        // The new dynamic Kotak E22 backend returns a flat object with capitalized keys
                        if (limitData.data.Net) {
                            realCash = parseFloat(limitData.data.Net);
                        } else if (limitData.data.curBal) {
                            realCash = parseFloat(limitData.data.curBal);
                        }
                    } else if (limitData.data && limitData.data.data && limitData.data.data.length > 0) {
                        // Fallback for old SDK wrapper format
                        const marginLimit = limitData.data.data.find(l => l.prd === 'ALL' && l.seg === 'ALL' && l.exch === 'ALL');
                        if (marginLimit) realCash = parseFloat(marginLimit.curBal);
                    }
                    this.ctx.portfolio.cash = realCash;
                    this.ctx.portfolio.initialCash = realCash;
                    this.ctx.portfolio.notify('balance_update');
                    log(`[KOTAK] Real Cash Balance Fetched: ₹${realCash.toLocaleString(undefined, {minimumFractionDigits: 2})}`, 'info');
                 } else {
                    log(`[KOTAK API] Balance Sync Failed: ${limitData.error || 'Unknown Gateway Error'}`, 'error');
                 }
              })
              .catch(e => log(`[KOTAK] Network Error fetching cash balance.`, 'error'));
          } else {
            log(`[KOTAK 2FA FAILED] ${data.error}`, 'error');
          }
        })
        .catch(err => log(`[KOTAK] Network Error verifying OTP.`, 'error'));

        return { success: true };
      }

      // 10. Help
      case 'HELP':
      case 'H': {
        log('=== ALPHA GEN ALGO TERMINAL COMMAND DIRECTORY ===', 'highlight');
        log('  &lt;TICKER&gt; &lt;GO&gt;    : Switch security (NIFTY, RELIANCE, HDFCBANK, AAPL...)', 'info');
        log('  BUY [SIZE] &lt;GO&gt;  : Send aggressive Market Buy order', 'buy');
        log('  SELL [SIZE] &lt;GO&gt; : Send aggressive Market Sell order', 'sell');
        log('  BBX ON / OFF     : Toggle autonomous blackbox execution', 'highlight');
        log('  BBX TRAIN        : Run accelerated Bellman backprop cycle', 'info');
        log('  BBX RESET        : Reinitialize neural weights', 'warn');
        log('  FLATTEN &lt;GO&gt;     : Emergency liquidate all open positions', 'warn');
        log('  SPEED [1/2/5/25X]: Change feed accelerator rate', 'info');
        log('  TF [1S/5S/15S/1M]: Adjust candlestick timeframe', 'info');
        log('  MODE [LIVE/SIM]  : Toggle Kotak live API vs simulation', 'warn');
        log('  OTP [CODE] &lt;GO&gt;  : Submit 2FA Kotak OTP for live session', 'warn');
        log('  CLEAR &lt;GO&gt;       : Clear terminal stdout log', 'info');
        return { success: true };
      }

      case 'CLEAR':
      case 'CLS': {
        if (this.ctx.clearTerminal) this.ctx.clearTerminal();
        return { success: true };
      }

      default: {
        // Unknown command. Check if it might be a stock symbol by searching Yahoo Finance
        log(`SEARCHING FOR SYMBOL: ${primary}...`, 'info');
        try {
          const res = await fetch(`/api/search/${primary}`);
          const data = await res.json();
          if (data && data.results && data.results.length > 0) {
            const topMatch = data.results[0];
            const sym = topMatch.symbol;
            const name = topMatch.shortname;
            
            // Try to fetch current quote before initializing to prevent 1000 default
            let currentPrice = 1000;
            try {
               const quoteRes = await fetch(`/api/quotes`, {
                 method: 'POST',
                 headers: {'Content-Type': 'application/json'},
                 body: JSON.stringify({ symbols: [sym] })
               });
               const quoteData = await quoteRes.json();
               if (quoteData && quoteData[sym]) {
                  currentPrice = quoteData[sym];
               }
            } catch(e) {}
            
            // Inject dynamically into MarketEngine's cache with correct base price
            this.ctx.marketEngine.addDynamicInstrument(sym, name, currentPrice);
            this.ctx.marketEngine.setSymbol(sym); 
            
            log(`SECURITY SWITCHED TO ${sym} (${name})`, 'highlight');
            
            // Notify UI to add a ribbon tab
            if (this.ctx.ui && this.ctx.ui.addTickerTab) {
              this.ctx.ui.addTickerTab(sym, name);
            }
            
            return { success: true, message: `Active security set to ${sym}` };
          } else {
             log(`SYNTAX ERROR: UNRECOGNIZED COMMAND OR SYMBOL '${primary}'`, 'error');
             return { success: false, error: 'Unrecognized command' };
          }
        } catch (e) {
          log(`SEARCH FAILED: ${e.message}`, 'error');
          return { success: false, error: 'Search failed' };
        }
      }
    }
  }

  getPrevious() {
    if (this.history.length === 0) return '';
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex++;
    }
    return this.history[this.historyIndex] || '';
  }

  getNext() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      return this.history[this.historyIndex];
    }
    this.historyIndex = -1;
    return '';
  }
}
