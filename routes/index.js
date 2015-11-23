var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var moment = require('moment');
var User = require('../models/user');
var Product = require('../models/product');
var smtpTransport = require('nodemailer-smtp-transport');
var config = require('config');
var nodemailer = require('nodemailer');

var transporter = nodemailer.createTransport(smtpTransport({
    host: config.get('Nodemailer.host'),
    auth: {
        user: config.get('Nodemailer.auth.user'),
        pass: config.get('Nodemailer.auth.pass')
    }
}));
// As with any middleware it is quintessential to call next()
// if the user is authenticated
var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

/* GET Home Page */
router.get('/', function(req, res, next) {
  var now
  if (moment().day() == 0)
    now = moment().subtract(1, 'days').format("MM/DD/YYYY");
  else
    now = moment().format("MM/DD/YYYY");

  Product.findOne({scheduled_at: now, is_published: true}, {}, { sort: { 'scheduled_at' : 1 }}, function (err, product) {
    Product.find({scheduled_at: {$lt: now} }).limit(6).sort({ 'scheduled_at' : -1 }).exec(function (err, pastProducts) {
      res.render('index', { progress: 70, product: product, pastProducts: pastProducts, moment: moment });
    });
  });
});

router.get('/about', function(req, res, next) {
  res.render('about');
});

router.get('/advertise', function(req, res, next) {
  res.render('advertise');
});

router.get('/privacy', function(req, res, next) {
  res.render('privacy');
});

router.get('/terms', function(req, res, next) {
  res.render('terms');
});

router.get('/merchant', function(req, res, next) {
  res.render('merchant');
});

router.post('/merchant', function(req, res, next) {
  transporter.sendMail({
    from: 'Daily Boom <contact@dailyboom.co>',
    to: 'contact@dailyboom.co',
    subject: 'Merchant contact.',
    html: '<p>회사 명: '+req.body.company+'</p><p>이름: '+req.body.fullname+'</p><p>이메일: '+req.body.email+'</p><p>내용: '+req.body.details+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.render('signup', { error: err.errmsg }); }
      console.log('Message sent: ' + info.response);
      transporter.close();
      res.render('merchant');
  });
});

router.get('/beta', function(req, res, next) {
  Product.findOne({}, {}, { sort: { 'created_at' : -1 }}, function (err, product) {
    Product.find({}).where('_id').ne(product._id).limit(6).sort({ 'created_at' : -1 }).exec(function (err, pastProducts) {
      res.render('beta', { progress: 75, product: product, pastProducts: pastProducts });
    });
  });
});


module.exports = router;
