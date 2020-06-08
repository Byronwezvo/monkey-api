const express = require('express')
const BodyParser = require('body-parser')
const Mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const { v4: id } = require('uuid')
var exphbs = require('express-handlebars')
const app = express()

// ::: Serve Static files in the public folder
app.use(express.static('public'))

// ::: Set up templating engine Staff
app.engine('handlebars', exphbs())
app.set('view engine', 'handlebars')

// ::: Set up => BodyParser Middleware
app.use(BodyParser.json())
app.use(BodyParser.urlencoded({ extended: true }))

// >>> Import User Model
const UserModel = require('./models/user_model')

// >>> Import Transaction Schema
const TransactionModel = require('./models/transaction_model')

// >>> Import Notification Class
const Notification = require('./utils/Notification')

// >>> Import History Class
const History = require('./utils/History')

// >>> Import Server Error message
const serverErrorMessage = require('./utils/server_error')
const transaction = require('./models/transaction_model')

// >>> Array in Local RAM Memory
const userOnlineArray = []

// ::: Connect to MongoDB
Mongoose.connect('mongodb://localhost', {
  dbName: 'StitchPay',
  useNewUrlParser: true,
  useUnifiedTopology: true,
})

// ::::: Admin Routes
app.get('/admin', function (req, res) {
  res.sendFile('./public/index.html', { root: __dirname })
})

// :: Dummy Route
app.get('/test', async (req, res, next) => {
  try {
    const result = await UserModel.find()
    res.json(result)
  } catch (error) {
    res.status(500).json(serverErrorMessage)
  }
})

/**
 * This infomation will be used by managment. BUt basically this route
 * returns all users online is Users pushed from the log in route into
 * the online users route.
 *
 * @author Byron Wezvo
 */
app.get('/users-online', async (req, res, next) => {
  res.send(userOnlineArray)
})

/**
 * This route will create a new user generate id and encrypt
 * password. Will also check if the given number was registered
 * already.
 *
 * @author Byron Wezvo
 */
app.post('/newuser', async (req, res, next) => {
  try {
    // ::: Get object from Req
    const user = new UserModel(req.body)

    // ?? Check to see if mobile is already configured
    const inputMobile = user['user_mobile']

    /**
     * This will return an Array hence check to see
     * its len if its ZERO then user can be created.
     * if It is more than 0 then tell send a fail response.
     *
     *@author Byron Wezvo
     */
    const mobileExistCheck = await UserModel.find({ user_mobile: inputMobile })

    if (mobileExistCheck.length === 0) {
      // ::: Generate and Set ID => uuid
      user['user_id'] = 'til-t.' + id()

      // ::: Encrypt Password => bcrypt
      user['user_password'] = bcrypt.hashSync(user['user_password'], 10)

      // ::: Save Data to the DB
      const result = await user.save()

      // :::
      result['user_status'] = true

      // ::: Send Response
      res.send(result)
    } else {
      // Throw an error
      res.status(400).send('Error')
    }
  } catch (error) {
    // Throw an Error if any of these exist
    res.status(500).send(serverErrorMessage)
  }
})

/**
 * This route will be used to retrieve a verification code.
 * Which verifies the account belongs to a user
 *
 *  @author Byron Wezvo
 */
app.post('/generate-varification-code/:mobile', async (req, res) => {
  try {
    const user = req.params.mobile
    // generate code
    const verification = parseInt(Math.random() * 1000000)

    await UserModel.updateOne(
      { user_mobile: user },
      { $set: { user_verification_code: verification } }
    )

    // send code to user
    res.json({ code: String(verification) })
    // TODO => find service to send message to number
  } catch (error) {
    res.status(500).send(serverErrorMessage)
  }
})

/**
 * This route will be used when loggin ujjser in. Its
 *  very wise to use the method I use for easy access.
 *
 * @author Byron Wezvo
 */
app.post('/login/:mobile/:password', async (req, res, next) => {
  try {
    // ::: Store Local variables from Params
    const inputMobile = req.params.mobile
    const inputpassword = req.params.password

    // ::: Query db for user => mobile (return an array)
    const mobileExistCheck = await UserModel.find({ user_mobile: inputMobile })

    // ?? Check if the passwords match
    if (mobileExistCheck.length === 1) {
      if (mobileExistCheck[0]['user_verified'] == false) {
        res.status(400).json({ issue: 'Not verified' })
      } else {
        switch (
          bcrypt.compareSync(
            inputpassword,
            mobileExistCheck[0]['user_password']
          ) //
        ) {
          case true:
            // ::: Store User in a variable
            const authenticatedUser = mobileExistCheck[0]

            // ::: Set Status to True
            authenticatedUser['user_status'] = true // <- Write to db not array

            // :: Status -> change to True
            await UserModel.updateOne(
              { user_mobile: inputMobile },
              { $set: { user_status: true } }
            )

            authenticatedUser['user_history'] = null
            authenticatedUser['user_notifications'] = null // <- Remove notifications

            // ::: Push to Array <- Delete this
            userOnlineArray.push(authenticatedUser)

            // ::: Respond with array to use as list in Flutter
            res.send([authenticatedUser])
            console.log(
              `${authenticatedUser['user_name']} has logged in ${Date()}`
            )
            break

          case false:
            // ::: If password is wrong
            res.status(400).json({ error: 'Wrong Password' })
            break

          default:
            // ::: Mybe server is offline or something
            res.status(500).json(serverErrorMessage)
            break
        }
      }
    } else {
      res.status(400).json({ error: 'User does not Exist' })
    }
  } catch (error) {
    res.status(500).send(serverErrorMessage)
  }
})

