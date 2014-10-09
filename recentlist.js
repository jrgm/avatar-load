/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function RecentList(maxsize) {
  this.maxsize = maxsize || 10
  this.recent = []
}

RecentList.prototype = {
  add: function add(value) {
    this.recent.push(value)
    if (this.recent.length > this.maxsize) {
      return this.recent.shift()
    }
    return
  },

  average: function average() {
    if (this.recent.length === 0) return 0
    return (this.sum() / this.recent.length).toFixed(1)
  },

  sum: function sum() {
    var total = 0
    for (var i = 0; i < this.recent.length; ++i) {
      total += this.recent[i].bytes / this.recent[i].milliseconds
    }
    return total
  }
}

module.exports = RecentList
