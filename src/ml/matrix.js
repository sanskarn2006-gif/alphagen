// High-Performance Lightweight Matrix & Neural Calculus Engine for Real-Time RL

export class Matrix {
  constructor(rows, cols, data = null) {
    this.rows = rows;
    this.cols = cols;
    if (data) {
      this.data = data;
    } else {
      this.data = new Float64Array(rows * cols);
    }
  }

  static fromArray(arr) {
    const m = new Matrix(arr.length, 1);
    for (let i = 0; i < arr.length; i++) {
      m.data[i] = arr[i];
    }
    return m;
  }

  toArray() {
    return Array.from(this.data);
  }

  static random(rows, cols, scale = 1.0) {
    const m = new Matrix(rows, cols);
    // He / Xavier initialization
    const std = Math.sqrt(2.0 / (rows + cols)) * scale;
    for (let i = 0; i < m.data.length; i++) {
      // Box-Muller Gaussian
      const u1 = Math.max(1e-15, Math.random());
      const u2 = Math.random();
      const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      m.data[i] = z0 * std;
    }
    return m;
  }

  static zeros(rows, cols) {
    return new Matrix(rows, cols);
  }

  get(r, c) {
    return this.data[r * this.cols + c];
  }

  set(r, c, val) {
    this.data[r * this.cols + c] = val;
  }

  clone() {
    const m = new Matrix(this.rows, this.cols);
    m.data.set(this.data);
    return m;
  }

  // Matrix multiplication: C = A (r1 x c1) * B (c1 x c2)
  static dot(a, b) {
    if (a.cols !== b.rows) {
      throw new Error(`Matrix dimension mismatch: ${a.rows}x${a.cols} vs ${b.rows}x${b.cols}`);
    }
    const result = new Matrix(a.rows, b.cols);
    const r1 = a.rows;
    const c1 = a.cols;
    const c2 = b.cols;
    const ad = a.data;
    const bd = b.data;
    const rd = result.data;

    for (let i = 0; i < r1; i++) {
      const iOffset = i * c1;
      const rOffset = i * c2;
      for (let k = 0; k < c1; k++) {
        const aVal = ad[iOffset + k];
        const kOffset = k * c2;
        for (let j = 0; j < c2; j++) {
          rd[rOffset + j] += aVal * bd[kOffset + j];
        }
      }
    }
    return result;
  }

  add(other) {
    if (other instanceof Matrix) {
      for (let i = 0; i < this.data.length; i++) {
        this.data[i] += other.data[i];
      }
    } else {
      for (let i = 0; i < this.data.length; i++) {
        this.data[i] += other;
      }
    }
    return this;
  }

  static add(a, b) {
    const res = a.clone();
    res.add(b);
    return res;
  }

  subtract(other) {
    if (other instanceof Matrix) {
      for (let i = 0; i < this.data.length; i++) {
        this.data[i] -= other.data[i];
      }
    } else {
      for (let i = 0; i < this.data.length; i++) {
        this.data[i] -= other;
      }
    }
    return this;
  }

  static subtract(a, b) {
    const res = a.clone();
    res.subtract(b);
    return res;
  }

  scale(s) {
    for (let i = 0; i < this.data.length; i++) {
      this.data[i] *= s;
    }
    return this;
  }

  transpose() {
    const res = new Matrix(this.cols, this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        res.data[c * this.rows + r] = this.data[r * this.cols + c];
      }
    }
    return res;
  }

  map(fn) {
    const res = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      res.data[i] = fn(this.data[i], i);
    }
    return res;
  }
}

// Activation Functions & Derivatives
export const Activations = {
  leakyRelu: {
    fn: (x, alpha = 0.05) => (x > 0 ? x : alpha * x),
    df: (x, alpha = 0.05) => (x > 0 ? 1 : alpha)
  },
  tanh: {
    fn: (x) => Math.tanh(x),
    df: (x) => {
      const t = Math.tanh(x);
      return 1 - t * t;
    }
  },
  linear: {
    fn: (x) => x,
    df: () => 1
  },
  softmax: (arr) => {
    const maxVal = Math.max(...arr);
    const exp = arr.map(x => Math.exp(x - maxVal));
    const sum = exp.reduce((a, b) => a + b, 0) || 1e-9;
    return exp.map(x => x / sum);
  }
};

// Adam Optimizer implementation for robust online weight convergence
export class AdamOptimizer {
  constructor(lr = 0.005, beta1 = 0.9, beta2 = 0.999, eps = 1e-8) {
    this.lr = lr;
    this.beta1 = beta1;
    this.beta2 = beta2;
    this.eps = eps;
    this.t = 0;
    this.m = new Map(); // 1st moment vector
    this.v = new Map(); // 2nd moment vector
  }

  setLearningRate(newLr) {
    this.lr = Math.max(0.0001, Math.min(0.1, newLr));
  }

  update(key, weights, grads) {
    this.t++;
    if (!this.m.has(key)) {
      this.m.set(key, new Float64Array(weights.data.length));
      this.v.set(key, new Float64Array(weights.data.length));
    }

    const m = this.m.get(key);
    const v = this.v.get(key);
    const w = weights.data;
    const g = grads.data;
    const n = w.length;

    const b1 = this.beta1;
    const b2 = this.beta2;
    const lr = this.lr;
    const eps = this.eps;
    const t = this.t;

    // Gradient clipping to avoid numerical divergence during flash crashes
    const maxNorm = 5.0;
    let normSq = 0;
    for (let i = 0; i < n; i++) normSq += g[i] * g[i];
    const norm = Math.sqrt(normSq);
    const clipFactor = norm > maxNorm ? maxNorm / norm : 1.0;

    for (let i = 0; i < n; i++) {
      const grad = g[i] * clipFactor;
      m[i] = b1 * m[i] + (1 - b1) * grad;
      v[i] = b2 * v[i] + (1 - b2) * (grad * grad);

      const mHat = m[i] / (1 - Math.pow(b1, t));
      const vHat = v[i] / (1 - Math.pow(b2, t));

      // Weight decay (L2 regularization: 1e-4) to prevent overfitting
      w[i] -= lr * (mHat / (Math.sqrt(vHat) + eps) + 1e-4 * w[i]);
    }
  }
}
