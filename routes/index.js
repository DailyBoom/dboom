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
  req.flash('info', 'Login succesful!');
  Product.findOne({}, {}, { sort: { 'created_at' : -1 }}, function (err, product) {
    res.render('index', { user: req.user, progress: 75, product: product });
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
      res.render('index', { title: 'Express', users: users });
    });
  });
});



module.exports = router;
