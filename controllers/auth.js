const jwt = require('jsonwebtoken');

exports.loginSuccess = (req, res) => {
    if (req.user) {
        const token = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, {
            expiresIn: '1d',
        });

        res.status(200).json({
            message: 'Login successful',
            token,
            user: {
                id: req.user._id,
                name: req.user.name,
                email: req.user.email,
                profilePicture: req.user.profilePicture,
            },
        });
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
};


exports.loginFailure = (req, res) => {
    res.status(401).json({ message: 'Login failed' });
};
