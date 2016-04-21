'use strict';

var psychokinesis = require('../lib');

let server = psychokinesis.createServer({
    domain: 'privatenode.com',
    nodeIdFile: 'private_node.data',
    entryNode: {
        host: '127.0.0.1',
        dhtPort: 8182,
        proxyPort: 18182
    }
}, (req, resp) => {
    resp.end('hello world from private node');
});

server.on('ready', () => {
    console.log('Node up! Open http://privatenode.com:8181/');
});