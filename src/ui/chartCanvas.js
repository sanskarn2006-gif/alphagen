import { createChart, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';

export class ChartCanvas {
  constructor(containerElement, marketEngine, portfolio) {
    this.container = containerElement;
    this.market = marketEngine;
    this.portfolio = portfolio;
    this.markers = [];

    // Initialize TradingView Lightweight Chart
    this.chart = createChart(this.container, {
      width: this.container.clientWidth,
      height: this.container.clientHeight,
      layout: {
        background: { type: 'solid', color: '#07070a' },
        textColor: '#888899',
      },
      grid: {
        vertLines: { color: '#181824' },
        horzLines: { color: '#181824' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // Normal mode
      }
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#00ff66',
      downColor: '#ff3344',
      borderVisible: false,
      wickUpColor: '#00ff66',
      wickDownColor: '#ff3344',
    });

    this.vwapSeries = this.chart.addSeries(LineSeries, {
      color: '#00e5ff',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    this.volumeSeries = this.chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Resize observer to keep chart responsive
    const ro = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== this.container) return;
      const newRect = entries[0].contentRect;
      this.chart.applyOptions({ width: newRect.width, height: newRect.height });
    });
    ro.observe(this.container);

    // Subscribe to portfolio events to place markers
    this.portfolio.subscribe((event, data) => {
      if (event === 'order_filled' && data.symbol === this.market.symbol) {
        const time = Math.floor(data.time / 1000);
        this.markers.push({
          time: time,
          position: data.side === 'BUY' ? 'belowBar' : 'aboveBar',
          color: data.side === 'BUY' ? '#00ff66' : '#ff3344',
          shape: data.side === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: data.source.includes('BLACKBOX') ? `Q-${data.side[0]}` : data.side[0],
        });
        
        // Lightweight-charts requires markers to be sorted by time
        this.markers.sort((a, b) => a.time - b.time);
        // FIXME: createSeriesMarkers plugin is required for v5
        // this.candleSeries.setMarkers(this.markers);
      }
    });
  }

  resize() {
    this.chart.applyOptions({
      width: this.container.clientWidth,
      height: this.container.clientHeight,
    });
  }

  // Called by animation loop / tick update
  render() {
    try {
      const candles = this.market.candles;
      if (!candles || candles.length === 0) return;

      if (this.market.historyUpdated) {
      // Bulk update for historical data fetch
      const tvData = [];
      const vwapData = [];
      const volData = [];

      // Sort and remove duplicates by time if any
      const uniqueCandles = [];
      const seenTimes = new Set();
      for (const c of candles) {
        const t = Math.floor(c.time / 1000);
        if (!seenTimes.has(t)) {
          seenTimes.add(t);
          uniqueCandles.push({ ...c, tvTime: t });
        }
      }
      uniqueCandles.sort((a, b) => a.tvTime - b.tvTime);

      for (const c of uniqueCandles) {
        tvData.push({
          time: c.tvTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close
        });
        vwapData.push({
          time: c.tvTime,
          value: c.vwap || c.close
        });
        volData.push({
          time: c.tvTime,
          value: c.volume || 0,
          color: c.close >= c.open ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 68, 0.3)'
        });
      }

      this.candleSeries.setData(tvData);
      this.vwapSeries.setData(vwapData);
      this.volumeSeries.setData(volData);
      
      this.market.historyUpdated = false;
      this.markers = [];
      // FIXME: createSeriesMarkers plugin is required for v5
      // this.candleSeries.setMarkers([]);
      
      // Force chart to auto-fit to the newly loaded historical data
      this.chart.timeScale().fitContent();
    } else {
      // Stream update for live tick
      const c = candles[candles.length - 1];
      const time = Math.floor(c.time / 1000);
      
      this.candleSeries.update({
        time: time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close
      });
      
      if (c.vwap) {
        this.vwapSeries.update({
          time: time,
          value: c.vwap
        });
      }
      
      this.volumeSeries.update({
        time: time,
        value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 51, 68, 0.3)'
      });
    }
  } catch (err) {
    console.error('ChartCanvas render error:', err);
    // Recover state so it doesn't get stuck in a crash loop
    this.market.historyUpdated = false;
  }
  }
}
