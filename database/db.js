const mysql = require('mysql');

const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'web_computing'
});

connection.connect(function (err) {
    if (err) throw err;
    console.log("DB connect successfully.")
})

module.exports = (req, res, next) => {
    req.db = connection;
    next();
}