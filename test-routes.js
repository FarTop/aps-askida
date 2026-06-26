require('dotenv').config();

// Mock app.listen pour éviter qu'il démarre vraiment
const http = require('http');
const orig = http.Server.prototype.listen;
http.Server.prototype.listen = function() { return this; };

const app = require('./server/index.js');

app._router.stack.forEach((layer, i) => {
  const name = layer.name || '?';
  const regexp = layer.regexp?.toString().substring(0, 60) || '';
  console.log(i, name, regexp);
});

process.exit(0);
