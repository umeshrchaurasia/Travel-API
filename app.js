//require('newrelic');

var express = require('express');

var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var lessMiddleware = require('less-middleware');
var web = require('./routes/web');
var users = require('./routes/users');
var api = require('./routes/api');

var base=require('./controller/baseController');
var logger=require('./bin/Logger');
var wrapper = require('./controller/wrapper');

var cors=require("cors")
require('dotenv').config(); 


var app = express();

app.use(cors());

var con=require('./bin/dbconnection.js');

 
// set view engine to php-express
app.set('views', './views');

// uncomment after placing your favicon in /public
app.use(favicon(path.join(__dirname, 'public/images/icon', '1.png')));

app.use(bodyParser.urlencoded({limit: "5mb",extended: false}));
app.use(bodyParser.json({ limit: '5mb' }));

app.use(cookieParser());
app.use(lessMiddleware(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

var requestAccess = function (req, res, next) {
  token=req.header("token") ;

  //console.log(user + " "+pwd);
  if(token==="1234567890"){
      next();
  }else{
        base.send_response("Not Authorized",null, res);
  }
  
};


app.use('/', web);
app.use('/users', users);
app.use('/api',requestAccess, api);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
 
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);

  logger.error('error', err.status, err.message);
  res.send({Message: "Fatal error !!! " + err.status + ": "+err.message, Status: "Failure", StatusNo: 1, MasterData: null});
});



// Make uploads directory public (add this after your middleware setup but before routes)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

module.exports = app;
