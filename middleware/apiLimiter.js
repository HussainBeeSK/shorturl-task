const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour 
    max: 100, // will Allow 100 requests per user
    message: "Too many requests, please try again later.",
});

module.exports = apiLimiter;
