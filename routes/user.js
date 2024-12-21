const express = require('express');
const passport = require('passport');
const { loginSuccess, loginFailure } = require('../controllers/auth');

const router = express.Router();


router.get("/google", passport.authenticate("google", {scope: ['profile', 'email']}));

router.get("/google/callback", passport.authenticate("google", { failureRedirect: '/auth/failure' }),
    loginSuccess
);

router.get('/failure', loginFailure);

module.exports = router;
