const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');   // this is the pg Pool now

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Cosmos Atlas API Running');
});

// GET ALL EVENTS
app.get('/events', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM timeline_event');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database Error' });
  }
});

// TOP LEVEL EVENTS
app.get('/events/top', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM timeline_event WHERE parent_event_id IS NULL ORDER BY time_start_years ASC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json(err);
  }
});

// CHILD EVENTS
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
    res.status(500).json(err);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
