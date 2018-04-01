const express = require('express')
const redis = require('redis')
const { promisify } = require('util')
const mcache = require('memory-cache')

const client = redis.createClient(6379) // make configurable
const get = promisify(client.get).bind(client)

const app = express()

var duration = 1000000 // make configurable
var isReady = false

client.on('connect', () => {
  isReady = true
  client.set("foo_rand000000000000", "some fantastic value", redis.print)
  client.get("foo_rand000000000000", redis.print)
})

app.get('/')

app.get('/health', (req, res) =>
  res.send('The proxy is up and running.')
)

app.get('/favicon.ico', (req, res) =>
  res.json('ignore')
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

const asyncMiddleware = fn =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(next)
  }

app.use(asyncMiddleware(async (req, res, next) => {
  console.log('async middleware')
  console.log('req', req.query)
  if (!req.query.key) {
    res.send('Make sure your GET requests include a querystring containing a \"key\" and a \"value\", for example, \"?key=value\"')
    return
  }

  var result = await get(req.query.key)

  if (result) {
    req.result = result
    next()
  } else {
    res.send('Redis couldn\'t find a value for this key.')
  }
}))

const cache = (duration) => { // key store size should be configurable
  return (req, res, next) => {
    console.log('entering cacheing function')
    let key = req.query.key
    let cachedBody = mcache.get(key)
    if (cachedBody) {
      console.log('sending cached body')
      res.send(cachedBody)
    } else {
      mcache.put(req.query.key, req.result, duration * 1000)
      console.log(req.query.key + 'has been cached')
      res.send(req.result)
    }
    next()
  }
}

app.use(cache(duration))

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }
  res.status(500)
  res.send('error', { error: err })
})

app.listen(3000, () => console.log('Listening on port 3000.'))
