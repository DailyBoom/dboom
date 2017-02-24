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
  email: { type: String, unique: true, sparse: true },
  username: { type: String, required: true, unique: true },
  password: { type: String },
  birthday: Date,
  gender: Boolean,
  admin: Boolean,
  shipping: {
    full_name: String,
    address: String,
    address_extra: String,
    country: String,
    city: String,
    zipcode: String,
    phone_number: String,
    district: String,
    ward: String
  },
  role: { type: String, required: true },
  created_at: { type : Date, default : Date.now },
  updated_at: Date,
  facebookId: String,
  googleId: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  eventNumber: { type: Number, default: 1 },
  person_in_charge: String,
  company_name: String,
  business_reg: String,
  last_connec: { type : Date, default : Date.now },
  wallet: { type: Number, default: 0 },
  website: String,
  facebook: String,
  amount: Number
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