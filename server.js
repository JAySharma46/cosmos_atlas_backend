const express = require('express');
const cors = require('cors');
require('dotenv').config();

const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
  res.send('Cosmos Atlas API Running');
});

app.get('/events', (req, res) => {
  db.query('SELECT * FROM timeline_event', (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Database Error' });
    }
    res.json(results);
  });
});


app.get('/events/top', (req, res) => {
  db.query(
    'SELECT * FROM timeline_event WHERE parent_event_id IS NULL ORDER BY time_start_years ASC',
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});


app.get('/events/children/:id', (req, res) => {
  const id = req.params.id;

  db.query(
    'SELECT * FROM timeline_event WHERE parent_event_id = ? ORDER BY time_start_years ASC',
    [id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results);
    }
  );
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

