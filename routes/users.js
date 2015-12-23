var express = require('express');
var router = express.Router();
var passport = require('passport');
var vash = require("vash");
var nodemailer = require('nodemailer');
var moment = require('moment');
var smtpTransport = require('nodemailer-smtp-transport');
var User = require("../models/user");
var Product = require("../models/product");
var Order = require("../models/order");
var Coupon = require("../models/coupon");
var config = require('config');
var i18n = require("i18n");
var Token = require("../models/token");
var crypto = require('crypto');
var fs = require('fs');
var paginate = require('express-paginate');
require('mongoose-pagination');
var transporter = nodemailer.createTransport(smtpTransport({
    host: config.get('Nodemailer.host'),
    auth: {
        user: config.get('Nodemailer.auth.user'),
        pass: config.get('Nodemailer.auth.pass')
    }
}));

var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  res.redirect('/login');
}

router.get('/login', function(req, res, next) {
  if (req.user)
    return res.redirect('/');
  res.render('login', { title: '로그인', errors: req.session.messages || [] });
  delete req.session.messages;
});

router.post('/login', passport.authenticate('local', {
    failureRedirect: '/login',
    failureMessage: '죄송합니다. 로그인에 실패했습니다. 아이디와 비밀번호를 확인하고 다시 로그인해주세요.'
}), function(req, res, next) {
    // issue a remember me cookie if the option was checked
    console.log(next);
    if (!req.body.remember_me) { return next(); }

    var token = new Token({
      token: crypto.randomBytes(64).toString('hex'),
      userId: req.user._id
    });
    token.save(function(err) {
      if (err) { return next(err); }
      res.cookie('remember_me', token, { path: '/', httpOnly: true, maxAge: 604800000 }); // 7 days
      return next();
    });
  }, function(req, res) {
  if (req.query.product_id)
    res.redirect('/checkout?product_id=' + req.query.product_id);
  else
    res.redirect('/');
});

router.get('/logout', function(req, res){
  Token.findOneAndRemove({ _id: req.cookies.remember_me }, function(err) {
    res.clearCookie('remember_me');
    req.session.destroy();
    req.logout();
    res.redirect('/');
  });
});

router.get('/mypage', isAuthenticated, function(req, res) {
  Order.find({ 'user': req.user._id }, {}, {$sort: { created_at: -1 }}).where('status').ne('Submitted').populate('product').exec(function(err, orders) {
      if (typeof req.session.errors !== 'undefined') {
        var errors = req.session.errors;
        delete req.session.errors;
        Coupon.find({ user: req.user.id }, function(err, coupons) {
          res.render('users/show', { orders: orders, errors: errors, title: "마이 페이지", coupons: coupons });
        });
      }
      Coupon.find({ user: req.user.id }, function(err, coupons) {
        res.render('users/show', { orders: orders, title: "마이 페이지", coupons: coupons });
      });
    });
});

router.get('/signup/success', function(req, res){
  res.render('users/success');
});

router.get('/signup/mail', function(req, res){
  res.render('mailer/signup');
});

router.get('/users/view', isAuthenticated, function(req, res){
  res.render('users/show');
});

router.post('/users/edit_password', isAuthenticated, function(req, res) {
  var user = req.user;

  req.Validator.validate('password', i18n.__('user.password'), {
    length: {
      min: 8,
      max: 15
    },
    required: true
  })
  .validate('confirmpassword', i18n.__('user.confirmPassword'), {
    length: {
      min: 8,
      max: 15
    },
    isConfirm: function(field, fieldName, value, fn) {
      var errors;
      if (value !== req.body.password) {
        errors = i18n.__('passNotConfirmed', fieldName, i18n.__('user.password'));
      }
      fn(errors);
    },
    required: true
  });

  req.Validator.getErrors(function(errors) {
    if (errors.length > 0) {
        req.session.errors = errors;
        res.redirect('/mypage#mypage2');
    }
    else {
      user.password = req.body.password;
      user.save(function(err) {
        if (err)
          console.log(err);
        res.redirect('/mypage#mypage2');
      });
    }
  });
});

router.get('/users/view/:id', isAdmin, function(req, res) {
  User.findOne({_id: req.params.id}, function(err, user) {
    Order.find({ 'user': user._id }).populate('product').exec(function(err, orders) {
      if (err)
        console.log(err);
      if (!user)
        res.redirect('/users/list');
      res.render('users/show', { user: user, orders: orders });
    });
  });
});

