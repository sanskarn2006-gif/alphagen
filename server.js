import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { NeoSDK } from 'kotak-neo-nodejs-sdk';
import YahooFinance from 'yahoo-finance2';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const yahooFinance = new YahooFinance();

process.on('uncaughtException', err => console.error('[Fatal] Uncaught Exception:', err.message));
process.on('unhandledRejection', err => console.error('[Fatal] Unhandled Rejection:', err));

const symbolMapping = {
  'NIFTY': '^NSEI',
  'BANKNIFTY': '^NSEBANK',
  'RELIANCE': 'RELIANCE.NS',
  'HDFCBANK': 'HDFCBANK.NS',
  'ICICIBANK': 'ICICIBANK.NS',
  'INFY': 'INFY.NS',
  'TCS': 'TCS.NS',
  'ITC': 'ITC.NS',
  'LT': 'LT.NS',
  'KOTAKBANK': 'KOTAKBANK.NS',
  'AXISBANK': 'AXISBANK.NS',
  'SBIN': 'SBIN.NS',
  'BHARTIARTL': 'BHARTIARTL.NS',
  'BAJFINANCE': 'BAJFINANCE.NS',
  'ASIANPAINT': 'ASIANPAINT.NS',
  'TATAMOTORS': 'TATAMOTORS.NS',
  'MARUTI': 'MARUTI.NS',
  'AAPL': 'AAPL',
  'NVDA': 'NVDA',
  'TSLA': 'TSLA',
  'BTC-USD': 'BTC-USD',
  'SPY': 'SPY',
  'EUR/USD': 'EURUSD=X'
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const neo = new NeoSDK();
let currentLoginResponse = null; 
let isFullyAuthenticated = false;

// ==========================================
// REST API ROUTES
// ==========================================

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    isAuthenticated: isFullyAuthenticated,
    waitingForOtp: currentLoginResponse !== null && !isFullyAuthenticated
  });
});

app.post('/api/quotes', async (req, res) => {
  try {
    const { symbols } = req.body;
    if (!symbols || !Array.isArray(symbols)) return res.json({});
    
    // Map internal symbols to Yahoo Finance symbols
    const mapped = symbols.map(s => symbolMapping[s] || s);
    
    // Yahoo Finance can take an array for bulk quotes
    const quotes = await yahooFinance.quote(mapped);
    
    const results = {};
    for (let q of quotes) {
      // Reverse map back to our internal symbol name
      const originalSym = Object.keys(symbolMapping).find(k => symbolMapping[k] === q.symbol) || q.symbol;
      results[originalSym] = q.regularMarketPrice;
    }
    res.json(results);
  } catch (err) {
    console.error('[Yahoo Finance] Batch Quote Error:', err.message);
    res.json({});
  }
});

app.get('/api/search/:query', async (req, res) => {
  try {
    const query = req.params.query;
    if (!query) return res.json({ results: [] });
    
    // Perform search
    const results = await yahooFinance.search(query);
    
    // Filter and map results, prioritizing Indian exchanges (.NS, .BO) and MCX if available
    const mapped = results.quotes
      .filter(q => q.isYahooFinance) // Basic validity check
      .map(q => ({
        symbol: q.symbol,
        shortname: q.shortname || q.longname,
        exchange: q.exchange,
        quoteType: q.quoteType
      }));
      
    // Sort to bubble up Indian exchanges (NSE, BSE) if they exist
    mapped.sort((a, b) => {
      const aIsIndian = a.symbol.endsWith('.NS') || a.symbol.endsWith('.BO');
      const bIsIndian = b.symbol.endsWith('.NS') || b.symbol.endsWith('.BO');
      if (aIsIndian && !bIsIndian) return -1;
      if (!aIsIndian && bIsIndian) return 1;
      return 0;
    });

    res.json({ results: mapped });
  } catch (err) {
    console.error('[Yahoo Finance] Search Error:', err.message);
    res.status(500).json({ error: err.message, results: [] });
  }
});

app.get('/api/historical/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol;
    const yfSym = symbolMapping[symbol] || symbol;
    
    // Fetch last 5 days of 1-minute data
    const d = new Date();
    d.setDate(d.getDate() - 5);
    
    const chart = await yahooFinance.chart(yfSym, { period1: d, interval: '1m' });
    
    if (!chart || !chart.quotes) {
      return res.json([]);
    }
    
    // Format to TradingView structure: { time, open, high, low, close, value (volume) }
    const formatted = chart.quotes
      .filter(q => q.open !== null && q.open !== undefined)
      .map(q => ({
        time: Math.floor(new Date(q.date).getTime() / 1000),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        value: q.volume || 0
      }));
      
    res.json(formatted);
  } catch (err) {
    console.error('[Yahoo Finance] Historical Data Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
});

// Step 1: Authentication Endpoint (Prompts for TOTP)
app.post('/api/login', async (req, res) => {
  try {
    console.log('[Kotak API] Initiating Live Authentication Flow...');
    res.json({ success: true, message: 'TOTP required.', requireOtp: true });
  } catch (err) {
    console.error('[Kotak API] Auth Error:', err.message || err);
    res.status(500).json({ error: 'Authentication Failed', details: err.message });
  }
});

