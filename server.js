const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

// Import Firebase modules
const { initializeApp } = require("firebase/app");
const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDXxgwIPN1LtRrYAfIfGjBW0NJdXsso7BY",
  authDomain: "tradex-1126f.firebaseapp.com",
  databaseURL: "https://tradex-1126f-default-rtdb.firebaseio.com",
  projectId: "tradex-1126f",
  storageBucket: "tradex-1126f.firebasestorage.app",
  messagingSenderId: "973958868405",
  appId: "1:973958868405:web:ea7f63dcd8d4b262817dfc",
  measurementId: "G-J538LHEWL6"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const expressApp = express();
const PORT = 5000;
const SECRET_KEY = 'your-secret-key-change-in-production';

expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));
expressApp.use(cookieParser());
expressApp.use(express.static('public'));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const getUploadStorage = (subdomain) => {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const userDir = path.join(uploadsDir, subdomain);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
      cb(null, userDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });
};

const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

expressApp.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
    const result = stmt.run(email, hashedPassword);

    res.json({ message: 'Registration successful', userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists' });
  }
});

expressApp.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!user) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password);

  if (!validPassword) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '7d' });

  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ message: 'Login successful', user: { id: user.id, email: user.email } });
});

expressApp.get('/api/check-subdomain/:subdomain', (req, res) => {
  const { subdomain } = req.params;
  const domain = db.prepare('SELECT * FROM domains WHERE subdomain = ?').get(subdomain);

  res.json({ available: !domain });
});

expressApp.post('/api/claim-subdomain', authMiddleware, (req, res) => {
  const { subdomain, extension } = req.body;

  if (!subdomain || !/^[a-z0-9-]+$/.test(subdomain)) {
    return res.status(400).json({ error: 'Invalid subdomain format' });
  }

  const validExtension = extension || '.com';

  try {
    const stmt = db.prepare('INSERT INTO domains (user_id, subdomain, extension) VALUES (?, ?, ?)');
    stmt.run(req.user.id, subdomain, validExtension);

    const userDir = path.join(uploadsDir, subdomain);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    res.json({ message: 'Subdomain claimed successfully', subdomain, extension: validExtension });
  } catch (err) {
    res.status(400).json({ error: 'Subdomain already taken' });
  }
});

expressApp.get('/api/my-domain', authMiddleware, (req, res) => {
  const domain = db.prepare('SELECT * FROM domains WHERE user_id = ?').get(req.user.id);
  res.json({ domain });
});

expressApp.post('/api/upload', authMiddleware, async (req, res) => {
  const domain = db.prepare('SELECT * FROM domains WHERE user_id = ?').get(req.user.id);

  if (!domain) {
    return res.status(400).json({ error: 'No domain claimed' });
  }

  const upload = multer({ storage: getUploadStorage(domain.subdomain) }).array('files', 10);

  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: 'Upload failed', details: err.message });
    }

    const files = req.files;
    const fileStmt = db.prepare('INSERT INTO files (domain_id, filename, filepath) VALUES (?, ?, ?)');

    for (const file of files) {
      try {
        const storageRef = ref(storage, `${domain.subdomain}/${file.originalname}`);
        const snapshot = await uploadBytes(storageRef, file.buffer);
        const downloadURL = await getDownloadURL(snapshot.ref);

        // Save file info to local database (optional, depending on your needs)
        // fileStmt.run(domain.id, file.originalname, downloadURL);

        console.log(`Uploaded ${file.originalname} to Firebase Storage at ${downloadURL}`);
      } catch (firebaseErr) {
        console.error(`Error uploading ${file.originalname} to Firebase:`, firebaseErr);
        // Decide how to handle Firebase upload errors: skip, retry, report to user, etc.
        // For now, we'll just log it and continue with other files.
      }
    }

    res.json({ message: 'Files processed', count: files.length });
  });
});


expressApp.get('/api/files', authMiddleware, (req, res) => {
  const domain = db.prepare('SELECT * FROM domains WHERE user_id = ?').get(req.user.id);

  if (!domain) {
    return res.json({ files: [] });
  }

  const files = db.prepare('SELECT * FROM files WHERE domain_id = ?').all(domain.id);
  res.json({ files });
});

expressApp.delete('/api/files/:filename', authMiddleware, (req, res) => {
  const { filename } = req.params;
  const domain = db.prepare('SELECT * FROM domains WHERE user_id = ?').get(req.user.id);

  if (!domain) {
    return res.status(400).json({ error: 'No domain claimed' });
  }

  const file = db.prepare('SELECT * FROM files WHERE domain_id = ? AND filename = ?').get(domain.id, filename);

  if (file) {
    // In a Firebase-integrated system, you'd also delete from Firebase Storage here.
    // For now, we'll just delete from the local database.
    db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
    res.json({ message: 'File record deleted' }); // Modified message for clarity
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

expressApp.use((req, res, next) => {
  const pathParts = req.path.split('/').filter(p => p);

  if (pathParts.length === 0 || pathParts[0] === 'api') {
    return next();
  }

  const possibleSubdomain = pathParts[0];
  const domain = db.prepare('SELECT * FROM domains WHERE subdomain = ?').get(possibleSubdomain);

  if (!domain) {
    return next();
  }

  if (pathParts.length === 1) {
    const indexPath = path.join(uploadsDir, possibleSubdomain, 'index.html');

    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    } else {
      return res.send('<h1>Welcome to ' + possibleSubdomain + '</h1><p>Upload your website files to get started!</p>');
    }
  }

  const filePath = pathParts.slice(1).join('/');
  const fullPath = path.resolve(path.join(uploadsDir, possibleSubdomain, filePath));
  const allowedDir = path.resolve(path.join(uploadsDir, possibleSubdomain));

  if (!fullPath.startsWith(allowedDir + path.sep) && fullPath !== allowedDir) {
    return res.status(403).send('Forbidden');
  }

  if (fs.existsSync(fullPath)) {
    return res.sendFile(fullPath);
  } else {
    return res.status(404).send('File not found');
  }
});

expressApp.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});