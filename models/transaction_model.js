const mongoose = require('mongoose')

const transaction = mongoose.model('transactions', {
  amount: Number,
  approve: Boolean,
  sender: String,
  senderName: String,
  senderInitialBalance: Number,
  senderNewBalance: Number,
  senderStatus: Boolean,
  receiver: String,
  receicerName: String,
  receiverInitialBalane: Number,
  receiverNewBalance: Number,
  receiverExist: Boolean,
  transactionID: String,
})

module.exports = transaction
