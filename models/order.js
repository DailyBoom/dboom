var mongoose = require('mongoose');
var mongooseToCsv = require("mongoose-to-csv");
var moment = require("moment");
var Schema = mongoose.Schema;

var orderSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	product: { type: Schema.Types.ObjectId, ref: 'Product' },
	status: String,
	trackLink: String,
	created_at: { type : Date, default : Date.now },
	option: String,
	quantity: Number,
	shipping: {
		full_name: String,
		address: String,
		address_extra: String,
		country: String,
		zipcode: String,
		phone_number: String
  	},
	email: String,
	payco: {
		orderNo: String,
		sellerOrderReferenceKey: String,
		orderCertifyKey: String,
		totalOrderAmt: Number,
		paymentDetails: Object,
		cancelTradeSeq: Number,
		cancelPaymentDetails: Object
	},
	deposit_name: String,
	merchant_id: { type: Schema.Types.ObjectId, ref: 'User' },
	coupon: { type: Schema.Types.ObjectId, ref: 'Coupon' }
});

orderSchema.plugin(mongooseToCsv, {
	headers: ['주문번호', '주문날짜', '상태', '옵션', '수량', '받는 분', '배송주소', '배송국가', '우편번호', '전화번호'],
	constraints: {
		'주문번호': 'id',
		'옵션': 'option',
		'수량': 'quantity'
	},
	virtuals: {
		'상태': function(doc) {
			if (doc.status == "Paid")
				return '결제 완료';
			else if (doc.status == "Sent")
				return '배송 완료';
		},
		'주문날짜': function(doc) { return moment(doc.created_at).format("YYYY.DD.MM"); },
		'받는 분': function(doc) { return doc.shipping.full_name; },
		'배송주소': function(doc) { if (doc.shipping.address) return doc.shipping.address.replace(/,/g , ""); },
		'전화번호': function(doc) { if (doc.shipping.phone_number) return doc.shipping.phone_number.toString(); },
		'배송국가': function(doc) { return doc.shipping.country; },
		'우편번호': function(doc) { return doc.shipping.zipcode; }
	}
});

var Order = mongoose.model("Order", orderSchema);

module.exports = Order;