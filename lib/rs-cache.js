'use strict';

const NodeCache = require( "node-cache" );
const async = require('async');


class RsCache {
    constructor(options) {
        this.options = options;
        this.cache = new NodeCache();
    }

    set(path, info, cb) {
        this.cache.set(path, info, cb);
    }

    list(cb) {
        this.cache.keys((err, keys) => {
            if (err) {
                cb(err);
                return;
            }

            this.cache.mget(keys, cb);
        });
    }
}

module.exports = RsCache;