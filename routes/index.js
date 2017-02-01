var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var moment = require('moment');
var User = require('../models/user');
var Product = require('../models/product');
var Coupon = require('../models/coupon');
var Partner = require('../models/partner');
var smtpTransport = require('nodemailer-smtp-transport');
var config = require('config');
var fs = require("fs");
var vash = require("vash");
var nodemailer = require('nodemailer');
var util = require("util");

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
  var date = null;
  Product.findOne({scheduled_at: now, is_published: true }, {}, { sort: { 'scheduled_at' : 1 }}, function (err, product) {
    Product.find({scheduled_at: {$lt: now} }).limit(6).sort({ 'scheduled_at' : -1 }).exec(function (err, pastProducts) {
      Product.find({ extend: 4, is_published: true, is_hot: null }, {}, { sort: { 'price' : -1 }}).limit(6).exec(function(err, mallProducts) {
        // var current_quantity = 0;
        // product.options.forEach(function(option) {
        //   current_quantity += parseInt(option.quantity);
        // });
        // var progress = (product.quantity - current_quantity) / product.quantity * 100;
        // var sale = (product.old_price - product.price) / product.old_price * 100;
        // console.log(sale);
        Partner.find({}, function(err, partners) {
          res.render('index', { product: product, pastProducts: pastProducts, mallProducts: mallProducts, title: "오늘 뭐 사지?", partners: partners, date: date });
        });
      });
    });
  });
});

router.get('/mall', function(req, res, next) {
  Product.find({ extend: 4, is_published: true, is_hot: null }, {}, { sort: { 'price' : -1 }}, function(err, products) {
    Product.find({ extend: 4, is_hot: true, is_published: true }).populate('merchant_id').exec(function(err, hotProducts) {
      res.render('mall', { title: "Mall", description: '', products: products, hotProducts: hotProducts });
    });
  });
});

router.get('/mall/:category', function(req, res, next) {
  Product.find({ category: req.params.category, extend: 4, is_published: true }, {}, { sort: { 'price' : -1 }}, function(err, products) {
    console.log(products);
    res.render('mall', { title: req.params.category, products: products });
  });
});

router.get('/blushop/:brand', function(req, res, next) {
  Product.find({ brand: req.params.brand, extend: 4, is_published: true }, {}, { sort: { 'created_at' : -1 }}, function(err, products) {
    if (err)
      console.log(err);
    if (!products || products.length == 0)
      return res.redirect('/blushop');
    res.render('mall', { title: "데일리 붐 쇼핑 몰", description: "데일리 붐은 ‘매일 폭탄 가격’이라는 뜻으로, 매일 한 가지의 상품을 한정된 시간 내에만 특가로 판매하는 웹사이트입니다.", products: products, merchant: req.params.brand, cover: products[0].brand_logo });
  });
});

// router.get('/mall/products/:id', function(req, res, next) {
//   Product.findOne({ extend: 4, _id: req.params.id, is_published: true }, function(err, product) {
//     if (!product)
//       return res.redirect('/mall');
//     if (err)
//       console.log(err);
//     if (!product || product.length == 0)
//       return res.redirect('/mall');
//     var current_quantity = 0;
//     product.options.forEach(function(option) {
//       current_quantity += parseInt(option.quantity);
//     });
//     var progress = (product.quantity - current_quantity) / product.quantity * 100;
//     var sale = (product.old_price - product.price) / product.old_price * 100;
//     res.render('extended_m', { product: product, title: product.brand + ' - ' + product.name, description: product.description, progress: progress.toFixed(0), sale: sale.toFixed(0), date: product.extend == 1 ? product.scheduled_at : false, no_time: true, cover: product.images[0], mall: true });
//   });    
// });

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
    from: '데일리 붐 <contact@dailyboom.co>',
    to: 'contact@dailyboom.co',
    subject: 'Advertise contact.',
    html: '<p>회사 명: '+req.body.company+'</p><p>이름: '+req.body.fullname+'</p><p>이메일: '+req.body.email+'</p><p>내용: '+req.body.details+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.status(500).json({ message: '죄송합니다. 오류가있었습다. 확인후 다시 시도해주세요.'}); }
     //console.log('Message sent: ' + info.response);
      transporter.close();
      res.status(200).json({ message: '감사합니다. 성공적으로 전송이 되었습니다.'});
  });
});

router.post('/merchant', function(req, res, next) {
  transporter.sendMail({
    from: '데일리 붐 <contact@dailyboom.co>',
    to: 'contact@dailyboom.co',
    subject: 'Merchant contact.',
    html: '<p>회사 명: '+req.body.company+'</p><p>이름: '+req.body.fullname+'</p><p>이메일: '+req.body.email+'</p><p>내용: '+req.body.details+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.status(500).json({ message: '죄송합니다. 오류가있었습다. 확인후 다시 시도해주세요.'}); }
      //console.log('Message sent: ' + info.response);
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

router.get('/mall/products/:id', function(req, res, next) {
  Product.findOne({_id: req.params.id}, function(err, product) {
    var current_quantity = 0;
    product.options.forEach(function(option) {
      current_quantity += parseInt(option.quantity);
    });
    var progress = (product.quantity - current_quantity) / product.quantity * 100;
    var sale = (product.old_price - product.price) / product.old_price * 100;
    Partner.find({}, function(err, partners) {
        res.render('extended', { product: product, title: product.name, description: product.description, progress: progress.toFixed(0), sale: sale.toFixed(0), date: product.extend == 1 ? product.scheduled_at : false, no_time: product.extend == 2, cover: product.images[0], partners: partners });
    });
  });
});

router.get('/coupons/new', function(req, res, next) {
  User.find({ role: 'user' }, function(err, users) {
    res.render('coupons/new', { users: users });
  });
});

router.post('/coupons/new', function(req, res, next) {
  if (!util.isArray(req.body.users)) {
    req.body.users = req.body.users.split();
  }
  req.body.users.forEach(function(user) {
    var coupon = new Coupon({
      user: user,
      type: req.body.type,
      price: req.body.price,
      percentage: req.body.percentage,
      expires_at: req.body.expire_date
    });

    coupon.save(function() {
      coupon.populate('user', function(err, coupon) {
        console.log(coupon);
        if (coupon.user.email) {
          fs.readFile(res.locals.mailer+'coupon_new.vash', "utf8", function(err, file) {
            if(err){
              //handle errors
              console.log('ERROR!');
              return res.send('ERROR!');
            }
            var html = vash.compile(file);
            transporter.sendMail({
              from: '데일리 붐 <contact@dailyboom.co>',
              to: coupon.user.email,
              subject: '쿠폰이 발급되었습니다.',
              html: html({ user: coupon.user })
            }, function (err, info) {
                if (err) { console.log(err); }
                //console.log('Message sent: ' + info.response);
                transporter.close();
            });
          });
        }
      });
    });
  });
  res.redirect('/coupons/list');
});

router.get('/coupons/list', function(req, res, next) {
  Coupon.find({}).populate('user').exec(function(err, coupons) {
    res.render('coupons/list', { coupons: coupons });
  });
});

router.get('/test_iamport', function(req, res, next) {
  res.render('test_iamport');
});


module.exports = router;
