'use strict';

var test = require('tape');
var http = require('http');
var psychokinesis = require('../lib');


test('http get', (t) => {
    t.plan(6);
    t.timeoutAfter(5000);
    
    let domain = '127.0.0.1';
    
    let server = psychokinesis.createServer({domain: domain}, (req, resp) => {
        let host = req.headers.host.split(':');
        
        t.equal(host[0], domain);
        t.equal(req.method, 'GET');
        t.equal(req.url, '/test');
        
        resp.end('ok');
    });
    
    server.on('ready', () => {
        server.listen('127.0.0.1', 8181, () => {
            t.ok(true, 'server up');
            
            let getReq = http.request({
                host: domain,
                port: 8181,
                method: 'GET',
                path: '/test'
            }, (response) => {
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    t.equal(chunk, 'ok');
                    
                    server.destroy(() => {
                        t.ok(true, 'server down');
                    });
                });
            });

            getReq.end();
        });
    });
});


test('http post', (t) => {
    t.plan(7);
    t.timeoutAfter(5000);
    
    let domain = '127.0.0.1';
    
    let server = psychokinesis.createServer({domain: domain}, (req, resp) => {
        let host = req.headers.host.split(':');
        
        t.equal(host[0], domain);
        t.equal(req.method, 'POST');
        t.equal(req.url, '/test');
        
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            t.equal(chunk, 'test');
            
            resp.end('ok');
        });
    });
    
    server.on('ready', () => {
        server.listen('127.0.0.1', 8181, () => {
            t.ok(true, 'server up');
            
            let postReq =
                http.request({
                    host: domain,
                    port: 8181,
                    method: 'POST',
                    path: '/test'
                }, (response) => {
                    response.setEncoding('utf8');
                    response.on('data', (chunk) => {
                        t.equal(chunk, 'ok');
                        
                        server.destroy(() => {
                            t.ok(true, 'server down');
                        });
                    });
                });
            
            postReq.write('test');
            postReq.end();
        });
    });
});


test('http get with path domain', (t) => {
    t.plan(5);
    t.timeoutAfter(5000);
    
    let domain = 'path-domain.com';
    
    let server = psychokinesis.createServer({domain: domain}, (req, resp) => {
        t.equal(req.method, 'GET');
        t.equal(req.url, '/' + domain + '/test');
        
        resp.end('ok');
    });
    
    server.on('ready', () => {
        server.listen('127.0.0.1', 8181, () => {
            t.ok(true, 'server up');
            
            let getReq = http.request({
                host: '127.0.0.1',
                port: 8181,
                method: 'GET',
                path: '/' + domain + '/test'
            }, (response) => {
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    t.equal(chunk, 'ok');
                    
                    server.destroy(() => {
                        t.ok(true, 'server down');
                    });
                });
            });

            getReq.end();
        });
    });
});


test('http get across nodes', (t) => {
    t.plan(8);
    t.timeoutAfter(5000);
    
    let firstServer = psychokinesis.createServer({
        domain: 'first.server.com',
        enableDns: true,
        nodeIdFile: 'server1.data'
    }, (req, resp) => {
        t.equal(req.method, 'GET');
        t.equal(req.url, '/req_server1');
        
        resp.end('ok from server1');
    });
    
    firstServer.on('ready', () => {
        firstServer.listen('127.0.0.1', 8181, () => {
            t.ok(true, 'server1 up');

            let secondServer = psychokinesis.createServer({
                domain: 'second.server.com',
                nodeIdFile: 'server2.data',
                entryNode: {
                    host: '127.0.0.1',
                    dhtPort: 8181
                },
            }, (req, resp) => {
                t.equal(req.method, 'GET');
                t.equal(req.url, '/req_server2');

                resp.end('ok from server2');
            });
            
            secondServer.on('ready', () => {
                secondServer.listen('127.0.0.1', 8182, () => {
                    t.ok(true, 'server2 up');
                    
                    let secondReq = http.request({
                        host: 'second.server.com',
                        port: 8181,
                        method: 'GET',
                        path: '/req_server2'
                    }, (response) => {
                        response.setEncoding('utf8');
                        response.on('data', (chunk) => {
                            t.equal(chunk, 'ok from server2');

                            let firstReq = http.request({
                                host: 'first.server.com',
                                port: 8182,
                                method: 'GET',
                                path: '/req_server1'
                            }, (response) => {
                                response.setEncoding('utf8');
                                response.on('data', (chunk) => {
                                    t.equal(chunk, 'ok from server1');
                                    
                                    firstServer.dnsServer.close();
                                    
                                    secondServer.destroy();
                                    firstServer.destroy();
                                });
                            });

                            firstReq.end();
                        });
                    });

                    secondReq.end();
                });
            });
        });
    });
});


test('http get across nodes with proxy', (t) => {
    t.plan(5);
    t.timeoutAfter(5000);
    
    let firstServer = psychokinesis.createServer({
        domain: 'first.server.com',
        enableDns: true,
        nodeIdFile: 'server1.data'
    }, (req, resp) => {
        resp.end('ok from server1');
    });
    
    firstServer.on('ready', () => {
        firstServer.listen('127.0.0.1', 8181, () => {
            firstServer.startProxy(18181, () => {
                t.ok(true, 'server1 up');

                let secondServer = psychokinesis.createServer({
                    domain: 'second.server.com',
                    nodeIdFile: 'server2.data',
                    entryNode: {
                        host: '127.0.0.1',
                        dhtPort: 8181,
                        proxyPort: 18181
                    },
                }, (req, resp) => {
                    t.equal(req.method, 'GET');
                    t.equal(req.url, '/req_server2');

                    resp.end('ok from server2');
                });

                secondServer.on('ready', () => {
                    t.ok(true, 'server2 up');

                    let secondReq = http.request({
                        host: 'second.server.com',
                        port: 8181,
                        method: 'GET',
                        path: '/req_server2'
                    }, (response) => {
                        response.setEncoding('utf8');
                        response.on('data', (chunk) => {
                            t.equal(chunk, 'ok from server2');

                            firstServer.dnsServer.close();

                            secondServer.destroy();
                            firstServer.destroy();
                        });
                    });

                    secondReq.end();
                });
            });
        });
    });
});