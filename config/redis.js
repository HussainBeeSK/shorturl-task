const redis = require('redis');

const client = redis.createClient({
  url: `redis://:${process.env.REDIS_HOST || '35.200.170.55'}:${process.env.REDIS_PORT || 6379}`,
});


client.on('connect', () => {
  console.log('Connected to Redis successfully');
});

client.on('error', (err) => {
  console.error('Redis error:', err);
});

client.connect();



module.exports = client;
