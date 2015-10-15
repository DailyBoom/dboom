var express = require('express');
var router = express.Router();
var mongoose = require("mongoose");

var User = require('../models/user');
var Product = require('../models/product');
var Order = require('../models/order');
var i18n = require('i18n');

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
    product: req.query.product_id,
    status: "Submitted"
  })
  
  order.save(function(err) {
    if (err) res.redirect("/");
    else res.redirect("/");
  });
});

router.get('/checkout', function(req, res) {
  if (req.user && req.user.shipping != {}) {
    if (!req.session.order) {
        var order = new Order({
        user: req.user.id,
        product: req.query.product_id,
        status: "Submitted"
      })
      
      order.save(function(err) {
        if (err) res.redirect("/");
        req.session.order = order.id;
      });
    }
    res.render('checkout', { order: order.id });
  }
  else
    res.redirect('/shipping');
});

router.get('/shipping', function(req, res) {
  res.render('shipping');
});

router.post('/shipping', function(req, res) {
  req.Validator.validate('full_name', i18n.__('user.fullName'), {
      required: true
    })
    .validate('phone_number', i18n.__('user.phoneNumber'), {
      required: true,
      numeric: true
    })
    .validate('address1', i18n.__('user.address1'), {
      required: true
    })
    .validate('zipcode', i18n.__('user.zipcode'), {
      required: true,
      numeric: true
    })
    .validate('country', i18n.__('user.country'), {
      required: true
    });
    
    if (req.body.add_id) {
      
    }
});

module.exports = router;