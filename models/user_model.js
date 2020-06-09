const mongoose = require('mongoose')

const newUser = mongoose.model('users', {
  user_id: String,
  user_name: String,
  user_mobile: String,
  user_password: String,
  user_balance: Number,
  user_status: false,
  user_verified: Boolean,
  user_verification_code: String,
  user_history: [],
})

module.exports = newUser
