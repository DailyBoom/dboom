var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");
var moment = require('moment');
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
  var now = moment().format("MM/DD/YYYY");
  Product.findOne({scheduled_at: now}, {}, { sort: { 'created_at' : 1 }}, function (err, product) {
    Product.find({scheduled_at: {$lt: now} }).limit(6).sort({ 'created_at' : -1 }).exec(function (err, pastProducts) {
      res.render('index', { progress: 70, product: product, pastProducts: pastProducts, moment: moment });
    });
  });
});

router.get('/about', function(req, res, next) {
  res.render('about');
});

router.get('/advertise', function(req, res, next) {
  res.render('advertise');
});

router.get('/privacy', function(req, res, next) {
  res.render('privacy');
});

router.get('/terms', function(req, res, next) {
  res.render('terms');
});

router.get('/merchant', function(req, res, next) {
  res.render('merchant');
});

router.get('/beta', function(req, res, next) {
  Product.findOne({}, {}, { sort: { 'created_at' : -1 }}, function (err, product) {
    Product.find({}).where('_id').ne(product._id).limit(6).sort({ 'created_at' : -1 }).exec(function (err, pastProducts) {
      res.render('beta', { progress: 75, product: product, pastProducts: pastProducts });
    });
  });
});


module.exports = router;
