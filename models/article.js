var mongoose = require('mongoose');
var mongoosePaginate = require('mongoose-paginate');
var Schema = mongoose.Schema;

var articleSchema = new Schema({
    title: String,
    url: String,
    cover: String,
    data: Object,
    content: String,
    tags: [String],
    published: Boolean,
    video: Boolean,
    created_at: { type: Date, default: Date.now }
});

articleSchema.plugin(mongoosePaginate);

var Article = mongoose.model("Article", articleSchema);

module.exports = Article;