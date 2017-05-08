var express = require('express');
var app = express();
var router = express.Router();
var mongoose = require("mongoose");
var moment = require('moment');
var User = require('../models/user');
var Product = require('../models/product');
var Coupon = require('../models/coupon');
var Comment = require('../models/comment');
var Partner = require('../models/partner');
var Article = require('../models/article');
var Behavior = require('../models/behavior');
var Homepage = require('../models/homepage');
var Mall = require('../models/mall');
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
var striptags = require('striptags');
var paginate = require('express-paginate');
  
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
    service: 'gmail',
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

var isContentOrAdmin = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "content"))
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isMerchantOrAdmin = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "merchant"))
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var group = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 49, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 50, 48],
  [109, 110, 111]
];

var group_name = [
  'Chăm sóc da',
  'Trang điểm',
  'Cơ thể'
]

var category = {
    "100": "Sản phẩm rửa mặt",
    "1": "Tẩy trang mặt",
    "2": "Tẩy trang mắt & môi",
    "3": "Sữa rửa mặt",
    "4": "Tẩy da chết",
    "5": "Nước hoa hồng / Xịt khoáng",
    "101": "Sản phẩm dưỡng ẩm",
    "6": "Tinh chất",
    "7": "Sữa dưỡng",
    "8": "Dầu dưỡng",
    "9": "Gel / Kem dưỡng",
    "10": "Kem dưỡng vùng mắt",
    "11": "Mặt nạ",
    "102": "Phụ kiện dưỡng da",
    "12": "Kem chống nắng",
    "13": "Mút rửa mặt",
    "14": "Máy rửa mặt",
    "15": "Bông tẩy trang",
    "16": "Giấy thấm dầu",
    "103": "Tất cả sản phẩm",
    "104": "Mặt",
    "17": "Kem lót",
    "18": "Kem / Phấn nền",
    "19": "Kem chống nắng cho da mặt",
    "20": "Kem che khuyết điểm",
    "21": "Phấn phủ",
    "22": "Má hồng",
    "23": "Bắt sáng/ Tạo khối",
    "105": "Mắt",
    "24": "Lót mắt",
    "25": "Phấn mắt",
    "26": "Mascara",
    "29": "Kẻ mắt",
    "30": "Chân mày",
    "106": "Môi",
    "31": "Son môi",
    "107": "Phụ kiện trang điểm",
    "32": "Son dưỡng & điều trị",
    "33": "Mút / Cọ trang điểm",
    "108": "Tất cả sản phẩm",
    "109": "Chăm sóc tóc",
    "110": "Chăm sóc cơ thể",
    "111": "Sản phẩm cho Nam",
}

router.get('/mall', function(req, res, next) {
  var mall = null;
  var query = { extend: 4, is_published: true };
  var page = req.query.page ? req.query.page : 1;
  var per_page = res.locals.is_mobile ? 8 : 16;
  var option = { page: page, limit: per_page, sort: { 'position' : 1 } };
  var title = "Sản Phẩm Bán Chạy Nhất";
  var category_title = null;
  if (req.query.group) {
    query['category'] = { $in: group[req.query.group] };
    option.sort = { 'position_group': 1 };
    mall = req.query.group;
    title = group_name[req.query.group];
  }
  if (req.query.category) {
    query['category'] = req.query.category;
    category_title = category[req.query.category];
  }
  if (req.query.s) {
    query['$or'] = [{ 'name': { $regex: req.query.s, $options: "i" } }, { 'brand': { $regex: req.query.s, $options: "i" } }];
  }
  //query.where('product_region.'+req.session.zone, true);
  Product.paginate(query, option).then(function(result) {
    Product.find({ extend: 3, scheduled_at: moment().date(1).hour(0).minute(0).second(0).millisecond(0) }, {}, {}, function(err, boxes) {
      Product.find({ extend: 4, is_hot: true, is_published: true }).populate('merchant_id').exec(function(err, hotProducts) {
        Mall.findOne({ category: mall }, function(err, mall) {
          res.render('mall', { title: title, category_title: category_title, description: "", products: result.docs, hotProducts: hotProducts, boxes: boxes, pages: paginate.getArrayPages(req)(3, result.pages, page), currentPage: page, lastPage: Math.ceil(result.total / per_page), mall: mall, group: group_name });
        });
      });
    });
  });
});

