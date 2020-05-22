class History {
  constructor(message, transactionId) {
    this.transactionId = transactionId
    this.message = message
    this.date = Date()
  }
}
module.exports = History
