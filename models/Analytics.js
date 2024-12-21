const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
    shortId: { 
        type: String, 
        required: true },   
    timestamp: { 
        type: Date, 
        default: Date.now }, 

    userAgent: String, 

    ipAddress: String,
     
    location: {
        country: String,
        region: String,
        city: String,
    },
});

const Analytics = mongoose.model('Analytics', analyticsSchema);

module.exports = Analytics;