router.get('/mall/boxes', function(req, res, next) {
  var mall = null;
  var query = { $or: [{ extend: 3, scheduled_at: moment().date(1).hour(config.Timezone).minute(0).second(0).millisecond(0) }, { extend: 5 }], is_published: true };
  var page = req.query.page ? req.query.page : 1;
  var per_page = res.locals.is_mobile ? 8 : 16;
  var option = { page: page, limit: per_page, sort: { 'position' : 1 } };
  Product.paginate(query, option).then(function(result) {
    Product.find({ extend: 4, is_hot: true, is_published: true }).populate('merchant_id').exec(function(err, hotProducts) {
      Mall.findOne({ category: mall }, function(err, mall) {
        res.render('mall', { title: "Hộp làm đẹp", description: "", products: result.docs, hotProducts: hotProducts, pages: paginate.getArrayPages(req)(3, result.pages, page), currentPage: page, lastPage: Math.ceil(result.total / per_page), mall: mall });
      });
    });
  });
});

router.get('/mall/new', function(req, res, next) {
  var query = { extend: 4, is_published: true, $or: [ { created_at: { $gte: moment().subtract(2, 'weeks') } }, { is_new: true } ] };
  var page = req.query.page ? req.query.page : 1;
  var per_page = res.locals.is_mobile ? 8 : 16;
  var option = { page: page, limit: per_page, sort: { 'position' : 1 } };
  Product.paginate(query, option).then(function(result) {
    Product.find({ extend: 3, scheduled_at: moment().date(1).hour(0).minute(0).second(0).millisecond(0) }, {}, {}, function(err, boxes) {
      res.render('mall', { title: "Mua Lẻ Mới Nhất", description: "", products: result.docs, boxes: boxes, pages: paginate.getArrayPages(req)(3, Math.ceil(result.total / per_page), page), currentPage: page, lastPage: Math.ceil(result.total / per_page) });      
    });
  });
});

router.get('/fav_boxes', function(req, res, next) {
  Homepage.findOne({}, 'fav_banner').populate('fav_banner.products').exec(function(err, homepage) {
    res.render('mall', { title: "Favorite Boxes", description: "", products: homepage.fav_banner.products });
  });
});

router.get('/deals', function(req, res, next) {
  Homepage.findOne({}, 'deal_banner').populate('deal_banner.products').exec(function(err, homepage) {
    res.render('mall', { title: "Daily Hot Deals", description: "", products: homepage.deal_banner.products });
  });
});

router.get('/banner', function(req, res, next) {
  Homepage.findOne({}, 'main_banner right_1_banner right_2_banner').populate('main_banner.products right_1_banner.products right_2_banner.products').exec(function(err, homepage) {  
    var banner;
    if (req.query.type == "main")
      banner = homepage.main_banner;
    else if (req.query.type == "right_1")
      banner = homepage.right_1_banner;
    else if (req.query.type == "right_2")
      banner = homepage.right_2_banner;
    if (banner.all_product) {
      var mall = null;
      var query = { extend: 4, is_published: true };
      var page = req.query.page ? req.query.page : 1;
      var per_page = res.locals.is_mobile ? 8 : 16;
      var option = { page: page, limit: per_page, sort: { 'position' : 1 } };
      Product.paginate(query, option).then(function(result) {
        banner.products = result.docs;
        return res.render('banner', { banner: banner, pages: paginate.getArrayPages(req)(3, Math.ceil(result.total / per_page), page), currentPage: page, lastPage: Math.ceil(result.total / per_page) });
      })
    }
    else {
      return res.render('banner', { banner: banner });
    }
  });
});

