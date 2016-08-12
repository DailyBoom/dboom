var express = require('express');
var router = express.Router();
var passport = require('passport');
var vash = require("vash");
var nodemailer = require('nodemailer');
var moment = require('moment');
var smtpTransport = require('nodemailer-smtp-transport');
var User = require("../models/user");
var Product = require("../models/product");
var Partner = require("../models/partner");
var Order = require("../models/order");
var Coupon = require("../models/coupon");
var Comment = require("../models/comment");
var config = require('config-heroku');
var i18n = require("i18n");
var Token = require("../models/token");
var crypto = require('crypto');
var fs = require('fs');
var paginate = require('express-paginate');
require('mongoose-pagination');
var transporter = nodemailer.createTransport(smtpTransport({
    host: config.Nodemailer.host,
    auth: {
        user: config.Nodemailer.auth.user,
        pass: config.Nodemailer.auth.pass
    }
}));

var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

router.get('/mall/login', function(req, res, next) {
  if (req.user)
    return res.redirect('/mall');
  var message = req.session.messages || [];
  delete req.session.messages;
  res.render('mall/login', { title: '로그인', errors: message });
});

router.post('/mall/login', passport.authenticate('local', {
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
    res.redirect('/mall/checkout');
});

router.get('/login', function(req, res, next) {
  if (req.user)
    return res.redirect('/');
  var message = req.session.messages || [];
  delete req.session.messages;
  res.render('login', { title: '로그인', errors: message });
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
  else {
    var redirect_to = req.session.redirect_to ? req.session.redirect_to : '/';
    delete req.session.redirect_to;
    res.redirect(redirect_to);
  }
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
  Order.find({ 'user': req.user._id }, {}, {sort: { created_at: -1 }}).where('status').ne('Submitted').populate('product').exec(function(err, orders) {
      if (typeof req.session.errors !== 'undefined') {
        var errors = req.session.errors;
        delete req.session.errors;
        Coupon.find({ user: req.user.id }, {}, { sort: { created_at: -1 } }, function(err, coupons) {
          res.render('users/show', { orders: orders, errors: errors, title: "마이 페이지", coupons: coupons });
        });
      }
      Coupon.find({ user: req.user.id }, {}, { sort: { created_at: -1 } }, function(err, coupons) {
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
      User.findOne({ _id: req.user._id }, {}, function(err, user) {
        user.username = req.body.username; 
        user.email = req.body.email;
        user.shipping = {
          full_name: req.body.full_name,
          address: req.body.address1,
          country: req.body.country,
          zipcode: req.body.zipcode,
          phone_number: req.body.phone_number
        };
        user.save(function(err) {
          if (err)
            console.log(err);
          res.redirect('/mypage');
        });
      });
    }
  });
});

// for Admin Only
router.get('/users/list', isAdmin, function(req, res){
  var page = req.query.page ? req.query.page : 1;
  var query = User.find({}, {}, {$sort: { created_at: -1 }});
  if (req.query.name) {
    query.where('name', req.query.name);
  }
  if (req.query.email) {
    query.where('email', req.query.email);
  }
  if (req.query.role) {
    query.where('role', req.query.role);
  }
  query.paginate(page, 10, function(err, users, total) {
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

router.post('/users/delete', isAuthenticated, function(req, res) {
  req.user.comparePassword(req.body.password, function(err, isMatch) {
    if (isMatch === false) {
      req.session.toast = '로그인에 실패했습니다. 비밀번호를 확인하고 다시 로그인해주세요.';
      return res.redirect('/mypage#mypage2');
    }
    else {
      User.findOneAndRemove({ _id: req.user.id }, function(err, user) {
        req.session.toast = '탈퇴 되었습니다.';
        return res.redirect('/');
      });
    }
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
      user.wallet = 100;
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
              from: 'Yppuna <hello@yppuna.vn>',
              to: user.email,
              subject: 'Chào '+user.username+'. Chúc mừng bạn đã thành công lập tài khoản với Yppuna.',
              html: html({ user : user, i18n: i18n })
            }, function (err, info) {
                if (err) { console.log(err); }
                //console.log('Message sent: ' + info.response);
                req.login(user, function(err) {
                  if (err) {
                    console.log(err);
                  }
                  return res.redirect('/');
                });
            });
          });
        }
      });
    }
  });
});

router.get('/merchant_signup', function(req, res, next) {
  if (req.user)
    res.redirect('/');
  req.Validator.getErrors(function() { res.render('users/new_merchant', { title: "판매자 가입하기" }); });
});

