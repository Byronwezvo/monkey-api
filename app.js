const express = require('express')
const BodyParser = require('body-parser')
const Mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const { v4: id } = require('uuid')
var exphbs = require('express-handlebars')
const app = express()

// ::: Serve Static files in the public folder
app.use(express.static('public'))

// ::: Set up template engine Staff
app.engine('handlebars', exphbs())
app.set('view engine', 'handlebars')

// ::: Set up => BodyParser Middleware
app.use(BodyParser.json())
app.use(BodyParser.urlencoded({ extended: true }))

// ::: Set up => Helmet Middleware
var helmet = require('helmet')
app.use(helmet())

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
 * This information will be used by management. BUt basically this route
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
 * This route will be used when loggin user in. Its
 *  very wise to use the method I use for easy access.
 *
 * @author Byron Wezvo
 */
app.post('/login/:mobile/:password', async (req, res, next) => {
  try {
    // ::: Store Local variables from Params
    const inputMobile = req.params.mobile
    const inputPassword = req.params.password

    // ::: Query db for user => mobile (return an array)
    const mobileExistCheck = await UserModel.find({ user_mobile: inputMobile })

    // ?? Check if the passwords match
    if (mobileExistCheck.length === 1) {
      if (mobileExistCheck[0]['user_verified'] == false) {
        res.status(400).json({ issue: 'Not verified' })
      } else {
        switch (
          bcrypt.compareSync(
            inputPassword,
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
            // ::: Maybe server is offline or something
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
    //
    const userMobile = req.params.mobile
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
app.post('/sendmoney/:sender/:receiver/:amount', async (req, res) => {
  // ::: Local Variables
  const sender = req.params.sender
  const receiver = req.params.receiver
  const amount = parseInt(req.params.amount)

  // ::: Transaction object
  let transactionObject = {
    amount: amount,
    approve: false,
    sender: sender,
    senderName: '',
    senderInitialBalance: null,
    senderNewBalance: null,
    senderStatus: false,
    receiver: receiver,
    receiverName: '',
    receiverInitialBalance: null,
    receiverNewBalance: null,
    receiverExist: false,
    transactionID: `transaction-${id()}`,
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

  // ::: check if Receiver exist in Database
  const receiverObject = await UserModel.findOne({ user_mobile: receiver })
  //console.log(receiverObject)

  // ::: if null send and error
  if (receiverObject === null) {
    res.status(400).json({ error: 'user does not exist' })
  } else {
    transactionObject.receiverName = receiverObject['user_name']
    transactionObject.receiverInitialBalance = receiverObject['user_balance']
    transactionObject.receiverExist = true
  }

  /**
   * This logic will change the approve the transaction
   */

  //  ::: Check if Sender New balance is above that zero
  const senderNewbalanceResult = transactionObject.senderInitialBalance - amount
  const receiverNewBalanceResult =
    transactionObject.receiverInitialBalance + amount

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
      transactionObject.receiverNewBalance = receiverNewBalanceResult

      // -> Write new data to sender [db]
      const senderNewHistoryArray = senderObject['user_history']
      senderNewHistoryArray.push(
        new History(
          `You sent \$${amount} to ${receiver} [${transactionObject.receiverName}]`,
          transactionObject.transactionID
        )
      )
      await UserModel.updateOne(
        { user_mobile: sender },
        {
          $set: {
            user_balance: senderNewbalanceResult,
            user_history: senderNewHistoryArray,
          },
        }
      )

      // -> Write new data to receiver [db]
      const receiverNewHistoryArray = senderObject['user_history']
      receiverNewHistoryArray.push(
        new History(
          `You received ${amount} from ${sender} [${transactionObject.senderName}]`,
          transactionObject.transactionID
        )
      )
      await UserModel.updateOne(
        { user_mobile: receiver },
        {
          $set: {
            user_balance: receiverNewBalanceResult,
            user_history: receiverNewHistoryArray,
          },
        }
      )

      // -> Write Transaction to transactions [db]
      const completedTransaction = new TransactionModel(transactionObject)
      await completedTransaction.save()

      res.status(200).json({ message: 'approved' })
      break

    case false:
      res.status(400).json({ error: 'Transaction not approved' })
      break

    default:
      res.status(500).json(serverErrorMessage)
      break
  }
})

/**
 * ----------------------------------------------
 *           App related Routes
 * ----------------------------------------------
 *
 * Most of these routes will be used by the mobile app.
 * Most of these routes are app.get routes
 *
 * @author Byron Wezvo
 *
 */

/**
 * This route will basically get the balance of a user. What I intend to do
 * is first check if the user is online.
 *
 * @author Byron Wezvo
 *
 */
app.get('/get-balance/:mobile', async (req, res) => {
  try {
    // ::: Store local variables
    const user = req.params.mobile

    //  -> check if user is online
    // :::Store user in an object
    const userObject = await UserModel.findOne({ user_mobile: user })

    // ::: -> Conditions
    switch (userObject['user_status']) {
      // ::: If status is true respond with object
      case true:
        res.status(200).json({
          user_balance: userObject['user_balance'],
        })
        break

      // ::: If false throw an error
      case false:
        res.status(400).json({
          error: 'You are not logged in',
        })
        break

      // ::: set default to server error
      default:
        res.status(500).json(serverErrorMessage)
        break
    }
  } catch (error) {
    res.status(500).json(serverErrorMessage)
  }
})

/**
 * This route will basically get the History of a user. What I intend to do
 * is first check if the user is online.
 *
 * @author Byron Wezvo
 *
 */
app.get('/get-history/:mobile', async (req, res) => {
  try {
    // ::: Store local variables
    const user = req.params.mobile

    //  -> check if user is online
    // :::Store user in an object
    const userObject = await UserModel.findOne({ user_mobile: user })

    // ::: -> Conditions
    switch (userObject['user_status']) {
      // ::: If status is true respond with object
      case true:
        res.status(200).json({
          user_history: userObject['user_history'],
        })
        break

      // ::: If false throw an error
      case false:
        res.status(400).json({
          error: 'You are not logged in',
        })
        break

      // ::: set default to server error
      default:
        res.status(500).json(serverErrorMessage)
        break
    }
  } catch (error) {
    res.status(500).json(serverErrorMessage)
  }
})

// ::: Serve the Application
app.listen(3000, () => console.log('Application Running on 3000'))
// TODO : change to another port or environment ports
