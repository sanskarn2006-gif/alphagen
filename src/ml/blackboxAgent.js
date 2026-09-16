// Self-Learning Blackbox Reinforcement Learning Agent
// Deep Q-Network (DQN) with Continuous Online Backpropagation,
// Target Network Stabilization, Adam Optimizer, and Real-Time Saliency / Feature Attribution.

import { Matrix, Activations, AdamOptimizer } from './matrix.js';
import { ExperienceReplay } from './experienceReplay.js';

export const ACTIONS = {
  BUY: 0,
  HOLD: 1,
  SELL: 2
};

export const ACTION_NAMES = ['BUY (+1)', 'HOLD (0)', 'SELL (-1)'];

export const FEATURE_NAMES = [
  'Mom. 5-Tick',
  'Mom. 20-Tick',
  'Order Flow Imb (OFI)',
  'VWAP Divergence',
  'Realized Vol (ATR)',
  'Micro-Price Skew',
  'Vol Surge Ratio',
  'Current Inventory'
];

export class BlackboxAgent {
  constructor(options = {}) {
    this.inputDim = 8;
    this.hidden1Dim = 16;
    this.hidden2Dim = 12;
    this.outputDim = 3; // BUY, HOLD, SELL

    this.gamma = options.gamma ?? 0.95; // Discount factor
    this.learningRate = options.learningRate ?? 0.005;
    this.epsilon = options.epsilon ?? 0.30; // Exploration rate
    this.minEpsilon = 0.02;
    this.epsilonDecay = 0.9995;
    this.targetUpdateFreq = 100; // Target network sync every N updates
    this.stepCounter = 0;
    this.trainStepCounter = 0;

    this.autoExecute = false; // Whether agent executes orders autonomously
    this.trainingEnabled = true;

    this.replay = new ExperienceReplay(4000);
    this.optimizer = new AdamOptimizer(this.learningRate);

    // Telemetry & metrics
    this.lastLoss = 0.0;
    this.lossHistory = [];
    this.qValues = [0, 0, 0];
    this.chosenAction = ACTIONS.HOLD;
    this.confidence = 0.5;
    this.saliency = new Array(this.inputDim).fill(0);
    this.totalRewards = 0;
    this.episodeReward = 0;

    // Cache of activations and weights for visualization
    this.cache = {
      inputs: new Float64Array(this.inputDim),
      h1_z: null,
      h1_a: new Float64Array(this.hidden1Dim),
      h2_z: null,
      h2_a: new Float64Array(this.hidden2Dim),
      q_out: new Float64Array(this.outputDim)
    };

    this.initWeights();
  }

  initWeights() {
    // Primary Q-Network
    this.w1 = Matrix.random(this.hidden1Dim, this.inputDim, 1.0);
    this.b1 = Matrix.zeros(this.hidden1Dim, 1);

    this.w2 = Matrix.random(this.hidden2Dim, this.hidden1Dim, 1.0);
    this.b2 = Matrix.zeros(this.hidden2Dim, 1);

    this.w3 = Matrix.random(this.outputDim, this.hidden2Dim, 1.0);
    this.b3 = Matrix.zeros(this.outputDim, 1);

    // Target Q-Network (cloned)
    this.syncTargetNetwork();
  }

  syncTargetNetwork() {
    this.target_w1 = this.w1.clone();
    this.target_b1 = this.b1.clone();
    this.target_w2 = this.w2.clone();
    this.target_b2 = this.b2.clone();
    this.target_w3 = this.w3.clone();
    this.target_b3 = this.b3.clone();
  }

  setLearningRate(lr) {
    this.learningRate = lr;
    this.optimizer.setLearningRate(lr);
  }

  setEpsilon(eps) {
    this.epsilon = Math.max(0.0, Math.min(1.0, eps));
  }

  // Forward pass through network with activation caching
  forward(stateVector, weights = null) {
    const w1 = weights ? weights.w1 : this.w1;
    const b1 = weights ? weights.b1 : this.b1;
    const w2 = weights ? weights.w2 : this.w2;
    const b2 = weights ? weights.b2 : this.b2;
    const w3 = weights ? weights.w3 : this.w3;
    const b3 = weights ? weights.b3 : this.b3;

    const x = Matrix.fromArray(stateVector);

    // Layer 1: H1 = LeakyReLU(W1 * X + B1)
    const z1 = Matrix.dot(w1, x).add(b1);
    const a1 = z1.map(v => Activations.leakyRelu.fn(v));

    // Layer 2: H2 = LeakyReLU(W2 * A1 + B2)
    const z2 = Matrix.dot(w2, a1).add(b2);
    const a2 = z2.map(v => Activations.leakyRelu.fn(v));

    // Output Layer: Q = W3 * A2 + B3
    const q = Matrix.dot(w3, a2).add(b3);

    return { x, z1, a1, z2, a2, q };
  }