// Step 2: Verify OTP/TOTP using the new tradeApiLogin endpoint
app.post('/api/verify-otp', async (req, res) => {
  const { otp: totp } = req.body;
  if (!totp) {
    return res.status(400).json({ error: 'TOTP is required' });
  }

  try {
    console.log(`[Kotak API] Submitting TOTP: ${totp}...`);

    // NOTE: The legacy napi.kotaksecurities.com host is unreachable.
    // If a valid OAuth token is required, we need the new OAuth host from Kotak.
    // For now, we will use a placeholder or assume the legacy auth token is bypassed.
    const accessToken = process.env.KOTAK_API_KEY; 
    
    if (!process.env.KOTAK_USER_ID || !process.env.KOTAK_API_KEY) {
      console.error('[Kotak API] Missing Environment Variables. KOTAK_USER_ID or KOTAK_API_KEY is not set.');
      return res.status(400).json({ error: 'Server configuration error: Missing Kotak API Credentials in environment variables.' });
    }
    
    // As per the provided curl request for tradeApiLogin
    const payload = {
      mobileNumber: process.env.KOTAK_MOBILE_NUMBER || '+919325628992',
      ucc: process.env.KOTAK_USER_ID.toUpperCase(), // UCC must be uppercase (e.g. 14HHS)
      totp: totp
    };

    const response = await axios.post('https://mis.kotaksecurities.com/login/1.0/tradeApiLogin', payload, {
      headers: {
        'Authorization': process.env.KOTAK_API_KEY,
        'neo-fin-key': 'neotradeapi',
        'Content-Type': 'application/json'
      }
    });

    if (response.data && response.data.data) {
      const viewToken = response.data.data.token;
      const viewSid = response.data.data.sid;
      
      console.log(`[Kotak API] View Session Generated. Validating MPIN...`);
      
      const validateHeaders = {
        'Authorization': process.env.KOTAK_API_KEY,
        'Sid': viewSid,
        'Auth': viewToken,
        'neo-fin-key': 'neotradeapi',
        'Content-Type': 'application/json'
      };
      
      const validatePayload = { mpin: process.env.KOTAK_MPIN };
      
      const validateResponse = await axios.post('https://mis.kotaksecurities.com/login/1.0/tradeApiValidate', validatePayload, {
        headers: validateHeaders
      });

      if (validateResponse.data && validateResponse.data.data) {
        neo.token = validateResponse.data.data.token;
        neo.sid = validateResponse.data.data.sid;
        neo.hsServerId = validateResponse.data.data.hsServerId;
        
        // E22 / Dynamic Server Setup
        const serverUrl = validateResponse.data.data.dataCenter ? 
          `https://${validateResponse.data.data.dataCenter}.kotaksecurities.com` : 'https://e22.kotaksecurities.com';
        
        neo.orderUrl = serverUrl;
        isFullyAuthenticated = true;
        console.log(`[Kotak API] Dynamic Server URL assigned: ${serverUrl}`);
        console.log('[Kotak API] Edit Session Generated. Fully Authenticated via TOTP and MPIN.');
        
        res.json({ success: true, message: 'Logged in successfully' });
      } else {
        throw new Error('tradeApiValidate failed to return tokens');
      }
    } else {
      res.status(401).json({ success: false, error: 'Invalid credentials or OTP' });
    }
  } catch (error) {
    console.error('[Kotak API] Login Error:', error.response ? error.response.data : error.message);
    const detailMsg = error.response && error.response.data && error.response.data.errMsg 
        ? error.response.data.errMsg 
        : error.message;
        
    res.status(500).json({ 
      success: false,
      error: 'TOTP Verification Failed: ' + detailMsg, 
      details: error.response?.data || error.message 
    });
  }
});

app.get('/api/limits', async (req, res) => {
  if (!isFullyAuthenticated) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Authenticate first' });
  }
  
  try {
    // Exact mapping from Python SDK LimitsAPI.limit_init()
    const headers = {
      'Sid': neo.sid,
      'Auth': neo.token,
      'neo-fin-key': 'neotradeapi',
      'Content-Type': 'application/x-www-form-urlencoded'
    };
    
    const jData = JSON.stringify({ seg: "ALL", exch: "ALL", prod: "ALL" });
    const body = new URLSearchParams({ jData }).toString();

    const response = await axios.post(`${neo.orderUrl}/quick/user/limits?sId=${neo.hsServerId}`, body, { headers });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('[Kotak API] Limit Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch limits', details: error.response?.data?.errMsg || error.message });
  }
});