/**
 * This route will be used for logging out users
 * who were online.
 *
 * @author Byron Wezvo
 */
app.post('/logout/:mobile', async (req, res) => {
  try {
    // get details
    const userMobile = req.params.mobile

    // Pop out of online users array
    for (let index = 0; index < userOnlineArray.length; index++) {
      const element = userOnlineArray[index]
      const userMobileOnline = element['user_mobile'] == userMobile
      switch (userMobileOnline) {
        case true:
          element['user_status'] = false
          userOnlineArray.pop(element)

          //Status -> false
          await UserModel.updateOne(
            { user_mobile: userMobile },
            { $set: { user_status: false } }
          )

          console.log(`${userMobile} has logged out`)
          res.json({
            completed: true,
            message: 'User logged out',
          })
          break

        case false:
          res.status(500).json({ error: 'User not online' })
          break

        default:
          break
      }
      break
    }
  } catch (error) {
    res.send(500).send(serverErrorMessage)
  }
})

/**
 * This route will be sued when sending money from one user to the next
 * user. This is the selling point of this software.
 *
 * @author Byron Wezvo
 */
app.post('/sendmoney/:sender/:reciever/:amount', async (req, res) => {
  // ::: Local Variables
  const sender = req.params.sender
  const reciever = req.params.reciever
  const amount = parseInt(req.params.amount)

  // ::: Transaction obbject
  let transactionObject = {
    amount: amount,
    approve: false,
    sender: sender,
    senderName: '',
    senderInitialBalance: null,
    senderNewBalance: null,
    senderStatus: false,
    receiver: reciever,
    receicerName: '',
    receiverInitialBalane: null,
    receiverNewBalance: null,
    receiverExist: false,
  }

  /**
   * This list of checks will change values in the transaction objects
   * basically if one of the given values is false or null then the route should
   * return an error.
   */

  // ::: Check if Sender is online
  const senderObject = await UserModel.findOne({ user_mobile: sender })
  if (senderObject['user_status'] === true) {
    transactionObject.senderStatus = true
    transactionObject.senderName = senderObject['user_name']
    transactionObject.senderInitialBalance = senderObject['user_balance']
  } else {
    res.status(300).json({ error: 'Sender is not online' })
  }

  // ::: check if Reciever exist in Database
  const receiverObject = await UserModel.findOne({ user_mobile: reciever })
  //console.log(receiverObject)

  // ::: if null send and erro
  if (receiverObject === null) {
    res.status(400).json({ error: 'user does not exist' })
  } else {
    transactionObject.receicerName = receiverObject['user_name']
    transactionObject.receiverInitialBalane = receiverObject['user_balance']
    transactionObject.receiverExist = true
  }

  /**
   * This logic will change the approve the transaction
   */

  //  ::: Check if Sender Newbalance is above that zero
  const senderNewbalanceResult = transactionObject.senderInitialBalance - amount
  const receiverNewBalanceReslut =
    transactionObject.receiverInitialBalane + amount

  if (senderNewbalanceResult > 0) {
    transactionObject.approve = true
  } else {
    res.status(400).json({ error: 'Amount to send is above balance' })
  }

  // ::: Process Transaction -> Send money
  switch (transactionObject.approve) {
    case true:
      // ::: update balances
      // -> Transaction Object
      transactionObject.senderNewBalance = senderNewbalanceResult
      transactionObject.receiverNewBalance = receiverNewBalanceReslut

      // -> Write new Balance to sender [db]
      await UserModel.updateOne(
        { user_mobile: sender },
        { $set: { user_balance: senderNewbalanceResult } }
      )

      // -> Write new Balance to receiver [db]
      await UserModel.updateOne(
        { user_mobile: reciever },
        { $set: { user_balance: receiverNewBalanceReslut } }
      )

      // --> Write to sender History array

      console.log('done')
      break

    default:
      break
  }

  res.send(transactionObject)
})

// ::: Serve the Application
app.listen(3000, () => console.log('Application Running on 3000'))
// TODO : change to another port or environment ports
