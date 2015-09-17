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

router.get('/products/new', isAdmin, function(req, res) {
  res.render("products/new");
});

router.post('/products/new', isAdmin, upload.array('photos', 4), function(req, res) {
  var paths = req.files.map(function(item) {
    return item.path;
  });
  var product = new Product({
    name: req.body.name,
    description: req.body.description,
    price: req.body.price,
    quantity: req.body.quantity,
    current_quantity: req.body.quantity,
    images: paths
  })
  
  console.log(product);
  product.save(function(err) {
    if (err) res.render('/products/new', { title: 'Index', error: err.errmsg });
    else res.redirect('/');
  });
});

module.exports = router;
