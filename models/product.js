var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// create a schema
var productSchema = new Schema({
  merchant_id: { type: Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  description: { type: String, required: true },
  description_image: String,
  brand: { type: String, required: false },
  brand_logo: { type: String, required: false },
  company_url: { type: String, required: false },
  company_facebook: String,
  company_instagram: String,
  company_youtube: String,
  company_kakaostory: String,
  review_url: String,
  price: Number,
  delivery_price: { type: Number, default: 2500 },
  old_price: Number,
  quantity: Number,
  images: { type: Array },
  mobile_images: { type: Array },
  scheduled_at: Date,
  options: Object,
  video: String,
  delivery_info: String,
  is_published: Boolean,
  extend: Number,
  is_hot: Boolean,
  color: String,
  wanna_buy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  created_at: { type : Date, default : Date.now },
  updated_at: Date
});

var Product = mongoose.model("Product", productSchema);

module.exports = Product;
