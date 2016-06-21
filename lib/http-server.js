'use strict';

var http = require('http');
var url = require('url');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var async = require('async');

class HttpServer {
    constructor(options, proxy, dns) {
        this.options = options;
        this.proxy = proxy;
        this.dns = dns;
        
        this.server = http.createServer((req, resp) => {
            this.handleRequest(req, resp);
        });
        
        this.server.on('error', (err) => {
            this.emit('error', err);
        });
        
        this.proxy.on('error', (err) => {
            this.emit('error', err);
        });
        
        if (options.entryNode && options.entryNode.proxyPort) {
            async.parallel([
                (callback) => {
                    this.dns.once('ready', () => {
                        callback(null);
                    });
                },
                (callback) => {
                    this.proxy.once('connected', () => {
                        callback(null);
                    });
                }
            ],
                (err, results) => {
                    this.emit('ready');
                });
        } else {
            this.dns.once('ready', () => {
                this.emit('ready');
            });
        }
    }
    
    listen(ip, port, cb) {
        this.localAddress = ip + ':' + port;
        this.dns.listen(port);
        
        this.dns.on('listening', () => {
            this.dns.bootstrap(() => {
                this.dns.kvPut(this.options.domain, this.localAddress, (err, key, n) => {
                    if (err) {
                        console.log(new Date(), 'set domain failed:', this.options.domain, '->', this.localAddress);

                        cb(err);
                        return;
                    }

                    this.heartbeatInterval =
                        setInterval(() => {
                            this.dns.kvPut(this.options.domain, this.localAddress, (err, key, n) => {
                                if (err) {
                                    console.log(new Date(), 'keep heartbeat interval failed:', err);
                                }
                            });
                        }, this.options.heartbeatInterval);

                    this.proxy.localAddress = this.localAddress;
                    this.server.listen(port, cb);
                });
            });
        });
    }
    
    destroy(cb) {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        
        this.server.close(() => {
            this.proxy.destroy(() => {
                this.dns.destroy(cb);
            });
        });
    }
    
    startProxy(port, cb) {
        this.proxy.listen(port, cb);
    }
    
    handleRequest(req, resp) {
        let reqUrl = url.parse(req.url);
        let urlArrays = reqUrl.pathname.split('/');
        
        let realHost = '';
        if (urlArrays.length > 2) {
            realHost = urlArrays[1];
        } else {
            realHost = req.headers.host.split(':')[0];
        }
        
        this.dns.kvGet(realHost, 'utf8', (err, n, value) => {
            if (value === null) {
                resp.statusCode = 404;
				resp.end(realHost + ' not found');
                return;
            }
            
            if (value === this.localAddress) {
                this.proxy.handleRequest(realHost, req, resp);
            } else {
                let remote = value.split(':');
                let remotePort = remote[1];

				let remoteRequest = http.request({
					host: realHost,
					port: remotePort,
					path: reqUrl.path,
                    headers: req.headers,
					method: req.method
				}, (response) => {
                    resp.writeHead(response.statusCode, response.headers);
					response.pipe(resp);
                });

				remoteRequest.on('error', (error) => {
					if (error.code === 'ECONNREFUSED') {
						resp.statusCode = 503;
						resp.end(realHost + ' unavailable');
                    } else {
						resp.statusCode = 500;
						resp.end('internal error');
                    }
                });

				req.pipe(remoteRequest);
            }
		});
    }
}

util.inherits(HttpServer, EventEmitter);

module.exports = HttpServer;