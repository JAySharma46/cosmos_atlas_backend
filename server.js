const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db'); // pg Pool

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;


// Root Check
app.get('/', (req, res) => {
  res.send('Cosmos Atlas API Running');
});


// ALL EVENTS — ORDERED BY TIME
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


// TOP-LEVEL EVENTS ONLY (NO PARENT)
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
    res.status(500).json({ error: 'Database Error' });
  }
});


// 🔗 RELATED EVENTS (from event_relation table)
app.get('/events/:eventId/related', async (req, res) => {
  const { eventId } = req.params;
  try {
    // Get related events from both directions (event_id → related_event_id and vice versa)
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


// START SERVER
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});