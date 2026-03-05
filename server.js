const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const passwordValidator = require('password-validator');
const db = require('./db'); // PostgreSQL pool for events (existing)

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========== PASSWORD STRENGTH RULES ==========
const passwordSchema = new passwordValidator();
passwordSchema
    .is().min(8)
    .has().uppercase()
    .has().lowercase()
    .has().digits()
    .has().symbols();

// ========== SUPABASE CLIENT ==========
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// ========== MULTER ==========
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(file.originalname.toLowerCase().split('.').pop());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

// ========== CONSTANTS ==========
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ========== ROOT ==========
app.get('/', (req, res) => {
  res.send('Cosmos Atlas API Running');
});

// ---------- EVENT ROUTES (unchanged) ----------
app.get('/events', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM timeline_event ORDER BY time_start_years ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database Error' });
  }
});

app.get('/events/top', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM timeline_event WHERE parent_event_id IS NULL ORDER BY time_start_years ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database Error' });
  }
});

app.get('/events/children/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await db.query(
      'SELECT * FROM timeline_event WHERE parent_event_id = $1 ORDER BY time_start_years ASC',
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database Error' });
  }
});

app.get('/events/:eventId/related', async (req, res) => {
  const { eventId } = req.params;
  try {
    const result = await db.query(
      `SELECT DISTINCT e.*
       FROM timeline_event e
       JOIN event_relation r ON (e.event_id = r.related_event_id AND r.event_id = $1)
                             OR (e.event_id = r.event_id AND r.related_event_id = $1)
       WHERE e.event_id != $1
       ORDER BY e.time_start_years ASC`,
      [eventId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching related events:', err);
    res.status(500).json({ error: 'Database Error' });
  }
});

// ========== AUTHENTICATION ==========
// USER LOGIN
app.post('/auth/user/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('user_id, email, password, created_at')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.user_id, email: user.email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, role: 'user' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN LOGIN
app.post('/auth/admin/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('admin_id, email, password, created_at')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: 'Invalid admin email or password' });
    }

    const valid = await bcrypt.compare(password, admin.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid admin email or password' });
    }

    const token = jwt.sign(
      { adminId: admin.admin_id, email: admin.email, role: 'admin' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, role: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== DIRECT REGISTRATION (NO OTP) ==========
app.post('/auth/register', upload.single('avatar'), async (req, res) => {
  const { email, username, password } = req.body;
  const avatarFile = req.file;

  if (!email || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if email already exists
    const { data: existingEmail, error: emailError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingEmail) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Check if username already exists
    const { data: existingUsername, error: usernameError } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUsername) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Validate password strength
    if (!passwordSchema.validate(password)) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.'
      });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Upload avatar if provided
    let avatarUrl = null;
    if (avatarFile) {
      const fileName = `avatar_${Date.now()}_${avatarFile.originalname}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile.buffer, {
          contentType: avatarFile.mimetype,
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        console.error('Avatar upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload avatar' });
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      avatarUrl = urlData.publicUrl;
    }

    // Insert user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email,
        username,
        password: passwordHash,
        avatar_url: avatarUrl
      })
      .select()
      .single();

    if (insertError) {
      console.error('User insert error:', insertError);
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: newUser.user_id, email: newUser.email, role: 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      role: 'user',
      user: { id: newUser.user_id, email: newUser.email, username: newUser.username, avatarUrl: newUser.avatar_url }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== START SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});