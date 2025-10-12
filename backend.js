 const express = require('express');
 const sqlite3 = require('sqlite3').verbose();
 const bcrypt = require('bcrypt');
 const jwt = require('jsonwebtoken');
 const cors = require('cors');
 const multer = require('multer');
 const path = require('path');
 const fs = require('fs');

 // Initialize Express app
 const app = express();
 const PORT = process.env.PORT || 3000;

 // Middleware
 app.use(cors());
 app.use(express.json());
 app.use(express.urlencoded({ extended: true }));
 app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

 // Ensure uploads directory exists
 if (!fs.existsSync('uploads')) {
     fs.mkdirSync('uploads');
 }

 // Ensure database directory exists
 if (!fs.existsSync('database')) {
     fs.mkdirSync('database', { recursive: true });
 }

 // Configure multer for file uploads
 const storage = multer.diskStorage({
     destination: (req, file, cb) => {
         cb(null, 'uploads/');
     },
     filename: (req, file, cb) => {
         cb(null, Date.now() + path.extname(file.originalname));
     }
 });

 const upload = multer({ storage: storage });

 // Initialize SQLite database
 const dbPath = path.join(__dirname, 'database', 'sqlite.db');
 console.log("Database path:", dbPath);
 const db = new sqlite3.Database(dbPath, (err) => {
     if (err) {
         console.error('Error opening database:', err.message);
     } else {
         console.log('Connected to SQLite database.');
         initializeDatabase();
     }
 });

 // Initialize database tables
 function initializeDatabase() {
     console.log("Initializing database tables...");

     // Users table
     db.run(`CREATE TABLE IF NOT EXISTS users (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         email TEXT UNIQUE NOT NULL,
         phone TEXT,
         password TEXT NOT NULL,
         avatar TEXT,
         date_of_birth TEXT,
         address TEXT,
         member_since TEXT DEFAULT CURRENT_TIMESTAMP,
         is_verified INTEGER DEFAULT 0,
         is_admin INTEGER DEFAULT 0
     )`, (err) => {
         if (err) {
             console.error("Error creating users table:", err.message);
         } else {
             console.log("Users table created or already exists");
         }
     });

     // Bikes table
     db.run(`CREATE TABLE IF NOT EXISTS bikes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         type TEXT NOT NULL,
         price REAL NOT NULL,
         description TEXT,
         image TEXT,
         status TEXT DEFAULT 'available'
     )`, (err) => {
         if (err) {
             console.error("Error creating bikes table:", err.message);
         } else {
             console.log("Bikes table created or already exists");
         }
     });

     // Bookings table
     db.run(`CREATE TABLE IF NOT EXISTS bookings (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL,
         bike_id INTEGER NOT NULL,
         start_date TEXT NOT NULL,
         end_date TEXT NOT NULL,
         amount REAL NOT NULL,
         payment_method TEXT,
         status TEXT DEFAULT 'pending',
         created_at TEXT DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (user_id) REFERENCES users (id),
         FOREIGN KEY (bike_id) REFERENCES bikes (id)
     )`, (err) => {
         if (err) {
             console.error("Error creating bookings table:", err.message);
         } else {
             console.log("Bookings table created or already exists");
         }
     });

     // Reviews table
     db.run(`CREATE TABLE IF NOT EXISTS reviews (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER NOT NULL,
         bike_id INTEGER NOT NULL,
         booking_id INTEGER NOT NULL,
         rating INTEGER NOT NULL,
         comment TEXT,
         created_at TEXT DEFAULT CURRENT_TIMESTAMP,
         FOREIGN KEY (user_id) REFERENCES users (id),
         FOREIGN KEY (bike_id) REFERENCES bikes (id),
         FOREIGN KEY (booking_id) REFERENCES bookings (id)
     )`, (err) => {
         if (err) {
             console.error("Error creating reviews table:", err.message);
         } else {
             console.log("Reviews table created or already exists");
         }
     });

     // Promo codes table
     db.run(`CREATE TABLE IF NOT EXISTS promo_codes (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         code TEXT UNIQUE NOT NULL,
         discount_type TEXT NOT NULL,
         discount_value REAL NOT NULL,
         valid_from TEXT NOT NULL,
         valid_until TEXT NOT NULL,
         usage_limit INTEGER NOT NULL,
         used_count INTEGER DEFAULT 0,
         status TEXT DEFAULT 'active'
     )`, (err) => {
         if (err) {
             console.error("Error creating promo_codes table:", err.message);
         } else {
             console.log("Promo codes table created or already exists");
         }
     });

     // Contact messages table
     db.run(`CREATE TABLE IF NOT EXISTS contact_messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         name TEXT NOT NULL,
         email TEXT NOT NULL,
         subject TEXT NOT NULL,
         message TEXT NOT NULL,
         created_at TEXT DEFAULT CURRENT_TIMESTAMP
     )`, (err) => {
         if (err) {
             console.error("Error creating contact_messages table:", err.message);
         } else {
             console.log("Contact messages table created or already exists");
         }
     });

     // Insert sample data if tables are empty
     db.get("SELECT COUNT(*) as count FROM bikes", (err, row) => {
         if (err) {
             console.error(err.message);
         } else if (row.count === 0) {
             console.log("Inserting sample bikes...");
             // Insert sample bikes
             const sampleBikes = [
                 { name: "Mountain Bike Pro", type: "Mountain Bike", price: 25, description: "Perfect for off-road adventures with durable frame and advanced suspension system.", image: "https://picsum.photos/seed/mountain1/400/300.jpg" },
                 { name: "City Cruiser", type: "City Bike", price: 15, description: "Comfortable and efficient for urban commuting with ergonomic design.", image: "https://picsum.photos/seed/city1/400/300.jpg" },
                 { name: "Electric Bike X1", type: "Electric Bike", price: 35, description: "Powerful electric motor with long-lasting battery for effortless rides.", image: "https://picsum.photos/seed/electric1/400/300.jpg" },
                 { name: "Travel Explorer", type: "Hybrid Bike", price: 30, description: "Versatile bike suitable for both city commuting and light trail riding.", image: "https://picsum.photos/seed/travel1/400/300.jpg" },
                 { name: "Road Racer", type: "Road Bike", price: 20, description: "Lightweight and aerodynamic design for maximum speed on paved roads.", image: "https://picsum.photos/seed/road1/400/300.jpg" },
                 { name: "Hybrid Comfort", type: "Hybrid Bike", price: 18, description: "Combines the best features of road and mountain bikes for all-around comfort.", image: "https://picsum.photos/seed/hybrid1/400/300.jpg" }
             ];

             const stmt = db.prepare("INSERT INTO bikes (name, type, price, description, image) VALUES (?, ?, ?, ?, ?)");
             sampleBikes.forEach(bike => {
                 stmt.run(bike.name, bike.type, bike.price, bike.description, bike.image);
             });
             stmt.finalize();
             console.log("Sample bikes inserted");
         }
     });

     db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
         if (err) {
             console.error(err.message);
         } else if (row.count === 0) {
             console.log("Inserting admin user...");
             // Insert admin user
             const hashedPassword = bcrypt.hashSync('admin123', 10);
             db.run("INSERT INTO users (name, email, password, is_admin) VALUES (?, ?, ?, ?)",
                 ['Admin User', 'admin@bikerentpro.com', hashedPassword, 1], (err) => {
                     if (err) {
                         console.error("Error inserting admin user:", err.message);
                     } else {
                         console.log("Admin user inserted");
                     }
                 });
         }
     });
 }

 // JWT Secret
 const JWT_SECRET = 'bikerentpro-secret-key';

 // Middleware to verify JWT token
 function authenticateToken(req, res, next) {
     const authHeader = req.headers['authorization'];
     const token = authHeader && authHeader.split(' ')[1];

     if (!token) {
         return res.status(401).json({ message: 'Authentication required' });
     }

     jwt.verify(token, JWT_SECRET, (err, user) => {
         if (err) {
             return res.status(403).json({ message: 'Invalid token' });
         }
         req.user = user;
         next();
     });
 }

 // Middleware to check if user is admin
 function isAdmin(req, res, next) {
     if (req.user.is_admin !== 1) {
         return res.status(403).json({ message: 'Admin access required' });
     }
     next();
 }

 // API Routes

 // User Authentication
 app.post('/api/register', async (req, res) => {
     try {
         const { name, email, phone, password, confirmPassword } = req.body;

         if (!name || !email || !password || !confirmPassword) {
             return res.status(400).json({ message: 'All fields are required' });
         }

         if (password !== confirmPassword) {
             return res.status(400).json({ message: 'Passwords do not match' });
         }

         // Check if user already exists
         db.get("SELECT * FROM users WHERE email = ?", [email], async (err, row) => {
             if (err) {
                 return res.status(500).json({ message: 'Database error' });
             }

             if (row) {
                 return res.status(400).json({ message: 'User already exists' });
             }

             // Hash password
             const hashedPassword = bcrypt.hashSync(password, 10);

             // Insert new user
             db.run(
                 "INSERT INTO users (name, email, phone, password) VALUES (?, ?, ?, ?)",
                 [name, email, phone, hashedPassword],
                 function(err) {
                     if (err) {
                         return res.status(500).json({ message: 'Failed to register user' });
                     }

                     // Generate JWT token
                     const token = jwt.sign(
                         { id: this.lastID, email, name, is_admin: 0 },
                         JWT_SECRET,
                         { expiresIn: '24h' }
                     );

                     res.status(201).json({
                         message: 'User registered successfully',
                         token,
                         user: { id: this.lastID, name, email, is_admin: 0 }
                     });
                 }
             );
         });
     } catch (error) {
         res.status(500).json({ message: 'Server error' });
     }
 });

 app.post('/api/login', (req, res) => {
     const { email, password } = req.body;

     if (!email || !password) {
         return res.status(400).json({ message: 'Email and password are required' });
     }

     db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         if (!user) {
             return res.status(401).json({ message: 'Invalid email or password' });
         }

         // Compare passwords
         const isPasswordValid = bcrypt.compareSync(password, user.password);

         if (!isPasswordValid) {
             return res.status(401).json({ message: 'Invalid email or password' });
         }

         // Generate JWT token
         const token = jwt.sign(
             { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin },
             JWT_SECRET,
             { expiresIn: '24h' }
         );

         res.json({
             message: 'Login successful',
             token,
             user: {
                 id: user.id,
                 name: user.name,
                 email: user.email,
                 is_admin: user.is_admin,
                 avatar: user.avatar
             }
         });
     });
 });

 // Admin Login
 app.post('/api/admin/login', (req, res) => {
     const { username, password } = req.body;

     if (!username || !password) {
         return res.status(400).json({ message: 'Username and password are required' });
     }

     db.get("SELECT * FROM users WHERE email = ? AND is_admin = 1", [username], (err, user) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         if (!user) {
             return res.status(401).json({ message: 'Invalid username or password' });
         }

         // Compare passwords
         const isPasswordValid = bcrypt.compareSync(password, user.password);

         if (!isPasswordValid) {
             return res.status(401).json({ message: 'Invalid username or password' });
         }

         // Generate JWT token
         const token = jwt.sign(
             { id: user.id, email: user.email, name: user.name, is_admin: user.is_admin },
             JWT_SECRET,
             { expiresIn: '24h' }
         );

         res.json({
             message: 'Admin login successful',
             token,
             user: {
                 id: user.id,
                 name: user.name,
                 email: user.email,
                 is_admin: user.is_admin
             }
         });
     });
 });

 // Get user profile
 app.get('/api/profile', authenticateToken, (req, res) => {
     db.get("SELECT id, name, email, phone, avatar, date_of_birth, address, member_since, is_verified FROM users WHERE id = ?", [req.user.id], (err, user) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         if (!user) {
             return res.status(404).json({ message: 'User not found' });
         }

         res.json(user);
     });
 });

 // Bike Management
 app.get('/api/bikes', (req, res) => {
     const { search, type, price, availability } = req.query;
     let query = "SELECT * FROM bikes";
     const params = [];

     if (search || type || price || availability) {
         query += " WHERE";
         const conditions = [];

         if (search) {
             conditions.push(" (name LIKE ? OR type LIKE ?)");
             params.push(`%${search}%`, `%${search}%`);
         }

         if (type) {
             conditions.push(" type = ?");
             params.push(type);
         }

         if (price) {
             conditions.push(" price <= ?");
             params.push(parseFloat(price));
         }

         if (availability) {
             conditions.push(" status = ?");
             params.push(availability);
         }

         query += conditions.join(" AND");
     }

     db.all(query, params, (err, rows) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         res.json(rows);
     });
 });

 app.get('/api/bikes/:id', (req, res) => {
     const bikeId = req.params.id;

     db.get("SELECT * FROM bikes WHERE id = ?", [bikeId], (err, row) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         if (!row) {
             return res.status(404).json({ message: 'Bike not found' });
         }

         res.json(row);
     });
 });

 app.post('/api/bikes', authenticateToken, isAdmin, upload.single('image'), (req, res) => {
     const { name, type, price, description, status } = req.body;
     const image = req.file ? `/uploads/${req.file.filename}` : null;

     if (!name || !type || !price || !description) {
         return res.status(400).json({ message: 'All fields are required' });
     }

     db.run(
         "INSERT INTO bikes (name, type, price, description, image, status) VALUES (?, ?, ?, ?, ?, ?)",
         [name, type, parseFloat(price), description, image, status || 'available'],
         function(err) {
             if (err) {
                 return res.status(500).json({ message: 'Failed to add bike' });
             }

             res.status(201).json({
                 message: 'Bike added successfully',
                 bike: { id: this.lastID, name, type, price, description, image, status }
             });
         }
     );
 });

 app.put('/api/bikes/:id', authenticateToken, isAdmin, upload.single('image'), (req, res) => {
     const bikeId = req.params.id;
     const { name, type, price, description, status } = req.body;
     const image = req.file ? `/uploads/${req.file.filename}` : req.body.existingImage;

     if (!name || !type || !price || !description) {
         return res.status(400).json({ message: 'All fields are required' });
     }

     db.run(
         "UPDATE bikes SET name = ?, type = ?, price = ?, description = ?, image = ?, status = ? WHERE id = ?",
         [name, type, parseFloat(price), description, image, status, bikeId],
         function(err) {
             if (err) {
                 return res.status(500).json({ message: 'Failed to update bike' });
             }

             if (this.changes === 0) {
                 return res.status(404).json({ message: 'Bike not found' });
             }

             res.json({
                 message: 'Bike updated successfully',
                 bike: { id: bikeId, name, type, price, description, image, status }
             });
         }
     );
 });

 app.delete('/api/bikes/:id', authenticateToken, isAdmin, (req, res) => {
     const bikeId = req.params.id;

     db.run("DELETE FROM bikes WHERE id = ?", [bikeId], function(err) {
         if (err) {
             return res.status(500).json({ message: 'Failed to delete bike' });
         }

         if (this.changes === 0) {
             return res.status(404).json({ message: 'Bike not found' });
         }

         res.json({ message: 'Bike deleted successfully' });
     });
 });

 // Booking Management
 app.post('/api/bookings', authenticateToken, (req, res) => {
     const { bikeId, startDate, endDate, amount, paymentMethod } = req.body;

     if (!bikeId || !startDate || !endDate || !amount || !paymentMethod) {
         return res.status(400).json({ message: 'All fields are required' });
     }

     // Check if bike is available
     db.get("SELECT status FROM bikes WHERE id = ?", [bikeId], (err, bike) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         if (!bike) {
             return res.status(404).json({ message: 'Bike not found' });
         }

         if (bike.status !== 'available') {
             return res.status(400).json({ message: 'Bike is not available for booking' });
         }

         // Create booking
         db.run(
             "INSERT INTO bookings (user_id, bike_id, start_date, end_date, amount, payment_method) VALUES (?, ?, ?, ?, ?, ?)",
             [req.user.id, bikeId, startDate, endDate, parseFloat(amount), paymentMethod],
             function(err) {
                 if (err) {
                     return res.status(500).json({ message: 'Failed to create booking' });
                 }

                 // Update bike status
                 db.run("UPDATE bikes SET status = 'rented' WHERE id = ?", [bikeId]);

                 res.status(201).json({
                     message: 'Booking created successfully',
                     booking: { id: this.lastID, userId: req.user.id, bikeId, startDate, endDate, amount, paymentMethod, status: 'pending' }
                 });
             }
         );
     });
 });

 app.get('/api/bookings/user', authenticateToken, (req, res) => {
     db.all(
         "SELECT b.*, bk.name as bike_name, bk.type as bike_type, bk.image as bike_image FROM bookings b JOIN bikes bk ON b.bike_id = bk.id WHERE b.user_id = ? ORDER BY b.created_at DESC",
         [req.user.id],
         (err, rows) => {
             if (err) {
                 return res.status(500).json({ message: 'Database error' });
             }

             res.json(rows);
         }
     );
 });

 app.get('/api/bookings', authenticateToken, isAdmin, (req, res) => {
     const { status } = req.query;
     let query = "SELECT b.*, u.name as user_name, u.email as user_email, bk.name as bike_name, bk.type as bike_type FROM bookings b JOIN users u ON b.user_id = u.id JOIN bikes bk ON b.bike_id = bk.id";
     const params = [];

     if (status) {
         query += " WHERE b.status = ?";
         params.push(status);
     }

     query += " ORDER BY b.created_at DESC";

     db.all(query, params, (err, rows) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         res.json(rows);
     });
 });

 app.put('/api/bookings/:id/status', authenticateToken, isAdmin, (req, res) => {
     const bookingId = req.params.id;
     const { status } = req.body;

     if (!status) {
         return res.status(400).json({ message: 'Status is required' });
     }

     db.run("UPDATE bookings SET status = ? WHERE id = ?", [status, bookingId], function(err) {
         if (err) {
             return res.status(500).json({ message: 'Failed to update booking status' });
         }

         if (this.changes === 0) {
             return res.status(404).json({ message: 'Booking not found' });
         }

         // If booking is completed or cancelled, update bike status to available
         if (status === 'completed' || status === 'cancelled') {
             db.get("SELECT bike_id FROM bookings WHERE id = ?", [bookingId], (err, booking) => {
                 if (!err && booking) {
                     db.run("UPDATE bikes SET status = 'available' WHERE id = ?", [booking.bike_id]);
                 }
             });
         }

         res.json({ message: 'Booking status updated successfully' });
     });
 });

 // Reviews
 app.post('/api/reviews', authenticateToken, (req, res) => {
     const { bikeId, bookingId, rating, comment } = req.body;

     if (!bikeId || !bookingId || !rating) {
         return res.status(400).json({ message: 'Bike ID, booking ID, and rating are required' });
     }

     // Check if booking belongs to user and is completed
     db.get("SELECT * FROM bookings WHERE id = ? AND user_id = ? AND status = 'completed'", [bookingId, req.user.id], (err, booking) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         if (!booking) {
             return res.status(400).json({ message: 'Invalid booking or booking not completed' });
         }

         // Check if review already exists
         db.get("SELECT * FROM reviews WHERE booking_id = ?", [bookingId], (err, existingReview) => {
             if (err) {
                 return res.status(500).json({ message: 'Database error' });
             }

             if (existingReview) {
                 return res.status(400).json({ message: 'Review already exists for this booking' });
             }

             // Create review
             db.run(
                 "INSERT INTO reviews (user_id, bike_id, booking_id, rating, comment) VALUES (?, ?, ?, ?, ?)",
                 [req.user.id, bikeId, bookingId, rating, comment],
                 function(err) {
                     if (err) {
                         return res.status(500).json({ message: 'Failed to create review' });
                     }

                     res.status(201).json({
                         message: 'Review submitted successfully',
                         review: { id: this.lastID, userId: req.user.id, bikeId, bookingId, rating, comment }
                     });
                 }
             );
         });
     });
 });

 // Promo Codes
 app.get('/api/promo-codes', authenticateToken, isAdmin, (req, res) => {
     const { status } = req.query;
     let query = "SELECT * FROM promo_codes";
     const params = [];

     if (status) {
         query += " WHERE status = ?";
         params.push(status);
     }

     query += " ORDER BY created_at DESC";

     db.all(query, params, (err, rows) => {
         if (err) {
             return res.status(500).json({ message: 'Database error' });
         }

         res.json(rows);
     });
 });

 app.post('/api/promo-codes', authenticateToken, isAdmin, (req, res) => {
     const { code, discountType, discountValue, validFrom, validUntil, usageLimit } = req.body;

     if (!code || !discountType || !discountValue || !validFrom || !validUntil || !usageLimit) {
         return res.status(400).json({ message: 'All fields are required' });
     }

     db.run(
         "INSERT INTO promo_codes (code, discount_type, discount_value, valid_from, valid_until, usage_limit) VALUES (?, ?, ?, ?, ?, ?)",
         [code, discountType, parseFloat(discountValue), validFrom, validUntil, parseInt(usageLimit)],
         function(err) {
             if (err) {
                 return res.status(500).json({ message: 'Failed to create promo code' });
             }

             res.status(201).json({
                 message: 'Promo code created successfully',
                 promoCode: { id: this.lastID, code, discountType, discountValue, validFrom, validUntil, usageLimit, usedCount: 0, status: 'active' }
             });
         }
     );
 });

 // Contact Form
 app.post('/api/contact', (req, res) => {
     const { name, email, subject, message } = req.body;

     if (!name || !email || !subject || !message) {
         return res.status(400).json({ message: 'All fields are required' });
     }

     db.run(
         "INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)",
         [name, email, subject, message],
         function(err) {
             if (err) {
                 return res.status(500).json({ message: 'Failed to send message' });
             }

             res.status(201).json({
                 message: 'Message sent successfully',
                 contactMessage: { id: this.lastID, name, email, subject, message }
             });
         }
     );
 });

 // Admin Dashboard Stats
 app.get('/api/admin/stats', authenticateToken, isAdmin, (req, res) => {
     const stats = {};

     // Total bikes
     db.get("SELECT COUNT(*) as count FROM bikes", (err, row) => {
         if (!err && row) {
             stats.totalBikes = row.count;
         }

         // Active rentals
         db.get("SELECT COUNT(*) as count FROM bookings WHERE status = 'confirmed'", (err, row) => {
             if (!err && row) {
                 stats.activeRentals = row.count;
             }

             // Total users
             db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
                 if (!err && row) {
                     stats.totalUsers = row.count;
                 }

                 // Revenue
                 db.get("SELECT SUM(amount) as total FROM bookings WHERE status = 'completed'", (err, row) => {
                     if (!err && row) {
                         stats.revenue = row.total || 0;
                     }

                     res.json(stats);
                 });
             });
         });
     });
 });

 // Serve static files
 app.use(express.static(path.join(__dirname, 'public')));

 // Serve the main HTML file for all other routes
 app.get('*', (req, res) => {
     res.sendFile(path.join(__dirname, 'public', 'index.html'));
 });

 // Start server
 app.listen(PORT, () => {
     console.log(`Server running on port ${PORT}`);
 });