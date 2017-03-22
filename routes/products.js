var express = require('express');
var router = express.Router();
var multer  = require('multer');
var s3 = require('multer-s3');
var moment = require("moment");
var Product = require("../models/product");
var Order = require("../models/order");
var Shipment = require("../models/shipment");
var User = require("../models/user");
var i18n = require('i18n');
var mime = require('mime-types');
var crypto = require("crypto");
var config = require('config-heroku');
var paginate = require('express-paginate');
var querystring = require('querystring');
var getSlug = require('speakingurl');
var mongoose = require('mongoose');
var app = express();

var storage = s3({
    dirname: 'uploads',
    bucket: 'dailyboom',
    secretAccessKey: config.Amazon.secretAccessKey,
    accessKeyId: config.Amazon.accessKeyId,
    region: 'ap-northeast-2',
    cacheControl: 'max-age=2592000',
    filename: function (req, file, cb) {
        console.log(file);
        cb(null, Date.now() + file.originalname.replace(/ /g,"-"));
    }
})

// multer.diskStorage({
//   destination: function (req, file, cb) {
//     cb(null, './uploads/')
//   },
//   filename: function (req, file, cb) {
//     crypto.pseudoRandomBytes(16, function (err, raw) {
//       cb(null, raw.toString('hex') + Date.now() + '.' + mime.extension(file.mimetype));
//     });
//   }
// });

var upload = multer({ storage: storage });


var isAdmin = function (req, res, next) {
  if (req.isAuthenticated() && req.user.admin === true)
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

var isMerchantOrAdmin = function (req, res, next) {
  if (req.isAuthenticated() && (req.user.admin === true || req.user.role === "merchant"))
    return next();
  req.session.redirect_to = req.originalUrl;
  res.redirect('/login');
}

router.get('/products/list', isMerchantOrAdmin, function(req, res) {
  var query = Product.find({}, {}, { sort: { 'scheduled_at' : -1 } });
  var page = req.query.page ? req.query.page : 1;
  if (req.query.id)
    query.where('id').equals(req.query.id);
  if (req.query.type == 1) {
    query.where('extend').gte(1).lte(3);
  }
  else if (req.query.type == 2) {
    query.where('extend').equals(4);
  }
  if (req.query.name) {
    query.or([{ 'name': { $regex: req.query.name, $options: "i" } }, { 'brand': { $regex: req.query.name, $options: "i" } }])
  }
  if (req.query.line)
    query.where('line').equals(req.query.line);
  if (req.query.price)
    query.where('price').equals(req.query.price);
  if (req.query.quantity)
    query.where('quantity').equals(req.query.quantity);
  if (req.query.scheduled_date)
    query.where('scheduled_at').equals(req.query.scheduled_date);
  query.paginate(page, 9, function(err, Products, total) {
    res.render('products/index', { products: Products, pages: paginate.getArrayPages(req)(3, Math.ceil(total / 9), page), currentPage: page, lastPage: Math.ceil(total / 9) });
  });
});

router.get('/products/details/:id/:option', isMerchantOrAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }).populate('boxProducts').exec(function(err, product) {
    Order.find({ 'cart.product': req.params.id, 'cart.option': req.params.option }, function(err, orders) {
      var sold = 0;
      for (i = 0; i < orders.length; i++) {
        for (j = 0; j < orders[i].cart.length; j++) {
          if (orders[i].cart[j].product == req.params.id)
            sold += orders[i].cart[j].quantity;
        }
      }
      Shipment.find({ product: req.params.id }, function(err, shipments) {
        var incoming = 0;
        for (h = 0; h < shipments.length; h++) {
          incoming += shipments[h].quantity;
        }
        console.log(incoming);
        var now = moment().hours(0).minute(0).second(0);
        var start = now.clone().subtract(1, 'year');
        console.log(mongoose.mongo.ObjectId(req.params.id));
        Order.aggregate([
            {$match: {
                created_at: { $lt: new Date(now), $gte: new Date(start) },
                "cart.product": mongoose.mongo.ObjectId(req.params.id)
            }},
            {$group: {
                _id: { year: { $year: "$created_at" }, month: { $month: "$created_at" }, day: { $dayOfMonth: "$created_at" } },
                count: {$sum: 1}
            }}
        ], function(err, sales) {
          console.log(JSON.stringify(sales));
          res.render('products/detail', { product: product, option: req.params.option, sold: sold, incoming: incoming, sales: JSON.stringify(sales) });
        })
      })
    })
  })
})

