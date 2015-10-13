var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");

var User = require('../models/user');
var Product = require('../models/product');

// As with any middleware it is quintessential to call next()
// if the user is authenticated
var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

/* GET Home Page */
router.get('/', function(req, res, next) {
  console.log(req.isAuthenticated());
  Product.findOne({}, {}, { sort: { 'created_at' : -1 }}, function (err, product) {
    Product.find({}).where('_id').ne(product._id).limit(6).sort({ 'created_at' : -1 }).exec(function (err, pastProducts) {
      res.render('index', { progress: 70, product: product, pastProducts: pastProducts });
    });
  });
});

router.post('/', function(req, res, next) {
  var user = new User({
    username: req.body.username,
    password: req.body.password
  });
  user.save(function(err) {
    if (err) res.render('index', { title: 'Index', error: err.errmsg });
    User.find().exec(function (err, users) {
      if (err) { next(err) }
      res.render('index', { title: 'Express' });
    });
  });
});



module.exports = router;