  // Action selection with Epsilon-Greedy policy
  selectAction(features, evalOnly = false) {
    this.stepCounter++;
    const pass = this.forward(features);
    const qArray = pass.q.toArray();

    // Cache current state for visualizer
    this.cache.inputs = Float64Array.from(features);
    this.cache.h1_z = pass.z1;
    this.cache.h1_a = Float64Array.from(pass.a1.toArray());
    this.cache.h2_z = pass.z2;
    this.cache.h2_a = Float64Array.from(pass.a2.toArray());
    this.cache.q_out = Float64Array.from(qArray);
    this.qValues = qArray;

    // Saliency computation: Backpropagate gradient of top action to inputs
    this.computeSaliency(pass);

    let action;
    const exploreRoll = Math.random();
    if (!evalOnly && exploreRoll < this.epsilon) {
      // Exploration: Random action
      action = Math.floor(Math.random() * this.outputDim);
    } else {
      // Exploitation: argmax Q
      let maxIdx = 0;
      let maxVal = qArray[0];
      for (let i = 1; i < qArray.length; i++) {
        if (qArray[i] > maxVal) {
          maxVal = qArray[i];
          maxIdx = i;
        }
      }
      action = maxIdx;
    }

    // Compute action probabilities / confidence via softmax on Q-values
    const probs = Activations.softmax(qArray);
    this.confidence = probs[action];
    this.chosenAction = action;

    return {
      action,
      actionName: ACTION_NAMES[action],
      qValues: qArray,
      confidence: this.confidence,
      isRandom: !evalOnly && exploreRoll < this.epsilon
    };
  }

  // Calculate Gradient of Q(action) with respect to input features (Feature Saliency)
  computeSaliency(pass) {
    const { a1, a2, z1, z2 } = pass;
    const targetAction = this.chosenAction;

    // Gradient at output: 1 for chosen action, 0 for others
    const dq = new Matrix(this.outputDim, 1);
    dq.set(targetAction, 0, 1.0);

    // Gradient through W3: d_a2 = W3^T * dq
    const w3_t = this.w3.transpose();
    const d_a2 = Matrix.dot(w3_t, dq);

    // Gradient through activation 2: d_z2 = d_a2 * LeakyReLU'(z2)
    const d_z2 = new Matrix(this.hidden2Dim, 1);
    for (let i = 0; i < this.hidden2Dim; i++) {
      d_z2.set(i, 0, d_a2.get(i, 0) * Activations.leakyRelu.df(z2.get(i, 0)));
    }

    // Gradient through W2: d_a1 = W2^T * d_z2
    const w2_t = this.w2.transpose();
    const d_a1 = Matrix.dot(w2_t, d_z2);

    // Gradient through activation 1: d_z1 = d_a1 * LeakyReLU'(z1)
    const d_z1 = new Matrix(this.hidden1Dim, 1);
    for (let i = 0; i < this.hidden1Dim; i++) {
      d_z1.set(i, 0, d_a1.get(i, 0) * Activations.leakyRelu.df(z1.get(i, 0)));
    }

    // Gradient through W1 to inputs X: d_x = W1^T * d_z1
    const w1_t = this.w1.transpose();
    const d_x = Matrix.dot(w1_t, d_z1);

    // Normalize saliency magnitudes to percentage contribution
    let totalMag = 0;
    const rawSaliency = [];
    for (let i = 0; i < this.inputDim; i++) {
      const mag = Math.abs(d_x.get(i, 0));
      rawSaliency.push(mag);
      totalMag += mag;
    }

    if (totalMag > 1e-7) {
      for (let i = 0; i < this.inputDim; i++) {
        // Smooth exponential moving average for steady UI display
        this.saliency[i] = this.saliency[i] * 0.8 + (rawSaliency[i] / totalMag) * 0.2;
      }
    }
  }

  // Push transition to memory buffer
  observeStep(state, action, reward, nextState, done = false) {
    this.totalRewards += reward;
    this.episodeReward += reward;
    this.replay.push({ state, action, reward, nextState, done });

    if (this.trainingEnabled && this.replay.size() >= 32) {
      this.trainBatch(16);
    }

    // Decay exploration
    if (this.epsilon > this.minEpsilon) {
      this.epsilon *= this.epsilonDecay;
    }
  }