router.get('/users/edit', isAuthenticated, function(req, res){
  res.render('users/edit');
});

router.post('/users/edit', isAuthenticated, function(req, res) {
  var user = req.user;
  req.Validator.validate('username', i18n.__('user.username'), {
    length: {
      min: 3,
      max: 20
    },
    required: true
  })
  .validate('email', i18n.__('user.email'), {
    required: true
  })
  .validate('full_name', i18n.__('user.fullName'), {
    required: true
  })
  .validate('phone_number', i18n.__('user.phoneNumber'), {
    required: true,
    numeric: true
  })
  .validate('address', i18n.__('user.address1'), {
    required: true
  })
  .validate('zipcode', i18n.__('user.zipcode'), {
    numeric: true
  })
  .validate('country', i18n.__('user.country'), {
    required: true
  });

  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      res.render('users/edit', { errors: errors });
    }
    else {
      user.username = req.body.username;
      user.email = req.body.email;
      user.shipping = {
        full_name: req.body.full_name,
        address: req.body.address1,
        country: req.body.country,
        zipcode: req.body.zipcode,
        phone_number: req.body.phone_number
      }
      user.save(function(err) {
        if (err)
          console.log(err);
        res.redirect('/mypage');
      });
    }
  });
});

// for Admin Only
router.get('/users/list', isAdmin, function(req, res){
  var page = req.query.page ? req.query.page : 1;
  User.find({}, {}, {$sort: { created_at: -1 }}).paginate(page, 10, function(err, users, total) {
    if (err)
      console.log(err);
      console.log(total);
    res.render('users/list', { users: users, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 10), page), currentPage: page, lastPage: Math.ceil(total / 10) });
  });
});

router.post('/users/list', isAdmin, function(req, res){
  var page = req.query.page ? req.query.page : 1;
  User.find( { $or: [{name: req.body.name}, {email: req.body.email}, {role: req.body.role }]}, {}, {$sort: { created_at: -1 }}).paginate(page, 10, function(err, users, total) {
    if (err)
      console.log(err);
    res.render('users/list', { users: users, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 10), page), currentPage: page, lastPage: Math.ceil(total / 10) });
  });
});

router.get('/users/delete/:id', isAdmin, function(req, res) {
  User.findOneAndRemove({ _id: req.params.id }, function(err, user) {
    res.redirect('/users/list');
  });
});

router.get('/signup', function(req, res, next) {
  if (req.user)
    res.redirect('/');
  req.Validator.getErrors(function() { res.render('signup', { title: "회원가입" }); });
});

router.post('/signup', function(req, res) {
  // form validation rules
  req.Validator.validate('username', i18n.__('user.username'), {
    length: {
      min: 3,
      max: 20
    },
    required: true
  })
  .validate('email', i18n.__('user.email'), {
    required: true
  })
  .validate('password', i18n.__('user.password'), {
    length: {
      min: 8,
      max: 15
    },
    required: true
  })
  .validate('confirmpassword', i18n.__('user.confirmPassword'), {
    length: {
      min: 8,
      max: 15
    },
    isConfirm: function(field, fieldName, value, fn) {
      var errors;
      if (value !== req.body.password) {
        errors = i18n.__('passNotConfirmed', fieldName, i18n.__('user.password'));
      }
      fn(errors);
    },
    required: true
  })
  .validate('agree-terms-1', i18n.__('user.agreeTerms1'), {
    required: true
  })
  .validate('agree-terms-3', i18n.__('user.agreeTerms3'), {
    required: true
  });

  if (req.body.add_address) {
    req.Validator.validate('full_name', i18n.__('user.fullName'), {
      required: true
    })
    .validate('phone_number', i18n.__('user.phoneNumber'), {
      required: true,
      numeric: true
    })
    .validate('address1', i18n.__('user.address1'), {
      required: true
    })
    .validate('zipcode', i18n.__('user.zipcode'), {
      numeric: true
    })
    .validate('country', i18n.__('user.country'), {
      required: true
    });
  }

  // form validation
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      res.render('signup', { errors: errors, title: "회원가입" });
    }
    else {
      var user = new User({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        role: 'user'
      });

      if (req.body.add_address) {
        user.shipping = {
          full_name: req.body.full_name,
          address: req.body.address1,
          country: req.body.country,
          zipcode: req.body.zipcode,
          phone_number: req.body.phone_number
        }
      }
      user.save(function(err) {
        if (err) {
          console.log(err);
          var errors = [];
          for (var path in err.errors) {
            errors.push(i18n.__("unique", i18n.__("user."+path)));
          }
          res.render('signup', { errors: errors, title: "회원가입" });
        }
        else {
          fs.readFile('./views/mailer/signup.vash', "utf8", function(err, file) {
            if(err){
              //handle errors
              console.log('ERROR!');
              return res.send('ERROR!');
            }
            var html = vash.compile(file);
            transporter.sendMail({
              from: '데일리 붐 <contact@dailyboom.co>',
              to: user.email,
              subject: user.username+'님 회원가입을 축하드립니다.',
              html: html({ user : user })
            }, function (err, info) {
                if (err) { console.log(err); res.render('signup', { error: err.errmsg, title: "회원가입" }); }
                console.log('Message sent: ' + info.response);
                transporter.close();
                req.login(user, function(err) {
                  if (err) {
                    console.log(err);
                  }
                  User.count({}, function(err, nb) {
                    if (nb <= 1064) {
                      var coupon = new Coupon({
                        user: user.id,
                        type: 1,
                        expires_at: moment().add(1, 'months').hours(0).minutes(0).seconds(0)
                      });
                      coupon.save(function() {
                        return res.redirect('/');                        
                      })
                    }
                    else
                      return res.redirect('/');
                  });
                });
            });
          });
        }
      });
    }
  });
});

