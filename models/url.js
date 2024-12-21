const mongoose = require('mongoose');

const urlSchema = new mongoose.Schema({
    shortId: { 
        type: String, 
        unique: true, 
        required: true },
    redirectUrl: { 
        type: String,
        required: true },
    topic: { 
        type: String, 
        default: null },
    visitHistory: { 
        type: Array, 
        default: [] 
    },
    createdAt: { 
        type: Date, 
        default: Date.now },
});

module.exports = mongoose.model('Url', urlSchema);
