'use strict';

var Proxy = require('./proxy');
var Http = require('./http-server');
var DnsServer = require('./dns-server');
var DhtStore = require('dht-store');
var _ = require('lodash');

var defaultOptions = {
//    entryNode: {
//        host: '127.0.0.1',
//        dhtPort: 8181,
//        proxyPort: 18181
//    },
//    nodeIdFile: 'nodeid.data',
//    enableDns: true,
    dnsRootIp: '1.2.4.8',
    domain: 'psychokinesis.me',
    heartbeatInterval: 30 * 1000  // 30 s
};

module.exports.createServer = function (options, requestListener) {
    this.options = _.defaultsDeep(options, defaultOptions);
    
    let dns = new DhtStore({
        nodes: this.options.entryNode ? [{host: this.options.entryNode.host, port: this.options.entryNode.dhtPort}] : [],
        nodeIdFile: this.options.nodeIdFile,
        ttl: 2 * this.options.heartbeatInterval
    });
    
    let proxy = new Proxy(this.options, dns);
    
    let server = new Http(this.options, proxy, dns);
    
    if (this.options.enableDns) {
        let dnsServer = new DnsServer(this.options, dns);

        dnsServer.listen(53, () => {
            console.log('dns-server is up');
        });
        
        server.dnsServer = dnsServer;
    }
    
    proxy.on('request', requestListener);
    
    return server;
};