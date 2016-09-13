var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var moment = require('moment');
var User = require('../models/user');
var Product = require('../models/product');
var Coupon = require('../models/coupon');
var Partner = require('../models/partner');
var Article = require('../models/article');
var smtpTransport = require('nodemailer-smtp-transport');
var config = require('config-heroku');
var fs = require("fs");
var vash = require("vash");
var nodemailer = require('nodemailer');
var util = require("util");
var multer = require('multer');
var crypto = require('crypto');
var mime = require('mime-types');
var getSlug = require('speakingurl');
  
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/')
  },
  filename: function (req, file, cb) {
    crypto.pseudoRandomBytes(16, function (err, raw) {
      cb(null, raw.toString('hex') + Date.now() + '.' + mime.extension(file.mimetype));
    });
  }
});

var upload = multer({ storage: storage });


var transporter = nodemailer.createTransport(smtpTransport({
    host: config.Nodemailer.host,
    auth: {
        user: config.Nodemailer.auth.user,
        pass: config.Nodemailer.auth.pass
    }
}));
// As with any middleware it is quintessential to call next()
// if the user is authenticated
var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

/* GET Home Page */
router.get('/', function(req, res, next) {
  var date = moment().startOf('isoweek').format("MM/DD/YYYY");
  Product.findOne({scheduled_at: date, is_published: true }, {}, { sort: { 'scheduled_at' : 1 }}, function (err, product) {
    if (!product) {
      Product.findOne({ _id: "57d27619e4af52823a8a073c" }, {}, { sort: { 'scheduled_at' : 1 }}, function (err, product) {
        var current_quantity = 0;
        product.options.forEach(function(option) {
          current_quantity += parseInt(option.quantity);
        });
        var progress = (product.quantity - current_quantity) / product.quantity * 100;
        var sale = (product.old_price - product.price) / product.old_price * 100;
        Partner.find({}, function(err, partners) {
          res.render('index', { progress: progress.toFixed(0), sale: sale.toFixed(0), product: product, partners: partners });
        });
      });
    }
    else {
      var current_quantity = 0;
      product.options.forEach(function(option) {
        current_quantity += parseInt(option.quantity);
      });
      var progress = (product.quantity - current_quantity) / product.quantity * 100;
      var sale = (product.old_price - product.price) / product.old_price * 100;
      Partner.find({}, function(err, partners) {
        res.render('index', { progress: progress.toFixed(0), sale: sale.toFixed(0), product: product, partners: partners, date: date });
      });
    }
  });
});

router.get('/wholesale', function(req, res, next) {
  Product.find({ extend: 4, is_published: true, is_hot: null }, {}, { sort: { 'created_at' : -1 }}, function(err, products) {
    Product.find({ extend: 4, is_hot: true, is_published: true }).populate('merchant_id').exec(function(err, hotProducts) {
      res.render('mall', { title: "데일리 붐 쇼핑 몰", description: "데일리 붐은 ‘매일 폭탄 가격’이라는 뜻으로, 매일 한 가지의 상품을 한정된 시간 내에만 특가로 판매하는 웹사이트입니다.", products: products, hotProducts: hotProducts });
    });
  });
});

router.get('/wholesale/:brand', function(req, res, next) {
  Product.find({ brand: req.params.brand, extend: 4, is_published: true }, {}, { sort: { 'created_at' : -1 }}, function(err, products) {
    if (err)
      console.log(err);
    if (!products || products.length == 0)
      return res.redirect('/wholesale');
    res.render('mall', { title: "데일리 붐 쇼핑 몰", description: "데일리 붐은 ‘매일 폭탄 가격’이라는 뜻으로, 매일 한 가지의 상품을 한정된 시간 내에만 특가로 판매하는 웹사이트입니다.", products: products, merchant: req.params.brand, cover: products[0].brand_logo });
  });
});

router.get('/wholesale/:brand/:product_id', function(req, res, next) {
  Product.findOne({ extend: 4, _id: req.params.product_id, is_published: true }, function(err, product) {
    if (!product)
      return res.redirect('/wholesale');
    Product.find({ extend: 4, brand: product.brand, _id: { $ne: product.id } }, {}, { sort: { 'created_at' : -1 }}, function(err, pastProducts) {
      console.log(pastProducts);
      if (err)
        console.log(err);
      if (!product || product.length == 0)
        return res.redirect('/wholesale');
      var current_quantity = 0;
      product.options.forEach(function(option) {
        current_quantity += parseInt(option.quantity);
      });
      var progress = (product.quantity - current_quantity) / product.quantity * 100;
      var sale = (product.old_price - product.price) / product.old_price * 100;
      res.render('extended_m', { product: product, title: product.brand + ' - ' + product.name, description: product.description, progress: progress.toFixed(0), sale: sale.toFixed(0), date: product.extend == 1 ? product.scheduled_at : false, no_time: true, cover: product.images[0], mall: true, pastProducts: pastProducts });
    });    
  });
});

router.get('/about', function(req, res, next) {
  res.render('about', { title: req.__('about'), description: req.__('about.text_1') });
});

