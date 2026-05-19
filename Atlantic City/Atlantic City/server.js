const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

// Database setup
const db = new sqlite3.Database('./casino.db', (err) => {
  if (err) console.error(err.message);
  console.log('Conectado a la base de datos SQLite.');
});

// Create tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    dni TEXT PRIMARY KEY,
    nombre TEXT,
    edad INTEGER,
    telefono TEXT,
    correo TEXT UNIQUE,
    contrasena TEXT,
    segmento TEXT DEFAULT 'estandar',
    saldo REAL DEFAULT 100.0
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS quejas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    tipo TEXT,
    descripcion TEXT,
    fecha TEXT,
    status TEXT DEFAULT 'Pendiente'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS recargas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dni TEXT,
    monto REAL,
    descripcion TEXT,
    foto TEXT,
    fecha TEXT,
    status TEXT DEFAULT 'Pendiente'
  )`);

  // Seed admin if needed (conceptual, as admin is hardcoded in script.js for simplicity)
});

// Routes
app.get('/api/clientes', (req, res) => {
  db.all("SELECT * FROM clientes", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/clientes/:dni', (req, res) => {
  db.get("SELECT * FROM clientes WHERE dni = ?", [req.params.dni], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Cliente no encontrado" });
    res.json(row);
  });
});

app.post('/api/clientes', (req, res) => {
  const { dni, nombre, edad, telefono, correo, contrasena, segmento } = req.body;
  const sql = `INSERT INTO clientes (dni, nombre, edad, telefono, correo, contrasena, segmento, saldo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(sql, [dni, nombre, edad, telefono, correo, contrasena, segmento || 'estandar', 100.0], function(err) {
    if (err) return res.status(400).json({ error: "El DNI o correo ya existen." });
    res.json({ id: this.lastID, message: "Cliente registrado con éxito." });
  });
});

app.put('/api/clientes/:dni/saldo', (req, res) => {
  const { saldo } = req.body;
  const sql = `UPDATE clientes SET saldo = ? WHERE dni = ?`;
  db.run(sql, [saldo, req.params.dni], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Saldo actualizado." });
  });
});

app.delete('/api/clientes/:dni', (req, res) => {
  db.run("DELETE FROM clientes WHERE dni = ?", req.params.dni, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Cliente eliminado." });
  });
});

app.get('/api/quejas', (req, res) => {
  db.all("SELECT * FROM quejas ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/recargas', (req, res) => {
  const { dni, monto, descripcion, foto, fecha } = req.body;
  const sql = `INSERT INTO recargas (dni, monto, descripcion, foto, fecha) VALUES (?, ?, ?, ?, ?)`;
  db.run(sql, [dni, monto, descripcion, foto, fecha], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: 'Solicitud de recarga recibida.' });
  });
});

app.get('/api/recargas', (req, res) => {
  db.all("SELECT * FROM recargas ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/recargas/:id/status', (req, res) => {
  const { status } = req.body;
  const id = req.params.id;

  db.get('SELECT * FROM recargas WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Recarga no encontrada' });

    if (row.status !== 'Pendiente') {
      return res.status(400).json({ error: 'Solicitud ya procesada' });
    }

    db.run('UPDATE recargas SET status = ? WHERE id = ?', [status, id], function(err) {
      if (err) return res.status(500).json({ error: err.message });

      if (status === 'Aprobado') {
        db.get('SELECT saldo FROM clientes WHERE dni = ?', [row.dni], (err, cliente) => {
          if (err) return res.status(500).json({ error: err.message });
          const nuevoSaldo = (cliente?.saldo || 0) + row.monto;
          db.run('UPDATE clientes SET saldo = ? WHERE dni = ?', [nuevoSaldo, row.dni], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Recarga aprobada y saldo actualizado.' });
          });
        });
      } else {
        res.json({ message: 'Recarga rechazada.' });
      }
    });
  });
});

app.post('/api/quejas', (req, res) => {
  const { nombre, tipo, descripcion, fecha } = req.body;
  const sql = `INSERT INTO quejas (nombre, tipo, descripcion, fecha) VALUES (?, ?, ?, ?)`;
  db.run(sql, [nombre, tipo, descripcion, fecha], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, message: "Queja enviada." });
  });
});

app.delete('/api/quejas/:id', (req, res) => {
  db.run("DELETE FROM quejas WHERE id = ?", req.params.id, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Queja archivada." });
  });
});

app.listen(port, () => {
  console.log(`Servidor de Casino ejecutándose en http://localhost:${port}`);
});
