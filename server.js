
// Module dependencies.

var express = require('express'),
    http = require('http'),
    path = require('path')
    ;

var app = express();

// apply to all environments
app.set('port', process.env.PORT || 4000);
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);

app.use(function(req, res, next) {
    req.headers['if-none-match'] = 'no-match-for-this';
    next();
});

// setup static content directory
app.use(express.static(path.join(__dirname, 'public')));

// errors in development environment only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/',function(req, res){
    res.redirect('/index.html');
    //res.sendfile(__dirname + '/public/html/app.html');
});



// initialize express framework server
http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