router.get('/products/new', isMerchantOrAdmin, function(req, res) {
  res.render("products/new");
});

router.get('/products/delete/:id', isMerchantOrAdmin, function(req, res) {
  Product.findOneAndRemove({ _id: req.params.id }, function(err, product) {
    res.redirect('/products/list');
  });
});

router.get('/products/edit/:id', isMerchantOrAdmin, function(req, res) {
  Product.findOne({_id: req.params.id}, function(err, product) {
      console.log(moment(product.scheduled_at).toISOString());
      res.render("products/edit", { product: product });
    });
});

router.get('/products/preview', isMerchantOrAdmin, function(req, res) {
  res.render("products/preview");
});

router.post('/products/new', isMerchantOrAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: 'photosmobile', maxCount: 4}, {name: "brandlogo", maxCount: 1}, { name: "description_image", maxCount: 1}, { name: "homepage_image", maxCount: 1}, { name: "box_header", maxCount: 1}, { name: "box_background", maxCount: 1}, { name: "options[photo]" }]), function(req, res) {
  console.log(req.body);
  // req.Validator.validate('selldate', i18n.__('product.sellDate'), {
  //   required: true
  // })
  // .validate('brandname', i18n.__('product.brandName'), {
  //   required: true
  // })
  // .validate('merchant_id', i18n.__('product.merchantId'), {
  //   required: true
  // })
  // .validate('name', i18n.__('product.name'), {
  //   required: true
  // })
  // .validate('description', i18n.__('product.description'), {
  //   required: true
  // })
  // .validate('option_name', i18n.__('product.optionName'), {
  //   required: true
  // })
  // .validate('o_quantity', i18n.__('product.optionQuantity'), {
  //   required: true
  // })
  // .validate('oldPrice', i18n.__('product.oldPrice'), {
  //   required: true
  // })
  // .validate('price', i18n.__('product.price'), {
  //   required: true
  // });
  
  req.Validator.getErrors(function(errors){
    if (errors.length > 0) {
      res.render('products/new', { errors: errors });
      res.end();
    }
    else {
      if (req.files['photosmain']) {
        var paths = req.files['photosmain'].map(function(item) {
            return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
        });
      }
      
      var quantity = 0;
      req.body.options.forEach(function(option, index) {
        if (req.files['options[photo]'] && req.files['options[photo]'][index]) {
          req.body.options[index].photo = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['options[photo]'][index].key;
        }
        quantity += parseInt(option.quantity);     
      });
      
      var product = new Product({
        name: req.body.name,
        url: getSlug(req.body.name, { lang: 'vn' }),
        description: req.body.description,
        how_to: req.body.how_to,
        why_love: req.body.why_love,
        ingredients: req.body.ingredients,
        category: req.body.category,
        price: req.body.price,
        old_price: req.body.oldPrice,
        wholesale_price: req.body.wholesale_price,
        quantity: quantity,
        images: paths,
        scheduled_at: req.body.selldate,
        brand: req.body.brandname,
        origin: req.body.origin,
        special: req.body.special,
        brand_logo: req.files['brandlogo'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['brandlogo'][0].key : '',
        description_image: req.files['description_image'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['description_image'][0].key : '',
        homepage_image: req.files['homepage_image'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['homepage_image'][0].key : '',
        box_header: req.files['box_header'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_header'][0].key : '',
        box_header: req.files['box_background'] ? "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_header'][0].key : '',
        options: req.body.options,
        options_skin: req.body.options_skin,
        is_published: false,
        video: req.body.videoUrl,
        company_url: req.body.webUrl,
        company_facebook: req.body.fbUrl,
        company_youtube: req.body.ytUrl,
        company_instagram: req.body.igUrl,
        company_kakaostory: req.body.kakaoUrl,
        review_url: req.body.reviewUrl,
        extend: req.body.extend ? req.body.extend : 0,        
        is_hot: req.body.is_hot,
        is_new: req.body.is_new,
        color: req.body.color,
        boxProducts: req.body.extend == 3 && req.body.boxProducts[0] !== '' ? JSON.parse(JSON.stringify(req.body.boxProducts.filter(String))) : null,
        boxZone: req.body.boxZone,
        product_region: req.body.product_region,
        tags: req.body.tags
      });
    
      if(req.body.extend == 3) {
        product.url = product.url + '-' + product.boxZone;
      }

      if (req.files['photosmobile']) {
        var paths = req.files['photosmobile'].map(function(item) {
            return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
        });
        product.mobile_images = paths;
      }
    
      if (product.price >= 50000)
        product.delivery_price = 0;
    
      if (req.body.merchant_id)
        product.merchant_id = req.body.merchant_id;
    
      console.log(product);
      product.save(function(err) {
        if (err) {
          console.log(err);
          return res.render('/products/new', { title: 'Index', error: err.errmsg });
        }
        else {
          res.redirect('/products/preview/'+product.id);
        }
      });
    }
  });
});

router.post('/products/edit/:id', isMerchantOrAdmin, upload.fields([{name: 'photosmain', maxCount: 4}, {name: 'photosmobile', maxCount: 4}, {name: "brandlogo", maxCount: 1}, { name: "description_image", maxCount: 1}, { name: "homepage_image", maxCount: 1}, { name: "box_header", maxCount: 1}, { name: "box_background", maxCount: 1}, {name: "options[photo]"}]), function(req, res) {
  Product.findOne({ _id: req.params.id }, function (err, product) {
    if (err)
      console.log(err);

    var quantity = 0;
    req.body.options.forEach(function(option, index) {
      if (req.files['options[photo]'] && req.files['options[photo]'][index]) {
        req.body.options[index].photo = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['options[photo]'][index].key;
      }
      quantity += parseInt(option.quantity);      
    });
    console.log(quantity);

    if (req.body.merchant_id)
      product.merchant_id = req.body.merchant_id;
    product.name = req.body.name;
    product.url = getSlug(req.body.name, { lang: 'vn' });
    product.description = req.body.description;
    product.how_to = req.body.how_to;
    product.why_love = req.body.why_love;
    product.ingredients = req.body.ingredients;
    product.category = req.body.category;
    product.price = req.body.price;
    product.old_price = req.body.oldPrice,
    product.wholesale_price = req.body.wholesale_price,
    product.scheduled_at = req.body.selldate;
    product.quantity = quantity;
    product.brand = req.body.brandname;
    product.origin = req.body.origin;
    product.special = req.body.special;
    product.options = req.body.options;
    product.options_skin = req.body.options_skin;
    product.video = req.body.videoUrl;
    product.company_url = req.body.webUrl;
    product.company_facebook = req.body.fbUrl;
    product.company_youtube = req.body.ytUrl;
    product.company_instagram = req.body.igUrl;
    product.company_kakaostory = req.body.kakaoUrl;    
    product.review_url = req.body.reviewUrl;
    product.extend = req.body.extend ? req.body.extend : 0;
    product.is_hot = req.body.is_hot;
    product.is_new = req.body.is_new;
    product.color = req.body.color;
    product.boxZone = req.body.boxZone;
    product.product_region = req.body.product_region;
    product.tags = req.body.tags;
    console.log(req.body.boxProducts);
    if(req.body.extend == 3) {
      product.boxProducts = req.body.boxProducts[0] !== '' ? JSON.parse(JSON.stringify(req.body.boxProducts.filter(String))) : null;
      product.url = product.url + '-' + product.boxZone;
    }
    
    if (product.price >= 50000)
      product.delivery_price = 0;
    else
      product.delivery_price = 2500;

    if (req.files['photosmain']) {
      var paths = req.files['photosmain'].map(function(item) {
        return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
      });
      product.images = paths;
    }
    
    if (req.files['photosmobile']) {
      var paths = req.files['photosmobile'].map(function(item) {
        return "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + item.key;
      });
      product.mobile_images = paths;
    }

    if (req.files['brandlogo']) {
      product.brand_logo = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['brandlogo'][0].key;
    }

    if (req.files['description_image']) {
      product.description_image = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['description_image'][0].key;
    }

    if (req.files['homepage_image']) {
      product.homepage_image = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['homepage_image'][0].key;
    }

    if (req.files['box_header']) {
      product.box_header = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_header'][0].key;
    }

    if (req.files['box_background']) {
      product.box_header = "https://s3.ap-northeast-2.amazonaws.com/dailyboom/" + req.files['box_background'][0].key;
    }

    product.modifiedPaths().forEach(function(item) {
      product.logs.unshift({ log: req.user.username + " has modified " + item, date: moment() });
    });
    console.log(product.logs);
    product.save(function(err) {
      if (err) { 
        console.log(err);
        res.render('products/edit', { title: 'Index', error: err.errmsg });
        res.end();
      }
      if (product.is_publshed == true)
        res.redirect('/products/list');
      else
        res.redirect('/products/preview/'+product.id);        
    });
  });
});

router.get('/products/:id/delete_img/:pos', isMerchantOrAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    product.images.splice(req.params.pos, 1);
    product.save(function (err){
      res.redirect('/products/edit/'+req.params.id);
    });
  });
});

