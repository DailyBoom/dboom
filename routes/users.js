var express = require('express');
var app = express();
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
var slack = require('slack-notify')(config.Slack.webhookUrl);
var fs = require('fs');
var paginate = require('express-paginate');
require('mongoose-pagination');
var transporter = nodemailer.createTransport(smtpTransport({
    service: 'gmail',
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
  res.render('mall/login', { title: req.__('login'), errors: message });
});

var isMerchantOrAdmin = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "merchant"))
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

router.post('/checkout/login', passport.authenticate('local', {
      failureRedirect: '/checkout/login',
      failureMessage: 'ID hoặc mật khẩu không hợp lệ.'
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
    res.redirect('/checkout');
});

router.get('/login', function(req, res, next) {
  if (req.user)
    return res.redirect('/');
  var message = req.session.messages || [];
  delete req.session.messages;
  res.render('login', { title: req.__('login'), errors: message });
});

router.post('/login', passport.authenticate('local', {
    failureRedirect: '/login',
    failureMessage: 'ID hoặc mật khẩu không hợp lệ.'
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
    var redirect_to = req.session.redirect_to ? req.session.redirect_to : 'back';
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
  res.render('users/show', { title: "Thông tin tài khoản" });
});

router.get('/myhistory', isAuthenticated, function(req, res) {
  Order.find({ 'user': req.user._id,  $or: [ { status: "Waiting" }, { status: "Paid" } ] }, {}, {sort: { created_at: -1 }}).populate('cart.product').exec(function(err, pendingOrders) {
    Order.find({ 'user': req.user._id, 'status': "Sent" }, {}, {sort: { created_at: -1 }}).populate('cart.product').exec(function(err, sentOrders) {
      res.render('users/history', { pendingOrders: pendingOrders, sentOrders: sentOrders, title: "Đơn hàng của bạn" });
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
  .validate('gender', 'Giới tính', {
    required: true
  })
  .validate('birthday', 'Ngày sinh', {
    required: true
  })
  .validate('district', i18n.__('user.zipcode'), {
    required: true
  })
  .validate('ward', i18n.__('user.country'), {
    required: true
  });

  req.Validator.getErrors(function(errors){
    console.log(req.body);
    if (errors.length > 0) {
      console.log(errors);
      return res.render('users/edit', { errors: errors });
    }
    else {
      User.findOne({ _id: req.user._id }, {}, function(err, user) {
        user.username = req.body.username; 
        user.email = req.body.email;
        user.gender = req.body.gender;
        user.birthday = req.body.birthday;
        user.shipping = {
          full_name: req.body.full_name,
          address: req.body.address,
          phone_number: req.body.phone_number,
          district: req.body.district,
          ward: req.body.ward
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
  if (req.query.username) {
    query.where('username', req.query.username);
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
    res.redirect('back');
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
  req.Validator.getErrors(function() { res.render('signup', { title: "Đăng ký" }); });
});

router.post('/signup', function(req, res) {
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
  .validate('confirm_password', i18n.__('user.confirmPassword'), {
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
  .validate('gender', 'Giới tín', {
    required: true
  })
  .validate('birthday', 'Ngày sinh', {
    required: true
  });


  // form validation
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      console.log(errors);
      res.render('signup', { errors: errors, title: "Đăng ký" });
    }
    else {
      console.log(req.body.birthday);
      console.log(req.body.gender);
      var user = new User({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        birthday: req.body.birthday,
        gender: req.body.gender,
        role: 'user'
      });

      user.save(function(err) {
        if (err) {
          console.log(err);
          var errors = [];
          for (var path in err.errors) {
            errors.push(i18n.__("unique", i18n.__("user."+path)));
          }
          res.render('signup', { errors: errors, title: "Đăng ký" });
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
                  return res.redirect('/home');
                });
            });
          });
        }
      });
    }
  });
});

router.post('/checkout/signup', function(req, res) {
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
  .validate('gender', 'Giới tín', {
    required: true
  })
  .validate('birthday', 'Ngày sinh', {
    required: true
  });


  // form validation
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      res.render('signup', { errors: errors, title: "회원가입" });
    }
    else {
      console.log(req.body.birthday);
      console.log(req.body.gender);
      var user = new User({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        birthday: req.body.birthday,
        gender: req.body.gender,
        role: 'user'
      });

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
                  return res.redirect('/shipping');
                });
            });
          });
        }
      });
    }
  });
});


router.get('/wholesalers/signup', isMerchantOrAdmin, function(req, res, next) {
  req.Validator.getErrors(function() { res.render('users/new_merchant', { title: "판매자 가입하기" }); });
});

router.post('/wholesalers/signup', isMerchantOrAdmin, function(req, res) {
  // form validation rules
  console.log(req.body);
  req.Validator.validate('username', i18n.__('user.username'), {
    required: true
  })
  .validate('email', i18n.__('user.email'), {
    required: true
  })
  .validate('phone_number', i18n.__('user.phoneNumber'), {
    required: true,
    numeric: true
  });

  // form validation
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      console.log(errors);
      return res.render('users/new_merchant', { message: 'Sorry but there was an error.'});
    }
    else {
      var user = new User({
        username: req.body.username,
        email: req.body.email,
        website: req.body.website,
        facebook: req.body.facebook,
        role: 'wholesaler',
        shipping: {
          phone_number: req.body.phone_number,
          address: req.body.address1,
          country: req.body.country
        }
      });
      user.save(function(err) {
        if (err) {
          console.log(err);
          var errors = [];
          for (var path in err.errors) {
            errors.push(i18n.__("unique", i18n.__("user."+path)));
          }
          return res.render('users/new_merchant', { message: 'Sorry but there was an error.'});
        }
        else {
          return res.redirect('/wholesalers/list');
        }
      });
    }
  });
});

