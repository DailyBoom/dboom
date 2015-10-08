var express = require('express');
var router = express.Router();
var passport = require('passport');

var User = require("../models/user");

var isAuthenticated = function (req, res, next) {
  if (req.isAuthenticated())
    return next();
  res.redirect('/login');
}

router.get('/login', function(req, res, next) {
  res.render('login', { title: 'Login' });
});

router.post('/login', passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login'
}));

router.get('/logout', function(req, res){
  req.logout();
  res.redirect('/');
});

router.get('/mypage', isAuthenticated, function(req, res) {
  res.render('users/show', { user : req.user });
});

router.get('/signup', function(req, res, next) {
  res.render('signup');
});

router.get('/auth/facebook',
  passport.authenticate('facebook',
    { display: 'popup'},
    { scope: ['email', 'public_profile'] },
    { profileFields: ["id", "birthday", "email", "first_name", "gender", "last_name"] }
  ));

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.render('callback');
  });

module.exports = router;
