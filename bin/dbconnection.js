// bin/dbconnection.js

const mysql = require('mysql2');
const logger = require('./Logger');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Convert pool to use promises
const promisePool = pool.promise();

// Test connection
promisePool.getConnection()
    .then(connection => {
        logger.info('Database connected successfully');
        connection.release();
    })
    .catch(err => {
        logger.error('Database Connection Failed:', err);
    });

module.exports = promisePool;