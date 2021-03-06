const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const helmet = require("helmet");
const mysql = require("mysql");
const db = require("./database/db");
const jwt = require("jsonwebtoken");
const swaggerUI = require("swagger-ui-express");
const swaggerDoc = require("./docs/swaggerdoc.json");

var app = express();

// // view engine setup
// app.set('views', path.join(__dirname, 'views'));
// app.set('view engine', 'jade');

//allow custom header and CORS
app.all('*', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type,Content-Length, Authorization, Accept,X-Requested-With");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By", ' 3.2.1')
  if (req.method == "OPTIONS") res.send(200);
  else next();
});


app.use(db);
app.use(helmet());
app.use(logger("dev"));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: false
  })
);

/** Authentication **/

//Registers a new user account
app.post("/register", function (req, resp) {
  console.log(req.body);
  req.db.query(
    `select * from users where email = ?`,
    [req.body.email],
    function (err, result) {
      if (err) {
        console.log(resp.status(500).json)
        resp.status(500).json({
          error: err
        });
        return;
      }
      if (result.length != 0) {
        resp.status(400).json({
          message: "oops! It looks like that user already exists :("
        });
        return;
      }

      req.db.query(
        `insert into users set email = '${
                    req.body.email
                }', password = '${
                    req.body.password
                }', created_at = current_timestamp, updated_at = current_timestamp`,
        function (err) {
          if (err) {
            resp.status(500).josn({
              error: err
            });
            return;
          }
          resp.status(201).json({
            message: "yay! you've successfully registered your user account :)"
          });
        }
      );
    }
  );
});

//Login with an existing user account
app.post("/login", function (req, resp) {
  req.db.query(
    `select * from users where email = ?`,
    [req.body.email],
    function (err, result) {
      if (result.length == 0) {
        resp.status(401).json({
          message: "oh no! It looks like there was a database error while creating your user, give it another try..."
        });
      } else if (result[0].password !== req.body.password) {
        resp.status(401).json({
          message: "invalid login - bad password"
        });
      } else {
        var token = jwt.sign({}, "jwtsecret", {
          expiresIn: 86400
        });
        resp.json({
          token: token,
          access_token: token,
          token_type: "Bearer",
          expires_in: 86400
        });
      }
    }
  );
});

/** Search **/

app.get("/search", function (req, resp) {
  //permission check
  var auth = req.headers['authorization'];
  console.log(auth)
  if (!auth) {
    resp.status(401).josn({
      "error": "oops! it looks like you're missing the authorization header"
    });
    return;

  }
  console.log(auth)
  if (auth.split(" ").length != 2 || auth.split(" ")[0] != "Bearer") {
    resp.status(401).josn({
      "message": "oh no! it looks like your authorization token is invalid..."
    });
  }
  console.log(auth)
  jwt.verify(auth[1], "jwtsecret", function (err) {
    if (err) {
      resp.status(401).josn({
        "message": "oh no! it looks like your authorization token is invalid..."
      });
      return;
    }
    //execute query
    if (!req.query.offence) {
      resp.status(400).josn({
        "message": "oops! it looks like you're missing the offence query parm"
      });
      return;
    }

    req.db.query(
      `select offence_columns.column from offence_columns where pretty in (${req.query.offence.split(",").map(i => req.db.escape(i)).join(", ")})`,
      function (err, result) {
        if (err) {
          console.error(e);
          resp.status(500).josn({
            error: err
          });
          return;
        }
        console.log("Search offence_columns: " + JSON.stringify(result));

        var query =
          'select count(o.id) as "total", o.area as "LGA", a.lat, a.lng from offences o, areas a where ';
        var where = ["o.area = a.area"];
        if (where.length == 0) {

        }
        result.map(i => i.column).forEach(i => where.push(`${i} = 1`));

        if (req.query.area) {
          where.push(req.query.area.split(',').map(i => `area = ${req.db.escape(i)}`).join(" or "))
        }
        if (req.query.age) {
          where.push(`age in (${req.query.age.split(",").map(i => req.db.escape(i)).join(", ")})`);
        }
        if (req.query.gender) {
          where.push(`gender in (${req.query.gender.split(",").map(i => req.db.escape(i)).join(", ")})`);
        }
        if (req.query.year) {
          where.push(`year in (${req.query.year.split(",").map(i => req.db.escape(i)).join(", ")})`);
        }
        if (req.query.month) {
          where.push(`month in (${req.query.month.split(",").map(i => req.db.escape(i)).join(", ")})`);
        }
        console.log(where.map(i => i.query))
        query += where.join(" and ") + " group by o.area, a.lat, a.lng";
        console.log("Search sql: " + query);
        var args = [];

        where.forEach(i => {
          if (i.args) args.push(i.args);
        });
        console.log(args);
        req.db.query(query, args, function (err, result) {
          if (err) {
            resp.status(500).json({
              error: err
            });
            return;
          }
          console.log("Search result: " + JSON.stringify(result));
          resp.json({
            query: req.query,
            result
          });
        });
      }
    );

  })
});

/** Helpers **/

app.use("/offences", function (req, resp) {
  req.db.query(
    "select pretty from offence_columns group by pretty order by pretty",
    function (err, result) {
      if (err) {
        resp.status(500).json({
          error: err
        });
        return;
      }
      resp.json({
        offences: result.map(i => i.pretty)
      });
    }
  );
});

app.use("/areas", function (req, resp) {
  req.db.query(
    "select area from offences group by area order by area",
    function (err, result) {
      if (err) {
        resp.status(500).json({
          error: err
        });
        return;
      }
      resp.json({
        areas: result.map(i => i.area)
      });
    }
  );
});

//List of Ages to filter search results by
app.use("/ages", function (req, resp) {
  req.db.query("select age from offences group by age order by age", function (
    err,
    result
  ) {
    if (err) {
      resp.status(500).json({
        error: err
      });
      return;
    }
    resp.json({
      ages: result.map(i => i.age)
    });
  });
});

//List of Genders to filter search results by
app.use("/genders", function (req, resp) {
  //select gender from offences group by gender order by gender;
  req.db.query(
    "select gender from offences group by gender order by gender",
    function (err, result) {
      if (err) {
        resp.status(500).json({
          error: err
        });
        return;
      }
      resp.json({
        genders: result.map(i => i.gender)
      });
    }
  );
});

//List of Years to filter search results by
app.use("/years", function (req, resp) {
  req.db.query(
    "select year from offences group by year order by year",
    function (err, result) {
      if (err) {
        resp.status(500).json({
          error: err
        });
        return;
      }
      resp.json({
        years: result.map(i => i.year)
      });
    }
  );
});

app.use("/", swaggerUI.serve, swaggerUI.setup(swaggerDoc));

module.exports = app;