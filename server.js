const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json()); // Add support for JSON bodies
app.use(express.static(path.join(__dirname)));
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
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'webgis_faskes_padang'
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
