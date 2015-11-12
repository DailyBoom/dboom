var express = require('express');
var router = express.Router();
var multer  = require('multer')
var upload = multer({ dest: 'uploads/' })

var Product = require("../models/product");

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  res.redirect('/login');
}

router.get('/products', isAdmin, function(req, res) {
  Product.find({}).sort({ 'created_at' : -1 }).exec(function (err, Products) {
      res.render('products/index', { Products: Products });
    });
});

router.get('/products/new', isAdmin, function(req, res) {
  res.render("products/new");
});

router.get('/products/preview', isAdmin, function(req, res) {
  res.render("products/preview");
});

router.post('/products/new', isAdmin, upload.fields([{name: 'photosmain', maxCount: 1}, {name: "photosmore", maxCount: 3}, {name: "brandlogo", maxCount: 1}]), function(req, res) {
  console.log(req.files.photosmain[0]);
  // var paths = req.files['photosmore'].map(function(item) {
  //   if (item.fieldname != 'brandlogo')
  //     return item.path;
  // });
  var paths = req.files.photosmain[0].path;
  var product = new Product({
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    quantity: req.body.quantity,
    current_quantity: req.body.quantity,
    images: paths,
    scheduled_at: req.body.selldate,
    brand: req.body.brandname,
    //brand_logo: req.files['brandlogo'].path,
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

module.exports = router;
