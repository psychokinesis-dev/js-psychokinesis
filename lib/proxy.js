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
            let myDomain = undefined;
            
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
                        
                        myDomain = result.domain;
                        this.connections.set(myDomain, socket);
                        
                        heartbeatInterval =
                            setInterval(() => {
                                this.dns.kvPut(myDomain, this.localAddress, (err, key, n) => {
                                    if (err) {
                                        console.log('keep heartbeat interval failed:', err);
                                    }
                                });

                                let heartbeatRequest = http2.raw.request({
                                    host: myDomain,
                                    plain: true,
                                    socket: socket,
                                    path: '/',
                                    method: 'GET'
                                }, (resp) => {
                                    console.log('heartbeat response code:', resp.statusCode, 'host', myDomain);
                                });

                                heartbeatRequest.on('error', (error) => {
                                    console.log('heartbeat request error:', error, 'host', myDomain);
                                });
                            }, this.options.heartbeatInterval);
                        
                        socket.write(JSON.stringify({ code: 0 }), 'utf-8');
                        
                        console.log('new proxy connection:', myDomain);
                    });
                } else {
                    socket.write(JSON.stringify({ code: 1 }), 'utf-8');
                    socket.destroy();
                }
            });
            
            socket.on('error', (error) => {
                if (heartbeatInterval) clearInterval(heartbeatInterval);

                if (myDomain) {
                    http2.globalAgent.removeEndpoint({host: myDomain, plain: true});

                    this.connections.delete(myDomain);
                }
            });
            
            socket.on('close', () => {
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                
                if (myDomain) {
                    http2.globalAgent.removeEndpoint({host: myDomain, plain: true});
                    
                    this.connections.delete(myDomain);
                }
                
                console.log('proxy connection closed:', myDomain);
            });
        });
        
        if (options.entryNode && options.entryNode.proxyPort) {
            let reconnectFun = (stream) => {
                let signin = {
                    domain: options.domain
                };
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

                        let heartbeatTimeoutFun = () => {
                            this.reconnectInstance.disconnect();

                            setTimeout(() => {
                                this.reconnectInstance =
                                    reconnect(reconnectFun)
                                    .on('error', (err) => {
                                        this.emit('error', err);
                                    })
                                    .connect(options.entryNode.proxyPort, options.entryNode.host);
                            }, 5 * 1000);
                        };

                        if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
                        this.heartbeatTimeout = setTimeout(heartbeatTimeoutFun, 2 * this.options.heartbeatInterval);

                        http2.raw.createServer({
                            plain: true,
                            createServer: (start) => {
                                start(stream);
                                return stream;
                            }
                        }, (request, response) => {
                            if (request.method === 'GET' && request.url === '/') {
                                // heartbeat
                                clearTimeout(this.heartbeatTimeout);
                                this.heartbeatTimeout = setTimeout(heartbeatTimeoutFun, 2 * this.options.heartbeatInterval);

                                response.end();
                                return;
                            }

                            this.emit('request', request, response);
                        });

                        this.emit('connected');
                    } else {
                        this.emit('error', {
                            errno: 'entry node error',
                            code: result.code
                        });
                        stream.destroy();
                    }
                });
            };

            this.reconnectInstance =
                reconnect(reconnectFun)
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
            if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);

            this.reconnectInstance.disconnect();
        }
        
        this.server.close(cb);
    }
    
    handleRequest(hostname, request, response) {
        if (hostname === this.options.domain) {
            this.emit('request', request, response);
        } else if (this.connections.has(hostname)) {
            let connection = this.connections.get(hostname);
            
            console.log('reverse request from', hostname);
            
            let reqUrl = url.parse(request.url);
            delete request.headers.host;
            delete request.headers.connection;

			let reverseRequest = http2.raw.request({
                host: hostname,
				plain: true,
				socket: connection,
				path: reqUrl.path,
                headers: request.headers,
				method: request.method
			}, (resp) => {
                response.writeHead(resp.statusCode, resp.headers);
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