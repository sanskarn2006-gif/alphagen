// Real-Time High-Frequency Market Simulation Engine with L2 Depth & Microstructure

export const INSTRUMENTS = {
  // Indices
  'NIFTY': { symbol: 'NIFTY', name: 'Nifty 50 Index', basePrice: 24500.00, tickSize: 0.05, vol: 0.15, lotSize: 25 },
  'BANKNIFTY': { symbol: 'BANKNIFTY', name: 'Nifty Bank Index', basePrice: 51200.00, tickSize: 0.05, vol: 0.20, lotSize: 15 },
  
  // Top NIFTY 50 Equities
  'RELIANCE': { symbol: 'RELIANCE', name: 'Reliance Industries', basePrice: 3120.50, tickSize: 0.05, vol: 0.22, lotSize: 1 },
  'HDFCBANK': { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', basePrice: 1650.25, tickSize: 0.05, vol: 0.18, lotSize: 1 },
  'ICICIBANK': { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd.', basePrice: 1195.80, tickSize: 0.05, vol: 0.20, lotSize: 1 },
  'INFY': { symbol: 'INFY', name: 'Infosys Ltd.', basePrice: 1825.40, tickSize: 0.05, vol: 0.25, lotSize: 1 },
  'TCS': { symbol: 'TCS', name: 'Tata Consultancy Serv.', basePrice: 4230.15, tickSize: 0.05, vol: 0.21, lotSize: 1 },
  'ITC': { symbol: 'ITC', name: 'ITC Ltd.', basePrice: 485.60, tickSize: 0.05, vol: 0.15, lotSize: 1 },
  'LT': { symbol: 'LT', name: 'Larsen & Toubro', basePrice: 3560.90, tickSize: 0.05, vol: 0.24, lotSize: 1 },
  'KOTAKBANK': { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', basePrice: 1785.30, tickSize: 0.05, vol: 0.19, lotSize: 1 },
  'AXISBANK': { symbol: 'AXISBANK', name: 'Axis Bank Ltd.', basePrice: 1210.55, tickSize: 0.05, vol: 0.23, lotSize: 1 },
  'SBIN': { symbol: 'SBIN', name: 'State Bank of India', basePrice: 855.20, tickSize: 0.05, vol: 0.26, lotSize: 1 },
  'BHARTIARTL': { symbol: 'BHARTIARTL', name: 'Bharti Airtel', basePrice: 1450.75, tickSize: 0.05, vol: 0.22, lotSize: 1 },
  'BAJFINANCE': { symbol: 'BAJFINANCE', name: 'Bajaj Finance', basePrice: 6850.00, tickSize: 0.05, vol: 0.30, lotSize: 1 },
  'ASIANPAINT': { symbol: 'ASIANPAINT', name: 'Asian Paints', basePrice: 2950.40, tickSize: 0.05, vol: 0.18, lotSize: 1 },
  'TATAMOTORS': { symbol: 'TATAMOTORS', name: 'Tata Motors', basePrice: 985.35, tickSize: 0.05, vol: 0.35, lotSize: 1 },
  'MARUTI': { symbol: 'MARUTI', name: 'Maruti Suzuki', basePrice: 12450.00, tickSize: 0.05, vol: 0.22, lotSize: 1 }
};

export class MarketEngine {
  constructor(symbol = 'NIFTY', options = {}) {
    this.symbol = symbol;
    this.inst = INSTRUMENTS[symbol] || INSTRUMENTS['NIFTY'];
    this.speed = options.speed || 1; // Multiplier: 1, 2, 5, 25, 100
    this.mode = options.mode || 'SIM'; // 'SIM' or 'LIVE'
    this.isRunning = true;
    this.ws = null;

    this.price = this.inst.basePrice;
    this.lastPrice = this.price;
    this.tickCount = 0;
    this.ticksPerSecond = 0;
    this._secondTickAccumulator = 0;

    // Microstructure & Order Book
    this.bid = this.price - this.inst.tickSize;
    this.ask = this.price + this.inst.tickSize;
    this.spread = this.ask - this.bid;
    this.bids = []; // Array of { price, size, total }
    this.asks = [];
    this.orderFlowImbalance = 0.0;
    this.microPrice = this.price;

    // Technical & statistical state
    this.tickHistory = [];
    this.maxTicksHistory = 600;
    this.vwapSumPriceVol = 0;
    this.vwapSumVol = 0;
    this.vwap = this.price;
    this.realizedVol = this.inst.vol;

    // Candlesticks (1s, 5s, 15s, 1m)
    this.timeframe = '5s'; // Default candle span in seconds
    this.timeframeSeconds = 5;
    this.candles = [];
    this.currentCandle = null;
    this.maxCandles = 200;

    // Internal jump drift
    this.drift = 0.0;
    this.volatilityMultiplier = 1.0;

    this.listeners = new Set();
    this.timerId = null;

    this.generateInitialHistory();
    this.updateOrderBook();
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    this.connectLiveWebSocket();
  }

  addDynamicInstrument(symbol, name, basePrice = 1000) {
    if (!INSTRUMENTS[symbol]) {
      INSTRUMENTS[symbol] = {
        symbol: symbol,
        name: name,
        basePrice: basePrice,
        tickSize: 0.05,
        vol: 0.20,
        lotSize: 1
      };
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connectLiveWebSocket();
    }
    this.notify('mode_change', { mode: this.mode });
  }

  connectLiveWebSocket() {
    if (this.ws) this.ws.close();
    
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsHost = window.location.host;
    if (window.location.port === '5173') {
      wsHost = 'localhost:3000';
    }
    this.ws = new WebSocket(`${wsProtocol}//${wsHost}`);
    
    this.ws.onopen = () => {
      console.log('[Live MarketEngine] Connected to Kotak WS Proxy');
      this.ws.send(JSON.stringify({ action: 'SUBSCRIBE', symbol: this.symbol }));
    };

    this.ws.onmessage = (event) => {
      if (!this.isRunning) return;
      try {
        const msg = JSON.parse(event.data);
        const tickData = msg.type === 'TICK' ? msg : (msg.event === 'tick' ? msg.data : null);
        
        if (tickData) {
          this.notify('global_tick', tickData);
          if (tickData.symbol === this.symbol) {
             this.processLiveTick(tickData);
          }
        }
      } catch (err) {
        console.error('WS Parse Error', err);
      }
    };

    this.ws.onclose = () => {
      console.log('[Live MarketEngine] Disconnected from Kotak WS Proxy');
      // Basic reconnect logic could go here
    };
  }

  processLiveTick(msg) {
    this.tickCount++;
    this._secondTickAccumulator++;
    this.lastPrice = this.price;
    this.price = msg.price;
    
    const now = Date.now();
    const tickVolume = msg.volume;
    
    this.tickHistory.push({ time: now, price: this.price, size: tickVolume });
    if (this.tickHistory.length > this.maxTicksHistory) {
      this.tickHistory.shift();
    }

    this.vwapSumPriceVol += this.price * tickVolume;
    this.vwapSumVol += tickVolume;
    this.vwap = this.vwapSumPriceVol / (this.vwapSumVol || 1);

    // Update Candle
    const bucketMs = this.timeframeSeconds * 1000;
    const bucketTime = Math.floor(now / bucketMs) * bucketMs;

    if (!this.currentCandle || this.currentCandle.time !== bucketTime) {
      if (this.currentCandle) {
        this.candles.push(this.currentCandle);
        if (this.candles.length > this.maxCandles) {
          this.candles.shift();
        }
      }
      this.currentCandle = {
        time: bucketTime,
        open: this.price,
        high: this.price,
        low: this.price,
        close: this.price,
        volume: tickVolume,
        vwap: this.vwap
      };
    } else {
      this.currentCandle.high = Math.max(this.currentCandle.high, this.price);
      this.currentCandle.low = Math.min(this.currentCandle.low, this.price);
      this.currentCandle.close = this.price;
      this.currentCandle.volume += tickVolume;
      this.currentCandle.vwap = this.vwap;
    }

    // Override order book with WS exact limits
    this.bid = msg.bid;
    this.ask = msg.ask;
    this.spread = this.ask - this.bid;
    // (mock order book depth could be computed here, for simplicity we just set bid/ask)
    
    this.notify('tick', {
      symbol: this.symbol,
      price: this.price,
      lastPrice: this.lastPrice,
      change: this.price - this.inst.basePrice,
      changePct: ((this.price - this.inst.basePrice) / this.inst.basePrice) * 100,
      bid: this.bid,
      ask: this.ask,
      spread: this.spread,
      microPrice: this.microPrice,
      volume: tickVolume,
      vwap: this.vwap,
      orderFlowImbalance: this.orderFlowImbalance,
      time: now
    });
  }

  setSymbol(symbol) {
    if (!INSTRUMENTS[symbol]) return;
    this.symbol = symbol;
    this.inst = INSTRUMENTS[symbol];
    this.price = this.inst.basePrice;
    this.lastPrice = this.price;
    this.tickHistory = [];
    this.vwapSumPriceVol = 0;
    this.vwapSumVol = 0;
    this.candles = [];
    this.currentCandle = null;
    this.generateInitialHistory();
    this.updateOrderBook();
    this.notify('symbol_change', { symbol, inst: this.inst });
    if (this.mode === 'LIVE' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'SUBSCRIBE', symbol: this.symbol, basePrice: this.inst.basePrice }));
    }
    
    // Fetch true historical market data for TradingView and Blackbox pre-training
    this.currentFetchSymbol = symbol;
    this.fetchHistoricalData(symbol);
  }

  async fetchHistoricalData(symbol) {
    try {
      const res = await fetch(`/api/historical/${symbol}`);
      const data = await res.json();
      if (this.currentFetchSymbol !== symbol) return; // Prevent race conditions
      
      if (data && data.length > 0) {
        this.candles = [];
        this.vwapSumPriceVol = 0;
        this.vwapSumVol = 0;
        this.tickHistory = [];
        
        for (const c of data) {
           const timeMs = c.time * 1000;
           this.vwapSumPriceVol += (c.close * c.value);
           this.vwapSumVol += c.value;
           const vwap = this.vwapSumPriceVol / (this.vwapSumVol || 1);
           
           this.candles.push({
              time: timeMs,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.value,
              vwap: vwap
           });
           
           // Seed tick history so Blackbox getStateFeatures() has real market context
           this.tickHistory.push({ time: timeMs, price: c.close, size: c.value });
           if (this.tickHistory.length > this.maxTicksHistory) this.tickHistory.shift();
        }
        
        this.price = data[data.length - 1].close;
        this.lastPrice = data[data.length - 1].open;
        this.inst.basePrice = this.price; // Update base price to prevent reversion to 1000
        this.vwap = this.vwapSumPriceVol / (this.vwapSumVol || 1);
        this.historyUpdated = true;
        this.computeBollingerBands();
        
        this.notify('history_loaded', { symbol: this.symbol, count: data.length });
      }
    } catch (e) {
      console.error('Failed to fetch historical data for', this.symbol, e);
    }
  }

  setTimeframe(tf) {
    this.timeframe = tf;
    switch (tf) {
      case '1s': this.timeframeSeconds = 1; break;
      case '5s': this.timeframeSeconds = 5; break;
      case '15s': this.timeframeSeconds = 15; break;
      case '1m': this.timeframeSeconds = 60; break;
      default: this.timeframeSeconds = 5;
    }
    this.rebuildCandlesFromTicks();
    this.notify('timeframe_change', { timeframe: tf });
  }

  setSpeed(multiplier) {
    this.speed = Math.max(1, Math.min(100, multiplier));
    this.restartClock();
    this.notify('speed_change', { speed: this.speed });
  }

  togglePause() {
    this.isRunning = !this.isRunning;
    if (this.isRunning) {
      if (this.mode === 'SIM') this.startClock();
    } else {
      if (this.timerId) clearInterval(this.timerId);
      this.timerId = null;
    }
    this.notify('status_change', { isRunning: this.isRunning });
    return this.isRunning;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify(event, data) {
    for (const cb of this.listeners) {
      try {
        cb(event, data);
      } catch (err) {
        console.error('MarketEngine listener error:', err);
      }
    }
  }

  generateInitialHistory() {
    const now = Date.now();
    const tickInterval = 200; // ms
    const initialTicks = 250;
    let p = this.inst.basePrice;

    for (let i = initialTicks; i >= 0; i--) {
      const t = now - i * tickInterval;
      // Random walk with mean reversion
      const drift = (this.inst.basePrice - p) * 0.01;
      const noise = (Math.random() - 0.498) * (p * 0.0015);
      p = Math.max(this.inst.tickSize, p + drift + noise);
      p = Math.round(p / this.inst.tickSize) * this.inst.tickSize;

      const size = Math.floor(Math.random() * 80 + 10);
      this.tickHistory.push({ time: t, price: p, size });
      this.vwapSumPriceVol += p * size;
      this.vwapSumVol += size;
    }

    this.price = p;
    this.vwap = this.vwapSumPriceVol / (this.vwapSumVol || 1);
    this.rebuildCandlesFromTicks();
    this.historyUpdated = true;
  }

  rebuildCandlesFromTicks() {
    this.candles = [];
    this.currentCandle = null;
    const bucketMs = this.timeframeSeconds * 1000;

    for (const tick of this.tickHistory) {
      const bucketTime = Math.floor(tick.time / bucketMs) * bucketMs;
      if (!this.currentCandle || this.currentCandle.time !== bucketTime) {
        if (this.currentCandle) {
          this.candles.push(this.currentCandle);
        }
        this.currentCandle = {
          time: bucketTime,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
          volume: tick.size,
          vwap: this.vwap
        };
      } else {
        this.currentCandle.high = Math.max(this.currentCandle.high, tick.price);
        this.currentCandle.low = Math.min(this.currentCandle.low, tick.price);
        this.currentCandle.close = tick.price;
        this.currentCandle.volume += tick.size;
      }
    }
    if (this.currentCandle) {
      this.candles.push(this.currentCandle);
    }
    if (this.candles.length > this.maxCandles) {
      this.candles = this.candles.slice(-this.maxCandles);
    }
    this.computeBollingerBands();
    this.historyUpdated = true;
  }

  computeBollingerBands() {
    const period = 20;
    for (let i = 0; i < this.candles.length; i++) {
      if (i < period - 1) {
        this.candles[i].bbMiddle = this.candles[i].close;
        this.candles[i].bbUpper = this.candles[i].close;
        this.candles[i].bbLower = this.candles[i].close;
        continue;
      }
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += this.candles[i - j].close;
      }
      const mean = sum / period;
      let varianceSum = 0;
      for (let j = 0; j < period; j++) {
        const diff = this.candles[i - j].close - mean;
        varianceSum += diff * diff;
      }
      const std = Math.sqrt(varianceSum / period);
      this.candles[i].bbMiddle = mean;
      this.candles[i].bbUpper = mean + 2 * std;
      this.candles[i].bbLower = mean - 2 * std;
    }
  }

  startClock() {
    return;
    // Base frequency: 60 ticks/second at 1x, scaling with speed
    const intervalMs = Math.max(10, Math.floor(100 / this.speed));

    this.timerId = setInterval(() => {
      if (!this.isRunning) return;
      const ticksToProcess = this.speed > 10 ? Math.ceil(this.speed / 10) : 1;
      for (let i = 0; i < ticksToProcess; i++) {
        this.generateTick();
      }
    }, intervalMs);

    // Measure actual throughput
    this._rateInterval = setInterval(() => {
      this.ticksPerSecond = this._secondTickAccumulator;
      this._secondTickAccumulator = 0;
    }, 1000);
  }

  restartClock() {
    if (this.isRunning) {
      this.startClock();
    }
  }

  generateTick(orderImpact = 0) {
    this.tickCount++;
    this._secondTickAccumulator++;
    this.lastPrice = this.price;

    // Geometric Brownian motion with jump-diffusion & mean reversion
    const meanReversion = (this.inst.basePrice - this.price) * 0.0008;
    const vol = (this.inst.vol * this.volatilityMultiplier * this.price) / 1000;
    
    // Random standard normal
    const u1 = Math.max(1e-12, Math.random());
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    // Poisson Jump
    let jump = 0;
    if (Math.random() < 0.015) {
      jump = (Math.random() - 0.49) * vol * 4;
    }

    // Impact from aggressive algo/manual execution
    const executionShift = orderImpact * this.inst.tickSize * 1.5;

    // Price delta
    const delta = (meanReversion + z0 * vol + jump + executionShift);
    this.price = Math.max(this.inst.tickSize, this.price + delta);
    // Align to tick size
    this.price = Math.round(this.price / this.inst.tickSize) * this.inst.tickSize;

    const tickVolume = Math.floor(Math.random() * 50 + 5 + Math.abs(delta) * 100);
    const now = Date.now();

    this.tickHistory.push({ time: now, price: this.price, size: tickVolume });
    if (this.tickHistory.length > this.maxTicksHistory) {
      this.tickHistory.shift();
    }

    // Update cumulative VWAP
    this.vwapSumPriceVol += this.price * tickVolume;
    this.vwapSumVol += tickVolume;
    this.vwap = this.vwapSumPriceVol / (this.vwapSumVol || 1);

    // Update Candle
    const bucketMs = this.timeframeSeconds * 1000;
    const bucketTime = Math.floor(now / bucketMs) * bucketMs;

    if (!this.currentCandle || this.currentCandle.time !== bucketTime) {
      if (this.currentCandle) {
        this.candles.push(this.currentCandle);
        if (this.candles.length > this.maxCandles) {
          this.candles.shift();
        }
      }
      this.currentCandle = {
        time: bucketTime,
        open: this.price,
        high: this.price,
        low: this.price,
        close: this.price,
        volume: tickVolume,
        vwap: this.vwap
      };
    } else {
      this.currentCandle.high = Math.max(this.currentCandle.high, this.price);
      this.currentCandle.low = Math.min(this.currentCandle.low, this.price);
      this.currentCandle.close = this.price;
      this.currentCandle.volume += tickVolume;
      this.currentCandle.vwap = this.vwap;
    }

    this.updateOrderBook();

    // Broadcast tick event
    this.notify('tick', {
      symbol: this.symbol,
      price: this.price,
      lastPrice: this.lastPrice,
      change: this.price - this.inst.basePrice,
      changePct: ((this.price - this.inst.basePrice) / this.inst.basePrice) * 100,
      bid: this.bid,
      ask: this.ask,
      spread: this.spread,
      microPrice: this.microPrice,
      volume: tickVolume,
      vwap: this.vwap,
      orderFlowImbalance: this.orderFlowImbalance,
      time: now
    });
  }

  // Generate 10-level Level 2 Order Book with dynamic liquidity clustering
  updateOrderBook() {
    const ts = this.inst.tickSize;
    // Spread oscillates between 1 and 3 ticks
    const halfSpreadTicks = Math.random() < 0.7 ? 1 : 2;
    this.bid = Math.max(ts, this.price - halfSpreadTicks * ts);
    this.ask = this.price + halfSpreadTicks * ts;
    this.spread = this.ask - this.bid;

    const depthLevels = 10;
    this.bids = [];
    this.asks = [];

    let cumBidSize = 0;
    let cumAskSize = 0;
    let sumBidPriceWeight = 0;
    let sumAskPriceWeight = 0;

    for (let level = 0; level < depthLevels; level++) {
      const bidPrice = this.bid - level * ts;
      const askPrice = this.ask + level * ts;

      // Realistic non-linear liquidity depth
      const baseSize = Math.floor(40 + level * 35 + (Math.random() - 0.4) * 30);
      const bidSize = Math.max(5, baseSize + Math.floor((Math.sin(this.tickCount * 0.1 + level) + 1) * 20));
      const askSize = Math.max(5, baseSize + Math.floor((Math.cos(this.tickCount * 0.1 + level) + 1) * 20));

      cumBidSize += bidSize;
      cumAskSize += askSize;

      sumBidPriceWeight += bidPrice * bidSize;
      sumAskPriceWeight += askPrice * askSize;

      this.bids.push({ price: bidPrice, size: bidSize, total: cumBidSize });
      this.asks.push({ price: askPrice, size: askSize, total: cumAskSize });
    }

    // Order Flow Imbalance: OFI = (BidVol - AskVol) / (BidVol + AskVol)
    const topBidVol = this.bids[0].size + this.bids[1].size;
    const topAskVol = this.asks[0].size + this.asks[1].size;
    this.orderFlowImbalance = (topBidVol - topAskVol) / Math.max(1, topBidVol + topAskVol);

    // Micro-Price: weighted mid-price by top of book volumes
    this.microPrice = (this.bid * topAskVol + this.ask * topBidVol) / (topBidVol + topAskVol);
  }

  // Extract normalized state vector (8 features) for the self-learning blackbox
  getStateFeatures(inventoryNormalized = 0.0) {
    const len = this.tickHistory.length;
    if (len < 25) {
      return [0, 0, 0, 0, 0.2, 0, 1.0, inventoryNormalized];
    }

    // 1. Short-term return (5 ticks)
    const pNow = this.price;
    const p5 = this.tickHistory[len - 5].price;
    const mom5 = ((pNow - p5) / (p5 || 1)) * 100; // in %

    // 2. Medium-term return (20 ticks)
    const p20 = this.tickHistory[len - 20].price;
    const mom20 = ((pNow - p20) / (p20 || 1)) * 100; // in %

    // 3. Order Flow Imbalance (-1 to +1)
    const ofi = this.orderFlowImbalance;

    // 4. VWAP Divergence
    const vwapDiv = ((pNow - this.vwap) / (this.vwap || 1)) * 100;

    // 5. Realized Volatility / ATR proxy
    let priceSpreadSum = 0;
    for (let i = len - 15; i < len; i++) {
      priceSpreadSum += Math.abs(this.tickHistory[i].price - this.tickHistory[i - 1].price);
    }
    const avgSpread15 = (priceSpreadSum / 15) / (pNow * 0.001); // normalized ATR

    // 6. Micro-price skew
    const midPrice = (this.bid + this.ask) / 2;
    const microSkew = ((this.microPrice - midPrice) / this.spread);

    // 7. Volume surge ratio
    const currentVol = this.tickHistory[len - 1].size;
    let volSum = 0;
    for (let i = len - 20; i < len; i++) volSum += this.tickHistory[i].size;
    const volRatio = currentVol / Math.max(1, volSum / 20);

    // Feature normalization (bounded between approx -3.0 and +3.0)
    return [
      Math.max(-3.0, Math.min(3.0, mom5 * 5.0)),
      Math.max(-3.0, Math.min(3.0, mom20 * 2.5)),
      Math.max(-1.0, Math.min(1.0, ofi)),
      Math.max(-3.0, Math.min(3.0, vwapDiv * 4.0)),
      Math.max(0.1, Math.min(3.0, avgSpread15)),
      Math.max(-2.0, Math.min(2.0, microSkew * 2.0)),
      Math.max(0.1, Math.min(4.0, volRatio)),
      Math.max(-1.0, Math.min(1.0, inventoryNormalized))
    ];
  }
}
