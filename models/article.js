var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var articleSchema = new Schema({
    title: String,
    url: String,
    data: String,
    published: Boolean,
    created_at: { type: Date, default: Date.now }
});

var Article = mongoose.model("Article", articleSchema);

module.exports = Article;