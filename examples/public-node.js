'use strict';

var psychokinesis = require('../lib');

let server = psychokinesis.createServer({
    domain: 'publicnode.com',
    enableDns: true,
    nodeIdFile: 'public_node.data'
}, (req, resp) => {
    resp.end('hello world from public node');
});

server.on('ready', () => {
    server.listen('127.0.0.1', 8181, () => {
        console.log('Node up! Using 127.0.0.1 as your dns server, then open http://publicnode.com:8181/');
    });
});