router.get('/auth/facebook',
  passport.authenticate('facebook',
    { display: 'popup'}
));

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.render('callback');
});

router.get('/auth/kakao',
  passport.authenticate('kakao')
);

router.get('/auth/kakao/callback',
  passport.authenticate('kakao', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.render('callback');
});

router.get('/forgot', function(req, res, next) {
  res.render('users/forgot', { title: "비밀번호를 잊으셨나요?" });
})

router.post('/forgot', function(req, res, next) {
  var token = crypto.randomBytes(64).toString('hex');

  User.findOne({ email: req.body.email }, function(err, user) {
    if (!user) {
      res.render('users/forgot', { message: "No account with that email address exists." });
      return res.end();
    }

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    user.save(function(err) {
      var mailOptions = {
        to: user.email,
        from: '데일리 붐 <contact@dailyboom.co>',
        subject: '데일리 붐 비밀번호 재신청',
        text: 'Y데일리 붐 회원님의 비밀번호 변경 요청 메일입니다.\n\n' +
          '아래의 링크를 클릭하여 회원 님의 비밀번호를 변경하십시오.:\n\n' +
          'http://' + req.headers.host + '/reset/' + token + '\n\n'
      };
      transporter.sendMail(mailOptions, function(err) {
        if (err) return next(err);
        res.render('users/forgot', { message: "reset sent" });
      });
    });
  });
});

router.get('/reset/:token', function(req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (!user) {
      //req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot');
    }
    console.log(req.params.token);
    res.render('users/reset', {
      user: user,
      token: req.params.token
    });
  });
});

router.post('/reset/:token', function(req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function(err, user) {
    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('back');
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    user.save(function(err) {
      req.login(user, function(err) {
        var mailOptions = {
        to: user.email,
        from: '데일리 붐 <contact@dailyboom.co>',
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
        };
        transporter.sendMail(mailOptions, function(err) {
          res.redirect('/');
        });
      });
    });
  });
});

router.get('/users/is_merchant/:id', function(req, res) {
  User.findOneAndUpdate({ _id: req.params.id }, { role: 'merchant' }, function(err, user) {
    if (err)
      console.log(err);
    res.redirect('/users/list');
  });
})

//Zonecode page

router.get('/zonecode', function(req, res) {
  Product.findOne({ _id: "56026fb1ad79928905a6998e" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    res.render('extended', { product: product, progress: 10, no_time: true, title: "Zonecode", description: product.description, sale: sale.toFixed(0), cover: product.images[0] });
  });
});


router.get('/judykimproductions', function(req, res) {
  Product.findOne({ _id: "5673ba377687397705278e7e" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    res.render('extended', { product: product, progress: 10, no_time: true, title: "Judy Kim Productions", description: product.description, sale: sale.toFixed(0), cover: product.images[0] });
  });
});

module.exports = router;
