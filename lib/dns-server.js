'use strict';

var dns = require('dns-socket');

class DnsServer {
    constructor(options, dnsStore) {
        this.options = options;
        this.dnsStore = dnsStore;
        this.socket = dns();
        
        this.socket.on('query', (query, port, host) => {
            if (query.questions.length === 1) {
                this.query(query.questions[0], (err, results) => {
                    if (err) {
                        return;
                    }

                    let reply = {
                        questions: query.questions,
                        answers: results
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
    
    query(question, cb) {
        this.dnsStore.kvGet(question.name, 'utf8', (err, n, value) => {
            if (value === null) {
                this.socket.query({
                    questions: [question]
                }, 53, this.options.dnsRootIp, (err, res) => {
                    if (err) {
                        cb('not found');
                        return;
                    }
                    
                    cb(null, res.answers);
                });
                return;
            }
            
            let remote = value.split(':');
            let ip = remote[0];

            cb(null, [{
                type: question.type,
                name: question.name,
                ttl: 0,
                data: ip
            }]);
        });
    }
}

module.exports = DnsServer;