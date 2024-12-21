const express = require('express')
const {generateShortUrl,redirecturl,getAnalytics,getTopicAnalytics,getOverallAnalytics} = require("../controllers/url")
const authenticateToken = require("../middleware/authmiddleware");
const apiLimiter = require("../middleware/apiLimiter")

const router = express.Router();

router.post("/shorten" ,authenticateToken,apiLimiter, generateShortUrl)
router.get("/shorten/:alias",authenticateToken ,redirecturl)
router.get("/analytics/topic/:topic",authenticateToken , getTopicAnalytics)
router.get("/analytics/overall",authenticateToken , getOverallAnalytics)
router.get("/analytics/:alias",authenticateToken , getAnalytics)

module.exports = router;