router.get('/advertise', function(req, res, next) {
  res.render('advertise', { title: req.__('advertise'), description: req.__('advertise') });
});

router.get('/privacy', function(req, res, next) {
  res.render('privacy', { title: req.__('privacy') });
});

router.get('/terms', function(req, res, next) {
  res.render('terms', { title: req.__('terms') });
});

router.get('/merchant', function(req, res, next) {
  res.render('merchant', { title: "판매자 문의", description: "데일리 붐은 하루 24시간 오직 한개의 상품만을 판매함으로써 매출을 획기적으로 증가시켜 드립니다." });
});

router.post('/advertise', function(req, res, next) {
  transporter.sendMail({
    from: req.body.email,
    to: 'lairwin@novazest.com',
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
    from: req.body.email,
    to: 'lairwin@novazest.com',
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

router.get('/extend/:id', function(req, res, next) {
  Product.findOne({_id: req.params.id}, function(err, product) {
    var current_quantity = 0;
    product.options.forEach(function(option) {
      current_quantity += parseInt(option.quantity);
    });
    var progress = (product.quantity - current_quantity) / product.quantity * 100;
    var sale = (product.old_price - product.price) / product.old_price * 100;
    if (product.extend == 1) {
      if (moment().isAfter(moment(product.scheduled_at).add(3, 'days'), 'days'))
        return res.redirect('/');
    }
    else if (product.extend == 2 || product.extend == 4) {
      if (current_quantity <= 0) {
        return res.redirect('/');
      }
    }
    else {
      res.redirect('/');
    }
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
          fs.readFile('./views/mailer/coupon_new.vash', "utf8", function(err, file) {
            if(err){
              //handle errors
              console.log('ERROR!');
              return res.send('ERROR!');
            }
            var html = vash.compile(file);
            transporter.sendMail({
              from: 'Yppuna <hello@yppuna.vn>',
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

var smart_substr = function(str, len) {
    var temp = str.substr(0, len);
    if(temp.lastIndexOf('<') > temp.lastIndexOf('>')) {
        temp = str.substr(0, 1 + str.indexOf('>', temp.lastIndexOf('<')));
    }
    return temp;
}

router.get('/blog', function(req, res, next) {
  Article.find({ published: true }, {}, { sort: { 'created_at': -1 } }, function(err, articles) {
    res.render('articles/index', { articles: articles, smart_substr: smart_substr });
  });
});

router.get('/blog/list', isAdmin, function(req, res, next) {
  Article.find({ }, {}, { sort: { 'created_at': -1 } }, function(err, articles) {
    res.render('articles/list', { articles: articles });
  });
});

router.get('/blog/new', isAdmin, function(req, res, next) {
  res.render('articles/new');
});

router.post('/blog/new', isAdmin, function(req, res, next) {
  var content = "";
  JSON.parse(req.body.article).data.forEach(function(data) {
      console.log(data);
      if(data.type == "text") {
          content += data.data.text;
      }
      else if(data.type == "image") {
          content += '<img src="'+data.data.file.url+'" />';
      }
      else if(data.type == "video" && data.data.source == "youtube") {
          content += '<iframe src="https://www.youtube.com/embed/'+data.data.remote_id+'" width="580" height="412" frameborder="0" allowfullscreen></iframe>'
      }
  });

  var article = new Article({
    title: req.body.title,
    url: getSlug(req.body.title, { lang: 'vn' }),
    content: content,
    data: req.body.article,
    published: true
  });
  article.save(function(err){
    res.redirect('/blog/list');
  });
});

router.get('/blog/edit/:id', isAdmin, function(req, res, next) {
  Article.findOne({ _id: req.params.id }, function(err, article) {
    res.render('articles/edit', { article: article });
  });
});

router.post('/blog/edit/:id', isAdmin, function(req, res, next) {
  Article.findOne({ _id: req.params.id }, function(err, article) {
    
    var content = "";
    JSON.parse(req.body.article).data.forEach(function(data) {
      if(data.type == "text") {
          content += data.data.text;
      }
      else if(data.type == "image") {
          content += '<img src="'+data.data.file.url+'" />';
      }
      else if(data.type == "video" && data.data.source == "youtube") {
          content += '<iframe src="https://www.youtube.com/embed/'+data.data.remote_id+'" width="580" height="412" frameborder="0" allowfullscreen></iframe>'
      }
    });

    article.title = req.body.title;
    article.url = getSlug(req.body.title, { lang: 'vn' });
    article.data = req.body.article;
    article.content = content;
    
    article.save(function(err){
      res.redirect('/blog/list');
    });
  });
});

router.get('/blog/delete/:id', isAdmin, function(req, res, next) {
  Article.findOneAndRemove({ _id: req.params.id }, function(err, article) {
    res.redirect('/blog/list');
  });
});

router.post('/blog/image-upload', upload.single('attachment[file]'), function(req, res, next) {
  res.json({ file: { url: '/' + req.file.path } });
});

router.get('/blog/:url', isAdmin, function(req, res, next) {
  Article.findOne({ url: req.params.url }, function(err, article) {
    res.render('articles/view', { article: article });
  });
});

module.exports = router;
