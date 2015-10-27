var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var User = require('./user');

var tokenSchema = new Schema({
	token: String,
	userId: String,
	created_at: { type : Date, default : Date.now }
});

tokenSchema.methods.consume = function(token, cb) {
	this.model('Token').findOneAndRemove( { token: token }, function(err, token) {
		if (err) return cb(err);
		User.findById(token.userId, function(err, user) {
			if (err) return cb(err);
			if (!user) return cb(null, false);
			return cb(null, user);
		});
	});
}

var Token = mongoose.model("Token", tokenSchema);

module.exports = Token;