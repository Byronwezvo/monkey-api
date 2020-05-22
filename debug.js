const User = require('./lib/User')
const bcrypt = require('bcrypt')

const user = new User('Byron wezvo', '0779845287', 'monkey')
user.setId()
user.setBalance()
user.encryptPassword()
const test = bcrypt.compareSync('monkey', user.password)
console.log(test)
