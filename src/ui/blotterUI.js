// Order Execution Blotter, Position Monitor & Risk KPIs UI

export class BlotterUI {
  constructor(containerElement, portfolio, marketEngine, onPanicFlatten) {
    this.container = containerElement;
    this.portfolio = portfolio;
    this.market = marketEngine;
    this.onPanicFlatten = onPanicFlatten;

    this.renderSkeleton();
    this.bindEvents();
    this.portfolio.subscribe(() => this.update());
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="bbg-pane-header">
        <span class="bbg-amber">EXECUTION BLOTTER // OMS PORTFOLIO MONITOR</span>
        <button id="btn-panic-flatten" class="bbg-btn bbg-btn-danger bbg-btn-sm">PANIC FLATTEN &lt;GO&gt;</button>
      </div>

      <!-- Account Risk KPIs Banner -->
      <div class="bbg-kpi-bar">
        <div class="bbg-kpi-item">
          <span class="bbg-kpi-lbl">NET EQUITY</span>
          <span id="kpi-equity" class="bbg-kpi-val bbg-cyan">₹100,000.00</span>
        </div>
        <div class="bbg-kpi-item">
          <span class="bbg-kpi-lbl">TOTAL P&L</span>
          <span id="kpi-pnl" class="bbg-kpi-val bbg-amber">₹0.00 (0.0%)</span>
        </div>
        <div class="bbg-kpi-item">
          <span class="bbg-kpi-lbl">WIN RATE</span>
          <span id="kpi-winrate" class="bbg-kpi-val bbg-yellow">0.0%</span>
        </div>
        <div class="bbg-kpi-item">
          <span class="bbg-kpi-lbl">PROFIT FACTOR</span>
          <span id="kpi-pf" class="bbg-kpi-val bbg-cyan">1.00</span>
        </div>
        <div class="bbg-kpi-item">
          <span class="bbg-kpi-lbl">MAX DRAWDOWN</span>
          <span id="kpi-dd" class="bbg-kpi-val bbg-red">0.00%</span>
        </div>
        <div class="bbg-kpi-item">
          <span class="bbg-kpi-lbl">SHARPE RATIO</span>
          <span id="kpi-sharpe" class="bbg-kpi-val bbg-green">0.00</span>
        </div>
      </div>

      <!-- Open Position Substrip -->
      <div class="bbg-pos-strip">
        <span class="bbg-dim">ACTIVE POS:</span>
        <span id="pos-symbol-badge" class="bbg-cyan bbg-bold">NVDA</span>
        <span class="bbg-dim">SIZE:</span>
        <span id="pos-size" class="bbg-amber">0</span>
        <span class="bbg-dim">AVG PX:</span>
        <span id="pos-avg-px" class="bbg-dim">₹0.00</span>
        <span class="bbg-dim">UNREALIZED:</span>
        <span id="pos-upnl" class="bbg-amber">₹0.00</span>
      </div>

      <!-- Blotter Table -->
      <div class="bbg-blotter-wrap">
        <table class="bbg-blotter-table">
          <thead>
            <tr>
              <th>ORDER ID</th>
              <th>TIME</th>
              <th>SYM</th>
              <th>SIDE</th>
              <th>QTY</th>
              <th>EXEC PX</th>
              <th>SLIP</th>
              <th>P&L</th>
              <th>SOURCE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody id="blotter-tbody">
            <tr>
              <td colspan="10" class="bbg-dim text-center">NO TRADES RECORDED THIS SESSION</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    this.kpiEquity = this.container.querySelector('#kpi-equity');
    this.kpiPnl = this.container.querySelector('#kpi-pnl');
    this.kpiWinRate = this.container.querySelector('#kpi-winrate');
    this.kpiPf = this.container.querySelector('#kpi-pf');
    this.kpiDd = this.container.querySelector('#kpi-dd');
    this.kpiSharpe = this.container.querySelector('#kpi-sharpe');

    this.posSymbolBadge = this.container.querySelector('#pos-symbol-badge');
    this.posSize = this.container.querySelector('#pos-size');
    this.posAvgPx = this.container.querySelector('#pos-avg-px');
    this.posUpnl = this.container.querySelector('#pos-upnl');
    this.blotterTbody = this.container.querySelector('#blotter-tbody');
    this.btnPanic = this.container.querySelector('#btn-panic-flatten');
  }

