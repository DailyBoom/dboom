var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var partnerSchema = new Schema({
	name: String,
	logo: String,
	url: String
});

var Partner = mongoose.model("Partner", partnerSchema);

module.exports = Partner;