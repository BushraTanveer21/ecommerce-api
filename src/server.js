const app    = require('./app');
const { initDB } = require('./db');

const PORT = process.env.PORT || 3000;

(async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`E-commerce API listening on port ${PORT}`);
  });
})();