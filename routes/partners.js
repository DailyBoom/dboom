var express = require('express');
var router = express.Router();
var Partner = require("../models/partner");
var multer  = require('multer');
var mime = require('mime-types');
var crypto = require("crypto");

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads/')
  },
  filename: function (req, file, cb) {
    crypto.pseudoRandomBytes(16, function (err, raw) {
      cb(null, raw.toString('hex') + Date.now() + '.' + mime.extension(file.mimetype));
    });
  }
});

var upload = multer({ storage: storage });

var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  res.redirect('/login');
}

router.get("/partners", isAdmin, function(req, res, next) {
  Partner.find({}, function(err, partners) {
    res.render("partners/index", { partners: partners });
  })
})

router.get("/partners/new", isAdmin, function(req, res, next) {
  res.render("partners/new");
});

router.get("/partners/edit/:id", isAdmin, function(req, res, next) {
  Partner.findOne({ _id: req.params.id }, function(err, partner) {
    res.render("partners/edit", { partner: partner });
  });
});

router.post("/partners/edit/:id", isAdmin, upload.single('logo'), function(req, res, next) {
  Partner.findOne({ _id: req.params.id }, function(err, partner) {
    partner.name = req.body.name;
    partner.url = req.body.url;
    console.log(req.file);
    if (req.file)
      partner.logo = req.file.path;
    console.log(partner)
    partner.save(function(err) {
      res.redirect('/partners');
    });
  });
});

router.post("/partners/new", isAdmin, upload.single('logo'), function(req, res, next) {
  var partner = new Partner({
    name: req.body.name,
    logo: req.file.path,
    url: req.body.url
  })
  
  partner.save(function(err) {
    res.redirect('/partners');
  });
});

module.exports = router;
