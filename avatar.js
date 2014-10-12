/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var events = require('events')
var util = require('util')
var fs = require('fs')
var path = require('path')
var pngparse = require('pngparse')
var request = require('request')

function Avatar(options) {
  events.EventEmitter.call(this)
  request.defaults({ strictSSL: true })
  options = options || {}

  this.verbose = options.verbose

  if (!options.bearer) throw new Error('option "bearer" is required')
  this.bearer = options.bearer

  if (!options.host) throw new Error('option "host" is required')
  this.host = options.host
  
  this.image = options.image ||
    fs.readFileSync(path.resolve(__dirname, 'cat.png'))
}
util.inherits(Avatar, events.EventEmitter)

Avatar.prototype.log = function Avatar_log(/* format, values... */) {
  if (!this.verbose) return

  var args = Array.prototype.slice.call(arguments)
  var timestamp = new Date().toISOString()
  args[0] = util.format('[%s] %s', timestamp, args[0])

  process.stderr.write(util.format.apply(null, args.concat('\n')))
}

Avatar.prototype.upload = function Avatar_upload(options) {
  var transactionid = options.transactionid || 'no-transaction-id'
  this.log('start:upload      -> %s %s', transactionid, this.host)

  var requestArgs = {
    headers: {
      'Content-Type': 'image/png',
      'Authorization': 'Bearer ' + this.bearer,
      'Content-Length': this.image.length
    },
    uri: 'https://' + this.host + '/v1/avatar/upload',
    body: this.image,
    maxSockets: Infinity,
 }

  var startTime = Date.now()
  var self = this

  request.post(requestArgs, function upload_handler(err, res, body) {
    var result = {
      transactionid: transactionid,
      elapsedTime: Date.now() - startTime
    }

    if (err) {
      result.error = err
      return self.emit('error', result)
    }
    
    if (res.statusCode !== 201) {
      result.error = new Error('Invalid response code: ' + res.statusCode)
      return self.emit('error', result)
    }

    var contentType = res.headers['content-type']
    if (contentType.indexOf('application/json') !== 0) {
      result.error = new Error('Invalid content-type: ' + contentType)
      return self.emit('error', result)
    }

    result.statusCode = res.statusCode
    result.body = jsonParse(body)
    result.bytes = res.req._headers['content-length']
    return self.emit('complete:upload', result)
  })
}

Avatar.prototype.download = function Avatar_download(options) {
  var transactionid = options.transactionid || 'no-transaction-id'
  var startTime = Date.now()
  var self = this

  this.log('start:download    -> %s', options.url)

  var requestArgs = { 
    encoding: null, // `encoding: null` will return body as a `Buffer`
    uri: options.url,
    gzip: true,
    maxSockets: Infinity,
  }

  request.get(requestArgs, function download_handler(err, res, body) {
    var result = {
      transactionid: transactionid,
      elapsedTime: Date.now() - startTime
    }

    if (err) {
      result.error = err
      return self.emit('error', result)
    }

    if (res.statusCode !== 200) {
      result.error = new Error('Invalid response code: ' + res.statusCode)
      return self.emit('error', result)
    }

    var contentType = res.headers['content-type']
    if (contentType.indexOf('image/png') !== 0) {
      result.error = new Error('Invalid content-type: ' + contentType)
      return self.emit('error', result)
    }

    isValidPng(body, function(err /*, data */) {
      if (err) {
        result.error = err
        return self.emit('error', result)
      }
      
      result.statusCode = res.statusCode
      result.bytes = body.length
      return self.emit('complete:download', result)
    })
  })
}

function jsonParse(content) {
  try {
    return JSON.parse(content)
  } catch(e) {
    return { error: e }
  }
}

function isValidPng(image, cb) {
  // must parse ok, and be 600x600 pixels
  pngparse.parseBuffer(image, function(err, data) {
    if (err) {
      return cb(err)
    }

    if (data.width !== 600 || data.height !== 600) {
      var msg = 'Invalid PNG size: (' + data.width + ',' + data.height + ')'
      return cb(new Error(msg))
    }

    return cb(null, data)
  })
}

module.exports = Avatar
