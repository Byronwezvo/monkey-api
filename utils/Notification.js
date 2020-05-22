class Notification {
  constructor(message) {
    this.message = message
    this.date = Date()
    this.isRead = false
  }
}

module.exports = Notification
