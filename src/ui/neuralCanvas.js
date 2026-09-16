// Real-Time Neural Synaptic Weight Matrix & Activity Visualizer

import { FEATURE_NAMES, ACTION_NAMES } from '../ml/blackboxAgent.js';

export class NeuralCanvas {
  constructor(canvasElement, blackboxAgent) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.agent = blackboxAgent;

    this.particles = []; // Forward activity pulses
    this.hoverNode = null;
    this.layerCoords = [];

    this.resize();
    this.initEvents();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}` + 'px';
    this.canvas.style.height = `${rect.height}` + 'px';
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
    this.calculateNodePositions();
  }

  initEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.checkHover(x, y);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoverNode = null;
    });
  }

  calculateNodePositions() {
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;

    // 4 Columns: Input (8), Hidden 1 (16), Hidden 2 (12), Output (3)
    const layers = [
      { count: this.agent.inputDim, name: 'INPUT FEATURES', labels: FEATURE_NAMES },
      { count: this.agent.hidden1Dim, name: 'DENSE H1 (16)', labels: null },
      { count: this.agent.hidden2Dim, name: 'DENSE H2 (12)', labels: null },
      { count: this.agent.outputDim, name: 'ACTION LOGITS', labels: ACTION_NAMES }
    ];

    const padX = 75;
    const padY = 32;
    const availW = w - padX * 2;
    const colStep = availW / (layers.length - 1);

    this.layerCoords = layers.map((layer, lIdx) => {
      const x = padX + lIdx * colStep;
      const availH = h - padY * 2 - 20;
      const rowStep = availH / Math.max(1, layer.count - 1);

      const nodes = [];
      for (let i = 0; i < layer.count; i++) {
        const y = padY + 15 + (layer.count === 1 ? availH / 2 : i * rowStep);
        nodes.push({ x, y, idx: i, layer: lIdx });
      }
      return { ...layer, x, nodes };
    });
  }

  checkHover(mx, my) {
    this.hoverNode = null;
    for (const layer of this.layerCoords) {
      for (const node of layer.nodes) {
        const dist = Math.hypot(node.x - mx, node.y - my);
        if (dist < 10) {
          this.hoverNode = node;
          return;
        }
      }
    }
  }

  spawnPulses() {
    if (!this.layerCoords.length || Math.random() > 0.4) return;
    // Pick random connection between layers to show neural transmission
    const lIdx = Math.floor(Math.random() * (this.layerCoords.length - 1));
    const srcLayer = this.layerCoords[lIdx];
    const dstLayer = this.layerCoords[lIdx + 1];

    const srcNode = srcLayer.nodes[Math.floor(Math.random() * srcLayer.nodes.length)];
    const dstNode = dstLayer.nodes[Math.floor(Math.random() * dstLayer.nodes.length)];

    this.particles.push({
      x1: srcNode.x,
      y1: srcNode.y,
      x2: dstNode.x,
      y2: dstNode.y,
      progress: 0,
      speed: 0.04 + Math.random() * 0.05,
      color: Math.random() > 0.5 ? '#00e5ff' : '#ff9900'
    });
  }

  render() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;
    if (!w || !h || !this.layerCoords.length) return;

    // Clear background
    ctx.fillStyle = '#0a0a0e';
    ctx.fillRect(0, 0, w, h);

    this.spawnPulses();

    const cache = this.agent.cache;
    const weights = [this.agent.w1, this.agent.w2, this.agent.w3];

    // 1. Draw Synaptic Connections
    for (let l = 0; l < this.layerCoords.length - 1; l++) {
      const curLayer = this.layerCoords[l];
      const nextLayer = this.layerCoords[l + 1];
      const wMatrix = weights[l];

      // Stride sampling if dense to maintain 60 FPS
      for (let j = 0; j < nextLayer.nodes.length; j++) {
        const dst = nextLayer.nodes[j];
        for (let i = 0; i < curLayer.nodes.length; i++) {
          const src = curLayer.nodes[i];
          const weightVal = wMatrix.get(j, i);

          const absW = Math.abs(weightVal);
          if (absW < 0.05) continue; // Skip near-zero connections

          const isPositive = weightVal > 0;
          const alpha = Math.min(0.65, Math.max(0.08, absW * 0.4));
          ctx.strokeStyle = isPositive ? `rgba(0, 229, 255, ${alpha})` : `rgba(255, 153, 0, ${alpha})`;
          ctx.lineWidth = Math.min(2.5, 0.4 + absW * 0.6);

          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(dst.x, dst.y);
          ctx.stroke();
        }
      }
    }

    // 2. Draw Synaptic Pulse Particles
    for (let p = this.particles.length - 1; p >= 0; p--) {
      const part = this.particles[p];
      part.progress += part.speed;

      if (part.progress >= 1.0) {
        this.particles.splice(p, 1);
        continue;
      }

      const curX = part.x1 + (part.x2 - part.x1) * part.progress;
      const curY = part.y1 + (part.y2 - part.y1) * part.progress;

      ctx.fillStyle = part.color;
      ctx.beginPath();
      ctx.arc(curX, curY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Draw Neurons and Layer Headings
    const activations = [
      cache.inputs,
      cache.h1_a,
      cache.h2_a,
      cache.q_out
    ];

    for (let l = 0; l < this.layerCoords.length; l++) {
      const layer = this.layerCoords[l];
      const acts = activations[l];

      // Layer Title
      ctx.fillStyle = '#ff9900';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(layer.name, layer.x, 18);

      for (let n = 0; n < layer.nodes.length; n++) {
        const node = layer.nodes[n];
        const val = acts ? acts[n] : 0;
        const normAct = Math.min(1.0, Math.max(0.0, Math.abs(val) / 2.0));

        // Outer glow
        const glowRadius = 5 + normAct * 5;
        const isOutput = l === 3;
        const isChosen = isOutput && n === this.agent.chosenAction;

        if (isChosen) {
          ctx.strokeStyle = '#00ff66';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.fillStyle = isChosen
          ? '#00ff66'
          : (val >= 0 ? `rgba(0, 229, 255, ${0.4 + normAct * 0.6})` : `rgba(255, 51, 68, ${0.4 + normAct * 0.6})`);
        
        ctx.beginPath();
        ctx.arc(node.x, node.y, isOutput ? 5.5 : 4, 0, Math.PI * 2);
        ctx.fill();

        // Node labels
        if (layer.labels && layer.labels[n]) {
          ctx.fillStyle = isChosen ? '#00ff66' : '#9999aa';
          ctx.font = '8px "JetBrains Mono", monospace';
          if (l === 0) {
            ctx.textAlign = 'right';
            ctx.fillText(layer.labels[n], node.x - 9, node.y + 3);
          } else if (l === 3) {
            ctx.textAlign = 'left';
            const qStr = val !== undefined ? val.toFixed(2) : '0.00';
            ctx.fillText(`${layer.labels[n]} [${qStr}]`, node.x + 10, node.y + 3);
          }
        }
      }
    }

    // 4. Hover Tooltip
    if (this.hoverNode) {
      const { x, y, layer, idx } = this.hoverNode;
      const acts = activations[layer];
      const val = acts ? acts[idx] : 0;

      ctx.fillStyle = '#1c1c28';
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 1;
      ctx.fillRect(x + 12, y - 20, 140, 36);
      ctx.strokeRect(x + 12, y - 20, 140, 36);

      ctx.fillStyle = '#ffffff';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`LAYER ${layer} // NODE ${idx}`, x + 18, y - 6);
      ctx.fillStyle = '#ff9900';
      ctx.fillText(`VAL: ${val ? val.toFixed(4) : '0.0000'}`, x + 18, y + 8);
    }
  }
}