router.get('/organic', function(req, res, next) {
  Homepage.findOne({}, 'organic_banner').populate('organic_banner.products').exec(function(err, homepage) {  
    res.render('organic', { banner: homepage.organic_banner, description: "Chúng ta đang sống trong môi trường khói bụi, có đầy chất độc hại xung quanh, ảnh hưởng nghiêm trọng đến sức khỏe và làn da. Vì vậy giữa muôn vàn các mỹ phẩm làm đẹp hiện nay, mỹ phẩm hữu cơ đang dần được mọi người quan tâm đến và sử dụng nhiều hơn. Vậy mỹ phẩm hữu cơ là gì?", title: "Organic Skincare" });
  });
});

router.get('/about', function(req, res, next) {
  res.render('about', { title: req.__('about'), description: req.__('about.text_1') });
});

router.get('/contact', function(req, res, next) {
  res.render('contact', { title: 'LIÊN HỆ' });
});

router.get('/careers', function(req, res, next) {
  res.render('careers', { title: 'LIÊN HỆ' });
});

router.get('/privacy', function(req, res, next) {
  res.render('privacy', { title: req.__('privacy') });
});

router.get('/terms', function(req, res, next) {
  res.render('terms', { title: req.__('terms') });
});

router.get('/wholesale', function(req, res, next) {
  res.render('wholesale', { title: "ĐĂNG KÝ LÀM ĐẠI LÝ CỦA YPPUNA" });
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

router.post('/careers', function(req, res, next) {
  transporter.sendMail({
    from: req.body.email,
    to: 'hello@yppuna.vn',
    subject: 'Careers',
    html: '<p>Tên: '+req.body.username+'</p><p>Email: '+req.body.email+'</p><p>Số điện thoại: '+req.body.phone_number+'</p><p>message: '+req.body.message+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.status(500).json({ message: ''}); }
      //console.log('Message sent: ' + info.response);
      transporter.close();
      res.status(200).json({ message: 'Xin cảm ơn quý khách. Chúng tôi sẽ trả lời sớm nhất có thể'});
  });
});

router.post('/contact', function(req, res, next) {
  transporter.sendMail({
    from: req.body.email,
    to: 'hello@yppuna.vn',
    subject: 'Contact',
    html: '<p>Tên: '+req.body.username+'</p><p>Email: '+req.body.email+'</p><p>Số điện thoại: '+req.body.phone_number+'</p><p>message: '+req.body.message+'</p>'
  }, function (err, info) {
      if (err) { console.log(err); res.status(500).json({ message: ''}); }
      //console.log('Message sent: ' + info.response);
      transporter.close();
      res.status(200).json({ message: 'Xin cảm ơn quý khách. Chúng tôi sẽ trả lời sớm nhất có thể'});
  });
});

router.get('/', function(req, res, next) {
  Product.find({ scheduled_at: moment().date(1).hour(config.Timezone).minute(0).second(0).millisecond(0) }, {}, {sort : { 'scheduled_at' : 1 }}).populate('boxProducts').exec(function (err, products) {
    // console.log(products);
    var query = Product.find({ extend: 4, is_published: true, is_hot: true });
    // query.where('product_region.'+req.session.zone, true);
    query.limit(4).sort({ 'created_at' : -1 }).exec(function (err, hotProducts) {
      Product.find({ extend: 4, is_published: true, $or: [ { created_at: { $gte: moment().subtract(2, 'weeks') } }, { is_new: true } ] }).exec(function(err, newProducts) {
      //     Comment.find( { product: products[0].id }).populate('user').exec(function(err, comments) {
        Article.find({ published: true, video: {$in: [null, false]} }, 'title url cover', { sort: { 'created_at': -1 } }).limit(3).exec(function(err, articles) {
          Article.findOne({ published: true, video: true }, 'title url cover', { sort: { 'created_at': -1 } }).exec(function(err, video) {
            Homepage.findOne({}, function(err, homepage) {
              res.render('index', { products: products, articles: articles, video: video, hotProducts: hotProducts, newProducts: newProducts, homepage: homepage });
            })
          });
        });
      });
    });
    // });
  });
});

router.get('/shop/products/:url', function(req, res, next) {
  Product.findOne({ url: req.params.url }, function(err, product) {
    if (!product) {
      return res.redirect('/mall');
    }
    Product.find({ extend: 4, is_published: true, is_hot: true }).limit(4).sort({ 'created_at' : -1 }).exec(function (err, hotProducts) {
      Comment.find( { product: product.id }).populate('user').exec(function(err, comments) {
        var current_quantity = 0;
        product.options.forEach(function(option) {
          current_quantity += parseInt(option.quantity);
        });
        var avg = 0;
        for (i = 0; i < product.rating.length; i++) {
          avg += product.rating[i].count;
        }
        avg = avg / product.rating.length;
        res.render('extended', { product: product, title: product.name, description: product.description, ext_cover: product.images[0], comments: comments, hotProducts: hotProducts, category: category, avg: avg });
      });
    });
  });
});

router.get('/shop/box/:url', function(req, res, next) {
  Product.findOne({ url: req.params.url }).populate('boxProducts').exec(function(err, product) {
    if (!product)
      return res.redirect('/');
    Product.find({ extend: 4, is_published: true, is_hot: true }).limit(4).sort({ 'created_at' : -1 }).exec(function (err, hotProducts) {
      Comment.find( { product: product.id }).populate('user').exec(function(err, comments) {
        var current_quantity = 0;
        product.options.forEach(function(option) {
          current_quantity += parseInt(option.quantity);
        });
        var progress = (product.quantity - current_quantity) / product.quantity * 100;
        var sale = (product.old_price - product.price) / product.old_price * 100;
        res.render('box', { product: product, title: product.name, description: product.description, progress: progress.toFixed(0), sale: sale.toFixed(0), date: product.extend == 1 ? product.scheduled_at : false, no_time: product.extend == 2, ext_cover: product.images[0], comments: comments, hotProducts: hotProducts, zone: product.boxZone });
      });
    });
  });
});

router.get('/coupons/new', isMerchantOrAdmin, function(req, res, next) {
  res.render('coupons/new');
});

router.post('/coupons/new', isMerchantOrAdmin, function(req, res, next) {
  var coupon = new Coupon({
    code: req.body.code,
    type: req.body.type,
    price: req.body.price,
    percentage: req.body.percentage,
    expires_at: req.body.expire_date
  });

  coupon.save(function() {
    res.redirect('/coupons/list');
  });
});

router.get('/coupons/list', isMerchantOrAdmin, function(req, res, next) {
  Coupon.find({}).exec(function(err, coupons) {
    res.render('coupons/list', { coupons: coupons });
  });
});

router.get('/coupons/delete/:id', isMerchantOrAdmin, function(req, res, next) {
  Coupon.findOneAndRemove({ _id: req.params.id }).exec(function(err, coupon) {
    res.redirect('/coupons/list');
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
  if (req.query.tag) {
    query.where('tags', req.query.tag);
  }
  var page = req.query.page ? req.query.page : 1;
  var per_page = 10;
  Article.paginate({ published: true, video: {$in: [null, false]} }, { page: page, limit: per_page, sort: { 'created_at' : -1 } }).then(function(result) {
    Article.findOne({ published: true, video: true }, {}, { sort: { 'created_at': -1 } }).exec(function(err, video) {
      res.render('articles/index', { articles: result.docs, video: video, striptags: striptags, pages: paginate.getArrayPages(req)(3, result.pages, page), currentPage: page, lastPage: Math.ceil(result.total / per_page) });
    });
  });
});

router.get('/blog/list', isContentOrAdmin, function(req, res, next) {
  Article.find({ }, {}, { sort: { 'created_at': -1 } }, function(err, articles) {
    res.render('articles/list', { articles: articles });
  });
});

router.get('/blog/videos', function(req, res, next) {
  Article.find({ published: true, video: true }, {}, { sort: { 'created_at': -1 } }, function(err, videos) {
    res.render('articles/video', { videos: videos, striptags: striptags });
  });
});

router.get('/blog/new', isContentOrAdmin, function(req, res, next) {
  res.render('articles/new');
});

router.post('/blog/new', isContentOrAdmin, upload.single('cover'), function(req, res, next) {
  console.log(req.body);
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
    tags: req.body.tags,
    published: req.body.publish,
    video: req.body.video
  });

  if (req.file) {
    article.cover = '/' + req.file.path;
  }
  article.save(function(err){
    res.redirect('/blog/list');
  });
});

router.get('/blog/edit/:id', isContentOrAdmin, function(req, res, next) {
  Article.findOne({ _id: req.params.id }, function(err, article) {
    res.render('articles/edit', { article: article });
  });
});

router.post('/blog/edit/:id', isContentOrAdmin, upload.single('cover'), function(req, res, next) {
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
    article.tags = req.body.tags;
    article.published = req.body.publish;
    article.video = req.body.video;
    
    console.log(req.file);
    if (req.file) {
      article.cover = '/' + req.file.path;
    }

    article.save(function(err){
      res.redirect('/blog/list');
    });
  });
});

