function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  const status = err.status || 500;
  const message = status < 500 ? err.message : 'Error interno del servidor';
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