router.get('/wholesalers/list', isMerchantOrAdmin, function(req, res){
  var page = req.query.page ? req.query.page : 1;
  var query = User.find({ role: 'wholesaler' }, {}, {$sort: { created_at: -1 }});
  if (req.query.name) {
    query.where('name', req.query.name);
  }
  if (req.query.email) {
    query.where('email', req.query.email);
  }
  query.paginate(page, 10, function(err, users, total) {
    if (err)
      console.log(err);
    var i = 0;
    users.forEach(function(user) {
      user.amount = 0;
      Order.find({ user: user.id, created_at: { $gte: moment().subtract(req.query.t ? req.query.t : 1, 'month') } }, 'totalOrderAmt', function(err, orders) {
        console.log(orders.length);
        orders.forEach(function(order) {
          user.amount += order.totalOrderAmt;
        });        
      });
      if (++i == users.length) {
        res.render('users/list', { users: users, wholesalers: true, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 10), page), currentPage: page, lastPage: Math.ceil(total / 10) });
      }
    })
  });
});

router.post('/wholesale', function(req, res) {
  // form validation rules
  console.log(req.body);
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
  .validate('confirm_password', i18n.__('user.confirmPassword'), {
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
  .validate('phone_number', i18n.__('user.phoneNumber'), {
    required: true,
    numeric: true
  });

  // form validation
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      console.log(errors);
      return res.status(500).json({ message: errors });
    }
    else {
      var user = new User({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        role: 'agent',
        shipping: {
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
          return res.status(500).json({ message: 'Sorry but there was an error.'});
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
              subject: user.username+' registered for Yppuna Agents.',
              html: html({ user : user })
            }, function (err, info) {
                if (err) { console.log(err); res.redirect('/'); }
                //console.log('Message sent: ' + info.response);
                return res.status(200).json({ message: 'Cảm Ơn Các Bạn Đã Đăng Ký Là Thành Viên Của Yppuna'});
            });
          });
        }
      });
    }
  });
});

router.get('/auth/facebook',
  passport.authenticate('facebook',
    { display: 'popup' }
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
  res.render('users/forgot', { title: "Quên mật khẩu?" });
})

router.post('/forgot', function(req, res, next) {
  var token = crypto.randomBytes(64).toString('hex');

  User.findOne({ email: req.body.email }, function(err, user) {
    if (!user) {
      res.render('users/forgot', { message: "Không Có Tài Khoản Nào Được Đăng Ký Bằng Email Này." });
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
          subject: 'Đặt Lại Mật Khẩu',
          html: html({ host : req.headers.host, token: token, user: user })
        }, function (err, info) {
            if (err) return next(err);
            return res.render('users/forgot', { message: "Mở Hộp Thư Để Lấy Lại Mật Khẩu." });
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
      req.flash('error', 'Điểu Lệnh Đổi Mật Khẩu Của Bạn Không Hợp Lệ Hoặc Đã Hết Thời Gian.');
      return res.redirect('back');
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    user.save(function(err) {
      req.login(user, function(err) {
        fs.readFile('./views/mailer/pass_reset_success.vash', "utf8", function(err, file) {
          if(err){
            //handle errors
            console.log('ERROR!');
            return res.send('ERROR!');
          }
          var html = vash.compile(file);
          transporter.sendMail({
            from: 'Yppuna <hello@yppuna.vn>',
            to: user.email,
            subject: 'Mật Khẩu Của Bạn Đã Được Khởi Động Lại',
            html: html({ host : req.headers.host, token: token, user: user })
          }, function (err, info) {
              if (err) return next(err);
              return res.render('/login', { message: "Mở Hộp Thư Để Lấy Lại Mật Khẩu." });
          });
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
    order: req.body.order ? req.body.order : null,
    product: req.body.product ? req.body.product : null,
    name: req.body.name ? req.body.name : null,
    email: req.body.email ? req.body.email : null,
    body: req.body.body
  });
  
  comment.save(function(err) {
    if (err) {
      console.log(err);
      res.redirect('back');
    }
    if (comment.product && app.get("env") === "production") {
      comment.populate('product', function(err) {
        slack.send({
          channel: '#new-comment',
          icon_url: 'http://yppuna.vn/images/favicon/favicon-96x96.png',
          text: 'New comment <http://yppuna.vn/shop/products/' + comment.product.url + '>',
          unfurl_links: 1,
          username: 'Yppuna-bot'
        });
        transporter.sendMail({
          from: 'hello@yppuna.vn',
          to: 'hoa@yppuna.vn;hustler@yppuna.vn;',
          subject: 'New comment on Yppuna',
          html: 'New commment on Yppuna <a href="http://yppuna.vn/shop/products/' + comment.product.url + '">http://yppuna.vn/shop/products/' + comment.product.url + '</a>'
        }, function (err, info) {
            if (err) { console.log(err); res.status(500).json({ message: '죄송합니다. 오류가있었습다. 확인후 다시 시도해주세요.'}); }
          //console.log('Message sent: ' + info.response);
            transporter.close();
            return res.redirect('back');            
        });
      });
    }
    console.log(comment);
    return res.redirect('back');
  });
});

router.get('/comments/list', isAdmin, function(req, res) {
  Comment.find({}, function(err, comments) {
    res.render('comments/list', { comments: comments });
  });
});

module.exports = router;