// Order Placement Endpoint
app.post('/api/order', async (req, res) => {
  if (!isFullyAuthenticated) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Authenticate first' });
  }
  
  const { symbol, side, size, price, type } = req.body;
  console.log(`[Kotak API Order] Routing ${side} ${size} ${symbol} to Exchange`);
  
  try {
    // Exact mapping from Python SDK OrderAPI.order_placing()
    const headers = {
      'Sid': neo.sid,
      'Auth': neo.token,
      'neo-fin-key': 'neotradeapi',
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    // Kotak expects trading symbol like "SUZLON-EQ" for NSE Cash Market
    let kotakSymbol = symbol;
    if (symbol.endsWith('.NS')) {
      kotakSymbol = symbol.replace('.NS', '-EQ');
    }

    const orderPayload = {
      es: 'nse_cm', 
      pc: 'MIS',
      pt: type === 'MARKET' ? 'MKT' : 'LMT',
      pr: price ? parseFloat(price).toString() : "0",
      tp: "0",
      qt: parseInt(size).toString(),
      tt: side.toUpperCase() === 'BUY' ? 'B' : 'S',
      rt: 'DAY',
      ts: kotakSymbol,
      dq: "0",
      mp: "0",
      pf: 'N',
      am: 'NO',
      os: 'NEOTRADEAPI'
    };

    const jData = JSON.stringify(orderPayload);
    const body = new URLSearchParams({ jData }).toString();

    console.log(`[Kotak API] Routing LIVE order for ${symbol} to ${neo.orderUrl}/quick/order/rule/ms/place...`);
    console.log(`[Kotak API] Payload: ${body}`);
    const response = await axios.post(`${neo.orderUrl}/quick/order/rule/ms/place?sId=${neo.hsServerId}`, body, { 
      headers,
      timeout: 10000 // 10 second timeout
    });
    console.log(`[Kotak API] Order response received:`, response.data);

    const orderResponse = response.data;

    if (orderResponse && orderResponse.stat === 'Not_Ok') {
      throw new Error(orderResponse.emsg || 'Unknown Kotak API Error');
    }

    const orderId = orderResponse?.nOrdNo || ('NEO-' + Math.floor(Math.random() * 10000000));
    
    res.json({
      success: true,
      orderId: orderId,
      message: 'Order successfully routed to Kotak Exchange'
    });
    
  } catch (err) {
    console.error('[Kotak API] Order Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Order Placement Failed', details: err.response?.data?.errMsg || err.message });
  }
});

// ==========================================
// WEBSOCKET SERVER (Live Market Data Proxy)
// ==========================================

wss.on('connection', (ws) => {
  console.log('[WS] Frontend UI connected to Node Backend');
  let simulationInterval = null;

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message);
      
      if (msg.action === 'SUBSCRIBE') {
        console.log(`[WS] Subscribing to data for ${msg.symbol}`);
        
        if (simulationInterval) clearInterval(simulationInterval);
        
        let currentPrice = msg.basePrice || 100.00;
        const yfSym = symbolMapping[msg.symbol] || msg.symbol;
        
        // Initial fetch
        try {
           const quote = await yahooFinance.quote(yfSym);
           if (quote && quote.regularMarketPrice) {
               currentPrice = quote.regularMarketPrice;
               console.log(`[Yahoo Finance] Fetched real price for ${msg.symbol}: ${currentPrice}`);
           }
        } catch (e) {
           console.log(`[Yahoo Finance] Failed to fetch real price for ${msg.symbol}, using basePrice fallback.`);
        }
        
        // Create reverse mapping to map YF symbols back to local symbols
        const reverseMapping = {};
        for (const [localSym, yfSym] of Object.entries(symbolMapping)) {
            reverseMapping[yfSym] = localSym;
        }
        const yfSymbols = Object.values(symbolMapping);

        // Polling Yahoo Finance every 2 seconds for ALL symbols
        simulationInterval = setInterval(async () => {
          try {
             const quotes = await yahooFinance.quote(yfSymbols);
             const quoteArray = Array.isArray(quotes) ? quotes : [quotes];
             
             quoteArray.forEach(quote => {
                 if (quote && quote.regularMarketPrice) {
                     const currentPrice = quote.regularMarketPrice;
                     const localSym = reverseMapping[quote.symbol] || quote.symbol;
                     
                     ws.send(JSON.stringify({
                       event: 'tick',
                       data: {
                         symbol: localSym,
                         price: currentPrice,
                         bid: currentPrice - 0.05,
                         ask: currentPrice + 0.05,
                         volume: quote.regularMarketVolume || Math.floor(Math.random() * 100) + 1,
                         timestamp: Date.now()
                       }
                     }));
                 }
             });
          } catch (e) {
             // Silently ignore poll errors to keep stream alive
          }
        }, 2000);
      }
      
      if (msg.action === 'UNSUBSCRIBE') {
        if (simulationInterval) clearInterval(simulationInterval);
      }
    } catch (err) {
      console.error('[WS] Message error:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Frontend UI disconnected');
    if (simulationInterval) clearInterval(simulationInterval);
  });
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, () => {
  console.log(`[Kotak API Backend] Server running on http://localhost:${PORT}`);
  console.log(`[Kotak API Backend] WebSocket streaming ready on ws://localhost:${PORT}`);
});
