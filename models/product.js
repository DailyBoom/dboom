var mongoose = require('mongoose');
var mongoosePaginate = require('mongoose-paginate');
var Schema = mongoose.Schema;

// create a schema
var productSchema = new Schema({
  merchant_id: { type: Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  url: String,
  description: { type: String },
  how_to: { type: String },
  why_love: String,
  ingredients: String,
  category: [Number],
  description_image: String,
  homepage_image: String,
  brand: { type: String, required: false },
  origin: { type: String, required: false },
  special: { type: String, required: false },
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
  wholesale_price: Number,
  w_eu_price: Number,
  w_cz_price: Number,
  quantity: Number,
  images: { type: Array },
  mobile_images: { type: Array },
  scheduled_at: Date,
  options: Object,
  options_skin: [String],
  option_zone: Number,
  video: String,
  delivery_info: String,
  is_published: Boolean,
  extend: Number,
  is_hot: Boolean,
  is_new: Boolean,
  color: String,
  wanna_buy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  created_at: { type : Date, default : Date.now },
  updated_at: Date,
  box_header: String,
  boxProducts: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  boxZone: Number,
  box_background: String,
  product_region: [Boolean],
  position: Number,
  position_group: Number,
  rating: [{ user: { type: Schema.Types.ObjectId, ref: 'User' }, count: { type : Number, default : 0 } }],
  tags: [String],
  logs: [{ log: String, date: Date }],
  inv_code: String,
});

productSchema.plugin(mongoosePaginate);

var Product = mongoose.model("Product", productSchema);

module.exports = Product;
