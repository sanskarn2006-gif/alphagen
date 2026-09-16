// High-Frequency Level 2 Depth Ladder & Order Flow Imbalance UI

export class OrderBookUI {
  constructor(containerElement, marketEngine) {
    this.container = containerElement;
    this.market = marketEngine;

    this.renderSkeleton();
    this.market.subscribe((event, data) => {
      if (event === 'tick') {
        this.update(data);
      }
    });
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="bbg-pane-header">
        <span class="bbg-amber">L2 DEPTH LADDER</span>
        <span id="l2-spread-info" class="bbg-cyan">SPREAD: 0.02 (2 TKS)</span>
      </div>
      <div class="l2-ofi-container">
        <div class="l2-ofi-label">
          <span>OFI IMBALANCE:</span>
          <span id="l2-ofi-pct" class="bbg-amber">0.0%</span>
        </div>
        <div class="l2-ofi-track">
          <div id="l2-ofi-fill" class="l2-ofi-bar" style="width: 50%;"></div>
        </div>
      </div>
      <div class="l2-table-header">
        <span>TOTAL</span>
        <span>SIZE</span>
        <span>BID</span>
        <span>ASK</span>
        <span>SIZE</span>
        <span>TOTAL</span>
      </div>
      <div id="l2-ladder-rows" class="l2-ladder-body"></div>
    `;

    this.rowsContainer = this.container.querySelector('#l2-ladder-rows');
    this.spreadInfo = this.container.querySelector('#l2-spread-info');
    this.ofiPct = this.container.querySelector('#l2-ofi-pct');
    this.ofiFill = this.container.querySelector('#l2-ofi-fill');
  }

  update(tickData) {
    const bids = this.market.bids;
    const asks = this.market.asks;
    if (!bids.length || !asks.length) return;

    // Update Spread
    const spreadVal = this.market.spread;
    const spreadTicks = Math.round(spreadVal / this.market.inst.tickSize);
    this.spreadInfo.textContent = `SPREAD: ${spreadVal.toFixed(2)} (${spreadTicks} TKS)`;

    // Update OFI Gauge
    const ofi = this.market.orderFlowImbalance;
    const ofiDisplay = (ofi * 100).toFixed(1);
    this.ofiPct.textContent = `${ofi >= 0 ? '+' : ''}${ofiDisplay}%`;
    this.ofiPct.className = ofi > 0.15 ? 'bbg-green' : (ofi < -0.15 ? 'bbg-red' : 'bbg-amber');

    // Bar runs from 0% (full sell pressure) to 100% (full buy pressure), 50% is neutral
    const ofiWidth = Math.max(5, Math.min(95, 50 + ofi * 50));
    this.ofiFill.style.width = `${ofiWidth}%`;
    this.ofiFill.style.backgroundColor = ofi > 0 ? '#00ff66' : '#ff3344';

    // Calculate max depth volume for scaling heatbars
    const maxCumDepth = Math.max(
      bids[bids.length - 1]?.total || 1,
      asks[asks.length - 1]?.total || 1
    );

    let html = '';
    const depthLevels = Math.min(8, bids.length);

    for (let i = 0; i < depthLevels; i++) {
      const bid = bids[i];
      const ask = asks[i];

      const bidPct = Math.min(100, Math.round((bid.total / maxCumDepth) * 100));
      const askPct = Math.min(100, Math.round((ask.total / maxCumDepth) * 100));

      html += `
        <div class="l2-row">
          <div class="l2-side l2-bid-side">
            <div class="l2-heat-fill l2-bid-heat" style="width: ${bidPct}%;"></div>
            <span class="l2-cum bbg-dim">${bid.total}</span>
            <span class="l2-sz">${bid.size}</span>
            <span class="l2-px bbg-green">${bid.price.toFixed(2)}</span>
          </div>
          <div class="l2-side l2-ask-side">
            <div class="l2-heat-fill l2-ask-heat" style="width: ${askPct}%;"></div>
            <span class="l2-px bbg-red">${ask.price.toFixed(2)}</span>
            <span class="l2-sz">${ask.size}</span>
            <span class="l2-cum bbg-dim">${ask.total}</span>
          </div>
        </div>
      `;
    }

    this.rowsContainer.innerHTML = html;
  }
}
