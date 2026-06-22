const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); // Add support for JSON bodies
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// Create MySQL connection
const db = mysql.createConnection({
    host: process.env.MYSQLHOST || 'reseau.proxy.rlwy.net',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'wfMKvlUKUmMeKdGerUQzffftCXVYuXsH',
    database: process.env.MYSQLDATABASE || 'railway',
    port: process.env.MYSQLPORT || 34386
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        return;
    }
    console.log('Connected to MySQL database: webgis_faskes_padang');

    // Automatically create ulasan table if it doesn't exist
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ulasan (
            id INT AUTO_INCREMENT PRIMARY KEY,
            klinik_id INT NOT NULL,
            nama VARCHAR(255) NOT NULL,
            rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
            komentar TEXT,
            foto VARCHAR(255),
            tanggal TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (klinik_id) REFERENCES klinik(id) ON DELETE CASCADE
        )
    `;
    db.query(createTableQuery, (err, results) => {
        if (err) {
            console.error('Error creating ulasan table:', err);
        } else {
            console.log('Tabel ulasan siap digunakan.');
            // Ensure foto column exists if table was already created
            db.query("SHOW COLUMNS FROM ulasan LIKE 'foto'", (err, cols) => {
                if (cols && cols.length === 0) {
                    db.query("ALTER TABLE ulasan ADD COLUMN foto VARCHAR(255)", (err) => {
                        if (err) console.error("Error adding foto column:", err);
                        else console.log("Kolom foto berhasil ditambahkan ke tabel ulasan.");
                    });
                }
            });
        }
    });

    // Automatically create admin table if it doesn't exist
    const createAdminTableQuery = `
        CREATE TABLE IF NOT EXISTS admin (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) NOT NULL,
            password VARCHAR(255) NOT NULL
        )
    `;
    db.query(createAdminTableQuery, (err) => {
        if (err) {
            console.error('Error creating admin table:', err);
        } else {
            // Insert default credentials if table is empty
            db.query("SELECT * FROM admin", (err, results) => {
                if (!err && results.length === 0) {
                    db.query("INSERT INTO admin (username, password) VALUES ('Kelompok Dua', 'Aspaskel2')");
                }
            });
            console.log('Tabel admin siap digunakan.');
        }
    });
});

// API endpoint for admin login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query("SELECT * FROM admin WHERE username = ? AND password = ?", [username, password], (err, results) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (results.length > 0) {
            res.json({ success: true, message: 'Login berhasil' });
        } else {
            res.status(401).json({ success: false, message: 'Username atau password salah' });
        }
    });
});

// API endpoint to update admin profile
app.put('/api/admin', (req, res) => {
    const { oldUsername, oldPassword, newUsername, newPassword } = req.body;
    db.query("SELECT * FROM admin WHERE username = ? AND password = ?", [oldUsername, oldPassword], (err, results) => {
        if (err) return res.status(500).json({ error: 'Server error' });
        if (results.length > 0) {
            db.query("UPDATE admin SET username = ?, password = ? WHERE id = ?", [newUsername, newPassword, results[0].id], (err) => {
                if (err) return res.status(500).json({ error: 'Gagal memperbarui profil' });
                res.json({ success: true, message: 'Profil admin berhasil diperbarui' });
            });
        } else {
            res.status(401).json({ success: false, message: 'Kredensial lama tidak cocok' });
        }
    });
});

// API endpoint to get clinics as GeoJSON
app.get('/api/klinik', (req, res) => {
    const query = 'SELECT * FROM klinik';

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching data:', err);
            res.status(500).json({ error: 'Failed to fetch data' });
            return;
        }

        const geojson = {
            type: 'FeatureCollection',
            features: results.map(row => ({
                type: 'Feature',
                properties: {
                    id: row.id,
                    kecamatan: row.kecamatan,
                    kode_faskes: row.kode_faskes,
                    nama_klinik: row.nama_klinik,
                    alamat: row.alamat
                },
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(row.longitude), parseFloat(row.latitude)]
                }
            }))
        };

        res.json(geojson);
    });
});

// API endpoint to add a new clinic
app.post('/api/klinik', (req, res) => {
    const { kecamatan, kode_faskes, nama_klinik, alamat, longitude, latitude } = req.body;
    if (!nama_klinik || !alamat || !longitude || !latitude) {
        return res.status(400).json({ error: 'Data tidak lengkap.' });
    }
    const query = 'INSERT INTO klinik (kecamatan, kode_faskes, nama_klinik, alamat, longitude, latitude) VALUES (?, ?, ?, ?, ?, ?)';
    db.query(query, [kecamatan || '', kode_faskes || '', nama_klinik, alamat, longitude, latitude], (err, results) => {
        if (err) {
            console.error('Error saving clinic:', err);
            return res.status(500).json({ error: 'Failed to save clinic' });
        }
        res.status(201).json({ message: 'Klinik berhasil ditambahkan', id: results.insertId });
    });
});

// API endpoint to update a clinic
app.put('/api/klinik/:id', (req, res) => {
    const klinikId = req.params.id;
    const { kecamatan, kode_faskes, nama_klinik, alamat, longitude, latitude } = req.body;
    
    if (!nama_klinik || !alamat || !longitude || !latitude) {
        return res.status(400).json({ error: 'Data tidak lengkap.' });
    }

    const query = 'UPDATE klinik SET kecamatan = ?, kode_faskes = ?, nama_klinik = ?, alamat = ?, longitude = ?, latitude = ? WHERE id = ?';
    db.query(query, [kecamatan || '', kode_faskes || '', nama_klinik, alamat, longitude, latitude, klinikId], (err, results) => {
        if (err) {
            console.error('Error updating clinic:', err);
            return res.status(500).json({ error: 'Failed to update clinic' });
        }
        res.json({ message: 'Klinik berhasil diperbarui' });
    });
});

// API endpoint to delete a clinic
app.delete('/api/klinik/:id', (req, res) => {
    const klinikId = req.params.id;
    const query = 'DELETE FROM klinik WHERE id = ?';
    
    db.query(query, [klinikId], (err, results) => {
        if (err) {
            console.error('Error deleting clinic:', err);
            return res.status(500).json({ error: 'Failed to delete clinic' });
        }
        res.json({ message: 'Klinik berhasil dihapus' });
    });
});

// API endpoint to get reviews for a specific clinic
app.get('/api/ulasan/:klinik_id', (req, res) => {
    const klinikId = req.params.klinik_id;
    const query = 'SELECT * FROM ulasan WHERE klinik_id = ? ORDER BY tanggal DESC';

    db.query(query, [klinikId], (err, results) => {
        if (err) {
            console.error('Error fetching reviews:', err);
            res.status(500).json({ error: 'Failed to fetch reviews' });
            return;
        }
        res.json(results);
    });
});

// API endpoint to add a new review
app.post('/api/ulasan', upload.single('foto'), (req, res) => {
    const { klinik_id, nama, rating, komentar } = req.body;
    const foto = req.file ? req.file.filename : null;

    if (!klinik_id || !nama || !rating) {
        return res.status(400).json({ error: 'Data tidak lengkap. Harap isi nama dan rating.' });
    }

    const query = 'INSERT INTO ulasan (klinik_id, nama, rating, komentar, foto) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [klinik_id, nama, rating, komentar, foto], (err, results) => {
        if (err) {
            console.error('Error saving review:', err);
            res.status(500).json({ error: 'Failed to save review' });
            return;
        }
        res.status(201).json({ message: 'Ulasan berhasil disimpan', id: results.insertId, foto: foto });
    });
});

// API endpoint to update a review
app.put('/api/ulasan/:id', (req, res) => {
    const ulasanId = req.params.id;
    const { rating, komentar } = req.body;

    if (!rating) {
        return res.status(400).json({ error: 'Rating harus diisi.' });
    }

    const query = 'UPDATE ulasan SET rating = ?, komentar = ? WHERE id = ?';
    db.query(query, [rating, komentar, ulasanId], (err, results) => {
        if (err) {
            console.error('Error updating review:', err);
            res.status(500).json({ error: 'Failed to update review' });
            return;
        }
        res.json({ message: 'Ulasan berhasil diperbarui' });
    });
});

// API endpoint to delete a review
app.delete('/api/ulasan/:id', (req, res) => {
    const ulasanId = req.params.id;

    // First find if there's a photo to delete
    db.query('SELECT foto FROM ulasan WHERE id = ?', [ulasanId], (err, results) => {
        if (!err && results.length > 0 && results[0].foto) {
            const photoPath = path.join(__dirname, 'uploads', results[0].foto);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }
        
        // Then delete the record
        const deleteQuery = 'DELETE FROM ulasan WHERE id = ?';
        db.query(deleteQuery, [ulasanId], (err, deleteResults) => {
            if (err) {
                console.error('Error deleting review:', err);
                res.status(500).json({ error: 'Failed to delete review' });
                return;
            }
            res.json({ message: 'Ulasan berhasil dihapus' });
        });
    });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
