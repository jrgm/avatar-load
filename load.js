#!/usr/bin/env node

var util = require('util')
var crypto = require('crypto')
var options = require('commander')
var Avatar = require('./avatar')
var RecentList = require('./recentlist')

var args
var avatar = new Avatar()
var transactions = {}
var uploads = new RecentList()
var downloads = new RecentList()
var stats = {
  uploads: {
    count: 0,
    bytes: 0,
    milliseconds: 0
  },
  downloads: {
    count: 0,
    bytes: 0,
    milliseconds: 0
  },
  errors: {
    count: 0
  }
}

function updateStats(type, info) {
  var element = stats[type]
  element.count++
  element.bytes += info.bytes
  element.milliseconds += info.elapsedTime
}

function reportStats() {
  var uploads = stats.uploads
  var downloads = stats.downloads
  if (uploads.count === 0 || downloads.count === 0) return
  var uploadRate = uploads.bytes / uploads.milliseconds * 1000/1024
  var downloadRate = downloads.bytes / downloads.milliseconds * 1000/1024
  log('status: uploads: %s (%s KB/s) downloads: %s (%s KB/s) errors: %s',
      uploads.count, uploadRate.toFixed(1),
      downloads.count, downloadRate.toFixed(1), stats.errors.count)
}

function activeTransactions() {
  return Object.keys(transactions).length
}

function log(/* format, values... */) {
  var args = Array.prototype.slice.call(arguments)
  var timestamp = new Date().toISOString()
  args[0] = util.format('[%s] %s', timestamp, args[0])
  process.stderr.write(util.format.apply(null, args.concat('\n')))
}

avatar.on('error', function onError(error) {
  log('error: %s', util.inspect(error, { showHidden: true, depth: null }))
  stats.errors.count++;
  delete transactions[error.transactionid]
  startUpload()
})

avatar.on('complete:upload', function onCompleteUpload(info) {
  var activeCount = activeTransactions()
  if (options.verbose) {
    log('complete:upload   -> xid: %s, active: %s, rc: %s, elapsedTime: %s', 
        info.transactionid, activeCount, info.statusCode, info.elapsedTime)
  }
  uploads.add({ bytes: info.bytes, milliseconds: info.elapsedTime })
  updateStats('uploads', info)
  transactions[info.transactionid] = 'downloading'
  avatar.download({
    url: info.body.url, 
    transactionid: info.transactionid
  })
})

avatar.on('complete:download', function onCompleteDownload(info) {
  var activeCount = activeTransactions()
  if (options.verbose) {
    log('complete:download -> xid: %s, active: %s, rc: %s, elapsedTime: %s', 
        info.transactionid, activeCount, info.statusCode, info.elapsedTime)
  }
  downloads.add({ bytes: info.bytes, milliseconds: info.elapsedTime })
  updateStats('downloads', info)
  delete transactions[info.transactionid]
  startUpload()
})

function startUpload() {
  if (stats.uploads.count > options.count) {
    return // All Done.
  }
  var transactionid = crypto.randomBytes(4).toString('hex')
  args.transactionid = transactionid
  transactions[transactionid] = 'uploading'
  avatar.upload(args)
}

function intParse(string, defvalue) {
  var intvalue = parseInt(string, 10);
  if (typeof intvalue === 'number') return intvalue
  return defvalue
}

(function main() {
  options
    .usage('[options]')
    .option('-c, --concurrent <n>', 'Number of concurrent avatar uploads (default 2)', intParse, 2)
    .option('-n, --count <n>', 'Total number of uploads (default 1000)', intParse, 1000)
    .option('-b, --bearer <token>', 'OAuth Bearer token (required)')
    .option('-p, --profile <server>', 'Hostname of profile server (default profile.stage.mozaws.net)',
            'profile.stage.mozaws.net')
    .option('-v, --verbose', 'show detailed logs for every upload/download')
    .parse(process.argv);

  if (!options.bearer) {
    log('Missing option "--bearer". Required option!')
    process.exit(1)
  }

  if (options.bearer.length !== 64) {
    log('Invalid Bearer token!: %s', options.bearer)
    process.exit(1)
  }
  
  if (options.count === 0) {
    options.count = Infinity
  }

  avatar.setVerbose(options.verbose)

  args = {
    host: options.profile,
    bearer: options.bearer
  }

  var intervalReport = setInterval(reportStats, 2000)
  intervalReport.unref()

  log('Starting with concurrent:%s, count: %s, profile: %s', 
      options.concurrent, options.count, options.profile)

  for (var i = 0; i < options.concurrent; ++i) {
    setTimeout(startUpload, i * 200)
  }
})()

