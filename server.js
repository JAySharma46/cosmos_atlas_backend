const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const db = require('./db'); // pg Pool (still used for events)

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ========== SUPABASE CLIENT (for auth) ==========
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

// Root Check
app.get('/', (req, res) => {
  res.send('Cosmos Atlas API Running');
});

// ---------- EVENT ROUTES (using db pool) ----------
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
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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
      { 
        adminId: admin.admin_id, 
        email: admin.email, 
        role: 'admin' 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, role: 'admin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});