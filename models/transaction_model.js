const mongoose = require('mongoose')

const transaction = mongoose.model('transactions', {
  transactionid: String,
  date: String,
  approve: Boolean,
  senderStatus: Boolean,
  recieverExist: Boolean,
  sender: Object,
  reciever: Object,
})

module.exports = transaction
