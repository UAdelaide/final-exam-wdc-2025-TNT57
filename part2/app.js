const express = require('express');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const db = require('./models/db');

const app = express();

// Session
app.use(session({
    secret: 'dog-walking-secret-key', // For session encryption
    resave: false, // If unmodified, sesssion is not saved
    saveUninitialized: false, // Session not created until storing something
    cookie: { secure: false }
}));

// Route to return a list of all dogs with their size and owner's username.
app.get('/api/dogs', async (req, res) => {
    try {
        const [dogs] = await db.execute(`
            SELECT Dogs.name, Dogs.size, Users.username as owner_username
            FROM Dogs
            JOIN Users ON Dogs.owner_id = Users.user_id
            `);
            res.json(dogs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '/public')));

// Auth middleware
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/');
    }
    next();
}

// Role based protection
function requireRole(role) {
    return function (req, res, next) {
        if (!req.session.user || req.session.user.role !== role) {
            return res.redirect('/');
        }
        next();
    };
}



// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);



// Export the app instead of listening here
module.exports = app;
