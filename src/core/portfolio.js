// Portfolio, Order Management System (OMS) & Risk Analytics Engine

export class Portfolio {
  constructor(initialCash = 100000.00) {
    this.initialCash = initialCash;
    this.cash = initialCash;
    this.mode = 'SIM'; // 'SIM' or 'LIVE'
    this.realizedPnL = 0.0;
    this.positions = {}; // { 'NVDA': { size: 0, avgPrice: 0, realizedPnL: 0 } }
    this.blotter = []; // Array of executed trade records
    this.orderIdCounter = 1001;

    // Performance tracking
    this.equityHistory = [{ time: Date.now(), equity: initialCash }];
    this.peakEquity = initialCash;
    this.maxDrawdown = 0.0; // In %
    this.winningTrades = 0;
    this.losingTrades = 0;
    this.grossProfit = 0;
    this.grossLoss = 0;

    this.listeners = new Set();
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
        console.error('Portfolio listener error:', err);
      }
    }
  }

  getPosition(symbol) {
    if (!this.positions[symbol]) {
      this.positions[symbol] = {
        symbol,
        size: 0,
        avgPrice: 0,
        realizedPnL: 0
      };
    }
    return this.positions[symbol];
  }

  setMode(mode) {
    this.mode = mode;
    this.notify('mode_change', { mode: this.mode });
  }

  // Calculate total portfolio equity given current market prices
  getEquity(currentPrices = {}) {
    let positionValue = 0;
    let unrealizedTotal = 0;

    for (const [symbol, pos] of Object.entries(this.positions)) {
      if (pos.size !== 0) {
        const markPrice = currentPrices[symbol] || pos.avgPrice;
        const uPnL = pos.size * (markPrice - pos.avgPrice);
        unrealizedTotal += uPnL;
        positionValue += pos.size * markPrice;
      }
    }

    const totalEquity = this.cash + positionValue;
    return {
      cash: this.cash,
      totalEquity,
      positionValue,
      unrealizedPnL: unrealizedTotal,
      realizedPnL: this.realizedPnL,
      totalPnL: totalEquity - this.initialCash,
      totalPnLPct: ((totalEquity - this.initialCash) / this.initialCash) * 100
    };
  }

  // Execute an order (Market Order execution simulation with micro slippage)
  executeOrder({ symbol, side, size, currentPrice, source = 'MANUAL', tickSize = 0.01 }) {
    if (size <= 0) return null;

    const pos = this.getPosition(symbol);
    const isBuy = side.toUpperCase() === 'BUY';
    const signedSize = isBuy ? size : -size;

    // Realistic slippage: 0.5 to 1.5 ticks
    const slippageTicks = Math.random() * 1.0 + 0.5;
    const slippage = slippageTicks * tickSize * (isBuy ? 1 : -1);
    const execPrice = Math.round((currentPrice + slippage) / tickSize) * tickSize;

    let tradePnL = 0;
    const oldSize = pos.size;
    const newSize = oldSize + signedSize;

    // Check if trade closes or reduces an existing position
    if ((oldSize > 0 && !isBuy) || (oldSize < 0 && isBuy)) {
      const closedShares = Math.min(Math.abs(oldSize), size);
      if (oldSize > 0) {
        // Closing long
        tradePnL = closedShares * (execPrice - pos.avgPrice);
      } else {
        // Covering short
        tradePnL = closedShares * (pos.avgPrice - execPrice);
      }

      this.realizedPnL += tradePnL;
      pos.realizedPnL += tradePnL;

      if (tradePnL > 0) {
        this.winningTrades++;
        this.grossProfit += tradePnL;
      } else if (tradePnL < 0) {
        this.losingTrades++;
        this.grossLoss += Math.abs(tradePnL);
      }
    }

    // Cash balance adjustment
    this.cash -= signedSize * execPrice;

    // Position updates
    if (newSize === 0) {
      pos.size = 0;
      pos.avgPrice = 0;
    } else if ((oldSize >= 0 && isBuy) || (oldSize <= 0 && !isBuy)) {
      // Adding to position: calculate weighted average entry price
      const totalNotional = Math.abs(oldSize) * pos.avgPrice + size * execPrice;
      pos.size = newSize;
      pos.avgPrice = totalNotional / Math.abs(newSize);
    } else {
      // Position flipped side
      pos.size = newSize;
      pos.avgPrice = execPrice;
    }

    const record = {
      orderId: `BLG-${this.orderIdCounter++}`,
      time: Date.now(),
      symbol,
      side: isBuy ? 'BUY' : 'SELL',
      size,
      execPrice,
      slippage: Math.abs(execPrice - currentPrice),
      tradePnL,
      positionAfter: pos.size,
      source,
      status: 'FILLED'
    };

    this.blotter.unshift(record);
    if (this.blotter.length > 300) this.blotter.pop();

    this.notify('order_filled', record);
    
    // Route to Kotak if in LIVE mode
    if (this.mode === 'LIVE') {
      fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: record.symbol,
          side: record.side,
          size: record.size,
          price: null, // Market order
          type: 'MARKET'
        })
      }).then(res => res.json())
        .then(data => console.log('[Portfolio] Live Order Routed:', data))
        .catch(err => console.error('[Portfolio] Live Order Failed:', err));
    }

    return record;
  }

  // Liquidate all positions
  flattenAll(currentPrices = {}) {
    const orders = [];
    for (const [sym, pos] of Object.entries(this.positions)) {
      if (pos.size !== 0) {
        const side = pos.size > 0 ? 'SELL' : 'BUY';
        const size = Math.abs(pos.size);
        const price = currentPrices[sym] || pos.avgPrice;
        const order = this.executeOrder({
          symbol: sym,
          side,
          size,
          currentPrice: price,
          source: 'PANIC_FLATTEN'
        });
        if (order) orders.push(order);
      }
    }
    return orders;
  }

  // Track equity snapshot for Drawdown and Sharpe Ratio calculation
  updateSnapshot(currentPrices = {}) {
    const equityData = this.getEquity(currentPrices);
    const now = Date.now();

    this.equityHistory.push({ time: now, equity: equityData.totalEquity });
    if (this.equityHistory.length > 500) this.equityHistory.shift();

    if (equityData.totalEquity > this.peakEquity) {
      this.peakEquity = equityData.totalEquity;
    }
    const currentDrawdown = ((this.peakEquity - equityData.totalEquity) / this.peakEquity) * 100;
    if (currentDrawdown > this.maxDrawdown) {
      this.maxDrawdown = currentDrawdown;
    }

    return equityData;
  }

  getRiskMetrics() {
    const totalTrades = this.winningTrades + this.losingTrades;
    const winRate = totalTrades > 0 ? (this.winningTrades / totalTrades) * 100 : 0.0;
    const profitFactor = this.grossLoss > 0 ? (this.grossProfit / this.grossLoss) : (this.grossProfit > 0 ? 99.9 : 1.0);

    // Estimate Sharpe ratio from rolling equity returns
    let sharpe = 0.0;
    if (this.equityHistory.length > 10) {
      const returns = [];
      for (let i = 1; i < this.equityHistory.length; i++) {
        const r = (this.equityHistory[i].equity - this.equityHistory[i - 1].equity) / this.equityHistory[i - 1].equity;
        returns.push(r);
      }
      const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
      let varR = 0;
      for (const r of returns) varR += (r - meanR) * (r - meanR);
      const stdR = Math.sqrt(varR / returns.length);
      if (stdR > 1e-6) {
        sharpe = (meanR / stdR) * Math.sqrt(252 * 6.5 * 3600); // annualized
      }
    }

    return {
      totalTrades,
      winningTrades: this.winningTrades,
      losingTrades: this.losingTrades,
      winRate: winRate.toFixed(1),
      profitFactor: profitFactor.toFixed(2),
      maxDrawdown: this.maxDrawdown.toFixed(2),
      sharpeRatio: Math.max(-5, Math.min(10, sharpe)).toFixed(2)
    };
  }
}
