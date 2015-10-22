var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// create a schema
var productSchema = new Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  company: { type: String, required: false },
  company_logo: { type: String, required: false },
  company_url: { type: String, required: false },
  price: Number,
  quantity: Number,
  current_quantity: Number,
  images: { type: Array, required: true },
  scheduled_at: Date,
  created_at: { type : Date, default : Date.now },
  updated_at: Date
});

var Product = mongoose.model("Product", productSchema);

module.exports = Product;