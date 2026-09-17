const axios = require('axios');
axios.get('https://www.google.com/finance/quote/AXISBANK:NSE')
  .then(res => {
    const match = res.data.match(/class="YMlKec fxKbKc"[^>]*>([^<]+)</);
    console.log('Result:', match ? match[1] : 'No match found');
  })
  .catch(console.error);
