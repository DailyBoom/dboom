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
  var now;
  if (moment().day() == 0)
    now = moment().subtract(1, 'days').format("MM/DD/YYYY");
  else
    now = moment().format("MM/DD/YYYY");

  Product.findOne({scheduled_at: now, is_published: true}, {}, { sort: { 'scheduled_at' : 1 }}, function (err, product) {
    Product.find({scheduled_at: {$lt: now} }).limit(6).sort({ 'scheduled_at' : -1 }).exec(function (err, pastProducts) {
      var current_quantity = 0;
      product.options.forEach(function(option) {
        current_quantity += parseInt(option.quantity);
      });
      var progress = (product.quantity - current_quantity) / product.quantity * 100;
      res.render('index', { progress: progress.toFixed(0), product: product, pastProducts: pastProducts, title: "오늘 뭐 사지?" });
    });
  });
});

router.get('/about', function(req, res, next) {
  res.render('about', { title: "회사 소개", description: "데일리 붐은 ‘매일 폭탄 가격’이라는 뜻으로, 매일 한 가지의 상품을 한정된 시간 내에만 특가로 판매하는 웹사이트입니다." });
});

router.get('/advertise', function(req, res, next) {
  res.render('advertise', { title: "광고·제휴 문의", description: "광고·제휴 문의" });
});

router.get('/privacy', function(req, res, next) {
  res.render('privacy', { title: "개인정보 정책", description: "데일리 붐은 회원님의 개인정보를 안전하게 보호하기 위하여 최선의 노력을 다하고 있으며, 개인정보보호관련 법규 및 정부기관의 가이드라인을 준수하고 있습니다." });
});

router.get('/terms', function(req, res, next) {
  res.render('terms', { title: "이용약관", description: "이 약관은 Daily Boom (전자상거래 사업자)이 운영하는 T.P.O 제공하는 인터넷 관련 서비스(이하 '서비스'라 한다)를 이용함에 있어 사이버 몰과 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다." });
});

router.get('/merchant', function(req, res, next) {
  res.render('merchant', { title: "판매자 문의", description: "데일리 붐은 하루 24시간 오직 한개의 상품만을 판매함으로써 매출을 획기적으로 증가시켜 드립니다." });
});

router.post('/advertise', function(req, res, next) {
  transporter.sendMail({
    from: 'Daily Boom <contact@dailyboom.co>',
    to: 'contact@dailyboom.co',
    subject: 'Advertise contact.',
    html: '<p>회사 명: '+req.body.company+'</p><p>이름: '+req.body.fullname+'</p><p>이메일: '+req.body.email+'</p><p>내용: '+req.body.details+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.status(500).json({ message: '죄송합니다. 오류가있었습다. 확인후 다시 시도해주세요.'}); }
      console.log('Message sent: ' + info.response);
      transporter.close();
      res.status(200).json({ message: '감사합니다. 성공적으로 전송이 되었습니다.'});
  });
});

router.post('/merchant', function(req, res, next) {
  transporter.sendMail({
    from: 'Daily Boom <contact@dailyboom.co>',
    to: 'contact@dailyboom.co',
    subject: 'Merchant contact.',
    html: '<p>회사 명: '+req.body.company+'</p><p>이름: '+req.body.fullname+'</p><p>이메일: '+req.body.email+'</p><p>내용: '+req.body.details+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.status(500).json({ message: '죄송합니다. 오류가있었습다. 확인후 다시 시도해주세요.'}); }
      console.log('Message sent: ' + info.response);
      transporter.close();
      res.status(200).json({ message: '감사합니다. 성공적으로 전송이 되었습니다.'});
  });
});

router.get('/beta', function(req, res, next) {
  Product.findOne({}, {}, { sort: { 'created_at' : -1 }}, function (err, product) {
    Product.find({}).where('_id').ne(product._id).limit(6).sort({ 'created_at' : -1 }).exec(function (err, pastProducts) {
      res.render('beta', { progress: 75, product: product, pastProducts: pastProducts });
    });
  });
});

router.get('/extend/:id', function(req, res, next) {
  Product.findOne({_id: req.params.id}, function(err, product) {
    var current_quantity = 0;
      product.options.forEach(function(option) {
        current_quantity += parseInt(option.quantity);
      });
    var progress = (product.quantity - current_quantity) / product.quantity * 100;
    if (product.extend == 1) {
      if (moment().isAfter(moment(product.scheduled_at).add(2, 'days'), 'days'))
        return res.redirect('/');
    }
    else if (product.extend == 2) {
      if (current_quantity <= 0) {
        return res.redirect('/');
      }
    }
    else {
      res.redirect('/');
    }
    res.render('extended', { product: product, title: product.name, description: product.description, progress: progress });
  });
});

module.exports = router;
