var express = require('express');
var router = express.Router();
var multer  = require('multer');
var moment = require("moment");
var Product = require("../models/product");
var User = require("../models/user");
var i18n = require('i18n');

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


var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  res.redirect('/login');
}

router.get('/products/list', isAdmin, function(req, res) {
  Product.find({}, {}, { sort: { 'scheduled_at' : -1 } }, function (err, Products) {
    res.render('products/index', { products: Products });
  });
});

router.get('/products/new', isAdmin, function(req, res) {
  Product.find({scheduled_at: {$exists: true}}, 'scheduled_at', function(err, products) {
    User.find({ role: 'merchant' }, function(err, merchants) {
      var scheduled = products.map(function(product) {
        if (product.scheduled_at) {
          return [product.scheduled_at.getFullYear(), product.scheduled_at.getMonth(), product.scheduled_at.getDate()];
        }
      });
      res.render("products/new", { scheduled: scheduled, merchants: merchants });
    });
  });
});

router.get('/products/delete/:id', isAdmin, function(req, res) {
  Product.findOneAndRemove({ _id: req.params.id }, function(err, user) {
    res.redirect('/products/list');
  });
});

router.get('/products/edit/:id', isAdmin, function(req, res) {
  Product.findOne({_id: req.params.id}, function(err, product) {
    Product.find({scheduled_at: {$exists: true}, _id: {$ne: product.id}}, 'scheduled_at', function(err, products) {
      var scheduled = products.map(function(product) {
        if (product.scheduled_at) {
          return [product.scheduled_at.getFullYear(), product.scheduled_at.getMonth(), product.scheduled_at.getDate()];
        }
      });
      res.render("products/edit", { product: product, scheduled: scheduled });
    });
  });
});

router.get('/products/preview', isAdmin, function(req, res) {
  res.render("products/preview");
});

router.post('/products/new', isAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: "brandlogo", maxCount: 1}, {name: "deliveryinfo", maxCount: 1}]), function(req, res) {
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
            return item.path;
        });
      }
      var quantity = 0;
      req.body.options.forEach(function(option) {
        quantity += parseInt(option.quantity);
      });
      
      var product = new Product({
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        old_price: req.body.oldPrice,
        quantity: quantity,
        images: paths,
        scheduled_at: req.body.selldate,
        brand: req.body.brandname,
        brand_logo: req.files['brandlogo'] ? req.files['brandlogo'][0].path : '',
        delivery_info: req.files['deliveryinfo'] ? req.files['deliveryinfo'][0].path : '',
        options: req.body.options,
        is_published: false,
        video: req.body.videoUrl,
        company_url: req.body.webUrl,
        company_facebook: req.body.fbUrl,
        company_kakaostory: req.body.kakaoUrl,
        review_url: req.body.reviewUrl,
        color: req.body.color    
      });
    
      if (product.price >= 50000)
        product.delivery_price = 0;
    
      if (req.body.merchant_id)
        product.merchant_id = req.body.merchant_id;
    
      console.log(product);
      product.save(function(err) {
        if (err) console.log(err), res.render('/products/new', { title: 'Index', error: err.errmsg });
        else res.redirect('/products/preview/'+product.id);
      });
    }
  });
});

router.post('/products/edit/:id', isAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: "brandlogo", maxCount: 1}, {name: "deliveryinfo", maxCount: 1}]), function(req, res) {
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
    product.price = req.body.price;
    product.old_price = req.body.oldPrice,
    product.scheduled_at = req.body.selldate;
    product.brand = req.body.brandname;
    product.options = req.body.options;
    product.video = req.body.videoUrl;
    product.company_url = req.body.webUrl;
    product.company_facebook = req.body.fbUrl;
    product.company_kakaostory = req.body.kakaoUrl;    
    product.review_url = req.body.reviewUrl;
    product.extend = req.body.extend ? req.body.extend : 0;
    product.color = req.body.color;
    
    if (product.price >= 50000)
      product.delivery_price = 0;

    if (quantity > product.quantity || !product.quantity)
      product.quantity = quantity;

    if (req.files['photosmain']) {
      var paths = req.files['photosmain'].map(function(item) {
          return item.path;
      });
      product.images = paths;
    }

    if (req.files['brandlogo']) {
      product.brand_logo = req.files['brandlogo'][0].path;
    }

    if (req.files['deliveryinfo']) {
      product.delivery_info = req.files['deliveryinfo'][0].path;
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

router.get('/products/preview/:id', isAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    res.render('products/preview', { product: product, progress: 10 });
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

module.exports = router;