router.post('/merchant_signup', function(req, res) {
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
  })
  .validate('phone_number', i18n.__('user.phoneNumber'), {
    required: true,
    numeric: true
  })
  .validate('address1', i18n.__('user.address1'), {
    required: true
  })
  .validate('person_in_charge', i18n.__('merchant.person_in_charge'), {
    required: true
  })
  .validate('company_name', i18n.__('merchant.company_name'), {
    required: true
  })
  .validate('business_reg', i18n.__('merchant.business_reg'), {
    required: true
  });

  // form validation
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      res.render('users/new_merchant', { errors: errors, title: "판매자 가입하기" });
    }
    else {
      var user = new User({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        person_in_charge: req.body.person_in_charge,
        company_name: req.body.company_name,
        business_reg: req.business_reg,
        role: 'merchant',
        shipping: {
          address: req.body.address1,
          phone_number: req.body.phone_number
        }
      });
      user.save(function(err) {
        if (err) {
          console.log(err);
          var errors = [];
          for (var path in err.errors) {
            errors.push(i18n.__("unique", i18n.__("user."+path)));
          }
          res.render('users/new_merchant', { errors: errors, title: "판매자 가입하기" });
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
              from: 'Yppuna <hello@yppuna.vn>',
              to: user.email,
              subject: user.username+'님 회원가입을 축하드립니다.',
              html: html({ user : user })
            }, function (err, info) {
                if (err) { console.log(err); res.redirect('/'); }
                //console.log('Message sent: ' + info.response);
                req.login(user, function(err) {
                  if (err) {
                    console.log(err);
                  }
                  return res.redirect('/');
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

router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
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
      res.render('users/forgot', { message: "존재하지 않는 계정입니다. 다시 한번 확인해 주십시오." });
      return res.end();
    }

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    user.save(function(err) {
      fs.readFile('./views/mailer/pass_reset.vash', "utf8", function(err, file) {
        if(err){
          //handle errors
          console.log('ERROR!');
          return res.send('ERROR!');
        }
        var html = vash.compile(file);
        transporter.sendMail({
          from: 'Yppuna <hello@yppuna.vn>',
          to: user.email,
          subject: '데일리 붐 비밀번호 재신청',
          html: html({ host : req.headers.host, token: token, user: user })
        }, function (err, info) {
            if (err) return next(err);
            return res.render('users/forgot', { message: "메일이 발송되었습니다. 확인해 주시기 바랍니다." });
        });
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
        from: 'Yppuna <hello@yppuna.vn>',
        subject: '비밀번호 변경 되었습니다',
        text: user.username + '님,\n\n' +
          '데일리 붐 회원님의 비밀번호 변경 확인 메일입니다.\n\n'
        };
        transporter.sendMail(mailOptions, function(err) {
          res.redirect('/login');
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

router.post('/comments/new', function(req, res) {
  console.log(req.body);
  var comment = new Comment({
    user: req.user ? req.user.id : null,
    type: req.body.type,
    order: req.body.order,
    body: req.body.body
  });
  
  comment.save(function(err) {
    if (err) {
      console.log(err);
      res.status(500).json({ message: '죄송합니다. 오류가있었습다. 확인후 다시 시도해주세요.' });
    }
    console.log(comment);
    res.status(200).json({ message: '감사합니다. 성공적으로 전송이 되었습니다.' });
  });
});

router.get('/comments/list', isAdmin, function(req, res) {
  Comment.find({}, function(err, comments) {
    res.render('comments/list', { comments: comments });
  });
});

//Custom pages

router.get('/zonecode', function(req, res) {
  Product.findOne({ _id: "56026fb1ad79928905a6998e" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    Partner.find({}, function(err, partners) {
        res.render('extended', { product: product, progress: 10, no_time: true, title: "Zonecode", description: product.description, sale: sale.toFixed(0), cover: product.images[0], partners: partners });
    });
  });
});


router.get('/judykimproductions', function(req, res) {
  Product.findOne({ _id: "5673ba377687397705278e7e" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    Partner.find({}, function(err, partners) {
        res.render('extended', { product: product, progress: 10, no_time: true, title: "Judy Kim Productions", description: product.description, sale: sale.toFixed(0), cover: product.images[0], partners: partners });
    });
  });
});

router.get('/beautamin', function(req, res) {
  Product.findOne({ _id: "56a1e4206a2520396f64c6eb" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    Partner.find({}, function(err, partners) {
        res.render('extended', { product: product, progress: 10, no_time: true, title: "Beautamin", description: product.description, sale: sale.toFixed(0), cover: product.images[0], partners: partners });
    });
  });
});

router.get('/neopop', function(req, res) {
  Product.findOne({ _id: "56a99dba0fe1ef4972513d0e" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    Partner.find({}, function(err, partners) {
        res.render('extended', { product: product, progress: 10, no_time: true, title: "Neopop", description: product.description, sale: sale.toFixed(0), cover: product.images[0], partners: partners });
    });
  });
});

router.get('/test_vi', function(req, res) {
  Product.findOne({ _id: "56af07fa2de6ec7c2ef12e72" }, function(err, product) {
    var sale = (product.old_price - product.price) / product.old_price * 100;
    i18n.setLocale(req, 'vi');
    res.cookie('dboom_locale', 'vi', { maxAge: 900000, httpOnly: true });
    Partner.find({}, function(err, partners) {
        res.render('extended', { product: product, progress: 10, no_time: true, title: "", description: product.description, sale: sale.toFixed(0), cover: product.images[0], partners: partners });
    });
  });
});

module.exports = router;
