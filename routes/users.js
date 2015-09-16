var express = require('express');
var router = express.Router();
var passport = require('passport');

var User = require("../models/user");

router.get('/login', function(req, res, next) {
  res.render('login', { title: 'Login' });
});

router.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}));

router.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

module.exports = router;
