import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
yahooFinance.quote('AXISBANK.NS').then(res => {
  console.log('Result:', res.regularMarketPrice);
}).catch(console.error);
