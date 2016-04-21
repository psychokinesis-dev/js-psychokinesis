'use strict';

var net = require('net');
var url = require('url');
var http2 = require('http2');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var reconnect = require('reconnect-net');

class Proxy {
    constructor(options, dns) {
        this.options = options;
        this.dns = dns;
        this.connections = new Map();
        
        this.server = net.createServer((socket) => {
            let requestData = '';
            let heartbeatInterval = undefined;
            
            socket.on('data', (data) => {
                requestData += data.toString('utf-8');

                try {
                    var result = JSON.parse(requestData);
                } catch (err) {
                    return;
                }

                if (result.domain) {
                    socket.removeAllListeners('data');
                    
                    this.dns.kvPut(result.domain, this.localAddress, (err, key, n) => {
                        if (err) {
                            console.log('store dns failed:', err);
                            socket.write(JSON.stringify({ code: 2 }), 'utf-8');
                            socket.destroy();
                            return;
                        }

                        this.connections.set(result.domain, socket);
                        
                        heartbeatInterval =
                            setInterval(() => {
                                this.dns.kvPut(result.domain, this.localAddress, (err, key, n) => {
                                    if (err) {
                                        console.log('keep heartbeat interval failed:', err);
                                    }
                                });
                            }, this.options.heartbeatInterval);
                        
                        socket.write(JSON.stringify({ code: 0 }), 'utf-8');
                    });
                } else {
                    socket.write(JSON.stringify({ code: 1 }), 'utf-8');
                    socket.destroy();
                }
            });
            
            socket.on('close', () => {
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                }
            });
        });
        
        if (options.entryNode && options.entryNode.proxyPort) {
            this.reconnectInstance =
                reconnect((stream) => {
                    let signin = { domain: options.domain };
                    stream.write(JSON.stringify(signin), 'utf-8');

                    let resultData = '';
                    stream.on('data', (data) => {
                        resultData += data.toString('utf-8');

                        try {
                            var result = JSON.parse(resultData);
                        } catch (err) {
                            return;
                        }

                        if (result.code === 0) {
                            stream.removeAllListeners('data');

                            http2.raw.createServer({
                                plain: true,
                                createServer: (start) => {
                                    start(stream);
                                    return stream;
                                }
                            }, (request, response) => {
                                this.emit('request', request, response);
                            });

                            this.emit('connected');
                        } else {
                            this.emit('error', { errno: 'entry node error', code: result.code });
                            stream.destroy();
                        }
                    });
                })
                    .on('error', (err) => {
                        this.emit('error', err);
                    })
                    .connect(options.entryNode.proxyPort, options.entryNode.host);
        }
    }
    
    listen(port, cb) {
        this.server.listen(port, cb);
    }
    
    destroy(cb) {
        if (this.reconnectInstance) {
            this.reconnectInstance.disconnect();
        }
        
        this.server.close(cb);
    }
    
    handleRequest(hostname, request, response) {
        if (hostname === this.options.domain) {
            this.emit('request', request, response);
        } else if (this.connections.has(hostname)) {
            let connection = this.connections.get(hostname);
            
            let reqUrl = url.parse(request.url);

			let reverseRequest = http2.raw.request({
				plain: true,
				socket: connection,
				path: reqUrl.path,
				method: request.method
			}, (resp) => {
				resp.pipe(response);
            });

			reverseRequest.on('error', (error) => {
				console.log('reverse request error:', error);

				response.statusCode = 500;
				response.end('internal error');
            });
            
			request.pipe(reverseRequest);
        } else {
            response.statusCode = 404;
            response.end(hostname + ' not found');
        }
    }
}

util.inherits(Proxy, EventEmitter);

module.exports = Proxy;