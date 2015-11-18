var express = require('express');
var router = express.Router();
var multer  = require('multer');
var upload = multer({ dest: 'uploads/' });
var moment = require("moment");
var Product = require("../models/product");

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  res.redirect('/login');
}

router.get('/products', isAdmin, function(req, res) {
  Product.find({}).sort({ 'created_at' : -1 }).exec(function (err, Products) {
      res.render('products/index', { products: Products });
    });
});

router.get('/products/new', isAdmin, function(req, res) {
  res.render("products/new");
});

router.get('/products/edit/:id', isAdmin, function(req, res) {
  Product.findOne({_id: req.params.id}, function(err, product) {
    res.render("products/edit", { product: product, moment: moment });
  });
});

router.get('/products/preview', isAdmin, function(req, res) {
  res.render("products/preview");
});

router.post('/products/new', isAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: "brandlogo", maxCount: 1}]), function(req, res) {
  var paths = req.files['photosmain'].map(function(item) {
    if (item.fieldname != 'brandlogo')
      return item.path;
  });
  var product = new Product({
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    quantity: req.body.quantity,
    current_quantity: req.body.quantity,
    images: paths,
    scheduled_at: req.body.selldate,
    brand: req.body.brandname,
    brand_logo: req.files['brandlogo'] ? req.files['brandlogo'].path : '',
    options: req.body.options,
    video: req.body.videoUrl,
    company_url: req.body.webUrl,
    company_facebook: req.body.fbUrl,
    company_kakaostory: req.body.kakaoUrl
  });

  console.log(product);
  product.save(function(err) {
    if (err) console.log(err), res.render('/products/new', { title: 'Index', error: err.errmsg });
    else res.redirect('/');
  });
});

router.post('/products/edit/:id', isAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: "brandlogo", maxCount: 1}]), function(req, res) {
  Product.findOne({_id: req.params.id}, function (err, product) {
    product.name = req.body.name;
    product.description = req.body.description;
    product.price = req.body.price;
    product.quantity = req.body.quantity;
    product.current_quantity = req.body.quantity;
    product.scheduled_at = req.body.selldate;
    product.brand = req.body.brandname;
    product.options = req.body.options;
    product.video = req.body.videoUrl;
    product.company_url = req.body.webUrl;
    product.company_facebook = req.body.fbUrl;
    product.company_kakaostory = req.body.kakaoUrl;
    
    if (req.files['photosmain']) {
      var paths = req.files['photosmain'].map(function(item) {
        if (item.fieldname != 'brandlogo')
          return item.path;
      });
      product.images = paths;
    }
    
    if (req.files['brandlogo']) {
      product.brand_logo = req.files['brandlogo'][0].path;
    }
  
    console.log(product);
    product.save(function(err) {
      if (err) console.log(err), res.render('products/', { title: 'Index', error: err.errmsg });
      else res.redirect('/products');
    });
  });
});

module.exports = router;
