var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");

var User = require('../models/user');
var Product = require('../models/product');
var Order = require('../models/order');

// As with any middleware it is quintessential to call next()
// if the user is authenticated
var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

router.post('/orders/new', isAuthenticated, function(req, res) {
  var order = new Order({
    user: req.user.id,
    product: req.body.product_id,
    status: "Submitted"
  })
  
  console.log(order);
  order.save(function(err) {
    if (err) res.redirect("/");
    else res.redirect("/");
  });
});

router.get('/checkout', function(req, res) {
  res.render('checkout');
});

module.exports = router;