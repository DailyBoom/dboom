var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var commentSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	order : { type: Schema.Types.ObjectId, ref: 'Order' },
	type: Number,
	name: String,
	body: String,
	created_at: { type: Date, default: Date.now }
});

var Comment = mongoose.model("Comment", commentSchema);

module.exports = Comment;