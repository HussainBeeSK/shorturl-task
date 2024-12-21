const Url = require("../models/url")
const Analytics = require("../models/Analytics")
const { nanoid } = require('nanoid');
const redisClient = require('../config/redis'); // Redis client for caching
const axios = require('axios');
const moment = require('moment');


const generateShortUrl = async (req, res) => {
    try {
        const { longUrl, customAlias, topic } = req.body; // Destructuring the required fields

        // Validating the  input
        if (!longUrl) {
            return res.status(400).json({ error: "longUrl is required" });
        }

        // Checking if the longURL already exists in the database
        const existingUrl = await Url.findOne({ redirectUrl: longUrl });
        if (existingUrl) {
            return res.status(200).json({
                message: "Short URL already exists",
                shortUrl: `${req.protocol}://${req.get('host')}/${existingUrl.shortId}`, // If exists retreving from the redis Cache.so,we can reduce the burden on DataBase.
                createdAt: existingUrl.createdAt,
            });
        }

        // Checking if customAlias is already in use
        if (customAlias) {
            const aliasExists = await Url.findOne({ shortId: customAlias });
            if (aliasExists) {
                return res.status(400).json({ error: "Custom alias is already in use" });
            }
        }

        // Generating a unique shortId if customAlias is not provided by user.
        const shortId = customAlias || nanoid(8);   //we are creating the unique id of length 8.

        // Create a new URL entry in the database(new instance of Url modle to the database.)
        const newUrl = new Url({
            shortId,
            redirectUrl: longUrl,
            topic: topic || null, // Assign topic if provided else null goes
            visitHistory: [],
        });

        await newUrl.save();

        // Cache the short URL mapping for quicker access.
        await redisClient.set(shortId, longUrl);

        return res.status(201).json({
            message: "URL shortened successfully",
            shortUrl: `${req.protocol}://${req.get('host')}/${shortId}`,
            createdAt: newUrl.createdAt,
        });
    } catch (err) {
        console.error("Error in generating short URL:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}


const redirecturl = async (req, res) => {
    try {
        const { alias } = req.params;  // Get the alias from the URL.
        const shortUrl = await redisClient.get(alias);  // Checking in the Redis cache first

        console.log("url",shortUrl)

        let urlData;

        if (shortUrl) {
            try {
                // Try parsing as JSON
                urlData = JSON.parse(shortUrl);
            } catch (err) {
                // If parsing fails, will assume it's a plain URL
                urlData = { redirectUrl: shortUrl };
            }  
            // If URL found in Redis cache,will use it directly
        } else {
            // If not found in Redis, will fetch from database
            urlData = await Url.findOne({ shortId: alias });

            if (!urlData) {
                return res.status(404).json({ error: 'Short URL not found' });
            }

            // Caching the URL in Redis for future use.
            redisClient.setEx(alias, 3600, JSON.stringify(urlData)); // Cache for 1 hour(3600)
        }

        // analytics for the redirect
        const timestamp = new Date().toISOString();
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;

        // Get geolocation data based on IP address (using a service like ip-api.com) 
        const geoData = await axios.get(`http://ip-api.com/json/${ipAddress}`);
        const { country, regionName, city } = geoData.data;

        //will Save the analytics data in the database
        const analyticsData = new Analytics({
            shortId: alias,
            timestamp,
            userAgent,
            ipAddress,
            location: {
                country,
                region: regionName,
                city,
            },
        });

        await analyticsData.save();

        // Redirect the user to the original URL
        return res.redirect(urlData.redirectUrl);  // Redirect to the long URL(original url)

    } catch (err) {
        console.error("Error in redirecting:", err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getAnalytics = async (req, res) => {
    try {
        const { alias } = req.params;

        // Validating if the short URL exists already
        const urlData = await Url.findOne({ shortId: alias });
        if (!urlData) {
            return res.status(404).json({ error: "Short URL not found" });
        }

        // Fetching all analytics data for the given shortId
        const analyticsData = await Analytics.find({ shortId: alias });
        if (analyticsData.length === 0) {
            return res.status(200).json({ message: "No analytics data available yet" });
        }

        // Calculating Total Clicks and Unique Clicks to that id
        const totalClicks = analyticsData.length;

        // Using a Set to get the unique IP addresses
        const uniqueUsers = new Set(analyticsData.map(data => data.ipAddress)).size;

        // Analyzing Clicks by Date (Recent 7 days) using moment
        const clicksByDate = {};
        const sevenDaysAgo = moment().subtract(7, 'days');

        analyticsData.forEach(({ timestamp }) => {
            const date = moment(timestamp).format('YYYY-MM-DD');
            if (moment(date).isAfter(sevenDaysAgo)) {
                clicksByDate[date] = (clicksByDate[date] || 0) + 1;
            }
        });

        const clicksByDateArray = Object.keys(clicksByDate).map(date => ({
            date,
            clicks: clicksByDate[date],
        }));

        //Analyzing the OS Type
        const osData = {};
        const deviceData = {};

        analyticsData.forEach(({ userAgent, ipAddress }) => {
            const os = getOS(userAgent); // Extracting OS from userAgent
            const device = getDeviceType(userAgent); // Extracting Device type

            // Updating OS Data
            if (!osData[os]) {
                osData[os] = { uniqueUsers: new Set(), uniqueClicks: 0 };
            }
            osData[os].uniqueUsers.add(ipAddress);
            osData[os].uniqueClicks++;

            // Updating the Device Data
            if (!deviceData[device]) {
                deviceData[device] = { uniqueUsers: new Set(), uniqueClicks: 0 };
            }
            deviceData[device].uniqueUsers.add(ipAddress);
            deviceData[device].uniqueClicks++;
        });

        // Converting OS data and device data into arrays
        const osType = Object.keys(osData).map(osName => ({
            osName,
            uniqueClicks: osData[osName].uniqueClicks,
            uniqueUsers: osData[osName].uniqueUsers.size,
        }));

        const deviceType = Object.keys(deviceData).map(deviceName => ({
            deviceName,
            uniqueClicks: deviceData[deviceName].uniqueClicks,
            uniqueUsers: deviceData[deviceName].uniqueUsers.size,
        }));

        // Sending the Response
        return res.status(200).json({
            totalClicks,
            uniqueClicks: uniqueUsers,
            clicksByDate: clicksByDateArray,
            osType,
            deviceType,
        });
    } catch (err) {
        console.error("Error in fetching analytics:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};
const getTopicAnalytics = async (req, res) => {
    try {
        const { topic } = req.params;

        // Fetching all short URLs under the specified topic
        const urls = await Url.find({ topic });
        if (urls.length === 0) {
            return res.status(404).json({ error: "No URLs found for the specified topic" });
        }

        // Initializing the response data
        let totalClicks = 0;
        const uniqueUsersSet = new Set();
        const clicksByDate = {};
        const urlAnalytics = [];

        //Processing each URL under the topic
        for (const url of urls) {
            const { shortId, redirectUrl } = url;

            // Fetching analytics for the current short URL
            const analyticsData = await Analytics.find({ shortId });

            // Aggregate clicks and unique users
            const shortUrlTotalClicks = analyticsData.length;
            const shortUrlUniqueUsers = new Set(analyticsData.map(data => data.ipAddress));

            totalClicks += shortUrlTotalClicks;
            shortUrlUniqueUsers.forEach(user => uniqueUsersSet.add(user));

            // Tracking clicks by the date
            analyticsData.forEach(({ timestamp }) => {
                const date = moment(timestamp).format('YYYY-MM-DD');
                clicksByDate[date] = (clicksByDate[date] || 0) + 1;
            });

            // Pushing the individual URL analytics to redis
            urlAnalytics.push({
                shortUrl: `${req.protocol}://${req.get('host')}/${shortId}`,
                totalClicks: shortUrlTotalClicks,
                uniqueClicks: shortUrlUniqueUsers.size,
            });
        }

        // Format the clicksByDate into an array
        const clicksByDateArray = Object.keys(clicksByDate).map(date => ({
            date,
            clicks: clicksByDate[date],
        }));

        // Sending the response
        return res.status(200).json({
            totalClicks,
            uniqueClicks: uniqueUsersSet.size,
            clicksByDate: clicksByDateArray,
            urls: urlAnalytics,
        });
    } catch (err) {
        console.error("Error fetching topic analytics:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};

const getOverallAnalytics = async (req, res) => {
    try {
        const userId = req.user.id; // Authenticated user ID
        
        //Fetching all URLs created by the user using userid
        const urls = await Url.find({ userId });
        if (urls.length === 0) {
            return res.status(404).json({ error: "No URLs created by the user" });
        }

        // Initialize overall analytics data
        let totalClicks = 0;
        const uniqueUsersSet = new Set();
        const clicksByDate = {};
        const osData = {};
        const deviceData = {};

        // Processing analytics for each short URL
        for (const url of urls) {
            const { shortId } = url;

            // Fetching all analytics data for the current shortId
            const analyticsData = await Analytics.find({ shortId });

            // Aggregating total clicks and unique users
            totalClicks += analyticsData.length;
            analyticsData.forEach(({ timestamp, userAgent, ipAddress }) => {
                // Tracking unique users globally
                uniqueUsersSet.add(ipAddress);

                // Tracking clicks by date
                const date = moment(timestamp).format('YYYY-MM-DD');
                clicksByDate[date] = (clicksByDate[date] || 0) + 1;

                // Analyzing OS data
                const os = getOS(userAgent);
                if (!osData[os]) {
                    osData[os] = { uniqueUsers: new Set(), uniqueClicks: 0 };
                }
                osData[os].uniqueUsers.add(ipAddress);
                osData[os].uniqueClicks++;

                // Analyze Device Type data
                const device = getDeviceType(userAgent);
                if (!deviceData[device]) {
                    deviceData[device] = { uniqueUsers: new Set(), uniqueClicks: 0 };
                }
                deviceData[device].uniqueUsers.add(ipAddress);
                deviceData[device].uniqueClicks++;
            });
        }

        // Formating the clicksByDate into an array
        const clicksByDateArray = Object.keys(clicksByDate).map(date => ({
            date,
            clicks: clicksByDate[date],
        }));

        // Formating OS data into an array
        const osType = Object.keys(osData).map(osName => ({
            osName,
            uniqueClicks: osData[osName].uniqueClicks,
            uniqueUsers: osData[osName].uniqueUsers.size,
        }));

        // Formating Device Type data into an array
        const deviceType = Object.keys(deviceData).map(deviceName => ({
            deviceName,
            uniqueClicks: deviceData[deviceName].uniqueClicks,
            uniqueUsers: deviceData[deviceName].uniqueUsers.size,
        }));

        // Sending the response
        return res.status(200).json({
            totalUrls: urls.length,
            totalClicks,
            uniqueClicks: uniqueUsersSet.size,
            clicksByDate: clicksByDateArray,
            osType,
            deviceType,
        });
    } catch (err) {
        console.error("Error fetching overall analytics:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};


// Helper function to determine the OS from User-Agent
function getOS(userAgent) {
    if (/windows/i.test(userAgent)) return "Windows";
    if (/macintosh|mac os/i.test(userAgent)) return "macOS";
    if (/android/i.test(userAgent)) return "Android";
    if (/iphone|ipad|ipod/i.test(userAgent)) return "iOS";
    if (/linux/i.test(userAgent)) return "Linux";
    return "Other";
}

// Helper function to determine the Device Type from User-Agent
function getDeviceType(userAgent) {
    if (/mobile/i.test(userAgent)) return "Mobile";
    if (/tablet/i.test(userAgent)) return "Tablet";
    return "Desktop";
}

module.exports = {generateShortUrl,redirecturl,getAnalytics,getTopicAnalytics,getOverallAnalytics};