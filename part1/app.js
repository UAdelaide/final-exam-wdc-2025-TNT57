var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
  try {
    // Connect to MySQL without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '' // Set your MySQL root password
    });

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Now connect to the created database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'DogWalkService'
    });

    // Create a table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
        user_id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('owner', 'walker') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS Dogs (
        dog_id INT AUTO_INCREMENT PRIMARY KEY,
        owner_id INT NOT NULL,
        name VARCHAR(50) NOT NULL,
        size ENUM('small', 'medium', 'large') NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
    )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRequests (
        request_id INT AUTO_INCREMENT PRIMARY KEY,
        dog_id INT NOT NULL,
        requested_time DATETIME NOT NULL,
        duration_minutes INT NOT NULL,
        location VARCHAR(255) NOT NULL,
        status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
    )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkApplications (
        application_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        CONSTRAINT unique_application UNIQUE (request_id, walker_id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS WalkRatings (
        rating_id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        walker_id INT NOT NULL,
        owner_id INT NOT NULL,
        rating INT CHECK (rating BETWEEN 1 AND 5),
        comments TEXT,
        rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
        FOREIGN KEY (walker_id) REFERENCES Users(user_id),
        FOREIGN KEY (owner_id) REFERENCES Users(user_id),
        CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
      )
    `);

    // Insert data if table is empty
    const [rows] = await db.execute('SELECT COUNT(*) AS count FROM Users');
    if (rows[0].count === 0) {
      // Insert Users
      await db.execute(`
        INSERT INTO Users (username, email, password_hash, role) VALUES
        ('alice123', 'alice@example.com', 'hashed123', 'owner'),
        ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
        ('carol123', 'carol@example.com', 'hashed789', 'owner'),
        ('john_doe123', 'john@example.com', 'hashed101', 'walker'),
        ('jane_doe123', 'jane@example.com', 'hashed202', 'owner')
      `);

      // Insert Dogs
      await db.execute(`
        INSERT INTO Dogs (owner_id, name, size) VALUES
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
        ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Charlie', 'large'),
        ((SELECT user_id FROM Users WHERE username = 'jane_doe123'), 'Milu', 'small'),
        ((SELECT user_id FROM Users WHERE username = 'jane_doe123'), 'Nick', 'medium')
      `);

      // Insert Walk Requests
      await db.execute(`
        INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
        ((SELECT dog_id FROM Dogs WHERE name = 'Max' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')),
         '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Bella' AND owner_id = (SELECT user_id FROM Users WHERE username = 'carol123')),
         '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Charlie' AND owner_id = (SELECT user_id FROM Users WHERE username = 'alice123')),
         '2025-06-11 10:00:00', 60, 'Central Park', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Milu' AND owner_id = (SELECT user_id FROM Users WHERE username = 'jane_doe123')),
         '2025-06-11 15:30:00', 30, 'Riverside Trail', 'open'),
        ((SELECT dog_id FROM Dogs WHERE name = 'Nick' AND owner_id = (SELECT user_id FROM Users WHERE username = 'jane_doe123')),
         '2025-06-12 07:45:00', 15, 'Mountain View Park', 'completed')
      `);
    }
  } catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
})();



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

// Route to return all open walk requests
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [open_requests] = await db.execute(`
            SELECT WalkRequests.request_id, Dogs.name as dog_name, WalkRequests.requested_time, WalkRequests.duration_minutes,
            WalkRequests.location, Users.username as owner_username
            FROM WalkRequests
            JOIN Dogs ON WalkRequests.dog_id = Dogs.dog_id
            JOIN Users ON Dogs.owner_id = Users.user_id
            WHERE WalkRequests.status = 'open'
            `);
            res.json(open_requests);
    } catch (err){
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Route to return a summary of each walker with their average rating and number of completed walks.
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [walkers] = await db.execute(`
            SELECT Users.username as walker_username,
            COUNT(DISTINCT WalkRatings.rating_id) as total_ratings,
            ROUND(AVG(WalkRatings.rating), 1) as average_rating,
            COUNT(DISTINCT CASE WHEN WalkRequests.status = 'complete' AND WalkApplications.status = 'accepted'
            THEN WalkRequests.request_id
            END) as completed_walks
            FROM Users
            LEFT JOIN WalkApplications ON Users.user_id = WalkApplications.walker_id
            LEFT JOIN WalkRequests ON WalkApplications.request_id = WalkRequests.request_id
            LEFT JOIN WalkRatings ON Users.user_id = WalkRatings.walker_id
            WHERE Users.role = 'walker'
            GROUP BY Users.user_id
            `);
            res.json(walkers);
    } catch (err){
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

app.use(express.static(path.join(__dirname, 'public')));

const port = 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


module.exports = app;