  bindEvents() {
    this.btnPanic.addEventListener('click', () => {
      this.onPanicFlatten();
    });
  }

  update() {
    const prices = { [this.market.symbol]: this.market.price };
    const eq = this.portfolio.getEquity(prices);
    const risk = this.portfolio.getRiskMetrics();

    // KPIs
    this.kpiEquity.textContent = `₹${eq.totalEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    const pnlSign = eq.totalPnL >= 0 ? '+' : '';
    this.kpiPnl.textContent = `${pnlSign}₹${eq.totalPnL.toFixed(2)} (${pnlSign}${eq.totalPnLPct.toFixed(2)}%)`;
    this.kpiPnl.className = eq.totalPnL >= 0 ? 'bbg-kpi-val bbg-green' : 'bbg-kpi-val bbg-red';

    this.kpiWinRate.textContent = `${risk.winRate}%`;
    this.kpiPf.textContent = risk.profitFactor;
    this.kpiDd.textContent = `${risk.maxDrawdown}%`;
    this.kpiSharpe.textContent = risk.sharpeRatio;

    // Active Position
    const pos = this.portfolio.getPosition(this.market.symbol);
    this.posSymbolBadge.textContent = this.market.symbol;
    this.posSize.textContent = pos.size;
    this.posSize.className = pos.size > 0 ? 'bbg-green bbg-bold' : (pos.size < 0 ? 'bbg-red bbg-bold' : 'bbg-dim');
    this.posAvgPx.textContent = `₹${pos.avgPrice.toFixed(2)}`;

    const upnl = pos.size * (this.market.price - pos.avgPrice);
    const upnlSign = upnl >= 0 ? '+' : '';
    this.posUpnl.textContent = `${upnlSign}₹${upnl.toFixed(2)}`;
    this.posUpnl.className = upnl >= 0 ? 'bbg-green' : 'bbg-red';

    // Blotter Table
    const blotter = this.portfolio.blotter;
    if (blotter.length === 0) {
      this.blotterTbody.innerHTML = '<tr><td colspan="10" class="bbg-dim text-center">NO TRADES RECORDED THIS SESSION</td></tr>';
      return;
    }

    let rows = '';
    const recentTrades = blotter.slice(0, 30);
    for (const t of recentTrades) {
      const isBuy = t.side === 'BUY';
      const timeStr = new Date(t.time).toTimeString().slice(0, 8);
      const pnlDisplay = t.tradePnL !== 0 ? `${t.tradePnL >= 0 ? '+' : ''}₹${t.tradePnL.toFixed(2)}` : '--';
      const pnlClass = t.tradePnL > 0 ? 'bbg-green' : (t.tradePnL < 0 ? 'bbg-red' : 'bbg-dim');
      const isBbx = t.source.includes('BLACKBOX') || t.source.includes('RL');

      rows += `
        <tr>
          <td class="bbg-dim">${t.orderId}</td>
          <td>${timeStr}</td>
          <td class="bbg-cyan">${t.symbol}</td>
          <td class="${isBuy ? 'bbg-green bbg-bold' : 'bbg-red bbg-bold'}">${t.side}</td>
          <td>${t.size}</td>
          <td>₹${t.execPrice.toFixed(2)}</td>
          <td class="bbg-dim">₹${t.slippage.toFixed(2)}</td>
          <td class="${pnlClass}">${pnlDisplay}</td>
          <td><span class="bbg-tag ${isBbx ? 'bbg-tag-bbx' : 'bbg-tag-man'}">${t.source}</span></td>
          <td class="bbg-green">${t.status}</td>
        </tr>
      `;
    }
    this.blotterTbody.innerHTML = rows;
  }
}
