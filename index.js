const express = require('express')
const redis = require('redis')
const { promisify } = require('util')
const mcache = require('memory-cache')

const client = redis.createClient(6379)
const get = promisify(client.get).bind(client)

const app = express()

const asyncMiddleware = fn =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(next)
  }

const cache = (duration) => {
  return (req, res, next) => {
    let key = req.query.key
    let cachedBody = mcache.get(key)
    if (cachedBody) {
      res.send(cachedBody)
      return
    } else {
      res.sendResponse = res.send
      res.send = (body) => {
        mcache.put(key, body, duration * 1000)
        res.sendResponse(body)
      }
      next()
    }
  }
}

var duration = 1000
var isReady = false

client.on('connect', () => {
  isReady = true
  client.set("foo_rand000000000000", "some fantastic value", redis.print)
  client.get("foo_rand000000000000", redis.print)
})

app.get('/', asyncMiddleware(async (req, res, next) => {
  console.log('async middleware')
  if (!req.query.key) {
    res.send('Make sure your GET requests include a querystring containing a \"key\" and a \"value\", for example, \"?key=value\"')
    return
  }

  var result = await get(req.query.key)

  if (result) {
    res.send(result)
  } else {
    res.send('Redis couldn\'t find a value for this key.')
  }
}))

app.get('/health', (req, res) =>
  res.send('The proxy is up and running.')
)

app.use((req, res, next) => {
  if (!isReady) {
    var err = new Error()
    err.status = '404'
    err.body = 'No database connected.'
    next(err)
    return
  }
  next()
})

app.use(cache(duration))

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }
  res.status(500)
  res.send('error', { error: err })
})

app.listen(3000, () => console.log('Listening on port 3000.'))