router.get('/blog/delete/:id', isContentOrAdmin, function(req, res, next) {
  Article.findOneAndRemove({ _id: req.params.id }, function(err, article) {
    res.redirect('/blog/list');
  });
});

router.get('/blog/comments/delete/:id', isContentOrAdmin, function(req, res, next) {
  Comment.findOneAndRemove({ _id: req.params.id }, function(err, comment) {
    res.redirect('back');
  });
});

router.post('/blog/image-upload', upload.single('attachment[file]'), function(req, res, next) {
  res.json({ file: { url: '/' + req.file.path } });
});

router.post('/blog/new_comment', function(req, res, next) {
  var comment = new Comment({
    article: req.body.id,
    user: req.user.id,
    body: striptags(req.body.comment)
  });

  comment.save(function(err) {
    console.log(comment.body);
    if (err) {
      console.log(err);
      res.status(500).json({ error: err });
    }
    else {
      res.status(200).json({ id: comment._id, body: comment.body, username: req.user.username });
    }
  });
})

router.get('/blog/:url', function(req, res, next) {
  Article.findOne({ url: req.params.url }, function(err, article) {
    if (!article) {
      return res.status(404).render('error_404');
    }
    var description;
    var cover;
    JSON.parse(article.data).data.some(function(data) {
      if(data.type == "text") {
          description = striptags(data.data.text);
          return true;
      }
    });
    JSON.parse(article.data).data.some(function(data) {
      if(data.type == "image") {
          cover = data.data.file.url;
          return true;
      }
    });
    console.log(cover);
    Comment.find({ article: article._id }, {}, { sort: { created_at: -1 }}).populate('user').exec(function(err, comments) {
      res.render('articles/view', { article: article, title: article.title, description: description, cover: cover, comments: comments });
    });
  });
});

// router.get('/', function(req, res, next) {
//   if (req.cookies.ypp_f_time && req.cookies.ypp_zone) {
//     return res.redirect('/home');
//   }
//   if (!req.cookies.ypp_f_time) {
//     res.cookie('ypp_f_time', 'true', { maxAge: 31536000000, httpOnly: true, path: '/' });
//   }
//   var has_zone = false
//   if (typeof req.session.zone !== 'undefined' || req.cookies.ypp_s_time)
//   {
//      has_zone = true;
//   }
//   console.log(req.cookies);
//   res.render('intro', { has_zone : true });
// });

router.get('/brands', function(req, res, next) {
  res.render('brand');
});

module.exports = router;