router.get('/products/:id/delete_mobile_img/:pos', isMerchantOrAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    product.mobile_images.splice(req.params.pos, 1);
    product.save(function (err){
      res.redirect('/products/edit/'+req.params.id);
    });
  });
});

router.get('/products/:id/delete_desc_img', isMerchantOrAdmin, function(req, res) {
  Product.findOne({ _id: req.params.id }, function(err, product) {
    if (err)
      console.log(err);
    product.description_image = undefined;;
    product.save(function (err){
      res.redirect('/products/edit/'+req.params.id);
    });
  });
});

router.get('/products/preview/:id', function(req, res) {
  var query = Product.findOne({ _id: req.params.id });
  query.exec(function(err, product) {
    if (err)
      console.log(err);
    var sale = (product.old_price - product.price) / product.old_price * 100;
    res.render('products/preview', { product: product, progress: 10, sale: sale.toFixed(0) });
  });
});

router.get('/products/publish/:id', isMerchantOrAdmin, function(req, res) {
  Product.findOneAndUpdate({ _id: req.params.id }, { is_published: true }, function(err, product) {
    if (err)
      console.log(err);
    res.redirect('/products/list');
  });
});

router.post('/products/wanna_buy', function(req, res) {
  if (!req.isAuthenticated())
    return res.status(500).json({ message: '로그인이 필요합니다' });
  Product.findOne({ _id: req.body.id }, function(err, product) {
    console.log(product.wanna_buy);
    if (product.wanna_buy.indexOf(req.user.id) == -1) {
      product.wanna_buy.push(req.user.id);
    }
    else {
      product.wanna_buy.splice(product.wanna_buy.indexOf(req.user.id), 1);
    }
    console.log(product.wanna_buy);
    product.save(function() {
      res.status(200).json({});
    });
  });
});

