var express = require('express');
var router = express.Router();
var multer  = require('multer');
var s3 = require('multer-s3');
var moment = require("moment");
var Product = require("../models/product");
var User = require("../models/user");
var i18n = require('i18n');
var mime = require('mime-types');
var crypto = require("crypto");
var config = require('config-heroku');
var paginate = require('express-paginate');
var querystring = require('querystring');
var app = express();

var storage = s3({
    dirname: 'uploads',
    bucket: 'dailyboom',
    secretAccessKey: config.Amazon.secretAccessKey,
    accessKeyId: config.Amazon.accessKeyId,
    region: 'ap-northeast-2',
    filename: function (req, file, cb) {
        console.log(file);
        cb(null, Date.now() + file.originalname);
    }
})

// multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, './uploads/')
//   },
//   filename: function (req, file, cb) {
//     crypto.pseudoRandomBytes(16, function (err, raw) {
//       cb(null, raw.toString('hex') + Date.now() + '.' + mime.extension(file.mimetype));
//     });
//   }
// });

var upload = multer({ storage: storage });


var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
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

router.get('/products/list', isMerchantOrAdmin, function(req, res) {
  var query = Product.find({}, {}, { sort: { 'scheduled_at' : -1 } });
  var page = req.query.page ? req.query.page : 1;
  if (req.user.role == 'merchant') {
    query.where('merchant_id').equals(req.user._id);
  }
  if (req.query.type == 1) {
    query.where('extend').gte(1).lte(3);
  }
  else if (req.query.type == 2) {
    query.where('extend').equals(4);
  }
  query.paginate(page, 9, function(err, Products, total) {
    res.render('products/index', { products: Products, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 9), page), currentPage: page, lastPage: Math.ceil(total / 9) });
  });
});

router.get('/products/new', isMerchantOrAdmin, function(req, res) {
  res.render("products/new");
});

router.get('/products/delete/:id', isAdmin, function(req, res) {
  Product.findOneAndRemove({ _id: req.params.id }, function(err, user) {
    res.redirect('/products/list');
  });
});

router.get('/products/edit/:id', isMerchantOrAdmin, function(req, res) {
  Product.findOne({_id: req.params.id}, function(err, product) {
      res.render("products/edit", { product: product });
    });
});

router.get('/products/preview', isMerchantOrAdmin, function(req, res) {
  res.render("products/preview");
});

