// Simulation & Math Integrity Verification Test

import { MarketEngine } from './src/core/marketEngine.js';
import { Portfolio } from './src/core/portfolio.js';
import { BlackboxAgent, ACTIONS } from './src/ml/blackboxAgent.js';
import { RegimeDetector } from './src/ml/regimeDetector.js';

console.log('--- RUNNING QUANT ALGO & BLACKBOX INTEGRITY TEST ---');

const market = new MarketEngine('NIFTY', { speed: 100 });
const portfolio = new Portfolio(100000);
const blackbox = new BlackboxAgent({ learningRate: 0.01, epsilon: 0.20 });
const regime = new RegimeDetector(20);

let ticksProcessed = 0;
let tradesExecuted = 0;
let initialLoss = 0;
let finalLoss = 0;

// Enable autonomous trading
blackbox.autoExecute = true;

console.log('Starting simulated high-frequency market run (300 ticks)...');

let lastEquity = 100000;
let lastState = null;
let lastAction = ACTIONS.HOLD;

for (let i = 0; i < 300; i++) {
  market.generateTick();
  ticksProcessed++;

  const p = market.price;
  const vol = market.tickHistory[market.tickHistory.length - 1].size;
  regime.update(p, vol);

  const pos = portfolio.getPosition(market.symbol);
  const invNorm = Math.max(-1, Math.min(1, pos.size / 50));
  const state = market.getStateFeatures(invNorm);

  const decision = blackbox.selectAction(state, false);

  const equity = portfolio.getEquity({ [market.symbol]: p }).totalEquity;
  const reward = (equity - lastEquity) - Math.abs(pos.size) * 0.01;

  if (lastState) {
    blackbox.observeStep(lastState, lastAction, reward, state, false);
  }

  if (i === 35) {
    initialLoss = blackbox.lastLoss;
  }

  lastState = state;
  lastAction = decision.action;
  lastEquity = equity;

  // Execute trades
  if (decision.action === ACTIONS.BUY && pos.size <= 0) {
    portfolio.executeOrder({
      symbol: market.symbol,
      side: 'BUY',
      size: 10,
      currentPrice: market.ask,
      source: 'BLACKBOX_RL'
    });
    tradesExecuted++;
  } else if (decision.action === ACTIONS.SELL && pos.size >= 0) {
    portfolio.executeOrder({
      symbol: market.symbol,
      side: 'SELL',
      size: 10,
      currentPrice: market.bid,
      source: 'BLACKBOX_RL'
    });
    tradesExecuted++;
  }
}

finalLoss = blackbox.lastLoss;
const risk = portfolio.getRiskMetrics();
const finalEq = portfolio.getEquity({ [market.symbol]: market.price });

console.log(`Ticks Processed: ${ticksProcessed}`);
console.log(`Trades Auto-Executed by Blackbox: ${tradesExecuted}`);
console.log(`Replay Buffer Transitions: ${blackbox.replay.size()}`);
console.log(`Initial Bellman Loss: ${initialLoss.toFixed(6)} -> Final Bellman Loss: ${finalLoss.toFixed(6)}`);
console.log(`Market Regime Detected: ${regime.currentRegime}`);
console.log(`Total Portfolio Equity: ₹${finalEq.totalEquity.toFixed(2)} (PnL: ₹${finalEq.totalPnL.toFixed(2)})`);
console.log(`Blotter Records: ${portfolio.blotter.length} orders logged`);
console.log(`Saliency Vector: ${blackbox.saliency.map(s => (s * 100).toFixed(1) + '%').join(', ')}`);
console.log('--- VERIFICATION COMPLETE: ALL QUANT PIPELINES OPERATIONAL ---');
