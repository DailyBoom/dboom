var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var passport = require('passport');
var validate = require('form-validate');
var config = require("config-heroku");
var moment = require("moment-timezone");
var crypto = require('crypto');
var sm = require('sitemap');
var i18n = require('i18n');
var querystring = require('querystring');
i18n.configure({
    defaultLocale: 'vi',
    locales: ['ko', 'en', 'vi'],
    directory: path.join(__dirname, 'locales'),
    cookie: 'dboom_locale'
});
var app = express();

var session = require('express-session');
var MongoStore = require('connect-mongo')(session);
var LocalStrategy = require('passport-local').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var RememberMeStrategy = require('passport-remember-me').Strategy;
var mongoose = require('mongoose');
mongoose.connect('mongodb://dailyboom:Dailyboom1!@ds025429.mlab.com:25429/heroku_p56bmdfp');
var paginate = require('express-paginate');
var device = require('express-device');
var User = require('./models/user');
var Token = require('./models/token');
var Coupon = require('./models/coupon');
var Order = require('./models/order');
var Product = require('./models/product');
var Article = require('./models/article');
//var materialize = require('materialize-css');

var routes = require('./routes/index');
var users = require('./routes/users');
var products = require('./routes/products');
var orders = require('./routes/orders');
var partners = require('./routes/partners');
var admin = require('./routes/admin');
var shipments = require('./routes/shipments');

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'vash');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
var validateOptions = {
  i18n: {
    defaultLocale: 'vi',
    directory: path.join(__dirname, 'locales')
  }
}
app.use(logger('dev'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser('keyboard cat'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(device.capture());
device.enableDeviceHelpers(app)
app.use(session({ store: new MongoStore({ mongooseConnection: mongoose.connection }), secret: 'keyboard cat', name: 'session_id', saveUninitialized: true, resave: true })); // store: new RedisStore({ host: '127.0.0.1',  port: 6379 }),
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/bower', express.static(__dirname + '/bower_components/'));
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
app.listen(process.env.PORT || 3000);
mongoose.set('debug', true);
// }
app.use(function(req, res, next) {
  res.locals.user = req.user;
  moment.locale('vi');
  i18n.setLocale(req, 'vi');
  res.locals.moment = moment;
  res.locals.querystring = querystring;
  res.locals.url = req.url;
  if (req.query.zone) {
    req.session.zone = req.query.zone;
    res.cookie('ypp_zone', req.query.zone, { maxAge: 31536000000, httpOnly: true, path: '/' });
  }
  if (typeof req.session.zone === 'undefined' && req.cookies.ypp_zone) {
    req.session.zone = req.cookies.ypp_zone
  }
  if (typeof res.locals.zone === 'undefined' && req.session.zone) {
    res.locals.zone = req.session.zone;
  }
  if (req.session.toast) {
    res.locals.toast = req.session.toast;
    delete req.session.toast;
  }
  if (req.session.cart_order) {
    Order.findOne({ _id: req.session.cart_order }).populate('cart.product').exec(function(err, order) {
      if (order) {
        res.locals.cart = order.cart;
        res.locals.cart_total = 0;      
        order.cart.forEach(function(item) {
          if (item.product != null) {
              res.locals.cart_total += item.product.price * item.quantity;
          }
        });
      }
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
app.use('/', admin);
app.use('/', shipments);

if (app.get('env') === 'production') {
  sitemap = sm.createSitemap({
    hostname: 'http://yppuna.vn',
    cacheTime: 600000,        // 600 sec - cache purge period 
    urls: [
      { url: '/', priority: 0.7 },
      { url: '/mall', priority: 0.9 },
      { url: '/mall?group=0', priority: 0.7 },
      { url: '/mall?group=1', priority: 0.7 },
      { url: '/mall?group=2', priority: 0.7 },
      { url: '/mall/new', priority: 0.9 },
      { url: '/blog', priority: 0.9 },
      { url: '/blog/video', priority: 0.8 },
      { url: '/home?zone=0',  changefreq: 'monthly',  priority: 1 },
      { url: '/home?zone=1',  changefreq: 'monthly',  priority: 1 },
      { url: '/home?zone=2',  changefreq: 'monthly',  priority: 1 },
      { url: '/about' },
      { url: '/brands' },
      { url: '/wholesale' },
      { url: '/contact' },
      { url: '/terms' }
    ]
  });
  Product.find({ is_published: true, extend: 3, scheduled_at: moment().date(1).hour(0).minute(0).second(0).millisecond(0) }, 'url', function(err, products) {
    products.forEach(function(product) {
      sitemap.add({ url: '/shop/box/'+product.url })
    });
  });
  Product.find({ is_published: true, extend: 4 }, 'url', function(err, products) {
    products.forEach(function(product) {
      sitemap.add({ url: '/shop/products/'+product.url })
    });
  });
  Article.find({ published: true }, 'url', function(err, articles) {
    articles.forEach(function(article) {
      sitemap.add({ url: '/blog/'+article.url })
    });
  });
}

app.get('/sitemap.xml', function(req, res) {
  res.header('Content-Type', 'application/xml');
  res.send( sitemap.toString() );
});

passport.use(new LocalStrategy({ 
    usernameField: 'email',
    passReqToCallback: true 
  },
  function (req, email, password, done) {
    User.findOne({ email: email }, function (err, user) {
      if (err) { console.log(err); return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect email.' });
      }
      user.comparePassword(password, function(err, isMatch) {
        if (err) { return done(err); }
        if (isMatch === false) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        else {
          // if (moment().isAfter(user.last_connec, 'day')) {
          //   if (user.wallet < 2500) {
          //     user.wallet += 100;
          //     req.session.toast = "100원 적립되었습니다!";
          //   }
          //   if (user.wallet >= 2500) {
          //     req.session.toast = "최대 적립금액에 도달했습니다.";              
          //   }
          // }
          user.last_connec = moment();
          user.save(function(err) {
            if (err)
              console.log(err);
            return done(null, user);
          });
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
    enableProof: true,
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
                  //email: profile.emails[0].value,
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
            // if (moment().isAfter(user.last_connec, 'day')) {
            //   if (user.wallet < 2500) {
            //     user.wallet += 100;
            //     req.session.toast = "100원 적립되었습니다!";
            //   }
            //   if (user.wallet >= 2500) {
            //     req.session.toast = "최대 적립금액에 도달했습니다.";              
            //   }
            // }
            user.last_connec = moment();
            user.save(function(err) {
              if (err)
                console.log(err);
              return done(err, user);
            });
          }
      });
  }
));

passport.use(new GoogleStrategy({
    clientID : config.Google.clientID,
    clientSecret: config.Google.clientSecret,
    callbackURL : config.Google.callbackURL,
    passReqToCallback: true    
  },
  function(req, accessToken, refreshToken, profile, done){
     //check user table for anyone with a facebook ID of profile.id
     console.log(profile);
      User.findOne({
          'googleId': profile.id
      }, function(err, user) {
          if (err) {
              return done(err);
          }
          //No user was found... so create a new user with values from Facebook (all the profile. stuff)
          if (!user) {
              user = new User({
                  name: profile.displayName,
                  username: 'DBU'+profile.id,
                  role: 'user',
                  email: profile.emails[0].value,
                  //now in the future searching on User.findOne({'facebook.id': profile.id } will match because of this next line
                  googleId: profile.id
              });
              user.save(function(err) {
                if (err) {
                  
                  console.log(err);
                }
                return done(err, user);
              });
          } else {
              //found user. Return
            // if (moment().isAfter(user.last_connec, 'day')) {
            //   if (user.wallet < 2500) {
            //     user.wallet += 100;
            //     req.session.toast = "100원 적립되었습니다!";
            //   }
            //   if (user.wallet >= 2500) {
            //     req.session.toast = "최대 적립금액에 도달했습니다.";              
            //   }
            // }
            user.last_connec = moment();
            user.save(function(err) {
              if (err)
                console.log(err);
              return done(err, user);
            });
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
