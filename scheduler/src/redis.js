const Redis = require('ioredis');
const pub = new Redis(process.env.REDIS_URL, {
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (t) => Math.min(t * 200, 5000),
});
module.exports = pub;
