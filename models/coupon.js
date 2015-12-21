var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var couponSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	type: Number,
	expires_at: Date,
	price: Number,
	percentage: Number,
	used: { type: Boolean, default: false },
	created_at: { type: Date, default: Date.now }
});

var Coupon = mongoose.model("Coupon", couponSchema);

module.exports = Coupon;