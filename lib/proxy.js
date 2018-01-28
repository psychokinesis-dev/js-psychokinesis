'use strict';

var net = require('net');
var url = require('url');
var http2 = require('http2');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var reconnect = require('reconnect-net');
var MultiStream = require('multistream');
var async = require('async');
var path = require('path');
var Redis = require('ioredis');
var dateFormat = require('dateformat');
var RequestModule = require('request');

const fileRecorderHost = '127.0.0.1:3000';    // TODO: configurable
const partitionCache = new Redis('redis://127.0.0.1:6379');

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
                            console.log(new Date(), 'store dns failed:', err);
                            socket.write(JSON.stringify({ code: 2 }), 'utf-8');
                            socket.destroy();
                            return;
                        }
                        
                        myDomain = result.domain;

                        if (this.connections.has(myDomain)) {
                            http2.globalAgent.removeEndpoint({host: myDomain, plain: true});

                            this.connections.get(myDomain).destroy();
                        }

                        this.connections.set(myDomain, socket);
                        
                        heartbeatInterval =
                            setInterval(() => {
                                this.dns.kvPut(myDomain, this.localAddress, (err, key, n) => {
                                    if (err) {
                                        console.log(new Date(), 'keep heartbeat interval failed:', err);
                                    }
                                });

                                let heartbeatRequest = http2.raw.request({
                                    host: myDomain,
                                    plain: true,
                                    socket: socket,
                                    path: '/',
                                    method: 'GET'
                                }, (resp) => {
                                    if (resp.statusCode != 200) console.log(new Date(), 'heartbeat response code:', resp.statusCode, 'host', myDomain);
                                });

                                heartbeatRequest.on('error', (error) => {
                                    console.log(new Date(), 'heartbeat request error:', error, 'host', myDomain);
                                });
                            }, this.options.heartbeatInterval);
                        
                        socket.write(JSON.stringify({ code: 0 }), 'utf-8');
                        
                        console.log(new Date(), 'new proxy connection:', myDomain);
                    });
                } else {
                    socket.write(JSON.stringify({ code: 1 }), 'utf-8');
                    socket.destroy();
                }
            });
            
            socket.on('error', (error) => {
                if (heartbeatInterval) clearInterval(heartbeatInterval);

                let currentSocket = this.connections.get(myDomain);
                if (myDomain && currentSocket === socket) {
                    http2.globalAgent.removeEndpoint({host: myDomain, plain: true});

                    this.connections.delete(myDomain);
                }
            });
            
            socket.on('close', () => {
                if (heartbeatInterval) clearInterval(heartbeatInterval);
                
                let currentSocket = this.connections.get(myDomain);
                if (myDomain && currentSocket === socket) {
                    http2.globalAgent.removeEndpoint({host: myDomain, plain: true});
                    
                    this.connections.delete(myDomain);
                }
                
                console.log(new Date(), 'proxy connection closed:', myDomain);
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

                            this.reconnectInstance =
                                reconnect(reconnectFun)
                                .on('error', (err) => {
                                    this.emit('error', err);
                                })
                                .connect(options.entryNode.proxyPort, options.entryNode.host);
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
				console.log(new Date(), 'reverse request error:', error);

				response.statusCode = 500;
				response.end('internal error');
            });

            request.pipe(reverseRequest);
        } else if (hostname === 'offline') {
            let reqUrl = url.parse(request.url);
            let filename = decodeURI(path.basename(reqUrl.pathname));

            delete request.headers.host;
            delete request.headers.connection;

            RequestModule({
                method: 'GET',
                url: 'http://' + fileRecorderHost + '/v1/detail-file?id=' + filename,
                json: true
            }, (error, httpResponse, body) => {
                if (!error && httpResponse.statusCode == 200) {
                    const fileName = body.meta.name;
                    const fileSize = body.meta.size;
                    const partitions = body.partitions;

                    response.writeHead(200, {
                        'content-disposition': 'inline; filename="' + fileName + '"',
                        'content-length': fileSize
                    });

                    async.map(partitions, (partition, callback) => {
                        const hash = partition.hash;
                        
                        this._requsetWithHash(hash, request, callback);
                    }, (err, streams) => {
                        if (err) {
                            console.log(new Date(), 'reverse request chunk error:', err, partitions);
                            
                            response.statusCode = 503;
                            response.end('temporarily unavailable');
                            return;
                        }
        
                        MultiStream(streams).pipe(response);
                    });
                } else {
                    console.log(new Date(), 'get detail of the file error:', error);
                    
                    response.statusCode = 500;
                    response.end('internal error');
                }
            });
        } else if (hostname === 'chunks') {
            let reqUrl = url.parse(request.url);
            let filename = decodeURI(path.basename(reqUrl.pathname));

            delete request.headers.host;
            delete request.headers.connection;

            this._requsetWithHash(filename, request, (error, stream) => {
                if (error) {
                    console.log(new Date(), 'reverse request chunk error:', error, filename);
                    
                    response.statusCode = 503;
                    response.end('temporarily unavailable');
                    return;
                }

                stream.pipe(response);
            })
        } else {
            response.statusCode = 404;
            response.end(hostname + ' not found');
        }
    }

    _requsetWithHash(hash, request, callback) {
        partitionCache.keys(hash + '-*').then((hashs) => {
            const ps = hashs.map(h => partitionCache.smembers(h));
            return Promise.all(ps);
        }).then((hostnames) => {
            hostnames = [].concat.apply([], hostnames);

            const phost = hostnames.find((h) => this.connections.has(h));
            if (!phost) return callback('not available');

            const connection = this.connections.get(phost);

            let reverseRequest1 = http2.raw.request({
                host: phost,
                plain: true,
                socket: connection,
                path: '/chunks/' + hash,
                headers: request.headers,
                method: request.method
            }, (resp) => {
                callback(null, resp);
            });

            reverseRequest1.on('error', (error) => {
                callback(error);
            });
            
            reverseRequest1.end();
        }, (err) => {
            callback(err);
        });
    }
}

util.inherits(Proxy, EventEmitter);

module.exports = Proxy;