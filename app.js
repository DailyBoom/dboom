var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var passport = require('passport');
var validate = require('form-validate');
var config = require("config-heroku");
var moment = require("moment");
var crypto = require('crypto');
var sitemap = require('express-sitemap')({url: 'dailyboom.co'});
var i18n = require('i18n');
i18n.configure({
    defaultLocale: 'ko',
    locales: ['ko', 'en', 'vi'],
    directory: path.join(__dirname, 'locales'),
    cookie: 'dboom_locale'
});
var app = express();

var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var LocalStrategy = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var KakaoStrategy = require('passport-kakao').Strategy;
var RememberMeStrategy = require('passport-remember-me').Strategy;
var mongoose = require('mongoose');
mongoose.connect('mongodb://heroku_p56bmdfp:o8m3es0g4d@ds025429.mlab.com:25429/heroku_p56bmdfp');
var paginate = require('express-paginate');
var device = require('express-device');
var User = require('./models/user');
var Token = require('./models/token');
var Coupon = require('./models/coupon');
var Order = require('./models/order');
//var materialize = require('materialize-css');

var routes = require('./routes/index');
var users = require('./routes/users');
var products = require('./routes/products');
var orders = require('./routes/orders');
var partners = require('./routes/partners');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'vash');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
var validateOptions = {
  i18n: {
    defaultLocale: 'ko',
    directory: path.join(__dirname, 'locales')
  }
}
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser('keyboard cat'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(device.capture());
device.enableDeviceHelpers(app)
app.use(session({ store: new MongoStore({ mongooseConnection: mongoose.connection }), secret: 'keyboard cat', name: 'session_id', saveUninitialized: true, resave: true })); // store: new RedisStore({ host: '127.0.0.1',  port: 6379 }),
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(validate(app, validateOptions))
app.use(paginate.middleware(10, 50));
app.use(i18n.init);
//app.use(i18n.middleware());

passport.use(new RememberMeStrategy(
  function (token_id, done) {
    Token.findOne({ _id: token_id }, function(err, token) {
      if (err) return done(err);
      if (!token) { return done(null, false); }
      token.consume(token.token, function (err, user) {
        if (err) { return done(err); }
        if (!user) { return done(null, false); }
        return done(null, user);
      });
    });
  },
  function(user, done) {
    var token = new Token({
      token: crypto.randomBytes(64).toString('hex'),
      userId: user._id
    })
    token.save(function(err) {
      if (err) { return done(err); }
      return done(null, token);
    });
  }
));

app.use(passport.initialize());
app.use(passport.session());
app.use(passport.authenticate('remember-me'));
// if (app.get('env') === 'production') {
//   app.listen(3000);
// }
// else {
//   app.listen(3000);    
mongoose.set('debug', true);
// }
app.use(function(req, res, next) {
  console.log(i18n.getLocale(res));
  if (req.query.lang) {
    res.cookie('dboom_locale', req.query.lang, { maxAge: 900000, httpOnly: true });
    i18n.setLocale(req, req.query.lang);
  }
  else if (!req.cookies.dboom_locale) {
    i18n.setLocale(req, 'ko');
  }
  res.locals.user = req.user;
  moment.locale('ko');
  res.locals.moment = moment;
  res.locals.url = req.url;
  if (req.session.cart_order) {
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product').exec(function(err, order) {
      res.locals.cart = order.cart;
      next();
    });
  }
  else
    next();
});
app.use('/', users);
app.use('/', orders);
app.use('/', routes);
app.use('/', products);
app.use('/', partners);

if (app.get('env') === 'production') {
  sitemap.generate4(app, ['/']);
  sitemap.XMLtoFile('./public/sitemap/sitemap.xml');
}

passport.use(new LocalStrategy(
  function (username, password, done) {
    User.findOne({ username: username }, function (err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      user.comparePassword(password, function(err, isMatch) {
        if (err) { return done(err); }
        if (isMatch === false) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        else {
          return done(null, user);
        }
      });
    });
  }
));

passport.use(new FacebookStrategy({
    clientID: config.Facebook.clientID,
    clientSecret: config.Facebook.clientSecret,
    callbackURL: config.Facebook.callbackURL,
    profileFields: ['id', 'displayName'],
    passReqToCallback: true
  },
  function(req, accessToken, refreshToken, profile, done) {
     //check user table for anyone with a facebook ID of profile.id
      User.findOne({
          'facebookId': profile.id
      }, function(err, user) {
          if (err) {
              return done(err);
          }
          //No user was found... so create a new user with values from Facebook (all the profile. stuff)
          if (!user) {
              console.log(profile);
              user = new User({
                  name: profile.displayName,
                  email: profile.email,
                  username: 'DBU'+profile.id,
                  role: 'user',
                  //now in the future searching on User.findOne({'facebook.id': profile.id } will match because of this next line
                  facebookId: profile.id
              });
              user.save(function(err) {
                if (err) console.log(err);
                return done(err, user);
              });
          } else {
              //found user. Return
              return done(err, user);
          }
      });
  }
));

passport.use(new KakaoStrategy({
    clientID : config.Kakao.clientID,
    callbackURL : config.Kakao.callbackURL,
    passReqToCallback: true    
  },
  function(req, accessToken, refreshToken, profile, done){
     //check user table for anyone with a facebook ID of profile.id
      User.findOne({
          'kakaoId': profile.id
      }, function(err, user) {
          if (err) {
              return done(err);
          }
          //No user was found... so create a new user with values from Facebook (all the profile. stuff)
          if (!user) {
              user = new User({
                  name: profile.username,
                  username: 'DBU'+profile.id,
                  role: 'user',
                  //now in the future searching on User.findOne({'facebook.id': profile.id } will match because of this next line
                  kakaoId: profile.id
              });
              user.save(function(err) {
                if (err) console.log(err);
                return done(err, user);
              });
          } else {
              //found user. Return
              return done(err, user);
          }
      });
  }
));

passport.serializeUser(function(user, done) {
  done(null, user._id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  res.render('error_404');
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  console.log(err);
  res.status(err.status || 500);
  res.render('error_500', {
    message: err.message,
    error: {}
  });
});


module.exports = app;