  // Bellman Q-Learning Update with Gradient Backpropagation
  trainBatch(batchSize = 24) {
    const batch = this.replay.sample(batchSize);
    if (batch.length === 0) return 0;

    this.trainStepCounter++;
    let batchLoss = 0;

    // Accumulate gradients across batch
    const gw1 = Matrix.zeros(this.w1.rows, this.w1.cols);
    const gb1 = Matrix.zeros(this.b1.rows, this.b1.cols);
    const gw2 = Matrix.zeros(this.w2.rows, this.w2.cols);
    const gb2 = Matrix.zeros(this.b2.rows, this.b2.cols);
    const gw3 = Matrix.zeros(this.w3.rows, this.w3.cols);
    const gb3 = Matrix.zeros(this.b3.rows, this.b3.cols);

    const targetWeights = {
      w1: this.target_w1,
      b1: this.target_b1,
      w2: this.target_w2,
      b2: this.target_b2,
      w3: this.target_w3,
      b3: this.target_b3
    };

    for (const item of batch) {
      const { state, action, reward, nextState, done } = item;

      // 1. Current Q values: Q(s, :)
      const currentPass = this.forward(state);
      const qVal = currentPass.q.get(action, 0);

      // 2. Target Q calculation: Q_target = r + gamma * max Q_target(s', :)
      let targetQ = reward;
      if (!done) {
        const nextPass = this.forward(nextState, targetWeights);
        const nextQVals = nextPass.q.toArray();
        const maxNextQ = Math.max(...nextQVals);
        targetQ = reward + this.gamma * maxNextQ;
      }

      // Smooth L1 / Huber TD-error
      const tdError = qVal - targetQ;
      batchLoss += tdError * tdError;

      // Huber gradient: clip between -1 and 1
      const clippedGrad = Math.max(-1.0, Math.min(1.0, tdError));

      // 3. Backpropagate error through network
      const deltaQ = Matrix.zeros(this.outputDim, 1);
      deltaQ.set(action, 0, clippedGrad);

      // dW3 = deltaQ * a2^T
      const a2_t = currentPass.a2.transpose();
      const dW3 = Matrix.dot(deltaQ, a2_t);
      gw3.add(dW3);
      gb3.add(deltaQ);

      // Layer 2 backprop
      const w3_t = this.w3.transpose();
      const da2 = Matrix.dot(w3_t, deltaQ);
      const dz2 = new Matrix(this.hidden2Dim, 1);
      for (let i = 0; i < this.hidden2Dim; i++) {
        dz2.set(i, 0, da2.get(i, 0) * Activations.leakyRelu.df(currentPass.z2.get(i, 0)));
      }

      const a1_t = currentPass.a1.transpose();
      const dW2 = Matrix.dot(dz2, a1_t);
      gw2.add(dW2);
      gb2.add(dz2);

      // Layer 1 backprop
      const w2_t = this.w2.transpose();
      const da1 = Matrix.dot(w2_t, dz2);
      const dz1 = new Matrix(this.hidden1Dim, 1);
      for (let i = 0; i < this.hidden1Dim; i++) {
        dz1.set(i, 0, da1.get(i, 0) * Activations.leakyRelu.df(currentPass.z1.get(i, 0)));
      }

      const x_t = currentPass.x.transpose();
      const dW1 = Matrix.dot(dz1, x_t);
      gw1.add(dW1);
      gb1.add(dz1);
    }

    const scale = 1.0 / batch.length;
    gw1.scale(scale); gb1.scale(scale);
    gw2.scale(scale); gb2.scale(scale);
    gw3.scale(scale); gb3.scale(scale);

    // Apply Adam Optimizer step
    this.optimizer.update('w1', this.w1, gw1);
    this.optimizer.update('b1', this.b1, gb1);
    this.optimizer.update('w2', this.w2, gw2);
    this.optimizer.update('b2', this.b2, gb2);
    this.optimizer.update('w3', this.w3, gw3);
    this.optimizer.update('b3', this.b3, gb3);

    const avgLoss = batchLoss / batch.length;
    this.lastLoss = this.lastLoss * 0.85 + avgLoss * 0.15;
    this.lossHistory.push(this.lastLoss);
    if (this.lossHistory.length > 50) this.lossHistory.shift();

    // Periodic Target Network synchronization
    if (this.trainStepCounter % this.targetUpdateFreq === 0) {
      this.syncTargetNetwork();
    }

    return this.lastLoss;
  }

  reset() {
    this.initWeights();
    this.replay.clear();
    this.epsilon = 0.30;
    this.totalRewards = 0;
    this.episodeReward = 0;
    this.lastLoss = 0.0;
    this.lossHistory = [];
  }
}
