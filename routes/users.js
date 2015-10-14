var express = require('express');
var router = express.Router();
var passport = require('passport');
var nodemailer = require('nodemailer');
var smtpTransport = require('nodemailer-smtp-transport');
var User = require("../models/user");
var config = require('config');
var i18n = require("i18n");

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

router.get('/login', function(req, res, next) {
  res.render('login', { title: 'Login' });
});

router.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login'
}));

router.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

router.get('/mypage', isAuthenticated, function(req, res) {
  res.render('users/show');
});

router.get('/signup', function(req, res, next) {
  res.render('signup');
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
      if (value != req.password) {
        errors = i18n.__('passNotConfirmed', fieldName, i18n.__('user.password'));
      }
      fn(errors);
    },
    required: true
  })
  .validate('agree-terms-1', i18n.__('user.agreeTerms1'), {
    required: true
  })
  .validate('agree-terms-2', i18n.__('user.agreeTerms2'), {
    required: true
  })
  .validate('agree-terms-3', i18n.__('user.agreeTerms3'), {
    required: true
  });
  
  if (req.body.add_address) {
    req.Validator.validate('full_name', i18n.__('user.fullName'), {
      required: true,
      alpha: true
    })
    .validate('phone_number', i18n.__('user.phoneNumber'), {
      required: true,
      numeric: true
    })
    .validate('address1', i18n.__('user.address1'), {
      required: true,
      alphaNumeric: true
    })
    .validate('zipcode', i18n.__('user.zipcode'), {
      required: true,
      numeric: true
    })
    .validate('country', i18n.__('user.country'), {
      required: true,
      alpha: true
    });
  }
  
  // form validation
  req.Validator.getErrors(function(errors){
    if (errors) {
      console.log(errors)
      res.render('signup', { errors: errors });
    }
    else {
      var user = new User({
        username: req.body.username,
        password: req.body.password,
        email: req.body.email,
        role: 'user'
      });
      user.save(function(err) {
        if (err) {
          res.render('signup', { errors: err });
        }
        else {
          transporter.sendMail({
            from: 'DailyBoom <contact@dailyboom.co>',
            to: user.email,
            subject: 'Welcome to DailyBoom',
            text: 'Thank you for registering on DailyBoom!'
          }, function (err, info) {
              if (err) { console.log(err); res.render('signup', { error: err.errmsg }); }
              console.log('Message sent: ' + info.response);
              transporter.close();
              res.redirect('/');
          });
        }
      });
    }
  });
});

router.get('/auth/facebook',
  passport.authenticate('facebook',
    { display: 'popup'},
    { scope: ['email', 'public_profile'] },
    { profileFields: ["id", "birthday", "email", "first_name", "gender", "last_name"] }
  ));

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.render('callback');
  });

module.exports = router;
