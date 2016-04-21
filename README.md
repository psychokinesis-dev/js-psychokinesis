# js-psychokinesis
[![Build Status](https://travis-ci.org/psychokinesis-dev/js-psychokinesis.svg?branch=master)](https://travis-ci.org/psychokinesis-dev/js-psychokinesis)
[![Coverage Status](https://coveralls.io/repos/psychokinesis-dev/js-psychokinesis/badge.svg)](https://coveralls.io/r/psychokinesis-dev/js-psychokinesis)
[![npm version](https://badge.fury.io/js/psychokinesis.svg)](http://badge.fury.io/js/psychokinesis)
![Downloads](https://img.shields.io/npm/dm/psychokinesis.svg?style=flat)

去中心化的 HTTP 服务器，基于 DHT 、 HTTP/2 。

## 特性
- P2P 节点间功能相同，地位相等
- 支持 NAT 内网节点也可建立对外的 HTTP 服务

## 安装
1. Node.js：版本 >= v5.3.0
2. `npm install psychokinesis`

## 示例
```js
'use strict';

var psychokinesis = require('psychokinesis');

let server = psychokinesis.createServer({
    domain: 'publicnode.com',
    enableDns: true
}, (req, resp) => {
    resp.end('hello world');
});

server.on('ready', () => {
    server.listen('127.0.0.1', 8181, () => {
        console.log('Node up!');
    });
});
```
请使用管理员权限运行上述脚本，然后修改本机的 DNS 地址为 127.0.0.1，完成后即可使用浏览器访问 http://publicnode.com:8181/ 。

更多示例可查看 examples 目录。