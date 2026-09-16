// Circular Experience Replay Buffer for Reinforcement Learning Stability

export class ExperienceReplay {
  constructor(capacity = 3000) {
    this.capacity = capacity;
    this.buffer = [];
    this.pointer = 0;
    this.totalPushed = 0;
  }

  push(transition) {
    // transition: { state, action, reward, nextState, done, info }
    if (this.buffer.length < this.capacity) {
      this.buffer.push(transition);
    } else {
      this.buffer[this.pointer] = transition;
    }
    this.pointer = (this.pointer + 1) % this.capacity;
    this.totalPushed++;
  }

  sample(batchSize = 32) {
    const n = this.buffer.length;
    if (n === 0) return [];
    const size = Math.min(batchSize, n);
    const batch = [];
    
    // Mix uniform random sampling with recent recency bias (prioritizing recent market regimes)
    for (let i = 0; i < size; i++) {
      let idx;
      if (Math.random() < 0.4) {
        // Sample from the most recent 20% transitions
        const recentSpan = Math.max(1, Math.floor(n * 0.2));
        const offset = Math.floor(Math.random() * recentSpan);
        idx = (this.pointer - 1 - offset + n) % n;
      } else {
        idx = Math.floor(Math.random() * n);
      }
      batch.push(this.buffer[idx]);
    }
    return batch;
  }

  size() {
    return this.buffer.length;
  }

  clear() {
    this.buffer = [];
    this.pointer = 0;
    this.totalPushed = 0;
  }

  getCapacityUtilization() {
    return Math.min(100, Math.round((this.buffer.length / this.capacity) * 100));
  }
}
