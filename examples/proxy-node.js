'use strict';

var psychokinesis = require('../lib');

let server = psychokinesis.createServer({
    domain: 'proxynode.com',
    nodeIdFile: 'proxy_node.data',
    entryNode: {
        host: '127.0.0.1',
        dhtPort: 8181
    }
}, (req, resp) => {
    resp.end('hello world from proxy node');
});

server.on('ready', () => {
    server.listen('127.0.0.1', 8182, () => {
        server.startProxy(18182, () => {
            console.log('Node up! Open http://proxynode.com:8181/');
        });
    });
});