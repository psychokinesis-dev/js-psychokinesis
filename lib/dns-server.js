'use strict';

var dns = require('dns-socket');

class DnsServer {
    constructor(options, dnsStore) {
        this.options = options;
        this.dnsStore = dnsStore;
        this.socket = dns();
        
        this.socket.on('query', (query, port, host) => {
            if (query.questions.length === 1) {
                let queryId = query.id;
                this.query(query, (err, results) => {
                    if (err) {
                        return;
                    }

                    query.id = queryId;

                    let reply = {
                        questions: query.questions,
                        answers: results.answers,
                        authorities: results.authorities,
                        additionals: results.additionals
                    };
                    this.socket.response(query, reply, port, host);
                });
            }
        });
    }
    
    listen(port, cb) {
        this.socket.bind(port, cb);
    }
    
    close(cb) {
        this.socket.destroy(cb);
    }
    
    query(q, cb) {
        this.dnsStore.kvGet(q.questions[0].name, 'utf8', (err, n, value) => {
            if (value === null) {
                this.socket.query(q, 53, this.options.dnsRootIp, (err, res) => {
                    if (err) {
                        cb('not found');
                        return;
                    }
                    
                    cb(null, res);
                });
                return;
            }
            
            let remote = value.split(':');
            let ip = remote[0];

            cb(null, {
                answers: [{
                    type: q.questions[0].type,
                    name: q.questions[0].name,
                    ttl: 0,
                    data: ip
                }],
                authorities: [],
                additionals: []
            });
        });
    }
}

module.exports = DnsServer;