router.post('/products/new', isMerchantOrAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: 'photosmobile', maxCount: 4}, {name: "brandlogo", maxCount: 1}, { name: "description_image", maxCount: 1}, { name: "homepage_image", maxCount: 1}, { name: "box_header", maxCount: 1}, { name: "box_background", maxCount: 1}]), function(req, res) {
  console.log(req.body);
  // req.Validator.validate('selldate', i18n.__('product.sellDate'), {
  //   required: true
  // })
  // .validate('brandname', i18n.__('product.brandName'), {
  //   required: true
  // })
  // .validate('merchant_id', i18n.__('product.merchantId'), {
  //   required: true
  // })
  // .validate('name', i18n.__('product.name'), {
  //   required: true
  // })
  // .validate('description', i18n.__('product.description'), {
  //   required: true
  // })
  // .validate('option_name', i18n.__('product.optionName'), {
  //   required: true
  // })
  // .validate('o_quantity', i18n.__('product.optionQuantity'), {
  //   required: true
  // })
  // .validate('oldPrice', i18n.__('product.oldPrice'), {
  //   required: true
  // })
  // .validate('price', i18n.__('product.price'), {
  //   required: true
  // });
  
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      res.render('products/new', { errors: errors });
      res.end();
    }
    else {
      if (req.files['photosmain']) {
        var paths = req.files['photosmain'].map(function(item) {
            return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
        });
      }
      
      var quantity = 0;
      req.body.options.forEach(function(option) {
        quantity += parseInt(option.quantity);
      });
      
      var product = new Product({
        name: req.body.name,
        description: req.body.description,
        how_to: req.body.how_to,
        why_love: req.body.why_love,
        ingredients: req.body.ingredients,
        category: req.body.category,
        price: req.body.price,
        old_price: req.body.oldPrice,
        quantity: quantity,
        images: paths,
        scheduled_at: req.body.selldate,
        brand: req.body.brandname,
        brand_logo: req.files['brandlogo'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['brandlogo'][0].key : '',
        description_image: req.files['description_image'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['description_image'][0].key : '',
        homepage_image: req.files['homepage_image'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['homepage_image'][0].key : '',
        box_header: req.files['box_header'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_header'][0].key : '',
        box_header: req.files['box_background'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_header'][0].key : '',
        options: req.body.options,
        options_skin: req.body.options_skin,
        is_published: false,
        video: req.body.videoUrl,
        company_url: req.body.webUrl,
        company_facebook: req.body.fbUrl,
        company_youtube: req.body.ytUrl,
        company_instagram: req.body.igUrl,
        company_kakaostory: req.body.kakaoUrl,
        review_url: req.body.reviewUrl,
        extend: req.body.extend ? req.body.extend : 0,        
        is_hot: req.body.is_hot,
        color: req.body.color,
        boxProducts: req.body.extend == 3 && req.body.boxProducts[0] !== '' ? JSON.parse(JSON.stringify(req.body.boxProducts)) : null,
        boxZone: req.body.boxZone,
        product_region: req.body.product_region
      });
    
      if (req.files['photosmobile']) {
        var paths = req.files['photosmobile'].map(function(item) {
            return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
        });
        product.mobile_images = paths;
      }
    
      if (product.price >= 50000)
        product.delivery_price = 0;
    
      if (req.body.merchant_id)
        product.merchant_id = req.body.merchant_id;
    
      console.log(product);
      product.save(function(err) {
        if (err) console.log(err), res.render('/products/new', { title: 'Index', error: err.errmsg });
        else {
          res.redirect('/products/preview/'+product.id);
        }
      });
    }
  });
});

router.post('/products/edit/:id', isMerchantOrAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: 'photosmobile', maxCount: 4}, {name: "brandlogo", maxCount: 1}, { name: "description_image", maxCount: 1}, { name: "homepage_image", maxCount: 1}, { name: "box_header", maxCount: 1}, { name: "box_background", maxCount: 1}]), function(req, res) {
  Product.findOne({_id: req.params.id}, function (err, product) {
    if (err)
      console.log(err);

    var quantity = 0;
    req.body.options.forEach(function(option) {
      quantity += parseInt(option.quantity);
    });

    if (req.body.merchant_id)
      product.merchant_id = req.body.merchant_id;
    product.name = req.body.name;
    product.description = req.body.description;
    product.how_to = req.body.how_to;
    product.why_love = req.body.why_love;
    product.ingredients = req.body.ingredients;
    product.category = req.body.category;
    product.price = req.body.price;
    product.old_price = req.body.oldPrice,
    product.scheduled_at = req.body.selldate;
    product.brand = req.body.brandname;
    product.options = req.body.options;
    product.options_skin = req.body.options_skin;
    product.video = req.body.videoUrl;
    product.company_url = req.body.webUrl;
    product.company_facebook = req.body.fbUrl;
    product.company_youtube = req.body.ytUrl;
    product.company_instagram = req.body.igUrl;
    product.company_kakaostory = req.body.kakaoUrl;    
    product.review_url = req.body.reviewUrl;
    product.extend = req.body.extend ? req.body.extend : 0;
    product.is_hot = req.body.is_hot;
    product.color = req.body.color;
    product.boxZone = req.body.boxZone;
    product.product_region = req.body.product_region;
    console.log(req.body.boxProducts);
    if(req.body.extend == 3) {
      product.boxProducts = req.body.boxProducts[0] !== '' ? JSON.parse(JSON.stringify(req.body.boxProducts)) : null;
    }
    
    if (product.price >= 50000)
      product.delivery_price = 0;
    else
      product.delivery_price = 2500;

    if (quantity > product.quantity || !product.quantity)
      product.quantity = quantity;

    if (req.files['photosmain']) {
      var paths = req.files['photosmain'].map(function(item) {
        return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
      });
      product.images = paths;
    }
    
    if (req.files['photosmobile']) {
      var paths = req.files['photosmobile'].map(function(item) {
        return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
      });
      product.mobile_images = paths;
    }

    if (req.files['brandlogo']) {
      product.brand_logo = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['brandlogo'][0].key;
    }

    if (req.files['description_image']) {
      product.description_image = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['description_image'][0].key;
    }

    if (req.files['homepage_image']) {
      product.homepage_image = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['homepage_image'][0].key;
    }

    if (req.files['box_header']) {
      product.box_header = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_header'][0].key;
    }

    if (req.files['box_background']) {
      product.box_header = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_background'][0].key;
    }

    console.log(product);
    product.save(function(err) {
      if (err) { 
        console.log(err);
        res.render('products/edit', { title: 'Index', error: err.errmsg });
        res.end();
      }
      if (product.is_publshed == true)
        res.redirect('/products/list');
      else
        res.redirect('/products/preview/'+product.id);        
    });
  });
});

router.get('/products/:id/delete_img/:pos', isAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    product.images.splice(req.params.pos, 1);
    product.save(function (err){
      res.redirect('/products/edit/'+req.params.id);
    });
  });
});

router.get('/products/:id/delete_mobile_img/:pos', isAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    product.mobile_images.splice(req.params.pos, 1);
    product.save(function (err){
      res.redirect('/products/edit/'+req.params.id);
    });
  });
});

router.get('/products/:id/delete_desc_img', isAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    product.description_image = undefined;;
    product.save(function (err){
      res.redirect('/products/edit/'+req.params.id);
    });
  });
});

router.get('/products/preview/:id', function(req, res) {
  var query = Product.findOne({ _id: req.params.id });
  if (req.user && req.user.role == 'merchant') {
    query.where('merchant_id').equals(req.user._id);
  }
  query.exec(function(err, product) {
    if (err)
      console.log(err);
    var sale = (product.old_price - product.price) / product.old_price * 100;
    res.render('products/preview', { product: product, progress: 10, sale: sale.toFixed(0) });
  });
});

router.get('/products/publish/:id', isAdmin, function(req, res) {
  Product.findOneAndUpdate({ _id: req.params.id }, { is_published: true }, function(err, product) {
    if (err)
      console.log(err);
    res.redirect('/products/list');
  });
});

router.post('/products/wanna_buy', function(req, res) {
  if (!req.isAuthenticated())
    return res.status(500).json({ message: '로그인이 필요합니다' });
  Product.findOne({ _id: req.body.id }, function(err, product) {
    console.log(product.wanna_buy);
    if (product.wanna_buy.indexOf(req.user.id) == -1) {
      product.wanna_buy.push(req.user.id);
    }
    else {
      product.wanna_buy.splice(product.wanna_buy.indexOf(req.user.id), 1);
    }
    console.log(product.wanna_buy);
    product.save(function() {
      res.status(200).json({});
    });
  });
});

router.get('/products/naver', function(req, res) {
    Product.findOne({_id: "568a78411502e2b570306355"}, function(err, product){
       res.render('products/naver', { product: product }); 
    });
});


module.exports = router;
