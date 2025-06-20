const express = require('express');
const router = express.Router();
const db = require('../models/db');

// GET all users (for admin/testing)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id, username, email, role FROM Users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST a new user (simple signup)
router.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    const [result] = await db.query(`
      INSERT INTO Users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `, [username, email, password, role]);

    res.status(201).json({ message: 'User registered', user_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json(req.session.user);
});

// POST login (dummy version)
// router.post('/login', async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     const [rows] = await db.query(`
//       SELECT user_id, username, role FROM Users
//       WHERE email = ? AND password_hash = ?
//     `, [email, password]);

//     if (rows.length === 0) {
//       return res.status(401).json({ error: 'Invalid credentials' });
//     }

//     res.json({ message: 'Login successful', user: rows[0] });
//   } catch (error) {
//     res.status(500).json({ error: 'Login failed' });
//   }
// });



// POST login with session version
router.post('/login', async (req, res) => {
  const { username, password } = req.body; // Take credentials from request

  try {
    // Query the database
    const [rows] = await db.query(`
      SELECT user_id, username, email, role FROM Users
      WHERE username = ? AND password_hash = ?
    `, [username, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Store user in the session
    req.session.user = rows[0];

    // On successful login go to Owner/Walker dashboard depend on their role
    res.json({ message: 'Login successful', user: rows[0], redirect: rows[0].role === 'owner' ? '/owner-dashboard.html' : '/walker-dashboard.html' });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});


// POST logout
router.post('/logout', (req, res) => {
  // Destroy user session and clear session data
  req.session.destroy((err) => {
    if (err){
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logout successful '});
  });
});


// GET dogs owned by the logged in user
router.get('/my-dogs', async (req, res) => {
  const ownerID = req.session.user.user_id;

  try {
    const[rows] = await db.query(`
      SELECT dog_id, name FROM Dogs WHERE owner_id = ?
      `, [ownerID]);
      res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});


module.exports = router;
