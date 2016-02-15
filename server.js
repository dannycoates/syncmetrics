var path = require('path')
var Hapi = require('hapi')
var Inert = require('inert')
var pg = require('pg')
var config = require('./config.json')

var dbUrl = 'postgres://' + config.user + ':' + config.password
  + '@' + config.host + '/' + config.db

function query(stmt, params, cb) {
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
      query('select count(1) from runway2', [], function (err, result) {
        reply(err, result)
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
