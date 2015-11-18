// grab the things we need
var mongoose = require('mongoose');
var bcrypt = require("bcrypt");
var uniqueValidator = require('mongoose-unique-validator');
var i18nPlugin = require("mongoose-i18n");
var Schema = mongoose.Schema;
var SALT_WORK_FACTOR = 10;

// create a schema
var userSchema = new Schema({
  name: String,
  email: { type: String, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String },
  admin: Boolean,
  shipping: {
    full_name: String,
    address: String,
    address_extra: String,
    country: String,
    zipcode: Number,
    phone_number: Number
  },
  role: { type: String, required: true },
  created_at: { type : Date, default : Date.now },
  updated_at: Date,
  facebookId: Number,
  kakaoId: Number,
  resetPasswordToken: String,
  resetPasswordExpires: Date
});

userSchema.plugin(uniqueValidator);
userSchema.plugin(i18nPlugin, {languages: ['ko'], defaultLanguage: 'ko'});

userSchema.pre('save', function(next) {
  var user = this;
  // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();
    
    // generate a salt
    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt) {
        if (err) return next(err);

        // hash the password along with our new salt
        bcrypt.hash(user.password, salt, function(err, hash) {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        });
    });
});

// password verification
userSchema.methods.comparePassword = function(candidatePassword, cb) {
    bcrypt.compare(candidatePassword, this.password, function(err, isMatch) {
        if (err) return cb(err);
        return cb(null, isMatch);
    });
};

// the schema is useless so far
// we need to create a model using it
var User = mongoose.model('User', userSchema);

// make this available to our users in our Node applications
module.exports = User;