// Statistical Market Regime Classifier
// Detects Bull Momentum, Bear Trend, Range-Bound Chop, and Volatility Surge

export class RegimeDetector {
  constructor(lookback = 30) {
    this.lookback = lookback;
    this.priceHistory = [];
    this.volumeHistory = [];
    this.currentRegime = 'INITIALIZING';
    this.regimeConfidence = 0.5;
    this.metrics = {
      drift: 0,
      volatility: 0,
      meanReversion: 0,
      volumeRatio: 1.0
    };
  }

  update(price, volume) {
    this.priceHistory.push(price);
    this.volumeHistory.push(volume);

    if (this.priceHistory.length > this.lookback) {
      this.priceHistory.shift();
      this.volumeHistory.shift();
    }

    if (this.priceHistory.length < 10) {
      this.currentRegime = 'ACCUMULATING';
      return this.currentRegime;
    }

    // 1. Calculate Drift / Trend Momentum
    const firstPrice = this.priceHistory[0];
    const lastPrice = this.priceHistory[this.priceHistory.length - 1];
    const netReturn = (lastPrice - firstPrice) / firstPrice;
    this.metrics.drift = netReturn;

    // 2. Realized Volatility
    let sumLogRetSq = 0;
    for (let i = 1; i < this.priceHistory.length; i++) {
      const logRet = Math.log(this.priceHistory[i] / this.priceHistory[i - 1]);
      sumLogRetSq += logRet * logRet;
    }
    const realVol = Math.sqrt(sumLogRetSq / (this.priceHistory.length - 1)) * Math.sqrt(252 * 6.5 * 3600); // annualized
    this.metrics.volatility = realVol;

    // 3. Mean Reversion Index (Variance Ratio proxy)
    let signFlips = 0;
    for (let i = 2; i < this.priceHistory.length; i++) {
      const diff1 = this.priceHistory[i] - this.priceHistory[i - 1];
      const diff0 = this.priceHistory[i - 1] - this.priceHistory[i - 2];
      if ((diff1 > 0 && diff0 < 0) || (diff1 < 0 && diff0 > 0)) {
        signFlips++;
      }
    }
    this.metrics.meanReversion = signFlips / Math.max(1, this.priceHistory.length - 2);

    // 4. Volume Surge
    const avgVol = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
    this.metrics.volumeRatio = volume / Math.max(1, avgVol);

    // Regime classification logic
    const driftThreshold = 0.0035; // 0.35% drift over lookback
    const volThreshold = 0.35; // 35% annualized vol
    const meanRevThreshold = 0.58; // High sign flips

    if (this.metrics.volatility > volThreshold && this.metrics.volumeRatio > 1.8) {
      this.currentRegime = 'VOLATILITY_SURGE';
      this.regimeConfidence = Math.min(0.98, 0.6 + this.metrics.volumeRatio * 0.1);
    } else if (this.metrics.drift > driftThreshold && this.metrics.meanReversion < 0.5) {
      this.currentRegime = 'BULL_MOMENTUM';
      this.regimeConfidence = Math.min(0.95, 0.55 + Math.abs(this.metrics.drift) * 60);
    } else if (this.metrics.drift < -driftThreshold && this.metrics.meanReversion < 0.5) {
      this.currentRegime = 'BEAR_MOMENTUM';
      this.regimeConfidence = Math.min(0.95, 0.55 + Math.abs(this.metrics.drift) * 60);
    } else if (this.metrics.meanReversion >= meanRevThreshold) {
      this.currentRegime = 'RANGE_BOUND_CHOP';
      this.regimeConfidence = Math.min(0.92, 0.5 + this.metrics.meanReversion * 0.4);
    } else {
      this.currentRegime = 'NEUTRAL_TRANSITION';
      this.regimeConfidence = 0.55;
    }

    return this.currentRegime;
  }

  getRegimeCode() {
    switch (this.currentRegime) {
      case 'BULL_MOMENTUM': return 1.0;
      case 'BEAR_MOMENTUM': return -1.0;
      case 'VOLATILITY_SURGE': return 0.5;
      case 'RANGE_BOUND_CHOP': return -0.5;
      default: return 0.0;
    }
  }
}
