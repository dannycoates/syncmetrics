var crypto = require('crypto')
var path = require('path')
var Hapi = require('hapi')
var Inert = require('inert')
var pg = require('pg')
var SQSReceiver = require('./sqs')
var config = require('./config.json')

var dbUrl = 'postgres://' + config.user + ':' + config.password
  + '@' + config.host + '/' + config.db

function query(stmt, params, cb) {
  cb = cb || function() {}
  pg.connect(
    dbUrl,
    function (err, client, done) {
      if (err) {
        return cb(err)
      }
      client.query(stmt, params, function (err, result) {
        done()
        if (err) { return cb(err) }
        cb(null, result)
      })
    }
  )
}

function hashTheBloodyId(id, key) {
  var hmac = crypto.createHmac('sha256', key)
  hmac.update(id)
  return hmac.digest('hex').substr(-32)
}

var fxaQueue = new SQSReceiver(config.region, [config.queue])
fxaQueue.on('data', function (message) {
  switch (message.event) {
    case 'verified':
      query('insert into users values ($1, GETDATE())', [hashTheBloodyId(message.uid, config.key)])
      break;
    case 'delete':
      var uid = message.uid.split('@')[0]
      query('update users set deleted = GETDATE() where uid = $1', [hashTheBloodyId(uid, config.key)])
      break;
    default:
      break;
  }
  message.del()
})
fxaQueue.start()

var serverOptions = {
  connections: {
    routes:{
      files: {
        relativeTo: path.join(__dirname, 'public')
      },
      state: {
        parse: false
      }
    }
  }
}

var connectionOptions = {
  port: config.port
}

var server = new Hapi.Server(serverOptions)

server.connection(connectionOptions)
server.register(Inert, function () {})

server.route([
  {
    method: 'GET',
    path: '/data/stat.json',
    handler: function (req, reply) {
      query('select cast(TRUNC(time) AS varchar) as date, count(1) as value from runway2 group by TRUNC(time) order by date', [], function (err, result) {
        if (err) { return reply(err) }
        reply(result.rows)
      })
    }
  },
  {
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true
      }
    }
  }
])

server.start(function () {})
