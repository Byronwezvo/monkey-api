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
            authenticatedUser['user_status'] = true

            // ::: Push to Array
            userOnlineArray.push(authenticatedUser)

            // ::: Respond with array to use as list in Flutter
            res.send([authenticatedUser])
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
app.post('/logout/:mobile', (req, res) => {
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
  // :::: Variables
  const senderInput = req.params.sender
  const recieverInput = req.params.reciever
  const amountToSend = parseInt(req.params.amount)

  let transactionStatus = {
    transactionid: 'Transaction.' + id(),
    date: Date(),
    approve: false,
    senderStatus: false,
    recieverExist: false,
    sender: null,
    reciever: null,
  }

  try {
    // ::: Chek if sender is online
    for (let i = 0; i < userOnlineArray.length; i++) {
      const element = userOnlineArray[i]
      if (
        element['user_mobile'] == senderInput &&
        element['user_status'] == true
      ) {
        transactionStatus.sender = element
        transactionStatus.senderStatus = true
        break
      }
    }

    // ::: Reciever exist in DB
    const result = await UserModel.find({ user_mobile: recieverInput })
    if (result.length == 1) {
      transactionStatus.reciever = result[0]
      transactionStatus.recieverExist = true
    }

    // ::: Check the balance of sender after substracting the amount to be send
    if (transactionStatus.sender['user_balance'] - amountToSend >= 0) {
      transactionStatus.approve = true
      console.log('transaction can be done')
    }

    // ::: Send Money and save History and Notifications
    switch (transactionStatus.approve) {
      case true:
        // ::: calculate balance
        const balance = transactionStatus.sender['user_balance'] - amountToSend
        transactionStatus.sender['user_balance'] = balance

        // ::: Save balance to sender
        await UserModel.updateOne(
          { user_mobile: senderInput },
          { $set: { user_balance: balance } }
        )

        // ::: Save amountToSend to reciver
        const newBalance =
          transactionStatus.reciever['user_balance'] + amountToSend
        transactionStatus.reciever['user_balance'] = newBalance
        await UserModel.updateOne(
          { user_mobile: recieverInput },
          { $set: { user_balance: newBalance } }
        )

        // ::: Create Notification and History for Sender
        // :: update notifications array
        const updatedSenderHistoryArray =
          transactionStatus.sender['user_history']
        updatedSenderHistoryArray.push(
          new History(
            `You send ${amountToSend} to ${recieverInput}`,
            transactionStatus.transactionid
          )
        )
        console.log(updatedSenderHistoryArray)
        // :: save history to db
        await UserModel.updateOne(
          { user_mobile: senderInput },
          { $set: { user_history: updatedSenderHistoryArray } }
        )

        // :: create notification
        const updatedSenderNotificationArray =
          transactionStatus.sender['user_notifications']
        updatedSenderNotificationArray.push(
          new Notification(`You send ${amountToSend} to ${recieverInput}`)
        )
        // :: save to db
        await UserModel.updateOne(
          { user_mobile: senderInput },
          { $set: { user_notifications: updatedSenderNotificationArray } }
        )

        // ::: Create Notification and History for Reciever
        // :: update notifications array
        const updatedRecieverHistoryArray =
          transactionStatus.reciever['user_history']
        updatedRecieverHistoryArray.push(
          new History(
            `You recieved ${amountToSend} from ${recieverInput}`,
            transactionStatus.transactionid
          )
        )
        // :: save history to db
        await UserModel.updateOne(
          { user_mobile: recieverInput },
          { $set: { user_history: updatedRecieverHistoryArray } }
        )

        // :: create notification
        const updatedRecieverNotificationArray =
          transactionStatus.reciever['user_notifications']
        updatedRecieverNotificationArray.push(
          new Notification(`You recieved ${amountToSend} from ${recieverInput}`)
        )
        console.log(updatedRecieverNotificationArray)
        // :: save to db
        await UserModel.updateOne(
          { user_mobile: recieverInput },
          { $set: { user_notifications: updatedRecieverNotificationArray } }
        )

        // ::: Write in transaction model
        const completedTransaction = new TransactionModel(transactionStatus)
        await completedTransaction.save()

        // :::
        res.status(200).json(transactionStatus)
        break

      // ::: Create a response and save data to db
      case false:
        const failedTransaction = new TransactionModel(transactionStatus)
        await failedTransaction.save()
        res.status(400).json(transactionStatus)
        break

      default:
        res.status(500).json(serverErrorMessage)
        break
    }
    // do some magic here
  } catch (error) {
    res.status(500).json(serverErrorMessage)
  }
})

// ::: Serve the Application
app.listen(3000, () => console.log('Application Running'))
// TODO : change to another port or environment ports