router.get('/products/naver', function(req, res) {
    Product.findOne({_id: "568a78411502e2b570306355"}, function(err, product){
       res.render('products/naver', { product: product }); 
    });
});

router.post('/products/search', function(req, res) {
  Product.find({ extend: 4 }, '_id name brand wholesale_price options').or([{ 'name': { $regex: req.body.term, $options: "i" } }, { 'brand': { $regex: req.body.term, $options: "i" } }]).exec(function(err, products) {
    res.status(200).json({ products: products});
  })
})

var category_group = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
  [26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 49, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 50, 48],
  [51, 52]
];

router.get('/products/order', isMerchantOrAdmin, function(req, res) {
  var query = Product.find({ extend: 4 }, {}, { });
  var group = req.query.group ? req.query.group : null;
  if (req.query.group && req.query.group != '') {
    query.where('category').in(category_group[req.query.group]);
    query.sort({ 'position_group' : 1 });
  }
  else {
    query.sort({ 'position' : 1 });
  }
  query.exec(function(err, products) {
    res.render('products/order', { products: products, group: group });
  });
})

router.post('/products/order', isMerchantOrAdmin, function(req, res) {
  var query;
  console.log(req.body);
  req.body.products.position.forEach(function(item, index) {
    if (req.body.group && req.body.group != '') {
      query = Product.findOneAndUpdate({ _id: req.body.products.id[index] }, { position_group: item });
    }
    else {
      query = Product.findOneAndUpdate({ _id: req.body.products.id[index] }, { position: item });
    }
    query.exec(function() {
      if (index == req.body.products.position.length - 1) {
        res.redirect('back');
      }
    });
  });
});

router.get('/products/generateurl', function() {
  Product.find({ extend: 3 }, function(err, products) {
    products.forEach(function(product) {
      product.url = product.url + '-' + product.boxZone;
      product.save();
    });
  });
});

module.exports = router;
